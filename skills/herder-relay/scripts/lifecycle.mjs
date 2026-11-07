#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const execute = (command, args, env = process.env) => execFileSync(command, args, {
  env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 75000, maxBuffer: 16 * 1024 * 1024,
});
const inside = (root, target) => {
  const relative = path.relative(root, target);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
};
const canonical = value => {
  const absolute = path.resolve(value);
  if (fs.existsSync(absolute)) return fs.realpathSync(absolute);
  return path.join(canonical(path.dirname(absolute)), path.basename(absolute));
};
const message = error => String(error.stderr || error.message || error).trim();
const isMissing = error => {
  try { return JSON.parse(String(error.stderr)).error.kind === 'not_found'; } catch { return false; }
};
const context = env => Object.fromEntries(['HC_SESSION', 'HC_SOCKET', 'XDG_CONFIG_HOME', 'XDG_STATE_HOME', 'HOME'].map(key => [key, env[key] ?? null]));
const atomicJSON = (file, value) => {
  const temporary = `${file}.${randomUUID()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(temporary, file);
};
const entries = output => output.split('\0\0').filter(Boolean).map(block => Object.fromEntries(block.split('\0').filter(Boolean).map(line => {
  const split = line.indexOf(' ');
  return split === -1 ? [line, ''] : [line.slice(0, split), line.slice(split + 1)];
})));

export function createLifecycle({
  home = process.env.HERDER_RELAY_HOME || path.join(os.homedir(), '.herder-relay'),
  env = process.env, hcCommand = process.env.HERDER_RELAY_HC || 'hc', hc,
  git = args => execute('git', args),
} = {}) {
  home = canonical(home);
  const idOf = id => {
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(id || '')) throw new Error('task id must be 1-64 lowercase letters, digits, - or _');
    return id;
  };
  const directory = id => path.join(home, 'tasks', idOf(id));
  const recordPath = id => path.join(directory(id), 'task.json');
  const read = id => {
    const task = JSON.parse(fs.readFileSync(recordPath(id), 'utf8'));
    if (task.version !== 1 || task.id !== id || !Array.isArray(task.terminals)) throw new Error('invalid task record');
    return task;
  };
  const save = task => atomicJSON(recordPath(task.id), task);
  const locked = (id, action) => {
    const lock = path.join(directory(id), '.operation.lock');
    const descriptor = fs.openSync(lock, 'wx', 0o600);
    fs.writeFileSync(descriptor, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
    try { return action(); } finally { fs.closeSync(descriptor); fs.unlinkSync(lock); }
  };
  const call = (task, args) => hc ? hc(args) : execute(task.hcCommand || hcCommand, args, env);
  const json = (task, args) => JSON.parse(call(task, args));
  const coreIdentity = task => {
    const state = json(task, ['server', 'status', '--json']);
    if (typeof state.core?.id !== 'string' || typeof state.pid !== 'number') throw new Error('cannot identify the actual HC core');
    return { id: state.core.id, pid: state.pid };
  };
  const assertCore = task => {
    if (!task.core || JSON.stringify(coreIdentity(task)) !== JSON.stringify(task.core)) throw new Error('actual HC core identity/process changed; inspect resources before reconciling');
  };
  const get = (task, address) => {
    try { return json(task, ['get', address, '--json']); }
    catch (error) {
      if (isMissing(error)) { if (task.core) assertCore(task); return null; }
      throw error;
    }
  };
  const list = task => {
    const result = json(task, ['ls', '--all', '--json']);
    if (!Array.isArray(result.terminals)) throw new Error('hc ls returned no terminal inventory');
    return result.terminals;
  };
  const assertContext = task => {
    if (JSON.stringify(task.context) !== JSON.stringify(context(env))) throw new Error('HC environment changed; restore the recorded core/session environment');
  };
  const owns = (task, terminal) => terminal.labels?.['relay.task'] === task.id && terminal.labels?.['relay.owner'] === task.owner;
  const checkIdentity = (task, record, terminal) => {
    if (!owns(task, terminal) || terminal.address !== record.address || terminal.created_ms !== record.createdMs) {
      throw new Error(`terminal identity mismatch: ${record.address}`);
    }
  };
  const ready = terminal => terminal.state === 'finished' || (terminal.state === 'live' && terminal.reported === true && ['idle', 'done'].includes(terminal.status?.state));
  const checkTerminal = (task, record, terminal) => {
    checkIdentity(task, record, terminal);
    if (!record.accepted?.ready || terminal.turn !== record.accepted.turn) {
      throw new Error(`terminal no longer matches the accepted completion turn: ${record.address}`);
    }
    if (terminal.state !== 'finished' && !(terminal.state === 'live' && terminal.reported === true && ['idle', 'done'].includes(terminal.status?.state))) {
      throw new Error(`terminal is active, blocked or unobserved: ${record.address} (${terminal.status?.state || terminal.state})`);
    }
  };
  const acceptTerminals = task => {
    assertContext(task);
    if (!task.core && task.terminals.length) throw new Error('previous terminal launch has no confirmed core identity');
    task.core ||= coreIdentity(task);
    assertCore(task);
    for (const record of task.terminals.filter(t => !t.removedAt)) {
      const terminal = get(task, record.address);
      if (terminal) checkIdentity(task, record, terminal);
      record.accepted = terminal ? { turn: terminal.turn, ready: ready(terminal) } : { missing: true, ready: true };
    }
  };
  const worktreeState = (task, inventory) => {
    if (!task.managedWorktree) return { path: task.cwd, status: 'unmanaged' };
    try {
      const expected = path.join(home, 'worktrees', task.id);
      if (path.resolve(task.cwd) !== expected) throw new Error('managed worktree path mismatch');
      if (!fs.existsSync(task.cwd)) {
        const registered = entries(git(['-C', task.repo, 'worktree', 'list', '--porcelain', '-z'])).some(row => canonical(row.worktree) === canonical(task.cwd));
        if (registered) throw new Error('worktree path missing but Git registration remains; inspect before pruning');
        return { path: task.cwd, status: 'removed' };
      }
      if (fs.lstatSync(task.cwd).isSymbolicLink()) throw new Error('managed worktree cannot be a symlink');
      const root = canonical(task.cwd);
      if (root !== expected) throw new Error('managed worktree has a symlink ancestor');
      if (!fs.lstatSync(path.join(root, '.git')).isFile()) throw new Error('refusing to remove a main checkout');
      if (canonical(git(['-C', root, 'rev-parse', '--show-toplevel']).trim()) !== root) throw new Error('worktree root mismatch');
      const registration = entries(git(['-C', task.repo, 'worktree', 'list', '--porcelain', '-z'])).find(row => canonical(row.worktree) === root);
      if (!registration) throw new Error('worktree not registered in the recorded repository');
      if ('locked' in registration) throw new Error('worktree is locked');
      if (registration.branch !== `refs/heads/${task.branch}`) throw new Error('worktree branch changed or HEAD is detached; preserve before cleanup');
      if (!git(['-C', root, 'for-each-ref', '--contains', 'HEAD', '--format=%(refname)', 'refs/heads', 'refs/tags']).trim()) {
        throw new Error('HEAD has no preserving branch or tag');
      }
      if (git(['-C', root, 'status', '--porcelain', '--untracked-files=all', '--ignored=matching']).trim()) throw new Error('worktree has modified, untracked or ignored files');
      for (const row of inventory) {
        if (row.state !== 'live') continue;
        const terminal = get(task, row.address);
        if (!terminal) continue;
        if ([terminal.cwd, terminal.foreground?.cwd].some(cwd => cwd && inside(root, canonical(cwd)))) throw new Error(`worktree still used by terminal ${row.address}`);
      }
      const tasksDir = path.join(home, 'tasks');
      for (const id of fs.readdirSync(tasksDir)) {
        if (id === task.id || !fs.statSync(path.join(tasksDir, id)).isDirectory()) continue;
        const other = read(id);
        if (other.status !== 'closed' && other.cwd && inside(root, canonical(other.cwd))) throw new Error(`worktree still reserved by task ${id}`);
      }
      return { path: task.cwd, status: 'eligible' };
    } catch (error) { return { path: task.cwd, status: 'retained', reason: message(error) }; }
  };

  function cleanupUnlocked(task, { dryRun = false, close = false } = {}) {
    if (task.status === 'closed') return { ...task.cleanup, status: 'closed', report: task.report };
    const retained = reason => ({ taskId: task.id, status: 'retained', reason, report: task.report, worktree: { path: task.cwd, status: task.managedWorktree ? 'retained' : 'unmanaged', reason } });
    if (!task.completedAt || !task.report || !fs.existsSync(task.report)) return retained('task completion and archived report are required');
    if (task.keepOpen && !close) return { ...retained('keep-open requested'), status: 'kept-open' };
    if (task.acceptanceError) return retained(task.acceptanceError);
    let inventory;
    const snapshots = new Map();
    try {
      assertContext(task);
      assertCore(task);
      inventory = list(task);
      const addresses = new Set(task.terminals.filter(t => !t.removedAt).map(t => t.address));
      for (const terminal of inventory) {
        if (terminal.state === 'live' && addresses.has(terminal.parent) && !addresses.has(terminal.address)) {
          throw new Error(`unregistered child ${terminal.address} still depends on a managed terminal`);
        }
      }
      for (const record of task.terminals.filter(t => !t.removedAt)) {
        const terminal = get(task, record.address);
        if (terminal) checkTerminal(task, record, terminal);
        snapshots.set(record.address, terminal);
      }
      // Preserve every available screen before ending any terminal.
      if (!dryRun && snapshots.size) {
        const attempt = path.join(directory(task.id), 'artifacts', `cleanup-${Date.now()}-${randomUUID().slice(0, 8)}`);
        fs.mkdirSync(attempt, { recursive: true, mode: 0o700 });
        let sequence = 0;
        for (const [address, terminal] of snapshots) {
          if (!terminal) continue;
          const prefix = path.join(attempt, `terminal-${++sequence}`);
          atomicJSON(`${prefix}.json`, terminal);
          fs.writeFileSync(`${prefix}.txt`, call(task, ['read', address, '--lines', '200']), { mode: 0o600 });
        }
        task.evidence = [...(task.evidence || []), attempt];
        save(task);
      }
    } catch (error) {
      const result = retained(message(error));
      if (!dryRun) { task.cleanup = result; save(task); }
      return result;
    }
    const terminals = [];
    for (const record of [...task.terminals].reverse()) {
      if (record.removedAt) { terminals.push({ address: record.address, status: 'removed' }); continue; }
      try {
        let current = snapshots.get(record.address);
        if (!dryRun && current) {
          const fresh = get(task, record.address);
          if (fresh) {
            checkTerminal(task, record, fresh);
            if (fresh.turn !== current.turn) throw new Error('terminal turn changed after result collection');
            assertCore(task);
            if (fresh.state === 'live') call(task, ['kill', record.address, '--json']);
            current = get(task, record.address);
            if (current?.state === 'live') {
              call(task, ['wait', record.address, '--timeout', '5', '--json']);
              current = get(task, record.address);
            }
            if (current) {
              checkTerminal(task, record, current);
              if (current.state !== 'finished') throw new Error('terminal did not finish after kill');
              assertCore(task);
              call(task, ['rm', record.address, '--json']);
            }
          }
        }
        if (!dryRun) { record.removedAt = new Date().toISOString(); save(task); }
        terminals.push({ address: record.address, status: dryRun && current ? 'eligible' : 'removed' });
      } catch (error) { terminals.push({ address: record.address, status: 'retained', reason: message(error) }); break; }
    }
    let worktree;
    if (terminals.some(t => t.status === 'retained')) {
      worktree = { path: task.cwd, status: task.managedWorktree ? 'retained' : 'unmanaged', reason: 'terminal cleanup incomplete' };
    } else {
      try {
        const remaining = dryRun ? inventory.filter(row => !snapshots.has(row.address)) : list(task);
        worktree = worktreeState(task, remaining);
        if (!dryRun && worktree.status === 'eligible') {
          assertCore(task);
          // Git's own dirty/untracked/submodule protections remain enabled: no --force.
          git(['-C', task.repo, 'worktree', 'remove', task.cwd]);
          worktree.status = 'removed';
        }
      } catch (error) { worktree = { path: task.cwd, status: 'retained', reason: message(error) }; }
    }
    const successful = !terminals.some(t => t.status === 'retained') && ['removed', 'unmanaged', 'eligible'].includes(worktree.status);
    const result = { taskId: task.id, status: successful ? (dryRun ? 'eligible' : 'closed') : 'retained', report: task.report, terminals, worktree };
    if (!dryRun) {
      if (close) task.keepOpen = false;
      task.cleanup = result;
      if (successful) { task.status = 'closed'; task.closedAt = new Date().toISOString(); }
      save(task);
    }
    return result;
  }

  return {
    init({ id, repo, base = 'HEAD', shared = false }) {
      idOf(id);
      repo = canonical(git(['-C', path.resolve(repo), 'rev-parse', '--show-toplevel']).trim());
      const commit = git(['-C', repo, 'rev-parse', '--verify', '--end-of-options', `${base}^{commit}`]).trim();
      fs.mkdirSync(path.join(home, 'tasks'), { recursive: true, mode: 0o700 });
      fs.mkdirSync(directory(id), { mode: 0o700 }); // Never reuse a previous task's identity.
      return locked(id, () => {
        const cwd = shared ? repo : path.join(home, 'worktrees', id);
        const task = { version: 1, id, owner: randomUUID(), repo, cwd, managedWorktree: !shared, branch: shared ? null : `herder-relay/${id}`, baseCommit: commit, context: context(env), status: 'open', terminals: [], createdAt: new Date().toISOString() };
        fs.mkdirSync(path.join(directory(id), 'artifacts'), { mode: 0o700 });
        save(task);
        if (!shared) {
          fs.mkdirSync(path.dirname(cwd), { recursive: true, mode: 0o700 });
          if (fs.lstatSync(path.dirname(cwd)).isSymbolicLink() || fs.existsSync(cwd)) throw new Error('worktree destination already exists or has a symlink parent');
          git(['-C', repo, 'worktree', 'add', '-b', task.branch, cwd, commit]);
          task.cwd = canonical(cwd);
          save(task);
        }
        return { ...task, reportPath: path.join(directory(id), 'artifacts', 'report.md') };
      });
    },
    run({ id, name, argv, parent }) {
      return locked(id, () => {
        const task = read(id);
        assertContext(task);
        if (task.core) assertCore(task);
        else if (task.terminals.length) throw new Error('inspect previous unconfirmed terminal launch before starting another');
        if (task.status !== 'open') throw new Error('cannot start another terminal after completion');
        if (!/^[a-z0-9_-]{1,32}$/.test(name || '')) throw new Error('invalid HC terminal name');
        if (!argv?.length) throw new Error('interactive agent or HC template command is required after --');
        if (path.basename(argv[0]) === 'codex' && !argv.includes('--no-daemon')) throw new Error('Codex requires --no-daemon under HC');
        const options = [];
        if (parent) {
          const actual = get(task, parent);
          if (!actual || actual.state !== 'live') throw new Error('explicit parent is not a confirmed live HC terminal');
          options.push('--parent', actual.address);
        } else if (!env.HC_TERMINAL_ID) options.push('--no-parent');
        task.hcCommand ||= hcCommand;
        const result = json(task, ['run', '--bg', '--json', '--name', name, '--cwd', task.cwd, '--label', `relay.task=${id}`, '--label', `relay.owner=${task.owner}`, ...options, '--', ...argv]);
        if (typeof result.address !== 'string' || !result.address) throw new Error('hc run returned no address; inspect HC before retrying');
        // Record the address before further reads, so a read failure does not lose ownership.
        const record = { address: result.address, name, launch: result, createdMs: null };
        task.terminals.push(record);
        save(task);
        task.core ||= coreIdentity(task);
        save(task);
        const actual = get(task, record.address);
        if (!actual || !owns(task, actual) || typeof actual.created_ms !== 'number') throw new Error('cannot confirm launched terminal identity; inspect saved task before retrying');
        record.createdMs = actual.created_ms;
        record.parent = actual.parent ?? null;
        save(task);
        return result;
      });
    },
    status({ id }) { return read(id); },
    finish({ id, report, artifacts = [], keepOpen = false, dryRun = false }) {
      return locked(id, () => {
        const task = read(id);
        if (task.status === 'closed') return cleanupUnlocked(task);
        const content = fs.readFileSync(path.resolve(report));
        if (!content.toString().trim()) throw new Error('non-empty final report required');
        if (dryRun) {
          const preview = { ...structuredClone(task), report: path.resolve(report), completedAt: task.completedAt || new Date().toISOString(), keepOpen };
          try { acceptTerminals(preview); delete preview.acceptanceError; }
          catch (error) { preview.acceptanceError = message(error); }
          return cleanupUnlocked(preview, { dryRun: true });
        }
        const archived = path.join(directory(id), 'artifacts', 'final-report.md');
        fs.writeFileSync(archived, content, { mode: 0o600 });
        for (let index = 0; index < artifacts.length; index++) {
          const source = path.resolve(artifacts[index]);
          fs.copyFileSync(source, path.join(directory(id), 'artifacts', `attachment-${index + 1}-${path.basename(source)}`));
        }
        task.report = archived;
        task.completedAt ||= new Date().toISOString();
        task.status = 'completed';
        task.keepOpen = keepOpen;
        try { acceptTerminals(task); delete task.acceptanceError; }
        catch (error) { task.acceptanceError = message(error); }
        save(task);
        return cleanupUnlocked(task, { dryRun });
      });
    },
    cleanup({ id, dryRun = false, close = false }) {
      return locked(id, () => cleanupUnlocked(read(id), { dryRun, close }));
    },
    gc({ dryRun = true } = {}) {
      const tasksDir = path.join(home, 'tasks');
      if (!fs.existsSync(tasksDir)) return [];
      return fs.readdirSync(tasksDir).filter(id => /^[a-z0-9][a-z0-9_-]{0,63}$/.test(id) && fs.existsSync(recordPath(id))).flatMap(id => {
        try {
          const task = read(id);
          if (!task.completedAt || task.status === 'closed') return [];
          return [locked(id, () => cleanupUnlocked(read(id), { dryRun }))];
        } catch (error) { return [{ taskId: id, status: 'retained', reason: message(error) }]; }
      });
    },
  };
}

export const HELP = `Herdr Relay lifecycle — track only resources created by this helper
  node lifecycle.mjs init --task ID --repo /repo [--base REF] [--shared]
  node lifecycle.mjs run --task ID --name NAME [--parent ADDRESS] -- codex --no-daemon PROMPT
  node lifecycle.mjs status --task ID
  node lifecycle.mjs finish --task ID --report FILE [--artifact FILE] [--keep-open] [--dry-run]
  node lifecycle.mjs cleanup --task ID [--dry-run] [--close]
  node lifecycle.mjs gc [--dry-run | --apply]
Global options: --home DIR, --hc /path/to/hc; env HERDER_RELAY_HOME, HERDER_RELAY_HC.
finish archives the accepted report and then cleans up; it does not verify task success.
Unfinished/active/dirty/locked/shared/unowned resources are retained. Branches and reports are kept.
No agent is started and no existing task is stopped by init, status or gc --dry-run.`;

export function main(argv) {
  const [command, ...rest] = argv;
  if (!command || ['help', '--help'].includes(command)) { process.stdout.write(HELP + '\n'); return 0; }
  const separator = rest.indexOf('--');
  const agent = separator === -1 ? [] : rest.slice(separator + 1);
  const options = separator === -1 ? rest : rest.slice(0, separator);
  const { values: v } = parseArgs({ args: options, options: {
    task: { type: 'string' }, repo: { type: 'string' }, base: { type: 'string' }, name: { type: 'string' }, parent: { type: 'string' },
    home: { type: 'string' }, hc: { type: 'string' }, report: { type: 'string' }, artifact: { type: 'string', multiple: true },
    shared: { type: 'boolean' }, 'keep-open': { type: 'boolean' }, 'dry-run': { type: 'boolean' }, close: { type: 'boolean' }, apply: { type: 'boolean' },
  }});
  if (v.apply && v['dry-run']) throw new Error('--apply and --dry-run conflict');
  const api = createLifecycle({ home: v.home, hcCommand: v.hc });
  let result;
  if (command === 'init') result = api.init({ id: v.task, repo: v.repo, base: v.base, shared: v.shared });
  else if (command === 'run') result = api.run({ id: v.task, name: v.name, argv: agent, parent: v.parent });
  else if (command === 'status') result = api.status({ id: v.task });
  else if (command === 'finish') result = api.finish({ id: v.task, report: v.report, artifacts: v.artifact, keepOpen: v['keep-open'], dryRun: v['dry-run'] });
  else if (command === 'cleanup') result = api.cleanup({ id: v.task, dryRun: v['dry-run'], close: v.close });
  else if (command === 'gc') result = api.gc({ dryRun: !v.apply });
  else throw new Error(`unknown command: ${command}`);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  const items = Array.isArray(result) ? result : [result];
  return items.some(item => item.status === 'retained') ? 2 : 0;
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(process.argv.slice(2)); }
  catch (error) { process.stdout.write(JSON.stringify({ error: message(error) }) + '\n'); process.exitCode = 2; }
}
