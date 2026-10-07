const {test} = require('node:test');
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function harness({uploadFails = false, postFails = false, missing = false, cleanupFails = false, noAcknowledgement = false, postRejects = false, htmlResponse = false, functionDecoy = false, onUpload, cacheDirectory, fetchFails = false} = {}) {
  const calls = {staged: 0, posts: [], closes: 0, errors: [], uploads: [], fetches: 0};
  const data = {instantSend: true, draft: '작성 중인 글', attachments: ['existing'], reply: 'reply-id'};
  class Upload extends EventEmitter {
    constructor(item, channelId) { super(); this.filename = item.file.name; calls.uploads.push({item, channelId, instance: this}); }
    trackUploadFinished() {}
    upload() {
      onUpload?.();
      if (uploadFails) this.emit('error', new Error('test'));
      else { this.uploadedFilename = 'uploaded/test.png'; this.emit('complete'); }
    }
    cancel() {}
    off(...args) {
      if (cleanupFails) throw new Error('different emitter API');
      return super.off(...args);
    }
  }
  const rest = {
    get() {}, put() {}, del() {},
    async post(args) {
      calls.posts.push(args);
      if (htmlResponse) return {status: 200, body: '<!doctype html><html>private content</html>', headers: {'content-type': 'text/html'}};
      if (postRejects) throw {status: 403, body: {code: 50013}, message: 'Missing Permissions'};
      return {status: postFails ? 403 : 200, ok: !postFails, body: noAcknowledgement ? {} : {id: 'message-test'}};
    },
  };
  const drafts = new Map();
  const getDraft = channel => { if (!drafts.has(channel)) drafts.set(channel, [{id: 'manual', item: {file: new File(['manual'], 'manual.txt')}}]); return drafts.get(channel); };
  const staging = {
    addFiles: ({channelId, files}) => { calls.staged++; getDraft(channelId).push(...files.map(item => ({id: 'queued-' + calls.staged, item}))); },
    removeFiles: (channel, ids) => drafts.set(channel, getDraft(channel).filter(item => !ids.includes(item.id))),
  };
  const modules = missing ? [staging] : [Upload, rest, staging];
  if (functionDecoy) modules.unshift(Object.assign(function WrongRest() {}, {
    get() {}, put() {}, del() {}, post() { throw new Error('wrong REST module'); },
  }));
  const context = {require, URL, module: {exports: {}}, Blob, File, structuredClone, setTimeout, clearTimeout, BdApi: {
    Plugins: {folder: cacheDirectory}, React: {Component: class {}},
    Data: {load: (_, key) => data[key], save: (_, key, value) => { data[key] = value; }},
    Webpack: {getStore: () => ({getUploads: getDraft}), getModule: filter => modules.find(filter), getByKeys: () => ({}),
      Filters: {byKeys: (...keys) => value => keys.every(key => key in value)}},
    Net: {fetch: async () => { calls.fetches++; if (fetchFails) throw new Error('offline'); return {arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer}; }},
    UI: {showToast: text => calls.errors.push(text)}, Logger: {error() {}},
  }};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../DCCon.plugin.js'), 'utf8') +
    '\nmodule.exports = {sendDCConMessage, inspectInstantSend, events: PluginEvents, activeQueue, removeBuffered, getDCConImage, setChannel: id => {currentChannelId = id;}};', context);
  const api = context.module.exports;
  api.setChannel('test-channel');
  api.events.subscribe('DCCON_CLOSE', () => calls.closes++);
  return {api, calls, data, drafts, staging};
}
const con = {idx: '1', path: 'image', ext: 'png', title: 'test'};

test('instant send posts only selected file and leaves draft, existing attachments and reply untouched', async () => {
  const {api, calls, data} = harness();
  assert.equal(await api.sendDCConMessage(con), true);
  assert.equal(calls.staged, 0);
  assert.equal(calls.posts.length, 1);
  assert.equal(calls.posts[0].url, '/channels/test-channel/messages');
  const body = calls.posts[0].body;
  assert.equal(body.content, '');
  assert.equal(body.attachments.length, 1);
  assert.equal(body.attachments[0].uploaded_filename, 'uploaded/test.png');
  assert.equal(Object.hasOwn(body, 'message_reference'), false);
  assert.equal(Object.hasOwn(body, 'flags'), false);
  assert.equal(data.draft, '작성 중인 글');
  assert.deepEqual(data.attachments, ['existing']);
  assert.equal(data.reply, 'reply-id');
  assert.equal(calls.closes, 1);
  assert.equal(calls.uploads[0].instance.listenerCount('complete'), 0);
});

