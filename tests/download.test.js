const {test} = require('node:test');
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const {download} = require('../shelter/native');

function network(steps) {
  let followed = 0, aborted = 0, requestOptions;
  const request = new EventEmitter();
  request.setHeader = () => {};
  request.abort = () => {aborted++; request.emit('abort'); request.emit('error', Error('Redirect was cancelled')); request.emit('close');};
  const advance = () => {
    const step = steps.shift();
    if (!step) return;
    if (step.redirect) {
      const before = followed;
      request.emit('redirect', 302, 'GET', step.redirect, {location: [step.redirect]});
      // Electron cancels unless followRedirect is called during the redirect event.
      if (before === followed) request.emit('error', Error('Redirect was cancelled'));
    } else {
      const response = new EventEmitter();
      response.statusCode = step.status || 200;
      response.headers = {'content-type': ['application/octet-stream']};
      request.emit('response', response);
      response.emit('data', Buffer.from([0, 128, 255]));
      if (step.error) response.emit('error', Error('Connection lost'));
      else response.emit('end');
      request.emit('close');
    }
  };
  request.followRedirect = () => {followed++; queueMicrotask(advance);};
  request.end = () => queueMicrotask(advance);
  return {net: {request: options => {requestOptions = options; return request;}},
    stats: () => ({followed, aborted, requestOptions})};
}
const url = 'https://huggingface.co/model/resolve/main/config.json';
test('manual redirect returns location even when Electron subsequently cancels the request', async () => {
  const n = network([{redirect: '/api/resolve-cache/model/config.json'}]);
  const result = await download(n.net, url, {redirect: 'manual'});
  assert.equal(result.status, 302);
  assert.equal(new Headers(result.headers).get('location'), '/api/resolve-cache/model/config.json');
  assert.equal(result.bytes.length, 0);
  assert.equal(n.stats().followed, 0);
  assert.equal(n.stats().aborted, 1);
  assert.equal(n.stats().requestOptions.credentials, 'omit');
});
test('automatic redirects validate each hop and preserve binary response', async () => {
  const n = network([{redirect: '/cache/config'}, {redirect: 'https://cdn-lfs.hf.co/model'}, {}]);
  const result = await download(n.net, url);
  assert.equal(result.status, 200);
  assert.deepEqual([...result.bytes], [0, 128, 255]);
  assert.equal(n.stats().followed, 2);
});
test('both redirect modes reject untrusted targets before following', async () => {
  for (const redirect of ['manual', 'follow']) {
    const n = network([{redirect: 'https://example.com/private'}]);
    await assert.rejects(download(n.net, url, {redirect}), /Unsupported download host/);
    assert.equal(n.stats().followed, 0);
    assert.equal(n.stats().aborted, 1);
  }
});
test('redirect loops are bounded', async () => {
  const n = network(Array.from({length: 9}, () => ({redirect: url})));
  await assert.rejects(download(n.net, url), /Too many redirects/);
  assert.equal(n.stats().followed, 8);
});
test('cancellation stops active downloads and pre-cancelled requests never start', async () => {
  const n = network([]), controller = new AbortController();
  const pending = download(n.net, url, {}, controller.signal);
  controller.abort();
  await assert.rejects(pending, /aborted/);
  assert.equal(n.stats().aborted, 1);
  await assert.rejects(download({request() {throw Error('must not run');}}, url, {}, controller.signal), /aborted/);
});
test('response errors reject without returning incomplete bytes', async () => {
  const n = network([{error: true}]);
  await assert.rejects(download(n.net, url), /Connection lost/);
});
