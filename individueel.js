// Individuele analyse — losstaande module voor de analyse van één aansluiting.
// Hergebruikt de projectstructuur, aansluitingen en IndexedDB-tijdreeksen ('ts')
// van de GTO-tool en leunt op gedeelde helpers (ap, dbGet, _carrierSeries, isDL,
// sdesc, ax, fmt, CH/dC, notify, PAL, MND). Toont kengetallen, netcongestie,
// top-10 pieken en jaar/week/maand-profiel + belastingduurkrommen, zoals de
// handmatige Excel-analyse (IZ_E_ANALYSE_*.pdf) maar in de Energy Studio-huisstijl.
// Elektra-only (GTV/kW-semantiek is elektrisch).

var _indSelId=null;   // geselecteerde aansluiting (company id)
var _indLast=null;    // {c, a} laatst berekende analyse (voor het rapport)

// Vastgestelde keuze, geïsoleerd als swap-punt zodat ze los te wisselen is:
//   piekdal  'contract' = app-conventie isDL (weekend/feestdag/23–07u = dal);
//            'klok'     = puur 07–23u piek / 23–07u dal (letterlijke Excel-labels).
var IND_CFG={piekdal:'contract'};

// --- Hulpjes -----------------------------------------------------------------
function _indProj(){return ap();}

// Elektrische aansluitingen van het actieve project (legacy zonder carrier = elektra).
function _indConns(){
  var p=ap();
  if(!p||!p.companies)return[];
  return p.companies.filter(function(c){return (c.carrier||'elektra')==='elektra';});
}
function _indConn(id){var cs=_indConns();for(var i=0;i<cs.length;i++)if(cs[i].id===id)return cs[i];return null;}

function _indEsc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
function _indKw(v){if(v==null||isNaN(v))return'—';return (Math.round(v*10)/10).toLocaleString('nl-NL',{minimumFractionDigits:1,maximumFractionDigits:1});}
function _indFmtDate(ts){if(!ts)return'—';var d=new Date(ts);if(isNaN(d))return ts;return d.getDate()+' '+MND[d.getMonth()]+' '+d.getFullYear();}
function _indFmtMoment(ts){
  if(!ts)return'—';
  var d=new Date(ts);if(isNaN(d))return ts;
  var DN=['zo','ma','di','wo','do','vr','za'];
  return DN[d.getDay()]+' '+d.getDate()+' '+MND[d.getMonth()]+' '+d.getFullYear()+', '+
    String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
}

// Piek/dal-splitsing volgens IND_CFG (zie swap-punt hierboven).
function _indIsPiek(ts){
  if(IND_CFG.piekdal==='klok'){
    var d=new Date(ts);if(isNaN(d))return false;
    var h=d.getHours();return h>=7&&h<23;
  }
  return (typeof isDL==='function')?!isDL(ts):false; // 'contract': piek = niet-dal
}
function _indPiekLbls(){
  return IND_CFG.piekdal==='klok'
    ? {piek:'piekuren',dal:'daluren',def:'piek 07:00–23:00 · dal 23:00–07:00'}
    : {piek:'normaaluren',dal:'daluren',def:'normaal ma–vr 07:00–23:00 (excl. feestdagen) · dal weekend/feestdag/nacht'};
}

