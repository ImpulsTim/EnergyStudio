// Globale applicatiestatus
var S={projects:[],activeId:null};
var editId=null,pendData=null,pendName='',pType='static';
var CH={},_piek=null,_jaarState=null,_jZoom=1;
var _optim={baseKw:[],allTs:[],gtvA:0,gtvT:0,avgKm:0,optKw:[],perKw:[],withData:[],allData:[],activeScenId:'basis',scenResults:{}};

// --- Globale grafiek-hover -----------------------------------------------------
// Maakt tooltips overal langs de x-as bereikbaar (geen precies mikken meer) en
// toont alle reeksen op het aangewezen moment tegelijk, met een verticale hulplijn.
// Geldt voor ALLE Chart.js-grafieken in de app. Guard: alleen als Chart geladen is
// (offline snapshot zonder CDN slaat dit over).
if (window.Chart) {
  Chart.defaults.interaction = { mode: 'index', intersect: false, axis: 'x' };
  Chart.defaults.plugins.tooltip.mode = 'index';
  Chart.defaults.plugins.tooltip.intersect = false;

  // Consistente huisstijl-tooltip.
  Object.assign(Chart.defaults.plugins.tooltip, {
    backgroundColor: 'rgba(36,43,56,.94)', titleColor: '#fff', bodyColor: '#eef2ec',
    padding: 10, cornerRadius: 6, boxPadding: 4, borderColor: 'rgba(255,255,255,.08)', borderWidth: 1,
    titleFont: { family: 'Barlow', size: 12, weight: '600' },
    bodyFont: { family: 'Barlow', size: 12 }
  });

  // Getalnotatie + eenheid uit de titel van de waarde-as (al gezet via ax(_cv.unit)).
  // Werkt voor verticale én horizontale (indexAxis:'y') bar/line-grafieken; exotische
  // types (doughnut e.d. met eigen label-callback) vallen terug op de standaardwaarde.
  Chart.defaults.plugins.tooltip.callbacks.label = function (ctx) {
    var horiz = ctx.chart.options.indexAxis === 'y';
    var v = horiz ? ctx.parsed.x : ctx.parsed.y;
    if (v == null || typeof v !== 'number') return ctx.formattedValue;
    var sc = ctx.chart.scales[horiz ? (ctx.dataset.xAxisID || 'x') : (ctx.dataset.yAxisID || 'y')];
    var unit = (sc && sc.options && sc.options.title && sc.options.title.text) || '';
    var num = Math.abs(v) < 100 ? v.toLocaleString('nl-NL', { maximumFractionDigits: 2 }) : fmt(v);
    return (ctx.dataset.label ? ctx.dataset.label + ': ' : '') + num + (unit ? ' ' + unit : '');
  };

  // Vlakke GTV-referentielijnen en lege punten weglaten uit de tooltip.
  Chart.defaults.plugins.tooltip.filter = function (item) {
    return item.raw != null && !/^GTV/.test(item.dataset.label || '');
  };

  // Verticale hulplijn (crosshair) op de actieve x-positie.
  Chart.register({
    id: 'crosshair',
    afterDraw: function (chart) {
      var t = chart.tooltip;
      if (!t || !t._active || !t._active.length || !chart.chartArea) return;
      // Alleen bij een verticale x-index (niet op doughnut/pie of horizontale bars).
      if (!chart.scales || !chart.scales.x || chart.options.indexAxis === 'y') return;
      var x = t._active[0].element.x, a = chart.chartArea, c = chart.ctx;
      c.save();
      c.beginPath();
      c.moveTo(x, a.top);
      c.lineTo(x, a.bottom);
      c.lineWidth = 1;
      c.strokeStyle = 'rgba(70,150,43,.45)';
      c.setLineDash([4, 3]);
      c.stroke();
      c.restore();
    }
  });
}

// --- Multicommodity ----------------------------------------------------------
// Actieve energiedrager waarvoor het groepsprofiel berekend/getoond wordt.
// Default 'elektra' → bestaand gedrag. De analyse draait per drager apart.
var _activeCarrier='elektra';
var _yearFilter=null; // null = alle jaren; anders 'YYYY'
function _cNum(v,d){var n=(typeof v==='number')?v:parseFloat(v);return isNaN(n)?d:n;}

// Distinct jaren (YYYY) uit genormaliseerde aansluit-data.
function _collectYears(withData){
  var ys={};
  (withData||[]).forEach(function(c){(c.data||[]).forEach(function(d){if(d&&d.ts!=null)ys[String(d.ts).slice(0,4)]=1;});});
  return Object.keys(ys).sort();
}

// Jaarkeuze-balk (dropdown). Toont alleen bij >1 jaar; default = alle jaren.
function renderYearTabs(years){
  var bar=document.getElementById('yearBar');
  if(!bar)return;
  if(!years||years.length<=1){bar.style.display='none';bar.innerHTML='';return;}
  bar.style.display='flex';
  var opts='<option value="">Alle jaren</option>'+years.map(function(y){
    return '<option value="'+y+'"'+(_yearFilter===y?' selected':'')+'>'+y+'</option>';}).join('');
  // Vergelijk-optie alleen per drager (niet in hub-modus).
  if(_activeCarrier!=='hub')opts+='<option value="compare"'+(_yearFilter==='compare'?' selected':'')+'>📊 Jaren vergelijken</option>';
  var hint=_yearFilter==='compare'?'Jaren naast elkaar':(_yearFilter?('Toont alleen '+_yearFilter):'Alle jaren samen');
  bar.innerHTML='<span style="font-size:12px;color:#888;font-weight:700">Jaar:</span>'+
    '<select id="yearSel" style="font-family:Barlow,sans-serif;font-size:13px;padding:5px 9px;border:1.5px solid #dce6e0;border-radius:8px;color:#444;cursor:pointer">'+opts+'</select>'+
    '<span style="font-size:11px;color:#999">'+hint+'</span>';
}

// Toont/verbergt de vergelijk-panelen (overzicht + jaarprofiel).
function _setComparePanels(on){
  var oc=document.getElementById('ovCompare'),jc=document.getElementById('jaarCompare'),jn=document.getElementById('jaarNormal');
  if(oc)oc.style.display=on?'':'none';
  if(jc)jc.style.display=on?'':'none';
  if(jn)jn.style.display=on?'none':'';
}

// Weergave-eenheid voor jaarvergelijking: gas → m³, anders MWh.
function _cmpUnit(carrier){
  if(carrier==='gas')return {div:(carrierDef('gas').calorisch||9.769),label:'m³'};
  return {div:1000,label:'MWh'};
}

// Vergelijkt jaren: per jaar maand-/dagverbruik + totaal/%-verschil/CO₂(gas).
function renderYearComparison(withData){
  var carrier=_activeCarrier,cu=_cmpUnit(carrier);
  var perYear={};
  (withData||[]).forEach(function(c){(c.data||[]).forEach(function(d){
    if(!d||d.ts==null||d.kw==null)return;
    var ts=String(d.ts),y=ts.slice(0,4),mi=parseInt(ts.slice(5,7),10)-1,md=ts.slice(5,10);
    var e=Math.max(0,d.kw)*0.25;
    var py=perYear[y]||(perYear[y]={month:[0,0,0,0,0,0,0,0,0,0,0,0],day:{},total:0,tsSet:{}});
    if(mi>=0&&mi<12)py.month[mi]+=e;
    py.day[md]=(py.day[md]||0)+e;py.total+=e;
    py.tsSet[ts]=1;  // dedup over aansluitingen heen, voor de dekkingsberekening
  });});
  var years=Object.keys(perYear).sort();
  // Datadekking per jaar per maand: een maand met ontbrekende meetdata zou het jaar
  // anders ten onrechte zuiniger laten lijken dan de andere jaren.
  years.forEach(function(y){perYear[y].dek=maandDekking(Object.keys(perYear[y].tsSet));});
  var yrKey=function(y,mi){return y+'-'+(mi<9?'0':'')+(mi+1);};
  var yrHeeft=function(y,mi){return perYear[y].dek.byKey[yrKey(y,mi)]!=null;};      // maand komt voor in de data
  var yrVol=function(y,mi){return _dek(perYear[y].dek,yrKey(y,mi)).volledig;};
  var isGas=carrier==='gas',co2f=carrierDef('gas').co2||1.788,cal=carrierDef('gas').calorisch||9.769;
  var rows=years.map(function(y,idx){
    var tot=perYear[y].total/cu.div;
    var prevTot=idx>0?perYear[years[idx-1]].total:null;
    var pct=(prevTot&&prevTot>0)?((perYear[y].total-prevTot)/prevTot*100):null;
    var pctTxt=pct==null?'—':((pct>=0?'+':'')+pct.toFixed(1)+'%');
    var pctColor=pct==null?'#888':(pct>0?'#c0392b':'#46962b');
    var co2=isGas?((perYear[y].total/cal)*co2f/1000):null;
    return '<tr><td><span class="dt" style="background:'+PAL[idx%PAL.length]+';display:inline-block"></span> <strong>'+y+'</strong></td>'+
      '<td>'+fmt(tot)+' '+cu.label+'</td>'+
      '<td style="color:'+pctColor+';font-weight:700">'+pctTxt+'</td>'+
      (isGas?('<td>'+co2.toFixed(1)+' ton</td>'):'')+'</tr>';
  }).join('');
  var oc=document.getElementById('ovCompare');
  if(oc)oc.innerHTML='<div class="cd"><div class="ct2"><div class="ac"></div>Jaarvergelijking — '+carrierDef(carrier).label+'</div>'+
    '<table class="tbl"><thead><tr><th>Jaar</th><th>Totaal verbruik</th><th>% t.o.v. vorig jaar</th>'+(isGas?'<th>CO₂</th>':'')+'</tr></thead><tbody>'+
    (years.length?rows:'<tr><td colspan="'+(isGas?4:3)+'" style="text-align:center;padding:14px;color:#aaa">Geen data</td></tr>')+'</tbody></table></div>';
  // Maandgrafiek (één lijn per jaar) + legenda.
  var legM='';years.forEach(function(y,idx){legM+='<span class="li"><span class="ld" style="background:'+PAL[idx%PAL.length]+'"></span>'+y+'</span>';});
  // Onvolledige maanden krijgen een open driehoek i.p.v. een gevulde stip (arcering kan
  // niet op een lijn); maanden zónder data worden helemaal niet getekend (null = gat).
  var onvJaar=[];
  years.forEach(function(y){
    for(var mi=0;mi<12;mi++)if(yrHeeft(y,mi)&&!yrVol(y,mi))onvJaar.push(MND[mi]+' '+y);
  });
  if(onvJaar.length)legM+='<span class="li"><span class="ld" style="background:transparent;border:2px solid #888;border-radius:0;transform:rotate(45deg)"></span>Onvolledige maand</span>';
  var legEl=document.getElementById('yrLegM');if(legEl)legEl.innerHTML=legM;
  var warnEl=document.getElementById('yrMaandWarn');
  if(warnEl)warnEl.innerHTML=onvJaar.length?('<div class="opt-warn">⚠ Onvolledige '+(onvJaar.length===1?'maand':'maanden')+': '+onvJaar.join(', ')+
    '. Deze punten zijn als open driehoek gemarkeerd — de lagere waarde komt door ontbrekende meetdata, niet door lager verbruik. Maanden zonder meetdata worden niet getekend.</div>'):'';
  dC('yrMaand');
  CH['yrMaand']=new Chart(document.getElementById('cYrMaand'),{type:'line',
    data:{labels:MND,datasets:years.map(function(y,idx){
      var kl=PAL[idx%PAL.length];
      return {label:y,
        data:perYear[y].month.map(function(v,mi){return yrHeeft(y,mi)?+(v/cu.div).toFixed(2):null;}),
        borderColor:kl,backgroundColor:'transparent',fill:false,tension:.3,borderWidth:2,spanGaps:false,
        pointStyle:MND.map(function(_,mi){return yrVol(y,mi)?'circle':'triangle';}),
        pointRadius:MND.map(function(_,mi){return yrVol(y,mi)?2:6;}),
        pointHoverRadius:MND.map(function(_,mi){return yrVol(y,mi)?4:8;}),
        pointBackgroundColor:MND.map(function(_,mi){return yrVol(y,mi)?kl:'#fff';}),
        pointBorderColor:kl,
        pointBorderWidth:MND.map(function(_,mi){return yrVol(y,mi)?1:2;})};})},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},
      tooltip:{callbacks:{afterLabel:function(ctx){
        var y=ctx.dataset.label,mi=ctx.dataIndex;
        if(yrVol(y,mi))return '';
        var d=_dek(perYear[y].dek,yrKey(y,mi));
        return '⚠ onvolledig — '+d.dagen+' van '+d.dagenInMaand+' dagen ('+Math.round(d.dekking*100)+'%)';
      }}}},
      scales:{x:Object.assign(ax(),{grid:{display:false}}),y:ax(cu.label)}}});
  // Daggrafiek (x = MM-DD-unie, één lijn per jaar).
  var mdSet={};years.forEach(function(y){Object.keys(perYear[y].day).forEach(function(md){mdSet[md]=1;});});
  var mds=Object.keys(mdSet).sort();
  dC('yrDag');
  CH['yrDag']=new Chart(document.getElementById('cYrDag'),{type:'line',
    data:{labels:mds,datasets:years.map(function(y,idx){return {label:y,data:mds.map(function(md){var v=perYear[y].day[md];return v==null?null:+(v/cu.div).toFixed(3);}),borderColor:PAL[idx%PAL.length],backgroundColor:'transparent',fill:false,tension:.2,pointRadius:0,borderWidth:1.3,spanGaps:true};})},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'#888',font:{family:'Barlow',size:11},boxWidth:10}}},scales:{x:Object.assign(ax(),{ticks:{color:'#999',font:{family:'Barlow',size:10},maxTicksLimit:12,callback:function(v){var md=this.getLabelForValue(v);return (md&&md.slice(3)==='01')?MND[parseInt(md.slice(0,2),10)-1]:'';}},grid:{display:false}}),y:ax(cu.label+'/dag')}}});
}

