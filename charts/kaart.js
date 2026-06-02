// charts/kaart.js — Interactieve kaartweergave van het groepsprofiel (Leaflet + OpenStreetMap)
// MS-ringen: elke upload = 1 ring; ringen worden separaat gevisualiseerd.

var _kaartMap = null;
var _kaartLG  = null;
var _geocoding = false;
var _geocodeTimer = null;

// Kleurenpalet voor MS-ringen (bewust anders dan PAL voor projectdeelnemers)
var RING_PAL = ['#e74c3c','#9b59b6','#e67e22','#1abc9c','#2c3e50','#c0392b','#8e44ad','#16a085','#d35400','#27ae60'];

// ─── Hulpfuncties ─────────────────────────────────────────────────────────────

function _kEsc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function _kFmt(kwh){
  if(kwh>=1000000)return (kwh/1000000).toFixed(1)+' GWh';
  if(kwh>=1000)return (kwh/1000).toFixed(1)+' MWh';
  return Math.round(kwh)+' kWh';
}
function _kUid(){return Math.random().toString(36).slice(2,10);}

// Migreer oud p.netburen → p.msRingen[0]
function _kaartMigrate(p){
  if(!p)return;
  if(p.netburen&&p.netburen.length&&(!p.msRingen||!p.msRingen.length)){
    p.msRingen=[{id:_kUid(),label:'Ring 1',netburen:p.netburen.slice()}];
    delete p.netburen;
    saveMeta();
  }
  if(!p.msRingen)p.msRingen=[];
}

// Geeft de ringindex voor een EAN (-1 = niet gevonden)
function _kaartRingIdx(ean,msRingen){
  if(!ean)return -1;
  var e=ean.trim();
  for(var i=0;i<(msRingen||[]).length;i++){
    var nb=msRingen[i].netburen||[];
    for(var j=0;j<nb.length;j++){if((nb[j].ean||'').trim()===e)return i;}
  }
  return -1;
}

// ─── Initialisatie ────────────────────────────────────────────────────────────

function initKaart(){
  if(_kaartMap)return;
  var el=document.getElementById('kaartMap');
  if(!el||typeof L==='undefined')return;
  _kaartMap=L.map('kaartMap',{preferCanvas:false}).setView([51.50,3.80],12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
    attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    crossOrigin:'anonymous',maxZoom:19
  }).addTo(_kaartMap);
  _kaartLG=L.layerGroup().addTo(_kaartMap);
  setTimeout(function(){_kaartMap.invalidateSize();},100);
}

// ─── Renderen ─────────────────────────────────────────────────────────────────

