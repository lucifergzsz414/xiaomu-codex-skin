const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
let chromium;try{({chromium}=require(process.env.XIAOMU_PLAYWRIGHT_MODULE||'playwright'));}catch(error){if(process.env.XIAOMU_PLAYWRIGHT_MODULE)throw error;}
const launchOptions={headless:true,...(process.env.XIAOMU_CHROMIUM_PATH?{executablePath:process.env.XIAOMU_CHROMIUM_PATH}:{})};
for(const width of [720,320])test('built skin decorates native settings at '+width+'px and restores the synthetic DOM',{skip:!chromium||!fs.existsSync(path.join(__dirname,'native-skin.js'))},async()=>{
 const browser=await chromium.launch(launchOptions);
 try{const page=await browser.newPage({viewport:{width,height:800}});
 await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><head><style>body{display:flex;margin:0;font:16px sans-serif}aside{width:190px}main{min-width:0;flex:1;padding:20px}svg{width:18px;height:18px}@media(max-width:600px){aside{display:none}}</style></head><body><aside class="app-shell-left-panel"><button aria-label="Appearance"><svg></svg>Appearance</button></aside><main data-app-shell-main-surface="default"><div data-settings-mobile-header="false"><header><h1>Appearance</h1></header><input id="kept" value="native draft"><button id="action">Native action</button></div></main></body></html>'}));
 await page.goto('https://fixture.invalid/settings/appearance');
 await page.evaluate(()=>{globalThis.__XIAOMU_INSTALLED_SESSION_V1__={capabilities:{core:true,sidebar:true,pages:true,panels:true,overlays:true,contextMenus:true}};globalThis.nativeClicks=0;document.querySelector('#action').onclick=()=>nativeClicks++;});
 const source=process.env.XIAOMU_QA_BASELINE==='1'?path.join(process.env.XIAOMU_QA_BASELINE_DIR,'native-skin.js'):path.join(__dirname,'native-skin.js');
 await page.addScriptTag({content:fs.readFileSync(source,'utf8')});
 assert.ok((await page.evaluate(()=>window.__XIAOMU_NATIVE_SKIN_V1__.inspect().decoratedParts)).includes('settings'));
 assert.equal(await page.locator('.xiaomu-settings-chibi').count(),1);assert.equal(await page.locator('.xiaomu-sidebar-icon').count(),width>600?1:0);await page.locator('#action').click();assert.equal(await page.evaluate(()=>nativeClicks),1);assert.equal(await page.locator('#kept').inputValue(),'native draft');
 await page.evaluate(()=>window.__XIAOMU_NATIVE_SKIN_V1__.cleanup());assert.equal(await page.locator('#xiaomu-native-style-v1').count(),0);assert.equal(await page.locator('[data-xiaomu-native-decoration]').count(),0);assert.equal(await page.locator('#kept').inputValue(),'native draft');
 }finally{await browser.close();}
});
