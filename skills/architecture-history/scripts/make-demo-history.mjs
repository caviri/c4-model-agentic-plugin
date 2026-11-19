#!/usr/bin/env node
/* make-demo-history.mjs: builds a DEMONSTRATION git repository for the architecture-history skill.

   The plugin's example project (examples/image-annotation-tool) has a short real history. To show timelines,
   merges, pull requests, releases, a stale model and a branch comparison, this script replays a made-up but
   plausible evolution of that project in a new repository: the code and the model grow together, from a first
   release without the worker to the example as it is today, then one code-only commit (the model is now stale)
   and an open pull request.

   Everything in it is labelled as demo: the authors are fictional (example.invalid addresses), the dates are
   invented, the pull requests exist only as merge-commit messages and a local refs/pull/3/head ref. Build its
   history with --demo so the dataset and the page say so.

   Usage: node make-demo-history.mjs <new directory outside any repository> [--example <project dir>]
   Then:  node arch-history.mjs timeline --project <dir> --resolution merges --demo */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args.splice(i, 2)[1] : null; };
const example = resolve(flag('--example') || join(here, '..', '..', '..', 'examples', 'image-annotation-tool'));
const dest = args[0] ? resolve(args[0]) : null;
if (!dest) { console.error('Usage: node make-demo-history.mjs <new directory> [--example <project dir>]'); process.exit(2); }
if (existsSync(dest) && readdirSync(dest).length) { console.error('Not empty: ' + dest); process.exit(2); }
const inRepo = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: existsSync(dest) ? dest : dirname(dest), encoding: 'utf8' });
if (inRepo.status === 0) { console.error('Refusing to create the demo inside an existing git repository: ' + inRepo.stdout.trim()); process.exit(2); }

const MODEL_PATH = 'communications/architecture-explorer/model.js';
const realText = readFileSync(join(example, MODEL_PATH), 'utf8');
const sb = { window: {} }; vm.createContext(sb); vm.runInContext(realText, sb);
const REAL = JSON.parse(JSON.stringify(sb.window.MODEL));

// ---- fictional people (example.invalid can never be a real address)
const P = {
  alex: ['Alex Example', 'alex@example.invalid'], bo: ['Bo Sample', 'bo@example.invalid'],
  chris: ['Chris Fixture', 'chris@example.invalid'], dana: ['Dana Placeholder', 'dana@example.invalid']
};
function git(argv, who, date, input) {
  const env = Object.assign({}, process.env, who ? { GIT_AUTHOR_NAME: who[0], GIT_AUTHOR_EMAIL: who[1], GIT_COMMITTER_NAME: who[0], GIT_COMMITTER_EMAIL: who[1] } : {},
    date ? { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } : {});
  const r = spawnSync('git', argv, { cwd: dest, encoding: 'utf8', env, input });
  if (r.status !== 0) { console.error('git ' + argv.join(' ') + ' failed: ' + r.stderr); process.exit(1); }
  return r.stdout.trim();
}

// ---- code: the example's files, in the order the made-up history adds them
const LATER = { 'worker/': 'pr1', 'api/app/queue.py': 'pr1', 'api/app/routes/export.py': 'pr2', 'worker/jobs/export_coco.py': 'pr2' };
function files(dir, base = '') {
  return readdirSync(dir).flatMap((n) => {
    const rel = base + n, abs = join(dir, n);
    if (rel === 'communications') return [];
    return statSync(abs).isDirectory() ? files(abs, rel + '/') : [rel];
  });
}
const ALL = files(example);
const stageOf = (f) => { const hit = Object.keys(LATER).filter((k) => (k.endsWith('/') ? f.startsWith(k) : f === k)).sort((a, b) => b.length - a.length)[0]; return hit ? LATER[hit] : 'v0'; };
function addCode(stage) { for (const f of ALL.filter((x) => stageOf(x) === stage)) { mkdirSync(dirname(join(dest, f)), { recursive: true }); copyFileSync(join(example, f), join(dest, f)); } }

