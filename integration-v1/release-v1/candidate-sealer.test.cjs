'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const windows=process.platform==='win32',root=__dirname,taskRoot=path.resolve(root,'../../../..');
const powershell=windows?path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'):'';
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const acceptanceFields=['independentCleanWindowsVerified','standalonePackageColdStartVerified','installedHotUpdateVerified','liveCompatibilityVerified','realSearchAndMenuInteractionsVerified','installedOpeningUserConfirmed','terminalVisualVerified','repositoryAccessApprovalVisualVerified','repositoryAccessApprovalActionVerified','commandExecutionApprovalVerified','fileDiffVerified','realSearchInteractionsVerified','searchScopeMemoryUserConfirmed','realContextMenuInteractionsVerified'];
function run(command,args,cwd){const env={...process.env};delete env.NODE_TEST_CONTEXT;if(command===powershell)env.PSModulePath=[path.join(process.env.ProgramFiles,'WindowsPowerShell/Modules'),path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/Modules')].join(path.delimiter);return spawnSync(command,args,{cwd,encoding:'utf8',windowsHide:true,timeout:30000,env});}
function requireSuccess(result){assert.equal(result.status,0,result.stdout+'\n'+result.stderr);return result.stdout;}
function json(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(value,null,2));}
function fixture(){
 const base=fs.mkdtempSync(path.join(taskRoot,'candidate-sealer-test-')),project=path.join(base,'source'),scripts=path.join(project,'integration-v1/release-v1'),native=path.join(project,'integration-v1/native-v1'),pkg=path.join(scripts,'package');
 fs.mkdirSync(pkg,{recursive:true});fs.mkdirSync(native,{recursive:true});
 for(const file of ['prepare-release-candidate.ps1','validate-release-source.ps1'])fs.copyFileSync(path.join(root,file),path.join(scripts,file));
 for(const file of ['START-HERE.md','CLEAN-TEST-GUIDE.md','clean-environment-check.ps1','RELEASE-NOTES-6628-rc2.md','ASSET-SOURCES.md'])fs.writeFileSync(path.join(scripts,file),'fixture document\n');
 const files={},skin='fixture skin',engine='fixture engine';
 for(const file of ['skin.js','engine.cjs',...Array.from({length:22},(_,i)=>'managed-'+i+'.txt')]){const bytes=Buffer.from(file==='skin.js'?skin:file==='engine.cjs'?engine:'fixture '+file);fs.writeFileSync(path.join(pkg,file),bytes);files[file]=sha(bytes);}
 fs.writeFileSync(path.join(scripts,'engine.cjs'),engine);fs.writeFileSync(path.join(native,'native-skin.js'),skin);
 fs.writeFileSync(path.join(native,'build-native.cjs'),"require('node:fs').writeFileSync(require('node:path').join(__dirname,'native-skin.js'),'fixture skin');\n");
 fs.writeFileSync(path.join(native,'fixture.test.cjs'),"const {test}=require('node:test');for(let i=0;i<17;i++)test('fixture '+i,()=>{});\n");
 const candidateId='20261113-6628-rc2',releaseLabel='6628-rc2',evidencePath='qa/results/local-acceptance.json';
 const evidence={schema:1,candidateId,validatedCodexVersion:'26.1106.6628.0',skinSHA256:files['skin.js'],engineSHA256:files['engine.cjs'],acceptance:Object.fromEntries(acceptanceFields.map(field=>[field,['installedHotUpdateVerified','liveCompatibilityVerified','realSearchInteractionsVerified','searchScopeMemoryUserConfirmed'].includes(field)])),localAcceptance:{scope:'fixture scope',compatibility:'fixture compatibility',process:'fixture process',draft:'fixture draft'},syntheticSurfaceAcceptance:{scope:'fixture surfaces',home:'fixture home',settings:'fixture settings',diff:'fixture diff'},remaining:['Cold start pending']};
 const evidenceFile=path.join(project,evidencePath);json(evidenceFile,evidence);
 const release={schema:1,candidateId,releaseLabel,releaseChannel:'local-test',runtimeVersion:'1.0.0',validatedCodexVersion:evidence.validatedCodexVersion,skinSHA256:evidence.skinSHA256,engineSHA256:evidence.engineSHA256,sourceTestCount:17,localAcceptancePath:evidencePath,localAcceptanceSHA256:sha(fs.readFileSync(evidenceFile))};
 const releaseFile=path.join(scripts,'release-candidate.json');json(releaseFile,release);
 json(path.join(pkg,'manifest.json'),{id:'xiaomu-codex-skin',version:'1.0.0',releaseLabel,releaseChannel:'local-test',candidateId,validatedCodexVersion:evidence.validatedCodexVersion,files});
 function commit(){requireSuccess(run('git',['-c','core.fsmonitor=false','add','.'],project));requireSuccess(run('git',['-c','core.fsmonitor=false','-c','core.hooksPath='+path.join(base,'empty-hooks'),'-c','commit.gpgsign=false','-c','user.name=Candidate Fixture','-c','user.email=candidate@invalid.example','commit','-qm','fixture'],project));return requireSuccess(run('git',['rev-parse','HEAD'],project)).trim();}
 requireSuccess(run('git',['init','--quiet',project],base));fs.mkdirSync(path.join(base,'empty-hooks'));let sourceCommit=commit();
 const reportFile=path.join(base,'validation.json');
 function report(changes={}){json(reportFile,{schema:1,candidateId,sourceCommit,tests:17,passed:17,failed:0,skipped:0,skinSHA256:files['skin.js'],engineSHA256:files['engine.cjs'],...changes});}
 report();
 return {base,project,scripts,pkg,release,releaseFile,evidence,evidenceFile,reportFile,report,commit:()=>{sourceCommit=commit();report();},seal:()=>run(powershell,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(scripts,'prepare-release-candidate.ps1'),'-OutputDirectory',path.join(base,'out'),'-ValidationReport',reportFile],project),validate:()=>run(powershell,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(scripts,'validate-release-source.ps1'),'-OutputFile',reportFile],project),cleanup:()=>{const absolute=path.resolve(base),prefix=path.resolve(taskRoot)+path.sep;if(!absolute.startsWith(prefix)||!path.basename(absolute).startsWith('candidate-sealer-test-'))throw Error('Unexpected fixture cleanup target');fs.rmSync(absolute,{recursive:true,force:true});}};
}

