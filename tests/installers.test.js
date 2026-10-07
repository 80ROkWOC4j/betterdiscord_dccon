const {test, before} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const repo = path.resolve(__dirname, '..');
before(() => {
  if (process.platform !== 'win32') return;
  const built = spawnSync(process.execPath, ['shelter/build.cjs'], {cwd: repo, encoding: 'utf8'});
  assert.equal(built.status, 0, built.stderr);
});

function run(script, args = [], success = true) {
  const result = spawnSync('pwsh', ['-NoProfile', '-File', script, ...args], {cwd: repo, encoding: 'utf8'});
  if (success) assert.equal(result.status, 0, result.stderr || String(result.error));
  else assert.notEqual(result.status, 0);
  return result;
}
async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'discord-dccon-install-test-'));
  t.after(() => fs.rm(dir, {recursive: true, force: true}));
  const resources = path.join(dir, 'app-1.0.1/resources');
  await fs.mkdir(resources, {recursive: true});
  await fs.writeFile(path.join(resources, 'app.asar'), 'original Discord archive');
  return {dir, resources};
}

test('standalone package installs, updates, restores vanilla archive and preserves old loaders', {skip: process.platform !== 'win32'}, async t => {
  const {dir, resources} = await fixture(t);
  const script = path.join(repo, 'artifacts/dist/standalone/install.ps1');
  run(script, ['-DiscordRoot', dir]);
  assert.equal(await fs.readFile(path.join(resources, 'discord-dccon-original.asar'), 'utf8'), 'original Discord archive');
  assert.match(await fs.readFile(path.join(resources, 'app/index.js'), 'utf8'), /discord-dccon-original\.asar/);
  await fs.writeFile(path.join(resources, 'app/keep-me.txt'), 'user file');
  run(script, ['-DiscordRoot', dir]);
  const previous = (await fs.readdir(resources)).find(name => name.startsWith('discord-dccon-previous-'));
  assert.equal(await fs.readFile(path.join(resources, previous, 'keep-me.txt'), 'utf8'), 'user file');
  run(script, ['-DiscordRoot', dir, '-Restore']);
  assert.equal(await fs.readFile(path.join(resources, 'app.asar'), 'utf8'), 'original Discord archive');
  await assert.rejects(fs.access(path.join(resources, 'app')));
});

test('standalone refuses existing mods and refuses restoring a modified loader', {skip: process.platform !== 'win32'}, async t => {
  const {dir, resources} = await fixture(t);
  const script = path.join(repo, 'artifacts/dist/standalone/install.ps1');
  await fs.mkdir(path.join(resources, 'app'));
  await fs.writeFile(path.join(resources, 'app/index.js'), 'other mod');
  run(script, ['-DiscordRoot', dir], false);
  assert.equal(await fs.readFile(path.join(resources, 'app/index.js'), 'utf8'), 'other mod');
  await fs.rename(path.join(resources, 'app'), path.join(resources, 'other-mod'));
  run(script, ['-DiscordRoot', dir]);
  await fs.appendFile(path.join(resources, 'app/index.js'), '\n// external edit');
  run(script, ['-DiscordRoot', dir, '-Restore'], false);
  assert.equal(await fs.readFile(path.join(resources, 'discord-dccon-original.asar'), 'utf8'), 'original Discord archive');
});