// --- Rekenkern ---------------------------------------------------------------
// Pure functie: bouwt het analyse-object uit een aansluiting + genormaliseerde
// reeks [{ts,kw}] (kw>0 afname, kw<0 teruglevering, kWh = |kw|*0.25). Dedupliceert
// op timestamp (laatste wint) en sorteert — neutraliseert DST-duplicaten, net als de
// intersectie in de groepsanalyse (app.js runAnalysis).
function calcInd(c,series){
  c=c||{};
  var map={};
  (series||[]).forEach(function(d){if(d&&d.ts!=null)map[String(d.ts).slice(0,16)]=(+d.kw||0);});
  var ts=Object.keys(map).sort();
  var n=ts.length;
  var kw=new Array(n);for(var q=0;q<n;q++)kw[q]=map[ts[q]];

  var gtvA=+c.gtvA||0, gtvT=+c.gtvT||0;
  var heeftGtvA=gtvA>0, heeftGtvT=gtvT>0;
  var lbl=_indPiekLbls();

  var afnameKwh=0,afnamePiekKwh=0,afnameDalKwh=0;
  var terugKwh=0,terugPiekKwh=0,terugDalKwh=0;
  var maxA=0,tsMaxA=null,maxT=0,tsMaxT=null;
  var nOverA=0,nOverT=0;
  var gA=new Array(n),gT=new Array(n);
  var mMap={};

  for(var i=0;i<n;i++){
    var v=kw[i], t=ts[i];
    var a=v>0?v:0, tg=v<0?-v:0;
    gA[i]=a;gT[i]=tg;
    var kwhA=a*0.25, kwhT=tg*0.25;
    var piek=_indIsPiek(t);
    afnameKwh+=kwhA;terugKwh+=kwhT;
    if(piek){afnamePiekKwh+=kwhA;terugPiekKwh+=kwhT;}else{afnameDalKwh+=kwhA;terugDalKwh+=kwhT;}
    if(a>maxA){maxA=a;tsMaxA=t;}
    if(tg>maxT){maxT=tg;tsMaxT=t;}
    if(heeftGtvA&&a>gtvA)nOverA++;
    if(heeftGtvT&&tg>gtvT)nOverT++;
    var ym=t.slice(0,7);
    if(!mMap[ym])mMap[ym]={a:0,t:0};
    mMap[ym].a+=kwhA;mMap[ym].t+=kwhT;
  }

  var totUren=n*0.25;

  // Top-50 (i.p.v. top-10) zodat de UI 10/25/50 kan tonen zonder herberekening.
  var topA=ts.map(function(t,i){return {ts:t,kw:gA[i]};}).sort(function(x,y){return y.kw-x.kw;}).slice(0,50);
  var topT=ts.map(function(t,i){return {ts:t,kw:gT[i]};}).sort(function(x,y){return y.kw-x.kw;}).slice(0,50);

  var mKeys=Object.keys(mMap).sort();
  var maand={keys:mKeys,
    afnameKwh:mKeys.map(function(k){return mMap[k].a;}),
    terugKwh:mKeys.map(function(k){return mMap[k].t;}),
    nettoKwh:mKeys.map(function(k){return mMap[k].a-mMap[k].t;})};

  // Gecombineerde belastingduurkromme: rauwe signed kwartierreeks aflopend gesorteerd
  // → S-curve van meeste afname (links) naar meeste teruglevering (rechts). Volledig
  // gesorteerde reeks blijft bewaard (bdkFull) zodat de grafiek bij inzoomen op een
  // deelbereik opnieuw op volle resolutie kan samplen i.p.v. de 500-punts weergave.
  var bdkFull=kw.filter(function(v){return v!=null;}).slice().sort(function(x,y){return y-x;});
  var bdk=(typeof sdesc==='function')?sdesc(bdkFull,500):bdkFull;

  var a={
    dataset:{begin:ts[0]||null,eind:ts[n-1]||null,nPunten:n,totUren:totUren,
      jaren:+(totUren/8760).toFixed(2),adres:c.adres||'',bestand:c.fileName||'',
      naam:c.name||'',ean:c.ean||'',deelnemer:c.deelnemer||''},
    aansluiting:{zekering:c.zekering||'',kva:(c.kva!=null&&c.kva!=='')?+c.kva:null,gtvA:gtvA,gtvT:gtvT},
    piekdalLbl:lbl,
    energie:{afnameKwh:afnameKwh,afnamePiekKwh:afnamePiekKwh,afnameDalKwh:afnameDalKwh,
      terugKwh:terugKwh,terugPiekKwh:terugPiekKwh,terugDalKwh:terugDalKwh,
      nettoKwh:afnameKwh-terugKwh},
    congestie:{maxA:maxA,tsMaxA:tsMaxA,maxT:maxT,tsMaxT:tsMaxT,
      overA:heeftGtvA?Math.max(0,maxA-gtvA):null,overT:heeftGtvT?Math.max(0,maxT-gtvT):null,
      nOverA:heeftGtvA?nOverA:null,nOverT:heeftGtvT?nOverT:null,
      heeftGtvA:heeftGtvA,heeftGtvT:heeftGtvT},
    topA:topA,topT:topT,maand:maand,bdk:bdk,bdkFull:bdkFull,
    serie:{ts:ts,kw:kw}
  };
  return a;
}

