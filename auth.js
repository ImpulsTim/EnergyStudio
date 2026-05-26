// Lichte client-side authenticatie + accountbeheer.
// Geen backend: accounts/wachtwoord-hashes liggen lokaal in IndexedDB (meta['__users__']).
// Per gebruiker eigen data via namespaced state-sleutel (zie db.js).

var _SETUP_CODE='impuls2026'; // Wijzig dit om de setup-URL te beveiligen
var _DEMO_UID='__demo__';     // Vaste ID voor het hardgecodeerde demo-account

var _currentUser=null;

function _authEsc(s){return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}

function _authShow(id){
  ['pageLogin','pageSetup'].forEach(function(p){
    var el=document.getElementById(p);
    if(el)el.style.display=(p===id)?'flex':'none';
  });
  var first=document.querySelector('#'+id+' input');
  if(first)setTimeout(function(){first.focus();},30);
}
function _authHideOverlays(){
  ['pageLogin','pageSetup'].forEach(function(p){var el=document.getElementById(p);if(el)el.style.display='none';});
}

// Beslist bij opstarten: setup (alleen via URL-code) / sessie herstellen / login.
async function authBoot(){
  var sid=localStorage.getItem('egp_session');
  // Herstel demo-sessie (werkt ook zonder DB, in elke browser)
  if(sid===_DEMO_UID){await _startDemoSession();return;}
  var users=await getUsers();
  // Herstel gewone gebruikerssessie
  if(sid&&users.some(function(u){return u.id===sid;})){await startAppForUser(sid);return;}
  // Setup alleen via ?setup=<code> — nooit automatisch
  var params=new URLSearchParams(window.location.search);
  if(!users.length&&params.get('setup')===_SETUP_CODE){_authShow('pageSetup');return;}
  _authShow('pageLogin');
}

async function _startDemoSession(){
  _currentUser={id:_DEMO_UID,username:'Demo',role:'demo'};
  localStorage.setItem('egp_session',_DEMO_UID);
  setActiveUser(_DEMO_UID);
  var _hasState=await dbGet('meta','state:'+_DEMO_UID);
  await loadMeta();
  if(!_hasState) await _initDemoProject();
  _authHideOverlays();
  document.body.classList.remove('pre-auth');
  document.body.classList.add('demo-mode');
  document.getElementById('hdrUserName').textContent='Demo';
  document.getElementById('hdrUserIco').textContent='D';
  document.getElementById('btnUsers').style.display='none';
  renderAll();
  _navTo('home');
}

async function _initDemoProject(){
  var pid=uid();
  var conns=[
    {id:uid(),name:'Bedrijf A – Kantoor',category:'Zakelijk',gtvA:200,gtvT:0},
    {id:uid(),name:'Bedrijf B – Productie',category:'Zakelijk',gtvA:350,gtvT:0},
    {id:uid(),name:'Woning C – Zonnepanelen',category:'Particulier',gtvA:0,gtvT:90},
  ];
  S={projects:[{id:pid,name:'Demo project',desc:'Voorbeeldproject',companies:conns}],activeId:pid};
  await saveMeta();
  for(var i=0;i<conns.length;i++) await dbSet('ts',conns[i].id,genDemo(i));
}

async function startAppForUser(userId){
  var users=await getUsers();
  var u=users.filter(function(x){return x.id===userId;})[0];
  if(!u){_authShow('pageLogin');return;}
  _currentUser=u;
  localStorage.setItem('egp_session',u.id);
  setActiveUser(u.id);
  var _hasState=await dbGet('meta','state:'+u.id);
  await loadMeta();
  if(u.role==='demo'&&!_hasState) await _initDemoProject();
  _authHideOverlays();
  document.body.classList.remove('pre-auth');
  document.body.classList.toggle('demo-mode',u.role==='demo');
  document.getElementById('hdrUserName').textContent=u.username;
  document.getElementById('hdrUserIco').textContent=(u.username||'?').slice(0,1).toUpperCase();
  document.getElementById('btnUsers').style.display=(u.role==='admin')?'':'none';
  renderAll();
  _navTo('home');
}

