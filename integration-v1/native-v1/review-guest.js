/* Only the observed Code Review onboarding, inside its pinned native guest. */
function styleReviewGuest({token,portrait,remove=false}) {
  const doc=document.querySelector('iframe#root')?.contentDocument;
  if(!doc)return false;
  const key='__XIAOMU_REVIEW_ONBOARDING_V1__',old=doc.defaultView[key];
  if(remove){if(old?.token===token)old.clear();return true;}
  if(old)return old.token===token;
  if(!/^data:image\/png;base64,/.test(portrait))return false;
  const headings=[...doc.querySelectorAll('main h1')].filter(n=>n.textContent.trim()==='Code review');
  if(headings.length!==1)return false;
  const heading=headings[0],main=heading.closest('main.bg-surface.text-default'),hero=heading.parentElement?.parentElement;
  if(!main||!hero||hero.parentElement!==main||!main.querySelector('canvas[aria-hidden="true"]')||main.querySelector('form,input'))return false;
  const actions=[...main.querySelectorAll('button')];
  if(actions.length!==2||!actions.some(n=>n.textContent.includes('Set up GitHub'))||!actions.some(n=>n.textContent.includes('Set up GitLab')))return false;
  if(main.hasAttribute('data-xiaomu-review-onboarding'))return false;
  const logo=hero.querySelector(':scope > img'),style=doc.createElement('style'),image=doc.createElement('img'),note=doc.createElement('p');
  style.textContent='[data-xiaomu-review-onboarding]{background:#f8faf3!important;color:#2e4939!important;display:flex!important;flex-direction:column;justify-content:flex-start!important;overflow-y:auto!important;padding:24px!important;min-height:0!important}[data-xiaomu-review-onboarding]>canvas{display:none!important}[data-xiaomu-review-onboarding]>div{flex:none;margin-block:auto;width:min(100%,448px);padding:24px;border:1px solid #cad9bd;border-radius:12px;background:#fffef9;gap:16px!important}[data-xiaomu-review-onboarding] :is(h1,p){color:inherit!important}[data-xiaomu-review-onboarding] h1{font-size:28px;line-height:1.3}[data-xiaomu-review-onboarding] p{font-size:15px;line-height:1.6;overflow-wrap:anywhere}[data-xiaomu-review-onboarding] button{max-width:100%;white-space:normal;overflow-wrap:anywhere;min-height:40px;background:#48694e!important;color:#fffef9!important;border:1px solid #cad9bd}[data-xiaomu-review-logo]{display:none!important}.xiaomu-review-portrait{width:72px;height:84px;object-fit:contain;pointer-events:none}.xiaomu-review-note{color:#627463!important;margin:0;font-size:13px!important}@media(max-width:420px){[data-xiaomu-review-onboarding]{padding:12px!important}[data-xiaomu-review-onboarding]>div{padding:16px}[data-xiaomu-review-onboarding] h1{font-size:24px}}';
  image.className='xiaomu-review-portrait';image.src=portrait;image.alt='';image.setAttribute('aria-hidden','true');image.draggable=false;
  note.className='xiaomu-review-note';note.textContent='改过的地方，再看一遍。';
  main.setAttribute('data-xiaomu-review-onboarding',token);logo?.setAttribute('data-xiaomu-review-logo',token);doc.head.append(style);hero.prepend(image);hero.append(note);
  const state={token,clear(){observer.disconnect();style.remove();image.remove();note.remove();if(main.getAttribute('data-xiaomu-review-onboarding')===token)main.removeAttribute('data-xiaomu-review-onboarding');if(logo?.getAttribute('data-xiaomu-review-logo')===token)logo.removeAttribute('data-xiaomu-review-logo');if(doc.defaultView[key]===state)delete doc.defaultView[key];}};
  const observer=new doc.defaultView.MutationObserver(()=>{if(!main.isConnected||!heading.isConnected||heading.textContent.trim()!=='Code review'||main.querySelector('form,input')||actions.some(n=>!n.isConnected||!main.contains(n)))state.clear()});observer.observe(doc.body,{childList:true,characterData:true,subtree:true});doc.defaultView[key]=state;return true;
}
function createReviewSkin() {
  let binding=null;
  const host='mcp-app-acf13b2df4c9e0f99abe2abf58680f0b76b98b7ed5db1979.web-sandbox.oaiusercontent.com';
  const run=(item,remove=false)=>item.view.executeJavaScript('('+styleReviewGuest.toString()+')('+JSON.stringify({token:item.token,portrait:remove?'':config.homeCards[2].image,remove})+')');
  function clear(){const item=binding;binding=null;if(!item)return;item.disposed=true;clearTimeout(item.timer);run(item,true).catch(()=>{});}
  function sync(main,kind){
    if(kind!=='hub'||pageSkin.identifyHub()?.key!=='pull-requests'){clear();return;}
    const r=main.getBoundingClientRect();
    const views=[...document.querySelectorAll('[data-embedded-frame-host-root] [data-mcp-app-frame] webview[title="Code Review"]')].filter(n=>{
      try{const u=new URL(n.getAttribute('src')),b=n.getBoundingClientRect();return u.protocol==='codex-sandbox:'&&u.hostname===host&&u.pathname==='/'&&Math.abs(b.x-r.x)<3&&Math.abs(b.y-r.y)<3&&Math.abs(b.width-r.width)<3&&Math.abs(b.height-r.height)<3&&typeof n.executeJavaScript==='function'}catch{return false;}
    });
    if(views.length!==1){clear();return;}
    if(binding?.view===views[0])return;
    clear();const item={view:views[0],token:crypto.randomUUID(),attempts:0,timer:null,disposed:false};binding=item;
    const apply=async()=>{try{const applied=await run(item);if(item.disposed){await run(item,true);return;}if(!applied&&++item.attempts<30)item.timer=setTimeout(apply,1000);}catch{if(!item.disposed&&++item.attempts<30)item.timer=setTimeout(apply,1000);}};apply();
  }
  return {sync,clear};
}
