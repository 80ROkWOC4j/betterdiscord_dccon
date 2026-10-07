const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const {captureWebpack} = require('../shelter/webpack');
const {createAdapter} = require('../shelter/adapter');
const {createFiles, resolveFile, allowedDownload, hash, prepareDataRoot} = require('../shelter/native');

test('shelter module capture survives webpack push replacement and observes reassigned exports', () => {
  const target = {}, api = captureWebpack(target);
  const chunks = target.webpackChunkdiscord_app;
  chunks.push = chunk => {
    for (const factory of Object.values(chunk[1])) factory({exports: {}});
  };
  const object = {sendMessage() {}};
  chunks.push([[1], {1: module => {module.exports = {abc: object};}}]);
  assert.equal(api.getByKeys('sendMessage'), object);
  assert.equal(api.count(), 1);
});

test('webpack runtime can bind the previous push without recursive calls', () => {
  const target = {}, api = captureWebpack(target), chunks = target.webpackChunkdiscord_app;
  const previousPush = chunks.push.bind(chunks);
  chunks.push = chunk => {
    for (const factory of Object.values(chunk[1])) factory({exports: {}});
    return previousPush(chunk);
  };
  assert.doesNotThrow(() => chunks.push([[1], {1: module => {module.exports = {ready: true};}}]));
  assert.equal(api.getByKeys('ready').ready, true);
  assert.equal(chunks.length, 1);
});

test('upload lookup skips CSS and initializes only matching lazy factories', () => {
  const target = {}, webpack = captureWebpack(target), factories = {}, cache = {};
  target.webpackChunkdiscord_app.push = chunk => Object.assign(factories, chunk[1]);
  function load(id) {
    if (!cache[id]) {cache[id] = {exports: {}}; factories[id](cache[id], cache[id].exports, load);}
    return cache[id].exports;
  }
  target.webpackChunkdiscord_app.push([[1], {
    1: module => {module.exports = {addFiles: 'addFiles_css'};},
    2: module => {module.exports = {addFiles: (...args) => {const type = 'UPLOAD_ATTACHMENT_ADD_FILES'; return args;}};},
    3: module => {module.exports = {minified: class {trackUploadFinished() {} upload() {}}};},
    4: () => {throw Error('Unrelated module must not execute');},
  }]);
  load(1);
  const shelter = {plugin: {store: {}, flushStore() {}}, flux: {storesFlat: {}}};
  const {BdApi} = createAdapter(shelter, {initialData: {}}, webpack);
  const files = BdApi.Webpack.getModule(BdApi.Webpack.Filters.byKeys('addFiles'));
  assert.deepEqual(files.addFiles({channelId: 'test'}), [{channelId: 'test'}]);
  const upload = BdApi.Webpack.getModule(value => typeof value === 'function' &&
    typeof value.prototype?.trackUploadFinished === 'function' && typeof value.prototype?.upload === 'function');
  assert.equal(typeof upload, 'function');
  assert.equal(cache[4], undefined);
});

test('upload lookup includes initial runtime factories outside chunk push', () => {
  const target = {}, webpack = captureWebpack(target), cache = {};
  function load(id) {
    if (!cache[id]) {cache[id] = {exports: {}}; load.m[id](cache[id], cache[id].exports, load);}
    return cache[id].exports;
  }
  load.m = {
    10: module => {module.exports = {z: class {trackUploadFinished() {} upload() {}}};},
    11: () => {throw Error('Unrelated initial factory must not execute');},
  };
  target.webpackChunkdiscord_app.push = chunk => Object.assign(load.m, chunk[1]);
  target.webpackChunkdiscord_app.push([[1], {1: module => {module.exports = {};}}]);
  load(1);
  const upload = webpack.getModuleBySource(value => typeof value?.prototype?.trackUploadFinished === 'function', 'trackUploadFinished');
  assert.equal(upload, load(10).z);
  assert.equal(cache[11], undefined);
});

test('shelter storage returns independent snapshots and imports only once', () => {
  const store = {};
  const shelter = {plugin: {store, flushStore() {}}, flux: {storesFlat: {}}};
  const native = {initialData: {dccons: [{info: {title: 'original'}}]}};
  const {BdApi} = createAdapter(shelter, native, {});
  const packs = BdApi.Data.load('DCCon', 'dccons');
  packs[0].info.title = 'changed';
  assert.equal(BdApi.Data.load('DCCon', 'dccons')[0].info.title, 'original');
  BdApi.Data.save('DCCon', 'dccons', packs);
  const second = createAdapter(shelter, {initialData: {}}, {});
  assert.equal(second.BdApi.Data.load('DCCon', 'dccons')[0].info.title, 'changed');
});

