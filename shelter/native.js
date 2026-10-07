const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

function prepareDataRoot(appData) {
  const syncFs = require('node:fs');
  const root = path.join(appData, 'DCCon-shelter');
  const previous = path.join(appData, 'DCCon-shelter-poc');
  // Both fixed paths are direct children of Electron's application-data directory.
  if (!syncFs.existsSync(root) && syncFs.existsSync(previous)) syncFs.renameSync(previous, root);
  syncFs.mkdirSync(root, {recursive: true});
  return root;
}

function resolveFile(root, value) {
  if (typeof value !== 'string' || !value.startsWith('/dccon/')) throw Error('Invalid cache path');
  const result = path.resolve(root, value.slice('/dccon/'.length));
  const relative = path.relative(root, result);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw Error('Cache path escapes data directory');
  return result;
}
function createFiles(root, legacyRoot) {
  return async function file(method, args) {
    const [name, ...rest] = args;
    const resolved = resolveFile(root, name);
    switch (method) {
      case 'readFile':
        try {return await fs.readFile(resolved, ...rest);}
        catch (error) {
          // Existing BD cache is a read-only fallback. New cache goes to DCCon data.
          if (error.code !== 'ENOENT' || !legacyRoot || !name.startsWith('/dccon/DCCon-cache/')) throw error;
          return fs.readFile(resolveFile(legacyRoot, name), ...rest);
        }
      case 'writeFile': return fs.writeFile(resolved, ...rest);
      case 'mkdir': return fs.mkdir(resolved, ...rest);
      case 'rename': return fs.rename(resolved, resolveFile(root, rest[0]));
      default: throw Error('Unsupported filesystem operation');
    }
  };
}
function allowedDownload(value) {
  const url = new URL(value);
  const hosts = ['dcinside.com', 'huggingface.co', 'hf.co', 'xethub.hf.co', 'cdn.jsdelivr.net'];
  if (url.protocol !== 'https:' || url.username || url.password ||
      !hosts.some(host => url.hostname === host || url.hostname.endsWith('.' + host))) throw Error('Unsupported download host');
  return url.href;
}
function hash(chunks, encoding) {
  if (encoding !== 'hex') throw Error('Only hex digest is supported');
  const result = crypto.createHash('sha256');
  for (const chunk of chunks) result.update(typeof chunk === 'string' ? chunk : Buffer.from(chunk));
  return result.digest('hex');
}
module.exports = {createFiles, resolveFile, allowedDownload, hash, prepareDataRoot};
