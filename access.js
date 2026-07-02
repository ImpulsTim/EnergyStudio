// Simpele client-side toegangspoort.
// Let op: dit is bedoeld als drempel, niet als echte beveiliging voor publieke code.
(function(){
  var ACCESS_HASH='2c7191affea1a165c1c56a3676ed1c315b54461745595e20097195237d2e72c0';
  var STORAGE_KEY='es-access-ok';

  function toHex(buf){
    return Array.prototype.map.call(new Uint8Array(buf),function(b){
      return b.toString(16).padStart(2,'0');
    }).join('');
  }

  async function sha256(text){
    if(!window.crypto||!window.crypto.subtle)throw new Error('Crypto API niet beschikbaar');
    var data=new TextEncoder().encode(text);
    return toHex(await window.crypto.subtle.digest('SHA-256',data));
  }

  function unlock(){
    try{sessionStorage.setItem(STORAGE_KEY,ACCESS_HASH);}catch(e){}
    document.body.classList.remove('access-locked');
    var gate=document.getElementById('accessGate');
    if(gate)gate.style.display='none';
  }

  function alreadyUnlocked(){
    try{return sessionStorage.getItem(STORAGE_KEY)===ACCESS_HASH;}catch(e){return false;}
  }

  document.addEventListener('DOMContentLoaded',function(){
    var gate=document.getElementById('accessGate');
    var form=document.getElementById('accessForm');
    var input=document.getElementById('accessPassword');
    var msg=document.getElementById('accessMsg');

    if(alreadyUnlocked()){unlock();return;}
    document.body.classList.add('access-locked');
    if(input)setTimeout(function(){input.focus();},80);

    if(!form)return;
    form.addEventListener('submit',async function(e){
      e.preventDefault();
      if(msg)msg.textContent='';
      try{
        var hash=await sha256(input.value||'');
        if(hash===ACCESS_HASH){
          unlock();
          return;
        }
        if(msg)msg.textContent='Wachtwoord klopt niet.';
        input.value='';
        input.focus();
      }catch(err){
        if(msg)msg.textContent='Toegangscontrole werkt alleen met een moderne browser via file://, localhost of HTTPS.';
      }
    });
  });
})();
