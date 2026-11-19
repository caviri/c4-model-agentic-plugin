#!/usr/bin/env node
/* check-timeline-options.mjs: a regression check of how arch-history.mjs timeline combines its options.

   Builds the demonstration repository (make-demo-history.mjs) in a new temporary directory, runs timeline with
   --resolution, --refs and --pr on it, and checks the versions in each history.json:
     - --resolution merges gives the five versions of the merge line;
     - --resolution merges --pr 3 gives the same five plus the head of pull request #3 (the open one), last, with
       the pull request recorded on it (number, kind pr) and the merge line's last version as its previous one;
     - --refs v0.1,v1.0 --pr 3 gives exactly those two refs and the pull request;
     - --resolution merges --pr 1 (merged, known from its merge message only) keeps the five versions and records
       #1 on its merge;
     - --squash with --pr is refused.
   With a SHACL engine (rete-graph through --rete-module or NODE_PATH, or pyshacl), the datasets are validated too.

   Usage: node check-timeline-options.mjs [--keep] [--rete-module <rete-graph/dist/index.js>]
   Exit code 0 when every check passes, 1 otherwise. Nothing outside the temporary directory is written. */
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2), keep = args.includes('--keep');
const reteAt = args.indexOf('--rete-module'), rete = reteAt >= 0 ? ['--rete-module', args[reteAt + 1]] : [];
const tmp = mkdtempSync(join(tmpdir(), 'arch-history-check-')), demo = join(tmp, 'demo');
let failed = 0;
const ok = (cond, msg) => { console.log((cond ? 'OK       ' : 'FAIL     ') + msg); if (!cond) failed++; };
const node = (script, argv) => spawnSync(process.execPath, [join(here, script), ...argv], { cwd: demo, encoding: 'utf8' });

try {
  const made = spawnSync(process.execPath, [join(here, 'make-demo-history.mjs'), demo], { encoding: 'utf8' });
  if (made.status !== 0) throw new Error('make-demo-history.mjs failed: ' + made.stderr);
  const sha = (ref) => spawnSync('git', ['rev-parse', ref + '^{commit}'], { cwd: demo, encoding: 'utf8' }).stdout.trim().slice(0, 7);
  const pr3 = sha('refs/pull/3/head');
  const merge1 = spawnSync('git', ['rev-list', '-1', '--grep=^Merge pull request #1 ', 'main'], { cwd: demo, encoding: 'utf8' }).stdout.trim().slice(0, 7);
  let shacl = null;
  const run = (name, argv) => {
    const out = join(tmp, name), r = node('arch-history.mjs', ['timeline', ...argv, '--demo', '--out', out, '--no-validate']);
    if (r.status === 2) throw new Error('timeline ' + argv.join(' ') + ' failed: ' + (r.stderr || r.stdout).trim());
    const v = node('arch-history.mjs', ['validate', join(out, 'history.nq'), ...rete]);
    if (v.status !== 2) { shacl = shacl === false ? false : v.status === 0; ok(v.status === 0, name + ': SHACL ' + (v.status === 0 ? 'conforms' : 'violations\n' + v.stdout)); }
    return JSON.parse(readFileSync(join(out, 'history.json'), 'utf8'));
  };
  const keys = (h) => h.versions.map((v) => v.key);

  const merges = run('merges', ['--resolution', 'merges']), line = keys(merges);
  ok(merges.resolution === 'merges' && line.length === 5, '--resolution merges: 5 versions (' + line.join(' ') + ')');

  const withPr = run('merges-pr3', ['--resolution', 'merges', '--pr', '3']), last = withPr.versions[withPr.versions.length - 1];
  ok(withPr.resolution === 'merges', '--resolution merges --pr 3: the resolution is kept (' + withPr.resolution + ')');
  ok(JSON.stringify(keys(withPr)) === JSON.stringify(line.concat(pr3)), '--resolution merges --pr 3: the 5 versions plus #3\'s head ' + pr3 + ' (' + keys(withPr).join(' ') + ')');
  ok(last.kind === 'pr' && last.pr && last.pr.number === 3 && last.prev === line[line.length - 1], '--resolution merges --pr 3: #3 recorded on it, previous version ' + last.prev);

  const refs = run('refs-pr3', ['--refs', 'v0.1,v1.0', '--pr', '3']);
  ok(refs.resolution === 'refs' && JSON.stringify(keys(refs)) === JSON.stringify([sha('v0.1'), sha('v1.0'), pr3]), '--refs v0.1,v1.0 --pr 3: v0.1, v1.0 and #3 (' + keys(refs).join(' ') + ')');

  const pr1 = run('merges-pr1', ['--resolution', 'merges', '--pr', '1']), m1 = pr1.versions.find((v) => v.key === merge1);
  ok(JSON.stringify(keys(pr1)) === JSON.stringify(line) && m1 && m1.pr && m1.pr.number === 1, '--resolution merges --pr 1: the same 5 versions, #1 recorded on its merge ' + merge1);

  const sq = node('arch-history.mjs', ['timeline', '--range', 'v0.1..v1.0', '--squash', '--pr', '3', '--demo', '--out', join(tmp, 'squash'), '--no-validate']);
  ok(sq.status === 2 && /--pr does not combine with --squash/.test(sq.stderr), '--squash --pr 3: refused');
  if (shacl === null) console.log('SKIPPED  SHACL: no rete-graph (--rete-module, NODE_PATH) or pyshacl found');
} catch (e) {
  ok(false, e.message);
} finally {
  if (keep) console.log('KEPT     ' + tmp); else rmSync(tmp, { recursive: true, force: true });
}
console.log(failed ? failed + ' check(s) failed' : 'all checks passed');
process.exit(failed ? 1 : 0);