// --- Rendering ---------------------------------------------------------------
function renderInd(){
  var conns=_indConns();
  // Selectie valideren na projectwissel; anders de eerste aansluiting voorselecteren.
  if(_indSelId&&!_indConn(_indSelId)){_indSelId=null;_indLast=null;}
  if(!_indSelId&&conns.length)_indSelId=conns[0].id;
  renderIndList();
  var host=document.getElementById('indResults');
  if(!host)return;
  if(!conns.length){_indDestroyCharts();_indLast=null;host.innerHTML=_indEmptyHtml();return;}
  // Verse resultaten voor de huidige selectie behouden; anders de "klaar om te berekenen"-hint tonen.
  if(!_indLast||_indLast.c.id!==_indSelId){
    _indDestroyCharts();
    host.innerHTML=_indReadyHtml(_indConn(_indSelId));
  }
}

function _indEmptyHtml(){
  return '<div class="verg-empty"><div class="big">📊</div>Nog geen elektrische aansluiting. Voeg er links één toe of importeer een project.</div>';
}
function _indReadyHtml(c){
  return '<div class="verg-empty"><div class="big">📊</div>Aansluiting <strong>'+_indEsc(c?c.name:'')+'</strong> geselecteerd.<br>Klik op <strong>Bereken profiel</strong> om de analyse te tonen.</div>';
}
function _indDestroyCharts(){['indJaar','indMaand','indWeek','indBdk'].forEach(function(k){if(typeof dC==='function')dC(k);});}

function renderIndList(){
  var el=document.getElementById('indList');
  if(!el)return;
  var conns=_indConns();
  if(!conns.length){
    el.innerHTML='<div style="padding:10px 0;text-align:center;font-size:11px;color:#aaa">Nog geen elektrische aansluitingen — voeg toe of importeer.</div>';
    return;
  }
  el.innerHTML=conns.map(function(c,i){
    var on=c.id===_indSelId;
    var col=(typeof PAL!=='undefined'&&PAL[i%PAL.length])||'#888';
    return '<div class="ci'+(on?' s':'')+'" data-ind-id="'+c.id+'" style="cursor:pointer'+(on?';border-color:#46962b;background:#eef6e8':'')+'">'+
      '<div class="cn"><span class="dt" style="background:'+col+'"></span>'+_indEsc(c.name||'Aansluiting')+'</div>'+
      '<div class="cm">GTV '+(+c.gtvA||0)+' kW · <span id="indpt_'+c.id+'">…</span> pt</div></div>';
  }).join('');
  conns.forEach(function(c){
    dbGet('ts',c.id).then(function(d){var e=document.getElementById('indpt_'+c.id);if(e)e.textContent=(d&&d.length)||0;}).catch(function(){});
  });
}

// Klik op een aansluiting = selecteren + markeren; het doorrekenen gebeurt met de
// knop "Bereken profiel" (consistent met Groepsprofiel/EHP).
function selectIndConn(id){
  _indSelId=id;
  _indLast=null;
  _indDestroyCharts();
  renderIndList();
  var host=document.getElementById('indResults');
  if(host)host.innerHTML=_indReadyHtml(_indConn(id));
}

// Knop "Bereken profiel": rekent de geselecteerde aansluiting door (of de eerste,
// als er nog niets is geselecteerd).
function berekenInd(){
  if(!_indSelId){
    var cs=_indConns();
    if(!cs.length){notify('Voeg eerst een elektrische aansluiting toe',false);return;}
    _indSelId=cs[0].id;renderIndList();
  }
  runIndAnalysis(true).catch(function(e){console.error('runIndAnalysis:',e);notify('Analyse mislukt: '+e.message,false);});
}