function renderKaart(){
  initKaart();
  if(!_kaartMap)return;
  setTimeout(function(){_kaartMap.invalidateSize();},50);
  _kaartLG.clearLayers();

  var p=ap();
  if(!p){_kaartSetWarning(null);return;}
  _kaartMigrate(p);
  var companies=p.companies||[];
  var msRingen=p.msRingen||[];

  // EAN → ringIndex
  var eanRingMap={};
  msRingen.forEach(function(ring,ri){
    (ring.netburen||[]).forEach(function(n){if(n.ean)eanRingMap[n.ean.trim()]=ri;});
  });

  var stats=_kaartBuildStats();
  var bounds=[];

  // EAN-set van projectdeelnemers (nodig bij ring-rendering)
  var compEanSet={};
  companies.forEach(function(c){if(c.ean)compEanSet[c.ean.trim()]=true;});

  // ── Ring-netwerk (K-nearest-neighbour lijnen) — als eerste laag ──
  msRingen.forEach(function(ring,ri){
    var ringCol=RING_PAL[ri%RING_PAL.length];
    var pts=(ring.netburen||[]).filter(function(n){
      return n.lat!=null&&!isNaN(n.lat)&&n.lng!=null&&!isNaN(n.lng)
        &&!(n.ean&&compEanSet[n.ean.trim()]);
    }).map(function(n){return[+n.lat,+n.lng];});
    // Voeg projectdeelnemers toe die tot deze ring behoren (EAN-match)
    companies.forEach(function(c){
      if(c.lat==null||c.lng==null||isNaN(c.lat)||isNaN(c.lng))return;
      if(c.ean&&eanRingMap[c.ean.trim()]===ri)pts.push([+c.lat,+c.lng]);
    });
    if(pts.length<2)return;
    _kaartNetwerk(pts,ringCol,_kaartLG);
  });

  // ── Projectdeelnemers — ruit (divIcon) + permanent label ──
  companies.forEach(function(c,i){
    if(c.lat==null||c.lng==null||isNaN(c.lat)||isNaN(c.lng))return;
    var col=PAL[i%PAL.length];
    var ri=c.ean!=null?eanRingMap[c.ean.trim()]:undefined;
    var inRing=(ri!=null&&ri>=0);
    var ringCol=inRing?RING_PAL[ri%RING_PAL.length]:null;
    var ringLabel=inRing?msRingen[ri].label:null;
    var s=14;
    var brd=inRing?'3px solid '+ringCol:'2px solid rgba(0,0,0,.3)';
    var icon=L.divIcon({
      className:'kaart-diamond-wrap',
      html:'<div style="width:'+s+'px;height:'+s+'px;transform:rotate(45deg);background:'+col
        +';border:'+brd+';box-shadow:0 1px 4px rgba(0,0,0,.35)"></div>',
      iconSize:[s+6,s+6],
      iconAnchor:[Math.round((s+6)/2),Math.round((s+6)/2)]
    });
    var m=L.marker([+c.lat,+c.lng],{icon:icon});
    // Permanent naams-label (buiten de divIcon HTML)
    var lbl=c.name.length>22?c.name.slice(0,21)+'…':c.name;
    m.bindTooltip(_kEsc(lbl),{
      permanent:true, direction:'top', className:'kaart-label', offset:[0,-(Math.round(s/2)+6)]
    });
    // Detail-popup op klik
    m.bindPopup(_kaartTip(c,stats[c.id],ringLabel,ringCol),{className:'kaart-pop',maxWidth:260});
    _kaartLG.addLayer(m);
    bounds.push([+c.lat,+c.lng]);
  });

  // ── Netburen per ring — cirkels ──
  msRingen.forEach(function(ring,ri){
    var ringCol=RING_PAL[ri%RING_PAL.length];
    (ring.netburen||[]).forEach(function(n){
      if(n.lat==null||n.lng==null||isNaN(n.lat)||isNaN(n.lng))return;
      if(n.ean&&compEanSet[n.ean.trim()])return;

      var m=L.circleMarker([+n.lat,+n.lng],{
        radius:7, fillColor:ringCol, color:'#fff',
        weight:1.5, fillOpacity:0.8, opacity:1
      });
      // Label: aangepaste naam indien ingesteld, anders EAN
      var hasCustomName=n.name&&n.name!==n.adres&&n.name!==n.ean&&n.name!=='';
      var nbLbl=hasCustomName?n.name:(n.adres||n.ean||'');
      if(nbLbl.length>20)nbLbl=nbLbl.slice(0,19)+'…';
      m.bindTooltip(_kEsc(nbLbl),{
        permanent:true, direction:'top', className:'kaart-label-sm', offset:[0,-7]
      });
      // Detail-popup op klik
      var tip='<strong>'+_kEsc(n.name||'?')+'</strong>'
        +' <span style="background:'+ringCol+';color:#fff;border-radius:3px;padding:1px 5px;font-size:10px">'+_kEsc(ring.label)+'</span>';
      if(n.ean)tip+='<br><span style="font-family:monospace;font-size:10px">EAN: '+_kEsc(n.ean)+'</span>';
      if(n.adres)tip+='<br>'+_kEsc(n.adres);
      if(n.note)tip+='<br><em>'+_kEsc(n.note)+'</em>';
      m.bindPopup(tip,{className:'kaart-pop',maxWidth:240});
      _kaartLG.addLayer(m);
      bounds.push([+n.lat,+n.lng]);
    });
  });

  if(bounds.length>0){
    try{_kaartMap.fitBounds(bounds,{padding:[32,32],maxZoom:15});}catch(e){}
  }

  _kaartUpdateLegend(companies,msRingen,stats,eanRingMap);
  _kaartSetWarning(companies,msRingen);
}

// Teken MST (connectiviteitsgarantie) + K-NN (esthetiek) lijnen voor een ring
function _kaartNetwerk(pts,col,lg){
  var n=pts.length;
  if(n<2)return;

  // Bouw alle kanten gesorteerd op afstand² (Kruskal MST)
  var edges=[];
  for(var i=0;i<n;i++){
    for(var j=i+1;j<n;j++){
      var dlat=pts[j][0]-pts[i][0],dlng=pts[j][1]-pts[i][1];
      edges.push({i:i,j:j,d:dlat*dlat+dlng*dlng});
    }
  }
  edges.sort(function(a,b){return a.d-b.d;});

  // Union-Find voor MST
  var par=[];
  for(var k=0;k<n;k++)par[k]=k;
  function find(x){return par[x]===x?x:(par[x]=find(par[x]));}

  var drawn={};
  // MST-kanten — garandeert dat alle clusters verbonden zijn
  edges.forEach(function(e){
    if(find(e.i)!==find(e.j)){
      par[find(e.i)]=find(e.j);
      var key=e.i+'-'+e.j;
      drawn[key]=true;
      L.polyline([pts[e.i],pts[e.j]],{color:col,weight:1.5,opacity:0.65,interactive:false}).addTo(lg);
    }
  });

  // K-NN extra kanten voor neurologisch netwerk-uiterlijk binnen clusters
  var K=Math.min(2,n-1);
  pts.forEach(function(p,i){
    var dists=[];
    for(var j=0;j<n;j++){
      if(j===i)continue;
      var dlat=pts[j][0]-p[0],dlng=pts[j][1]-p[1];
      dists.push({j:j,d:dlat*dlat+dlng*dlng});
    }
    dists.sort(function(a,b){return a.d-b.d;});
    for(var k=0;k<K;k++){
      var key=Math.min(i,dists[k].j)+'-'+Math.max(i,dists[k].j);
      if(drawn[key])continue;
      drawn[key]=true;
      L.polyline([p,pts[dists[k].j]],{color:col,weight:1.5,opacity:0.65,interactive:false}).addTo(lg);
    }
  });
}

