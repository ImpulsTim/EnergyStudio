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

function _rapMethod(){
  var el=document.querySelector('input[name="rapMethod"]:checked');
  return el?el.value:'download';
}

function _rapFilenameBase(){
  var proj=ap();
  var safe=(proj&&proj.name?proj.name:'energie-studio').replace(/[^a-z0-9]/gi,'-').toLowerCase();
  return'rapport-'+safe+'-'+new Date().toISOString().slice(0,10);
}

function downloadRapportHTML(){
  var iframe=document.getElementById('rPreview');
  var html='<!DOCTYPE html>'+iframe.contentDocument.documentElement.outerHTML;
  var fname=_rapFilenameBase()+'.html';
  var blob=new Blob([html],{type:'text/html'});
  if(_rapMethod()==='link')triggerDownloadAsLink(blob,fname);
  else triggerDownload(blob,fname);
}

async function downloadRapportPDF(){
  var btn=document.getElementById('btnDownloadPdf');
  var orig=btn.textContent;
  btn.disabled=true;btn.textContent='PDF maken…';
  try{
    if(typeof html2pdf==='undefined')throw new Error('html2pdf bibliotheek niet geladen');
    var iframe=document.getElementById('rPreview');
    var element=iframe.contentDocument.body;
    var fname=_rapFilenameBase()+'.pdf';
    var opt={
      margin:[10,10,10,10],
      filename:fname,
      image:{type:'jpeg',quality:0.95},
      html2canvas:{scale:2,useCORS:true,backgroundColor:'#ffffff',windowWidth:element.scrollWidth},
      jsPDF:{unit:'mm',format:'a4',orientation:'portrait',compress:true},
      pagebreak:{mode:['css','legacy'],before:'.pb',avoid:['.no-break','.rchart','.kg','table','.rsh']}
    };
    var blob=await html2pdf().set(opt).from(element).outputPdf('blob');
    if(_rapMethod()==='link')triggerDownloadAsLink(blob,fname);
    else triggerDownload(blob,fname);
    notify('PDF gedownload');
  }catch(e){notify('PDF mislukt: '+e.message,false);console.error(e);}
  finally{btn.disabled=false;btn.textContent=orig;}
}

// ─── Hulpfuncties opmaak ─────────────────────────────────────────
function _fmtN(v,d){
  if(v==null||isNaN(v))return'—';
  d=d==null?1:d;
  return Number(v).toLocaleString('nl-NL',{minimumFractionDigits:d,maximumFractionDigits:d});
}
function _fmtI(v){
  if(v==null||isNaN(v))return'—';
  return Math.round(v).toLocaleString('nl-NL');
}
function _fmtE(v){
  if(v==null||isNaN(v))return'—';
  return'€ '+Math.round(v).toLocaleString('nl-NL');
}
function _fmtDate(s){
  if(!s)return'';
  var p=String(s).split(/[T ]/)[0].split('-');
  if(p.length<3)return s;
  return parseInt(p[2],10)+' '+['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december'][parseInt(p[1],10)-1]+' '+p[0];
}

