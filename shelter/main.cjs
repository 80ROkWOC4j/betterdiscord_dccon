// DCCon injector. Does not change Discord's update endpoints or install updates.
const electron = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const {allowedDownload, prepareDataRoot} = require('./native');
const {app, ipcMain, net} = electron;
const dataRoot = prepareDataRoot(app.getPath('appData'));
const requests = new Map(), preloads = new Map();
const bundle = fs.readFileSync(path.join(__dirname, 'bootstrap.js'), 'utf8');
function trusted(event) {
  const url = new URL(event.senderFrame?.url || 'about:blank');
  if (event.senderFrame !== event.sender.mainFrame || url.origin !== 'https://discord.com') throw Error('Untrusted IPC origin');
}
ipcMain.on('dccon:init', event => {
  if (!preloads.has(event.sender.id)) {event.returnValue = null; return;}
  const legacyRoot = path.join(app.getPath('appData'), 'BetterDiscord', 'plugins');
  let initialData = {};
  try {initialData = JSON.parse(fs.readFileSync(path.join(legacyRoot, 'DCCon.config.json'), 'utf8'));} catch {}
  // Never start a large model download just by replacing the client mod.
  initialData.embeddingEnabled = false;
  event.returnValue = {bundle, dataRoot, legacyRoot, initialData, originalPreload: preloads.get(event.sender.id)};
});
ipcMain.on('dccon:abort', (event, id) => {
  trusted(event);
  requests.get(`${event.sender.id}:${id}`)?.abort();
});
ipcMain.handle('dccon:fetch', async (event, id, input, options) => {
  trusted(event);
  const key = `${event.sender.id}:${id}`, controller = new AbortController();
  requests.set(key, controller);
  try {
    let url = allowedDownload(input);
    const method = options.method || 'GET';
    if (!['GET', 'POST'].includes(method)) throw Error('Unsupported download method');
    // Always validate each redirect, including model CDN redirects.
    for (let step = 0; step <= 8; step++) {
      const response = await net.fetch(url, {method, headers: options.headers, body: options.body,
        redirect: 'manual', credentials: 'omit', signal: controller.signal});
      if (options.redirect !== 'manual' && [301, 302, 303, 307, 308].includes(response.status)) {
        url = allowedDownload(new URL(response.headers.get('location'), url).href);
        await response.body?.cancel();
        continue;
      }
      return {status: response.status, headers: [...response.headers], bytes: new Uint8Array(await response.arrayBuffer())};
    }
    throw Error('Too many redirects');
  } finally {requests.delete(key);}
});

const BrowserWindow = new Proxy(electron.BrowserWindow, {
  construct(Target, args) {
    const options = args[0];
    const originalPreload = options?.webPreferences?.preload;
    if (originalPreload && options.title) {
      options.webPreferences = {...options.webPreferences, preload: path.join(__dirname, 'preload.cjs'),
        sandbox: false, contextIsolation: true, nodeIntegration: false};
    }
    const window = new Target(...args);
    if (originalPreload && options.title) {
      preloads.set(window.webContents.id, originalPreload);
      const id = window.webContents.id;
      window.webContents.once('destroyed', () => {
        preloads.delete(id);
        for (const [key, controller] of requests) if (key.startsWith(id + ':')) controller.abort();
      });
    }
    return window;
  },
});
// Electron can expose exports through a getter; an assignment may silently fail.
Object.defineProperty(require.cache[require.resolve('electron')], 'exports', {
  configurable: true, writable: true, value: {...electron, BrowserWindow},
});
app.on('ready', () => {
  electron.session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const headers = details.responseHeaders;
    if (details.resourceType === 'mainFrame' && new URL(details.url).origin === 'https://discord.com') {
      // Keep Discord's CSP except for local evaluation and the existing blob Worker.
      for (const key of Object.keys(headers || {})) if (key.toLowerCase() === 'content-security-policy') {
        headers[key] = headers[key].map(value => value.split(';').map(part => {
          const directive = part.trim();
          if (/^(script-src|worker-src)\s/.test(directive)) return directive + " blob: 'unsafe-eval'";
          if (/^img-src\s/.test(directive)) return directive + ' https://*.dcinside.com https://dccon-proxy.minibox.workers.dev';
          return directive;
        }).join('; '));
      }
    }
    callback({responseHeaders: headers});
  });
});
