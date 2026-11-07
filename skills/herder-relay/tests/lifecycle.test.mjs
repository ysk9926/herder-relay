import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createLifecycle } from '../scripts/lifecycle.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-lifecycle-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const repo = path.join(root, 'repo');
  fs.mkdirSync(repo);
  const git = (args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  git(['init', '-b', 'main', repo]);
  git(['-C', repo, 'config', 'user.name', 'Fixture']);
  git(['-C', repo, 'config', 'user.email', 'fixture@example.invalid']);
  fs.writeFileSync(path.join(repo, 'file.txt'), 'baseline\n');
  git(['-C', repo, 'add', '.']);
  git(['-C', repo, 'commit', '-m', 'baseline']);
  const calls = [];
  const terminals = new Map();
  const core = { id: 'fixture-core', pid: 123 };
  let sequence = 0;
  const error = (kind) => { const e = new Error(kind); e.stderr = JSON.stringify({ error: { kind } }); throw e; };
  const hc = (args) => {
    calls.push(args);
    const command = args[0];
    if (command === 'server' && args[1] === 'status') return JSON.stringify({ core: { id: core.id }, pid: core.pid });
    if (command === 'run') {
      const address = `t${++sequence}`;
      const labels = Object.fromEntries(args.flatMap((v, i) => v === '--label' ? [args[i + 1].split('=')] : []));
      const cwd = args[args.indexOf('--cwd') + 1];
      const term = { address, cwd, created_ms: sequence, labels, parent: null, state: 'live', reported: true, status: { state: 'done' }, turn: 2 };
      terminals.set(address, term);
      return JSON.stringify({ address });
    }
    if (command === 'ls') return JSON.stringify({ terminals: [...terminals.values()] });
    const address = args[1];
    const term = terminals.get(address);
    if (!term) return error('not_found');
    if (command === 'get') return JSON.stringify(term);
    if (command === 'read') return `report from ${address}\n`;
    if (command === 'kill') { term.state = 'finished'; term.exit_code = 0; return JSON.stringify(term); }
    if (command === 'rm') { assert.equal(term.state, 'finished'); terminals.delete(address); return JSON.stringify({ removed: address }); }
    if (command === 'wait') return JSON.stringify({ reason: 'exit', ended: true });
    throw new Error(`unexpected ${args}`);
  };
  const home = path.join(root, 'state');
  const api = createLifecycle({ home, hc, git, env: {}, hcCommand: 'hc' });
  const init = (id = 'task', options = {}) => api.init({ id, repo, ...options });
  const run = (id = 'task', options = {}) => api.run({ id, name: `${id}-work`, argv: ['codex', '--no-daemon', 'synthetic task'], ...options });
  const report = path.join(root, 'report.md');
  fs.writeFileSync(report, '# Completed\nEvidence inspected.\n');
  return { root, repo, home, api, init, run, report, calls, terminals, git, hc, core };
}

test('finish archives evidence, removes owned terminal and clean managed worktree, preserves branch', async t => {
  const f = fixture(t);
  const task = f.init();
  const started = f.run();
  const result = f.api.finish({ id: 'task', report: f.report });
  assert.equal(result.status, 'closed');
  assert.equal(f.terminals.has(started.address), false);
  assert.equal(fs.existsSync(task.cwd), false);
  assert.match(fs.readFileSync(result.report, 'utf8'), /Completed/);
  assert.ok(fs.existsSync(path.join(f.home, 'tasks/task/artifacts')));
  assert.ok(f.git(['-C', f.repo, 'show-ref', '--verify', 'refs/heads/herder-relay/task']).trim());
});

test('dry run has no kill, rm or worktree removal and can later close', t => {
  const f = fixture(t); const task = f.init(); f.run();
  const first = f.api.finish({ id: 'task', report: f.report, dryRun: true });
  assert.equal(first.worktree.status, 'eligible');
  assert.equal(f.calls.some(c => ['kill', 'rm'].includes(c[0])), false);
  assert.ok(fs.existsSync(task.cwd));
  assert.equal(f.api.status({ id: 'task' }).status, 'open');
  assert.equal(fs.existsSync(path.join(f.home, 'tasks/task/artifacts/final-report.md')), false);
  assert.equal(f.api.finish({ id: 'task', report: f.report }).status, 'closed');
});