function _navTo(tool){
  var btn=document.querySelector('.nav-btn[data-tool="'+tool+'"]');
  if(btn)btn.click();
}

async function _doLogin(){
  var name=document.getElementById('loginUser').value.trim();
  var pwd=document.getElementById('loginPwd').value;
  if(!name||!pwd){notify('Vul gebruikersnaam en wachtwoord in',false);return;}
  // Hardgecodeerd demo-account — werkt altijd, ook zonder DB
  if(name.toLowerCase()==='demo'&&pwd==='Demo'){
    document.getElementById('loginPwd').value='';
    await _startDemoSession();return;
  }
  var users=await getUsers();
  var u=users.filter(function(x){return x.username.toLowerCase()===name.toLowerCase();})[0];
  if(!u){notify('Onjuiste inloggegevens',false);return;}
  var ok=false;
  try{ok=await egpVerifyPassword(pwd,u.salt,u.hash);}catch(e){notify(e.message,false);return;}
  if(!ok){notify('Onjuiste inloggegevens',false);return;}
  document.getElementById('loginPwd').value='';
  await startAppForUser(u.id);
}

async function _doSetup(){
  var existing=await getUsers();
  if(existing.length){notify('Setup niet toegestaan: er zijn al accounts',false);return;}
  var name=document.getElementById('setupUser').value.trim();
  var p1=document.getElementById('setupPwd').value;
  var p2=document.getElementById('setupPwd2').value;
  if(!name||!p1){notify('Vul gebruikersnaam en wachtwoord in',false);return;}
  if(p1!==p2){notify('Wachtwoorden komen niet overeen',false);return;}
  var hp;
  try{hp=await egpHashPassword(p1);}catch(e){notify(e.message,false);return;}
  var id=uid();
  var admin={id:id,username:name,role:'admin',salt:hp.salt,hash:hp.hash,created:Date.now()};
  await saveUsers([admin]);
  // Legacy-migratie: bestaande (single-user) data overzetten naar de nieuwe beheerder.
  try{var legacy=await dbGet('meta','state');if(legacy)await dbSet('meta','state:'+id,legacy);}catch(e){}
  notify('Beheerdersaccount aangemaakt');
  await startAppForUser(id);
}

function _doLogout(){
  localStorage.removeItem('egp_session');
  _currentUser=null;
  setActiveUser(null);
  S={projects:[],activeId:null};
  try{resetCH();}catch(e){}
  document.body.classList.remove('demo-mode');
  document.body.classList.add('pre-auth');
  document.getElementById('loginUser').value='';
  document.getElementById('loginPwd').value='';
  _authShow('pageLogin');
}

// Hoofdscherm: projectkeuze en aansluitingenlijst worden al door renderAll gevuld.
function renderHome(){}

// --- Accountbeheer (admin) ---------------------------------------------------

var _ROLE_LABEL={admin:'Beheerder',user:'Gebruiker',demo:'Demo'};

async function _renderUsersList(){
  var users=await getUsers();
  var html='';
  users.forEach(function(u){
    var isSelf=_currentUser&&u.id===_currentUser.id;
    html+='<div class="users-row"><div class="u-name">'+_authEsc(u.username)+'</div>';
    if(isSelf){
      html+='<span class="u-role">'+(_ROLE_LABEL[u.role]||u.role)+' (jij)</span>';
    }else{
      html+='<div style="display:flex;gap:6px;align-items:center">'+
        '<select data-roleuser="'+u.id+'" style="font-size:11px;padding:3px 6px;border:1px solid #ccc;border-radius:5px">'+
          '<option value="user"'+(u.role==='user'?' selected':'')+'>Gebruiker</option>'+
          '<option value="admin"'+(u.role==='admin'?' selected':'')+'>Beheerder</option>'+
          '<option value="demo"'+(u.role==='demo'?' selected':'')+'>Demo</option>'+
        '</select>'+
        '<button class="b d" data-deluser="'+u.id+'" style="font-size:11px;padding:5px 10px">Verwijder</button>'+
      '</div>';
    }
    html+='</div>';
  });
  document.getElementById('usersList').innerHTML=html||'<div style="color:#aaa;font-size:13px">Geen accounts</div>';
}