// Laadt de reeks, berekent en rendert. Awaitbaar zodat het rapport op de live
// grafieken kan wachten alvorens ze offscreen vast te leggen. allowDemo=true valt
// (net als GTO) terug op demodata als de aansluiting nog geen meetdata heeft; het
// rapport roept zonder allowDemo aan zodat lege aansluitingen worden overgeslagen.
async function runIndAnalysis(allowDemo){
  var c=_indConn(_indSelId);
  var host=document.getElementById('indResults');
  if(!c)return;
  var raw=await dbGet('ts',c.id);
  if(!raw||!raw.length){
    if(allowDemo&&typeof genDemo==='function'){
      var idx=_indConns().indexOf(c);
      raw=genDemo(idx<0?0:idx);
      notify('Geen meetdata — demoprofiel getoond voor: '+c.name);
    }else{
      _indLast=null;_indDestroyCharts();
      if(host)host.innerHTML='<div class="verg-empty"><div class="big">⚠️</div>Geen meetdata voor <strong>'+_indEsc(c.name)+'</strong>.<br>Upload eerst een profiel via <strong>Projecten → aansluiting bewerken</strong>.</div>';
      notify('Geen meetdata — upload eerst een profiel',false);
      return;
    }
  }
  var series=(typeof _carrierSeries==='function')?_carrierSeries(c,raw):raw;
  var a=calcInd(c,series);
  _indLast={c:c,a:a};
  renderIndResults(c,a);
  try{drawIndJaar(a.serie.ts,a.serie.kw,a.aansluiting.gtvA,a.aansluiting.gtvT);}catch(e){console.error('drawIndJaar:',e);}
  try{drawIndMaand(a.maand);}catch(e){console.error('drawIndMaand:',e);}
  try{drawIndWeek(a.serie,a.aansluiting.gtvA,a.aansluiting.gtvT);}catch(e){console.error('drawIndWeek:',e);}
  try{drawIndBdk(a.bdk,a.bdkFull,a.aansluiting.gtvA,a.aansluiting.gtvT);}catch(e){console.error('drawIndBdk:',e);}
}

// KPI-kaart-hulpjes
function _indKb(l,v,u,cls){cls=cls||'';return '<div class="kb '+cls.trim()+'"><div class="kl">'+l+'</div><div class="kv">'+v+'</div>'+(u?'<div class="ku">'+u+'</div>':'')+'</div>';}
function _indKbSmall(l,v,cls){cls=cls||'';return '<div class="kb '+cls.trim()+'"><div class="kl">'+l+'</div><div class="kv" style="font-size:13px;line-height:1.25">'+v+'</div></div>';}
function _indCard(title,body){return '<div class="cd"><div class="ct2"><span class="ac"></span>'+title+'</div>'+body+'</div>';}