// Dragers die in het actieve project voorkomen, in vaste volgorde.
function projectCarriers(){
  var p=ap();if(!p||!p.companies)return ['elektra'];
  var present={};p.companies.forEach(function(c){present[c.carrier||'elektra']=1;});
  var order=['elektra','gas','warmte'].filter(function(k){return present[k];});
  return order.length?order:['elektra'];
}

function _fmtLocalTs(ms){
  var d=new Date(ms);function p(n){return String(n).padStart(2,'0');}
  return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+'T'+p(d.getHours())+':'+p(d.getMinutes());
}

// Normaliseert ruwe meetdata van een aansluiting naar een kwartier-raster met
// kW-equivalent (gemiddeld vermogen), zodat de bestaande charts/KPI's (die met
// kWh = kw*0.25 rekenen) energetisch correcte waarden tonen, ongeacht het
// bron-interval.
//   - elektra: ONGEWIJZIGD doorgegeven ({ts,kw}).
//   - gas:     m³/interval → kWh (×calorisch, enkelrichting) → gem. kW; interval
//              uitgesplitst naar kwartieren (uurwaarde → 4 kwartieren).
//   - warmte:  kWh/interval → gem. kW (bidirectioneel); idem uitgesplitst.
function _carrierSeries(c,raw){
  var carrier=(c&&c.carrier)||'elektra';
  if(carrier==='elektra'){
    // Normaliseer timestamps on-the-fly zodat bestaande IndexedDB-data met
    // wisselende formaten (spatie vs T, DD.MM vs YYYY-MM) toch overlapt.
    var normFn=(typeof _normTs==='function')?_normTs:(typeof _normPriceTs==='function')?_normPriceTs:null;
    if(!normFn)return raw||[];
    return (raw||[]).map(function(d){return d&&d.ts?{ts:normFn(d.ts),kw:d.kw}:d;});
  }
  raw=(raw||[]).filter(function(d){return d&&d.ts!=null;});
  if(!raw.length)return [];
  var def=carrierDef(carrier);
  var cal=(carrier==='gas')?_cNum(c.calorisch,def.calorisch):1; // warmte: val al in kWh
  // Interval bepalen uit de eerste twee timestamps (ms); default kwartier.
  var intervalMs=900000;
  if(raw.length>=2){
    var t0=new Date(raw[0].ts).getTime(),t1=new Date(raw[1].ts).getTime();
    if(t1>t0)intervalMs=t1-t0;
  }
  var q=Math.max(1,Math.round(intervalMs/900000)); // aantal kwartier-slots per record
  var intervalH=intervalMs/3600000;
  var bidir=def.bidir;
  var out=[];
  for(var i=0;i<raw.length;i++){
    var v=_cNum(raw[i].val!=null?raw[i].val:raw[i].kw,0);
    var energy=v*cal;                 // kWh over het interval
    if(!bidir&&energy<0)energy=0;      // enkelrichting (gas)
    var kw=intervalH>0?energy/intervalH:0; // gem. vermogen (kW-equivalent)
    var baseMs=new Date(raw[i].ts).getTime();
    if(isNaN(baseMs))continue;
    for(var s=0;s<q;s++)out.push({ts:_fmtLocalTs(baseMs+s*900000),kw:kw});
  }
  return out;
}

// Rendert de drager-keuzebalk boven de tabs (alleen zichtbaar bij >1 drager).
function renderCarrierTabs(carriers){
  var bar=document.getElementById('carrierBar');
  if(!bar)return;
  if(!carriers||carriers.length<=1){bar.style.display='none';bar.innerHTML='';return;}
  bar.style.display='flex';
  function _cbtn(k,label,kleur){
    var on=k===_activeCarrier;
    var st='font-family:Barlow,sans-serif;font-weight:700;font-size:12px;padding:6px 14px;border-radius:14px;cursor:pointer;border:1.5px solid '+kleur+';'+
      (on?('background:'+kleur+';color:#fff;'):('background:#fff;color:'+kleur+';'));
    return '<button data-carrier="'+k+'" style="'+st+'">'+label+'</button>';
  }
  var html=carriers.map(function(k){var def=carrierDef(k);return _cbtn(k,def.label+' <span style="opacity:.7">('+def.unit+')</span>',def.kleur);}).join('');
  html+=_cbtn('hub','⚡ Hub (alle dragers)','#242b38');
  var lbl=_activeCarrier==='hub'?'Alle energiestromen door de hub':('Analyse per drager — '+carrierDef(_activeCarrier).label);
  bar.innerHTML=html+'<span style="font-size:11px;color:#999;margin-left:4px">'+lbl+'</span>';
}

// Weergavecontext per drager: schaal + as-eenheid + GTV-lijnen tonen?
// Voor gas worden de (kW-equivalente) plotwaarden ×(1/calorische waarde) → m³/h.
var _carrierView={carrier:'elektra',unit:'kW',scale:1,showGtv:true};
function setCarrierView(){
  if(_activeCarrier==='gas'){
    var cal=carrierDef('gas').calorisch||9.769;
    _carrierView={carrier:'gas',unit:'m³/h',scale:1/cal,showGtv:false};
  }else if(_activeCarrier==='warmte'){
    _carrierView={carrier:'warmte',unit:'kW',scale:1,showGtv:false};
  }else{
    _carrierView={carrier:'elektra',unit:'kW',scale:1,showGtv:true};
  }
}

// Tabs die per drager zichtbaar zijn (null = alle). Gas/warmte: geen GTV-overschrijding,
// elektra-piekanalyse of scenario-vergelijking.
var CARRIER_TABS={
  gas:['tOv','tJaar','tWeek','tGelijkt','tKaart'],
  warmte:['tOv','tJaar','tWeek','tGelijkt','tKaart'],
  hub:['tHub']
};
function applyTabVisibility(){
  // Vergelijkmodus (per drager): alleen Overzicht + Jaarprofiel.
  var vis=(_yearFilter==='compare'&&_activeCarrier!=='hub')?['tOv','tJaar']:(CARRIER_TABS[_activeCarrier]||null);
  var tabs=document.querySelectorAll('.tabs .tab');
  var activeHidden=false;
  tabs.forEach(function(btn){
    var id=btn.getAttribute('data-tab');
    // De Energiehub-tab verschijnt uitsluitend in hub-modus; verder volgt de drager-set (null = alle).
    var show=(id==='tHub')?(_activeCarrier==='hub'):(!vis||vis.indexOf(id)!==-1);
    btn.style.display=show?'':'none';
    if(!show&&btn.classList.contains('on'))activeHidden=true;
  });
  var sep=document.querySelector('.tabs .tab-sep');
  if(sep)sep.style.display=vis?'none':'';
  // Verborgen actieve tab → naar de eerste zichtbare tab (Overzicht voor gas, Energiehub in hub-modus).
  if(activeHidden){
    var firstVis=null;
    tabs.forEach(function(b){if(!firstVis&&b.style.display!=='none')firstVis=b;});
    if(firstVis){
      document.querySelectorAll('.pn').forEach(function(p){p.classList.remove('on');});
      document.querySelectorAll('.tab').forEach(function(b){b.classList.remove('on');});
      var pid=firstVis.getAttribute('data-tab');
      var pn=document.getElementById(pid);if(pn)pn.classList.add('on');
      firstVis.classList.add('on');
    }
  }
}