test('Canary selects its default directory, leaves Stable untouched, and blocks running Canary', {skip: process.platform !== 'win32'}, async t => {
  const {dir} = await fixture(t);
  for (const client of ['Discord', 'DiscordCanary']) {
    const resources = path.join(dir, client, 'app-1.0.1/resources');
    await fs.mkdir(resources, {recursive: true});
    await fs.writeFile(path.join(resources, 'app.asar'), client);
  }
  const wrapper = path.join(dir, 'canary-test.ps1');
  await fs.writeFile(wrapper, `param([Alias('Restore')][switch]$Remove)
$ErrorActionPreference='Stop'
function Get-Process {
  param($Name,$ErrorAction)
  if ($Name -notcontains 'DiscordCanary') {throw 'Canary process was not checked'}
  if ($env:DCCON_TEST_PROCESS) { [pscustomobject]@{Path=$env:DCCON_TEST_PROCESS} }
}
& $env:DCCON_TEST_INSTALLER -Channel Canary -Remove:$Remove
`);
  const env = {...process.env, LOCALAPPDATA: dir, DCCON_TEST_INSTALLER: path.join(repo, 'artifacts/dist/standalone/install.ps1'),
    DCCON_TEST_PROCESS: path.join(dir, 'Discord/app-1.0.1/Discord.exe')};
  const invoke = args => spawnSync('pwsh', ['-NoProfile', '-File', wrapper, ...args], {env, encoding: 'utf8'});
  let result = invoke([]);
  assert.equal(result.status, 0, result.stderr);
  const canary = path.join(dir, 'DiscordCanary/app-1.0.1/resources');
  assert.equal(JSON.parse(await fs.readFile(path.join(canary, 'app/discord-dccon-install.json'), 'utf8')).channel, 'Canary');
  assert.equal(await fs.readFile(path.join(dir, 'Discord/app-1.0.1/resources/app.asar'), 'utf8'), 'Discord');
  env.DCCON_TEST_PROCESS = path.join(dir, 'DiscordCanary/app-1.0.1/DiscordCanary.exe');
  result = invoke(['-Remove']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Fully quit Discord Canary/);
  await fs.access(path.join(canary, 'app/index.js'));
  env.DCCON_TEST_PROCESS = '';
  result = invoke(['-Remove']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(await fs.readFile(path.join(canary, 'app.asar'), 'utf8'), 'DiscordCanary');
});

test('BetterDiscord package changes only the plugin and retains previous plugin', {skip: process.platform !== 'win32'}, async t => {
  const {dir} = await fixture(t);
  const plugins = path.join(dir, 'plugins');
  await fs.mkdir(plugins);
  await fs.writeFile(path.join(plugins, 'discord-dccon.plugin.js'), 'old plugin');
  await fs.writeFile(path.join(plugins, 'discord-dccon.config.json'), '{"favorites":[1]}');
  const script = path.join(repo, 'artifacts/dist/betterdiscord/install.ps1');
  run(script, ['-PluginsDirectory', plugins]);
  run(script, ['-PluginsDirectory', plugins]);
  assert.equal(await fs.readFile(path.join(plugins, 'discord-dccon.config.json'), 'utf8'), '{"favorites":[1]}');
  const backups = (await fs.readdir(plugins)).filter(name => name.includes('.backup-'));
  assert.equal(backups.length, 1);
  assert.equal(await fs.readFile(path.join(plugins, backups[0]), 'utf8'), 'old plugin');
  assert.equal(await fs.readFile(path.join(plugins, 'discord-dccon.plugin.js'), 'utf8'), await fs.readFile(path.join(repo, 'discord-dccon.plugin.js'), 'utf8'));
});

test('online command installs both modes on Windows PowerShell 5.1 and rejects corrupt downloads', {skip: process.platform !== 'win32'}, async t => {
  const {dir, resources} = await fixture(t);
  const plugins = path.join(dir, 'plugins');
  await fs.mkdir(plugins);
  await fs.writeFile(path.join(plugins, 'discord-dccon.config.json'), '{"preserved":true}');
  const wrapper = path.join(dir, 'online-test.ps1');
  await fs.writeFile(wrapper, `param([string]$Mode, [switch]$Corrupt, [Alias('Restore')][switch]$Remove, [switch]$Missing, [string]$Channel='Stable')
$ErrorActionPreference='Stop'
function Invoke-RestMethod {
  param($Uri,$Headers)
  if ($Uri -ne 'https://api.github.com/repos/80ROkWOC4j/discord-dccon/releases/latest') {throw 'Wrong API endpoint'}
  $names = if ($Missing) {@()} else {@('discord-dccon-betterdiscord.zip','discord-dccon-standalone.zip','checksums.json')}
  return @{tag_name='v3.0.0';assets=@($names | ForEach-Object {@{name=$_;browser_download_url="https://github.com/80ROkWOC4j/discord-dccon/releases/download/v3.0.0/$_"}})}
}
function Invoke-WebRequest {
  param([switch]$UseBasicParsing,$Uri,$Headers,$OutFile)
  $name = ([uri]$Uri).Segments[-1]
  Copy-Item -LiteralPath (Join-Path $env:DCCON_TEST_DIST $name) -Destination $OutFile
  if ($Corrupt -and $name.EndsWith('.zip')) {Add-Content -LiteralPath $OutFile -Value 'corrupt'}
}
$script = [scriptblock]::Create((Get-Content -LiteralPath $env:DCCON_TEST_INSTALLER -Raw))
& $script -Mode $Mode -Channel $Channel -DiscordRoot $env:DCCON_TEST_ROOT -PluginsDirectory $env:DCCON_TEST_PLUGINS -Remove:$Remove
`);
  const env = {...process.env, DCCON_TEST_DIST: path.join(repo, 'artifacts/dist'), DCCON_TEST_INSTALLER: path.join(repo, 'install.ps1'),
    DCCON_TEST_ROOT: dir, DCCON_TEST_PLUGINS: plugins, TEMP: dir, TMP: dir};
  // PowerShell 7's inherited module paths prevent Windows PowerShell from loading its own cmdlets.
  for (const key of Object.keys(env)) if (key.toLowerCase() === 'psmodulepath') delete env[key];
  const online = (mode, args = [], success = true) => {
    const result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', wrapper, '-Mode', mode, ...args], {env, encoding: 'utf8'});
    if (success) assert.equal(result.status, 0, result.stderr);
    else assert.notEqual(result.status, 0);
    return result;
  };
  assert.match(online('Standalone', ['-Missing'], false).stderr, /missing/);
  assert.match(online('Standalone', ['-Corrupt'], false).stderr, /checksum mismatch/);
  assert.equal(await fs.readFile(path.join(resources, 'app.asar'), 'utf8'), 'original Discord archive');
  online('BetterDiscord');
  online('BetterDiscord'); // An already-installed child exits successfully without skipping cleanup.
  assert.equal(await fs.readFile(path.join(plugins, 'discord-dccon.config.json'), 'utf8'), '{"preserved":true}');
  online('Standalone');
  await fs.access(path.join(resources, 'app/runtime/bootstrap.js'));
  online('Standalone', ['-Remove']);
  online('Standalone', ['-Channel', 'Canary']);
  assert.equal(JSON.parse(await fs.readFile(path.join(resources, 'app/runtime/channel.json'), 'utf8')).channel, 'Canary');
  online('Standalone', ['-Channel', 'Canary', '-Restore']);
  assert.equal(await fs.readFile(path.join(resources, 'app.asar'), 'utf8'), 'original Discord archive');
  assert.equal((await fs.readdir(dir)).filter(name => name.startsWith('discord-dccon-install-')).length, 0);
});