test('Shift accumulates only private buffer; normal click sends one batch without touching native attachments', async () => {
  const {api, calls, drafts} = harness();
  await api.sendDCConMessage(con, {keepOpen: true});
  await api.sendDCConMessage(con, {keepOpen: true});
  assert.equal(calls.closes, 0);
  assert.equal(calls.posts.length, 0);
  assert.equal(calls.staged, 0);
  assert.equal(api.activeQueue('test-channel').length, 2);
  assert.equal(await api.sendDCConMessage(con), true);
  assert.equal(calls.posts.length, 1);
  assert.equal(calls.posts[0].body.attachments.length, 3);
  assert.equal(new Set(calls.posts[0].body.attachments.map(item => item.id)).size, 3);
  assert.equal(drafts.size, 0);
  assert.equal(api.activeQueue('test-channel').length, 0);
  assert.equal(calls.closes, 1);
  await api.sendDCConMessage(con);
  assert.notEqual(calls.posts[0].body.nonce, calls.posts[1].body.nonce);
});

for (const failure of ['uploadFails', 'postFails', 'missing']) {
  test(`${failure}: no close, no recent update, no staging fallback or automatic resend`, async () => {
    const {api, calls, data} = harness({[failure]: true});
    assert.equal(await api.sendDCConMessage(con), false);
    assert.equal(calls.closes, 0);
    assert.equal(data.recent, undefined);
    assert.equal(calls.staged, 0);
    assert.equal(calls.posts.length, failure === 'postFails' ? 1 : 0);
    assert.equal(calls.errors.length, 1);
  });
}

test('attachment-only option stages both click types without closing or sending', async () => {
  const {api, calls, data} = harness();
  data.attachOnly = true;
  assert.equal(await api.sendDCConMessage(con), true);
  await api.sendDCConMessage(con, {keepOpen: true});
  assert.equal(calls.staged, 2);
  assert.equal(calls.closes, 0);
  assert.equal(calls.uploads.length, 0);
  assert.equal(calls.posts.length, 0);
});

test('diagnostic identifies rejected message request and records API status/code without draft content', async () => {
  const {api} = harness({postRejects: true});
  assert.equal(await api.sendDCConMessage(con), false);
  const report = api.inspectInstantSend().lastSendAttempt;
  assert.equal(report.phase, '메시지 생성 요청');
  assert.equal(report.outcome, '실패');
  assert.equal(report.error.status, 403);
  assert.equal(report.error.code, 50013);
  assert.equal(JSON.stringify(report).includes('작성 중인 글'), false);
  assert.equal(JSON.stringify(report).includes('test-channel'), false);
});

test('cleanup API failure cannot swallow upload completion or block message request', async () => {
  const {api, calls} = harness({cleanupFails: true});
  assert.equal(await api.sendDCConMessage(con), true);
  assert.equal(calls.posts.length, 1);
  assert.equal(api.inspectInstantSend().lastSendAttempt.cleanupError.message, 'different emitter API');
});

test('missing server message acknowledgement is not reported as success or retried', async () => {
  const {api, calls, data} = harness({noAcknowledgement: true});
  assert.equal(await api.sendDCConMessage(con), false);
  assert.equal(calls.posts.length, 1);
  assert.equal(calls.closes, 0);
  assert.equal(data.recent, undefined);
  assert.equal(api.inspectInstantSend().lastSendAttempt.hasMessageId, false);
});

test('upload failure diagnostics retain the original error', async () => {
  const {api} = harness({uploadFails: true});
  await api.sendDCConMessage(con);
  const report = api.inspectInstantSend().lastSendAttempt;
  assert.equal(report.phase, 'Discord 파일 업로드');
  assert.equal(report.uploadError.message, 'test');
});

test('REST discovery excludes function exports with coincidentally matching method names', async () => {
  const {api, calls} = harness({functionDecoy: true});
  assert.equal(await api.sendDCConMessage(con), true);
  assert.equal(calls.posts.length, 1);
});

test('HTTP 200 HTML remains a failure and diagnostic records shape without content', async () => {
  const {api, calls} = harness({htmlResponse: true});
  assert.equal(await api.sendDCConMessage(con), false);
  const report = api.inspectInstantSend().lastSendAttempt;
  assert.equal(report.responseShape.looksLikeHtml, true);
  assert.equal(report.responseShape.contentType, 'text/html');
  assert.equal(report.responseShape.bodyType, 'string');
  // Function source in this mock has a literal fixture; check the response summary itself.
  assert.equal(JSON.stringify(report.responseShape).includes('private content'), false);
  assert.equal(calls.posts.length, 1);
  assert.equal(calls.closes, 0);
});