// Gas-overzichtspagina (#ovGas): m³ totaal/maand, energie (kWh+GJ), CO₂, baseload vs seizoen.
function _kbCard(l,v,u){return '<div class="kb"><div class="kl">'+l+'</div><div class="kv">'+v+'</div><div class="ku">'+u+'</div></div>';}
function renderGasOverzicht(withData,allTs,grpKw,perKw){
  var host=document.getElementById('ovGas');if(!host)return;
  var def=carrierDef('gas');var cal=def.calorisch||9.769;var co2f=def.co2||1.788;
  // Hub-totaal per maand (kWh → m³).
  var mMap={};
  for(var i=0;i<allTs.length;i++){var mn=String(allTs[i]).slice(0,7);mMap[mn]=(mMap[mn]||0)+Math.max(0,grpKw[i])*0.25;}
  var months=Object.keys(mMap).sort();
  var monthM3=months.map(function(m){return mMap[m]/cal;});
  var totKwh=months.reduce(function(s,m){return s+mMap[m];},0);
  var totM3=totKwh/cal,totGJ=totKwh/277.778,co2ton=totM3*co2f/1000;
  var nM=months.length||1;
  // Datadekking per maand — onvolledige maanden worden gearceerd én tellen niet mee
  // in gemiddelde/baseload, anders zou een halve maand die getallen omlaag trekken.
  var gasDek=maandDekking(allTs);
  var volM=months.map(function(m){return _dek(gasDek,m).volledig;});
  var volIdx=months.map(function(_,i){return i;}).filter(function(i){return volM[i];});
  var nVol=volIdx.length;
  var gemM3=nVol?volIdx.reduce(function(s,i){return s+monthM3[i];},0)/nVol:(totM3/nM);
  var maxIdx=monthM3.length?monthM3.reduce(function(b,v,i,a){return v>a[b]?i:b;},0):0;
  // Baseload = laagste maand × aantal maanden (proces); rest = seizoen (verwarming).
  // Alleen volledige maanden komen in aanmerking als "laagste maand": een maand met
  // ontbrekende meetdata is kunstmatig laag en zou de baseload te laag zetten (en het
  // seizoensdeel dus te hoog). Zonder volledige maand valt het terug op alle maanden.
  var baseKand=nVol?volIdx.map(function(i){return monthM3[i];}):monthM3;
  var baseMonthly=baseKand.length?Math.min.apply(null,baseKand):0;
  var baseYear=baseMonthly*nM,seizoen=Math.max(0,totM3-baseYear);
  var seizPct=totM3>0?seizoen/totM3*100:0;
  var perComp=withData.map(function(c,ci){
    var kwh=0;(perKw[ci]||[]).forEach(function(kw){if(kw>0)kwh+=kw*0.25;});
    var ccal=_cNum(c.calorisch,cal),m3=kwh/ccal;
    return {name:c.name,deelnemer:c.deelnemer||c.name,m3:m3,kwh:kwh,co2:m3*co2f};
  });
  host.innerHTML=
    '<div class="kg">'+
      _kbCard('Totaal gas',fmt(totM3),'m³')+
      _kbCard('Energie',fmt(totKwh),'kWh · '+totGJ.toFixed(1)+' GJ')+
      _kbCard('Gemiddeld/maand',fmt(gemM3),'m³'+(nVol&&nVol<months.length?(' · over '+nVol+' volledige '+(nVol===1?'maand':'maanden')):''))+
      _kbCard('Hoogste maand',fmt(monthM3[maxIdx]||0),(months.length?mndLabel(months,months[maxIdx]):'—')+' · m³')+
      _kbCard('CO₂-uitstoot',co2ton.toFixed(1),'ton CO₂ (×'+co2f+' kg/m³)')+
      _kbCard('Verwarming (seizoen)',seizPct.toFixed(0)+'%',fmt(seizoen)+' m³ · baseload '+fmt(baseYear)+' m³')+
    '</div>'+
    '<div class="cd"><div class="ct2"><div class="ac" style="background:'+def.kleur+'"></div>Gasverbruik per maand (hub-totaal)</div>'+
      onvolledigNotice(months,gasDek,'gasverbruik',def.kleur)+
      '<div class="cw" style="height:300px"><canvas id="cGasMaand"></canvas></div></div>'+
    '<div class="cd"><div class="ct2"><div class="ac" style="background:'+def.kleur+'"></div>Per aansluiting</div>'+
      '<table class="tbl"><thead><tr><th>Aansluiting</th><th>Deelnemer</th><th>m³</th><th>kWh</th><th>CO₂ (ton)</th></tr></thead><tbody>'+
      (perComp.length?perComp.map(function(d){return '<tr><td><strong>'+d.name+'</strong></td><td>'+d.deelnemer+'</td><td>'+fmt(d.m3)+'</td><td>'+fmt(d.kwh)+'</td><td>'+(d.co2/1000).toFixed(2)+'</td></tr>';}).join(''):'<tr><td colspan="5" style="text-align:center;padding:14px;color:#aaa">Geen gasaansluitingen</td></tr>')+
      '</tbody></table></div>';
  dC('gasMaand');
  CH['gasMaand']=new Chart(document.getElementById('cGasMaand'),{type:'bar',
    data:{labels:months.map(function(m,i){return maandDekkingLabel(mndLabel(months,m),_dek(gasDek,m));}),
      datasets:[Object.assign({label:'m³',data:monthM3.map(function(v){return Math.round(v);}),borderRadius:5},hatchBar(volM,def.kleur))]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},
      tooltip:{callbacks:{afterBody:function(items){return items.length?maandDekkingTip(_dek(gasDek,months[items[0].dataIndex])):[];}}}},
      scales:{x:Object.assign(ax(),{grid:{display:false}}),y:ax('m³')}}});
}

// --- Centrale hub-weergave (cross-carrier energiestromen) --------------------
function _hubNodeColor(name){
  if(/opwek|elektra|teruglever/i.test(name))return '#46962b';
  if(/gas/i.test(name))return '#e67e22';
  if(/warmte/i.test(name))return '#c0392b';
  return '#8898a8';
}

// Aggregeert per drager over álle aansluitingen: vraag, opwek, intern gematcht
// (Σ per tijdstap min(Σprod,Σvraag)), net-import/-export en maand-rollup (kWh).
async function computeHubData(p){
  var carriers=projectCarriers();
  var perCarrier={},yearsSet={};
  for(var ci=0;ci<carriers.length;ci++){
    var car=carriers[ci];
    var cos=p.companies.filter(function(c){return (c.carrier||'elektra')===car;});
    var demByTs={},prodByTs={};
    for(var i=0;i<cos.length;i++){
      var raw=await dbGet('ts',cos[i].id)||[];
      if(!raw.length&&car==='elektra')raw=genDemo(i);
      var series=_carrierSeries(cos[i],raw);
      for(var j=0;j<series.length;j++){
        var d=series[j];if(!d||d.ts==null||d.kw==null)continue;
        yearsSet[String(d.ts).slice(0,4)]=1;                       // beschikbare jaren (vóór filter)
        if(_yearFilter&&String(d.ts).slice(0,4)!==_yearFilter)continue; // jaarfilter
        if(d.kw>0)demByTs[d.ts]=(demByTs[d.ts]||0)+d.kw;
        else if(d.kw<0)prodByTs[d.ts]=(prodByTs[d.ts]||0)+(-d.kw);
      }
    }
    var afnameKwh=0,opwekKwh=0,internKwh=0,monthKwh={},keys={};
    Object.keys(demByTs).forEach(function(t){keys[t]=1;});Object.keys(prodByTs).forEach(function(t){keys[t]=1;});
    Object.keys(keys).forEach(function(ts){
      var dem=demByTs[ts]||0,prod=prodByTs[ts]||0;
      afnameKwh+=dem*0.25;opwekKwh+=prod*0.25;internKwh+=Math.min(dem,prod)*0.25;
      var mn=String(ts).slice(0,7);monthKwh[mn]=(monthKwh[mn]||0)+dem*0.25;
    });
    perCarrier[car]={afnameKwh:afnameKwh,opwekKwh:opwekKwh,internMatchedKwh:internKwh,
      netImportKwh:Math.max(0,afnameKwh-internKwh),netExportKwh:Math.max(0,opwekKwh-internKwh),
      monthKwh:monthKwh,nConn:cos.length,
      // Datadekking per drager afzonderlijk: een maand kan compleet zijn voor elektra
      // en tegelijk een gat hebben in gas.
      dekking:maandDekking(Object.keys(keys))};
  }
  return {carriers:carriers,perCarrier:perCarrier,years:Object.keys(yearsSet).sort()};
}