function _kaartBuildStats(){
  var map={};
  if(!_optim||!_optim.withData||!_optim.allTs||!_optim.allTs.length)return map;
  _optim.withData.forEach(function(c){
    var prod=0,cons=0;
    (c.data||[]).forEach(function(d){
      if(d.kw<0)prod+=(-d.kw)*0.25;else if(d.kw>0)cons+=d.kw*0.25;
    });
    map[c.id]={prodKwh:prod,consKwh:cons};
  });
  return map;
}

function _kaartTip(c,st,ringLabel,ringCol){
  var h='<strong>'+_kEsc(c.name)+'</strong>';
  if(ringLabel)h+=' <span style="background:'+ringCol+';color:#fff;border-radius:3px;padding:1px 5px;font-size:10px">'+_kEsc(ringLabel)+'</span>';
  if(c.ean)h+='<br><span style="font-family:monospace;font-size:10px">EAN: '+_kEsc(c.ean)+'</span>';
  if(c.adres)h+='<br>'+_kEsc(c.adres);
  h+='<br>GTV-A: '+(c.gtvA||'—')+' kW · GTV-T: '+(c.gtvT||'—')+' kW';
  if(st){
    var net=st.prodKwh-st.consKwh;
    var rol=Math.abs(net)<500?'Gemengd':net>0?'⬆ Producent':'⬇ Afnemer';
    h+='<hr style="margin:4px 0;border:none;border-top:1px solid #ddd">';
    if(st.consKwh>0)h+='Afname: '+_kFmt(st.consKwh)+'<br>';
    if(st.prodKwh>100)h+='Opwek: '+_kFmt(st.prodKwh)+'<br>';
    h+='Rol: <strong>'+rol+'</strong>';
  }
  return h;
}

// ─── Legenda + waarschuwing ───────────────────────────────────────────────────

function _kaartUpdateLegend(companies,msRingen,stats,eanRingMap){
  var el=document.getElementById('kaartLegenda');if(!el)return;
  var items=[];

  // Legenda-types uitleg (één keer bovenaan)
  items.push(
    '<span class="kaart-leg-item" style="color:#555">'
    +'<span style="display:inline-block;width:11px;height:11px;transform:rotate(45deg);'
    +'background:#888;border:2px solid rgba(0,0,0,.25);vertical-align:middle;margin-right:5px"></span>'
    +'Projectdeelnemer</span>'
  );
  items.push(
    '<span class="kaart-leg-item" style="color:#555">'
    +'<span class="kaart-dot" style="background:#aaa;border-color:#aaa;opacity:.7"></span>'
    +'Netbuur (ring-kleur)</span>'
  );

  // Deelnemer separator
  items.push('<span style="display:block;width:100%;height:0;border-top:1px solid #e8e8e8;margin:4px 0"></span>');

  // Projectdeelnemers
  var withCoords=companies.filter(function(c){return c.lat!=null&&!isNaN(c.lat);});
  var noCoords=companies.filter(function(c){return c.lat==null||isNaN(c.lat);});
  withCoords.forEach(function(c){
    var idx=companies.indexOf(c);
    var col=PAL[idx%PAL.length];
    var ri=c.ean!=null?eanRingMap[c.ean.trim()]:undefined;
    var ringCol=ri!=null&&ri>=0?RING_PAL[ri%RING_PAL.length]:null;
    var diamond='<span style="display:inline-block;width:11px;height:11px;transform:rotate(45deg);background:'+col
      +';border:'+(ringCol?'3px solid '+ringCol:'2px solid rgba(0,0,0,.2)')
      +';vertical-align:middle;margin-right:5px;flex-shrink:0"></span>';
    items.push('<span class="kaart-leg-item">'+diamond+_kEsc(c.name)+'</span>');
  });
  if(noCoords.length){
    items.push('<span class="kaart-leg-item" style="color:#e67e22">⚠ Geen coördinaten: '
      +noCoords.map(function(c){return _kEsc(c.name);}).join(', ')+'</span>');
  }

  // Ringen
  if(msRingen.length){
    items.push('<span style="display:block;width:100%;height:0;border-top:1px solid #e8e8e8;margin:4px 0"></span>');
  }
  msRingen.forEach(function(ring,ri){
    var col=RING_PAL[ri%RING_PAL.length];
    var nGeo=(ring.netburen||[]).filter(function(n){return n.lat!=null&&!isNaN(n.lat);}).length;
    items.push('<span class="kaart-leg-item"><span class="kaart-dot" style="background:'+col+';border-color:'+col+';opacity:.75"></span>'
      +_kEsc(ring.label)+' ('+nGeo+' op kaart)</span>');
  });

  el.innerHTML='<div class="kaart-leg">'+items.join('')+'</div>';
}