test('modified and untracked files preserve worktree and retry after commit removes it', t => {
  const f = fixture(t); const task = f.init(); f.run();
  fs.writeFileSync(path.join(task.cwd, 'new.txt'), 'keep me');
  const first = f.api.finish({ id: 'task', report: f.report });
  assert.equal(first.worktree.status, 'retained');
  assert.ok(fs.existsSync(path.join(task.cwd, 'new.txt')));
  f.git(['-C', task.cwd, 'add', 'new.txt']);
  f.git(['-C', task.cwd, 'commit', '-m', 'save result']);
  const gc = f.api.gc({ dryRun: false });
  assert.equal(gc[0].status, 'closed');
});

test('working, blocked and unknown live terminals are never killed', t => {
  for (const status of ['working', 'blocked', 'error', null]) {
    const f = fixture(t); const task = f.init(); const started = f.run();
    f.terminals.get(started.address).status = status ? { state: status } : null;
    const result = f.api.finish({ id: 'task', report: f.report });
    assert.equal(result.status, 'retained');
    assert.equal(f.calls.some(c => c[0] === 'kill'), false);
    assert.ok(fs.existsSync(task.cwd));
  }
});

test('keep-open persists across gc and explicit close can release it', t => {
  const f = fixture(t); const task = f.init(); f.run();
  assert.equal(f.api.finish({ id: 'task', report: f.report, keepOpen: true }).status, 'kept-open');
  assert.equal(f.api.gc({ dryRun: false })[0].status, 'kept-open');
  assert.ok(fs.existsSync(task.cwd));
  assert.equal(f.api.cleanup({ id: 'task', close: true }).status, 'closed');
});

test('shared original checkout is never removed', t => {
  const f = fixture(t); f.init('task', { shared: true }); f.run();
  const result = f.api.finish({ id: 'task', report: f.report });
  assert.equal(result.worktree.status, 'unmanaged');
  assert.equal(result.status, 'closed');
  assert.ok(fs.existsSync(path.join(f.repo, '.git')));
});

test('an unrelated terminal in worktree preserves worktree', t => {
  const f = fixture(t); const task = f.init(); f.run();
  f.terminals.set('t99', { address: 't99', state: 'live', cwd: task.cwd, labels: {}, parent: null });
  const result = f.api.finish({ id: 'task', report: f.report });
  assert.equal(result.worktree.status, 'retained');
  assert.ok(f.terminals.has('t99'));
  assert.equal(f.calls.some(c => ['kill', 'rm'].includes(c[0]) && c[1] === 't99'), false);
});

test('unregistered child prevents killing its owned parent', t => {
  const f = fixture(t); f.init(); const started = f.run();
  f.terminals.set('t99', { address: 't99', state: 'live', cwd: f.root, labels: {}, parent: started.address });
  const result = f.api.finish({ id: 'task', report: f.report });
  assert.equal(result.status, 'retained');
  assert.equal(f.calls.some(c => c[0] === 'kill'), false);
});

test('identity mismatch or HC context change cannot kill a reused address', t => {
  const f = fixture(t); const task = f.init(); const started = f.run();
  f.terminals.get(started.address).created_ms += 100;
  const result = f.api.finish({ id: 'task', report: f.report });
  assert.equal(result.status, 'retained');
  assert.equal(f.calls.some(c => c[0] === 'kill'), false);
  assert.ok(fs.existsSync(task.cwd));
  const changed = createLifecycle({ home: f.home, hc: () => { throw new Error('must not contact other core'); }, git: f.git, env: { HC_SESSION: 'different' } });
  assert.equal(changed.cleanup({ id: 'task' }).status, 'retained');
});

test('locked worktree is retained without force or unlock', t => {
  const f = fixture(t); const task = f.init(); f.run();
  f.git(['-C', f.repo, 'worktree', 'lock', task.cwd, '--reason', 'user lock']);
  const result = f.api.finish({ id: 'task', report: f.report });
  assert.equal(result.worktree.status, 'retained');
  assert.match(result.worktree.reason, /locked/);
  assert.ok(fs.existsSync(task.cwd));
});