async function buildRapport(opts){
  var proj=ap();
  if(!proj)throw new Error('Geen actief project');
  var originalId=_optim.activeScenId;

  var datum=new Date().toLocaleDateString('nl-NL',{day:'numeric',month:'long',year:'numeric'});
  var periode='';
  if(_optim.allTs&&_optim.allTs.length)
    periode=_fmtDate(_optim.allTs[0])+' t/m '+_fmtDate(_optim.allTs[_optim.allTs.length-1]);
  var nrAansl=proj.companies.length;

  // ─── CSS ─────────────────────────────────────────────────────
  var css=[
    '*{box-sizing:border-box;margin:0;padding:0}',
    'html,body{background:#fff}',
    'body{font-family:"Barlow",Arial,sans-serif;font-size:10pt;color:#242b38;line-height:1.55;font-variant-numeric:tabular-nums}',
    '@page{size:A4 portrait;margin:10mm}',
    '@media print{.pb{page-break-before:always}.no-break,.kg,.rchart,table,.rsh,.kpi-row{page-break-inside:avoid}img{max-width:100%!important}}',
    'a{color:#46962b;text-decoration:none}',
    // Page wrappers (each .page is an A4 unit)
    '.page{padding:8mm 6mm 6mm;min-height:280mm;position:relative}',
    '.page.pb{page-break-before:always}',
    // Top header bar (used on content pages, not on cover/end)
    '.hdr{background:#46962b;padding:9px 16px;display:flex;align-items:center;justify-content:space-between;-webkit-print-color-adjust:exact;print-color-adjust:exact;margin:-8mm -6mm 12px}',
    '.brand{font-size:13pt;font-weight:900;color:#fff;letter-spacing:1.5px;text-transform:uppercase;line-height:1.1}',
    '.brand span{color:#fbba00}',
    '.brand-by{font-size:7.5pt;font-weight:600;color:rgba(255,255,255,.78);margin-top:1px}',
    '.hdr-dt{color:rgba(255,255,255,.88);font-size:8pt;text-align:right;line-height:1.4}',
    '.divider{height:3px;background:#fbba00;-webkit-print-color-adjust:exact;print-color-adjust:exact;margin:-12px -6mm 14px}',
    // Section header
    '.rsh{display:flex;align-items:stretch;margin:0 0 10px;page-break-after:avoid;border-radius:3px;overflow:hidden;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    '.rsh-n{background:#46962b;color:#fff;font-weight:900;font-size:13pt;min-width:38px;text-align:center;display:flex;align-items:center;justify-content:center;padding:0 10px;flex-shrink:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    '.rsh-t{background:#242b38;color:#fff;font-weight:900;font-size:11.5pt;padding:8px 14px;display:flex;align-items:center;gap:8px;flex:1;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    '.rsh-badge{background:rgba(255,255,255,.18);border-radius:3px;padding:2px 7px;font-size:8pt;font-weight:700}',
    // Sub-section header (within a scenario)
    '.rsub{font-size:11pt;font-weight:700;color:#242b38;margin:16px 0 4px;padding-bottom:3px;border-bottom:2px solid #46962b;display:inline-block;page-break-after:avoid}',
    '.rsub-num{color:#46962b;font-weight:900;margin-right:6px}',
    '.rintro{font-size:9.5pt;color:#555;margin:0 0 10px;line-height:1.5}',
    // Tables
    'table{width:100%;border-collapse:collapse;font-size:9pt;margin-bottom:12px}',
    'thead th{background:#242b38;color:#fff;padding:5px 8px;text-align:left;font-size:8pt;font-weight:700;text-transform:uppercase;letter-spacing:.5px;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    'thead th.num{text-align:right}',
    'td{padding:5px 8px;border-bottom:1px solid #e2ecdf;vertical-align:middle}',
    'td.num{text-align:right;font-variant-numeric:tabular-nums}',
    'tr:nth-child(even) td{background:#f7fbf5;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    'tr:last-child td{border-bottom:none}',
    // Info bands
    '.rib{background:#edf5ea;border-left:3px solid #46962b;padding:6px 10px;font-size:9pt;color:#3a7d23;margin:0 0 10px;border-radius:0 3px 3px 0;line-height:1.45;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    '.rib2{background:#f2f8fa;border-left:3px solid #a6d6cc;padding:6px 10px;font-size:9pt;color:#2c6e70;margin:0 0 10px;border-radius:0 3px 3px 0;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    '.rib-warn{background:#fdf3e8;border-left:3px solid #e67e22;padding:6px 10px;font-size:9pt;color:#a85a13;margin:0 0 10px;border-radius:0 3px 3px 0;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    // Charts
    '.rchart{margin:0 0 12px}',
    '.rchart h3{font-size:8.5pt;font-weight:700;color:#46962b;margin:0 0 4px;text-transform:uppercase;letter-spacing:.5px}',
    '.rchart img{max-width:100%;height:auto;display:block;margin:0 auto}',
    '.r2col{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:0 0 12px}',
    '.r2col .rchart{margin:0}',
    // KPI cards
    '.kg{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin:0 0 14px}',
    '.kg.k4{grid-template-columns:repeat(4,1fr)}',
    '.kg.k2{grid-template-columns:repeat(2,1fr)}',
    '.kb{border:1px solid #e2ecdf;border-radius:5px;padding:8px 10px;background:#fff}',
    '.kb.grn{border-color:#46962b;background:#f4fbf0;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    '.kb.red{border-color:#e2b8b4;background:#fdf5f5;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    '.kb.acc{border-color:#fbba00;background:#fffbeb;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    '.kl{font-size:7.5pt;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#888;margin-bottom:3px}',
    '.kv{font-size:14pt;font-weight:900;line-height:1.05;color:#242b38}',
    '.kv.grn{color:#46962b}.kv.red{color:#c0392b}.kv.dark{color:#242b38}.kv.acc{color:#a87f00}',
    '.ku{font-size:7.5pt;color:#aaa;margin-top:2px}',
    // Big KPI cards (executive summary)
    '.kbig{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin:0 0 14px}',
    '.kbb{border:1.5px solid #46962b;border-radius:6px;padding:14px 14px;background:linear-gradient(135deg,#f4fbf0 0%,#eaf5e2 100%);-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    '.kbb .kl{font-size:8pt;color:#3a7d23}',
    '.kbb .kv{font-size:22pt;color:#46962b;line-height:1}',
    '.kbb .ku{font-size:8.5pt;color:#5e8e4a;margin-top:4px}',
    // Comparison cells
    '.vp{color:#46962b;font-weight:700}',
    '.vn{color:#c0392b;font-weight:700}',
    // Footer (page-internal)
    '.ft{margin-top:14px;padding-top:6px;border-top:1px solid #e2ecdf;font-size:7.5pt;color:#bbb;display:flex;justify-content:space-between}',
    // Findings
    '.fnd{background:#f7fbf5;border:1px solid #d8e9d2;border-radius:6px;padding:10px 14px;margin-bottom:10px;page-break-inside:avoid;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    '.fnd-h{font-size:9.5pt;font-weight:900;color:#46962b;margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px}',
    '.fnd ul{margin:0;padding-left:18px}',
    '.fnd li{font-size:9.5pt;line-height:1.55;margin-bottom:3px}',
    '.fnd li strong{color:#242b38}',
    // ─── Cover ──────────────────────────────────────────────
    '.cover{padding:0;display:flex;flex-direction:column;min-height:285mm;position:relative}',
    '.cover-band{background:#46962b;height:18mm;display:flex;align-items:center;padding:0 14mm;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    '.cover-band-yel{background:#fbba00;height:4mm;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    '.cover-logo{height:11mm;margin-right:auto;display:flex;align-items:center;gap:10px}',
    '.cover-logo img{height:11mm;display:block;background:#fff;padding:4px 8px;border-radius:4px}',
    '.cover-logo-fb{font-size:13pt;font-weight:900;color:#fff;letter-spacing:2px;text-transform:uppercase}',
    '.cover-logo-fb span{color:#fbba00}',
    '.cover-body{flex:1;padding:24mm 14mm 14mm;display:flex;flex-direction:column;justify-content:flex-start}',
    '.cover-eyebrow{font-size:10pt;font-weight:700;color:#46962b;text-transform:uppercase;letter-spacing:2.5px;margin-bottom:8mm}',
    '.cover-title{font-size:32pt;font-weight:900;color:#242b38;line-height:1.05;margin-bottom:5mm;letter-spacing:-.5px}',
    '.cover-sub{font-size:14pt;font-weight:700;color:#46962b;margin-bottom:10mm}',
    '.cover-desc{font-size:10pt;color:#555;margin-bottom:10mm;line-height:1.6;max-width:140mm}',
    '.cover-info{background:#f7fbf5;border-left:4px solid #46962b;padding:10px 14px;margin-bottom:10mm;font-size:9.5pt;line-height:1.85;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    '.cover-info b{color:#242b38}',
    '.cover-cmp{margin-top:auto}',
    '.cover-cmp h4{font-size:8.5pt;font-weight:700;color:#46962b;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:5px}',
    '.cover-cmp table{margin:0;font-size:8.5pt}',
    '.cover-cmp th{padding:4px 8px;font-size:7pt}',
    '.cover-cmp td{padding:4px 8px}',
    '.cover-foot{background:#242b38;color:#fff;padding:6mm 14mm;display:flex;justify-content:space-between;align-items:center;font-size:9pt;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    '.cover-foot .fr{color:#fbba00;font-weight:700}',
    // ─── Inhoudsopgave ───────────────────────────────────────
    '.toc{margin:8mm 0}',
    '.toc-row{display:flex;align-items:baseline;font-size:11pt;padding:5px 0;border-bottom:1px dotted #cdd9c6}',
    '.toc-row:last-child{border-bottom:none}',
    '.toc-num{font-weight:900;color:#46962b;min-width:14mm}',
    '.toc-title{flex:1;color:#242b38}',
    '.toc-row.sub{font-size:10pt;padding-left:14mm;color:#555}',
    '.toc-row.sub .toc-num{color:#888;min-width:10mm}',
    // ─── Eindpagina ──────────────────────────────────────────
    '.endp{padding:0;display:flex;flex-direction:column;min-height:285mm;background:#fff;position:relative}',
    '.endp-hero{background:linear-gradient(135deg,#46962b 0%,#3a7d23 100%);color:#fff;padding:30mm 14mm 22mm;display:flex;flex-direction:column;align-items:center;text-align:center;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    '.endp-hero img{height:18mm;background:#fff;padding:8px 14px;border-radius:6px;margin-bottom:8mm}',
    '.endp-hero-tag{font-size:18pt;font-weight:900;letter-spacing:.5px;margin-bottom:4mm}',
    '.endp-hero-sub{font-size:11pt;color:rgba(255,255,255,.85);max-width:130mm;line-height:1.55}',
    '.endp-body{padding:14mm 14mm 10mm;flex:1}',
    '.endp-h{font-size:12pt;font-weight:900;color:#46962b;margin:0 0 5mm;text-transform:uppercase;letter-spacing:1.5px}',
    '.endp-grid{display:grid;grid-template-columns:1fr 1fr;gap:10mm;margin-bottom:12mm}',
    '.endp-block p{font-size:9.5pt;line-height:1.6;color:#444;margin-bottom:3mm}',
    '.endp-contact{background:#f7fbf5;border:1px solid #d8e9d2;border-radius:6px;padding:5mm 6mm;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    '.endp-contact .row{display:flex;align-items:center;gap:8px;margin-bottom:2mm;font-size:9.5pt}',
    '.endp-contact .lbl{color:#888;min-width:20mm;font-size:8.5pt;text-transform:uppercase;letter-spacing:.5px;font-weight:700}',
    '.endp-disc{font-size:8pt;color:#888;line-height:1.55;border-top:1px solid #eaeaea;padding-top:5mm;margin-top:auto}',
    '.endp-foot{background:#242b38;color:#aaa;padding:5mm 14mm;text-align:center;font-size:8pt;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    '.endp-foot strong{color:#fbba00}'
  ].join('');

  // ─── Chart capture (scherp + correcte breedte) ─────────────
  function ci(id,h,full){
    var displayW=full!==false?720:340;
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
    var origDpr=chart.options.devicePixelRatio;
    try{
      chart.options.devicePixelRatio=2;
      chart.resize(displayW,h);
      uri=src.toDataURL('image/png');
    }catch(e){console.error('ci '+id+':',e);}
    try{
      chart.options.devicePixelRatio=origDpr;
      chart.resize(prevW>0?prevW:undefined,prevH>0?prevH:undefined);
    }catch(e){}
    restored.forEach(function(x){x.el.style.display=x.v;});
    if(!uri||uri==='data:,')return'';
    return'<img src="'+uri+'" style="width:'+displayW+'px;max-width:100%;height:auto;display:block">';
  }

  function kpiCard(lbl,val,unit,cls){
    cls=cls||'';
    return'<div class="kb '+cls.trim()+'">'+
      '<div class="kl">'+lbl+'</div>'+
      '<div class="kv '+cls.trim()+'">'+val+'</div>'+
      (unit?'<div class="ku">'+unit+'</div>':'')+
    '</div>';
  }
  function kpiCardBig(lbl,val,unit){
    return'<div class="kbb">'+
      '<div class="kl">'+lbl+'</div>'+
      '<div class="kv">'+val+'</div>'+
      (unit?'<div class="ku">'+unit+'</div>':'')+
    '</div>';
  }

  function computeKpis(grpKw,gtvA,gtvT){
    var gA=grpKw.map(function(v){return Math.max(0,v);});
    var gT=grpKw.map(function(v){return Math.max(0,-v);});
    var sumA=gA.reduce(function(s,v){return s+v;},0);
    var sumT=gT.reduce(function(s,v){return s+v;},0);
    return{
      maxA:gA.length?Math.max.apply(null,gA):0,
      maxT:gT.length?Math.max.apply(null,gT):0,
      ovA:gA.filter(function(v){return v>gtvA;}).length,
      ovT:gT.filter(function(v){return v>gtvT;}).length,
      vol:(grpKw.reduce(function(s,v){return s+Math.abs(v);},0)*0.25/1000),
      volA:sumA*0.25/1000,
      volT:sumT*0.25/1000
    };
  }

  function calcGtoSavingBasis(){
    if(!_piek||!_piek.mnds||!_piek.mnds.length||_piek.avgKm==null)return null;
    var total=_piek.mnds.reduce(function(s,_,mi){
      var collP=(_piek.collPA[mi]||0)+(_piek.collPT[mi]||0);
      return s+((_piek.somInd[mi]||0)-collP)*_piek.avgKm;
    },0);
    return total/Math.max(1,_piek.mnds.length)*12;
  }
  function calcDiversityPct(){
    if(!_piek||!_piek.mnds||!_piek.mnds.length)return null;
    var sumInd=0,sumColl=0;
    _piek.mnds.forEach(function(_,mi){
      sumInd+=(_piek.somInd[mi]||0);
      sumColl+=(_piek.collPA[mi]||0)+(_piek.collPT[mi]||0);
    });
    if(!sumInd)return null;
    return(sumInd-sumColl)/sumInd*100;
  }

  // ─── Bevindingen-generator ──────────────────────────────────
  function genFindings(scenDataArr){
    var basis=scenDataArr[0];
    if(!basis)return[];
    var out=[];
    var k=basis.kpis;
    var gtvA=basis.gtvA,gtvT=basis.gtvT;
    var divPct=calcDiversityPct();
    var gtoY=calcGtoSavingBasis();

    // GTV overschrijdingen
    if(k.ovA>0){
      var sev=k.ovA>200?'frequent':k.ovA>50?'regelmatig':'incidenteel';
      out.push('Het collectieve afnameprofiel overschrijdt <strong>'+k.ovA+'×</strong> de GTV-A van '+gtvA+' kW (<em>'+sev+'</em>). Maximale piek: <strong>'+_fmtN(k.maxA,0)+' kW</strong> ('+_fmtN((k.maxA-gtvA)/gtvA*100,0)+'% boven contract).');
    }else{
      out.push('Geen GTV-overschrijdingen op afname — piek <strong>'+_fmtN(k.maxA,0)+' kW</strong> blijft onder contract ('+gtvA+' kW).');
    }
    if(k.ovT>0){
      out.push('Teruglevering overschrijdt <strong>'+k.ovT+'×</strong> de GTV-T van '+gtvT+' kW; piek <strong>'+_fmtN(k.maxT,0)+' kW</strong>.');
    }
    // Diversity / GTO
    if(divPct!=null&&divPct>15){
      out.push('Diversiteitswinst van <strong>'+_fmtN(divPct,0)+'%</strong> tussen som individuele pieken en collectieve piek. '+
        (gtoY!=null?'Door collectief contract (GTO) is een besparing van <strong>'+_fmtE(gtoY)+' per jaar</strong> haalbaar op kW-max kosten.':''));
    }else if(divPct!=null){
      out.push('Beperkte diversiteit ('+_fmtN(divPct,0)+'%): pieken vallen samen. GTO levert hier minder besparing dan bij heterogene profielen.');
    }
    // Volume
    out.push('Totaal verbruikt volume in de meetperiode: <strong>'+_fmtN(k.volA,1)+' MWh</strong> afname'+(k.volT>0?' en <strong>'+_fmtN(k.volT,1)+' MWh</strong> teruglevering':'')+'.');

    // Scenario-specifieke aanbevelingen
    for(var i=1;i<scenDataArr.length;i++){
      var sc=scenDataArr[i];
      var m=sc.res.metrics||{};
      var redA=basis.kpis.maxA-sc.kpis.maxA;
      var redOv=basis.kpis.ovA-sc.kpis.ovA;
      var part='Scenario <strong>'+sc.scenName+'</strong>';
      var bits=[];
      if(redA>0)bits.push('reduceert de afnamepiek met '+_fmtN(redA,0)+' kW (-'+_fmtN(redA/Math.max(1,basis.kpis.maxA)*100,0)+'%)');
      if(redOv>0)bits.push('elimineert '+redOv+' GTV-overschrijdingen');
      if(m.kmSaving!=null&&m.kmSaving>0)bits.push('bespaart '+_fmtE(m.kmSaving)+'/jaar aan kW-max kosten');
      if(m.autarkie!=null&&m.autarkie>20)bits.push('verhoogt de autarkie tot '+_fmtN(m.autarkie,0)+'%');
      if(m.pvTotal!=null&&m.pvTotal>0)bits.push('voegt '+_fmtN(m.pvTotal/1000,1)+' MWh/jr eigen opwek toe');
      if(bits.length){
        out.push(part+' '+bits.join(', ')+'.');
      }
    }
    return out;
  }

  // ─── Page header (gebruikt op contentpagina's) ─────────────
  var pageHdr='<div class="hdr">'+
    '<div><div class="brand">ENERGY <span>STUDIO</span></div><div class="brand-by">by Impuls Zeeland</div></div>'+
    '<div class="hdr-dt">'+datum+'<br><span style="font-size:7pt;opacity:.85">'+(proj.name||'')+'</span></div>'+
    '</div><div class="divider"></div>';

  function pageFooter(){
    return'<div class="ft"><span>Energy Studio · Impuls Zeeland — Energiegroepsprofiel</span><span>'+datum+'</span></div>';
  }

  // ─── Per-scenario data verzamelen ──────────────────────────
  var scenDataArr=[];
  var imgsByScen=[];

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

    redrawChartsForScenario(res);
    var hasPV=!isBasis&&sc&&sc.solar&&sc.solar.enabled&&!!res.solar_kw;
    var hasBat=!isBasis&&sc&&sc.bat&&sc.bat.enabled&&!!res.batProfile;
    if(hasPV||hasBat){
      try{renderAssetAnalysis(scenId);}catch(e){console.error('renderAssetAnalysis:',e);}
    }else{
      ['cPVYear','cPVMonth','cPVWeek','cBatYear','cBatWeek','cBatSoC','cBatMonth'].forEach(function(id){dC(id);});
    }
    await new Promise(function(r){setTimeout(r,180);});

    var imgs={
      jaar:ci('cJaarG',360),
      week:ci('cWeek',340),
      bdkA:ci('cBdk',300,false),
      bdkT:ci('cBdkT',300,false),
      ovsch:ci('cOvsch',320),
      piekA:ci('cPiekA',320,false),
      piekT:ci('cPiekT',320,false),
      kost:ci('cKost',360),
      pvYear:hasPV?ci('cPVYear',320):'',
      pvMonth:hasPV?ci('cPVMonth',280,false):'',
      batYear:hasBat?ci('cBatYear',320):'',
      batSoC:hasBat?ci('cBatSoC',280,false):''
    };
    imgsByScen.push(imgs);

    var kpis=computeKpis(res.grpKw,res.gtvA||_optim.gtvA,res.gtvT||_optim.gtvT);
    var gtvA=res.gtvA||_optim.gtvA,gtvT=res.gtvT||_optim.gtvT;
    var m=res.metrics||{};
    var gtoSaving=isBasis?calcGtoSavingBasis():(m.kmSaving!=null?m.kmSaving:null);

    scenDataArr.push({scenName:scenName,sc:sc,res:res,kpis:kpis,isBasis:isBasis,gtvA:gtvA,gtvT:gtvT,gtoSaving:gtoSaving,hasPV:hasPV,hasBat:hasBat});
  }

  // ─── Originele scenario terugzetten ────────────────────────
  try{
    var origRes=originalId==='basis'
      ?{grpKw:_optim.baseKw,perKw:_optim.perKw,withData:_optim.withData,gtvA:_optim.gtvA,gtvT:_optim.gtvT}
      :_optim.scenResults[originalId];
    if(origRes&&origRes.grpKw)redrawChartsForScenario(origRes);
  }catch(e){}

  // ────────────────────────────────────────────────────────────
  // PAGINA 1 — COVER
  // ────────────────────────────────────────────────────────────
  var logoUrl='https://www.impulszeeland.nl/assets/img/logo.svg';
  var coverCmp=proj.companies.slice(0,12).map(function(c){
    return'<tr><td>'+c.name+'</td><td>'+(c.ean||'—')+'</td><td>'+c.category+'</td><td class="num">'+c.gtvA+' kW</td></tr>';
  }).join('');
  if(proj.companies.length>12){
    coverCmp+='<tr><td colspan="4" style="text-align:center;color:#888;font-style:italic">… en '+(proj.companies.length-12)+' overige aansluitingen — zie bijlage</td></tr>';
  }

  var coverHtml='<div class="page cover">'+
    '<div class="cover-band">'+
      '<div class="cover-logo">'+
        '<img src="'+logoUrl+'" alt="Impuls Zeeland" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'block\'">'+
        '<span class="cover-logo-fb" style="display:none">ENERGY <span>STUDIO</span></span>'+
      '</div>'+
      '<div style="color:#fff;font-size:9pt;font-weight:700;letter-spacing:1.5px;text-transform:uppercase">Energy Studio</div>'+
    '</div>'+
    '<div class="cover-band-yel"></div>'+
    '<div class="cover-body">'+
      '<div class="cover-eyebrow">Energiegroepsprofiel · Analyserapport</div>'+
      '<h1 class="cover-title">'+proj.name+'</h1>'+
      '<div class="cover-sub">Inzicht in collectief energieverbruik en optimalisatiekansen</div>'+
      (proj.desc?'<p class="cover-desc">'+proj.desc+'</p>':'')+
      '<div class="cover-info">'+
        (periode?'<b>Meetperiode:</b> '+periode+'<br>':'')+
        '<b>Aansluitingen:</b> '+nrAansl+'<br>'+
        '<b>Scenario\'s in dit rapport:</b> '+scenDataArr.length+'<br>'+
        '<b>Opgesteld op:</b> '+datum+'<br>'+
        '<b>Door:</b> Impuls Zeeland — Energy Studio'+
      '</div>'+
      '<div class="cover-cmp">'+
        '<h4>Deelnemende aansluitingen</h4>'+
        '<table>'+
          '<thead><tr><th>Naam</th><th>EAN</th><th>Categorie</th><th class="num">GTV afname</th></tr></thead>'+
          '<tbody>'+coverCmp+'</tbody>'+
        '</table>'+
      '</div>'+
    '</div>'+
    '<div class="cover-foot">'+
      '<span>impulszeeland.nl</span>'+
      '<span class="fr">Energy Studio</span>'+
    '</div>'+
  '</div>';

  // ────────────────────────────────────────────────────────────
  // PAGINA 2 — INHOUDSOPGAVE
  // ────────────────────────────────────────────────────────────
  var tocRows=[
    {n:'1',t:'Samenvatting'},
    {n:'2',t:'Project & deelnemers'},
    {n:'3',t:'Analyse'},
    {n:'3.1',t:'Jaarprofiel',sub:true},
    {n:'3.2',t:'Weekprofiel',sub:true},
    {n:'3.3',t:'Belastingsduurkromme',sub:true},
    {n:'3.4',t:'GTV-overschrijdingen',sub:true},
    {n:'3.5',t:'Piekanalyse & GTO',sub:true},
    {n:'3.6',t:'Kostenanalyse',sub:true}
  ];
  if(scenDataArr.length>1){
    tocRows.push({n:'4',t:'Scenario\'s & vergelijking'});
    scenDataArr.slice(1).forEach(function(d,idx){
      tocRows.push({n:'4.'+(idx+1),t:d.scenName,sub:true});
    });
    if(opts.vergelijk)tocRows.push({n:'4.X',t:'Vergelijkingstabel & maandpieken',sub:true});
  }
  tocRows.push({n:'5',t:'Bevindingen & aanbevelingen'});
  if(opts.methode)tocRows.push({n:'6',t:'Methodologie (appendix)'});
  tocRows.push({n:'·',t:'Contact & colofon'});

  var tocHtml='<div class="page pb">'+
    pageHdr+
    '<div class="rsh"><div class="rsh-n">📑</div><div class="rsh-t">Inhoudsopgave</div></div>'+
    '<div class="toc">'+
      tocRows.map(function(r){
        return'<div class="toc-row'+(r.sub?' sub':'')+'"><span class="toc-num">'+r.n+'</span><span class="toc-title">'+r.t+'</span></div>';
      }).join('')+
    '</div>'+
    pageFooter()+
  '</div>';

  // ────────────────────────────────────────────────────────────
  // PAGINA 3 — SAMENVATTING
  // ────────────────────────────────────────────────────────────
  var basis=scenDataArr[0]||{kpis:{maxA:0,maxT:0,ovA:0,ovT:0,vol:0,volA:0,volT:0},gtvA:0,gtvT:0};
  var bk=basis.kpis;
  var divPct=calcDiversityPct();
  var gtoY=calcGtoSavingBasis();
  var sumYears=_optim.allTs&&_optim.allTs.length?(_optim.allTs.length*0.25/8760):1;

  var summaryBig='<div class="kbig">'+
    kpiCardBig('Totaal afname',_fmtN(bk.volA,1)+' MWh','over '+_fmtN(sumYears,1)+' jaar meetperiode')+
    kpiCardBig('Maximale piek',_fmtN(bk.maxA,0)+' kW','GTV-A: '+basis.gtvA+' kW · '+(bk.ovA>0?bk.ovA+' overschrijdingen':'binnen contract'))+
    kpiCardBig('GTO besparing',gtoY!=null?_fmtE(gtoY):'—',gtoY!=null?'per jaar (kW-max diversiteit)':'onvoldoende data')+
  '</div>';

  var summarySec='<div class="kg k4">'+
    kpiCard('Aansluitingen',nrAansl,'',' dark')+
    kpiCard('Diversiteitswinst',divPct!=null?_fmtN(divPct,0)+'%':'—','som ind. vs. coll.',divPct!=null&&divPct>15?' grn':' dark')+
    kpiCard('Teruglevering piek',_fmtN(bk.maxT,0)+' kW','GTV-T: '+basis.gtvT+' kW',bk.maxT>basis.gtvT?' red':' dark')+
    kpiCard('Volume teruglev.',_fmtN(bk.volT,1)+' MWh','meetperiode',' dark')+
  '</div>';

  var summaryIntro='Dit rapport geeft een overzicht van het collectieve energieverbruik van <strong>'+proj.name+'</strong>'+
    (periode?' over de meetperiode '+periode:'')+
    '. Op basis van '+nrAansl+' aansluiting'+(nrAansl!==1?'en':'')+' worden hieronder de belangrijkste profielen, pieken, overschrijdingen en kostencomponenten geanalyseerd. Daar waar relevant zijn alternatieve scenario\'s (zon, batterij, peak shaving) doorgerekend en vergeleken met de huidige situatie.';

  var summaryHtml='<div class="page pb">'+
    pageHdr+
    '<div class="rsh"><div class="rsh-n">1</div><div class="rsh-t">Samenvatting</div></div>'+
    '<p class="rintro" style="font-size:10pt;line-height:1.65;margin-bottom:14px">'+summaryIntro+'</p>'+
    summaryBig+
    summarySec+
    '<div class="rib2"><strong>Belangrijkste constatering:</strong> '+
      (gtoY!=null&&gtoY>500?'Door de geconstateerde diversiteit tussen aansluitingen is een <b>'+_fmtE(gtoY)+'/jaar besparing</b> realistisch via een collectief transportcontract (GTO).':
       bk.ovA>50?'<b>'+bk.ovA+' GTV-overschrijdingen</b> wijzen op een te krap contract of structurele piek — peak shaving is een quick win.':
       'Het profiel valt grotendeels binnen contract; verdere optimalisatie ligt vooral in zon en/of batterij voor zelfconsumptie.')+
    '</div>'+
    pageFooter()+
  '</div>';

  // ────────────────────────────────────────────────────────────
  // PAGINA 4 — PROJECT & DEELNEMERS
  // ────────────────────────────────────────────────────────────
  var allCosRows=proj.companies.map(function(c,ci2){
    return'<tr>'+
      '<td><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:'+PAL[ci2%PAL.length]+';margin-right:5px;vertical-align:middle"></span>'+c.name+'</td>'+
      '<td>'+(c.ean||'—')+'</td>'+
      '<td>'+c.category+'</td>'+
      '<td class="num">'+c.gtvA+' kW</td>'+
      '<td class="num">'+c.gtvT+' kW</td>'+
      '<td>'+(SA&&SA[c.stedinA||'none']?SA[c.stedinA||'none'].l:'—')+'</td>'+
      '<td>'+(ST&&ST[c.stedinT||'none']?ST[c.stedinT||'none'].l:'—')+'</td>'+
    '</tr>';
  }).join('');

  var sumGtvA=proj.companies.reduce(function(s,c){return s+(c.gtvA||0);},0);
  var sumGtvT=proj.companies.reduce(function(s,c){return s+(c.gtvT||0);},0);

  var dpHtml='<div class="page pb">'+
    pageHdr+
    '<div class="rsh"><div class="rsh-n">2</div><div class="rsh-t">Project & deelnemers</div></div>'+
    '<p class="rintro">Het project bestaat uit '+nrAansl+' aansluiting'+(nrAansl!==1?'en':'')+
      ' met een gezamenlijk gecontracteerd vermogen van <strong>'+sumGtvA+' kW</strong> afname en <strong>'+sumGtvT+' kW</strong> teruglevering. '+
      'Door dit profiel collectief te analyseren wordt zichtbaar waar diversiteit, piekgelijktijdigheid en kostenoptimalisatie kansen bieden.</p>'+
    '<table>'+
      '<thead><tr><th>Naam</th><th>EAN</th><th>Categorie</th><th class="num">GTV-A</th><th class="num">GTV-T</th><th>Aansl.cat.</th><th>Transportcat.</th></tr></thead>'+
      '<tbody>'+allCosRows+'</tbody>'+
    '</table>'+
    pageFooter()+
  '</div>';

  // ────────────────────────────────────────────────────────────
  // PAGINA 5 — ANALYSE (per scenario, uniforme sub-secties)
  // ────────────────────────────────────────────────────────────
  function buildAnalyseSection(scenData,scenIdx){
    var imgs=imgsByScen[scenIdx];
    var k=scenData.kpis;
    var gtvA=scenData.gtvA,gtvT=scenData.gtvT;
    var sectionNum=scenIdx===0?'3':('4.'+scenIdx);
    var sectionTitle=scenIdx===0?'Analyse — '+scenData.scenName:scenData.scenName;

    var badges='';
    if(scenData.sc){
      var sc=scenData.sc;
      if(sc.connectionIds&&sc.connectionIds.length){
        var n=sc.connectionIds.length;var t=proj.companies.length;
        badges+='<span class="rsh-badge">👥 '+n+(t>n?'/'+t:'')+'</span>';
      }
      if(sc.solar&&sc.solar.enabled)badges+='<span class="rsh-badge">☀ '+sc.solar.kWp+' kWp</span>';
      if(sc.bat&&sc.bat.enabled)badges+='<span class="rsh-badge">⚡ '+sc.bat.cap+' kWh</span>';
    }else{
      badges='<span class="rsh-badge">Basis</span>';
    }

    function subHdr(num,title){
      return'<div class="rsub"><span class="rsub-num">'+num+'</span>'+title+'</div>';
    }

    var html='<div class="page pb">'+
      pageHdr+
      '<div class="rsh"><div class="rsh-n">'+sectionNum+'</div><div class="rsh-t">'+sectionTitle+' '+badges+'</div></div>';

    // 3.1 Jaarprofiel
    if(imgs.jaar){
      html+=subHdr(sectionNum+'.1','Jaarprofiel')+
        '<p class="rintro">Het collectieve vermogen over de gehele meetperiode (15-minuutwaarden). Zichtbaar zijn seizoenspatronen, piekvensters en de positie ten opzichte van de GTV-grenzen.</p>'+
        '<div class="rchart">'+imgs.jaar+'</div>'+
        '<div class="kg k4">'+
          kpiCard('Piekafname',_fmtN(k.maxA,0)+' kW','GTV: '+gtvA+' kW',k.maxA>gtvA?'red':'dark')+
          kpiCard('Piek terug',_fmtN(k.maxT,0)+' kW','GTV-T: '+gtvT+' kW',k.maxT>gtvT?'red':'dark')+
          kpiCard('Volume afname',_fmtN(k.volA,1)+' MWh','',' dark')+
          kpiCard('Volume terug',_fmtN(k.volT,1)+' MWh','',' dark')+
        '</div>';
    }

    // 3.2 Weekprofiel
    if(imgs.week){
      html+=subHdr(sectionNum+'.2','Weekprofiel')+
        '<p class="rintro">Gemiddeld dag-/uurpatroon over een hele week — toont werkdagritme en weekend-effect met min/max-bandbreedte.</p>'+
        '<div class="rchart">'+imgs.week+'</div>';
    }

    // 3.3 BDK
    if(imgs.bdkA||imgs.bdkT){
      html+=subHdr(sectionNum+'.3','Belastingsduurkromme')+
        '<p class="rintro">Cumulatieve verdeling van vermogen over de tijd. Hoe vlakker de curve, hoe gelijkmatiger het verbruik. De top-percentielen tonen het peak shaving-potentieel.</p>'+
        '<div class="r2col">'+
          (imgs.bdkA?'<div class="rchart"><h3>BDK — afname</h3>'+imgs.bdkA+'</div>':'')+
          (imgs.bdkT?'<div class="rchart"><h3>BDK — teruglevering</h3>'+imgs.bdkT+'</div>':'')+
        '</div>';
    }

    // 3.4 Overschrijdingen
    if(imgs.ovsch){
      html+=subHdr(sectionNum+'.4','GTV-overschrijdingen')+
        '<p class="rintro">Aantal kwartierwaarden per maand boven de gecontracteerde GTV. Concentraties geven aan in welke periode aanvullende capaciteit of peak shaving nodig is.</p>'+
        '<div class="rchart">'+imgs.ovsch+'</div>'+
        '<div class="kg">'+
          kpiCard('Overschrijdingen afname',k.ovA,'kwartierwaarden',k.ovA>0?'red':'grn')+
          kpiCard('Overschrijdingen teruglev.',k.ovT,'kwartierwaarden',k.ovT>0?'red':'grn')+
          kpiCard('Hoogste piek',_fmtN(k.maxA,0)+' kW',k.maxA>gtvA?'+'+_fmtN((k.maxA-gtvA)/gtvA*100,0)+'% boven GTV':'binnen contract',k.maxA>gtvA?'red':'grn')+
        '</div>';
    }

    // 3.5 Piekanalyse & GTO
    if(imgs.piekA||imgs.piekT){
      html+=subHdr(sectionNum+'.5','Piekanalyse & GTO')+
        '<p class="rintro">Vergelijking van som individuele maandpieken versus collectieve maandpiek. Het verschil (diversiteitswinst) is de basis voor besparing via een collectief transportcontract.</p>'+
        '<div class="r2col">'+
          (imgs.piekA?'<div class="rchart"><h3>Pieken — afname</h3>'+imgs.piekA+'</div>':'')+
          (imgs.piekT?'<div class="rchart"><h3>Pieken — teruglevering</h3>'+imgs.piekT+'</div>':'')+
        '</div>';
      if(scenData.isBasis){
        var divP=calcDiversityPct(),gtoB=calcGtoSavingBasis();
        html+='<div class="kg">'+
          kpiCard('Diversiteitswinst',divP!=null?_fmtN(divP,0)+'%':'—','collectief vs. individueel',divP!=null&&divP>15?'grn':'dark')+
          kpiCard('GTO besparing',gtoB!=null?_fmtE(gtoB):'—','per jaar',gtoB!=null&&gtoB>0?'grn':'dark')+
          kpiCard('Hoogste maandpiek',_fmtN(k.maxA,0)+' kW','op groepsniveau','dark')+
        '</div>';
      }else if(scenData.gtoSaving!=null){
        html+='<div class="kg k2">'+
          kpiCard('kW-max besparing vs. basis',_fmtE(scenData.gtoSaving),'per jaar',scenData.gtoSaving>0?'grn':'dark')+
          kpiCard('Pieksverschuiving',_fmtN(basis.kpis.maxA-k.maxA,0)+' kW','t.o.v. basisscenario',basis.kpis.maxA-k.maxA>0?'grn':'dark')+
        '</div>';
      }
    }

    // 3.6 Kosten
    if(imgs.kost){
      html+=subHdr(sectionNum+'.6','Kostenanalyse')+
        '<p class="rintro">Uitsplitsing van energie- en netwerkkosten per aansluiting. De kW-max-component (rood) is meestal de grootste hefboom voor besparing via diversiteit of peak shaving.</p>'+
        '<div class="rchart">'+imgs.kost+'</div>';
    }

    // PV & Bat (alleen als geconfigureerd)
    if(imgs.pvYear||imgs.pvMonth){
      html+=subHdr(sectionNum+'.7','Zonnepanelen')+
        '<p class="rintro">Gemodelleerde opwek met astronomische zonpositie en KNMI-bewolkingsdata.</p>'+
        '<div class="r2col">'+
          (imgs.pvYear?'<div class="rchart"><h3>PV — jaarprofiel</h3>'+imgs.pvYear+'</div>':'')+
          (imgs.pvMonth?'<div class="rchart"><h3>Maandopbrengst (kWh)</h3>'+imgs.pvMonth+'</div>':'')+
        '</div>';
    }
    if(imgs.batYear||imgs.batSoC){
      html+=subHdr(sectionNum+'.8','Batterij')+
        '<p class="rintro">Gedrag en laadstatus van de batterij over de meetperiode.</p>'+
        '<div class="r2col">'+
          (imgs.batYear?'<div class="rchart"><h3>Batterij — vermogen (kW)</h3>'+imgs.batYear+'</div>':'')+
          (imgs.batSoC?'<div class="rchart"><h3>Laadstatus (SoC %)</h3>'+imgs.batSoC+'</div>':'')+
        '</div>';
    }

    html+=pageFooter()+'</div>';
    return html;
  }

  var analyseHtml=scenDataArr.map(function(d,idx){return buildAnalyseSection(d,idx);}).join('');

  // ────────────────────────────────────────────────────────────
  // VERGELIJKING (alleen bij meerdere scenario's)
  // ────────────────────────────────────────────────────────────
  var vergHtml='';
  if(opts.vergelijk&&scenDataArr.length>=2){
    try{renderComparison();}catch(e){}
    await new Promise(function(r){setTimeout(r,140);});
    var vergPiekImg=ci('cVergPiek',360);

    var vHdrs='<th>Meetpunt</th>'+scenDataArr.map(function(d){return'<th>'+d.scenName+'</th>';}).join('');
    function vRow(lbl,fn){
      return'<tr><td style="font-weight:600">'+lbl+'</td>'+scenDataArr.map(fn).join('')+'</tr>';
    }
    function vDelta(d,baseV,curV,unit,inv){
      if(d.isBasis)return'<td class="num">'+_fmtN(curV,1)+'</td>';
      var diff=baseV-curV;
      var good=inv?diff<0:diff>0;
      var sign=diff>=0?'−':'+';
      return'<td class="num">'+_fmtN(curV,1)+' <span class="'+(good?'vp':'vn')+'">'+sign+_fmtN(Math.abs(diff),1)+'</span></td>';
    }
    var vBody=
      vRow('Aansluitingen',function(d){var n=d.res.withData?d.res.withData.length:nrAansl;return'<td>'+n+(nrAansl>n?'/'+nrAansl:'')+'</td>';})+
      vRow('GTV afname / teruglev.',function(d){return'<td>'+(d.gtvA||'—')+' / '+(d.gtvT||'—')+' kW</td>';})+
      vRow('Piek afname (kW)',function(d){return vDelta(d,scenDataArr[0].kpis.maxA,d.kpis.maxA,'kW',false);})+
      vRow('Piek teruglevering (kW)',function(d){return vDelta(d,scenDataArr[0].kpis.maxT,d.kpis.maxT,'kW',false);})+
      vRow('GTV-A overschrijdingen',function(d){return'<td class="num '+(d.kpis.ovA>0?'vn':'vp')+'">'+d.kpis.ovA+'</td>';})+
      vRow('GTV-T overschrijdingen',function(d){return'<td class="num '+(d.kpis.ovT>0?'vn':'vp')+'">'+d.kpis.ovT+'</td>';})+
      vRow('Volume afname (MWh)',function(d){return'<td class="num">'+_fmtN(d.kpis.volA,1)+'</td>';})+
      vRow('Autarkie (%)',function(d){var m=d.res.metrics||{};return'<td class="num">'+(m.autarkie!=null?_fmtN(m.autarkie,0)+'%':'—')+'</td>';})+
      vRow('PV-opbrengst (MWh/jr)',function(d){var m=d.res.metrics||{};return'<td class="num">'+(m.pvTotal!=null?_fmtN(m.pvTotal/1000,1):'—')+'</td>';})+
      vRow('kW-max besparing (€/jr)',function(d){
        if(d.isBasis)return'<td>—</td>';
        var m=d.res.metrics||{};return'<td class="num">'+(m.kmSaving!=null?'<span class="vp">'+_fmtE(m.kmSaving)+'</span>':'—')+'</td>';
      });

    vergHtml='<div class="page pb">'+
      pageHdr+
      '<div class="rsh"><div class="rsh-n">⇄</div><div class="rsh-t">Vergelijking scenario\'s</div></div>'+
      '<p class="rintro">Naast elkaar overzicht van alle scenario\'s. Groene waarden = verbetering t.o.v. basisscenario, rood = verslechtering.</p>'+
      '<table><thead><tr>'+vHdrs+'</tr></thead><tbody>'+vBody+'</tbody></table>'+
      (vergPiekImg?'<div class="rchart"><h3>Maandelijkse piekafname per scenario (kW)</h3>'+vergPiekImg+'</div>':'')+
      pageFooter()+
    '</div>';
  }

  // ────────────────────────────────────────────────────────────
  // BEVINDINGEN & AANBEVELINGEN
  // ────────────────────────────────────────────────────────────
  var findingsList=genFindings(scenDataArr);
  var findingsHtml='<div class="page pb">'+
    pageHdr+
    '<div class="rsh"><div class="rsh-n">★</div><div class="rsh-t">Bevindingen & aanbevelingen</div></div>'+
    '<p class="rintro">Onderstaande bevindingen zijn automatisch afgeleid uit de meetdata en doorgerekende scenario\'s. Bedragen zijn indicatief en gebaseerd op Stedin-tarieven 2026.</p>'+
    '<div class="fnd">'+
      '<div class="fnd-h">Belangrijkste constateringen</div>'+
      '<ul>'+findingsList.map(function(f){return'<li>'+f+'</li>';}).join('')+'</ul>'+
    '</div>'+
    '<div class="rib2"><strong>Vervolgstap:</strong> bespreek deze bevindingen met de deelnemers en bepaal welke optimalisaties (collectief contract, peak shaving, zon, batterij) prioriteit krijgen. Impuls Zeeland kan begeleiding bieden bij contractwijzigingen en businesscases.</div>'+
    pageFooter()+
  '</div>';

  // ────────────────────────────────────────────────────────────
  // METHODOLOGIE (appendix, optioneel)
  // ────────────────────────────────────────────────────────────
  var methHtml='';
  if(opts.methode){
    methHtml='<div class="page pb">'+
      pageHdr+
      '<div class="rsh"><div class="rsh-n">?</div><div class="rsh-t">Methodologie (appendix)</div></div>'+
      '<p class="rintro">Korte verantwoording van de gebruikte definities, formules en aannames.</p>'+
      '<table>'+
      '<thead><tr><th>Onderwerp</th><th>Toelichting</th></tr></thead><tbody>'+
      '<tr><td><strong>Eenheid</strong></td><td>kWh per kwartier × 4 = gemiddeld vermogen (kW) over een 15-minuten interval.</td></tr>'+
      '<tr><td><strong>Groepsprofiel</strong></td><td>Gesommeerd vermogen over alle aansluitingen op overlappende kwartierwaarden.</td></tr>'+
      '<tr><td><strong>GTV (afname/teruglevering)</strong></td><td>Gecontracteerd transportvermogen per aansluiting (kW). Overschrijding = kwartierwaarde > GTV.</td></tr>'+
      '<tr><td><strong>kW-max</strong></td><td>Maandelijks hoogste gemeten kwartierpiek; de variabele kostencomponent van Stedin (kW-max tarief 2026).</td></tr>'+
      '<tr><td><strong>GTO-besparing</strong></td><td>Verschil tussen som individuele kW-max kosten en collectieve kW-max kosten over de meetperiode (geëxtrapoleerd naar 12 maanden).</td></tr>'+
      '<tr><td><strong>Diversiteitswinst</strong></td><td>(Σ individuele maandpieken − collectieve maandpiek) ÷ Σ individuele maandpieken — gemiddeld over de meetperiode.</td></tr>'+
      '<tr><td><strong>Autarkie</strong></td><td>% van de eigen vraag dat door eigen opwek (PV) en/of batterij wordt afgedekt.</td></tr>'+
      '<tr><td><strong>PV-model</strong></td><td>Astronomisch (declinatie, uurhoek, zenithoek, invalshoek; φ=51.5°N, Zeeland) met maandfactoren op basis van KNMI-bewolking.</td></tr>'+
      '<tr><td><strong>Batterij — peak shaving</strong></td><td>Binaire zoek per maand naar minimale symmetrische drempel voor afname én teruglevering, beperkt door max. cycli per jaar.</td></tr>'+
      '<tr><td><strong>Batterij — onafhankelijkheid</strong></td><td>Greedy forward-pass: laden bij netto-overschot, ontladen bij netto-import; prioriteert opslag boven net.</td></tr>'+
      '</tbody></table>'+
      pageFooter()+
    '</div>';
  }

  // ────────────────────────────────────────────────────────────
  // EINDPAGINA — Contact & colofon
  // ────────────────────────────────────────────────────────────
  var endHtml='<div class="page pb endp">'+
    '<div class="endp-hero">'+
      '<img src="'+logoUrl+'" alt="Impuls Zeeland" onerror="this.style.display=\'none\'">'+
      '<div class="endp-hero-tag">Samen werken aan Zeeuwse energie</div>'+
      '<div class="endp-hero-sub">Impuls Zeeland helpt ondernemers, gemeenten en samenwerkingsverbanden bij de verduurzaming van hun energievoorziening — van eerste analyse tot collectief contract en realisatie.</div>'+
    '</div>'+
    '<div class="endp-body">'+
      '<div class="endp-grid">'+
        '<div class="endp-block">'+
          '<div class="endp-h">Over Impuls Zeeland</div>'+
          '<p>Wij zijn de regionale ontwikkelingsmaatschappij van Zeeland. Met de Energy Studio brengen wij collectieve verbruiksprofielen in kaart en helpen we ondernemers gezamenlijk te besparen op netwerkkosten en CO₂-uitstoot.</p>'+
          '<p>Vragen over dit rapport, een collectief transportcontract (GTO), of vervolgonderzoek naar zon- en batterijopties? Neem gerust contact met ons op.</p>'+
        '</div>'+
        '<div class="endp-block">'+
          '<div class="endp-h">Contact</div>'+
          '<div class="endp-contact">'+
            '<div class="row"><span class="lbl">Web</span><a href="https://www.impulszeeland.nl">www.impulszeeland.nl</a></div>'+
            '<div class="row"><span class="lbl">E-mail</span><a href="mailto:info@impulszeeland.nl">info@impulszeeland.nl</a></div>'+
            '<div class="row"><span class="lbl">Telefoon</span><span>0118 — 31 50 80</span></div>'+
            '<div class="row"><span class="lbl">Adres</span><span>Stationspark 2, 4462 DZ Goes</span></div>'+
          '</div>'+
        '</div>'+
      '</div>'+
      '<div class="endp-disc">'+
        '<strong>Disclaimer.</strong> Dit rapport is opgesteld op basis van door deelnemers aangeleverde meetdata en publiek beschikbare tarieven (Stedin 2026). Berekende besparingen en opbrengsten zijn indicatief en kunnen afwijken van werkelijke realisatie door wijzigingen in tarieven, weerpatronen, gebruikspatronen of contractvoorwaarden. Voor methodologische details, zie de bijlage. Aan dit rapport kunnen geen rechten worden ontleend.'+
      '</div>'+
    '</div>'+
    '<div class="endp-foot">'+
      '<strong>Energy Studio</strong> · '+proj.name+' · '+datum+
    '</div>'+
  '</div>';

  // ────────────────────────────────────────────────────────────
  return'<!DOCTYPE html><html lang="nl"><head><meta charset="UTF-8">'+
    '<link rel="preconnect" href="https://fonts.googleapis.com">'+
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;600;700;900&display=swap">'+
    '<title>Rapport — '+proj.name+' — Energy Studio</title>'+
    '<style>'+css+'</style>'+
    '</head><body>'+
      coverHtml+
      tocHtml+
      summaryHtml+
      dpHtml+
      analyseHtml+
      vergHtml+
      findingsHtml+
      methHtml+
      endHtml+
    '</body></html>';
}
