// Structural memo-cache layouts, independent of app versions and source bytes.
function reviewedNativeMenus(registry){
 if(registry?.schema!==2||!Array.isArray(registry.profiles)||!registry.profiles.length)throw Error('Invalid native menu layouts');
 const seen=new Set();
 return registry.profiles.map(profile=>{
  if(!profile||typeof profile.layout!=='string'||!profile.layout||seen.has(profile.layout)||!Number.isInteger(profile.cacheLength)||profile.cacheLength<1)throw Error('Invalid native menu layout');
  seen.add(profile.layout);
  const indices=profile.popover?['closeIndex','openIndex','nativeOpenIndex','disableIndex']:['nativeIndex','closeIndex'];
  if(indices.some(key=>!Number.isInteger(profile[key])||profile[key]<0||profile[key]>=profile.cacheLength))throw Error('Invalid native menu cache indices');
  return {...profile};
 });
}
module.exports={reviewedNativeMenus};
