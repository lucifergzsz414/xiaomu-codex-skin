'use strict';
const fs=require('node:fs');const path=require('node:path');const {createHash}=require('node:crypto');
const root=__dirname;const pkg=path.join(root,'package');const project=path.resolve(root,'../..');
fs.mkdirSync(pkg,{recursive:true});const hash=b=>createHash('sha256').update(b).digest('hex');
require('./build-owner-check.cjs');
require('./build-control-host.cjs');
const files={};
copy(path.join(root,'maintenance.ps1'),'maintenance.ps1');
function copy(source,name,pin){const bytes=fs.readFileSync(source);const sha=hash(bytes);if(pin&&sha!==pin)throw Error('Release source changed: '+name);fs.writeFileSync(path.join(pkg,name),bytes);files[name]=sha;}
for(const name of ['manager.ps1','engine.cjs','guardian-compat.cjs','caption-contrast.cjs','owner-check.exe','launch.vbs','restore.vbs','restore.ps1','entrypoints.ps1','compatibility.cjs','compatibility-contract.json','control-center.ps1','control-actions.ps1','manage.vbs','install.ps1','XiaomuSkinManager.exe'])copy(path.join(root,name),name);
copy(path.join(project,'preview-v6/assets/q-idle.png'),'manager-portrait.png','34a7ab3cc5d4f64d9c84a51080a738903f6b210ef3dfdb31faf0a29b88971522');
copy(path.join(root,'USAGE.md'),'USAGE.md');
copy(path.join(root,'xiaomu.ico'),'xiaomu.ico');
copy(path.join(root,'../native-v1/native-skin.js'),'skin.js','6ddb217b9193233bd2027b925d9972a442cf68306f63cd0d63b79680ad44eaed');
copy(path.join(project,'research/internet-angel/windows/scripts/common-windows.ps1'),'common-windows.ps1','288af44b5c2d4b6f855f48676a3df7ea439d954e7e369ba270658bdbde23c84b');
copy(path.join(project,'research/internet-angel/windows/scripts/config-utf8.ps1'),'config-utf8.ps1','3a9ff2daf1cf998a9e1b7bb443845f2fc1f60df8c02171fbde3f8d12e9be3f75');
copy(path.join(project,'research/internet-angel/LICENSE'),'LICENSE-upstream.txt');
fs.writeFileSync(path.join(pkg,'manifest.json'),JSON.stringify({id:'xiaomu-codex-skin',version:'1.0.0',releaseChannel:'invited-beta',releaseLabel:'1.0.0-beta.2',candidateId:'20261031-3384-rc2',codexVersion:'component-detected',validatedCodexVersion:'26.1027.3384.0',installedMethod:'managed-user-shortcuts',files},null,2));
console.log(JSON.stringify({package:pkg,files:Object.keys(files).length}));
