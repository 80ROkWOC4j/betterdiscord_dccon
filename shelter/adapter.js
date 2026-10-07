function createAdapter(shelter, native, webpack) {
  const styles = new Map(), patches = new Set();
  const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  const store = shelter.plugin.store;
  const filesUpload = {addFiles(...args) {
    const target = webpack.getModuleBySource(value => typeof value?.addFiles === 'function' &&
      value.addFiles.toString().includes('UPLOAD_ATTACHMENT_ADD_FILES'), 'UPLOAD_ATTACHMENT_ADD_FILES');
    if (!target) throw Error('Discord 파일 첨부 모듈을 찾지 못했습니다.');
    return target.addFiles(...args);
  }};
  const localeListeners = new Set();
  let localeObserver;
  const localeStore = {
    get locale() {return document.documentElement.lang || navigator.language || 'en';},
    initialize() {},
    addChangeListener(listener) {
      localeListeners.add(listener);
      if (!localeObserver) {
        localeObserver = new MutationObserver(() => {for (const notify of localeListeners) notify();});
        localeObserver.observe(document.documentElement, {attributes: true, attributeFilter: ['lang']});
      }
    },
    removeChangeListener(listener) {
      localeListeners.delete(listener);
      if (!localeListeners.size) {localeObserver?.disconnect(); localeObserver = null;}
    },
  };
  if (!store.dcconImported) {
    store.dcconData = clone(native.initialData);
    store.dcconImported = true;
    shelter.plugin.flushStore();
  }
  function findInTree(tree, predicate, {walkable = ['children', 'props']} = {}) {
    const seen = new Set();
    function walk(value) {
      if (!value || typeof value !== 'object' || seen.has(value)) return;
      seen.add(value);
      if (predicate(value)) return value;
      for (const child of Array.isArray(value) ? value : walkable.map(key => value[key])) {
        const found = walk(child);
        if (found) return found;
      }
    }
    return walk(tree);
  }
  const fs = Object.fromEntries(['readFile', 'writeFile', 'mkdir', 'rename'].map(method => [method, (...args) => {
    const callback = args.pop();
    native.file(method, args).then(value => callback(null, value), error => callback(error));
  }]));
  const requireNative = name => {
    if (name === 'fs') return fs;
    if (name === 'path') return {join: (...parts) => parts.join('/'), dirname: value => value.slice(0, value.lastIndexOf('/'))};
    if (name === 'crypto') return {createHash: algorithm => {
      if (algorithm !== 'sha256') throw Error('Only SHA-256 is supported');
      const chunks = [];
      const hash = {update(value) {chunks.push(value); return hash;}, digest: encoding => native.hash(chunks, encoding)};
      return hash;
    }};
    throw Error(`Unsupported native module: ${name}`);
  };
  const requestScope = globalThis.crypto.randomUUID(), activeRequests = new Set();
  let requestId = 0, disposed = false;
  async function fetchNative(url, options = {}) {
    const id = `${requestScope}:${++requestId}`, {signal, ...rest} = options;
    if (disposed || signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    activeRequests.add(id);
    const pending = native.fetch(id, url, rest);
    const abort = () => native.abort(id);
    signal?.addEventListener('abort', abort, {once: true});
    try {
      const response = await pending;
      const bytes = new Uint8Array(response.bytes);
      return {status: response.status, ok: response.status >= 200 && response.status < 300,
        headers: new Headers(response.headers), arrayBuffer: async () => bytes.buffer,
        text: async () => new TextDecoder().decode(bytes)};
    } finally {activeRequests.delete(id); signal?.removeEventListener('abort', abort);}
  }
  const BdApi = {
    React: shelter.React, ReactDOM: shelter.ReactDOM,
    Webpack: {...webpack,
      Filters: {...webpack.Filters, byKeys: (...keys) => value => {
        if (keys.length === 1 && keys[0] === 'addFiles') return typeof value?.addFiles === 'function';
        return webpack.Filters.byKeys(...keys)(value);
      }},
      getModule(filter, options) {
        // Generic get/post/put/del exports also match low-level HTTP clients.
        // shelter captures Discord's API-aware client during initialization.
        const rest = shelter.http?._raw;
        if (rest && filter(rest)) return rest;
        if (filter(filesUpload)) return filesUpload;
        if (filter.toString().includes('trackUploadFinished')) {
          return webpack.getModuleBySource(filter, 'trackUploadFinished');
        }
        return webpack.getModule(filter, options);
      },
      getByKeys: (...keys) => {
        const signature = keys.join(',');
        if (signature === 'locale,initialize') return localeStore;
        // These generic CSS export names are ambiguous outside BdApi's finder.
        // The shared picker already provides complete fallback button styling.
        if (signature === 'icon,active,buttonWrapper' || signature === 'channelTextArea,buttonContainer,button') return {};
        return webpack.getByKeys(...keys);
      },
      getStore: name => shelter.flux.storesFlat[name]},
    Plugins: {folder: '/dccon'},
    Data: {
      load: (_, key) => clone(store.dcconData?.[key]),
      save(_, key, value) {store.dcconData = {...clone(store.dcconData), [key]: clone(value)}; shelter.plugin.flushStore();},
    },
    Net: {fetch: fetchNative}, Logger: {error: (...args) => console.error('[DCCon shelter]', ...args)},
    Utils: {findInTree},
    UI: {showToast: (content, options = {}) => shelter.ui.showToast({title: 'DCCon', content,
      duration: options.timeout || 4000,
      color: shelter.ui.ToastColors[options.type === 'error' ? 'CRITICAL' : options.type === 'success' ? 'SUCCESS' : 'INFO']})},
    DOM: {
      addStyle(id, css) {BdApi.DOM.removeStyle(id); styles.set(id, shelter.ui.injectCss(css));},
      removeStyle(id) {styles.get(id)?.(); styles.delete(id);},
    },
    Patcher: {
      after(_, target, key, callback) {
        const unpatch = shelter.patcher.after(key, target, function(args, result) {
          return callback(this, args, result) ?? result;
        });
        patches.add(unpatch);
        return unpatch;
      },
      unpatchAll() {for (const dispose of patches) dispose(); patches.clear();},
    },
  };
  return {BdApi, requireNative, dispose() {
    disposed = true;
    for (const id of activeRequests) native.abort(id);
    activeRequests.clear();
    localeObserver?.disconnect(); localeListeners.clear();
    BdApi.Patcher.unpatchAll();
    for (const id of styles.keys()) BdApi.DOM.removeStyle(id);
  }};
}
if (typeof module !== 'undefined') module.exports = {createAdapter};