// ---- models: the real one minus what had not been built yet, plus a few earlier wordings
const clone = (x) => JSON.parse(JSON.stringify(x));
function without(M, ids) {
  const gone = new Set(ids);
  let grew = true;
  while (grew) { grew = false; for (const n of M.nodes) if (!gone.has(n.id) && gone.has(n.parent)) { gone.add(n.id); grew = true; } }
  M.nodes = M.nodes.filter((n) => !gone.has(n.id));
  M.edges = M.edges.filter((e) => !gone.has(e.from) && !gone.has(e.to));
  M.scenarios = M.scenarios.map((s) => Object.assign(s, { steps: s.steps.filter((st) => !gone.has(st.from) && !gone.has(st.to)) })).filter((s) => s.steps.length);
  if (M.defaultPins) M.defaultPins = M.defaultPins.filter((id) => !gone.has(id));
  return M;
}
const node = (M, id) => M.nodes.find((n) => n.id === id);
const edge = (M, from, to) => M.edges.find((e) => e.from === from && e.to === to);
function write(M) { mkdirSync(join(dest, dirname(MODEL_PATH)), { recursive: true }); writeFileSync(join(dest, MODEL_PATH), M === REAL ? realText : 'window.MODEL = ' + JSON.stringify(M, null, 2) + ';\n'); }

const WORKER = ['worker', 'redis', 'queue'], EXPORT = ['export', 'coco', 'enqueue-export'];
function v01() {
  const M = without(clone(REAL), WORKER.concat(EXPORT, ['minio-init', 'lifecycle']));
  M.scenarios = M.scenarios.filter((s) => s.id !== 'export');
  M.project.intro = M.project.intro.replace(' The Dynamic tab walks through upload, annotate, review and export.', ' The Dynamic tab walks through upload, annotate and review.')
    .replace(', then open "Task lifecycle" to see the statuses a task moves through', '');
  node(M, 'iat').notes[0] = 'Everything runs from one docker-compose.yml; there are no external systems. PostgreSQL and MinIO come from public images.';
  const api = node(M, 'api'); api.tech = api.tech.filter((t) => t !== 'RQ'); api.notes = api.notes.filter((n) => !/enqueues/.test(n));
  const admin = node(M, 'admin-page'); admin.sub = 'upload batch'; admin.desc = 'Admin view: uploads a named batch of JPEG/PNG files.'; delete admin.notes;
  const minio = node(M, 'minio'); minio.sub = 'images · thumbnails'; minio.desc = 'S3-compatible object storage with two buckets: original images and thumbnails.';
  node(M, 'sm').desc = 'The annotation task lifecycle: which action moves a task from which status to which, and which role may perform it.';
  edge(M, 'nginx', 'api').label = 'proxy';
  edge(M, 'admin', 'admin-page').label = 'uploads batches';
  return M;
}
function pr1a() {   // the worker and the queue arrive; the upload scenario gains its asynchronous half
  const M = without(clone(REAL), EXPORT.concat(['minio-init', 'lifecycle']));
  const base = v01();
  M.scenarios = M.scenarios.filter((s) => s.id !== 'export');
  M.project.intro = base.project.intro; node(M, 'admin-page').sub = base.nodes.find((n) => n.id === 'admin-page').sub;
  Object.assign(node(M, 'admin-page'), { desc: node(base, 'admin-page').desc }); delete node(M, 'admin-page').notes;
  Object.assign(node(M, 'minio'), { sub: node(base, 'minio').sub, desc: node(base, 'minio').desc });
  node(M, 'sm').desc = node(base, 'sm').desc; edge(M, 'nginx', 'api').label = 'proxy'; edge(M, 'admin', 'admin-page').label = 'uploads batches';
  node(M, 'worker').desc = 'Background worker that consumes the "thumbnails" queue from Redis and runs the job.';
  node(M, 'worker').sub = 'thumbnails'; node(M, 'redis').sub = 'RQ queue: thumbnails';
  node(M, 'redis').desc = 'Job queue between the API (producer) and the worker (consumer).';
  delete node(M, 'thumb').notes;
  return M;
}
function pr1b() {   // second commit of the branch: details found while testing
  const M = pr1a();
  node(M, 'thumb').notes = clone(node(REAL, 'thumb').notes);
  node(M, 'redis').desc = 'Job queue between the API (producer) and the worker (consumer). One RQ queue for now: "thumbnails".';
  return M;
}
function lifecycle() {   // the statuses get a box of their own
  const M = pr1b();
  const R = REAL;
  for (const id of ['lifecycle', 'st-pending', 'st-in-progress', 'st-submitted', 'st-approved', 'st-rejected']) M.nodes.splice(M.nodes.findIndex((n) => n.id === 'upload-image'), 0, clone(node(R, id)));
  M.edges.splice(M.edges.findIndex((e) => e.from === 'upload-batch' && e.to === 'models'), 0, ...R.edges.filter((e) => (e.from === 'next-status' && e.to === 'lifecycle') || e.from.startsWith('st-')).map(clone));
  node(M, 'sm').desc = node(R, 'sm').desc;
  M.project.intro = M.project.intro.replace('Start at the API service.', 'Start at the API service, then open "Task lifecycle" to see the statuses a task moves through.');
  return M;
}
function pr2a() {   // export routes and the COCO job (no scenario yet)
  const M = without(clone(REAL), ['minio-init']);
  const L = lifecycle();
  M.scenarios = M.scenarios.filter((s) => s.id !== 'export');
  M.project.intro = L.project.intro;
  edge(M, 'nginx', 'api').label = 'proxy';
  return M;
}
function pr2b() {   // the export walkthrough
  const M = pr2a();
  M.scenarios.push(clone(REAL.scenarios.find((s) => s.id === 'export')));
  M.project.intro = REAL.project.intro;
  return M;
}