function renderIndResults(c,a){
  _indDestroyCharts(); // oude Chart-instanties opruimen vóór de canvassen verdwijnen
  var host=document.getElementById('indResults');
  if(!host)return;
  var lbl=a.piekdalLbl, cg=a.congestie, ds=a.dataset, ans=a.aansluiting, e=a.energie;

  // Dataset
  var datasetKg='<div class="kg">'+
    _indKb('Begindatum',_indFmtDate(ds.begin))+
    _indKb('Einddatum',_indFmtDate(ds.eind))+
    _indKb('Adres',ds.adres?_indEsc(ds.adres):'—')+
    _indKb('Profiel / bestand',ds.bestand?_indEsc(ds.bestand):'—')+
    _indKb('Meetpunten',fmt(ds.nPunten),'kwartierwaarden · ≈ '+ds.jaren.toLocaleString('nl-NL')+' jaar')+
  '</div>';

  // Aansluiting
  var aansluitingKg='<div class="kg">'+
    _indKb('Zekering aansluitpunt',ans.zekering?_indEsc(ans.zekering):'—')+
    _indKb('Fysieke capaciteit',ans.kva!=null?fmt(ans.kva):'—','kW')+
    _indKb('GTV afname',ans.gtvA?fmt(ans.gtvA):'—','kW')+
    _indKb('GTV-T teruglevering',ans.gtvT?fmt(ans.gtvT):'—','kW')+
  '</div>';

  // Energieverbruik
  var energieKg='<div class="kg">'+
    _indKb('Totaal verbruik',fmt(e.afnameKwh),'kWh')+
    _indKb('Verbruik '+lbl.piek,fmt(e.afnamePiekKwh),'kWh')+
    _indKb('Verbruik '+lbl.dal,fmt(e.afnameDalKwh),'kWh')+
    _indKb('Totale teruglevering',fmt(e.terugKwh),'kWh')+
    _indKb('Teruglevering '+lbl.piek,fmt(e.terugPiekKwh),'kWh')+
    _indKb('Teruglevering '+lbl.dal,fmt(e.terugDalKwh),'kWh')+
  '</div>'+
  '<div class="ib2" style="font-size:12px">Piek/dal-verdeling: '+lbl.def+'. Netto verbruik over de periode: <strong>'+fmt(e.nettoKwh)+' kWh</strong>.</div>';

  // Netcongestie
  var congKg='<div class="kg">'+
    _indKb('Max piekbelasting afname',_indKw(cg.maxA),'kW',cg.heeftGtvA?(cg.maxA>ans.gtvA?'red':'grn'):'')+
    _indKb('Max piekbelasting teruglevering',_indKw(cg.maxT),'kW',cg.heeftGtvT?(cg.maxT>ans.gtvT?'red':'grn'):'')+
    _indKb('Max overschrijding GTV afname',cg.heeftGtvA?(cg.overA>0?'+'+_indKw(cg.overA):'0'):'n.v.t.',cg.heeftGtvA?'kW':'',cg.heeftGtvA&&cg.overA>0?'red':'')+
    _indKb('Max overschrijding GTV terug.',cg.heeftGtvT?(cg.overT>0?'+'+_indKw(cg.overT):'0'):'n.v.t.',cg.heeftGtvT?'kW':'',cg.heeftGtvT&&cg.overT>0?'red':'')+
    _indKbSmall('Moment hoogste piek afname',_indFmtMoment(cg.tsMaxA))+
    _indKbSmall('Moment hoogste piek terug.',_indFmtMoment(cg.tsMaxT))+
    _indKb('Overschrijdingen afname',cg.heeftGtvA?fmt(cg.nOverA):'n.v.t.',cg.heeftGtvA?'kwartierwaarden > GTV':'',cg.heeftGtvA&&cg.nOverA>0?'red':(cg.heeftGtvA?'grn':''))+
    _indKb('Overschrijdingen teruglevering',cg.heeftGtvT?fmt(cg.nOverT):'n.v.t.',cg.heeftGtvT?'kwartierwaarden > GTV-T':'',cg.heeftGtvT&&cg.nOverT>0?'red':(cg.heeftGtvT?'grn':''))+
  '</div>';

  // Grafieken
  var jaarLeg='<div class="lg">'+
    '<span class="li"><span class="ld" style="background:#46962b"></span>Afname</span>'+
    '<span class="li"><span class="ld" style="background:#fbba00"></span>Teruglevering</span>'+
    (cg.heeftGtvA?'<span class="li"><span class="ld" style="background:#c0392b"></span>GTV afname</span>':'')+
    (cg.heeftGtvT?'<span class="li"><span class="ld" style="background:#e67e22"></span>GTV-T teruglevering</span>':'')+
  '</div>';
  var jaarCard='<div class="cd"><div class="ct2"><span class="ac"></span>Jaarprofiel</div>'+jaarLeg+
    '<div style="display:flex;justify-content:flex-end;gap:3px;margin-bottom:6px">'+
      '<button class="b" onclick="setIndJaarPreset(7)" style="padding:5px 9px;font-size:12px">1W</button>'+
      '<button class="b" onclick="setIndJaarPreset(30)" style="padding:5px 9px;font-size:12px">1M</button>'+
      '<button class="b" onclick="setIndJaarPreset(90)" style="padding:5px 9px;font-size:12px">3M</button>'+
      '<button class="b dk" onclick="setIndJaarPreset(0)" style="padding:5px 9px;font-size:12px">Volledig</button>'+
    '</div>'+
    '<div style="display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin-bottom:6px">'+
      '<span style="font-size:12px;color:#888">Van:</span>'+
      '<input type="date" id="indJDateStart" oninput="panIndJaar()" style="font-size:13px;font-family:Barlow,sans-serif;border:1px solid #ddd;border-radius:4px;padding:2px 5px;color:#444">'+
      '<span style="font-size:12px;color:#888">Tot:</span>'+
      '<input type="date" id="indJDateEnd" oninput="panIndJaar()" style="font-size:13px;font-family:Barlow,sans-serif;border:1px solid #ddd;border-radius:4px;padding:2px 5px;color:#444">'+
      '<span style="font-size:12px;color:#888;min-width:60px;text-align:right" id="indJZoomLbl"></span>'+
    '</div>'+
    '<div class="cw" style="height:420px"><canvas id="cIndJaar"></canvas></div></div>';
  var maandCard='<div class="cd"><div class="ct2"><span class="ac"></span>Netto verbruik per maand</div><div class="ib2" style="font-size:12px;margin-top:0">Netto = verbruik − teruglevering. Negatief betekent dat er in die maand méér is teruggeleverd dan afgenomen.</div><div class="cw" style="height:300px"><canvas id="cIndMaand"></canvas></div></div>';
  var _indMndAbbr=['Jan','Feb','Mrt','Apr','Mei','Jun','Jul','Aug','Sep','Okt','Nov','Dec'];
  var _wkBtnCss='font-size:12px;padding:5px 9px;border:none;border-radius:12px;cursor:pointer;font-family:Barlow,sans-serif';
  var _wkFilterBtns='<button data-mf="all" onclick="setIndWeekMonthFilter(\'all\')" style="'+_wkBtnCss+'">Heel het jaar</button>'+
    _indMndAbbr.map(function(m,i){return '<button data-mf="'+i+'" onclick="setIndWeekMonthFilter('+i+')" style="'+_wkBtnCss+'">'+m+'</button>';}).join('');
  var weekCard='<div class="cd"><div class="ct2"><span class="ac"></span>Weekprofiel — gemiddeld / min / max'+
    '<div id="indWeekMFilter" style="margin-left:auto;display:flex;gap:3px;flex-wrap:wrap;align-items:center">'+_wkFilterBtns+'</div></div>'+
    '<div class="ib2" style="font-size:12px;margin-top:0">Filter op maand om seizoensinvloeden te zien — het weekpatroon wordt dan alleen over de gekozen maand berekend.</div>'+
    '<div class="cw" style="height:380px"><canvas id="cIndWeek"></canvas></div></div>';
  var bdkLeg='<div class="lg">'+
    '<span class="li"><span class="ld" style="background:#46962b"></span>Afname</span>'+
    '<span class="li"><span class="ld" style="background:#fbba00"></span>Teruglevering</span>'+
    (cg.heeftGtvA?'<span class="li"><span class="ld" style="background:#c0392b"></span>GTV afname</span>':'')+
    (cg.heeftGtvT?'<span class="li"><span class="ld" style="background:#e67e22"></span>GTV-T teruglevering</span>':'')+
  '</div>';
  var bdkCard='<div class="cd"><div class="ct2"><span class="ac"></span>Belastingduurkromme'+
    '<span style="margin-left:auto;display:flex;align-items:center;gap:8px">'+
      '<span style="font-size:12px;color:#888" id="indBdkZoomLbl">Volledig bereik</span>'+
      '<button class="b dk" onclick="resetIndBdkZoom()" style="padding:4px 9px;font-size:11px">↺ Volledig</button>'+
    '</span></div>'+bdkLeg+
    '<div class="ib2" style="font-size:12px;margin-top:0">Sleep over de grafiek om in te zoomen op een deelbereik.</div>'+
    '<div class="cw" style="height:380px"><canvas id="cIndBdk"></canvas></div></div>';

  // Top-pieken tabellen met instelbaar aantal (10/25/50), patroon van de GTO-Overschrijdingen-tab.
  function topTbl(dir,title,list,gtv,heeftGtv){
    return '<div class="cd"><div class="ct2"><span class="ac"></span>'+title+
      '<span style="margin-left:auto;display:flex;align-items:center;gap:6px">'+
        '<span style="font-size:12px;color:#888">Toon:</span>'+
        '<select id="indPeakLim'+dir+'" style="font-size:13px;padding:4px 6px;border:1px solid #dce6e0;border-radius:5px">'+
          '<option value="10" selected>Top 10</option>'+
          '<option value="25">Top 25</option>'+
          '<option value="50">Top 50</option>'+
        '</select>'+
      '</span></div>'+
      '<table class="tbl"><thead><tr><th>#</th><th>Moment</th><th>Vermogen (kW)</th><th>GTV (kW)</th><th>Overschrijding</th><th>Status</th></tr></thead>'+
      '<tbody id="indPeakBody'+dir+'">'+_indPeakRows(list.slice(0,10),gtv,heeftGtv)+'</tbody></table></div>';
  }
  var topAtbl=topTbl('A','Top pieken afname',a.topA,ans.gtvA,cg.heeftGtvA);
  var topTtbl=topTbl('T','Top pieken teruglevering',a.topT,ans.gtvT,cg.heeftGtvT);

  host.innerHTML=
    _indCard('Dataset — '+_indEsc(ds.naam||c.name||'Aansluiting'),datasetKg)+
    _indCard('Aansluiting',aansluitingKg)+
    _indCard('Energieverbruik',energieKg)+
    _indCard('Netcongestie',congKg)+
    jaarCard+maandCard+weekCard+bdkCard+topAtbl+topTtbl;

  ['A','T'].forEach(function(dir){
    var sel=document.getElementById('indPeakLim'+dir);
    if(sel)sel.addEventListener('change',function(){_indRenderTopTable(dir);});
  });
}

