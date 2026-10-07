// Generate a Dependency Submission API snapshot from the committed submodule pin.
const {execFileSync} = require('node:child_process');
const git = (...args) => execFileSync('git', args, {encoding: 'utf8'}).trim();
function snapshot(env = process.env) {
  const repository = env.GITHUB_REPOSITORY;
  if (!repository || !env.GITHUB_SHA || !env.GITHUB_REF || !env.GITHUB_RUN_ID) throw Error('GitHub Actions metadata is required');
  const entry = git('ls-tree', env.GITHUB_SHA, 'vendor/shelter');
  const build = /^160000 commit ([a-f0-9]{40})\tvendor\/shelter$/.exec(entry)?.[1];
  if (!build) throw Error('vendor/shelter must be a committed submodule');
  const url = git('config', '-f', '.gitmodules', 'submodule.vendor/shelter.url');
  if (url !== 'https://github.com/uwu/shelter-builds.git') throw Error('Unexpected shelter submodule repository');
  const source = /^Build ([a-f0-9]{40})$/.exec(git('-C', 'vendor/shelter', 'show', '-s', '--format=%s', build))?.[1];
  if (!source) throw Error('Cannot determine shelter source commit from the pinned build');
  return {
    version: 0, sha: env.GITHUB_SHA, ref: env.GITHUB_REF,
    job: {correlator: 'shelter-dependencies', id: env.GITHUB_RUN_ID,
      html_url: `https://github.com/${repository}/actions/runs/${env.GITHUB_RUN_ID}`},
    detector: {name: 'discord-dccon-shelter', version: '1.0.0', url: `https://github.com/${repository}`},
    scanned: new Date().toISOString(),
    manifests: {'.gitmodules': {name: '.gitmodules', file: {source_location: '.gitmodules'}, resolved: {
      'uwu/shelter-builds': {package_url: `pkg:github/uwu/shelter-builds@${build}`,
        relationship: 'direct', scope: 'runtime', dependencies: ['uwu/shelter']},
      'uwu/shelter': {package_url: `pkg:github/uwu/shelter@${source}`,
        relationship: 'indirect', scope: 'runtime', dependencies: []},
    }}},
  };
}
if (require.main === module) process.stdout.write(JSON.stringify(snapshot(), null, 2) + '\n');
module.exports = {snapshot};