// ---- the history
mkdirSync(dest, { recursive: true });
git(['init', '-q', '-b', 'main']);
git(['config', 'core.autocrlf', 'false']);
git(['config', 'commit.gpgsign', 'false']);
git(['config', 'tag.gpgsign', 'false']);
const commit = (who, date, msg) => { git(['add', '-A']); git(['commit', '-q', '-m', msg], who, date); return git(['rev-parse', 'HEAD']); };
const merge = (branch, n, title, date) => git(['merge', '-q', '--no-ff', branch, '-m', 'Merge pull request #' + n + ' from demo/' + branch, '-m', title], P.alex, date);

addCode('v0');
commit(P.alex, '2026-09-01T09:12:00+02:00', 'Initial code: web app, API service, PostgreSQL schema');
git(['tag', '-a', 'v0.0', '-m', 'v0.0: first code drop (no architecture model yet)'], P.alex, '2026-09-01T09:30:00+02:00');
write(v01());
commit(P.alex, '2026-09-03T16:40:00+02:00', 'Add architecture model (explorer model.js)');
git(['tag', '-a', 'v0.1', '-m', 'v0.1: annotate and review'], P.alex, '2026-09-04T10:00:00+02:00');

git(['checkout', '-q', '-b', 'feature/thumbnail-worker']);
addCode('pr1');
write(pr1a());
commit(P.bo, '2026-09-15T11:05:00+01:00', 'Add RQ worker that generates thumbnails');
write(pr1b());
commit(P.bo, '2026-09-16T14:20:00+01:00', 'Model: thumbnail key and size, queue name');
git(['checkout', '-q', 'main']);
merge('feature/thumbnail-worker', 1, 'Background thumbnails with an RQ worker', '2026-09-18T09:00:00+02:00');

write(lifecycle());
commit(P.chris, '2026-09-24T17:45:00-04:00', 'Model the task lifecycle as a state machine');