test('unfinished task, missing report, repeated finish and invalid ids are guarded', t => {
  const f = fixture(t); f.init();
  assert.equal(f.api.cleanup({ id: 'task' }).status, 'retained');
  assert.throws(() => f.api.finish({ id: 'task', report: path.join(f.root, 'missing') }));
  assert.throws(() => f.init('../escape'));
  assert.throws(() => f.init('task'));
  f.run();
  const first = f.api.finish({ id: 'task', report: f.report });
  const second = f.api.cleanup({ id: 'task' });
  assert.equal(first.status, 'closed');
  assert.equal(second.status, 'closed');
});

test('read failure or connection failure retains terminal and worktree for retry', t => {
  const f = fixture(t); const task = f.init(); f.run();
  const flaky = createLifecycle({ home: f.home, git: f.git, env: {}, hc: args => { if (args[0] === 'read') throw new Error('disconnected'); return f.hc(args); } });
  const result = flaky.finish({ id: 'task', report: f.report });
  assert.equal(result.status, 'retained');
  assert.equal(f.calls.some(c => c[0] === 'kill'), false);
  assert.ok(fs.existsSync(task.cwd));
});

test('changed branch, symlinked worktree and another open task prevent worktree deletion', t => {
  for (const mode of ['branch', 'symlink', 'other-task']) {
    const f = fixture(t); const task = f.init(); f.run();
    if (mode === 'branch') f.git(['-C', task.cwd, 'checkout', '-b', 'different-branch']);
    if (mode === 'symlink') {
      const moved = path.join(f.root, 'moved-worktree');
      fs.renameSync(task.cwd, moved);
      fs.symlinkSync(moved, task.cwd, 'dir');
    }
    if (mode === 'other-task') f.api.init({ id: 'other-task', repo: task.cwd, shared: true });
    const result = f.api.finish({ id: 'task', report: f.report });
    assert.equal(result.worktree.status, 'retained');
    assert.ok(fs.existsSync(task.cwd));
  }
});

test('ignored files are retained instead of being silently removed by Git', t => {
  const f = fixture(t); const task = f.init(); f.run();
  fs.writeFileSync(path.join(task.cwd, '.gitignore'), 'secret\n');
  f.git(['-C', task.cwd, 'add', '.gitignore']); f.git(['-C', task.cwd, 'commit', '-m', 'ignore fixture data']);
  fs.writeFileSync(path.join(task.cwd, 'secret'), 'must survive');
  const result = f.api.finish({ id: 'task', report: f.report });
  assert.equal(result.worktree.status, 'retained');
  assert.equal(fs.readFileSync(path.join(task.cwd, 'secret'), 'utf8'), 'must survive');
});

test('gc never accepts a new terminal turn after a premature finish or keep-open report', t => {
  for (const premature of [true, false]) {
    const f = fixture(t); const task = f.init(); const started = f.run();
    if (premature) f.terminals.get(started.address).status.state = 'working';
    f.api.finish({ id: 'task', report: f.report, keepOpen: !premature });
    const terminal = f.terminals.get(started.address);
    terminal.status.state = 'done'; terminal.turn = 99;
    const result = premature ? f.api.gc({ dryRun: false })[0] : f.api.cleanup({ id: 'task', close: true });
    assert.equal(result.status, 'retained');
    assert.equal(f.calls.some(c => c[0] === 'kill'), false);
    assert.ok(fs.existsSync(task.cwd));
  }
});

test('core identity changes behind the same environment cannot erase an active worktree', t => {
  const f = fixture(t); const task = f.init(); const started = f.run();
  f.core.id = 'different-core'; f.core.pid = 321;
  const result = f.api.finish({ id: 'task', report: f.report });
  assert.equal(result.status, 'retained');
  assert.equal(f.calls.some(c => ['kill', 'rm'].includes(c[0])), false);
  assert.ok(fs.existsSync(task.cwd));
  assert.ok(f.terminals.has(started.address));
});
