'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {execFileSync} = require('node:child_process');
const {createOpeningGate, openingTargetExpression, applyExpression} = require('./engine.cjs');

assert.equal(typeof createOpeningGate, 'function', 'opening gate must be exported');
assert.equal(typeof openingTargetExpression, 'string', 'ordinary-workspace expression must be exported');
const parent = __dirname;
const scratch = fs.mkdtempSync(path.join(parent, '.opening-test-'));
const checks = [];
const now = Date.parse('2026-10-28T09:30:00.000Z');
const identity = {pid:1200, startUtc:'2026-10-28T09:29:59.0000000Z', session:1,
  openingEligible:true, launchRequestedAtUtc:'2026-10-28T09:29:59.500Z'};
function area(name) { const root=path.join(scratch,name);fs.mkdirSync(root);return root; }
function gate(root, changes={}, options={}) {
  return createOpeningGate({root, identity:{...identity,...changes}, now:()=>now, ...options});
}
function check(name, body) { body();checks.push({name,passed:true}); }
function context() {
  return {...workspace(),window:{}};
}
function workspace(changes={}) {
  const main={closest:()=>null,querySelectorAll:()=>[],getBoundingClientRect:()=>({width:900,height:700,bottom:740,right:1100,top:40,left:200})};
  return {navigator:{userActivation:{hasBeenActive:false}},document:{visibilityState:'visible',hidden:false,hasFocus:()=>true,
    querySelectorAll:selector=>selector==='aside.app-shell-left-panel'?[{}]:[],
    querySelector:selector=>selector.includes('main:')?main:null,...changes},
    getComputedStyle:()=>({display:'block',visibility:'visible',opacity:'1'}),
    innerWidth:1200,innerHeight:800};
}
try {
  check('manager enables opening only after its actual cold-start command succeeds',()=>{
    // Execute only the three AST-selected launch statements with a fake start
    // function. The manager entry point and Windows/Codex discovery never run.
    const manager=path.join(__dirname,'manager.ps1').replaceAll("'","''");
    const script=`$ErrorActionPreference='Stop'
$tokens=$null;$parseErrors=$null
$ast=[System.Management.Automation.Language.Parser]::ParseFile('${manager}',[ref]$tokens,[ref]$parseErrors)
if($parseErrors.Count){throw 'Manager parse failed'}
$assignments=@($ast.FindAll({param($n) $n -is [System.Management.Automation.Language.AssignmentStatementAst] -and $n.Left -is [System.Management.Automation.Language.VariableExpressionAst] -and $n.Left.VariablePath.UserPath -ceq 'openingEligible'},$true))
if($assignments.Count -ne 2 -or $assignments[0].Right.Extent.Text -cne '$false' -or $assignments[1].Right.Extent.Text -cne '$true'){throw 'Opening qualification assignments changed'}
$start=@($ast.FindAll({param($n) $n -is [System.Management.Automation.Language.CommandAst] -and $n.GetCommandName() -ceq 'Start-DreamSkinCodex' -and $n.Extent.Text.Contains('--remote-debugging-port=9335')},$true))
if($start.Count -ne 1){throw 'Cold-start command is ambiguous'}
$statement=$start[0]
while($statement -and $statement -isnot [System.Management.Automation.Language.AssignmentStatementAst]){$statement=$statement.Parent}
$block=$statement.Parent
if($block -ne $assignments[1].Parent -or $block.Parent -isnot [System.Management.Automation.Language.IfStatementAst] -or $block.Parent.Clauses[0].Item1.Extent.Text -notmatch 'Get-UiRows.*Count -eq 0'){throw 'Opening qualification escaped the empty-client branch'}
$statements=@($block.Statements);$index=[array]::IndexOf($statements,$statement)
if($index -lt 1 -or $index+1 -ge $statements.Count){throw 'Cold-start statement range changed'}
$code=($statements[($index-1)..($index+1)]|ForEach-Object{$_.Extent.Text}) -join [Environment]::NewLine
function Invoke-Scenario([bool]$fail){
 $openingEligible=$false;$launchRequestedAtUtc=$null;$codex=[pscustomobject]@{}
 function Start-DreamSkinCodex {param($Codex,$Arguments) if($fail){throw 'fixture-start-failed'};return $true}
 $failed=$false
 try{. ([scriptblock]::Create($code))}catch{if($_.Exception.Message -cne 'fixture-start-failed'){throw};$failed=$true}
 [pscustomobject]@{eligible=[bool]$openingEligible;requested=[bool]$launchRequestedAtUtc;failed=$failed}
}
[pscustomobject]@{success=(Invoke-Scenario $false);failure=(Invoke-Scenario $true)}|ConvertTo-Json -Compress
`;
    const answer=JSON.parse(execFileSync(path.join(process.env.SystemRoot||'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe'),
      ['-NoProfile','-NonInteractive','-Command',script],{encoding:'utf8',timeout:10000,windowsHide:true}).trim());
    assert.deepEqual(answer.success,{eligible:true,requested:true,failed:false});
    assert.deepEqual(answer.failure,{eligible:false,requested:true,failed:true});
  });
  check('attach or old identity is closed by default without ledger access',()=>{
    const root=area('attach');
    for(const openingEligible of [undefined,false,'true',1]) {
      const current=gate(root,{openingEligible});assert.equal(current.pending(),false);
      assert.equal(current.claim(true),null);
    }
    assert.deepEqual(fs.readdirSync(root),[]);
  });
  check('cold startup claims once only after an ordinary workspace is visible',()=>{
    const root=area('cold'), current=gate(root);
    assert.equal(current.pending(),true);
    const claim=current.claim(true);assert.equal(claim.eligible,true);assert.match(claim.hostKey,/^[a-f0-9]{64}$/);
    const ledger=JSON.parse(fs.readFileSync(path.join(root,'opening-state.json'),'utf8'));
    assert.equal(ledger.hostKey,claim.hostKey);assert.equal(ledger.consumed,true);assert.equal(ledger.schema,1);
    assert.equal(current.pending(),false);assert.equal(current.claim(true),null);
    assert.deepEqual(fs.readdirSync(root),['opening-state.json']);
  });
  check('another controller and renderer reload cannot replay the same host',()=>{
    const root=area('controller');const first=gate(root).claim(true);assert.ok(first);
    assert.equal(gate(root).claim(true),null);assert.equal(gate(root).claim(true),null);
  });
  check('a distinct verified host can claim independently of skin version',()=>{
    const root=area('new-host'), first=gate(root,{skinVersion:'1.0.0'}).claim(true);
    const second=gate(root,{pid:1201,startUtc:'2026-10-28T09:29:59.1000000Z',skinVersion:'1.0.1'}).claim(true);
    assert.ok(first&&second);assert.notEqual(first.hostKey,second.hostKey);
    assert.equal(gate(root,{pid:1201,startUtc:'2026-10-28T09:29:59.1000000Z',skinVersion:'2.0.0'}).claim(true),null);
  });
  check('host binding includes session as well as process ID and birth time',()=>{
    const root=area('session'), first=gate(root).claim(true), second=gate(root,{session:2}).claim(true);
    assert.ok(first&&second);assert.notEqual(first.hostKey,second.hostKey);
  });
  check('late startup and far-future timestamp skip before touching storage',()=>{
    const root=area('late');
    assert.equal(gate(root,{launchRequestedAtUtc:'2026-10-28T09:28:59.999Z'}).claim(true),null);
    assert.equal(gate(root,{launchRequestedAtUtc:'2026-10-28T09:30:02.001Z'}).claim(true),null);
    assert.equal(gate(root,{launchRequestedAtUtc:'not-a-date'}).claim(true),null);
    assert.deepEqual(fs.readdirSync(root),[]);
    assert.ok(gate(root,{launchRequestedAtUtc:'2026-10-28T09:29:00.000Z'}).claim(true));
  });
  check('small clock skew is accepted but expired eligibility is rechecked at claim',()=>{
    const root=area('clock');
    assert.ok(gate(root,{launchRequestedAtUtc:'2026-10-28T09:30:02.000Z'}).claim(true));
    const other=area('clock-expiry');let clock=now;
    const current=gate(other,{}, {now:()=>clock});assert.equal(current.pending(),true);
    clock+=60000;assert.equal(current.claim(true),null);assert.deepEqual(fs.readdirSync(other),[]);
  });
  check('invalid host identities never become eligible',()=>{
    const root=area('invalid');
    for(const changes of [{pid:0},{pid:1.5},{session:-1},{session:'1'},{startUtc:'invalid'},{launchRequestedAtUtc:123}]) {
      assert.equal(gate(root,changes).claim(true),null);
    }
    assert.deepEqual(fs.readdirSync(root),[]);
  });
  check('corrupt or unsupported ledger is left intact and disables opening',()=>{
    for(const [index,bytes] of ['{bad',JSON.stringify({schema:2,hostKey:'a'.repeat(64),consumed:true}),JSON.stringify({schema:1,hostKey:'a'.repeat(64),consumed:false})].entries()) {
      const root=area('corrupt-'+index), file=path.join(root,'opening-state.json');fs.writeFileSync(file,bytes);
      const current=gate(root);assert.equal(current.claim(true),null);assert.equal(current.claim(true),null);
      assert.equal(fs.readFileSync(file,'utf8'),bytes);
    }
  });
  check('read failure fails closed and does not retry in the controller',()=>{
    const root=area('read-fail');let reads=0;
    const io={...fs,readFileSync(){reads++;throw Object.assign(Error('denied'),{code:'EACCES'});}};
    const current=gate(root,{}, {fileSystem:io});assert.equal(current.claim(true),null);
    assert.equal(current.claim(true),null);assert.equal(reads,1);assert.deepEqual(fs.readdirSync(root),[]);
  });
  check('write failure fails closed and does not grant another target a retry',()=>{
    const root=area('write-fail');let writes=0;
    const io={...fs,writeFileSync(){writes++;throw Object.assign(Error('denied'),{code:'EACCES'});}};
    const current=gate(root,{}, {fileSystem:io});assert.equal(current.claim(true),null);
    assert.equal(current.claim(true),null);assert.equal(writes,1);assert.deepEqual(fs.readdirSync(root),[]);
  });
  check('rename failure preserves previous ledger and cleans its own temporary file',()=>{
    const root=area('rename-fail');gate(root).claim(true);const file=path.join(root,'opening-state.json'), bytes=fs.readFileSync(file);
    const io={...fs,renameSync(){throw Object.assign(Error('denied'),{code:'EACCES'});}};
    assert.equal(gate(root,{pid:1201},{fileSystem:io}).claim(true),null);
    assert.deepEqual(fs.readFileSync(file),bytes);assert.deepEqual(fs.readdirSync(root),['opening-state.json']);
  });
  check('only focused visible ordinary main workspace matches, never Dot or hidden',()=>{
    assert.equal(vm.runInNewContext(openingTargetExpression,workspace()),true);
    for(const changes of [{hidden:true},{visibilityState:'hidden'},{hasFocus:()=>false},
      {querySelector:selector=>selector.includes('data-orbit-profile-identity')?{}:null},
      {querySelectorAll:()=>[]}]) assert.equal(vm.runInNewContext(openingTargetExpression,workspace(changes)),false);
    const small=workspace();small.getComputedStyle=()=>({display:'none',visibility:'visible',opacity:'1'});
    assert.equal(vm.runInNewContext(openingTargetExpression,small),false);
  });
  check('old applyExpression signature carries no playback context',()=>{
    const ctx=context();vm.runInNewContext(applyExpression('window.__XIAOMU_NATIVE_SKIN_V1__={inspect:()=>({})};','old'),ctx);
    assert.equal(ctx.window.__XIAOMU_INSTALLED_SESSION_V1__.opening,null);
  });
  check('only a valid claimed context is serialized and duplicate apply keeps the first session',()=>{
    const ctx=context(), opening={eligible:true,hostKey:'b'.repeat(64)};
    vm.runInNewContext(applyExpression('window.__XIAOMU_NATIVE_SKIN_V1__={inspect:()=>({})};','new',null,'','',opening),ctx);
    assert.equal(ctx.window.__XIAOMU_INSTALLED_SESSION_V1__.opening.hostKey,opening.hostKey);
    vm.runInNewContext(applyExpression('throw Error("must not run");','new',null,'','',null),ctx);
    assert.equal(ctx.window.__XIAOMU_INSTALLED_SESSION_V1__.opening.hostKey,opening.hostKey);
    const invalid=context();vm.runInNewContext(applyExpression('','invalid',null,'','',{eligible:true,hostKey:'bad'}),invalid);
    assert.equal(invalid.window.__XIAOMU_INSTALLED_SESSION_V1__.opening,null);
  });
  check('failed renderer injection remains consumed across controller reconstruction',()=>{
    const root=area('injection-fail'), opening=gate(root).claim(true), ctx=context();
    assert.throws(()=>vm.runInNewContext(applyExpression('throw Error("fixture");','fail',null,'','',opening),ctx));
    assert.equal(ctx.window.__XIAOMU_INSTALLED_SESSION_V1__,undefined);
    assert.equal(gate(root).claim(true),null);
  });
  console.log(JSON.stringify({scope:'offline opening lifecycle, synthetic hosts and local temporary ledgers; no Codex or CDP access',passed:checks.length,checks},null,2));
} finally {
  const absolute=path.resolve(scratch);
  if(path.dirname(absolute)!==path.resolve(parent)||!path.basename(absolute).startsWith('.opening-test-'))throw Error('Unsafe fixture cleanup path');
  fs.rmSync(absolute,{recursive:true,force:true});
}