git(['checkout', '-q', '-b', 'feature/coco-export']);
addCode('pr2');
write(pr2a());
commit(P.chris, '2026-10-06T10:10:00-04:00', 'Export approved tasks as COCO JSON (routes and worker job)');
write(pr2b());
commit(P.chris, '2026-10-08T15:30:00-04:00', 'Model: export walkthrough scenario');
git(['checkout', '-q', 'main']);
merge('feature/coco-export', 2, 'COCO export of approved tasks', '2026-10-10T12:00:00+02:00');

write(REAL);
commit(P.bo, '2026-10-14T13:15:00+01:00', 'Model: minio-init job, arrow labels');
git(['tag', '-a', 'v1.0', '-m', 'v1.0: upload, annotate, review, export'], P.alex, '2026-10-15T09:00:00+02:00');

// code moves on, the model does not: the tip of main is now stale
const thumb = join(dest, 'worker/jobs/thumbnail.py');
writeFileSync(thumb, readFileSync(thumb, 'utf8').replace('THUMBNAIL_SIZE = (320, 320)', 'THUMBNAIL_SIZE = (512, 512)'));
mkdirSync(join(dest, 'worker/jobs'), { recursive: true });
writeFileSync(join(dest, 'worker/jobs/cleanup.py'), '"""Job: delete thumbnails whose image row is gone (demo file)."""\n\n\ndef remove_orphan_thumbnails() -> int:\n    return 0\n');
commit(P.chris, '2026-10-28T08:50:00-04:00', 'Larger thumbnails; job to remove orphaned thumbnails');

// an open pull request: e-mail notification on rejection, and one code-only helper dropped from the model
git(['checkout', '-q', '-b', 'feature/review-notifications', 'v1.0']);
writeFileSync(join(dest, 'api/app/notify.py'), '"""Sends an e-mail to the annotator when a reviewer rejects a task (demo file)."""\nimport smtplib\n\n\ndef notify_rejected(task, comment: str) -> None:\n    with smtplib.SMTP("smtp", 25) as s:\n        s.sendmail("noreply@example.invalid", [task.assignee.email], comment)\n');
const N = clone(REAL);
N.nodes.splice(N.nodes.findIndex((n) => n.id === 'web'), 0, { id: 'smtp', type: 'ext', name: 'Mail server', sub: 'SMTP relay', desc: 'Organisation mail relay that delivers notification e-mails.', tech: ['SMTP'] });
N.nodes.splice(N.nodes.findIndex((n) => n.id === 'login'), 0, { id: 'notify', parent: 'api', type: 'component', name: 'Notifications', sub: 'e-mail on rejection', path: 'api/app/notify.py',
  desc: 'Sends the assigned annotator an e-mail with the reviewer comment when a task is rejected.' });
N.edges.push({ from: 'review-task', to: 'notify', label: 'on reject' }, { from: 'notify', to: 'smtp', label: 'SMTP', dashed: true });
const review = N.scenarios.find((s) => s.id === 'review');
review.steps.splice(review.steps.findIndex((s) => s.from === 'review-task' && /add Review\(rejected/.test(s.label)) + 1, 0,
  { from: 'review-task', to: 'notify', label: 'notify_rejected(task, comment)' }, { from: 'notify', to: 'smtp', label: 'e-mail to the annotator' });
node(N, 'reviewer').desc = 'Works through the review queue and approves each submitted task or rejects it with a mandatory comment, which is e-mailed to the annotator.';
const gone = without(N, ['allowed-actions']);
write(gone);
commit(P.dana, '2026-11-04T10:30:00+01:00', 'Notify annotators by e-mail when a task is rejected\n\nAlso drops allowed_actions() from the model: only the tests use it.');
git(['update-ref', 'refs/pull/3/head', 'HEAD']);
git(['checkout', '-q', 'main']);

console.log('DEMO     ' + dest);
console.log(git(['log', '--graph', '--all', '--format=%h %d %an: %s']));
console.log('\nEverything above is demonstration data: fictional authors, invented dates, pull requests that exist only in merge messages and refs/pull/3/head.');
void relative;