function _kaartSetWarning(companies,msRingen){
  var el=document.getElementById('kaartWarning');if(!el)return;
  if(!companies){el.style.display='none';return;}
  var eanInNb={};
  (msRingen||[]).forEach(function(ring){
    (ring.netburen||[]).forEach(function(n){if(n.ean)eanInNb[n.ean.trim()]=true;});
  });
  var ontbrekend=companies.filter(function(c){return c.ean&&!eanInNb[c.ean.trim()];});
  if(!ontbrekend.length){el.style.display='none';return;}
  el.style.display='';
  el.innerHTML='⚠ Netburenscan onvolledig — '+ontbrekend.length+' aansluiting(en) niet gevonden in een ring: '
    +ontbrekend.map(function(c){return '<strong>'+_kEsc(c.name)+'</strong>';}).join(', ');
}

// ─── Screenshot ───────────────────────────────────────────────────────────────

function screenshotKaart(){
  var el=document.getElementById('kaartWrap');
  if(!el||typeof htmlToImage==='undefined'){notify('html-to-image niet beschikbaar',false);return;}
  notify('Screenshot wordt aangemaakt…');
  htmlToImage.toPng(el,{backgroundColor:'#f8faf7',pixelRatio:2})
    .then(function(dataUrl){
      var a=document.createElement('a');
      a.download='kaart-'+(ap()?ap().name.replace(/[^a-z0-9]/gi,'-').toLowerCase():'project')+'.png';
      a.href=dataUrl;a.click();
      notify('Kaart opgeslagen als PNG');
    })
    .catch(function(e){notify('Screenshot mislukt: '+e.message,false);});
}

// ─── Netburen modal ───────────────────────────────────────────────────────────

function openNetburenModal(){
  var p=ap();if(p)_kaartMigrate(p);
  _renderNetburenModal();
  document.getElementById('nbName').value='';
  document.getElementById('nbEan').value='';
  document.getElementById('nbAdres').value='';
  document.getElementById('nbLat').value='';
  document.getElementById('nbLng').value='';
  document.getElementById('nbNote').value='';
  showM('mNetbuur');
}

function _renderNetburenModal(){
  var p=ap();if(!p)return;
  var companies=p.companies||[];
  var msRingen=p.msRingen||[];

  // EAN volledigheidscheck
  _renderNbEanCheck(companies,msRingen);

  // Ringen
  _renderRingenList(msRingen,companies);

  // Ring-dropdown voor handmatig toevoegen
  var sel=document.getElementById('nbRingSelect');
  if(sel){
    sel.innerHTML=msRingen.map(function(ring,ri){
      return '<option value="'+ring.id+'">'+_kEsc(ring.label)+'</option>';
    }).join('');
    if(!msRingen.length)sel.innerHTML='<option value="">— importeer eerst een ring —</option>';
  }
}