test('link and image sends use shelter Discord REST, never an ambiguous HTTP export', async () => {
  const calls = [];
  const rest = {get() {}, put() {}, del() {}, async post(request) {
    assert.equal(this, rest);
    calls.push(request);
    return {ok: true, status: 200, body: {id: 'message-id'}};
  }};
  const wrong = {get() {}, put() {}, del() {}, post() {throw Error('Wrong HTTP client selected');}};
  class CloudUpload {
    constructor({file}) {this.filename = file.name; this.uploadedFilename = 'uploaded-file'; this.handlers = {};}
    trackUploadFinished() {}
    on(name, callback) {this.handlers[name] = callback;}
    off(name) {delete this.handlers[name];}
    upload() {this.handlers.complete();}
  }
  const webpack = {getByKeys: () => ({}), Filters: {byKeys: (...keys) => value => keys.every(key => value?.[key] !== undefined)},
    getModule: filter => [wrong, CloudUpload].find(value => filter(value)),
    getModuleBySource: filter => [wrong, CloudUpload].find(value => filter(value))};
  const shelter = {http: {_raw: rest}, React: {Component: class {}}, plugin: {store: {}, flushStore() {}}, flux: {storesFlat: {}}};
  const adapter = createAdapter(shelter, {initialData: {}}, webpack);
  const module = {exports: {}};
  const source = await fs.readFile(path.join(__dirname, '../DCCon.plugin.js'), 'utf8');
  vm.runInNewContext(source + '\nmodule.exports={sendLinkDirectly,sendImagesDirectly};', {
    module, BdApi: adapter.BdApi, structuredClone, setTimeout, clearTimeout,
  });
  const linkAttempt = {}, imageAttempt = {};
  await module.exports.sendLinkDirectly({path: 'test-image'}, 'channel-test', linkAttempt);
  await module.exports.sendImagesDirectly([{name: 'dccon.png', size: 3}], 'channel-test', imageAttempt);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, '/channels/channel-test/messages');
  assert.equal(calls[0].body.content, 'https://dccon-proxy.minibox.workers.dev/?no=test-image');
  assert.equal(calls[1].body.attachments[0].uploaded_filename, 'uploaded-file');
  assert.equal(linkAttempt.hasMessageId, true);
  assert.equal(imageAttempt.hasMessageId, true);
});

test('shelter patch adapter preserves this, arguments, results and unpatches', () => {
  const target = {value: 2, method(n) {return this.value + n;}};
  const original = target.method;
  const shelter = {plugin: {store: {}, flushStore() {}}, flux: {storesFlat: {}}, patcher: {
    after(key, object, callback) {
      const fn = object[key];
      object[key] = function(...args) {const result = fn.apply(this, args); return callback.call(this, args, result) ?? result;};
      return () => {object[key] = fn;};
    },
  }};
  const adapter = createAdapter(shelter, {initialData: {}}, {});
  adapter.BdApi.Patcher.after('DCCon', target, 'method', (self, args, result) => {
    assert.equal(self, target); assert.deepEqual(args, [3]); assert.equal(result, 5);
  });
  assert.equal(target.method(3), 5);
  adapter.dispose();
  assert.equal(target.method, original);
});

test('adapter disposal aborts old downloads without reusing IDs after restart', async () => {
  const requests = [], aborted = [];
  const shelter = {plugin: {store: {}, flushStore() {}}, flux: {storesFlat: {}}};
  const native = {initialData: {}, abort: id => aborted.push(id), fetch: id => new Promise(resolve => requests.push({id, resolve}))};
  const first = createAdapter(shelter, native, {});
  const oldRequest = first.BdApi.Net.fetch('https://dcinside.com/old');
  first.dispose();
  const second = createAdapter(shelter, native, {});
  const newRequest = second.BdApi.Net.fetch('https://dcinside.com/new');
  assert.notEqual(requests[0].id, requests[1].id);
  assert.deepEqual(aborted, [requests[0].id]);
  await assert.rejects(first.BdApi.Net.fetch('https://dcinside.com/stopped'), {name: 'AbortError'});
  for (const request of requests) request.resolve({status: 200, headers: [], bytes: []});
  await Promise.all([oldRequest, newRequest]);
  second.dispose();
  assert.equal(aborted.length, 1);
});

