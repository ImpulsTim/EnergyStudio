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

// Alle EAN's van één netbuur. Eén adres uit de netburenscan kan meerdere aansluitingen
// hebben (kolommen EAN 1..5); oudere data heeft alleen het enkelvoudige n.ean.
function _nbEans(n){
  if(!n)return [];
  if(n.eans&&n.eans.length)return n.eans.filter(Boolean);
  return n.ean?[n.ean]:[];
}
// Primaire EAN — voor labels, dedup-sleutels en terugval op oud gedrag
function _nbEan1(n){var e=_nbEans(n);return e.length?String(e[0]).trim():'';}
// Is dit adres al een projectdeelnemer? (één van de EAN's volstaat)
function _nbIsDeelnemer(n,compEanSet){
  return _nbEans(n).some(function(e){return !!compEanSet[String(e).trim()];});
}

// Geeft de ringindex voor een EAN (-1 = niet gevonden)
function _kaartRingIdx(ean,msRingen){
  if(!ean)return -1;
  var e=ean.trim();
  for(var i=0;i<(msRingen||[]).length;i++){
    var nb=msRingen[i].netburen||[];
    for(var j=0;j<nb.length;j++){
      var eans=_nbEans(nb[j]);
      for(var k=0;k<eans.length;k++){if(String(eans[k]).trim()===e)return i;}
    }
  }
  return -1;
}

// ─── Initialisatie ────────────────────────────────────────────────────────────