function _renderRingenList(msRingen,companies){
  var el=document.getElementById('nbRingenList');if(!el)return;
  if(!msRingen.length){
    el.innerHTML='<div style="color:#aaa;font-size:12px;padding:6px 0">Nog geen ringen geïmporteerd.</div>';
    return;
  }
  var compEanSet={};
  companies.forEach(function(c){if(c.ean)compEanSet[c.ean.trim()]=c.name;});

  el.innerHTML=msRingen.map(function(ring,ri){
    var col=RING_PAL[ri%RING_PAL.length];
    var nb=ring.netburen||[];
    var nGeo=nb.filter(function(n){return n.lat!=null&&!isNaN(n.lat);}).length;
    var inProject=nb.filter(function(n){return n.ean&&compEanSet[n.ean.trim()];});

    var inProjHtml=inProject.length
      ? inProject.map(function(n){
          return '<span style="display:inline-block;background:'+col+';color:#fff;border-radius:3px;padding:1px 6px;font-size:10px;margin:1px">'+_kEsc(compEanSet[n.ean.trim()])+'</span>';
        }).join('')
      : '<span style="color:#aaa;font-size:11px">geen deelnemers in deze ring</span>';

    var nbRows=nb.map(function(n){
      var geo=n.lat!=null&&!isNaN(n.lat)?'✓':'⚠';
      var geoCol=n.lat!=null&&!isNaN(n.lat)?'#46962b':'#e67e22';
      // Toon bedrijfsnaam (vet) apart van adres als ze verschillen
      var hasCustomName=(n.name&&n.name!==n.adres&&n.name!==''&&n.name!==n.ean);
      var nameHtml=hasCustomName
        ?'<span style="font-weight:600">'+_kEsc(n.name)+'</span>'
         +'<span style="color:#aaa;font-size:10px;margin-left:4px">'+_kEsc(n.adres||'')+'</span>'
        :'<span style="color:#555">'+_kEsc(n.adres||n.ean||'?')+'</span>'
         +'<span style="color:#bbb;font-size:10px;margin-left:4px;font-style:italic">geen naam</span>';

      return '<div id="nb-row-'+n.id+'" style="display:flex;align-items:center;gap:5px;font-size:11px;padding:3px 0;border-bottom:1px solid #f0f0f0">'
        +'<span style="color:'+geoCol+';flex-shrink:0;width:12px">'+geo+'</span>'
        +'<span id="nb-nm-'+n.id+'" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+nameHtml+'</span>'
        +'<span style="font-family:monospace;font-size:10px;color:#bbb;flex-shrink:0">'+_kEsc(n.ean||'')+'</span>'
        +'<button onclick="editNetbuurName(\''+n.id+'\',\''+ring.id+'\')" title="Naam bewerken" '
          +'style="color:#2c7fb8;background:none;border:none;cursor:pointer;font-size:12px;padding:0 3px;flex-shrink:0">✏</button>'
        +'<button onclick="deleteNetbuur(\''+n.id+'\',\''+ring.id+'\')" title="Verwijderen" '
          +'style="color:#c0392b;background:none;border:none;cursor:pointer;font-size:13px;padding:0 2px;flex-shrink:0">×</button>'
        +'</div>';
    }).join('');

    return '<div class="nb-ring-block" style="border-left:4px solid '+col+';padding:8px 10px;margin-bottom:10px;background:#fafafa;border-radius:0 6px 6px 0">'
      +'<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">'
      +'<span style="font-weight:700;font-size:13px">'+_kEsc(ring.label)+'</span>'
      +'<span style="font-size:11px;color:#888">'+nb.length+' netburen · '+nGeo+' geocoded</span>'
      +'<button onclick="deleteRing(\''+ring.id+'\')" style="margin-left:auto;color:#c0392b;background:none;border:1px solid #e8b4b0;border-radius:4px;cursor:pointer;font-size:11px;padding:2px 7px">🗑 Ring verwijderen</button>'
      +'</div>'
      +'<div style="margin-bottom:6px"><span style="font-size:11px;font-weight:600;color:#555">In project:</span> '+inProjHtml+'</div>'
      +(nb.length?'<div style="max-height:160px;overflow-y:auto;padding-right:2px">'+nbRows+'</div>':'')
      +'</div>';
  }).join('');
}

// Schakel een netbuur-naamcel over naar inline-bewerkingsmodus
function editNetbuurName(nbId,ringId){
  var cell=document.getElementById('nb-nm-'+nbId);if(!cell)return;
  // Huidige naam ophalen
  var p=ap();if(!p||!p.msRingen)return;
  var nb=null;
  for(var i=0;i<p.msRingen.length;i++){
    if(p.msRingen[i].id!==ringId)continue;
    var list=p.msRingen[i].netburen||[];
    for(var j=0;j<list.length;j++){if(list[j].id===nbId){nb=list[j];break;}}
  }
  if(!nb)return;
  // Haal huidige (aangepaste) naam op — default naar lege string zodat placeholder zichtbaar is
  var cur=(nb.name&&nb.name!==nb.adres&&nb.name!==nb.ean)?nb.name:'';
  cell.innerHTML=
    '<input id="nb-edit-'+nbId+'" type="text" value="'+_kEsc(cur)+'" placeholder="'+_kEsc(nb.adres||nb.ean||'')+'" '
    +'style="width:calc(100% - 60px);font-size:11px;padding:2px 5px;border:1px solid #2c7fb8;border-radius:4px;outline:none">'
    +'<button onclick="saveNetbuurName(\''+nbId+'\',\''+ringId+'\')" title="Opslaan" '
    +'style="color:#46962b;background:none;border:none;cursor:pointer;font-size:13px;padding:0 4px">✓</button>'
    +'<button onclick="_renderNetburenModal()" title="Annuleren" '
    +'style="color:#888;background:none;border:none;cursor:pointer;font-size:13px;padding:0 3px">✗</button>';
  var inp=document.getElementById('nb-edit-'+nbId);
  if(inp){inp.focus();inp.select();}
  // Enter = opslaan
  if(inp)inp.addEventListener('keydown',function(e){
    if(e.key==='Enter')saveNetbuurName(nbId,ringId);
    if(e.key==='Escape')_renderNetburenModal();
  });
}

