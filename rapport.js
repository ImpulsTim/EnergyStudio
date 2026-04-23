// ─── Rapport ───────────────────────────────────────────────────

function openRapportModal(){
  if(!_optim.baseKw.length){notify('Voer eerst een analyse uit',false);return;}
  var proj=ap();
  var scens=(proj&&proj.scenarios)?proj.scenarios:[];
  var html='<label class="rap-opt-lbl"><input type="checkbox" class="rap-scen-chk" data-id="basis" checked> Basis — gemeten groepsprofiel</label>';
  html+=scens.map(function(sc){
    return'<label class="rap-opt-lbl"><input type="checkbox" class="rap-scen-chk" data-id="'+sc.id+'" checked> '+sc.name+'</label>';
  }).join('');
  document.getElementById('roptScenList').innerHTML=html;
  document.getElementById('roptVergWrap').style.display=scens.length>=1?'':'none';
  showM('mRapOpts');
}

async function generateRapport(){
  var btn=document.getElementById('btnGenRap');
  btn.textContent='Bezig…';btn.disabled=true;
  try{
    var opts={
      scenIds:[].slice.call(document.querySelectorAll('.rap-scen-chk:checked')).map(function(el){return el.dataset.id;}),
      vergelijk:document.getElementById('roptVerg').checked,
      methode:document.getElementById('roptMethode').checked
    };
    if(!opts.scenIds.length){notify('Selecteer minimaal één scenario',false);return;}
    var html=await buildRapport(opts);
    var iframe=document.getElementById('rPreview');
    var doc=iframe.contentDocument||iframe.contentWindow.document;
    doc.open();doc.write(html);doc.close();
    hideM('mRapOpts');showM('mRap');
    notify('Rapport klaar');
  }catch(e){notify('Rapport mislukt: '+e.message,false);console.error(e);}
  finally{btn.textContent='Rapport genereren →';btn.disabled=false;}
}

function printPreviewRapport(){
  document.getElementById('rPreview').contentWindow.print();
}

function downloadRapportHTML(){
  var iframe=document.getElementById('rPreview');
  var html='<!DOCTYPE html>'+iframe.contentDocument.documentElement.outerHTML;
  var proj=ap();
  var fname='rapport-'+(proj?proj.name.replace(/[^a-z0-9]/gi,'-').toLowerCase():'energie-studio')+'-'+new Date().toISOString().slice(0,10)+'.html';
  triggerDownload(new Blob([html],{type:'application/octet-stream'}),fname);
}

