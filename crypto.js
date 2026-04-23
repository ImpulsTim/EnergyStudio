var EGP_ITER=310000;
var _subtle=(typeof window!=='undefined'&&window.crypto&&window.crypto.subtle)||null;
function toB64(buf){var arr=new Uint8Array(buf),bin='',chunk=8192;for(var i=0;i<arr.length;i+=chunk)bin+=String.fromCharCode.apply(null,arr.subarray(i,i+chunk));return btoa(bin);}
function fromB64(s){var bin=atob(s),arr=new Uint8Array(bin.length);for(var i=0;i<bin.length;i++)arr[i]=bin.charCodeAt(i);return arr.buffer;}
function _assertCrypto(){
  if(!_subtle)throw new Error('WebCrypto niet beschikbaar — open het bestand via file:// of HTTPS');
}
async function _deriveKey(password,salt){
  var raw=new TextEncoder().encode(password);
  var mat=await _subtle.importKey('raw',raw,'PBKDF2',false,['deriveKey']);
  return _subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt:salt,iterations:EGP_ITER},mat,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
async function egpEncrypt(jsonStr,password){
  _assertCrypto();
  var salt=window.crypto.getRandomValues(new Uint8Array(16));
  var iv=window.crypto.getRandomValues(new Uint8Array(12));
  var key=await _deriveKey(password,salt);
  var ct=await _subtle.encrypt({name:'AES-GCM',iv:iv},key,new TextEncoder().encode(jsonStr));
  return JSON.stringify({egp:'encrypted',v:1,alg:'AES-256-GCM',kdf:'PBKDF2-SHA256',iter:EGP_ITER,salt:toB64(salt),iv:toB64(iv),ct:toB64(ct)});
}
async function egpDecrypt(encStr,password){
  _assertCrypto();
  var o=JSON.parse(encStr);
  var salt=fromB64(o.salt),iv=fromB64(o.iv),ct=fromB64(o.ct);
  var key=await _deriveKey(password,new Uint8Array(salt));
  try{
    var plain=await _subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(iv)},key,ct);
    return new TextDecoder().decode(plain);
  }catch(e){throw new Error('Verkeerd wachtwoord of beschadigd bestand');}
}
function isEncryptedExport(obj){return obj&&obj.egp==='encrypted';}