function initKaart(){
  if(_kaartMap)return;
  var el=document.getElementById('kaartMap');
  if(!el||typeof L==='undefined')return;
  _kaartMap=L.map('kaartMap',{preferCanvas:false,zoomSnap:0.05,zoomDelta:0.05,wheelPxPerZoomLevel:60}).setView([51.50,3.80],12);
  // Esri Light Gray Canvas: grijze, rustige ondergrond (bedoeld om data overheen te
  // leggen), zonder API-key en met CORS — dat laatste is nodig voor de html-to-image
  // rapport-capture. Vervangt CARTO Positron, dat key-loos gebruik sinds kort over de
  // tegels heen stempelt met "API KEY REQUIRED"; daarvóór stond hier OSM.
  // Twee lagen: ondergrond (zonder tekst) + los labelvlak, zoals Esri ze aanbiedt.
  var esri='https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/';
  var esriOpt={attribution:'Tegels © <a href="https://www.esri.com">Esri</a> — bronnen: HERE, Garmin, © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    crossOrigin:'anonymous',maxZoom:20,maxNativeZoom:16};
  var _base=L.tileLayer(esri+'World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',esriOpt).addTo(_kaartMap);
  L.tileLayer(esri+'World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
    Object.assign({},esriOpt,{attribution:''})).addTo(_kaartMap);
  // Valt de tegelbron uit, dan terug naar de standaard OSM-tegels i.p.v. een lege kaart.
  var _tileErr=0;
  _base.on('tileerror',function(){
    if(++_tileErr!==6)return;
    _kaartMap.removeLayer(_base);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
      attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      crossOrigin:'anonymous',maxZoom:19
    }).addTo(_kaartMap);
  });
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

  // EAN → eerste ringIndex (voor projectdeelnemers-koppeling)
  var eanRingMap={};
  msRingen.forEach(function(ring,ri){
    (ring.netburen||[]).forEach(function(n){
      _nbEans(n).forEach(function(e){
        var key=String(e).trim();
        if(key&&!(key in eanRingMap))eanRingMap[key]=ri;
      });
    });
  });

  // EAN → alle ringIndices (voor overlap-detectie)
  var multiRingMap={};
  msRingen.forEach(function(ring,ri){
    (ring.netburen||[]).forEach(function(n){
      _nbEans(n).forEach(function(e){
        var key=String(e).trim();
        if(!key)return;
        if(!multiRingMap[key])multiRingMap[key]=[];
        if(multiRingMap[key].indexOf(ri)<0)multiRingMap[key].push(ri);
      });
    });
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
        &&!_nbIsDeelnemer(n,compEanSet);
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

  // ── Netburen per ring — cirkels (met overlap-detectie) ──
  var drawnNb={};
  msRingen.forEach(function(ring,ri){
    var ringCol=RING_PAL[ri%RING_PAL.length];
    (ring.netburen||[]).forEach(function(n){
      if(n.lat==null||n.lng==null||isNaN(n.lat)||isNaN(n.lng))return;
      if(_nbIsDeelnemer(n,compEanSet))return;
      // Deduplicatie: elk uniek punt slechts één keer tekenen
      var e1=_nbEan1(n);
      var dedup=e1||((+n.lat).toFixed(5)+','+(+n.lng).toFixed(5));
      if(drawnNb[dedup])return;
      drawnNb[dedup]=true;
      var ringIndices=e1?(multiRingMap[e1]||[ri]):[ri];
      var m=ringIndices.length>1
        ?_kaartMultiRingMarker(n,ringIndices,msRingen)
        :_kaartSingleNbMarker(n,ringCol,ring.label);
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

// Enkelvoudige netbuur-marker (één ring) — behoud bestaande circleMarker stijl
function _kaartSingleNbMarker(n,ringCol,ringLabel){
  var m=L.circleMarker([+n.lat,+n.lng],{
    radius:7,fillColor:ringCol,color:'#fff',weight:1.5,fillOpacity:0.8,opacity:1
  });
  var hasCustomName=n.name&&n.name!==n.adres&&n.name!==n.ean&&n.name!=='';
  var nbLbl=hasCustomName?n.name:(n.adres||_nbEan1(n)||'');
  if(nbLbl.length>20)nbLbl=nbLbl.slice(0,19)+'…';
  m.bindTooltip(_kEsc(nbLbl),{permanent:true,direction:'top',className:'kaart-label-sm',offset:[0,-7]});
  var tip='<strong>'+_kEsc(n.name||n.adres||'?')+'</strong>'
    +' <span style="background:'+ringCol+';color:#fff;border-radius:3px;padding:1px 5px;font-size:10px">'+_kEsc(ringLabel)+'</span>';
  tip+=_nbEanTip(n);
  if(n.adres)tip+='<br>'+_kEsc(n.adres);
  if(n.note)tip+='<br><em>'+_kEsc(n.note)+'</em>';
  m.bindPopup(tip,{className:'kaart-pop',maxWidth:240});
  return m;
}

// Multi-ring netbuur-marker — taartpunt-stijl divIcon
function _kaartMultiRingMarker(n,ringIndices,msRingen){
  var r=9; // iets groter dan enkelvoudige netbuur (7px)
  var cols=ringIndices.map(function(ri){return RING_PAL[ri%RING_PAL.length];});
  var segDeg=360/cols.length;
  var grad='conic-gradient('+cols.map(function(c,i){
    return c+' '+Math.round(i*segDeg)+'deg '+Math.round((i+1)*segDeg)+'deg';
  }).join(',')+')';
  var icon=L.divIcon({
    className:'kaart-multi-ring-wrap',
    html:'<div style="width:'+(r*2)+'px;height:'+(r*2)+'px;border-radius:50%;'
      +'background:'+grad+';border:2.5px solid #fff;'
      +'box-shadow:0 1px 5px rgba(0,0,0,.45)"></div>',
    iconSize:[r*2+5,r*2+5],
    iconAnchor:[r+2,r+2]
  });
  var ringLabels=ringIndices.map(function(ri){return msRingen[ri].label;}).join(' + ');
  var m=L.marker([+n.lat,+n.lng],{icon:icon});
  var hasCustomName=n.name&&n.name!==n.adres&&n.name!==n.ean&&n.name!=='';
  var nbLbl=hasCustomName?n.name:(n.adres||_nbEan1(n)||'');
  if(nbLbl.length>20)nbLbl=nbLbl.slice(0,19)+'…';
  m.bindTooltip(_kEsc(nbLbl),{permanent:true,direction:'top',
    className:'kaart-label-sm kaart-label-multi',offset:[0,-(r+4)]});
  // Popup toont alle ringen als gekleurde badges
  var badges=ringIndices.map(function(ri){
    var col=RING_PAL[ri%RING_PAL.length];
    return '<span style="background:'+col+';color:#fff;border-radius:3px;padding:1px 5px;font-size:10px;margin-right:2px">'+_kEsc(msRingen[ri].label)+'</span>';
  }).join('');
  var tip='<strong>'+_kEsc(n.name||n.adres||'?')+'</strong> '+badges;
  tip+=_nbEanTip(n);
  if(n.adres)tip+='<br>'+_kEsc(n.adres);
  m.bindPopup(tip,{className:'kaart-pop',maxWidth:260});
  return m;
}

// EAN-regel(s) voor een netbuur-popup — of de matchstatus als er geen EAN is
function _nbEanTip(n){
  var eans=_nbEans(n);
  if(!eans.length){
    return '<br><span style="color:#e67e22;font-size:10px">'
      +_kEsc(n.matchstatus?('Geen EAN — '+n.matchstatus):'Geen EAN in scan')+'</span>';
  }
  return '<br><span style="font-family:monospace;font-size:10px">EAN: '
    +eans.map(_kEsc).join('<br>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;')+'</span>';
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

  // Detecteer of er multi-ring netburen zijn
  var multiRingMapLeg={};
  msRingen.forEach(function(ring,ri){
    (ring.netburen||[]).forEach(function(n){
      _nbEans(n).forEach(function(e){
        var key=String(e).trim();
        if(!key)return;
        if(!multiRingMapLeg[key])multiRingMapLeg[key]=[];
        if(multiRingMapLeg[key].indexOf(ri)<0)multiRingMapLeg[key].push(ri);
      });
    });
  });
  var hasMulti=Object.keys(multiRingMapLeg).some(function(k){return multiRingMapLeg[k].length>1;});

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
  if(hasMulti){
    var c0=RING_PAL[0],c1=RING_PAL[1];
    items.push(
      '<span class="kaart-leg-item" style="color:#555">'
      +'<span style="display:inline-block;width:14px;height:14px;border-radius:50%;'
      +'background:conic-gradient('+c0+' 0deg 180deg,'+c1+' 180deg 360deg);'
      +'border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.3);vertical-align:middle;margin-right:5px"></span>'
      +'Netbuur in meerdere ringen</span>'
    );
  }

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
    (ring.netburen||[]).forEach(function(n){
      _nbEans(n).forEach(function(e){if(e)eanInNb[String(e).trim()]=true;});
    });
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
    var nGeenEan=nb.filter(function(n){return !_nbEans(n).length;}).length;
    // Deelnemersnamen die in deze ring voorkomen (elke EAN van een adres telt mee)
    var inProjNamen=[];
    nb.forEach(function(n){
      _nbEans(n).forEach(function(e){
        var nm=compEanSet[String(e).trim()];
        if(nm&&inProjNamen.indexOf(nm)<0)inProjNamen.push(nm);
      });
    });

    var inProjHtml=inProjNamen.length
      ? inProjNamen.map(function(nm){
          return '<span style="display:inline-block;background:'+col+';color:#fff;border-radius:3px;padding:1px 6px;font-size:10px;margin:1px">'+_kEsc(nm)+'</span>';
        }).join('')
      : '<span style="color:#aaa;font-size:11px">geen deelnemers in deze ring</span>';

    var nbRows=nb.map(function(n){
      var geo=n.lat!=null&&!isNaN(n.lat)?'✓':'⚠';
      var geoCol=n.lat!=null&&!isNaN(n.lat)?'#46962b':'#e67e22';
      // Toon bedrijfsnaam (vet) apart van adres als ze verschillen
      var hasCustomName=(n.name&&n.name!==n.adres&&n.name!==''&&n.name!==n.ean);
      var eans=_nbEans(n);
      var nameHtml=hasCustomName
        ?'<span style="font-weight:600">'+_kEsc(n.name)+'</span>'
         +'<span style="color:#aaa;font-size:10px;margin-left:4px">'+_kEsc(n.adres||'')+'</span>'
        :'<span style="color:#555">'+_kEsc(n.adres||eans[0]||'?')+'</span>'
         +'<span style="color:#bbb;font-size:10px;margin-left:4px;font-style:italic">geen naam</span>';

      // EAN-kolom: eerste EAN + "+N" bij meerdere; zonder EAN de matchstatus uit de scan
      var eanHtml;
      if(eans.length){
        eanHtml='<span title="'+_kEsc(eans.join(' · '))+'" style="font-family:monospace;font-size:10px;color:#bbb;flex-shrink:0">'
          +_kEsc(eans[0])+(eans.length>1?'<span style="color:#888;font-weight:600"> +'+(eans.length-1)+'</span>':'')+'</span>';
      }else{
        eanHtml='<span style="flex-shrink:0;background:#fff3e0;color:#e67e22;border-radius:3px;padding:1px 6px;font-size:10px">'
          +_kEsc(n.matchstatus||'geen EAN')+'</span>';
      }

      return '<div id="nb-row-'+n.id+'" style="display:flex;align-items:center;gap:5px;font-size:11px;padding:3px 0;border-bottom:1px solid #f0f0f0">'
        +'<span style="color:'+geoCol+';flex-shrink:0;width:12px">'+geo+'</span>'
        +'<span id="nb-nm-'+n.id+'" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+nameHtml+'</span>'
        +eanHtml
        +'<button onclick="editNetbuurName(\''+n.id+'\',\''+ring.id+'\')" title="Naam bewerken" '
          +'style="color:#2c7fb8;background:none;border:none;cursor:pointer;font-size:12px;padding:0 3px;flex-shrink:0">✏</button>'
        +'<button onclick="deleteNetbuur(\''+n.id+'\',\''+ring.id+'\')" title="Verwijderen" '
          +'style="color:#c0392b;background:none;border:none;cursor:pointer;font-size:13px;padding:0 2px;flex-shrink:0">×</button>'
        +'</div>';
    }).join('');

    return '<div class="nb-ring-block" style="border-left:4px solid '+col+';padding:8px 10px;margin-bottom:10px;background:#fafafa;border-radius:0 6px 6px 0">'
      +'<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">'
      +'<span style="font-weight:700;font-size:13px">'+_kEsc(ring.label)+'</span>'
      +'<span style="font-size:11px;color:#888">'+nb.length+' netburen · '+nGeo+' geocoded'
      +(nGeenEan?' · <span style="color:#e67e22">'+nGeenEan+' zonder EAN</span>':'')+'</span>'
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
    (ring.netburen||[]).forEach(function(n){
      _nbEans(n).forEach(function(e){if(e)eanRingMap[String(e).trim()]=ri;});
    });
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
  var eanClean=ean.replace(/\D/g,'');
  ring.netburen.push({id:_kUid(),name:name,ean:eanClean,eans:eanClean?[eanClean]:[],adres:adres,
    lat:isNaN(lat)?null:lat,lng:isNaN(lng)?null:lng,note:note,matchstatus:''});
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
//
// Twee formaten worden herkend, op kolomkop:
//   nieuw — Adres ; Postcode ; Plaatsnaam ; EAN 1..5 ; Bedrijfsnaam_EAN ; Matchstatus
//   oud   — Straat ; Huisnummer ; Huisnummertoevoeging ; Plaats ; Postcode ; EAN
// Zonder herkenbare kopregel valt de import terug op de oude positielogica.

// Kolomkop normaliseren: "EAN 1" → ean1, "Bedrijfsnaam_EAN" → bedrijfsnaamean
function _nbNorm(s){
  return String(s==null?'':s).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9]/g,'');
}

// Zoekt kolomindices op kopnaam. Levert null als de kopregel niet herkend wordt.
function _nbHeaderMap(hdr){
  function find(syns){
    for(var i=0;i<hdr.length;i++){if(syns.indexOf(_nbNorm(hdr[i]))>=0)return i;}
    return -1;
  }
  var map={
    adres:    find(['adres','straatennummer','straatenhuisnummer','adresregel']),
    postcode: find(['postcode','pc']),
    plaats:   find(['plaatsnaam','plaats','woonplaats']),
    straat:   find(['straat','straatnaam']),
    huisnr:   find(['huisnummer','huisnr','nummer']),
    huistoe:  find(['huisnummertoevoeging','toevoeging','huisnrtoevoeging']),
    naam:     find(['bedrijfsnaamean','bedrijfsnaam','naam','bedrijf']),
    status:   find(['matchstatus','status']),
    eanCols:  []
  };
  for(var i=0;i<hdr.length;i++){
    var h=_nbNorm(hdr[i]);
    if(/^ean\d*$/.test(h)||h==='eancode')map.eanCols.push(i);
  }
  // Een kopregel telt pas als er minstens één EAN-kolom én een adreskolom staat
  if(!map.eanCols.length)return null;
  if(map.adres<0&&map.straat<0)return null;
  return map;
}

// Splitst een CSV-regel met respect voor aanhalingstekens ("" = letterlijk ").
// Nodig omdat het adres in het nieuwe format één vrij tekstveld is dat een komma kan bevatten.
function _nbSplit(line,delim){
  var out=[],cur='',inQ=false;
  for(var i=0;i<line.length;i++){
    var ch=line[i];
    if(inQ){
      if(ch==='"'){if(line[i+1]==='"'){cur+='"';i++;}else inQ=false;}
      else cur+=ch;
    }else if(ch==='"')inQ=true;
    else if(ch===delim){out.push(cur);cur='';}
    else cur+=ch;
  }
  out.push(cur);
  return out.map(function(c){return c.trim();});
}

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
      // raw:false → celwaarden als geformatteerde tekst. Een EAN van 18 cijfers past niet
      // in Number.MAX_SAFE_INTEGER; als Excel hem als getal opslaat gaan anders de laatste
      // cijfers verloren. _processNetburenRows waarschuwt als er alsnog EAN's sneuvelen.
      rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:'',raw:false});
      rows=rows.filter(function(row){return row.some(function(c){return String(c).trim();});});
    } else {
      var txt=String(e.target.result).replace(/^\uFEFF/,'');
      var lines=txt.replace(/\r/g,'').split('\n').filter(function(l){return l.trim();});
      if(!lines.length){notify('Leeg bestand',false);return;}
      // Scheidingsteken: het meest voorkomende op de eerste regel, bij gelijkspel ';'
      var cand=[';',',','\t'],delim=';',best=-1;
      cand.forEach(function(d){
        var n=lines[0].split(d).length;
        if(n>best){best=n;delim=d;}
      });
      rows=lines.map(function(l){return _nbSplit(l,delim);});
    }
    if(!rows.length){notify('Geen gegevens gevonden',false);return;}

    var map=_nbHeaderMap(rows[0]||[]);
    if(map){
      rows=rows.slice(1);               // kopregel herkend → overslaan
    }else{
      // Geen herkenbare koppen: oude positielogica, inclusief kopregel-gok
      var last=rows[0][rows[0].length-1];
      if(!/^\d{13,18}$/.test(String(last==null?'':last).trim()))rows=rows.slice(1);
    }
    if(!rows.length){notify('Geen gegevens gevonden',false);return;}
    _processNetburenRows(rows,map);
  };
  r.onerror=function(){notify('Kan bestand niet lezen',false);};
  isXlsx?r.readAsArrayBuffer(file):r.readAsText(file,'UTF-8');
}