// Sla de aangepaste naam op
function saveNetbuurName(nbId,ringId){
  var inp=document.getElementById('nb-edit-'+nbId);
  var newName=inp?inp.value.trim():'';
  var p=ap();if(!p||!p.msRingen)return;
  for(var i=0;i<p.msRingen.length;i++){
    if(p.msRingen[i].id!==ringId)continue;
    var list=p.msRingen[i].netburen||[];
    for(var j=0;j<list.length;j++){
      if(list[j].id!==nbId)continue;
      // Leeg = terugzetten naar adres als standaard
      list[j].name=newName||list[j].adres||list[j].ean||'';
      break;
    }
  }
  saveMeta();
  _renderNetburenModal();
  renderKaart();
}

function _renderNbEanCheck(companies,msRingen){
  var el=document.getElementById('nbEanCheck');if(!el)return;
  var withEan=companies.filter(function(c){return c.ean;});
  if(!withEan.length){el.innerHTML='';return;}

  // EAN → ringIndex mapping
  var eanRingMap={};
  msRingen.forEach(function(ring,ri){
    (ring.netburen||[]).forEach(function(n){if(n.ean)eanRingMap[n.ean.trim()]=ri;});
  });

  var rows=withEan.map(function(c){
    var ri=eanRingMap[c.ean.trim()];
    var ok=(ri!=null&&ri>=0);
    var badge=ok
      ?'<span style="background:'+RING_PAL[ri%RING_PAL.length]+';color:#fff;border-radius:3px;padding:1px 6px;font-size:10px">'+_kEsc(msRingen[ri].label)+'</span>'
      :'<span style="color:#e67e22;font-size:11px">niet in scan</span>';
    return '<div style="display:flex;align-items:center;gap:6px;font-size:12px;padding:2px 0">'
      +'<span style="color:'+(ok?'#46962b':'#e67e22')+';font-weight:700">'+(ok?'✓':'✗')+'</span>'
      +_kEsc(c.name)+' '+badge+'</div>';
  }).join('');

  var allOk=withEan.every(function(c){var ri=eanRingMap[c.ean.trim()];return ri!=null&&ri>=0;});
  el.innerHTML='<div style="background:'+(allOk?'#f0f8ed':'#fff8e1')+';border:1px solid '+(allOk?'#c3e6cb':'#ffe082')
    +';border-radius:6px;padding:8px 10px;margin-bottom:10px">'
    +'<div style="font-weight:700;font-size:11px;margin-bottom:4px">Deelnemers per ring</div>'
    +rows+'</div>';
}

// ─── CRUD netburen + ringen ───────────────────────────────────────────────────

function saveNetbuur(){
  var name=document.getElementById('nbName').value.trim();
  var ean=document.getElementById('nbEan').value.trim();
  var adres=document.getElementById('nbAdres').value.trim();
  var lat=parseFloat(document.getElementById('nbLat').value);
  var lng=parseFloat(document.getElementById('nbLng').value);
  var note=document.getElementById('nbNote').value.trim();
  var ringId=document.getElementById('nbRingSelect')&&document.getElementById('nbRingSelect').value;

  if(!name&&!ean){notify('Vul minimaal een naam of EAN in',false);return;}
  var p=ap();if(!p)return;
  if(!p.msRingen)p.msRingen=[];

  var ring=null;
  if(ringId){for(var i=0;i<p.msRingen.length;i++){if(p.msRingen[i].id===ringId){ring=p.msRingen[i];break;}}}
  if(!ring){
    ring={id:_kUid(),label:'Ring '+(p.msRingen.length+1),netburen:[]};
    p.msRingen.push(ring);
  }
  ring.netburen.push({id:_kUid(),name:name,ean:ean.replace(/\D/g,''),adres:adres,
    lat:isNaN(lat)?null:lat,lng:isNaN(lng)?null:lng,note:note});
  saveMeta();
  _renderNetburenModal();
  renderKaart();
  document.getElementById('nbName').value='';
  document.getElementById('nbEan').value='';
  document.getElementById('nbAdres').value='';
  document.getElementById('nbLat').value='';
  document.getElementById('nbLng').value='';
  document.getElementById('nbNote').value='';
  notify('Netbuur toegevoegd aan '+ring.label);
}

function deleteNetbuur(nbId,ringId){
  var p=ap();if(!p||!p.msRingen)return;
  for(var i=0;i<p.msRingen.length;i++){
    if(p.msRingen[i].id===ringId){
      p.msRingen[i].netburen=p.msRingen[i].netburen.filter(function(n){return n.id!==nbId;});
      break;
    }
  }
  saveMeta();_renderNetburenModal();renderKaart();notify('Netbuur verwijderd');
}