async function renderHub(p){
  var host=document.getElementById('tHub');if(!host)return;
  var data=await computeHubData(p);
  // Jaarfilter: ongeldig jaar (niet in de hub-jaren) → terug naar alle jaren en herbereken.
  if(_yearFilter&&(data.years||[]).indexOf(_yearFilter)===-1){_yearFilter=null;data=await computeHubData(p);}
  renderYearTabs(data.years||[]);
  var carriers=data.carriers,pc=data.perCarrier;
  var MWH=function(k){return +(k/1000).toFixed(2);};
  var totDemand=carriers.reduce(function(s,c){return s+pc[c].afnameKwh;},0);
  var internTot=carriers.reduce(function(s,c){return s+pc[c].internMatchedKwh;},0);
  var netImpTot=carriers.reduce(function(s,c){return s+pc[c].netImportKwh;},0);
  var zelfvz=totDemand>0?internTot/totDemand*100:0;
  // CO₂: gas (per m³) + elektra net-import (netstroomfactor).
  var gd=carrierDef('gas');
  var co2gasKg=pc.gas?(pc.gas.afnameKwh/(gd.calorisch||9.769))*(gd.co2||1.788):0;
  var co2elekKg=pc.elektra?pc.elektra.netImportKwh*((typeof HUB!=='undefined'?HUB.gridCo2:0.27)):0;
  var co2ton=(co2gasKg+co2elekKg)/1000;
  // Electrificatiepotentieel: verwarmingsdeel gas (boven baseload) via warmtepomp (COP).
  var cop=(typeof HUB!=='undefined'?HUB.cop:3),gasHeatKwh=0;
  if(pc.gas){
    var gk=Object.keys(pc.gas.monthKwh).sort();
    var gm=gk.map(function(m){return pc.gas.monthKwh[m];});
    // Alleen volledige maanden komen in aanmerking als baseload-maand: een maand met
    // ontbrekende meetdata is kunstmatig laag en zou het seizoensdeel te hoog maken.
    var gmVol=gk.filter(function(m){return _dek(pc.gas.dekking,m).volledig;}).map(function(m){return pc.gas.monthKwh[m];});
    var kand=gmVol.length?gmVol:gm;
    var nm=gm.length||1,baseMonthly=kand.length?Math.min.apply(null,kand):0;
    gasHeatKwh=Math.max(0,pc.gas.afnameKwh-baseMonthly*nm);
  }
  var elekNodig=gasHeatKwh/cop,overschot=pc.elektra?pc.elektra.netExportKwh:0;
  var dekkPct=elekNodig>0?Math.min(100,overschot/elekNodig*100):0;
  // Sankey-flows (MWh, alleen >1 MWh tonen).
  var flows=[];
  if(pc.elektra){var e=pc.elektra;
    if(e.netImportKwh>1000)flows.push({from:'Net elektra',to:'Elektra-vraag',flow:MWH(e.netImportKwh)});
    if(e.internMatchedKwh>1000)flows.push({from:'Eigen opwek',to:'Elektra-vraag',flow:MWH(e.internMatchedKwh)});
    if(e.netExportKwh>1000)flows.push({from:'Eigen opwek',to:'Teruglevering net',flow:MWH(e.netExportKwh)});
  }
  if(pc.gas&&pc.gas.afnameKwh>1000)flows.push({from:'Gasnet',to:'Gas-vraag',flow:MWH(pc.gas.afnameKwh)});
  if(pc.warmte){var w=pc.warmte;
    if(w.internMatchedKwh>1000)flows.push({from:'Warmtebron',to:'Warmte-vraag',flow:MWH(w.internMatchedKwh)});
    if(w.netImportKwh>1000)flows.push({from:'Externe warmte/ketel',to:'Warmte-vraag',flow:MWH(w.netImportKwh)});
  }
  var mset={};carriers.forEach(function(c){Object.keys(pc[c].monthKwh).forEach(function(m){mset[m]=1;});});
  var months=Object.keys(mset).sort();
  // Een hub-maand telt pas als volledig wanneer élke drager die er data heeft volledig is;
  // een gat in één drager maakt de gestapelde staaf immers al te laag.
  var hubVol=months.map(function(m){
    return carriers.every(function(c){
      return pc[c].monthKwh[m]==null||_dek(pc[c].dekking,m).volledig;
    });
  });
  var hubDek={byKey:{}};
  months.forEach(function(m,i){
    var slechtste=null;
    carriers.forEach(function(c){
      if(pc[c].monthKwh[m]==null)return;
      var d=_dek(pc[c].dekking,m);
      if(!slechtste||d.dekking<slechtste.dekking)slechtste=d;
    });
    hubDek.byKey[m]=slechtste||_dek(null,m);
  });
  var balansRows=carriers.map(function(c){var x=pc[c],def=carrierDef(c);
    return '<tr><td><span class="dt" style="background:'+def.kleur+';display:inline-block"></span> '+def.label+'</td><td>'+fmt(MWH(x.afnameKwh))+'</td><td>'+fmt(MWH(x.opwekKwh))+'</td><td>'+fmt(MWH(x.internMatchedKwh))+'</td><td>'+fmt(MWH(x.netImportKwh))+'</td><td>'+fmt(MWH(x.netExportKwh))+'</td></tr>';}).join('');
  host.innerHTML=
    '<div class="kg">'+
      _kbCard('Totale energievraag',fmt(MWH(totDemand)),'MWh (alle dragers)')+
      _kbCard('Intern gedekt',fmt(MWH(internTot)),'MWh eigen opwek/uitwisseling')+
      _kbCard('Net-import',fmt(MWH(netImpTot)),'MWh van buiten de hub')+
      _kbCard('Zelfvoorzieningsgraad',zelfvz.toFixed(0)+'%','intern / totale vraag')+
      _kbCard('CO₂-voetafdruk',co2ton.toFixed(1),'ton CO₂ (gas + netstroom)')+
    '</div>'+
    '<div class="cd"><div class="ct2"><div class="ac"></div>Energiestromen door de hub (MWh)</div>'+
      '<div class="ib2" style="margin-bottom:6px">Bron → bestemming, breedte = MWh over de periode. Cross-carrier koppeling (gas→warmte, elektra→warmte) volgt met conversie-assets (fase 2).</div>'+
      '<div class="cw" style="height:380px"><canvas id="cHubSankey"></canvas></div></div>'+
    '<div class="cd"><div class="ct2"><div class="ac"></div>Energiebalans per drager (MWh)</div>'+
      '<table class="tbl"><thead><tr><th>Drager</th><th>Vraag</th><th>Opwek</th><th>Intern</th><th>Net-import</th><th>Teruglev.</th></tr></thead><tbody>'+balansRows+'</tbody></table></div>'+
    '<div class="cd"><div class="ct2"><div class="ac"></div>Energie per maand, gestapeld per drager (MWh)</div>'+
      onvolledigNotice(months,hubDek,'energiegebruik')+
      '<div class="cw" style="height:300px"><canvas id="cHubMaand"></canvas></div></div>'+
    '<div class="cd"><div class="ct2"><div class="ac"></div>Electrificatiepotentieel (indicatief)</div>'+
      '<div class="ib2" style="margin-bottom:6px">Verwarmingsdeel gas (seizoen boven baseload) omgezet via een warmtepomp met COP '+cop+'. Indicatief — om de koppelkans te schatten, niet als ontwerp.</div>'+
      '<div class="kg">'+
        _kbCard('Verwarming via gas',fmt(MWH(gasHeatKwh)),'MWh (seizoensdeel)')+
        _kbCard('Elektra nodig (COP '+cop+')',fmt(MWH(elekNodig)),'MWh')+
        _kbCard('Hub-overschot elektra',fmt(MWH(overschot)),'MWh teruglevering')+
        _kbCard('Dekking uit overschot',dekkPct.toFixed(0)+'%','van de warmtepompvraag')+
      '</div></div>';
  dC('hubSankey');
  try{
    CH['hubSankey']=new Chart(document.getElementById('cHubSankey'),{type:'sankey',data:{datasets:[{
      data:flows,
      colorFrom:function(c){return _hubNodeColor((c.raw&&c.raw.from)||'');},
      colorTo:function(c){return _hubNodeColor((c.raw&&c.raw.to)||'');},
      colorMode:'gradient',borderWidth:0,
      font:{family:'Barlow',size:12}
    }]},options:{responsive:true,maintainAspectRatio:false,
      // Sankey heeft geen x-index/y-as: globale index-hover + label/filter uitzetten, eigen tooltip.
      interaction:{mode:'nearest',intersect:true},
      plugins:{legend:{display:false},tooltip:{mode:'nearest',intersect:true,
        filter:function(){return true;},
        callbacks:{title:function(){return '';},
          label:function(c){var r=(c&&c.raw)||{};return (r.from||'')+' → '+(r.to||'')+': '+fmt(r.flow||0)+' MWh';}}}}}});
  }catch(e){
    console.error('Sankey:',e);
    var sc=document.getElementById('cHubSankey');
    if(sc&&sc.parentElement)sc.parentElement.innerHTML='<div class="ib2" style="padding:24px;text-align:center;color:#888">Sankey-grafiek niet beschikbaar (plugin niet geladen). De energiebalans-tabel hieronder toont dezelfde stromen.</div>';
  }
  dC('hubMaand');
  CH['hubMaand']=new Chart(document.getElementById('cHubMaand'),{type:'bar',
    data:{labels:months.map(function(m){return maandDekkingLabel(mndLabel(months,m),_dek(hubDek,m));}),
      datasets:carriers.map(function(c){var def=carrierDef(c);
      return Object.assign({label:def.label,data:months.map(function(m){return +(((pc[c].monthKwh[m]||0))/1000).toFixed(2);}),borderRadius:4,stack:'mwh'},hatchBar(hubVol,def.kleur));})},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'#888',font:{family:'Barlow',size:11},boxWidth:10}},
      tooltip:{callbacks:{afterBody:function(items){return items.length?maandDekkingTip(_dek(hubDek,months[items[0].dataIndex])):[];}}}},
      scales:{x:Object.assign(ax(),{stacked:true,grid:{display:false}}),y:Object.assign(ax('MWh'),{stacked:true})}}});
}