// BRESKENS → Breskens (scans leveren plaatsnamen in kapitalen; leest slecht als kaartlabel)
function _nbTitel(s){
  s=String(s||'').trim();
  if(!s||s!==s.toUpperCase())return s;   // gemengde schrijfwijze laten staan
  return s.toLowerCase().replace(/(^|[\s'\-])([a-z])/g,function(m,pre,ch){return pre+ch.toUpperCase();});
}

function _processNetburenRows(rows,map){
  var p=ap();if(!p)return;
  if(!p.msRingen)p.msRingen=[];

  // Maak een nieuwe ring aan voor deze upload
  var ringNr=p.msRingen.length+1;
  var ring={id:_kUid(),label:'Ring '+ringNr,netburen:[]};
  p.msRingen.push(ring);

  // Deduplicatie binnen de nieuwe ring: op EAN, of op adres als de rij geen EAN heeft
  var existing={};
  var added=0,eanTotaal=0,zonderEan=0,onleesbaar=0;

  rows.forEach(function(cols){
    cols=cols.map(function(c){return String(c==null?'':c).trim();});
    var adres='',naam='',status='',eans=[];

    function cel(i){return (i!=null&&i>=0)?(cols[i]||''):'';}

    if(map){
      var pc=cel(map.postcode),plaats=_nbTitel(cel(map.plaats));
      var straatdeel;
      if(map.adres>=0){
        straatdeel=cel(map.adres);
      }else{
        var hn=cel(map.huisnr),ht=cel(map.huistoe);
        straatdeel=(cel(map.straat)+' '+hn+(ht?('-'+ht):'')).trim();
      }
      adres=[straatdeel,pc,plaats].filter(Boolean).join(', ').replace(/\s+/g,' ').trim();
      naam=cel(map.naam);
      status=cel(map.status);
      map.eanCols.forEach(function(ci){
        var raw=cols[ci]||'';
        if(!raw)return;
        var e=raw.replace(/\D/g,'');
        // Te kort = geen bruikbare EAN. Meestal een Excel-cel die als getal is opgeslagen
        // en daardoor als 8,7169E+17 is uitgelezen.
        if(e.length<13){onleesbaar++;return;}
        if(eans.indexOf(e)<0)eans.push(e);
      });
    }else{
      // Oude positielogica: Straat ; Huisnummer ; Toevoeging ; Plaats ; Postcode ; EAN
      if(cols.length<5)return;
      var straat=cols[0]||'',huisnr=cols[1]||'',huistoe=cols[2]||'';
      var plaats2=cols[3]||'',postcode2=cols[4]||'',ean=cols[5]||'';
      if(!ean&&cols.length===5){ean=cols[4];postcode2=cols[3];plaats2=cols[2];huistoe='';}
      ean=ean.replace(/\D/g,'');
      if(ean)eans.push(ean);
      var huisvol=huisnr+(huistoe?('-'+huistoe):'');
      adres=[straat+' '+huisvol,postcode2,plaats2].filter(Boolean).join(', ').replace(/\s+/g,' ').trim();
    }

    if(!eans.length&&!adres)return;

    var key=eans.length?eans[0]:('@'+_nbNorm(adres));
    if(existing[key])return;
    existing[key]=true;

    ring.netburen.push({id:_kUid(),name:naam||adres,ean:eans[0]||'',eans:eans,
      adres:adres,lat:null,lng:null,note:'',matchstatus:status});
    added++;eanTotaal+=eans.length;
    if(!eans.length)zonderEan++;
  });

  saveMeta();
  _renderNetburenModal();
  var msg=ring.label+': '+added+' adressen · '+eanTotaal+' EAN\'s';
  if(zonderEan)msg+=' · '+zonderEan+' zonder match';
  notify(msg);
  if(onleesbaar){
    notify(onleesbaar+' EAN-cel(len) onleesbaar — sla de EAN-kolom in Excel op als tekst',false);
  }
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

  var btnLbl=document.getElementById('btnKaartLabels');
  if(btnLbl){
    var _lblState=0; // 0=alle aan, 1=alleen deelnemers, 2=alle uit
    var _lblStates=[
      {cls:'',           label:'🏷 Alle labels',     bg:'#46962b'},
      {cls:'labels-deelnemers', label:'🏷 Deelnemers',   bg:'#2c7fb8'},
      {cls:'labels-hidden',    label:'🏷 Labels uit',    bg:'#888'}
    ];
    function _applyLblState(){
      var map=document.getElementById('kaartMap');
      if(!map)return;
      _lblStates.forEach(function(s){if(s.cls)map.classList.remove(s.cls);});
      var st=_lblStates[_lblState];
      if(st.cls)map.classList.add(st.cls);
      btnLbl.textContent=st.label;
      btnLbl.style.background=st.bg;
    }
    _applyLblState();
    btnLbl.addEventListener('click',function(){
      _lblState=(_lblState+1)%_lblStates.length;
      _applyLblState();
    });
  }
}
