'use strict';
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = __dirname;
execFileSync(path.join(process.env.SystemRoot, 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'),
  ['/nologo', '/optimize+', '/target:exe', '/out:' + path.join(root, 'owner-check.exe'), path.join(root, 'owner-check.cs')],
  { encoding: 'utf8', windowsHide: true, timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] });
