import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createLifecycle } from '../scripts/lifecycle.mjs';

const binary = process.env.HC_BIN;
test('real isolated HC: owned terminal close, archived evidence, worktree remove and branch retention', { skip: !binary }, t => {
  // A private socket + session + XDG directories never touch the user's core.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hcr-life-'));
  const env = { ...process.env, HC_SESSION: 'lifecycle-test', HC_SOCKET: path.join(root, 's.sock'), XDG_CONFIG_HOME: path.join(root, 'config'), XDG_STATE_HOME: path.join(root, 'state') };
  delete env.HC_TERMINAL_ID;
  const hc = args => execFileSync(binary, args, { env, encoding: 'utf8', timeout: 15000 });
  t.after(() => {
    try { hc(['server', 'stop', '--json']); } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
  const repo = path.join(root, 'repo'); fs.mkdirSync(repo);
  const git = args => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  git(['init', '-b', 'main', repo]);
  git(['-C', repo, 'config', 'user.name', 'Fixture']);
  git(['-C', repo, 'config', 'user.email', 'fixture@example.invalid']);
  fs.writeFileSync(path.join(repo, 'file.txt'), 'baseline\n');
  git(['-C', repo, 'add', '.']); git(['-C', repo, 'commit', '-m', 'baseline']);
  const fixture = path.join(root, 'agent.cjs');
  fs.writeFileSync(fixture, `const readline=require('node:readline');
const status=s=>process.stdout.write('\\x1b]7501;state='+s+':app=lifecycle-fixture\\x1b\\\\');
status('idle'); readline.createInterface({input:process.stdin}).on('line',s=>{status('working');console.log('received '+s);status('done');});\n`);
  const api = createLifecycle({ home: path.join(root, 'relay'), env, hcCommand: binary, git });
  const task = api.init({ id: 'actual-hc', repo });
  const started = api.run({ id: task.id, name: 'actual-hc-worker', argv: [process.execPath, fixture] });
  const sent = JSON.parse(hc(['send', started.address, 'synthetic task', '--wait', '--timeout', '5', '--json']));
  assert.notEqual(sent.wait?.reason, 'timeout');
  fs.writeFileSync(task.reportPath, '# Accepted synthetic result\nCLI lifecycle integration only.\n');
  const result = api.finish({ id: task.id, report: task.reportPath });
  assert.equal(result.status, 'closed', JSON.stringify(result));
  assert.equal(fs.existsSync(task.cwd), false);
  assert.ok(fs.existsSync(result.report));
  assert.ok(git(['-C', repo, 'show-ref', '--verify', 'refs/heads/herder-relay/actual-hc']).trim());
  const inventory = JSON.parse(hc(['ls', '--all', '--json']));
  assert.equal(inventory.terminals.some(terminal => terminal.address === started.address), false);
  assert.equal(api.cleanup({ id: task.id }).status, 'closed');
});
