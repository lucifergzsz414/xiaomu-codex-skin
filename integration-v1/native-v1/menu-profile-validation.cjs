const fields=['appVersion','functionName','functionSha256','functionLength','layout'];
const reviewed=[
 {appVersion:'26.1027.3384.0',functionName:'Wxn',functionSha256:'0b7d7527c136309985822313072fe9338e2187078dd26f4afcfecbc88cfbec84',functionLength:12391,layout:'codex-3384'},
 {appVersion:'26.1029.7803.0',functionName:'x',functionSha256:'7489581934e24e5034a8706a984c634febfb243532539aa2d6fb9ba9b0a22a94',functionLength:13441,layout:'codex-3384'},
];
function reviewedNativeMenus(registry){
 if(registry?.schema!==1||!Array.isArray(registry.profiles)||registry.profiles.length!==reviewed.length)throw Error('Unreviewed native menu registry');
 return registry.profiles.map((profile,index)=>{
  if(!profile||Object.keys(profile).length!==fields.length||Object.keys(profile).some(key=>!fields.includes(key))||fields.some(key=>profile[key]!==reviewed[index][key]))throw Error('Unreviewed native menu profile');
  return Object.fromEntries(fields.map(key=>[key,profile[key]]));
 });
}
module.exports={reviewedNativeMenus};