function deleteRing(ringId){
  if(!confirm('Ring en alle bijbehorende netburen verwijderen?'))return;
  var p=ap();if(!p||!p.msRingen)return;
  p.msRingen=p.msRingen.filter(function(r){return r.id!==ringId;});
  // Hernummer labels
  p.msRingen.forEach(function(r,i){if(/^Ring \d+$/.test(r.label))r.label='Ring '+(i+1);});
  saveMeta();_renderNetburenModal();renderKaart();notify('Ring verwijderd');
}

// ─── CSV / XLSX import (nieuwe ring) ─────────────────────────────────────────

function importNetburenFile(file){
  if(!file)return;
  var isXlsx=/\.xlsx$/i.test(file.name);
  var r=new FileReader();
  r.onload=function(e){
    var rows;
    if(isXlsx){
      if(typeof XLSX==='undefined'){notify('XLSX-bibliotheek niet geladen',false);return;}
      var wb=XLSX.read(new Uint8Array(e.target.result),{type:'array'});
      var ws=wb.Sheets[wb.SheetNames[0]];
      rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
      rows=rows.filter(function(row){return row.some(function(c){return String(c).trim();});});
      if(rows.length&&!/^\d{13,18}$/.test(String(rows[0][rows[0].length-1]).trim()))rows=rows.slice(1);
    } else {
      var txt=e.target.result;
      var lines=txt.replace(/\r/g,'').split('\n').filter(function(l){return l.trim();});
      if(!lines.length){notify('Leeg bestand',false);return;}
      var delim=(lines[0].split(';').length>=lines[0].split(',').length)?';':',';
      var startIdx=0;
      var first=lines[0].split(delim);
      if(!/^\d{13,18}$/.test(first[first.length-1].trim()))startIdx=1;
      rows=lines.slice(startIdx).map(function(l){
        return l.split(delim).map(function(c){return c.trim().replace(/^"|"$/g,'');});
      });
    }
    if(!rows.length){notify('Geen gegevens gevonden',false);return;}
    _processNetburenRows(rows);
  };
  r.onerror=function(){notify('Kan bestand niet lezen',false);};
  isXlsx?r.readAsArrayBuffer(file):r.readAsText(file,'UTF-8');
}

function _processNetburenRows(rows){
  var p=ap();if(!p)return;
  if(!p.msRingen)p.msRingen=[];

  // Maak een nieuwe ring aan voor deze upload
  var ringNr=p.msRingen.length+1;
  var ring={id:_kUid(),label:'Ring '+ringNr,netburen:[]};
  p.msRingen.push(ring);

  // Deduplicatie binnen de nieuwe ring (EAN-basis)
  var existing={};
  var added=0;
  rows.forEach(function(cols){
    cols=cols.map(function(c){return String(c==null?'':c).trim();});
    if(cols.length<5)return;
    var straat=cols[0]||'',huisnr=cols[1]||'',huistoe=cols[2]||'';
    var plaats=cols[3]||'',postcode=cols[4]||'',ean=cols[5]||'';
    if(!ean&&cols.length===5){ean=cols[4];postcode=cols[3];plaats=cols[2];huistoe='';}
    ean=ean.replace(/\D/g,'');
    if(!ean||existing[ean])return;
    var huisvol=huisnr+(huistoe?('-'+huistoe):'');
    var adres=[straat+' '+huisvol,postcode,plaats].filter(Boolean).join(', ').replace(/\s+/g,' ').trim();
    ring.netburen.push({id:_kUid(),name:adres,ean:ean,adres:adres,lat:null,lng:null,note:''});
    existing[ean]=true;added++;
  });

  saveMeta();
  _renderNetburenModal();
  notify(added+' netburen toegevoegd als '+ring.label);
  geocodeNetburen();
}

// ─── Geocoding (Nominatim) ────────────────────────────────────────────────────

function geocodeNetburen(){
  if(_geocoding)return;
  var p=ap();if(!p||!p.msRingen)return;
  var queue=[];
  (p.msRingen||[]).forEach(function(ring){
    (ring.netburen||[]).forEach(function(n){
      if((n.lat==null||isNaN(n.lat))&&n.adres)queue.push({ring:ring,nb:n});
    });
  });
  if(!queue.length){notify('Alle netburen hebben al coördinaten');_renderNetburenModal();return;}
  _geocoding=true;
  var idx=0;
  var progressEl=document.getElementById('nbGeoProgress');
  if(progressEl)progressEl.style.display='';

  function step(){
    if(idx>=queue.length){
      _geocoding=false;
      saveMeta();_renderNetburenModal();renderKaart();
      if(progressEl)progressEl.style.display='none';
      notify('Geocoding klaar — '+queue.length+' adressen verwerkt');
      return;
    }
    var item=queue[idx];
    if(progressEl)progressEl.textContent='📍 Geocoding '+(idx+1)+'/'+queue.length+': '+(item.nb.adres||item.nb.ean);
    _geocodeSingle(item.nb.adres,function(result){
      if(result){item.nb.lat=result.lat;item.nb.lng=result.lng;}
      idx++;
      _geocodeTimer=setTimeout(step,1100);
    });
  }
  step();
}