test('data directory migration preserves caches and recovery files without overwriting an existing directory', async t => {
  const appData = await fs.mkdtemp(path.join(os.tmpdir(), 'dccon-path-test-'));
  t.after(() => fs.rm(appData, {recursive: true, force: true}));
  const previous = path.join(appData, 'DCCon-shelter-poc');
  await fs.mkdir(path.join(previous, 'DCCon-cache'), {recursive: true});
  await fs.writeFile(path.join(previous, 'DCCon-cache/image'), 'cached');
  await fs.writeFile(path.join(previous, 'installation.json'), 'recovery record');
  const current = prepareDataRoot(appData);
  assert.equal(current, path.join(appData, 'DCCon-shelter'));
  assert.equal(await fs.readFile(path.join(current, 'DCCon-cache/image'), 'utf8'), 'cached');
  assert.equal(await fs.readFile(path.join(current, 'installation.json'), 'utf8'), 'recovery record');
  await assert.rejects(fs.access(previous));
  await fs.mkdir(previous);
  await fs.writeFile(path.join(previous, 'untouched'), 'older');
  assert.equal(prepareDataRoot(appData), current);
  assert.equal(await fs.readFile(path.join(previous, 'untouched'), 'utf8'), 'older');
});

test('native bridge confines writes and reuses legacy binary cache read-only', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dccon-shelter-test-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  const current = path.join(root, 'current'), legacy = path.join(root, 'legacy');
  await fs.mkdir(path.join(legacy, 'DCCon-cache'), {recursive: true});
  const bytes = Buffer.from([0, 255, 137, 80]);
  await fs.writeFile(path.join(legacy, 'DCCon-cache', 'image'), bytes);
  const file = createFiles(current, legacy);
  assert.deepEqual(await file('readFile', ['/dccon/DCCon-cache/image', null]), bytes);
  await file('mkdir', ['/dccon/DCCon-cache', {recursive: true}]);
  await file('writeFile', ['/dccon/DCCon-cache/image', Buffer.from([1])]);
  assert.deepEqual(await fs.readFile(path.join(legacy, 'DCCon-cache', 'image')), bytes);
  assert.throws(() => resolveFile(current, '/dccon/../../escape'));
  assert.throws(() => resolveFile(current, 'C:/escape'));
  assert.throws(() => allowedDownload('https://discord.com/api/v9/users/@me'));
  assert.throws(() => allowedDownload('https://dcinside.com.evil.test/'));
  assert.equal(allowedDownload('https://dcimg5.dcinside.com/image'), 'https://dcimg5.dcinside.com/image');
  assert.equal(hash(['abc'], 'hex'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('generated shelter bootstrap and DCCon source parse', async () => {
  const source = await fs.readFile(path.join(__dirname, '../DCCon.plugin.js'), 'utf8');
  assert.doesNotThrow(() => new vm.Script(source));
  const plugin = await fs.readFile(path.join(__dirname, '../shelter/plugin.js'), 'utf8');
  assert.doesNotThrow(() => new vm.Script(plugin));
});

test('plugin starts after first-store retry without PoC status APIs and cleans up', async () => {
  const source = await fs.readFile(path.join(__dirname, '../shelter/plugin.js'), 'utf8');
  const timers = [], events = [];
  let firstStore = true, lifecycle;
  const context = vm.createContext({
    console, dcconVersion: '3.0.0', DCConNative: {},
    dcconWebpack: {getByKeys: () => ({})},
    setTimeout: callback => {timers.push(callback); return timers.length;}, clearTimeout() {},
    createAdapter: () => ({BdApi: {}, requireNative() {}, dispose: () => events.push('dispose')}),
    mountToolbar: () => {events.push('mount'); return () => events.push('unmount');},
    dcconSource: 'module.exports=class {start(){this.patchChannelTextArea();} stop(){}}; const DCConButton=()=>{};',
    shelter: {React: {createElement() {}}, ReactDOM: {createPortal() {}}, ReactDOMClient: {createRoot() {}},
      http: {_raw: {get() {}, post() {}, put() {}, del() {}}},
      plugin: {id: 'dccon-poc', flushStore() {
        if (firstStore) {firstStore = false; throw Error('not a shelter storage proxy');}
      }},
      plugins: {stopPlugin: () => lifecycle.onUnload(), startPlugin() {lifecycle = vm.runInContext(source, context); lifecycle.onLoad();}},
      ui: {showToast: message => assert.fail(JSON.stringify(message))}},
  });
  lifecycle = vm.runInContext(source, context);
  lifecycle.onLoad();
  assert.equal(timers.length, 1);
  timers.shift()();
  assert.deepEqual(events, ['mount']);
  lifecycle.onUnload();
  assert.deepEqual(events, ['mount', 'unmount', 'dispose']);
  assert.equal(context.DCConShelterStatus, undefined);
});

test('injector replaces Electron getter exports and installs preload on Discord windows', async () => {
  const events = new Map();
  let ready, onHeaders;
  const electron = {app: {getPath: () => os.tmpdir(), on: (_, fn) => {ready = fn;}}, ipcMain: {on: (key, fn) => events.set(key, fn), handle() {}},
    session: {defaultSession: {webRequest: {onHeadersReceived: fn => {onHeaders = fn;}}}},
    BrowserWindow: class {constructor(options) {this.options = options; this.webContents = {id: 7, once() {}};}}, net: {}};
  const cachedModule = {};
  Object.defineProperty(cachedModule, 'exports', {configurable: true, get: () => electron});
  const fakeFs = {readFileSync: () => '{}'};
  function load(name) {
    if (name === 'electron') return electron;
    if (name === 'node:fs') return fakeFs;
    if (name === './native') return {allowedDownload, prepareDataRoot: base => path.join(base, 'DCCon-shelter')};
    return require(name);
  }
  load.resolve = () => 'electron'; load.cache = {electron: cachedModule};
  vm.runInNewContext(await fs.readFile(path.join(__dirname, '../shelter/main.cjs'), 'utf8'),
    {require: load, __dirname: '/test/runtime', console, URL, AbortController});
  assert.notEqual(cachedModule.exports.BrowserWindow, electron.BrowserWindow);
  const win = new cachedModule.exports.BrowserWindow({title: 'Discord', webPreferences: {preload: '/discord/preload.js'}});
  assert.match(win.options.webPreferences.preload, /preload\.cjs$/);
  const event = {sender: {id: 7}};
  events.get('dccon:init')(event);
  assert.equal(event.returnValue.originalPreload, '/discord/preload.js');
  assert.equal(event.returnValue.initialData.embeddingEnabled, false);
  assert.equal(events.has('dccon:status'), false);
  ready();
  const responseHeaders = {'Content-Security-Policy': ["default-src 'self'; img-src 'self' https://*.discordapp.net; script-src 'self'; worker-src 'self'"]};
  onHeaders({resourceType: 'mainFrame', url: 'https://discord.com/channels/@me', responseHeaders}, result => {
    const csp = result.responseHeaders['Content-Security-Policy'][0];
    assert.match(csp, /https:\/\/dccon-proxy\.minibox\.workers\.dev/);
    assert.match(csp, /https:\/\/\*\.discordapp\.net/);
    assert.match(csp, /default-src 'self'/);
  });
});

test('unchanged DCCon starts through shelter adapter, opens picker and cleans up', async () => {
  const {JSDOM} = require('jsdom');
  const React = require('react'), ReactDOM = require('react-dom');
  const dom = new JSDOM('<div id="root"></div>');
  const previous = {window: global.window, document: global.document, act: global.IS_REACT_ACT_ENVIRONMENT, observer: global.MutationObserver};
  global.window = dom.window; global.document = dom.window.document; global.IS_REACT_ACT_ENVIRONMENT = true;
  global.MutationObserver = dom.window.MutationObserver;
  const {createRoot} = require('react-dom/client');
  const root = createRoot(document.getElementById('root'));
  const target = {};
  const webpack = captureWebpack(target);
  const channel = {type: {render() {
    const CHANNEL_TEXT_AREA = {props: {children: [{props: {className: 'attachButton-test'}}]}};
    return CHANNEL_TEXT_AREA;
  }}};
  const original = channel.type.render;
  const listeners = new Set();
  const exports = [channel, {locale() {}, initialize() {}},
    {locale: 'ko', initialize() {}, addChangeListener: fn => listeners.add(fn), removeChangeListener: fn => listeners.delete(fn)},
    {computePermissions() {}, can: () => true}, {ADD_REACTIONS: 1, SEND_MESSAGES: 2}, {addFiles() {}}];
  target.webpackChunkdiscord_app.push = chunk => Object.values(chunk[1]).forEach(factory => factory({exports: {}}));
  target.webpackChunkdiscord_app.push([[1], Object.fromEntries(exports.map((value, id) => [id, module => {module.exports = value;}]))]);
  const shelter = {React, ReactDOM, plugin: {store: {}, flushStore() {}}, flux: {storesFlat: {}},
    ui: {injectCss(css) {const style = document.createElement('style'); style.textContent = css; document.head.append(style); return () => style.remove();}},
    patcher: {after(key, object, callback) {const fn = object[key]; object[key] = function(...args) {
      return callback.call(this, args, fn.apply(this, args));
    }; return () => {object[key] = fn;};}},
  };
  const adapter = createAdapter(shelter, {initialData: {dccons: [], embeddingEnabled: false}}, webpack);
  const module = {exports: {}};
  const source = await fs.readFile(path.join(__dirname, '../DCCon.plugin.js'), 'utf8');
  vm.runInNewContext(source, {module, BdApi: adapter.BdApi, require: adapter.requireNative,
    window, document, structuredClone, setTimeout, clearTimeout});
  const plugin = new module.exports({name: 'DCCon'});
  try {
    plugin.start();
    assert.equal(adapter.BdApi.Webpack.getByKeys('locale', 'initialize').locale, navigator.language);
    const tree = channel.type.render({channel: {id: 'test', type: 0}, type: 'normal'});
    await React.act(async () => root.render(tree.props.children.at(-1)));
    const button = document.querySelector('.dccon-trigger');
    assert.ok(button);
    await React.act(async () => button.dispatchEvent(new window.MouseEvent('click', {bubbles: true})));
    assert.ok(document.querySelector('.dccon-search-input'));
    await React.act(async () => plugin.stop());
    assert.equal(listeners.size, 0);
    assert.equal(channel.type.render, original);
    assert.equal(document.querySelector('.dccon-overlay'), null);
    assert.equal(document.querySelector('style'), null);
  } finally {
    await React.act(async () => root.unmount()); adapter.dispose(); dom.window.close();
    global.window = previous.window; global.document = previous.document; global.IS_REACT_ACT_ENVIRONMENT = previous.act;
    global.MutationObserver = previous.observer;
  }
});

test('shelter toolbar mounts once, follows channel changes, and removes disconnected roots', async () => {
  const {JSDOM} = require('jsdom');
  const {mountToolbar} = require('../shelter/toolbar');
  const dom = new JSDOM('<div class="channelTextArea_test"><div role="textbox" contenteditable="true"></div><div class="buttons_test"></div></div>');
  const previous = {document: global.document, MutationObserver: global.MutationObserver};
  global.document = dom.window.document; global.MutationObserver = dom.window.MutationObserver;
  let channel = 'one', listener, renders = 0, unmounts = 0;
  const shelter = {React: {createElement: (_, props) => props}, util: {getFiber: () => null},
    flux: {storesFlat: {SelectedChannelStore: {
      getChannelId: () => channel, addChangeListener: fn => {listener = fn;}, removeChangeListener: () => {listener = null;},
    }}},
    ReactDOMClient: {createRoot: host => ({render(props) {renders++; host.textContent = props.channelId;}, unmount() {unmounts++;}})},
  };
  let dispose;
  try {
    dispose = mountToolbar(shelter, () => {});
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(renders, 1);
    assert.equal(document.querySelectorAll('.dccon-shelter-host').length, 1);
    channel = 'two'; listener(); await new Promise(resolve => setImmediate(resolve));
    assert.equal(document.querySelector('.dccon-shelter-host').textContent, 'two');
    document.querySelector('.channelTextArea_test').remove();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(unmounts, 1);
    dispose(); dispose = null; assert.equal(listener, null);
  } finally {
    dispose?.(); dom.window.close(); global.document = previous.document; global.MutationObserver = previous.MutationObserver;
  }
});
