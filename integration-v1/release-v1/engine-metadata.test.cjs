'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { writeSessionMetadata } = require('./engine.cjs');

function fixture(t) {
 const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xiaomu-metadata-'));
 t.after(() => {
  for (const name of fs.readdirSync(root)) fs.unlinkSync(path.join(root, name));
  fs.rmdirSync(root);
 });
 const name = 'session-events.json';
 const destination = path.join(root, name);
 const previous = '[{"event":"reconnected","recoveryCount":1}]';
 fs.writeFileSync(destination, previous);
 return { root, name, destination, previous };
}

test('metadata replaces the old JSON after staging the exact payload beside it', t => {
 const { root, name, destination, previous } = fixture(t);
 const value = [{ event: 'retrying', code: 'ETIMEDOUT', delayMs: 5000 }];
 let staged;
 const fileSystem = {
  ...fs,
  renameSync(from, to) {
   staged = { from, to, previous: fs.readFileSync(destination, 'utf8') };
   fs.renameSync(from, to);
  }
 };

 assert.equal(writeSessionMetadata(root, name, value, fileSystem), true);
 assert.equal(path.dirname(staged.from), root);
 assert.notEqual(staged.from, destination);
 assert.equal(staged.to, destination);
 assert.equal(staged.previous, previous);
 assert.deepEqual(JSON.parse(fs.readFileSync(destination, 'utf8')), value);
 assert.deepEqual(fs.readdirSync(root), [name]);
});

test('a partial staging write leaves the prior metadata and removes the partial file', t => {
 const { root, name, destination, previous } = fixture(t);
 const fileSystem = {
  ...fs,
  writeFileSync(file, _data, options) {
   fs.writeFileSync(file, '[', options);
   throw Object.assign(new Error('simulated partial write'), { code: 'ENOSPC' });
  }
 };

 assert.equal(writeSessionMetadata(root, name, [], fileSystem), false);
 assert.equal(fs.readFileSync(destination, 'utf8'), previous);
 assert.deepEqual(fs.readdirSync(root), [name]);
});

test('a blocked rename preserves the prior metadata and an unrelated temp file', t => {
 const { root, name, destination, previous } = fixture(t);
 const unrelated = 'unrelated.tmp';
 fs.writeFileSync(path.join(root, unrelated), 'keep');
 const fileSystem = {
  ...fs,
  renameSync() {
   throw Object.assign(new Error('simulated blocked rename'), { code: 'EPERM' });
  }
 };

 assert.equal(writeSessionMetadata(root, name, [], fileSystem), false);
 assert.equal(fs.readFileSync(destination, 'utf8'), previous);
 assert.equal(fs.readFileSync(path.join(root, unrelated), 'utf8'), 'keep');
 assert.deepEqual(fs.readdirSync(root).sort(), [name, unrelated]);
});

test('exclusive staging leaves a colliding file owned by another writer', t => {
 const { root, name, destination, previous } = fixture(t);
 let collision;
 const fileSystem = {
  ...fs,
  openSync(file, flags) {
   collision = file;
   fs.writeFileSync(collision, 'other writer');
   return fs.openSync(file, flags);
  }
 };

 assert.equal(writeSessionMetadata(root, name, [], fileSystem), false);
 assert.equal(fs.readFileSync(destination, 'utf8'), previous);
 assert.equal(fs.readFileSync(collision, 'utf8'), 'other writer');
});