function geocodeCompAdres(){
  var adres=document.getElementById('cAdres').value.trim();
  if(!adres){notify('Vul eerst een adres in',false);return;}
  var btn=document.getElementById('btnGeoComp');
  if(btn){btn.disabled=true;btn.textContent='⌛';}
  _geocodeSingle(adres,function(result){
    if(btn){btn.disabled=false;btn.textContent='📍 Zoek';}
    if(result){
      document.getElementById('cLat').value=result.lat.toFixed(6);
      document.getElementById('cLng').value=result.lng.toFixed(6);
      notify('Coördinaten gevonden');
    }else{notify('Adres niet gevonden — vul lat/lng handmatig in',false);}
  });
}

function geocodeNbSingle(){
  var adres=document.getElementById('nbAdres').value.trim();
  if(!adres){notify('Vul eerst een adres in',false);return;}
  var btn=document.getElementById('btnNbGeoSingle');
  if(btn){btn.disabled=true;btn.textContent='⌛';}
  _geocodeSingle(adres,function(result){
    if(btn){btn.disabled=false;btn.textContent='📍 Zoek';}
    if(result){
      document.getElementById('nbLat').value=result.lat.toFixed(6);
      document.getElementById('nbLng').value=result.lng.toFixed(6);
      notify('Coördinaten gevonden');
    }else{notify('Adres niet gevonden',false);}
  });
}

function _geocodeSingle(adres,cb){
  var url='https://nominatim.openstreetmap.org/search?q='
    +encodeURIComponent(adres)+'&format=json&limit=1&countrycodes=nl';
  fetch(url,{headers:{'User-Agent':'Energiegroepsprofiel-app (impulszeeland.nl)'}})
    .then(function(r){return r.json();})
    .then(function(data){
      if(data&&data.length)cb({lat:parseFloat(data[0].lat),lng:parseFloat(data[0].lon)});
      else cb(null);
    })
    .catch(function(){cb(null);});
}

// ─── Event listeners ─────────────────────────────────────────────────────────

function initKaartEvents(){
  var btnClose=document.getElementById('btnCloseNetbuur');
  if(btnClose)btnClose.addEventListener('click',function(){hideM('mNetbuur');});
  var btnClose2=document.getElementById('btnCloseNetbuur2');
  if(btnClose2)btnClose2.addEventListener('click',function(){hideM('mNetbuur');});
  var mNb=document.getElementById('mNetbuur');
  if(mNb)mNb.addEventListener('click',function(e){if(e.target===this)hideM('mNetbuur');});

  var nbDropBtn=document.getElementById('nbDropBtn');
  var nbFileIn=document.getElementById('nbFileIn');
  if(nbDropBtn&&nbFileIn){
    nbDropBtn.addEventListener('click',function(){nbFileIn.click();});
    nbFileIn.addEventListener('change',function(){importNetburenFile(this.files[0]);this.value='';});
  }
  var nbDrop=document.getElementById('nbDrop');
  if(nbDrop){
    nbDrop.addEventListener('dragover',function(e){e.preventDefault();this.style.background='#f0f8ed';});
    nbDrop.addEventListener('dragleave',function(){this.style.background='';});
    nbDrop.addEventListener('drop',function(e){
      e.preventDefault();this.style.background='';
      var f=e.dataTransfer.files[0];if(f)importNetburenFile(f);
    });
  }

  var btnGeoAll=document.getElementById('btnNbGeoAll');
  if(btnGeoAll)btnGeoAll.addEventListener('click',geocodeNetburen);
  var btnGeoSingle=document.getElementById('btnNbGeoSingle');
  if(btnGeoSingle)btnGeoSingle.addEventListener('click',geocodeNbSingle);
  var btnGeoComp=document.getElementById('btnGeoComp');
  if(btnGeoComp)btnGeoComp.addEventListener('click',geocodeCompAdres);

  var btnSaveNb=document.getElementById('btnSaveNetbuur');
  if(btnSaveNb)btnSaveNb.addEventListener('click',saveNetbuur);

  var btnPng=document.getElementById('btnKaartPng');
  if(btnPng)btnPng.addEventListener('click',screenshotKaart);

  var btnNb=document.getElementById('btnNetburen');
  if(btnNb)btnNb.addEventListener('click',openNetburenModal);
}
