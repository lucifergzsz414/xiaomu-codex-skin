'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const root = __dirname;
const project = path.resolve(root, '../..');
const hash = data => createHash('sha256').update(data).digest('hex');
const inputs = [];
function read(relative, expected) {
  const bytes = fs.readFileSync(path.join(project, relative));
  const sha256 = hash(bytes);
  if (expected && expected !== sha256) throw new Error(`Asset changed: ${relative}`);
  inputs.push({ path: relative, sha256, bytes: bytes.length });
  return bytes;
}
const background = read('preview-v6/assets/hair-rig-v31/full-background/pilot-003/frame-000.png', 'dbf6e027333ad17af25deb011b9fd46d0d49a4bed5a9ea7278caf66b112b3056');
const backgroundVideo = read('preview-v6/assets/hair-rig-v31/full-background/pilot-003/window-loop.mp4', '7cc30c32c845222ace86d542242b87c71efba2363883a12ff7356c1adcfe0d33');
const posterSource = `data:image/png;base64,${background.toString('base64')}`;
const videoSource = `data:video/mp4;base64,${backgroundVideo.toString('base64')}`;
const openingVideo = read('preview-v6/pv-v1/opening-rain-final-v1/renders/review-v1/xiaomu-codex-rain-opening-5s-1080p.mp4', '9c7f8ab53b007172cf578c57e98494b6ad9e8988e4c38de65e27359cbdecf020');
const openingSource = `data:video/mp4;base64,${openingVideo.toString('base64')}`;
const portrait = read('preview-v6/assets/q-idle.png', '34a7ab3cc5d4f64d9c84a51080a738903f6b210ef3dfdb31faf0a29b88971522');
const css = read('integration-v1/native-v1/native.css').toString('utf8').replaceAll('__BACKGROUND__', () => posterSource).replaceAll('__DOT_PORTRAIT__', () => `data:image/png;base64,${portrait.toString('base64')}`);
const runtime = read('integration-v1/native-v1/runtime.js').toString('utf8').replaceAll('__BACKGROUND_VIDEO__', () => videoSource).replaceAll('__BACKGROUND__', () => posterSource).replace('__XIAOMU_SIDEBAR_RUNTIME__',()=>read('integration-v1/native-v1/sidebar.js').toString('utf8')).replace('__XIAOMU_PAGES_RUNTIME__',()=>read('integration-v1/native-v1/pages.js').toString('utf8')).replace('__XIAOMU_REVIEW_RUNTIME__',()=>read('integration-v1/native-v1/review-guest.js').toString('utf8')).replace('__XIAOMU_OVERLAYS_RUNTIME__',()=>read('integration-v1/native-v1/search-scope-adapter.js').toString('utf8')+'\n'+read('integration-v1/native-v1/overlays.js').toString('utf8')).replace('__XIAOMU_CONTEXT_MENUS_RUNTIME__',()=>read('integration-v1/native-v1/context-menus.js').toString('utf8')).replace('__XIAOMU_PANELS_RUNTIME__',()=>read('integration-v1/native-v1/panels.js').toString('utf8'));
const homeSource = read('preview-v6/index.html').toString('utf8');
const assetPins = {'q-reading.png':'365c30c18e859aa90f2c241ab4682b7a595158713adc253cddcc3200b148b1ba','q-work.png':'38f0e622e2cdec663deafb0d466b2593bcae8aec8110fe113292f4598bc6fc47','q-think.png':'fdba28adb2e5da755c89fa49707e1433fb0637476e7346aa9e5d287d9902b59a','q-idle.png':'34a7ab3cc5d4f64d9c84a51080a738903f6b210ef3dfdb31faf0a29b88971522'};
const homeCards = [...homeSource.matchAll(/<button id="native-preset-(\d)" data-prompt="([^"]+)" aria-label="([^"]+)"><span[^>]*><img src="assets\/(q-[a-z]+\.png)"[^>]*><\/span><span[^>]*><strong>([^<]+)<\/strong><small>([^<]+)<\/small><\/span><\/button>/g)].map((m,i)=>{
  if(Number(m[1])!==i||!assetPins[m[4]])throw Error('Unexpected preview recommendation');
  return {prompt:m[2],label:m[3],title:m[5],description:m[6],image:`data:image/png;base64,${read('preview-v6/assets/'+m[4],assetPins[m[4]]).toString('base64')}`};
});
if(homeCards.length!==4)throw Error('Expected four preview recommendations');
const icons = {};
for (const id of ['i-new-chat','i-folder','i-code','i-file-diff','i-settings','i-appearance','i-terminal','i-editor','i-shield','i-sidebar','i-leaf']) {
  const symbol=homeSource.match(new RegExp('<symbol id="'+id+'" viewBox="0 0 24 24">([\\s\\S]*?)</symbol>'))?.[1];
  if (!symbol || /<(?:script|foreignObject|image|use)|\bon\w+\s*=|(?:https?:|javascript:)/i.test(symbol)) throw Error('Unexpected icon source '+id);
  const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#647f54" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><style>.icon-accent{stroke:#a08b54}.icon-pink{stroke:#94616e}</style>'+symbol+'</svg>';
  icons[id]='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
}
const hubIcons={
  'i-schedule':'<circle cx="12" cy="13" r="8"/><path d="M12 8v5l3 2M9 3h6"/><path stroke="#a08b54" d="M17 5c0-3 3-3 3-3s0 3-3 3Z"/>',
  'i-plugins':'<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><path stroke="#a08b54" d="M14 21c0-7 7-7 7-7s0 7-7 7Zm0 0 4-4"/>',
  'i-sites':'<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 9h18M7 6.5h.1M10 6.5h.1"/><path stroke="#a08b54" d="M10 17c0-5 6-5 6-5s0 5-6 5Zm0 0 3-3"/>'
};
for(const [id,body] of Object.entries(hubIcons))icons[id]='data:image/svg+xml;charset=utf-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#647f54" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">'+body+'</svg>');
const menuContract=JSON.parse(read('integration-v1/native-v1/native-menu-contract.json').toString('utf8'));
if(menuContract.appVersion!=='26.1027.3384.0'||menuContract.functionName!=='Wxn'||menuContract.functionSha256!=='0b7d7527c136309985822313072fe9338e2187078dd26f4afcfecbc88cfbec84'||menuContract.functionLength!==12391||menuContract.layout!=='codex-3384')throw Error('Unreviewed native menu contract');
const nativeMenu=Object.fromEntries(['appVersion','functionName','functionSha256','functionLength','layout'].map(key=>[key,menuContract[key]]));
read('integration-v1/native-v1/menu-profile-validation.cjs');
const {reviewedNativeMenus}=require('./menu-profile-validation.cjs');
const nativeMenus=reviewedNativeMenus(JSON.parse(read('integration-v1/native-v1/native-menu-profiles.json').toString('utf8')));
const config = { css, portrait: `data:image/png;base64,${portrait.toString('base64')}`, homeCards, icons, nativeMenu, nativeMenus, openingVideo: openingSource };
const bundle = runtime.replace('__XIAOMU_OPENING_RUNTIME__', () => read('integration-v1/native-v1/opening-player.js').toString('utf8')).replace('__XIAOMU_NATIVE_CONFIG__', () => JSON.stringify(config));
if (/__(?:BACKGROUND(?:_VIDEO|_MOTION)?|DOT_PORTRAIT|XIAOMU_[A-Z_]+)\b/.test(bundle)) throw Error('Unresolved native bundle input');
new Function(bundle); // Syntax check; no application access.
fs.writeFileSync(path.join(root, 'native-skin.js'), bundle);
fs.writeFileSync(path.join(root, 'build-manifest.json'), JSON.stringify({ schema: 1, scope: 'offline candidate, no installation', inputs, output: { path: 'native-skin.js', sha256: hash(bundle), bytes: Buffer.byteLength(bundle) } }, null, 2));
console.log('Built native candidate with pinned existing assets; no application access.');