async function _changeUserRole(id,newRole){
  var users=await getUsers();
  var u=users.filter(function(x){return x.id===id;})[0];
  if(!u)return;
  u.role=newRole;
  await saveUsers(users);
  notify('Rol gewijzigd naar '+(_ROLE_LABEL[newRole]||newRole));
}

async function _addUser(){
  var name=document.getElementById('nuUser').value.trim();
  var pwd=document.getElementById('nuPwd').value;
  var role=document.getElementById('nuRole').value;
  if(!name||!pwd){notify('Vul gebruikersnaam en wachtwoord in',false);return;}
  var users=await getUsers();
  if(users.some(function(u){return u.username.toLowerCase()===name.toLowerCase();})){notify('Gebruikersnaam bestaat al',false);return;}
  var hp;
  try{hp=await egpHashPassword(pwd);}catch(e){notify(e.message,false);return;}
  users.push({id:uid(),username:name,role:role,salt:hp.salt,hash:hp.hash,created:Date.now()});
  await saveUsers(users);
  document.getElementById('nuUser').value='';
  document.getElementById('nuPwd').value='';
  notify('Account toegevoegd');
  _renderUsersList();
}

async function _delUser(id){
  if(_currentUser&&id===_currentUser.id){notify('Je kunt je eigen account niet verwijderen',false);return;}
  if(!confirm('Account verwijderen? De projecten van dit account gaan verloren.'))return;
  var users=await getUsers();
  users=users.filter(function(u){return u.id!==id;});
  await saveUsers(users);
  try{await dbDel('meta','state:'+id);}catch(e){}
  notify('Account verwijderd');
  _renderUsersList();
}

// --- Event listeners ---------------------------------------------------------

document.addEventListener('DOMContentLoaded',function(){
  document.getElementById('btnLogin').addEventListener('click',_doLogin);
  document.getElementById('btnSetup').addEventListener('click',_doSetup);
  document.getElementById('btnLogout').addEventListener('click',_doLogout);
  document.getElementById('loginPwd').addEventListener('keydown',function(e){if(e.key==='Enter')_doLogin();});
  document.getElementById('loginUser').addEventListener('keydown',function(e){if(e.key==='Enter')document.getElementById('loginPwd').focus();});
  document.getElementById('setupPwd2').addEventListener('keydown',function(e){if(e.key==='Enter')_doSetup();});

  function eye(btnId,inpId){var b=document.getElementById(btnId);if(b)b.addEventListener('click',function(){var i=document.getElementById(inpId);i.type=i.type==='password'?'text':'password';});}
  eye('loginPwdEye','loginPwd');eye('setupPwdEye','setupPwd');eye('nuPwdEye','nuPwd');

  document.getElementById('btnUsers').addEventListener('click',function(){_renderUsersList();showM('mUsers');});
  document.getElementById('btnCloseUsers').addEventListener('click',function(){hideM('mUsers');});
  document.getElementById('mUsers').addEventListener('click',function(e){if(e.target===this)hideM('mUsers');});
  document.getElementById('btnAddUser').addEventListener('click',_addUser);
  document.getElementById('usersList').addEventListener('click',function(e){
    var b=e.target.closest('[data-deluser]');
    if(b)_delUser(b.getAttribute('data-deluser'));
  });
  document.getElementById('usersList').addEventListener('change',function(e){
    var s=e.target.closest('[data-roleuser]');
    if(s)_changeUserRole(s.getAttribute('data-roleuser'),s.value);
  });
});
