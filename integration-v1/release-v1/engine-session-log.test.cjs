'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { createSessionLog } = require('./engine.cjs');

const startedAtMs = Date.parse('2026-11-18T08:28:15.000Z');
const activeAtMs = startedAtMs + 7000;
function fixture(t, failureAtUtc = '2026-11-18T08:21:43.000Z') {
 const root = fs.mkdtempSync(path.join(__dirname, '.session-log-test-'));
 t.after(() => {
  for (const name of fs.readdirSync(root)) fs.unlinkSync(path.join(root, name));
  fs.rmdirSync(root);
 });
 const failure = {schema:1, atUtc:failureAtUtc, mode:'Start', failureStage:'launch', errorCode:'diagnostic-port-busy', exceptionHResult:-1, controllerPid:123};
 const failurePath = path.join(root, 'startup-failure.json');
 fs.writeFileSync(failurePath, JSON.stringify(failure));
 fs.writeFileSync(path.join(root, 'session-events.json'), JSON.stringify([{atUtc:'2026-11-18T08:20:23.000Z', event:'stopped', reason:'session-error-PROCESS_ENDED'}]));
 return {root, failure, failurePath, originalFailure:fs.readFileSync(failurePath, 'utf8')};
}
const read = (root, name) => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
const logger = root => createSessionLog({root, startedAtMs, controllerPid:456, now:()=>activeAtMs});

test('starting a new session replaces a previous stopped event before any recovery', t => {
 const {root, failurePath, originalFailure} = fixture(t);
 logger(root);
 assert.deepEqual(read(root, 'session-events.json'), [{atUtc:new Date(activeAtMs).toISOString(), event:'started', controllerPid:456, sessionStartedAtUtc:new Date(startedAtMs).toISOString()}]);
 assert.equal(fs.readFileSync(failurePath, 'utf8'), originalFailure);
 assert.equal(fs.existsSync(path.join(root, 'startup-recovery.json')), false);
});

test('a session that stops before application never marks the prior startup failure recovered', t => {
 const {root, originalFailure, failurePath} = fixture(t);
 logger(root).record('stopped', {reason:'session-error-PROCESS_ENDED'});
 assert.equal(read(root, 'session-events.json').at(-1).event, 'stopped');
 assert.equal(fs.readFileSync(failurePath, 'utf8'), originalFailure);
 assert.equal(fs.existsSync(path.join(root, 'startup-recovery.json')), false);
});

test('actual application records the exact earlier failure as recovered without rewriting it', t => {
 const {root, failure, failurePath, originalFailure} = fixture(t);
 const log = logger(root);
 const receipt = log.applied();
 assert.deepEqual(receipt, {failureAtUtc:failure.atUtc, failureControllerPid:failure.controllerPid, errorCode:failure.errorCode, resolvedAtUtc:new Date(activeAtMs).toISOString(), controllerPid:456, sessionStartedAtUtc:new Date(startedAtMs).toISOString()});
 assert.equal(fs.readFileSync(failurePath, 'utf8'), originalFailure);
 assert.equal(log.applied(), receipt);
 assert.equal(read(root, 'session-events.json').filter(event=>event.event==='startup-recovered').length, 1);
 assert.deepEqual(read(root, 'session-events.json').at(-1), {atUtc:new Date(activeAtMs).toISOString(), event:'startup-recovered', ...receipt});
 assert.equal(fs.existsSync(path.join(root, 'startup-recovery.json')), false);
});

test('application cannot resolve or overwrite a failure from a newer concurrent startup', t => {
 const {root, failurePath} = fixture(t);
 const log = logger(root);
 const newer = {schema:1, atUtc:new Date(startedAtMs + 1000).toISOString(), controllerPid:789, errorCode:'session-lock-failed'};
 fs.writeFileSync(failurePath, JSON.stringify(newer));
 assert.equal(log.applied(), null);
 assert.deepEqual(read(root, 'startup-failure.json'), newer);
 assert.equal(fs.existsSync(path.join(root, 'startup-recovery.json')), false);
 assert.equal(read(root, 'session-events.json').some(event=>event.event==='startup-recovered'), false);
});

test('recovery metadata never overwrites a failure written between reading and staging', t => {
 const {root, failurePath} = fixture(t);
 const newer = {schema:1, atUtc:new Date(startedAtMs + 1000).toISOString(), controllerPid:789, errorCode:'session-lock-failed'};
 let writeNewer = true;
 const fileSystem = {...fs, readFileSync(file, ...args) {
  const contents = fs.readFileSync(file, ...args);
  if (file === failurePath && writeNewer) { writeNewer = false; fs.writeFileSync(file, JSON.stringify(newer)); }
  return contents;
 }};
 const receipt = createSessionLog({root, startedAtMs, controllerPid:456, now:()=>activeAtMs, fileSystem}).applied();
 assert.deepEqual(read(root, 'startup-failure.json'), newer);
 // The receipt names only the earlier failure; it cannot resolve this newer record.
 assert.notEqual(receipt.failureAtUtc, newer.atUtc);
 assert.equal(fs.existsSync(path.join(root, 'startup-recovery.json')), false);
});

test('absent or invalid failure metadata never creates a recovery claim', t => {
 const {root, failurePath} = fixture(t);
 for (const value of [null, '{invalid', JSON.stringify({atUtc:'old chat text', controllerPid:123, errorCode:'secret body text'})]) {
  if (value === null) fs.unlinkSync(failurePath); else fs.writeFileSync(failurePath, value);
  const log = logger(root);
  assert.equal(log.applied(), null);
  const events=read(root, 'session-events.json');
  assert.deepEqual(events.map(event=>event.event), value==='{invalid'?['started','recovery-read-failed']:['started']);
  if(value==='{invalid')assert.equal(events.at(-1).code,'INVALID_JSON');
 }
});

test('events stay an array capped at 32 records and contain only explicit diagnostic fields', t => {
 const {root} = fixture(t);
 const log = logger(root);
 for (let attempt=1; attempt<=40; attempt++) log.record('retrying', {stage:'identity', code:'ETIMEDOUT', attempt, delayMs:5000});
 const events = read(root, 'session-events.json');
 assert.ok(Array.isArray(events));
 assert.equal(events.length, 32);
 assert.equal(events[0].attempt, 9);
 assert.equal(events.at(-1).attempt, 40);
 assert.ok(events.every(event=>!('token' in event) && !('browserId' in event) && !('webSocketDebuggerUrl' in event)));
});