// Hulpfuncties
function uid(){return Math.random().toString(36).slice(2,10);}
function tipIcon(t){return '<span class="tip-icon" data-tip="'+t.replace(/"/g,'&quot;')+'">ⓘ</span>';}

function notify(msg,ok){
  var el=document.getElementById('nf');
  el.textContent=msg;
  el.style.borderLeftColor=(ok===false)?'#c0392b':'#46962b';
  el.classList.add('on');
  setTimeout(function(){el.classList.remove('on');},3000);
}

function ap(){for(var i=0;i<S.projects.length;i++){if(S.projects[i].id===S.activeId)return S.projects[i];}return null;}
function selC(){var p=ap();if(!p)return[];return p.companies.filter(function(c){return c.selected!==false;});}
function fmt(n){return Math.round(n).toLocaleString('nl-NL');}
function ax(lbl){return{ticks:{color:'#999',font:{family:'Barlow',size:11},maxTicksLimit:12},grid:{color:'#f3f7f4'},title:lbl?{display:true,text:lbl,color:'#aaa',font:{family:'Barlow',size:11}}:undefined};}
function sdesc(arr,n){
  var s=arr.filter(function(v){return v!=null;}).slice().sort(function(a,b){return b-a;});
  if(s.length<=n)return s;
  var out=[];for(var i=0;i<n;i++)out.push(s[Math.round(i*(s.length-1)/(n-1))]);
  return out;
}
function dC(id){if(CH[id]){try{CH[id].destroy();}catch(e){}delete CH[id];}}
function resetCH(){Object.keys(CH).forEach(function(k){dC(k);});CH={};_piek=null;_jaarState=null;}
function setKpi(id,val,alert){var el=document.getElementById(id);el.textContent=val;el.parentElement.classList.remove('red','grn');el.parentElement.classList.add(alert?'red':'grn');}
function mndLabel(mnds,m){var parts=m.split('-');var mo=parseInt(parts[1]);var y=parts[0];var multi=mnds.some(function(x){return x.slice(0,4)!==mnds[0].slice(0,4);});return MND[mo-1]+(multi?" '"+y.slice(2):'');}

// --- Arcering voor onvolledige maanden ---------------------------------------
// Diagonale streepvulling als CanvasPattern; Chart.js accepteert die rechtstreeks
// als backgroundColor. Gebruikt om staven van maanden met onvolledige meetdata te
// onderscheiden van gewoon gemeten waarden (zie maandDekking() in rekenkern.js).
// Gecached per kleur — één 8×8 tegel per kleur volstaat voor alle grafieken.
var _hatchCache={};
function hatchPat(color){
  if(_hatchCache[color])return _hatchCache[color];
  var c=document.createElement('canvas');c.width=8;c.height=8;
  var x=c.getContext('2d');
  if(!x)return color;
  x.fillStyle='#fff';x.fillRect(0,0,8,8);
  x.strokeStyle=color;x.lineWidth=2.5;x.lineCap='square';
  x.beginPath();
  x.moveTo(-2,6);x.lineTo(6,-2);      // tegel-naad linksboven
  x.moveTo(2,10);x.lineTo(10,2);      // hoofddiagonaal
  x.moveTo(6,14);x.lineTo(14,6);      // tegel-naad rechtsonder
  x.stroke();
  var p=x.createPattern(c,'repeat');
  _hatchCache[color]=p||color;
  return _hatchCache[color];
}

// Standaardopmaak voor een staafdataset waarvan sommige maanden onvolledig zijn:
// volledige maand = effen kleur, onvolledige maand = arcering + contour.
// vol = array booleans (true = volledig), kleur = string of array per index.
function hatchBar(vol,kleur){
  var kl=function(i){return (typeof kleur==='function')?kleur(i):(Array.isArray(kleur)?kleur[i]:kleur);};
  return {
    backgroundColor:(vol||[]).map(function(v,i){return v?kl(i):hatchPat(kl(i));}),
    borderColor:(vol||[]).map(function(v,i){return kl(i);}),
    borderWidth:(vol||[]).map(function(v){return v?0:1.5;}),
    borderSkipped:false
  };
}

// Legenda-swatch + waarschuwingstekst voor onvolledige maanden (huisstijl .lg/.opt-warn).
// mKeys = maandsleutels 'YYYY-MM' in grafiekvolgorde, dekking = resultaat van maandDekking().
function onvolledigNotice(mKeys,dekking,wat,kleur){
  var op=(mKeys||[]).filter(function(k){return !_dek(dekking,k).volledig;});
  if(!op.length)return '';
  var kl=kleur||'#46962b';
  var lijst=op.map(function(k){var d=_dek(dekking,k);return mndLabel(mKeys,k)+' ('+d.dagen+' van '+d.dagenInMaand+' dagen)';}).join(', ');
  return '<div class="lg" style="margin-bottom:4px">'+
      '<span class="li"><span class="ld" style="background:'+kl+'"></span>Volledige maand</span>'+
      '<span class="li"><span class="ld" style="background:repeating-linear-gradient(45deg,'+kl+' 0 2px,#fff 2px 4px);border:1px solid '+kl+'"></span>Onvolledige maand</span>'+
    '</div>'+
    '<div class="opt-warn">⚠ Onvolledige '+(op.length===1?'maand':'maanden')+': '+lijst+
    '. '+(op.length===1?'Deze staaf is':'Deze staven zijn')+' gearceerd — de lagere waarde komt door ontbrekende meetdata, niet door lager '+(wat||'verbruik')+'.</div>';
}

// Renderen
function renderAll(){renderProjSel();renderSidebar();renderHdrProj();renderOverzicht();try{renderScenarioSidebar();}catch(e){}try{renderEHP();}catch(e){}try{renderHome();}catch(e){}try{renderInd();}catch(e){}}

function renderHdrProj(){
  var el=document.getElementById('hdrProj');
  if(!el)return;
  var p=ap();
  if(!p){el.innerHTML='';return;}
  var tags=(p.companies||[]).map(function(c){
    return '<span class="hdr-proj-tag">'+c.name.replace(/[<>]/g,'')+'</span>';
  }).join('');
  el.innerHTML='<div class="hdr-proj-name">'+p.name.replace(/[<>]/g,'')+'</div>'+(tags?'<div class="hdr-proj-tags">'+tags+'</div>':'');
}

function renderProjSel(){
  var s=document.getElementById('projSel');
  s.innerHTML=S.projects.map(function(p){return '<option value="'+p.id+'"'+(p.id===S.activeId?' selected':'')+'>'+p.name+'</option>';}).join('');
}

function renderSidebar(){
  var p=ap();var list=document.getElementById('cList');
  if(!p||!p.companies.length){list.innerHTML='<div style="padding:10px 0;text-align:center;font-size:11px;color:#aaa">Nog geen aansluitingen</div>';return;}
  // Bepaal welke aansluitingen in het actieve scenario zitten
  var activeSc=null;
  try{var sid=_optim.activeScenId;if(sid&&sid!=='basis')activeSc=_findScen(sid);}catch(e){}
  var activeIds=(activeSc&&activeSc.connectionIds&&activeSc.connectionIds.length)?activeSc.connectionIds:null;
  var html='';
  for(var i=0;i<p.companies.length;i++){
    var c=p.companies[i];
    var inScen=!activeIds||activeIds.indexOf(c.id)!==-1;
    html+='<div class="ci s'+(inScen?'':' ci-dim')+'">';
    html+='<div class="cn"><span class="dt" style="background:'+PAL[i%PAL.length]+'"></span>'+c.name+'</div>';
    html+='<div class="cm">'+c.category+' · GTV '+c.gtvA+'kW · <span id="pt_'+c.id+'">…</span> pt</div>';
    html+='<div style="margin-top:4px"><button class="b demo-hide" style="font-size:9px;padding:2px 6px;background:#f0f4f2;color:#46962b" data-editid="'+c.id+'">Bewerken</button></div>';
    html+='</div>';
  }
  list.innerHTML=html;
  p.companies.forEach(function(c){
    dbGet('ts',c.id).then(function(d){
      var el=document.getElementById('pt_'+c.id);
      if(el)el.textContent=(d&&d.length)||0;
    }).catch(function(){});
  });
}

function updateKpisForRes(res){
  if(!_optim.allTs.length)return;
  var grpKw=res.grpKw||_optim.baseKw;
  var wd=res.withData||_optim.withData;
  var gtvA=(res.gtvA!=null&&res.gtvA>0)?res.gtvA:_optim.gtvA;
  var gtvT=(res.gtvT!=null&&res.gtvT>0)?res.gtvT:_optim.gtvT;
  var gA=grpKw.map(function(v){return Math.max(0,v);});
  var gT=grpKw.map(function(v){return Math.max(0,-v);});
  var maxA=gA.length?Math.max.apply(null,gA):0;
  var maxT=gT.length?Math.max.apply(null,gT):0;
  var ovA=gA.filter(function(v){return v>gtvA;}).length;
  var ovT=gT.filter(function(v){return v>gtvT;}).length;
  var vol=grpKw.reduce(function(s,v){return s+Math.abs(v);},0)*0.25/1000;
  var volAkwh=0,volTkwh=0,volADal=0,volAHoog=0,volTDal=0,volTHoog=0;
  for(var j=0;j<grpKw.length;j++){
    var vj=grpKw[j],tsj=_optim.allTs[j],kwh=Math.abs(vj)*0.25;
    if(vj>0){volAkwh+=kwh;if(isDL(tsj))volADal+=kwh;else volAHoog+=kwh;}
    else if(vj<0){volTkwh+=kwh;if(isDL(tsj))volTDal+=kwh;else volTHoog+=kwh;}
  }
  document.getElementById('kOvlp').textContent=_optim.allTs.length;
  document.getElementById('kN').textContent=wd.length;
  setKpi('kPA',maxA.toFixed(0),maxA>gtvA);
  setKpi('kPT',maxT.toFixed(0),maxT>gtvT);
  setKpi('kOA',ovA,ovA>0);
  setKpi('kOT',ovT,ovT>0);
  document.getElementById('kVol').textContent=vol.toFixed(1);
  document.getElementById('kVerbrA').textContent=fmt(volAkwh);
  document.getElementById('kVerbrADal').textContent=fmt(volADal);
  document.getElementById('kVerbrAHoog').textContent=fmt(volAHoog);
  document.getElementById('kVerbrT').textContent=fmt(volTkwh);
  document.getElementById('kVerbrTDal').textContent=fmt(volTDal);
  document.getElementById('kVerbrTHoog').textContent=fmt(volTHoog);
  document.getElementById('gtvHint').textContent='Afname: '+gtvA+' kW | Teruglevering: '+gtvT+' kW';
  var nPts=grpKw.length;
  var maxKwhA=gtvA*nPts*0.25;
  var maxKwhT=gtvT*nPts*0.25;
  var benutA=maxKwhA>0?(volAkwh/maxKwhA*100):0;
  var benutT=maxKwhT>0?(volTkwh/maxKwhT*100):0;
  var bdkKpis=document.getElementById('bdkKpis');
  if(bdkKpis){
    bdkKpis.innerHTML=
      '<div class="kb"><div class="kl">GTV-benutting afname</div><div class="kv">'+benutA.toFixed(1)+'%</div><div class="ku">van max. '+fmt(maxKwhA/1000)+' MWh bij GTV '+gtvA+' kW</div></div>'+
      '<div class="kb"><div class="kl">GTV-benutting teruglevering</div><div class="kv">'+benutT.toFixed(1)+'%</div><div class="ku">van max. '+fmt(maxKwhT/1000)+' MWh bij GTV-T '+gtvT+' kW</div></div>';}
}

function renderOverzicht(){
  var p=ap();
  document.getElementById('kProj').textContent=p?p.name:'—';
  document.getElementById('kN').textContent=p?p.companies.length:0;
  var body=document.getElementById('ovBody');
  if(!p||!p.companies.length){body.innerHTML='<tr><td colspan="10" style="text-align:center;padding:16px;color:#aaa">Geen aansluitingen</td></tr>';return;}
  var html='';
  for(var i=0;i<p.companies.length;i++){
    var c=p.companies[i];
    html+='<tr><td><span class="dt" style="background:'+PAL[i%PAL.length]+';display:inline-block"></span></td>';
    html+='<td><strong>'+c.name+'</strong></td><td style="font-family:monospace;font-size:10px">'+(c.ean||'—')+'</td>';
    html+='<td><span class="bdg bg">'+c.category+'</span></td>';
    html+='<td>'+c.gtvA+'kW</td><td>'+c.gtvT+'kW</td>';
    html+='<td>'+(c.kva!=null?c.kva+' kVA':'—')+'</td>';
    html+='<td>'+(c.zekering||'—')+'</td>';
    html+='<td id="op_'+c.id+'">…</td>';
    html+='<td><button class="b" style="font-size:9px;padding:2px 6px" data-editid="'+c.id+'">Bewerken</button></td></tr>';
  }
  body.innerHTML=html;
  p.companies.forEach(function(c){
    dbGet('ts',c.id).then(function(d){
      var el=document.getElementById('op_'+c.id);
      if(el)el.textContent=(d&&d.length)||0;
    }).catch(function(){});
  });
}

// Modal helpers
function showM(id){document.getElementById(id).style.display='flex';}
function hideM(id){document.getElementById(id).style.display='none';}

// Projectbeheer
function openNewProj(){
  document.getElementById('mProjTitle').textContent='Nieuw project';
  document.getElementById('btnCreateProj').style.display='';
  document.getElementById('btnRenameProjSave').style.display='none';
  document.getElementById('mPN').value='';
  document.getElementById('mPD').value='';
  showM('mProj');
  document.getElementById('mPN').focus();
}

function openRenameProj(){
  var p=ap();if(!p)return;
  document.getElementById('mProjTitle').textContent='Project hernoemen';
  document.getElementById('btnCreateProj').style.display='none';
  document.getElementById('btnRenameProjSave').style.display='';
  document.getElementById('mPN').value=p.name;
  document.getElementById('mPD').value=p.desc||'';
  showM('mProj');
  document.getElementById('mPN').focus();
}

function createProj(){
  var name=document.getElementById('mPN').value.trim();
  if(!name){notify('Vul een naam in',false);return;}
  var id=uid();
  S.projects.push({id:id,name:name,desc:document.getElementById('mPD').value.trim(),companies:[]});
  S.activeId=id;hideM('mProj');saveMeta();renderAll();notify('Project "'+name+'" aangemaakt');
}

function renameProj(){
  var p=ap();if(!p)return;
  var name=document.getElementById('mPN').value.trim();
  if(!name){notify('Vul een naam in',false);return;}
  p.name=name;p.desc=document.getElementById('mPD').value.trim();
  hideM('mProj');saveMeta();renderAll();notify('Project hernoemd naar "'+name+'"');
}

function delProj(){
  if(S.projects.length<=1){notify('Minimaal één project vereist',false);return;}
  var p=ap();if(!confirm('Project "'+p.name+'" verwijderen?'))return;
  p.companies.forEach(function(c){dbDel('ts',c.id);});
  S.projects=S.projects.filter(function(x){return x.id!==S.activeId;});
  S.activeId=S.projects[0].id;saveMeta();resetCH();renderAll();notify('Project verwijderd');
}

// Aansluitingbeheer
function openAddComp(){
  editId=null;pendData=null;pendName='';
  document.getElementById('mCT').textContent='Aansluiting toevoegen';
  document.getElementById('btnDelComp').style.display='none';
  document.getElementById('cN').value='';document.getElementById('cE').value='';
  document.getElementById('cCarrier').value='elektra';document.getElementById('cDeelnemer').value='';
  document.getElementById('cAdres').value='';document.getElementById('cLat').value='';document.getElementById('cLng').value='';
  document.getElementById('cKva').value='';document.getElementById('cZek').value='';
  document.getElementById('cCat').value='Grootverbruik';
  document.getElementById('cGA').value='150';document.getElementById('cGT').value='80';
  document.getElementById('cSA').value='TrafoMSLS';document.getElementById('cST').value='TrafoMSLS';
  document.getElementById('cPA').value='0.23';document.getElementById('cPT2').value='0.08';
  document.getElementById('cPD').value='';document.getElementById('cPills').innerHTML='';
  setPT('static');showM('mComp');
}

async function openEditComp(id){
  var p=ap();var c=null;
  for(var i=0;i<p.companies.length;i++){if(p.companies[i].id===id){c=p.companies[i];break;}}
  if(!c)return;
  editId=id;
  var data=await dbGet('ts',id)||[];
  pendData=data;pendName=c.fileName||'';
  document.getElementById('mCT').textContent='Aansluiting bewerken';
  document.getElementById('btnDelComp').style.display='';
  document.getElementById('cN').value=c.name;document.getElementById('cE').value=c.ean||'';
  document.getElementById('cCarrier').value=c.carrier||'elektra';document.getElementById('cDeelnemer').value=c.deelnemer||'';
  document.getElementById('cAdres').value=c.adres||'';
  document.getElementById('cLat').value=c.lat!=null?c.lat:'';document.getElementById('cLng').value=c.lng!=null?c.lng:'';
  document.getElementById('cKva').value=c.kva!=null?c.kva:'';document.getElementById('cZek').value=c.zekering||'';
  document.getElementById('cCat').value=c.category||'Grootverbruik';
  document.getElementById('cGA').value=c.gtvA!=null?c.gtvA:150;document.getElementById('cGT').value=c.gtvT!=null?c.gtvT:0;
  document.getElementById('cSA').value=c.stedinA||'TrafoMSLS';document.getElementById('cST').value=c.stedinT||'TrafoMSLS';
  document.getElementById('cPA').value=c.priceA!=null?c.priceA:0.12;document.getElementById('cPT2').value=c.priceT!=null?c.priceT:0.08;
  document.getElementById('cPD').value=c.priceDyn||'';
  setPT(c.priceType||'static');
  document.getElementById('cPills').innerHTML=pendName?'<div class="pl">'+pendName+' ('+data.length+' metingen)</div>':'';
  showM('mComp');
}

async function saveComp(){
  var name=document.getElementById('cN').value.trim();
  if(!name){notify('Vul een naam in',false);return;}
  var p=ap();var id=editId||uid();
  var _cLat=parseFloat(document.getElementById('cLat').value);
  var _cLng=parseFloat(document.getElementById('cLng').value);
  var _deeln=document.getElementById('cDeelnemer').value.trim();
  var obj={id:id,name:name,ean:document.getElementById('cE').value.trim(),
    carrier:document.getElementById('cCarrier').value||'elektra',
    deelnemer:_deeln||name,
    adres:document.getElementById('cAdres').value.trim(),
    lat:isNaN(_cLat)?null:_cLat,lng:isNaN(_cLng)?null:_cLng,
    category:document.getElementById('cCat').value,
    gtvA:(function(){var v=parseFloat(document.getElementById('cGA').value);return isNaN(v)?150:v;})(),gtvT:(function(){var v=parseFloat(document.getElementById('cGT').value);return isNaN(v)?80:v;})(),
    kva:(function(){var v=parseFloat(document.getElementById('cKva').value);return isNaN(v)?null:v;})(),
    zekering:document.getElementById('cZek').value.trim(),
    stedinA:document.getElementById('cSA').value,stedinT:document.getElementById('cST').value,
    priceType:pType,priceA:parseFloat(document.getElementById('cPA').value)||0.12,
    priceT:parseFloat(document.getElementById('cPT2').value)||0.08,
    priceDyn:document.getElementById('cPD').value,fileName:pendName,selected:true};
  if(editId){
    for(var i=0;i<p.companies.length;i++){if(p.companies[i].id===editId){obj.selected=p.companies[i].selected;p.companies[i]=obj;break;}}
  }else{p.companies.push(obj);}
  if(pendData&&pendData.length>0)await dbSet('ts',id,pendData);
  hideM('mComp');await saveMeta();renderAll();notify('"'+name+'" opgeslagen');
}

async function deleteComp(){
  if(!editId)return;if(!confirm('Aansluiting verwijderen?'))return;
  var p=ap();p.companies=p.companies.filter(function(c){return c.id!==editId;});
  await dbDel('ts',editId);hideM('mComp');await saveMeta();resetCH();renderAll();notify('Verwijderd');
}

function setPT(type){
  pType=type;
  document.getElementById('pStatic').style.display=type==='static'?'grid':'none';
  document.getElementById('pDynamic').style.display=type==='dynamic'?'block':'none';
  document.querySelectorAll('#pTgl .tg').forEach(function(b){b.classList.remove('on');if(b.getAttribute('data-pt')===type)b.classList.add('on');});
}

// Analyse
async function runAnalysis(){
  var p=ap();
  if(!p||!p.companies.length){notify('Voeg eerst aansluitingen toe',false);return;}
  // Multicommodity: analyse draait per drager. Bepaal de actieve drager en toon de keuzebalk.
  var carriers=projectCarriers();
  if(_activeCarrier!=='hub'&&carriers.indexOf(_activeCarrier)===-1)_activeCarrier=carriers[0]||'elektra';
  if(_activeCarrier==='hub'&&_yearFilter==='compare')_yearFilter=null; // vergelijken bestaat niet in hub-modus
  renderCarrierTabs(carriers);
  setCarrierView();      // schaal/eenheid/GTV-lijnen voor de grafieken
  applyTabVisibility();  // drager-afhankelijke tabs (gas: geen overschr./piek/vergelijking)
  // Hub-modus: cross-carrier energiestromen i.p.v. de per-drager chartketen.
  if(_activeCarrier==='hub'){
    try{await renderHub(p);}catch(e){console.error('renderHub:',e);notify('Hub-weergave mislukt: '+e.message,false);}
    var dlbH=document.getElementById('btnDlGroep');if(dlbH)dlbH.disabled=true;
    return;
  }
  // Aansluitingen van de actieve drager (elektra-only project → alle aansluitingen, ongewijzigd).
  var carCos=p.companies.filter(function(c){return (c.carrier||'elektra')===_activeCarrier;});
  if(!carCos.length){notify('Geen aansluitingen voor drager: '+carrierDef(_activeCarrier).label,false);return;}
  // Laad + normaliseer data per aansluiting (elektra wordt 1-op-1 doorgegeven).
  var withData=[];
  for(var i=0;i<carCos.length;i++){
    var d=await dbGet('ts',carCos[i].id)||[];
    if(!d.length&&_activeCarrier==='elektra'){d=genDemo(withData.length);notify('Demodata voor: '+carCos[i].name);}
    withData.push(Object.assign({},carCos[i],{data:_carrierSeries(carCos[i],d)}));
  }
  // Jaarfilter / vergelijkmodus: bepaal beschikbare jaren en toon de balk.
  var years=_collectYears(withData);
  if(years.length<=1)_yearFilter=null; // één jaar → geen filter/vergelijking mogelijk
  if(_yearFilter&&_yearFilter!=='compare'&&years.indexOf(_yearFilter)===-1)_yearFilter=null;
  renderYearTabs(years);
  applyTabVisibility(); // _yearFilter kan net gewijzigd zijn → tabs opnieuw afstemmen
  // Vergelijkmodus: render jaarvergelijking (overzicht + jaarprofiel) en stop.
  if(_yearFilter==='compare'){
    resetCH();
    _setComparePanels(true);
    var oeC=document.getElementById('ovElektra'),ogC=document.getElementById('ovGas');
    if(oeC)oeC.style.display='none';if(ogC)ogC.style.display='none';
    try{renderYearComparison(withData);}catch(e){console.error('renderYearComparison:',e);notify('Vergelijking mislukt: '+e.message,false);}
    var dlbC=document.getElementById('btnDlGroep');if(dlbC)dlbC.disabled=true;
    notify('Jaren vergeleken ('+carrierDef(_activeCarrier).label+')');
    return;
  }
  _setComparePanels(false);
  if(_yearFilter){
    withData=withData.map(function(c){return Object.assign({},c,{data:(c.data||[]).filter(function(d){return String(d.ts).slice(0,4)===_yearFilter;})});});
  }
  _optim.allData=withData;
  resetCH();
  var somA=withData.reduce(function(s,c){return s+(c.gtvA||150);},0);
  var somT=withData.reduce(function(s,c){return s+(c.gtvT||0);},0);
  var inGA=parseFloat(document.getElementById('gGtvA').value);
  var inGT=parseFloat(document.getElementById('gGtvT').value);
  var gtvA=isNaN(inGA)?somA:inGA;
  var gtvT=isNaN(inGT)?somT:inGT;
  document.getElementById('gGtvA').placeholder=String(somA);
  document.getElementById('gGtvT').placeholder=String(somT);
  var tsSets=withData.map(function(c){var s={};c.data.forEach(function(d){s[d.ts]=1;});return s;});
  var allTs=Object.keys(tsSets[0]).filter(function(ts){return tsSets.every(function(s){return s[ts];});}).sort();
  if(!allTs.length){notify('Geen overlappende timestamps',false);return;}
  var perKw=withData.map(function(c){var m={};c.data.forEach(function(d){m[d.ts]=d.kw;});return allTs.map(function(ts){return m[ts];});});
  var grpKw=allTs.map(function(_,i){return perKw.reduce(function(s,a){return s+a[i];},0);});
  var gA=grpKw.map(function(v){return Math.max(0,v);});
  var gT=grpKw.map(function(v){return Math.max(0,-v);});
  try{drawJaar(allTs,perKw,grpKw,withData,gtvA,gtvT);}catch(e){console.error('drawJaar:',e);}
  try{drawWeek(allTs,grpKw,perKw,withData,gtvA,gtvT);}catch(e){console.error('drawWeek:',e);}
  try{drawGelijktijdigheid(allTs,perKw,withData);}catch(e){console.error('drawGelijktijdigheid:',e);}
  try{drawBDK(perKw,gA,gT,withData,gtvA,gtvT);}catch(e){console.error('drawBDK:',e);}
  try{drawOvsch(allTs,gA,gT,gtvA,gtvT);}catch(e){console.error('drawOvsch:',e);}
  try{drawPiek(allTs,perKw,grpKw,withData);}catch(e){console.error('drawPiek:',e);}
  var totKm=withData.reduce(function(s,c){return s+(ST[c.stedinT||'none']||ST.none).km;},0);
  _optim.baseKw=grpKw.slice();_optim.allTs=allTs.slice();
  _optim.gtvA=gtvA;_optim.gtvT=gtvT;_optim.avgKm=totKm/Math.max(1,withData.length);
  _optim.perKw=perKw;_optim.withData=withData;
  // Overzicht: gas krijgt een eigen pagina (m³/maand/CO₂/baseload); elektra/warmte de bestaande KPI's.
  var ovEl=document.getElementById('ovElektra'),ovGas=document.getElementById('ovGas');
  if(_activeCarrier==='gas'){
    if(ovEl)ovEl.style.display='none';if(ovGas)ovGas.style.display='';
    try{renderGasOverzicht(withData,allTs,grpKw,perKw);}catch(e){console.error('renderGasOverzicht:',e);}
  }else{
    if(ovGas)ovGas.style.display='none';if(ovEl)ovEl.style.display='';
    updateKpisForRes({grpKw:grpKw,withData:withData,gtvA:gtvA,gtvT:gtvT});
  }
  // Scenario's (zon/batterij) zijn elektra-specifiek — alleen voor de elektra-drager.
  if(_activeCarrier==='elektra'){try{recalcAllScenarios();}catch(e){console.error('recalcAllScenarios:',e);}}
  else{try{document.getElementById('scenBanner').style.display='none';}catch(e){}}
  try{renderKaart();}catch(e){}
  notify('Analyse klaar ('+carrierDef(_activeCarrier).label+') — '+allTs.length+' overlappende waarden');
  var dlBtn=document.getElementById('btnDlGroep');if(dlBtn)dlBtn.disabled=false;
}

function genDemo(idx){
  var data=[];var start=new Date('2024-01-01T00:00:00Z');
  var bases=[80,130,50,200,60];var peaks=[160,300,90,400,100];
  var base=bases[idx%5];var peak=peaks[idx%5];
  for(var d=0;d<365;d++){for(var q=0;q<96;q++){
    var dt=new Date(start.getTime()+(d*86400+q*900)*1000);
    var h=q/4;var dow=dt.getDay();var kw=base*0.15;
    if(dow>0&&dow<6&&h>=7&&h<=19)kw=base+peak*Math.sin(Math.PI*(h-7)/12)*(0.8+0.2*Math.random());
    if(dow>0&&dow<6&&h>=10&&h<=15&&idx%3===1)kw-=peak*0.4*Math.sin(Math.PI*(h-10)/5);
    data.push({ts:dt.toISOString().slice(0,16),kw:Math.round(kw*100)/100});
  }}return data;
}

function triggerDownload(blob,filename){
  if(window.navigator&&window.navigator.msSaveOrOpenBlob){
    window.navigator.msSaveOrOpenBlob(blob,filename);
    return;
  }
  var url=URL.createObjectURL(blob);
  var a=document.createElement('a');
  a.href=url;
  a.download=filename;
  a.rel='noopener';
  a.style.display='none';
  document.body.appendChild(a);
  a.click();
  setTimeout(function(){
    if(a.parentNode)a.parentNode.removeChild(a);
    URL.revokeObjectURL(url);
  },1000);
}

function triggerDownloadAsLink(blob,filename){
  var url=URL.createObjectURL(blob);
  var modal=document.createElement('div');
  modal.className='mbg';
  modal.style.display='flex';
  modal.innerHTML=
    '<div class="mo" style="max-width:460px">'+
      '<div class="mh">Exportbestand klaar<button class="mx" type="button">&times;</button></div>'+
      '<p style="font-size:12px;color:#666;margin:0 0 14px">Klik op de knop hieronder om <strong>'+filename+'</strong> op te slaan. Werkt dat niet, klik dan rechts en kies <em>"Link opslaan als…"</em>.</p>'+
      '<a class="b" id="expLinkBtn" style="display:block;text-align:center;text-decoration:none;width:100%">Download '+filename+'</a>'+
      '<div style="margin-top:10px;display:flex;justify-content:flex-end">'+
        '<button class="b" type="button" id="expLinkClose" style="background:transparent;border:1.5px solid #ccc;color:#555">Sluiten</button>'+
      '</div>'+
    '</div>';
  document.body.appendChild(modal);
  var link=modal.querySelector('#expLinkBtn');
  link.href=url;
  link.setAttribute('download',filename);
  var revoked=false;
  function close(){
    if(revoked)return;
    revoked=true;
    if(modal.parentNode)modal.parentNode.removeChild(modal);
    URL.revokeObjectURL(url);
    document.removeEventListener('keydown',onKey);
  }
  function onKey(e){if(e.key==='Escape')close();}
  modal.querySelector('.mx').onclick=close;
  modal.querySelector('#expLinkClose').onclick=close;
  document.addEventListener('keydown',onKey);
  setTimeout(function(){if(!revoked)URL.revokeObjectURL(url);},10*60*1000);
}

function doDownloadGroepsprofiel(){
  var allTs=_optim.allTs;
  if(!allTs.length){notify('Voer eerst de analyse uit',false);return;}
  var grpKw=_optim.baseKw;
  var sid=_optim.activeScenId;
  if(sid&&sid!=='basis'&&_optim.scenResults[sid])grpKw=_optim.scenResults[sid].grpKw||grpKw;
  var p=ap();
  var projName=p?p.name:'groepsprofiel';
  var startDate=allTs[0].slice(0,10);
  var fwdReadings=[],revReadings=[];
  for(var i=0;i<allTs.length;i++){
    var ts=allTs[i];
    var tsZ=ts.length===16?ts+':00Z':ts.endsWith('Z')?ts:ts+'Z';
    var v=grpKw[i];
    fwdReadings.push({value:+(Math.max(0,v)*0.25).toFixed(6),time_stamp:tsZ});
    revReadings.push({value:+(Math.max(0,-v)*0.25).toFixed(6),time_stamp:tsZ});
  }
  var mrs=[
    {values_interval:{start:startDate,end:'2999-12-31'},interval_blocks:[{interval_readings:fwdReadings,reading_type:{flow_direction:'forward',multiplier:'k',unit:'W'}}]},
    {values_interval:{start:startDate,end:'2999-12-31'},interval_blocks:[{interval_readings:revReadings,reading_type:{flow_direction:'reverse',multiplier:'k',unit:'W'}}]}
  ];
  var scenLabel=sid&&sid!=='basis'?('-'+sid):'';
  var payload={
    identifier:'egp-groepsprofiel'+scenLabel,
    contact_point:'',
    conforms_to:'http://data.netbeheernederland.nl/data-product/dp-meetdata/',
    release_date:new Date().toISOString().slice(0,10),
    version:'1.1.0',
    market_evaluation_points:[{meter_readings:mrs,european_article_number_ean:projName}]
  };
  var fname='groepsprofiel-'+projName.replace(/[^a-z0-9]/gi,'-').toLowerCase()+scenLabel+'-'+new Date().toISOString().slice(0,10)+'.json';
  triggerDownload(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),fname);
}

// Exporteren / importeren / downloaden
function openExportModal(){
  var p=ap();
  document.getElementById('expProjName').textContent=p?p.name:'—';
  document.getElementById('expScopeCurrent').checked=true;
  document.getElementById('expChkTs').checked=true;
  document.getElementById('expChkScen').checked=true;
  document.getElementById('expChkEhp').checked=true;
  updateExpInfo();
  showM('mExp');
}

function updateExpInfo(){
  var p=ap();
  var scope=document.querySelector('input[name="expScope"]:checked').value;
  var inclTs=document.getElementById('expChkTs').checked;
  var inclScen=document.getElementById('expChkScen').checked;
  var inclEhp=document.getElementById('expChkEhp').checked;
  var projs=scope==='current'?(p?[p]:[]):S.projects;
  var nConn=projs.reduce(function(s,pr){return s+pr.companies.length;},0);
  var nScen=projs.reduce(function(s,pr){return s+((pr.scenarios&&pr.scenarios.length)||0);},0);
  var nEhp=projs.reduce(function(s,pr){return s+((pr.ehps&&pr.ehps.length)||0);},0);
  var parts=[];
  parts.push(projs.length+' project'+(projs.length!==1?'en':''));
  parts.push(nConn+' aansluiting'+(nConn!==1?'en':''));
  if(inclTs)parts.push('meetdata');
  if(inclScen&&nScen>0)parts.push(nScen+' scenario'+(nScen!==1?'s':''));
  if(inclEhp&&nEhp>0)parts.push(nEhp+' handelsplatform'+(nEhp!==1?'s':''));
  document.getElementById('expInfo').textContent='Export bevat: '+parts.join(' · ');
}

async function doExportData(){
  var p=ap();
  var scope=document.querySelector('input[name="expScope"]:checked').value;
  var inclTs=document.getElementById('expChkTs').checked;
  var inclScen=document.getElementById('expChkScen').checked;
  var inclEhp=document.getElementById('expChkEhp').checked;
  var useEnc=document.getElementById('expEncrypt').checked;
  var method=document.querySelector('input[name="expMethod"]:checked').value;
  if(useEnc){
    var pwd=document.getElementById('expPwd').value;
    var pwd2=document.getElementById('expPwdConfirm').value;
    if(!pwd){notify('Vul een wachtwoord in',false);return;}
    if(pwd!==pwd2){notify('Wachtwoorden komen niet overeen',false);return;}
  }
  try{
    var projs=scope==='current'?(p?[p]:[]):S.projects;
    var projsCopy=JSON.parse(JSON.stringify(projs));
    if(!inclScen)projsCopy.forEach(function(pr){delete pr.scenarios;});
    if(!inclEhp)projsCopy.forEach(function(pr){delete pr.ehps;});
    var tsData={};
    if(inclTs){
      for(var i=0;i<projsCopy.length;i++){
        for(var j=0;j<projsCopy[i].companies.length;j++){
          var c=projsCopy[i].companies[j];
          var d=await dbGet('ts',c.id);
          if(d&&d.length)tsData[c.id]=d;
        }
      }
    }
    var activeId=scope==='current'&&p?p.id:S.activeId;
    var payload={version:4,exportDate:new Date().toISOString(),state:{projects:projsCopy,activeId:activeId},timeseries:tsData};
    var json=JSON.stringify(payload);
    var safeName=(scope==='current'&&p)?p.name.replace(/[^a-z0-9]/gi,'-').toLowerCase():'alle-projecten';
    if(useEnc){json=await egpEncrypt(json,pwd);safeName+='-encrypted';}
    var fname='egp-'+safeName+'-'+new Date().toISOString().slice(0,10)+'.json';
    var blob=new Blob([json],{type:'application/octet-stream'});
    if(method==='link'){
      triggerDownloadAsLink(blob,fname);
    }else{
      triggerDownload(blob,fname);
    }
    hideM('mExp');
    notify('Data geëxporteerd'+(scope==='current'?' ('+p.name+')':'')+(useEnc?' — versleuteld':''));
  }catch(e){notify('Export mislukt: '+e.message,false);}
}

var _pendingEncJson=null;

async function _doImportObj(obj){
  if(!obj.state||!obj.timeseries){notify('Ongeldig bestand',false);return;}
  var nP=obj.state.projects?obj.state.projects.length:0;
  var nPt=Object.values(obj.timeseries).reduce(function(s,d){return s+d.length;},0);
  if(!confirm('Importeer '+nP+' project(en) met '+nPt.toLocaleString()+' meetpunten?'))return;
  var existIds={};S.projects.forEach(function(p){existIds[p.id]=p;});
  obj.state.projects.forEach(function(p){
    if(existIds[p.id]){
      var ex=existIds[p.id];
      var exCIds={};ex.companies.forEach(function(c){exCIds[c.id]=1;});
      p.companies.forEach(function(c){if(exCIds[c.id]){for(var i=0;i<ex.companies.length;i++){if(ex.companies[i].id===c.id){ex.companies[i]=c;break;}}}else ex.companies.push(c);});
      if(p.scenarios)ex.scenarios=p.scenarios;
      if(p.ehps)ex.ehps=p.ehps;
    }
    else S.projects.push(p);
  });
  if(!S.activeId&&obj.state.activeId)S.activeId=obj.state.activeId;
  for(var id in obj.timeseries)await dbSet('ts',id,obj.timeseries[id]);
  await saveMeta();renderAll();notify('Geïmporteerd: '+nP+' project(en)');
}

async function doImportData(file){
  if(!file)return;
  var r=new FileReader();
  r.onload=async function(e){
    try{
      var text=e.target.result;
      var obj=JSON.parse(text);
      if(isEncryptedExport(obj)){
        _pendingEncJson=text;
        document.getElementById('impPwd').value='';
        showM('mImportPwd');
        return;
      }
      await _doImportObj(obj);
    }catch(err){notify('Import mislukt: '+err.message,false);}
  };
  r.readAsText(file,'UTF-8');
}


// Event listeners
document.addEventListener('DOMContentLoaded',function(){
  // Tabs
  document.querySelectorAll('.tab').forEach(function(btn){
    btn.addEventListener('click',function(){
      document.querySelectorAll('.pn').forEach(function(p){p.classList.remove('on');});
      document.querySelectorAll('.tab').forEach(function(b){b.classList.remove('on');});
      document.getElementById(btn.getAttribute('data-tab')).classList.add('on');
      btn.classList.add('on');
      if(btn.getAttribute('data-tab')==='tKaart'){try{renderKaart();}catch(e){}}
      if(btn.getAttribute('data-tab')==='tGelijkt'){try{drawGelijktijdigheid(_optim.allTs,_optim.perKw,_optim.withData);}catch(e){}}
    });
  });
  // Prijs toggle
  document.querySelectorAll('#pTgl .tg').forEach(function(btn){
    btn.addEventListener('click',function(){setPT(btn.getAttribute('data-pt'));});
  });
  // Project select
  document.getElementById('projSel').addEventListener('change',function(){
    S.activeId=this.value;_optim.activeScenId='basis';_optim.scenResults={};_optim.baseKw=[];
    try{document.getElementById('scenBanner').style.display='none';}catch(e){}
    resetCH();renderAll();
  });
  // Header knoppen
  document.getElementById('btnNieuwProj').addEventListener('click',openNewProj);
  document.getElementById('btnRenameProj').addEventListener('click',openRenameProj);
  document.getElementById('btnDelProj').addEventListener('click',delProj);
  document.getElementById('btnRapport').addEventListener('click',openRapportModal);
  document.getElementById('btnExpData').addEventListener('click',openExportModal);
  document.getElementById('impIn').addEventListener('change',function(){doImportData(this.files[0]);this.value='';});
  // Zijbalk
  document.getElementById('btnAddComp').addEventListener('click',openAddComp);
  document.getElementById('btnRun').addEventListener('click',runAnalysis);
  // Drager-keuze (multicommodity): wissel actieve drager en herbereken.
  var carrierBarEl=document.getElementById('carrierBar');
  if(carrierBarEl)carrierBarEl.addEventListener('click',function(e){
    var b=e.target.closest('[data-carrier]');if(!b)return;
    var k=b.getAttribute('data-carrier');
    if(k===_activeCarrier)return;
    _activeCarrier=k;resetCH();runAnalysis();
  });
  // Jaarfilter (multicommodity/meerjarig): wissel actief jaar en herbereken.
  var yearBarEl=document.getElementById('yearBar');
  if(yearBarEl)yearBarEl.addEventListener('change',function(e){
    var sel=e.target.closest('#yearSel');if(!sel)return;
    _yearFilter=sel.value||null;resetCH();runAnalysis();
  });
  document.getElementById('btnDlGroep').addEventListener('click',doDownloadGroepsprofiel);
  // Gedelegeerd: bewerk-knoppen in zijbalk/tabel
  document.getElementById('cList').addEventListener('click',function(e){
    var editBtn=e.target.closest('[data-editid]');
    if(editBtn)openEditComp(editBtn.getAttribute('data-editid'));
  });
  document.getElementById('ovBody').addEventListener('click',function(e){
    var editBtn=e.target.closest('[data-editid]');if(editBtn)openEditComp(editBtn.getAttribute('data-editid'));
  });
  // Modal sluiten
  document.getElementById('btnCloseProj').addEventListener('click',function(){hideM('mProj');});
  document.getElementById('btnCloseComp').addEventListener('click',function(){hideM('mComp');});
  document.getElementById('btnCloseRap').addEventListener('click',function(){hideM('mRap');});
  document.getElementById('btnCloseExp').addEventListener('click',function(){hideM('mExp');});
  document.getElementById('btnCloseRapOpts').addEventListener('click',function(){hideM('mRapOpts');});
  document.getElementById('btnCloseRapOpts2').addEventListener('click',function(){hideM('mRapOpts');});
  document.getElementById('mProj').addEventListener('click',function(e){if(e.target===this)hideM('mProj');});
  document.getElementById('mComp').addEventListener('click',function(e){if(e.target===this)hideM('mComp');});
  document.getElementById('mRap').addEventListener('click',function(e){if(e.target===this)hideM('mRap');});
  document.getElementById('mRapOpts').addEventListener('click',function(e){if(e.target===this)hideM('mRapOpts');});
  document.getElementById('mExp').addEventListener('click',function(e){if(e.target===this)hideM('mExp');});
  document.getElementById('mImportPwd').addEventListener('click',function(e){if(e.target===this){hideM('mImportPwd');_pendingEncJson=null;}});
  document.getElementById('btnCloseImpPwd').addEventListener('click',function(){hideM('mImportPwd');_pendingEncJson=null;});
  document.getElementById('btnCloseImpPwd2').addEventListener('click',function(){hideM('mImportPwd');_pendingEncJson=null;});
  document.getElementById('btnImpDecrypt').addEventListener('click',async function(){
    var btn=this;
    var pwd=document.getElementById('impPwd').value;
    if(!pwd){notify('Vul een wachtwoord in',false);return;}
    btn.disabled=true;btn.textContent='Bezig…';
    try{
      var plain=await egpDecrypt(_pendingEncJson,pwd);
      var obj=JSON.parse(plain);
      hideM('mImportPwd');_pendingEncJson=null;
      await _doImportObj(obj);
    }catch(e){notify(e.message,false);}
    finally{btn.disabled=false;btn.textContent='Ontsleutelen';}
  });
  // Modal knoppen
  document.getElementById('btnCreateProj').addEventListener('click',createProj);
  document.getElementById('btnRenameProjSave').addEventListener('click',renameProj);
  document.getElementById('btnSaveComp').addEventListener('click',saveComp);
  document.getElementById('btnDelComp').addEventListener('click',deleteComp);
  document.getElementById('btnDownloadPdf').addEventListener('click',downloadRapportPDF);
  document.getElementById('btnDownloadRap').addEventListener('click',downloadRapportHTML);
  document.getElementById('btnPrint').addEventListener('click',printPreviewRapport);
  document.getElementById('btnGenRap').addEventListener('click',generateRapport);
  document.getElementById('btnDoExp').addEventListener('click',doExportData);
  // Export modal — live info bijwerken bij wijziging scope of opties
  document.querySelectorAll('input[name="expScope"]').forEach(function(r){r.addEventListener('change',updateExpInfo);});
  document.getElementById('expChkTs').addEventListener('change',updateExpInfo);
  document.getElementById('expChkScen').addEventListener('change',updateExpInfo);
  document.getElementById('expChkEhp').addEventListener('change',updateExpInfo);
  (function(){
    var cb=document.getElementById('expEncrypt');
    if(!window.crypto||!window.crypto.subtle){
      cb.disabled=true;cb.parentElement.title='Niet beschikbaar — open het bestand via file:// of HTTPS';
      cb.parentElement.style.opacity='.45';
    }
  })();
  document.getElementById('expEncrypt').addEventListener('change',function(){
    document.getElementById('expPwdSection').style.display=this.checked?'':'none';
  });
  document.getElementById('expPwdEye').addEventListener('click',function(){
    var i=document.getElementById('expPwd');i.type=i.type==='password'?'text':'password';
  });
  document.getElementById('impPwdEye').addEventListener('click',function(){
    var i=document.getElementById('impPwd');i.type=i.type==='password'?'text':'password';
  });
  document.getElementById('expPwd').addEventListener('input',function(){
    var n=this.value.length,bar=document.getElementById('expPwdStrength');
    bar.style.width=Math.min(n*8,100)+'%';
    bar.style.background=n<8?'#e74c3c':n<14?'#f39c12':'#46962b';
  });
  document.getElementById('simSlider').addEventListener('input',updateSim);
  // Pieklijst filters
  document.getElementById('peakLimitA').addEventListener('change',function(){
    renderPeakTables(parseInt(this.value),parseInt(document.getElementById('peakLimitT').value));
  });
  document.getElementById('peakLimitT').addEventListener('change',function(){
    renderPeakTables(parseInt(document.getElementById('peakLimitA').value),parseInt(this.value));
  });
  // Upload
  initUpload();
  // Scenario's
  try{initScenarios();}catch(e){console.error('initScenarios:',e);}
  // Kaart
  try{initKaartEvents();}catch(e){console.error('initKaartEvents:',e);}
});

function renderHome(){}

// Opstarten
async function boot(){
  try{db=await openDB();}catch(e){console.error(e);notify('IndexedDB niet beschikbaar',false);return;}
  await loadMeta();
  renderAll();
}
boot();

// Globale tooltip
(function(){
  var t=document.createElement('div');t.id='globalTip';document.body.appendChild(t);
  document.addEventListener('mouseover',function(e){
    var el=e.target.closest('[data-tip]');
    t.textContent=el?el.dataset.tip:'';t.style.display=el?'block':'none';
  });
  document.addEventListener('mousemove',function(e){
    if(t.style.display!=='none'){t.style.left=(e.clientX+14)+'px';t.style.top=(e.clientY-40)+'px';}
  });
})();
