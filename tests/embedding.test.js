const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function runtime(initial = {}, fetch = undefined) {
  const data = {...initial};
  const context = {module: {exports: {}}, structuredClone, setTimeout, clearTimeout, URL,
    BdApi: {Net: {fetch}, Data: {load: (_, key) => data[key], save: (_, key, value) => {data[key] = value;}},
      React: {Component: class {constructor(props) {this.props = props;} setState(value) {Object.assign(this.state, value);}}},
      Webpack: {getByKeys: () => ({}), getModule: () => ({}), Filters: {byKeys: () => () => true}}}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../DCCon.plugin.js'), 'utf8') +
    '\nmodule.exports = {Embedding, DCConPanel};', context);
  return {...context.module.exports, data};
}

test('vector search ranks by cosine, deduplicates packs, and excludes removed images', async () => {
  const {Embedding: e} = runtime({dccons: [
    {info: {package_idx: 1}, detail: [{path: 'a', ext: 'png'}, {path: 'b', ext: 'png'}]},
    {info: {package_idx: 2}, detail: [{path: 'a', ext: 'png'}]},
  ]});
  e.ready = true; e.vectors = {'a:png': [0, 1], 'b:png': [1, 0], 'removed:png': [1, 0]};
  e.call = async () => [1, 0];
  const results = await e.search('무관한 파일명');
  assert.deepEqual(Array.from(results, item => item.con.path), ['b', 'a']);
});

test('turning embedding off terminates Worker and rejects pending operations', async () => {
  const {Embedding: e, data} = runtime({embeddingEnabled: true});
  let terminated = false;
  e.worker = {postMessage() {}, terminate() {terminated = true;}};
  const request = e.call('query');
  const rejected = assert.rejects(request, /중단/);
  e.toggle(false);
  await rejected;
  assert.equal(terminated, true);
  assert.equal(data.embeddingEnabled, false);
  assert.equal(e.pending.size, 0);
  assert.equal(e.ready, false);
});

test('unready semantic search reports preparation instead of using title search', async () => {
  const {Embedding: e} = runtime();
  await assert.rejects(e.search('고양이'), /모델 준비/);
});

test('search clearing and unmount discard an older asynchronous semantic result', async () => {
  const {Embedding: e, DCConPanel} = runtime({embeddingEnabled: true});
  let resolve;
  e.search = () => new Promise(done => {resolve = done;});
  const panel = new DCConPanel({type: 'dccon'});
  panel.componentDidMount();
  panel.changeSearch('고양이');
  await new Promise(done => setTimeout(done, 380));
  panel.clearSearch();
  resolve([{con: {path: 'old'}}]);
  await new Promise(done => setImmediate(done));
  assert.equal(panel.state.semanticResults.length, 0);
  assert.equal(panel.state.searching, false);
  panel.componentWillUnmount();
});

test('pack changes during indexing schedule a follow-up pass', async () => {
  const {Embedding: e} = runtime();
  e.ready = true; e.indexing = true;
  await e.index();
  assert.equal(e.reindex, true);
});

test('model download resolves relative redirects without BetterDiscord automatic handling', async () => {
  const requests = [];
  const response = {status: 200};
  const {Embedding: e} = runtime({}, async (url, options) => {
    assert.equal(options.redirect, 'manual');
    requests.push(url);
    return requests.length === 1 ? {status: 307, headers: {get: () => '/api/cache/model?etag=abc'}} :
      requests.length === 2 ? {status: 302, headers: {get: () => 'https://cdn.example/model?signature=xyz'}} : response;
  });
  assert.equal(await e.download('https://huggingface.co/model/resolve/rev/config.json', 0), response);
  assert.deepEqual(requests, ['https://huggingface.co/model/resolve/rev/config.json',
    'https://huggingface.co/api/cache/model?etag=abc', 'https://cdn.example/model?signature=xyz']);
});

test('model download stops redirect loops and cancelled requests', async () => {
  let count = 0;
  const {Embedding: e} = runtime({}, async () => {count++; return {status: 307, headers: {get: () => '/loop'}};});
  await assert.rejects(e.download('https://example.com/model', 0), /횟수/);
  assert.equal(count, 9);
  e.generation++;
  await assert.rejects(e.download('https://example.com/model', 0), /중단/);
  assert.equal(count, 9);
});
