const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {chromium} = require('playwright');
const executablePath = [process.env.WEBP_TEST_BROWSER, chromium.executablePath(),
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p => p && fs.existsSync(p));

test('real WASM codecs preserve still pixels, GIF playback, and survive repeated conversions in a Worker', {skip: !executablePath}, async t => {
  const context = {module: {exports: {}}, BdApi: {React: {Component: class {}}, Webpack: {
    getByKeys: () => ({}), getModule: () => ({}), Filters: {byKeys: () => () => true}}}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../discord-dccon.plugin.js'), 'utf8') + '\nmodule.exports=WebPCache;', context);
  const codec = context.module.exports;
  const assets = {};
  for (const [kind, {name, hashes}] of Object.entries(codec.specs)) {
    const dir = path.join(__dirname, '../node_modules/@libwebp-wasm', name, 'es');
    const source = fs.readFileSync(path.join(dir, name + '.js'));
    const wasm = fs.readFileSync(path.join(dir, name + '.wasm'));
    for (const [i, bytes] of [source, wasm].entries())
      assert.equal(require('node:crypto').createHash('sha256').update(bytes).digest('hex'), hashes[i]);
    assets[kind] = {source: source.toString(), wasm: [...wasm]};
  }
  const browser = await chromium.launch({executablePath, headless: true});
  t.after(() => browser.close());
  const server = require('node:http').createServer((_, response) => response.end('<!doctype html>'));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const page = await browser.newPage();
  page.on('console', message => {if (message.type() === 'error') t.diagnostic(message.text());});
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const results = await page.evaluate(async ({workerSource, assets}) => {
    const workerURL = URL.createObjectURL(new Blob([`(${workerSource})()`], {type: 'text/javascript'}));
    const worker = new Worker(workerURL, {type: 'module'});
    const convert = (bytes, kind) => new Promise((resolve, reject) => {
      worker.onmessage = ({data}) => data.error ? reject(Error(data.error)) : resolve(new Uint8Array(data.bytes));
      worker.onerror = e => reject(Error(e.message));
      worker.postMessage({bytes, kind, runtime: {...assets[kind], wasm: new Uint8Array(assets[kind].wasm)}});
    });
    const decode = async (bytes, type) => {
      const decoder = new ImageDecoder({data: bytes, type});
      await decoder.tracks.ready;
      const track = decoder.tracks.selectedTrack, frames = [];
      for (let i = 0; i < track.frameCount; i++) {
        const {image} = await decoder.decode({frameIndex: i});
        const canvas = new OffscreenCanvas(image.displayWidth, image.displayHeight), ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0);
        frames.push({duration: image.duration, width: canvas.width, height: canvas.height,
          pixels: [...ctx.getImageData(0, 0, canvas.width, canvas.height).data]});
        image.close();
      }
      const result = {frames, repetitionCount: track.repetitionCount}; decoder.close(); return result;
    };
    try {
      const canvas = new OffscreenCanvas(3, 2), ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ff0044'; ctx.fillRect(0, 0, 1, 2);
      ctx.fillStyle = 'rgba(0,128,255,0.5)'; ctx.fillRect(1, 0, 1, 2);
      const png = new Uint8Array(await (await canvas.convertToBlob({type: 'image/png'})).arrayBuffer());
      const jpeg = new Uint8Array(await (await canvas.convertToBlob({type: 'image/jpeg'})).arrayBuffer());
      // Two different 1x1 frames: 80/140ms, finite repetition, global palette.
      const gif = new Uint8Array([71,73,70,56,57,97,1,0,1,0,128,0,0,255,0,0,0,0,255,
        33,255,11,...new TextEncoder().encode('NETSCAPE2.0'),3,1,3,0,0,
        33,249,4,4,8,0,0,0,44,0,0,0,0,1,0,1,0,0,2,2,68,1,0,
        33,249,4,4,14,0,0,0,44,0,0,0,0,1,0,1,0,0,2,2,76,1,0,59]);
      const output = [];
      for (const [bytes, type, kind] of [[png, 'image/png', 'img'], [gif, 'image/gif', 'gif'], [jpeg, 'image/jpeg', 'img'], [png, 'image/png', 'img'], [gif, 'image/gif', 'gif']]) {
        const started = performance.now(), webp = await convert(bytes, kind);
        output.push({before: await decode(bytes, type), after: await decode(webp, 'image/webp'),
          inputBytes: bytes.length, outputBytes: webp.length, ms: performance.now() - started});
      }
      return output;
    } finally {worker.terminate(); URL.revokeObjectURL(workerURL);}
  }, {workerSource: codec.workerMain.toString().replace(/^workerMain\(\)/, 'function()'), assets});
  for (const result of results) assert.deepEqual(result.after, result.before);
  t.diagnostic(JSON.stringify(results.map(({inputBytes, outputBytes, ms}) => ({inputBytes, outputBytes, ms}))));
});

test('codec downloads are pinned, cached offline, coalesced, and reject altered contents', async t => {
  const folder = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'dccon-codec-test-'));
  t.after(() => fs.rmSync(folder, {recursive: true, force: true}));
  let fetches = 0, offline = false, corrupt = false;
  const context = {module: {exports: {}}, require, AbortController, TextDecoder,
    BdApi: {Plugins: {folder}, React: {Component: class {}}, Net: {fetch: async url => {
      fetches++; if (offline) throw Error('offline');
      const name = url.split('/').pop();
      return {arrayBuffer: async () => corrupt ? Buffer.from('tampered') : fs.readFileSync(path.join(__dirname, '../node_modules/@libwebp-wasm/gif2webp/es', name))};
    }}, Webpack: {getByKeys: () => ({}), getModule: () => ({}), Filters: {byKeys: () => () => true}}}};
  const source = fs.readFileSync(path.join(__dirname, '../discord-dccon.plugin.js'), 'utf8') + '\nmodule.exports=WebPCache;';
  vm.runInNewContext(source, context);
  const codec = context.module.exports;
  await Promise.all([codec.runtime('gif', 0), codec.runtime('gif', 0)]);
  assert.equal(fetches, 2);
  codec.stop(); offline = true;
  await codec.runtime('gif', codec.generation);
  assert.equal(fetches, 2);
  codec.stop(); offline = false; corrupt = true;
  fs.writeFileSync(path.join(folder, 'discord-dccon-cache/webp-codecs', codec.specs.gif.hashes[0]), 'tampered');
  await assert.rejects(codec.runtime('gif', codec.generation), /무결성/);
  corrupt = false;
  await codec.runtime('gif', codec.generation);
  assert.equal(fetches, 4);
});