test('deleted attachments are excluded and channel queues stay separate', async () => {
  const {api, calls, staging} = harness();
  await api.sendDCConMessage(con, {keepOpen: true});
  api.removeBuffered('test-channel', api.activeQueue('test-channel')[0]);
  await api.sendDCConMessage(con);
  assert.equal(calls.posts[0].body.attachments.length, 1);
  await api.sendDCConMessage(con, {keepOpen: true});
  api.setChannel('other');
  await api.sendDCConMessage(con);
  assert.equal(calls.posts[1].body.attachments.length, 1);
  api.setChannel('test-channel');
  await api.sendDCConMessage(con);
  assert.equal(calls.posts[2].body.attachments.length, 2);
});

test('failed batch retains attachments with no retry', async () => {
  const {api, calls, drafts} = harness({postFails: true});
  await api.sendDCConMessage(con, {keepOpen: true});
  assert.equal(await api.sendDCConMessage(con), false);
  assert.equal(api.activeQueue('test-channel').length, 1);
  assert.equal(drafts.size, 0);
  assert.equal(calls.posts.length, 1);
  assert.equal(calls.closes, 0);
});

test('rapid Shift and ordinary clicks execute in order and enforce the batch limit', async () => {
  const {api, calls} = harness();
  const results = await Promise.all(Array.from({length: 10}, () => api.sendDCConMessage(con, {keepOpen: true})));
  assert.equal(results.filter(Boolean).length, 9);
  assert.equal(await api.sendDCConMessage(con), true);
  assert.equal(calls.posts[0].body.attachments.length, 10);
});

test('buffer cannot be removed while sending and duplicate sends are rejected', async () => {
  let remove = () => {};
  const {api, calls} = harness({onUpload: () => remove()});
  await api.sendDCConMessage(con, {keepOpen: true});
  remove = () => api.removeBuffered('test-channel');
  const sending = api.sendDCConMessage(con);
  assert.equal(await api.sendDCConMessage(con), false);
  assert.equal(await sending, true);
  assert.equal(calls.posts.length, 1);
  assert.equal(calls.posts[0].body.attachments.length, 2);
});

test('rapid Shift then normal click captures the channel and sends accumulated files', async () => {
  const {api, calls} = harness();
  const staged = api.sendDCConMessage(con, {keepOpen: true});
  const sent = api.sendDCConMessage(con);
  api.setChannel('other');
  assert.equal(await staged, true);
  assert.equal(await sent, true);
  assert.equal(calls.posts[0].url, '/channels/test-channel/messages');
  assert.equal(calls.posts[0].body.attachments.length, 2);
});

test('disk cache survives plugin reload, coalesces requests, and works offline', async t => {
  const directory = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'dccon-cache-test-'));
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  const first = harness({cacheDirectory: directory});
  const images = await Promise.all([first.api.getDCConImage(con), first.api.getDCConImage(con)]);
  assert.equal(first.calls.fetches, 1);
  assert.equal(images[0].size, 3);
  await first.api.getDCConImage(con);
  assert.equal(first.calls.fetches, 1);
  const second = harness({cacheDirectory: directory, fetchFails: true});
  assert.equal((await second.api.getDCConImage(con)).size, 3);
  assert.equal(second.calls.fetches, 0);
});

test('download failure creates no cached file and buffer is unchanged', async t => {
  const directory = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'dccon-cache-test-'));
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  const {api} = harness({cacheDirectory: directory, fetchFails: true});
  assert.equal(await api.sendDCConMessage(con, {keepOpen: true}), false);
  assert.equal(api.activeQueue('test-channel').length, 0);
  assert.equal(fs.existsSync(path.join(directory, 'DCCon-cache')), false);
});

test('empty cache file is fetched again; unsafe image identifiers stay within cache directory', async t => {
  const directory = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'dccon-cache-test-'));
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  const {api, calls} = harness({cacheDirectory: directory});
  const unsafe = {...con, path: '../../outside'};
  await api.getDCConImage(unsafe);
  const cache = path.join(directory, 'DCCon-cache');
  const name = fs.readdirSync(cache)[0];
  assert.match(name, /^[a-f0-9]{64}$/);
  fs.writeFileSync(path.join(cache, name), '');
  await api.getDCConImage(unsafe);
  assert.equal(calls.fetches, 2);
});