async function buildRapport(opts){
  var proj=ap();
  if(!proj)throw new Error('Geen actief project');
  var originalId=_optim.activeScenId;

  function fmtDt(s){
    var p=s.split(/[T ]/)[0].split('-');
    return parseInt(p[2])+' '+['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'][parseInt(p[1])-1]+' '+p[0];
  }
  var datum=new Date().toLocaleDateString('nl-NL',{day:'2-digit',month:'long',year:'numeric'});
  var periode='';
  if(_optim.allTs&&_optim.allTs.length)
    periode=fmtDt(_optim.allTs[0])+' t/m '+fmtDt(_optim.allTs[_optim.allTs.length-1]);

  var css=[
    '*{box-sizing:border-box;margin:0;padding:0}',
    'body{font-family:"Barlow",Arial,sans-serif;font-size:10pt;color:#242b38;line-height:1.6;background:#fff}',
    '@page{size:A4 portrait;margin:12mm 18mm 18mm}',
    '@media print{.pb{page-break-before:always}img{max-width:100%!important;page-break-inside:avoid}.no-break{page-break-inside:avoid}}',
    '.hdr{background:#46962b;padding:11px 20px;display:flex;align-items:center;justify-content:space-between;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    '.brand{font-size:15pt;font-weight:900;color:#fff;letter-spacing:2px;text-transform:uppercase;line-height:1.1}',
    '.brand span{color:#fbba00}',
    '.brand-by{font-size:8pt;font-weight:600;color:rgba(255,255,255,.75);margin-top:2px}',
    '.hdr-dt{color:rgba(255,255,255,.85);font-size:8.5pt;text-align:right;line-height:1.5}',
    '.divider{height:4px;background:#fbba00;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    '.cover{padding:20px 20px 16px}',
    '.proj-name{font-size:22pt;font-weight:900;color:#242b38;margin-bottom:4px;line-height:1.2}',
    '.proj-sub{font-size:11pt;font-weight:700;color:#46962b;margin-bottom:6px}',
    '.proj-meta{font-size:9.5pt;color:#555;margin-bottom:18px;line-height:1.8}',
    '.sec{padding:14px 20px 12px}',
    '.pb{padding:14px 20px 12px;page-break-before:always}',
    '.rsh{background:#242b38;color:#fff;display:flex;align-items:stretch;margin:0 0 14px;page-break-after:avoid;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    '.rsh-n{background:#46962b;color:#fff;font-weight:900;font-size:11pt;min-width:36px;text-align:center;display:flex;align-items:center;justify-content:center;padding:0 6px;flex-shrink:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    '.rsh-t{font-weight:900;font-size:11pt;padding:9px 14px;display:flex;align-items:center;gap:8px;flex:1}',
    '.rsh-badge{background:rgba(255,255,255,.15);border-radius:3px;padding:2px 7px;font-size:8pt;font-weight:700}',
    'table{width:100%;border-collapse:collapse;font-size:9pt;margin-bottom:12px;page-break-inside:avoid}',
    'thead th{background:#242b38;color:#fff;padding:5px 8px;text-align:left;font-size:8pt;font-weight:700;text-transform:uppercase;letter-spacing:.5px;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    'td{padding:5px 8px;border-bottom:1px solid #e2ecdf;vertical-align:middle}',
    'tr:nth-child(even) td{background:#f7fbf5;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    'tr:last-child td{border-bottom:none}',
    '.rib{background:#edf5ea;border-left:4px solid #46962b;padding:6px 11px;font-size:9pt;color:#3a7d23;margin:0 0 10px;border-radius:0 4px 4px 0;line-height:1.5;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    '.rib2{background:#f2f8fa;border-left:4px solid #a6d6cc;padding:6px 11px;font-size:9pt;color:#2c6e70;margin:0 0 10px;border-radius:0 4px 4px 0;line-height:1.5;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    '.rchart{margin:0 0 14px;page-break-inside:avoid}',
    '.rchart h3{font-size:8.5pt;font-weight:700;color:#46962b;margin:0 0 4px;text-transform:uppercase;letter-spacing:.5px}',
    '.rchart img{width:100%;object-fit:contain;display:block}',
    '.r2col{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:0 0 14px;page-break-inside:avoid}',
    '.r2col .rchart{margin:0}',
    '.kg{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:0 0 16px;page-break-inside:avoid}',
    '.kb{border:1px solid #e2ecdf;border-radius:6px;padding:9px 11px}',
    '.kb.grn{border-color:#46962b;background:#f4fbf0;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    '.kb.red{border-color:#e2b8b4;background:#fdf5f5;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    '.kl{font-size:7.5pt;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#999;margin-bottom:3px}',
    '.kv{font-size:14pt;font-weight:900;line-height:1.1}',
    '.kv.grn{color:#46962b}.kv.red{color:#c0392b}.kv.dark{color:#242b38}',
    '.ku{font-size:8pt;color:#aaa;margin-top:2px}',
    '.vp{color:#46962b;font-weight:700}.vn{color:#c0392b;font-weight:700}',
    '.ft{margin-top:18px;padding-top:8px;border-top:1px solid #e2ecdf;font-size:8pt;color:#aaa;display:flex;justify-content:space-between}',
    '.scen-list{background:#f7fbf5;border:1px solid #e2ecdf;border-radius:6px;padding:10px 14px;margin-bottom:14px}',
    '.scen-list-item{font-size:9.5pt;padding:3px 0;border-bottom:1px solid #e8f0eb;display:flex;gap:8px}',
    '.scen-list-item:last-child{border-bottom:none}',
    '.scen-num{color:#46962b;font-weight:700;min-width:22px;flex-shrink:0}',
  ].join('');

  // Chart capture helper
  function ci(id,h){
    h=h||300;
    var src=document.getElementById(id);
    if(!src)return'';
    var chart=Chart.getChart?Chart.getChart(src):null;
    if(!chart)return'';
    var restored=[];
    var el=src.parentElement;
    while(el&&el!==document.body){
      if(getComputedStyle(el).display==='none'){restored.push({el:el,v:el.style.display});el.style.display='block';}
      el=el.parentElement;
    }
    void document.body.offsetHeight;
    var prevW=src.width,prevH=src.height,uri='';
    try{chart.resize(900,h);uri=src.toDataURL('image/png');}catch(e){}
    try{chart.resize(prevW>0?prevW:undefined,prevH>0?prevH:undefined);}catch(e){}
    restored.forEach(function(x){x.el.style.display=x.v;});
    if(!uri||uri==='data:,')return'';
    return'<img src="'+uri+'" style="width:100%;height:'+h+'px;object-fit:contain;display:block">';
  }

  function kpiCard(lbl,val,unit,cls){
    cls=cls||'';
    return'<div class="kb'+cls+'">'+
      '<div class="kl">'+lbl+'</div>'+
      '<div class="kv'+(cls?' '+cls.trim():'')+'">'+val+'</div>'+
      (unit?'<div class="ku">'+unit+'</div>':'')+
    '</div>';
  }

  function computeKpis(grpKw,gtvA,gtvT){
    var gA=grpKw.map(function(v){return Math.max(0,v);});
    var gT=grpKw.map(function(v){return Math.max(0,-v);});
    return{
      maxA:gA.length?Math.max.apply(null,gA):0,
      maxT:gT.length?Math.max.apply(null,gT):0,
      ovA:gA.filter(function(v){return v>gtvA;}).length,
      ovT:gT.filter(function(v){return v>gtvT;}).length,
      vol:(grpKw.reduce(function(s,v){return s+Math.abs(v);},0)*0.25/1000)
    };
  }

  // Global GTO savings for basis (from _piek)
  function calcGtoSavingBasis(){
    if(!_piek||!_piek.mnds||!_piek.mnds.length||_piek.avgKm==null)return null;
    var total=_piek.mnds.reduce(function(s,_,mi){
      var collP=(_piek.collPA[mi]||0)+(_piek.collPT[mi]||0);
      return s+((_piek.somInd[mi]||0)-collP)*_piek.avgKm;
    },0);
    return total/Math.max(1,_piek.mnds.length)*12;
  }

  var pageHdr='<div class="hdr">'+
    '<div><div class="brand">ENERGY <span>STUDIO</span></div><div class="brand-by">by Impuls Zeeland</div></div>'+
    '<div class="hdr-dt">'+datum+'<br><span style="font-size:7.5pt;opacity:.8">Energiegroepsprofiel analyse</span></div>'+
  '</div><div class="divider"></div>';

  // ─── Per-scenario loop ───
  var scenHtmlArr=[];
  var scenDataArr=[];

  for(var i=0;i<opts.scenIds.length;i++){
    var scenId=opts.scenIds[i];
    var isBasis=scenId==='basis';
    var res=isBasis
      ?{grpKw:_optim.baseKw.slice(),perKw:_optim.perKw,withData:_optim.withData,gtvA:_optim.gtvA,gtvT:_optim.gtvT,solar_kw:null,batProfile:null}
      :_optim.scenResults[scenId];
    if(!res||!res.grpKw||!res.grpKw.length)continue;
    var sc=isBasis?null:_findScen(scenId);
    if(!isBasis&&!sc)continue;

    var scenName=isBasis?'Basis — gemeten groepsprofiel':sc.name;

    // Herteken grafieken met scenario-data
    redrawChartsForScenario(res);
    var hasPV=!isBasis&&sc&&sc.solar&&sc.solar.enabled&&!!res.solar_kw;
    var hasBat=!isBasis&&sc&&sc.bat&&sc.bat.enabled&&!!res.batProfile;
    if(hasPV||hasBat){
      try{renderAssetAnalysis(scenId);}catch(e){console.error('renderAssetAnalysis:',e);}
    }else{
      ['cPVYear','cPVMonth','cPVWeek','cBatYear','cBatWeek','cBatSoC','cBatMonth'].forEach(function(id){dC(id);});
      var va=document.getElementById('vergAssets');if(va)va.innerHTML='';
    }

    await new Promise(function(r){setTimeout(r,160);});

    var imgs={
      jaar:ci('cJaarG',430),
      week:ci('cWeek',410),
      bdkA:ci('cBdk',370),
      bdkT:ci('cBdkT',370),
      ovsch:ci('cOvsch',370),
      piekA:ci('cPiekA',400),
      piekT:ci('cPiekT',400),
      pvYear:hasPV?ci('cPVYear',380):'',
      pvMonth:hasPV?ci('cPVMonth',300):'',
      batYear:hasBat?ci('cBatYear',380):'',
      batSoC:hasBat?ci('cBatSoC',300):''
    };

    var kpis=computeKpis(res.grpKw,res.gtvA||_optim.gtvA,res.gtvT||_optim.gtvT);
    var gtvA=res.gtvA||_optim.gtvA;var gtvT=res.gtvT||_optim.gtvT;
    var m=res.metrics||{};

    // GTO / kW besparing
    var gtoSaving=isBasis?calcGtoSavingBasis():(m.kmSaving!=null?m.kmSaving:null);

    scenDataArr.push({scenName:scenName,sc:sc,res:res,kpis:kpis,isBasis:isBasis,gtvA:gtvA,gtvT:gtvT});

    // Build badges
    var badges='';
    if(isBasis){
      badges+='<span class="rsh-badge">Basis</span>';
    }else{
      if(sc.connectionIds&&sc.connectionIds.length){
        var n=sc.connectionIds.length;var t=proj.companies.length;
        badges+='<span class="rsh-badge">👥 '+n+(t>n?'/'+t:'')+'</span>';
      }
      if(sc.solar&&sc.solar.enabled)badges+='<span class="rsh-badge">☀ '+sc.solar.kWp+' kWp</span>';
      if(sc.bat&&sc.bat.enabled)badges+='<span class="rsh-badge">⚡ '+sc.bat.cap+' kWh</span>';
    }

    // Connection names
    var cosInScen=res.withData||_optim.withData;
    var cosInfo=cosInScen.map(function(c,ci2){
      return'<tr><td><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:'+PAL[ci2%PAL.length]+';margin-right:5px;vertical-align:middle"></span>'+c.name+'</td>'+
        '<td>'+(c.ean||'—')+'</td><td>'+c.category+'</td><td>'+c.gtvA+' kW</td><td>'+c.gtvT+' kW</td></tr>';
    }).join('');

    // Configuratieinfo (PV/bat)
    var strats={peakshaving:'Peak shaving',autarkie:'Maximale autarkie',maxsolar:'Maximaal zonneverbruik'};
    var cfgRows='';
    if(!isBasis&&sc){
      if(sc.solar&&sc.solar.enabled)cfgRows+='<tr><td><strong>Zonnepanelen</strong></td><td>'+sc.solar.kWp+' kWp · tilt '+sc.solar.tilt+'° · azimut '+sc.solar.azimut+'° z.v.Z. · PR '+sc.solar.pr+'%</td></tr>';
      if(sc.bat&&sc.bat.enabled)cfgRows+='<tr><td><strong>Batterijopslag</strong></td><td>'+sc.bat.cap+' kWh / '+sc.bat.pMax+' kW · '+(strats[sc.bat.strategy]||sc.bat.strategy)+' · SoC '+sc.bat.socMin+'–'+sc.bat.socMax+'%</td></tr>';
    }

    // KPI grid (2×3)
    var kpiGrid='<div class="kg">'+
      kpiCard('Piekafname',kpis.maxA.toFixed(0)+' kW','GTV: '+gtvA+' kW',kpis.maxA>gtvA?' red':' dark')+
      kpiCard('Piek teruglevering',kpis.maxT.toFixed(0)+' kW','GTV-T: '+gtvT+' kW',kpis.maxT>gtvT?' red':' dark')+
      kpiCard('GTV-A overschrijdingen',kpis.ovA,'kwartierwaarden',kpis.ovA>0?' red':' grn')+
      kpiCard('GTV-T overschrijdingen',kpis.ovT,'kwartierwaarden',kpis.ovT>0?' red':' grn')+
      kpiCard('Totaal volume',kpis.vol.toFixed(1)+' MWh','gecombineerd',' dark')+
      (gtoSaving!=null
        ?kpiCard(isBasis?'GTO besparing':'kW-max besparing vs. basis','€ '+fmt(Math.round(gtoSaving)),'per jaar (geëxtrapoleerd)',' grn')
        :kpiCard('kW-max besparing','—','',''))+
    '</div>';

    // GTO tabel voor basis
    var gtoTbl='';
    if(isBasis){
      var gtoBody=document.getElementById('gtoBody');
      var gtoRows=[];
      if(gtoBody)[].slice.call(gtoBody.querySelectorAll('tr')).forEach(function(tr){
        var cells=[].slice.call(tr.querySelectorAll('td')).map(function(td){return td.textContent.trim();});
        if(cells.length>1)gtoRows.push(cells);
      });
      if(gtoRows.length){
        gtoTbl='<div class="rib" style="margin-top:4px">Bij een GTO worden kW-max kosten berekend over de collectieve piek. Diversiteitswinst = som individuele pieken − collectieve piek.</div>'+
          '<table><thead><tr><th>Maand</th><th>Som ind. pieken (kW)</th><th>Coll. piek (kW)</th><th>Diversiteitswinst</th><th>Besparing (€)</th></tr></thead><tbody>'+
          gtoRows.map(function(r){return'<tr>'+r.map(function(v){return'<td>'+v+'</td>';}).join('')+'</tr>';}).join('')+'</tbody></table>';
      }
    }

    var html='<div class="'+(i===0?'sec':'pb')+'">' +
      pageHdr+
      '<div class="rsh"><div class="rsh-n">'+(i+1)+'</div><div class="rsh-t">'+scenName+' '+badges+'</div></div>'+
      // Aansluitingen-tabel
      '<table><thead><tr><th>Aansluiting</th><th>EAN</th><th>Categorie</th><th>GTV afname</th><th>GTV teruglevering</th></tr></thead><tbody>'+cosInfo+'</tbody></table>'+
      // Configuratie (PV/bat)
      (cfgRows?'<table style="margin-bottom:12px"><thead><tr><th>Component</th><th>Configuratie</th></tr></thead><tbody>'+cfgRows+'</tbody></table>':'')+
      // KPI grid
      kpiGrid+
      // Grafieken
      (imgs.jaar?'<div class="rchart"><h3>Jaarprofiel (kW, 15-minuutwaarden)</h3>'+imgs.jaar+'</div>':'')+
      (imgs.week?'<div class="rchart"><h3>Gemiddeld weekprofiel</h3>'+imgs.week+'</div>':'')+
      ((imgs.bdkA||imgs.bdkT)?'<div class="r2col">'+
        (imgs.bdkA?'<div class="rchart"><h3>Belastingduurkromme — afname</h3>'+imgs.bdkA+'</div>':'')+
        (imgs.bdkT?'<div class="rchart"><h3>Belastingduurkromme — teruglevering</h3>'+imgs.bdkT+'</div>':'')+
      '</div>':'')+
      (imgs.ovsch?'<div class="rchart"><h3>GTV-overschrijdingen per maand</h3>'+imgs.ovsch+'</div>':'')+
      ((imgs.piekA||imgs.piekT)?'<div class="r2col">'+
        (imgs.piekA?'<div class="rchart"><h3>Piekanalyse — afname</h3>'+imgs.piekA+'</div>':'')+
        (imgs.piekT?'<div class="rchart"><h3>Piekanalyse — teruglevering</h3>'+imgs.piekT+'</div>':'')+
      '</div>':'')+
      gtoTbl+
      ((imgs.pvYear||imgs.pvMonth)?'<div class="rib2">Zonnepanelen — opwek gecombineerd met groepsprofiel.</div>'+
        '<div class="r2col">'+
          (imgs.pvYear?'<div class="rchart"><h3>PV-opbrengst jaarprofiel</h3>'+imgs.pvYear+'</div>':'')+
          (imgs.pvMonth?'<div class="rchart"><h3>Maandelijkse opbrengst (kWh)</h3>'+imgs.pvMonth+'</div>':'')+
        '</div>':'')+
      ((imgs.batYear||imgs.batSoC)?'<div class="rib2">Batterijopslag — gedrag en laadstatus gedurende het jaar.</div>'+
        '<div class="r2col">'+
          (imgs.batYear?'<div class="rchart"><h3>Batterij — jaargedrag (kW)</h3>'+imgs.batYear+'</div>':'')+
          (imgs.batSoC?'<div class="rchart"><h3>Laadstatus (SoC %)</h3>'+imgs.batSoC+'</div>':'')+
        '</div>':'')+
      '<div class="ft"><span>Energy Studio — Impuls Zeeland · Energiegroepsprofiel</span><span>'+datum+'</span></div>'+
    '</div>';

    scenHtmlArr.push(html);
  }

  // ─── Herstel originele scenario ───
  try{
    var origRes=originalId==='basis'
      ?{grpKw:_optim.baseKw,perKw:_optim.perKw,withData:_optim.withData,gtvA:_optim.gtvA,gtvT:_optim.gtvT}
      :_optim.scenResults[originalId];
    if(origRes&&origRes.grpKw)redrawChartsForScenario(origRes);
  }catch(e){}

  // ─── Vergelijking ───
  var vergHtml='';
  if(opts.vergelijk&&scenDataArr.length>=2){
    try{renderComparison();}catch(e){}
    await new Promise(function(r){setTimeout(r,120);});
    var vergPiekImg=ci('cVergPiek',380);

    var vHdrs='<th>Meetpunt</th>'+scenDataArr.map(function(d){return'<th>'+d.scenName+'</th>';}).join('');
    function vRow(lbl,fn){
      return'<tr><td style="font-weight:600;font-size:8.5pt;color:#555">'+lbl+'</td>'+scenDataArr.map(fn).join('')+'</tr>';
    }
    var totalCosN=proj.companies.length;
    var vBody=
      vRow('Aansluitingen',function(d){var n=d.res.withData?d.res.withData.length:totalCosN;return'<td>'+n+(totalCosN>n?'/'+totalCosN:'')+'</td>';})+
      vRow('GTV afname / terlev. (kW)',function(d){return'<td>'+(d.gtvA||'—')+' / '+(d.gtvT||'—')+'</td>';})+
      vRow('Piekafname (kW)',function(d){
        var v=d.kpis.maxA;
        var base=scenDataArr[0].kpis.maxA;
        if(d===scenDataArr[0])return'<td>'+v.toFixed(1)+'</td>';
        var diff=base-v;return'<td>'+v.toFixed(1)+' <span class="'+(diff>0?'vp':'vn')+'">'+(diff>=0?'−':'+')+Math.abs(diff).toFixed(1)+'</span></td>';
      })+
      vRow('Piek teruglevering (kW)',function(d){return'<td>'+d.kpis.maxT.toFixed(1)+'</td>';})+
      vRow('GTV-A overschrijdingen',function(d){return'<td class="'+(d.kpis.ovA>0?'vn':'')+'">'+d.kpis.ovA+'</td>';})+
      vRow('GTV-T overschrijdingen',function(d){return'<td class="'+(d.kpis.ovT>0?'vn':'')+'">'+d.kpis.ovT+'</td>';})+
      vRow('Totaal volume (MWh)',function(d){return'<td>'+d.kpis.vol.toFixed(1)+'</td>';})+
      vRow('Autarkie (%)',function(d){var m=d.res.metrics||{};return'<td>'+(m.autarkie!=null?Math.round(m.autarkie)+'%':'—')+'</td>';})+
      vRow('PV-opbrengst (MWh/jr)',function(d){var m=d.res.metrics||{};return'<td>'+(m.pvTotal!=null?(m.pvTotal/1000).toFixed(1):'—')+'</td>';})+
      vRow('kW-max besparing vs. basis (€/jr)',function(d){
        if(d.isBasis)return'<td>—</td>';
        var m=d.res.metrics||{};return'<td>'+(m.kmSaving!=null?'<span class="vp">€ '+fmt(Math.round(m.kmSaving))+'</span>':'—')+'</td>';
      });

    vergHtml='<div class="pb">'+
      pageHdr+
      '<div class="rsh"><div class="rsh-n">⇄</div><div class="rsh-t">Vergelijking scenario\'s</div></div>'+
      '<div class="rib2">Overzicht van alle scenario\'s naast elkaar. Groene waarden = verbetering t.o.v. basis.</div>'+
      '<table><thead><tr>'+vHdrs+'</tr></thead><tbody>'+vBody+'</tbody></table>'+
      (vergPiekImg?'<div class="rchart"><h3>Maandelijkse piekafname per scenario (kW)</h3>'+vergPiekImg+'</div>':'')+
      '<div class="ft"><span>Energy Studio — Impuls Zeeland · Energiegroepsprofiel</span><span>'+datum+'</span></div>'+
    '</div>';
  }

  // ─── Methodologie ───
  var methHtml='';
  if(opts.methode){
    methHtml='<div class="pb">'+
      pageHdr+
      '<div class="rsh"><div class="rsh-n">?</div><div class="rsh-t">Methodologie</div></div>'+
      '<table><thead><tr><th>Onderwerp</th><th>Toelichting</th></tr></thead><tbody>'+
      '<tr><td><strong>Eenheid</strong></td><td>kWh/kwartier × 4 = kW gemiddeld vermogen per 15-minuut interval</td></tr>'+
      '<tr><td><strong>Groepsprofiel</strong></td><td>Berekend op overlappende kwartierwaarden aanwezig bij alle aansluitingen in het scenario</td></tr>'+
      '<tr><td><strong>kW-max tarief</strong></td><td>Maandpiek afname + maandpiek teruglevering per aansluiting × Stedin kW-max tarief 2026</td></tr>'+
      '<tr><td><strong>GTO-besparing (basis)</strong></td><td>Verschil som individuele kW-max kosten en collectieve kW-max kosten over de meetperiode</td></tr>'+
      '<tr><td><strong>kW-max besparing (scenario)</strong></td><td>Verschil tussen individuele kW-max kosten van het basis-scenario en de kW-max kosten van het scenario</td></tr>'+
      '<tr><td><strong>Zonnepanelen (PV)</strong></td><td>Astronomisch model — declinatie, uurhoek, zenithoek, invalshoek op paneel (φ=51.5°N, Zeeland). Maandfactoren o.b.v. KNMI bewolkingsdata.</td></tr>'+
      '<tr><td><strong>Batterij — Peak shaving</strong></td><td>Binaire zoekstap per maand naar minimale haalbare maandpiek met perfecte voorkennis (theoretisch maximum).</td></tr>'+
      '<tr><td><strong>Batterij — Maximale autarkie</strong></td><td>Greedy forward-pass simulatie: laden bij netto-export, ontladen bij netto-import.</td></tr>'+
      '<tr><td><strong>Batterij — Maximaal zonneverbruik</strong></td><td>Laden uitsluitend uit PV-surplus, ontladen bij netto-import van het net.</td></tr>'+
      '</tbody></table>'+
      '<div class="ft"><span>Energy Studio — Impuls Zeeland · Energiegroepsprofiel</span><span>'+datum+'</span></div>'+
    '</div>';
  }

  // ─── Cover / inleiding ───
  var scenListHtml=scenDataArr.map(function(d,idx){
    return'<div class="scen-list-item"><span class="scen-num">'+(idx+1)+'.</span><span>'+d.scenName+'</span></div>';
  }).join('');

  var allCosRows=proj.companies.map(function(c,ci2){
    return'<tr><td><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:'+PAL[ci2%PAL.length]+';margin-right:5px;vertical-align:middle"></span>'+c.name+'</td>'+
      '<td>'+(c.ean||'—')+'</td><td>'+c.category+'</td><td>'+c.gtvA+' kW</td><td>'+c.gtvT+' kW</td>'+
      '<td>'+(SA&&SA[c.stedinA||'none']?(SA[c.stedinA||'none']||SA.none).l:'—')+'</td>'+
      '<td>'+(ST&&ST[c.stedinT||'none']?(ST[c.stedinT||'none']||ST.none).l:'—')+'</td></tr>';
  }).join('');

  var coverHtml='<div class="sec">'+
    pageHdr+
    '<div class="cover">'+
      '<div class="proj-name">'+proj.name+'</div>'+
      '<div class="proj-sub">Analyse Energiegroepsprofiel</div>'+
      '<div class="proj-meta">'+
        (periode?'Meetperiode: <strong>'+periode+'</strong><br>':'')+
        'Aansluitingen: <strong>'+proj.companies.length+'</strong> &nbsp;·&nbsp; '+
        'Opgesteld door: <strong>Impuls Zeeland — Energy Studio</strong>'+
        (proj.desc?'<br><span style="color:#888">'+proj.desc+'</span>':'')+
      '</div>'+
      '<div style="font-size:9pt;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:#46962b;margin-bottom:6px">Dit rapport bevat analyses voor '+scenDataArr.length+' scenario'+(scenDataArr.length!==1?'s':'')+'</div>'+
      '<div class="scen-list">'+scenListHtml+'</div>'+
    '</div>'+
    '<div class="rsh" style="margin:0 0 12px"><div class="rsh-n">◉</div><div class="rsh-t">Aansluitingen in dit project</div></div>'+
    '<table><thead><tr><th>Naam</th><th>EAN</th><th>Categorie</th><th>GTV afname</th><th>GTV teruglevering</th><th>Aansl.cat.</th><th>Transportcat.</th></tr></thead><tbody>'+allCosRows+'</tbody></table>'+
    '<div class="ft"><span>Energy Studio — Impuls Zeeland · Energiegroepsprofiel</span><span>'+datum+'</span></div>'+
  '</div>';

  return'<!DOCTYPE html><html lang="nl"><head><meta charset="UTF-8">'+
    '<link rel="preconnect" href="https://fonts.googleapis.com">'+
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;600;700;900&display=swap">'+
    '<title>Rapport — '+proj.name+' — Energy Studio</title>'+
    '<style>'+css+'</style>'+
    '</head><body>'+coverHtml+scenHtmlArr.join('')+vergHtml+methHtml+'</body></html>';
}
