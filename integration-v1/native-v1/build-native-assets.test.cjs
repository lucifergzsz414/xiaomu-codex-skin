'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const vm=require('node:vm');
const {createRequire}=require('node:module');
const {createHash}=require('node:crypto');

const buildPath=path.join(__dirname,'build-native.cjs');
const buildRequire=createRequire(buildPath),outputs=new Map();
// Run the actual compiler against real inputs without racing other tests that
// read the generated bundle from disk.
vm.runInNewContext(fs.readFileSync(buildPath,'utf8'),{
  __dirname,Buffer,console:{log(){}},
  require:id=>id==='node:fs'?{...fs,writeFileSync(file,data){outputs.set(path.basename(file),String(data));}}:buildRequire(id),
},{filename:buildPath,timeout:15000});
const bundle=outputs.get('native-skin.js');
assert.equal(typeof bundle,'string');
const configLine=bundle.match(/const config = (\{[^\r\n]+\});/);
assert.ok(configLine,'The build contains its native renderer configuration');
const {css}=JSON.parse(configLine[1]);
const portrait=fs.readFileSync(path.resolve(__dirname,'../../preview-v6/assets/q-idle.png'));
const portraitUri='data:image/png;base64,'+portrait.toString('base64');
const portraitHash='34a7ab3cc5d4f64d9c84a51080a738903f6b210ef3dfdb31faf0a29b88971522';
const hash=data=>createHash('sha256').update(data).digest('hex');

test('native CSS stores the pinned portrait only once',()=>{
  assert.equal(css.split(portraitUri).length-1,1);
});

test('all five portrait paints resolve to the same pinned image and original sizing',()=>{
  const resource=css.match(/html\[data-xiaomu-native-skin="v1"\]\s*\{[^}]*--xm-native-portrait-image:\s*(url\("([^"]+)"\));/);
  assert.ok(resource,'The image resource belongs to the existing skin root');
  assert.equal(hash(Buffer.from(resource[2].split(',')[1],'base64')),portraitHash);
  assert.equal(css.match(/var\(--xm-native-portrait-image\)/g)?.length,5);
  const resolved=css.replaceAll('var(--xm-native-portrait-image)',resource[1]);
  const paints=[...resolved.matchAll(/(background(?:-image)?|content)\s*:\s*url\("([^"]+)"\)([^;]*);/g)]
    .filter(match=>match[2]===portraitUri)
    .map(match=>match[1]+':<portrait>'+match[3]);
  assert.deepEqual(paints,[
    'background:<portrait> center top / contain no-repeat',
    'content:<portrait>',
    'background:<portrait> center / contain no-repeat',
    'background:<portrait> center / contain no-repeat',
    'background-image:<portrait>',
  ]);
});

test('the background poster remains a single unchanged embedded image',()=>{
  const hashes=[...css.matchAll(/data:image\/png;base64,([A-Za-z0-9+/=]+)/g)]
    .map(match=>hash(Buffer.from(match[1],'base64')));
  assert.equal(hashes.filter(value=>value==='dbf6e027333ad17af25deb011b9fd46d0d49a4bed5a9ea7278caf66b112b3056').length,1);
  assert.equal(hash(portrait),portraitHash);
});