function _indRenderTopTable(dir){
  if(!_indLast)return;
  var a=_indLast.a,ans=a.aansluiting,cg=a.congestie;
  var sel=document.getElementById('indPeakLim'+dir);
  var n=sel?(parseInt(sel.value)||10):10;
  var body=document.getElementById('indPeakBody'+dir);
  if(!body)return;
  var list=dir==='A'?a.topA:a.topT;
  var gtv=dir==='A'?ans.gtvA:ans.gtvT;
  var heeftGtv=dir==='A'?cg.heeftGtvA:cg.heeftGtvT;
  body.innerHTML=_indPeakRows(list.slice(0,n),gtv,heeftGtv);
}

function _indPeakRows(list,gtv,heeftGtv){
  if(!list||!list.length||list[0].kw<=0)
    return '<tr><td colspan="6" style="text-align:center;color:#aaa;padding:14px">Geen pieken</td></tr>';
  return list.map(function(p,i){
    var over=heeftGtv&&p.kw>gtv;
    var diff=over?('+'+_indKw(p.kw-gtv)+' kW'):'—';
    return '<tr><td>'+(i+1)+'</td><td style="font-size:12px">'+_indFmtMoment(p.ts)+'</td>'+
      '<td><strong>'+_indKw(p.kw)+'</strong></td>'+
      '<td>'+(heeftGtv?fmt(gtv):'—')+'</td>'+
      '<td>'+diff+'</td>'+
      '<td><span class="bdg '+(over?'br':'bg')+'">'+(over?'Overschrijding':'OK')+'</span></td></tr>';
  }).join('');
}

// --- Wiring ------------------------------------------------------------------
document.addEventListener('DOMContentLoaded',function(){
  var list=document.getElementById('indList');
  if(list)list.addEventListener('click',function(e){
    var it=e.target.closest('[data-ind-id]');
    if(it)selectIndConn(it.getAttribute('data-ind-id'));
  });
  var add=document.getElementById('btnIndAddComp');
  if(add)add.addEventListener('click',function(){try{openAddComp();}catch(err){console.error('openAddComp:',err);}});
  var ber=document.getElementById('btnIndBereken');
  if(ber)ber.addEventListener('click',berekenInd);
});
