var db=null;

function openDB(){
  return new Promise(function(res,rej){
    var r=indexedDB.open('EGP_v4',1);
    r.onupgradeneeded=function(e){
      var d=e.target.result;
      if(!d.objectStoreNames.contains('ts'))d.createObjectStore('ts');
      if(!d.objectStoreNames.contains('meta'))d.createObjectStore('meta');
    };
    r.onsuccess=function(e){res(e.target.result);};
    r.onerror=function(e){rej(e);};
  });
}

function dbGet(s,k){
  return new Promise(function(r,j){
    var q=db.transaction(s,'readonly').objectStore(s).get(k);
    q.onsuccess=function(e){r(e.target.result);};
    q.onerror=j;
  });
}

function dbSet(s,k,v){
  return new Promise(function(r,j){
    var q=db.transaction(s,'readwrite').objectStore(s).put(v,k);
    q.onsuccess=function(e){r(e.target.result);};
    q.onerror=j;
  });
}

function dbDel(s,k){
  return new Promise(function(r,j){
    var q=db.transaction(s,'readwrite').objectStore(s).delete(k);
    q.onsuccess=function(e){r(e.target.result);};
    q.onerror=j;
  });
}

function saveMeta(){return dbSet('meta','state',S);}

async function loadMeta(){
  var s=await dbGet('meta','state');
  if(s)S=s;
  if(!S.projects.length){var id=uid();S.projects=[{id:id,name:'Mijn eerste project',desc:'',companies:[]}];S.activeId=id;}
  if(!S.activeId)S.activeId=S.projects[0].id;
}