test('both source validation and sealing use the configured test count and current evidence', {skip:!windows},()=>{
 const f=fixture();try{
  requireSuccess(f.validate());assert.equal(JSON.parse(fs.readFileSync(f.reportFile)).tests,17);
  const result=JSON.parse(requireSuccess(f.seal())),bundle=result.zip.slice(0,-4),receipt=JSON.parse(fs.readFileSync(path.join(bundle,'RELEASE-CANDIDATE.json')));
  assert.equal(result.entries,32);assert.equal(receipt.sourceCandidateAcceptance.tests,17);
  for(const field of acceptanceFields)assert.equal(receipt[field],f.evidence.acceptance[field]);
  assert.equal(receipt.realSearchAndMenuInteractionsVerified,false);assert.equal(receipt.realSearchInteractionsVerified,true);
  assert.deepEqual(receipt.localAcceptance,f.evidence.localAcceptance);assert.deepEqual(receipt.remaining,f.evidence.remaining);
  assert.ok(fs.existsSync(path.join(bundle,'skin/RELEASE-NOTES-6628-rc2.md')));assert.equal(fs.existsSync(path.join(bundle,'skin/RELEASE-NOTES-6628-rc1.md')),false);
 }finally{f.cleanup();}
});

test('invalid configured counts and a mismatched source report are rejected before sealing',{skip:!windows},()=>{
 const f=fixture();try{
  f.release.sourceTestCount='17';json(f.releaseFile,f.release);f.commit();
  const invalid=f.validate();assert.notEqual(invalid.status,0);assert.match(invalid.stdout+invalid.stderr,/source test count/i);
  f.release.sourceTestCount=17;json(f.releaseFile,f.release);f.commit();f.report({tests:16,passed:16});
  const mismatch=f.seal();assert.notEqual(mismatch.status,0);assert.match(mismatch.stdout+mismatch.stderr,/Source validation does not match/);assert.equal(fs.existsSync(path.join(f.base,'out')),false);
 }finally{f.cleanup();}
});

test('local acceptance bytes and candidate identity must match their committed pins',{skip:!windows},()=>{
 const f=fixture();try{
  f.evidence.acceptance.realContextMenuInteractionsVerified=true;json(f.evidenceFile,f.evidence);f.commit();
  const mismatch=f.seal();assert.notEqual(mismatch.status,0);assert.match(mismatch.stdout+mismatch.stderr,/local acceptance.*hash/i);
  f.release.localAcceptanceSHA256=sha(fs.readFileSync(f.evidenceFile));f.evidence.candidateId='20261112-6628-rc1';json(f.evidenceFile,f.evidence);f.release.localAcceptanceSHA256=sha(fs.readFileSync(f.evidenceFile));json(f.releaseFile,f.release);f.commit();
  const stale=f.seal();assert.notEqual(stale.status,0);assert.match(stale.stdout+stale.stderr,/local acceptance.*identity/i);
 }finally{f.cleanup();}
});

test('release notes and local acceptance paths cannot escape the candidate sources',{skip:!windows},()=>{
 const f=fixture();try{
  f.release.releaseLabel='../unsafe';json(f.releaseFile,f.release);f.commit();
  const label=f.seal();assert.notEqual(label.status,0);assert.match(label.stdout+label.stderr,/release label/i);
  f.release.releaseLabel='6628-rc2';f.release.localAcceptancePath='../outside.json';json(f.releaseFile,f.release);f.commit();
  const traversal=f.seal();assert.notEqual(traversal.status,0);assert.match(traversal.stdout+traversal.stderr,/local acceptance path/i);assert.equal(fs.existsSync(path.join(f.base,'out')),false);
 }finally{f.cleanup();}
});
