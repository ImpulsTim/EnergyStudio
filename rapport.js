// ─── Rapport ───────────────────────────────────────────────────

// ─── Gedeelde rapport-bouwstenen (gebruikt door GTO- én EHP-rapport) ───────────

// Volledige CSS-string (Impuls-huisstijl, landscape A4). Eén bron van waarheid.
function rapportCss(){
  return [
    '*{box-sizing:border-box;margin:0;padding:0}',
    'html,body{background:#fff}',
    'body{font-family:"Barlow",Arial,sans-serif;font-size:10pt;color:#242b38;line-height:1.55;font-variant-numeric:tabular-nums}',
    '@page{size:A4 landscape;margin:8mm}',
    '@media print{.pb{page-break-before:always}.no-break,.kg,.kbig,.rchart,.rsh,.kpi-row{page-break-inside:avoid}img{max-width:100%!important}}',
    'a{color:#46962b;text-decoration:none}',
    '.page{padding:8mm 6mm 6mm;position:relative}',
    '.page.pb{page-break-before:always}',
    '.hdr{background:#46962b;padding:9px 16px;display:flex;align-items:center;justify-content:space-between;-webkit-print-color-adjust:exact;print-color-adjust:exact;margin:-8mm -6mm 12px}',
    '.brand{font-size:13pt;font-weight:900;color:#fff;letter-spacing:1.5px;text-transform:uppercase;line-height:1.1}',
    '.brand span{color:#fbba00}',
    '.brand-by{font-size:7.5pt;font-weight:600;color:rgba(255,255,255,.78);margin-top:1px}',
    '.hdr-dt{color:rgba(255,255,255,.88);font-size:8pt;text-align:right;line-height:1.4}',
    '.divider{height:3px;background:#fbba00;-webkit-print-color-adjust:exact;print-color-adjust:exact;margin:-12px -6mm 14px}',
    '.rsh{display:flex;align-items:stretch;margin:0 0 10px;page-break-after:avoid;border-radius:3px;overflow:hidden;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    '.rsh-n{background:#46962b;color:#fff;font-weight:900;font-size:13pt;min-width:38px;text-align:center;display:flex;align-items:center;justify-content:center;padding:0 10px;flex-shrink:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    '.rsh-t{background:#242b38;color:#fff;font-weight:900;font-size:11.5pt;padding:8px 14px;display:flex;align-items:center;gap:8px;flex:1;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    '.rsh-badge{background:rgba(255,255,255,.18);border-radius:3px;padding:2px 7px;font-size:8pt;font-weight:700}',
    '.rsub{font-size:11pt;font-weight:700;color:#242b38;margin:16px 0 4px;padding-bottom:3px;border-bottom:2px solid #46962b;display:inline-block;page-break-after:avoid}',
    '.rsub-num{color:#46962b;font-weight:900;margin-right:6px}',
    '.rintro{font-size:9.5pt;color:#555;margin:0 0 10px;line-height:1.5}',
    'table{width:100%;border-collapse:collapse;font-size:9pt;margin-bottom:12px}',
    'thead th{background:#242b38;color:#fff;padding:5px 8px;text-align:left;font-size:8pt;font-weight:700;text-transform:uppercase;letter-spacing:.5px;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    'thead th.num{text-align:right}',
    'td{padding:5px 8px;border-bottom:1px solid #e2ecdf;vertical-align:middle}',
    'td.num{text-align:right;font-variant-numeric:tabular-nums}',
    'tr:nth-child(even) td{background:#f7fbf5;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    'tr:last-child td{border-bottom:none}',
    'table.compact{table-layout:fixed;font-size:7.5pt}',
    'table.compact thead th{padding:5px 5px;font-size:7pt;letter-spacing:.2px}',
    'table.compact td{padding:4px 5px;word-break:break-word}',
    'table.compact thead th.grp{background:#46962b;text-align:center;border-left:2px solid #fff}',
    'table.compact tr.tot td{background:#eef6e8;font-weight:700;border-top:2px solid #46962b;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    'table.compact tr.tot td:first-child{color:#242b38}',
    '.rib{background:#edf5ea;border-left:3px solid #46962b;padding:6px 10px;font-size:9pt;color:#3a7d23;margin:0 0 10px;border-radius:0 3px 3px 0;line-height:1.45;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    '.rib2{background:#f2f8fa;border-left:3px solid #a6d6cc;padding:6px 10px;font-size:9pt;color:#2c6e70;margin:0 0 10px;border-radius:0 3px 3px 0;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    '.rib-warn{background:#fdf3e8;border-left:3px solid #e67e22;padding:6px 10px;font-size:9pt;color:#a85a13;margin:0 0 10px;border-radius:0 3px 3px 0;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    '.rchart{margin:0 0 12px}',
    '.rchart h3{font-size:8.5pt;font-weight:700;color:#46962b;margin:0 0 4px;text-transform:uppercase;letter-spacing:.5px}',
    '.rchart img{max-width:100%;height:auto;display:block;margin:0 auto}',
    '.r2col{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:0 0 12px}',
    '.r2col .rchart{margin:0}',
    '.kg{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin:0 0 14px}',
    '.kg.k4{grid-template-columns:repeat(4,1fr)}',
    '.kg.k2{grid-template-columns:repeat(2,1fr)}',
    '.kg.k5{grid-template-columns:repeat(5,1fr)}',
    '.kg.k6{grid-template-columns:repeat(6,1fr)}',
    '.kb{border:1px solid #e2ecdf;border-radius:5px;padding:8px 10px;background:#fff}',
    '.kb.grn{border-color:#46962b;background:#f4fbf0;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    '.kb.red{border-color:#e2b8b4;background:#fdf5f5;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    '.kb.acc{border-color:#fbba00;background:#fffbeb;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    '.kl{font-size:7.5pt;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#888;margin-bottom:3px}',
    '.kv{font-size:14pt;font-weight:900;line-height:1.05;color:#242b38}',
    '.kv.grn{color:#46962b}.kv.red{color:#c0392b}.kv.dark{color:#242b38}.kv.acc{color:#a87f00}',
    '.ku{font-size:7.5pt;color:#aaa;margin-top:2px}',
    '.kbig{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin:0 0 14px}',
    '.kbb{border:1.5px solid #46962b;border-radius:6px;padding:14px 14px;background:linear-gradient(135deg,#f4fbf0 0%,#eaf5e2 100%);-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    '.kbb .kl{font-size:8pt;color:#3a7d23}',
    '.kbb .kv{font-size:22pt;color:#46962b;line-height:1}',
    '.kbb .ku{font-size:8.5pt;color:#5e8e4a;margin-top:4px}',
    '.vp{color:#46962b;font-weight:700}',
    '.vn{color:#c0392b;font-weight:700}',
    '.ft{margin-top:14px;padding-top:6px;border-top:1px solid #e2ecdf;font-size:7.5pt;color:#bbb;display:flex;justify-content:space-between}',
    '.fnd{background:#f7fbf5;border:1px solid #d8e9d2;border-radius:6px;padding:10px 14px;margin-bottom:10px;page-break-inside:avoid;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    '.fnd-h{font-size:9.5pt;font-weight:900;color:#46962b;margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px}',
    '.fnd ul{margin:0;padding-left:18px}',
    '.fnd li{font-size:9.5pt;line-height:1.55;margin-bottom:3px}',
    '.fnd li strong{color:#242b38}',
    '.cover{padding:0;display:flex;flex-direction:column;min-height:185mm;position:relative}',
    '.cover-band{background:#46962b;height:18mm;display:flex;align-items:center;padding:0 14mm;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    '.cover-band-yel{background:#fbba00;height:4mm;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    '.cover-logo{height:11mm;margin-right:auto;display:flex;align-items:center;gap:10px}',
    '.cover-logo img{height:11mm;display:block;background:#fff;padding:4px 8px;border-radius:4px}',
    '.cover-logo-fb{font-size:13pt;font-weight:900;color:#fff;letter-spacing:2px;text-transform:uppercase}',
    '.cover-logo-fb span{color:#fbba00}',
    '.cover-body{flex:1;padding:11mm 14mm 6mm;display:grid;grid-template-columns:1fr 1fr;gap:12mm;align-items:start}',
    '.cover-left{min-width:0}',
    '.cover-right{min-width:0}',
    '.cover-eyebrow{font-size:10pt;font-weight:700;color:#46962b;text-transform:uppercase;letter-spacing:2.5px;margin-bottom:5mm}',
    '.cover-title{font-size:28pt;font-weight:900;color:#242b38;line-height:1.05;margin-bottom:4mm;letter-spacing:-.5px}',
    '.cover-sub{font-size:12.5pt;font-weight:700;color:#46962b;margin-bottom:0}',
    '.cover-desc{font-size:9.5pt;color:#555;margin-top:4mm;line-height:1.55}',
    '.cover-info{background:#f7fbf5;border-left:4px solid #46962b;padding:11px 15px;margin-top:5mm;font-size:9.5pt;line-height:1.9;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    '.cover-map{margin-top:0}',
    '.cover-map img{width:100%;height:auto;max-height:135mm;object-fit:cover;border:1px solid #d8e9d2;border-radius:6px;display:block}',
    '.cover-map-cap{font-size:8pt;color:#888;margin-top:3px;text-align:center;font-style:italic}',
    '.cover-info b{color:#242b38}',
    '.cover-cmp{margin-top:auto}',
    '.cover-cmp h4{font-size:8.5pt;font-weight:700;color:#46962b;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:5px}',
    '.cover-cmp table{margin:0;font-size:8.5pt}',
    '.cover-cmp th{padding:4px 8px;font-size:7pt}',
    '.cover-cmp td{padding:4px 8px}',
    '.cover-foot{background:#242b38;color:#fff;padding:6mm 14mm;display:flex;justify-content:space-between;align-items:center;font-size:9pt;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    '.cover-foot .fr{color:#fbba00;font-weight:700}',
    '.toc{margin:8mm 0}',
    '.toc-row{display:flex;align-items:baseline;font-size:11pt;padding:5px 0;border-bottom:1px dotted #cdd9c6}',
    '.toc-row:last-child{border-bottom:none}',
    '.toc-num{font-weight:900;color:#46962b;min-width:14mm}',
    '.toc-title{flex:1;color:#242b38}',
    '.toc-row.sub{font-size:10pt;padding-left:14mm;color:#555}',
    '.toc-row.sub .toc-num{color:#888;min-width:10mm}',
    '.endp{padding:0;display:flex;flex-direction:column;min-height:185mm;background:#fff;position:relative}',
    '.endp-hero{background:linear-gradient(135deg,#46962b 0%,#3a7d23 100%);color:#fff;padding:9mm 14mm 8mm;display:flex;flex-direction:column;align-items:center;text-align:center;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    '.endp-hero img{height:13mm;background:#fff;padding:6px 12px;border-radius:6px;margin-bottom:4mm}',
    '.endp-hero-tag{font-size:15pt;font-weight:900;letter-spacing:.5px;margin-bottom:2mm}',
    '.endp-hero-sub{font-size:9.5pt;color:rgba(255,255,255,.85);max-width:150mm;line-height:1.5}',
    '.endp-body{padding:8mm 14mm 6mm;flex:1}',
    '.endp-h{font-size:11.5pt;font-weight:900;color:#46962b;margin:0 0 3mm;text-transform:uppercase;letter-spacing:1.5px}',
    '.endp-grid{display:grid;grid-template-columns:1fr 1fr;gap:10mm;margin-bottom:6mm}',
    '.endp-block p{font-size:9pt;line-height:1.5;color:#444;margin-bottom:2.5mm}',
    '.endp-contact{background:#f7fbf5;border:1px solid #d8e9d2;border-radius:6px;padding:5mm 6mm;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    '.endp-contact .row{display:flex;align-items:center;gap:8px;margin-bottom:2mm;font-size:9.5pt}',
    '.endp-contact .lbl{color:#888;min-width:20mm;font-size:8.5pt;text-transform:uppercase;letter-spacing:.5px;font-weight:700}',
    '.endp-disc{font-size:8pt;color:#888;line-height:1.55;border-top:1px solid #eaeaea;padding-top:5mm;margin-top:auto}',
    '.endp-foot{background:#242b38;color:#aaa;padding:5mm 14mm;text-align:center;font-size:8pt;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    '.endp-foot strong{color:#fbba00}',
    // EHP-specifiek
    '.ehp-flow-box{border:1px solid #d8e9d2;border-radius:6px;padding:10px;background:#fbfdfa;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    '.ehp-flow-box svg{width:100%;height:auto;display:block}',
    '.ehp-bar{display:flex;height:11px;border-radius:6px;overflow:hidden;background:#eef2ec;margin:4px 0 2px}',
    '.ehp-bar span{display:block;height:100%;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    '.ehp-bar-lbl{font-size:7.5pt;color:#888;margin-bottom:6px}',
    '.ehp-pc-grid{display:grid;grid-template-columns:1.1fr 1fr;gap:12px;align-items:start}',
  ].join('');
}

// Chart-capture: rendert een Chart.js-grafiek VERS in een offscreen container met
// vaste afmeting (geen resize-race → geen half-gerenderde stacked bars/area-fills).
async function _rapCi(id,h,full,customW){
  var W=customW!=null?customW:(full!==false?1040:500);
  var H=h||360;
  var src=document.getElementById(id);
  if(!src)return'';
  var chart=Chart.getChart?Chart.getChart(src):null;
  if(!chart)return'';
  var cfg=chart.config;
  var box=document.createElement('div');
  box.style.cssText='position:fixed;left:-99999px;top:0;width:'+W+'px;height:'+H+'px;background:#fff';
  var off=document.createElement('canvas');
  box.appendChild(off);
  document.body.appendChild(box);
  var uri='',c=null;
  try{
    var data={labels:cfg.data.labels,
      datasets:cfg.data.datasets.map(function(d){return Object.assign({},d);})};
    var opts=Object.assign({},cfg.options,{responsive:true,maintainAspectRatio:false,animation:false,devicePixelRatio:2});
    c=new Chart(off,{type:cfg.type,data:data,options:opts,plugins:cfg.plugins});
    await new Promise(function(r){requestAnimationFrame(function(){requestAnimationFrame(r);});});
    uri=off.toDataURL('image/png');
  }catch(e){console.error('_rapCi '+id+':',e);}
  try{if(c)c.destroy();}catch(e){}
  try{document.body.removeChild(box);}catch(e){}
  if(!uri||uri==='data:,')return'';
  var imgW=customW!=null?'100%':W+'px';
  return'<img src="'+uri+'" style="width:'+imgW+';max-width:100%;height:auto;display:block">';
}

// Element-capture: vang een willekeurig HTML-element (parameters/heatmaps/tabel) als
// afbeelding. imgStyle: optionele override van de <img> style.
async function _rapCihEl(el,forcedW,imgStyle){
  try{
    if(typeof htmlToImage==='undefined'||!el)return'';
    forcedW=forcedW||1040;
    var restored=[];
    var p=el.parentElement;
    while(p&&p!==document.body){if(getComputedStyle(p).display==='none'){restored.push({el:p,v:p.style.display});p.style.display='block';}p=p.parentElement;}
    var prevW=el.style.width;
    el.style.width=forcedW+'px';
    void el.getBoundingClientRect();
    await new Promise(function(r){requestAnimationFrame(function(){requestAnimationFrame(r);});});
    var uri='';
    try{uri=await htmlToImage.toPng(el,{pixelRatio:2,backgroundColor:'#ffffff',width:forcedW,cacheBust:true});}catch(e){console.error('_rapCihEl:',e);}
    el.style.width=prevW;
    restored.forEach(function(x){x.el.style.display=x.v;});
    if(!uri||uri.length<200)return'';
    return'<img src="'+uri+'" style="'+(imgStyle||'width:100%;max-width:100%;height:auto;display:block')+'">';
  }catch(e){console.error('_rapCihEl:',e);return'';}
}

// Kaart-snapshot voor de cover (best-effort: vereist coördinaten + geladen tiles).
async function captureProjectMap(proj){
  try{
    if(typeof htmlToImage==='undefined'||typeof L==='undefined'||typeof initKaart!=='function')return'';
    var hasCoords=(proj.companies||[]).some(function(c){return c.lat!=null&&!isNaN(c.lat)&&c.lng!=null&&!isNaN(c.lng);});
    if(!hasCoords)return'';
    var mapEl=document.getElementById('kaartMap');
    if(!mapEl)return'';
    var restored=[];
    var el=mapEl.parentElement;
    while(el&&el!==document.body){
      if(getComputedStyle(el).display==='none'){restored.push({el:el,v:el.style.display});el.style.display='block';}
      el=el.parentElement;
    }
    var prevW=mapEl.style.width,prevH=mapEl.style.height;
    mapEl.style.width='900px';mapEl.style.height='600px';
    void document.body.offsetHeight;
    try{initKaart();}catch(e){}
    try{renderKaart();}catch(e){}
    if(typeof _kaartMap!=='undefined'&&_kaartMap){
      try{_kaartMap.invalidateSize();}catch(e){}
      try{
        var pts=(proj.companies||[]).filter(function(c){return c.lat!=null&&!isNaN(c.lat)&&c.lng!=null&&!isNaN(c.lng);}).map(function(c){return[+c.lat,+c.lng];});
        (proj.msRingen||[]).forEach(function(ring){(ring.netburen||[]).forEach(function(n){if(n.lat!=null&&!isNaN(n.lat)&&n.lng!=null&&!isNaN(n.lng))pts.push([+n.lat,+n.lng]);});});
        if(pts.length){
          _kaartMap.fitBounds(pts,{padding:[70,70],maxZoom:15});
          _kaartMap.setZoom(Math.max(_kaartMap.getZoom()-0.7,_kaartMap.getMinZoom()||0),{animate:false});
        }
      }catch(e){}
    }
    await new Promise(function(r){
      var done=false,start=Date.now(),minMs=1500,maxMs=6000,quiet=null;
      function finish(){if(done)return;done=true;clearTimeout(maxTo);if(quiet)clearTimeout(quiet);r();}
      var maxTo=setTimeout(finish,maxMs);
      function arm(){
        if(quiet)clearTimeout(quiet);
        quiet=setTimeout(function(){
          var wait=Math.max(0,minMs-(Date.now()-start));
          setTimeout(finish,wait);
        },600);
      }
      try{
        var found=false;
        _kaartMap.eachLayer(function(layer){
          if(layer instanceof L.TileLayer){found=true;layer.on('load',arm);layer.on('tileload',arm);}
        });
        if(!found)finish();else arm();
      }catch(e){finish();}
    });
    await new Promise(function(r){requestAnimationFrame(function(){requestAnimationFrame(r);});});
    var uri='';
    try{uri=await htmlToImage.toPng(mapEl,{pixelRatio:2,backgroundColor:'#e9eff2',cacheBust:true});}catch(e){console.error('captureProjectMap toPng:',e);}
    mapEl.style.width=prevW;mapEl.style.height=prevH;
    restored.forEach(function(x){x.el.style.display=x.v;});
    if(typeof _kaartMap!=='undefined'&&_kaartMap){try{_kaartMap.invalidateSize();}catch(e){}}
    if(!uri||uri.length<500)return'';
    return uri;
  }catch(e){console.error('captureProjectMap:',e);return'';}
}

function openRapportModal(){
  if(!_optim.baseKw.length){notify('Voer eerst een analyse uit',false);return;}
  var proj=ap();
  var scens=(proj&&proj.scenarios)?proj.scenarios:[];
  var allScens=[{id:'basis',name:'Basis — gemeten groepsprofiel'}].concat(scens.map(function(sc){return{id:sc.id,name:sc.name};}));
  var chartOpts=[
    {id:'jaar', lbl:'Jaarprofiel',def:true},
    {id:'week', lbl:'Weekprofiel',def:true},
    {id:'gelijkt',lbl:'Gelijktijdigheid',def:false},
    {id:'bdk',  lbl:'BDK',def:false},
    {id:'ovsch',lbl:'Overschrijdingen',def:false},
    {id:'piek', lbl:'Piekanalyse (GTO)',def:false}
  ];
  var html=allScens.map(function(sc){
    var sid=sc.id.replace(/[^a-z0-9]/gi,'_');
    var chks=chartOpts.map(function(c){
      return'<label class="rap-opt-lbl" style="font-size:11px;padding:2px 0">'+
        '<input type="checkbox" class="rap-chart-chk" data-scen-id="'+sc.id+'" data-chart="'+c.id+'"'+(c.def?' checked':'')+'>'+
        ' '+c.lbl+'</label>';
    }).join('');
    return'<div class="rap-scen-row" style="border:1px solid #dce6e0;border-radius:6px;padding:8px 10px;margin-bottom:6px">'+
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">'+
        '<label class="rap-opt-lbl" style="flex:1;font-weight:600"><input type="checkbox" class="rap-scen-chk" data-id="'+sc.id+'" checked> '+sc.name+'</label>'+
        '<button type="button" class="rap-expand-btn b" data-target="rap-charts-'+sid+'" '+
          'style="font-size:11px;padding:2px 8px;background:transparent;border:1px solid #ccc;color:#555">▾ Grafieken</button>'+
      '</div>'+
      '<div id="rap-charts-'+sid+'" style="display:none;display:grid;grid-template-columns:1fr 1fr 1fr;gap:2px 10px;padding-top:4px;border-top:1px solid #eee;margin-top:4px">'+
        chks+
      '</div>'+
    '</div>';
  }).join('');
  document.getElementById('roptScenList').innerHTML=html;
  // Grafiekkeuze uitklappen/inklappen
  [].slice.call(document.querySelectorAll('.rap-expand-btn')).forEach(function(btn){
    var targetId=btn.dataset.target;
    var panel=document.getElementById(targetId);
    if(!panel)return;
    panel.style.display='none';
    btn.onclick=function(){
      var open=panel.style.display!=='none';
      panel.style.display=open?'none':'grid';
      btn.textContent=open?'▾ Grafieken':'▴ Grafieken';
    };
  });
  var allBtn=document.getElementById('btnRoptAll');
  var noneBtn=document.getElementById('btnRoptNone');
  if(allBtn)allBtn.onclick=function(){[].slice.call(document.querySelectorAll('.rap-scen-chk')).forEach(function(c){c.checked=true;});};
  if(noneBtn)noneBtn.onclick=function(){[].slice.call(document.querySelectorAll('.rap-scen-chk')).forEach(function(c){c.checked=false;});};
  showM('mRapOpts');
}

async function generateRapport(){
  var btn=document.getElementById('btnGenRap');
  btn.textContent='Bezig…';btn.disabled=true;
  try{
    var opts={
      scenarios:[].slice.call(document.querySelectorAll('.rap-scen-chk:checked')).map(function(el){
        var sid=el.dataset.id;
        var charts=[].slice.call(document.querySelectorAll('.rap-chart-chk[data-scen-id="'+sid+'"]:checked')).map(function(c){return c.dataset.chart;});
        return{id:sid,charts:charts};
      })
    };
    if(!opts.scenarios.length){notify('Selecteer minimaal één scenario',false);return;}
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

function downloadRapportPDF(){
  // De browser-afdruk respecteert @page landscape en levert een perfecte PDF.
  // html2canvas verschaalt landscape niet correct (halve-breedte/niet-gecentreerd),
  // dus leiden we de PDF-download via het afdrukvenster: kies daar "Opslaan als PDF".
  notify('Kies in het afdrukvenster bij "Bestemming" de optie "Opslaan als PDF"');
  var iframe=document.getElementById('rPreview');
  setTimeout(function(){
    try{iframe.contentWindow.focus();iframe.contentWindow.print();}
    catch(e){notify('Afdrukken mislukt: '+e.message,false);console.error(e);}
  },350);
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

  // ─── CSS (gedeeld via rapportCss) ────────────────────────────
  var css=rapportCss();

  // Chart-/element-capture (gedeeld op module-niveau, zie _rapCi/_rapCihEl bovenaan).
  var ci=_rapCi, cihEl=_rapCihEl;

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

  for(var i=0;i<opts.scenarios.length;i++){
    var scenOpt=opts.scenarios[i];
    var scenId=scenOpt.id;
    var selC=scenOpt.charts||['jaar','week'];
    function selHas(x){return selC.indexOf(x)>=0;}
    var byId=function(id){return document.getElementById(id);};

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
      jaar:selHas('jaar')?await ci('cJaarG',310):'',
      week:selHas('week')?await ci('cWeek',380):'',
      gelijktKpis:'',gelijktW:'',bdk:'',ovKpis:'',heat:'',piekLeg:'',piekA:'',piekT:'',gto:'',
      pvYear:hasPV?await ci('cPVYear',320):'',
      pvMonth:hasPV?await ci('cPVMonth',280,false):'',
      batYear:hasBat?await ci('cBatYear',320):'',
      batSoC:hasBat?await ci('cBatSoC',280,false):''
    };
    // Gelijktijdigheid: KPI-grid full-width + weekpatroon (offscreen render → schoon)
    if(selHas('gelijkt')){
      imgs.gelijktKpis=await cihEl(byId('gelijktKpis'));
      imgs.gelijktW=await ci('cGelijktWeek',340);
    }
    // BDK: gecombineerde curve op volle breedte
    if(selHas('bdk')){
      imgs.bdk=await ci('cBdk',380);
    }
    // Overschrijdingen: KPI-grid + heatmap (alleen .hm-wrap; heatmap met max-hoogte
    //   zodat kernparameters + heatmap samen binnen één landscape-vel passen)
    if(selHas('ovsch')){
      imgs.ovKpis=await cihEl(byId('ovKpis'));
      var hmWrap=byId('heatA')?byId('heatA').closest('.hm-wrap'):null;
      imgs.heat=await cihEl(hmWrap,1040,'width:auto;max-width:100%;max-height:100mm;height:auto;display:block;margin:0 auto');
    }
    // Piekanalyse: beide charts op volle breedte (offscreen render → bars over alle maanden); legenda apart
    if(selHas('piek')){
      imgs.piekLeg=await cihEl(byId('pLeg'));
      imgs.piekA=await ci('cPiekA',360);
      imgs.piekT=await ci('cPiekT',360);
      imgs.gto=await cihEl(byId('gtoBody')?byId('gtoBody').closest('.cd'):null);
    }
    imgsByScen.push(imgs);

    var kpis=computeKpis(res.grpKw,res.gtvA||_optim.gtvA,res.gtvT||_optim.gtvT);
    var gtvA=res.gtvA||_optim.gtvA,gtvT=res.gtvT||_optim.gtvT;
    var m=res.metrics||{};
    var gtoSaving=isBasis?calcGtoSavingBasis():(m.kmSaving!=null?m.kmSaving:null);

    scenDataArr.push({scenName:scenName,sc:sc,res:res,kpis:kpis,isBasis:isBasis,gtvA:gtvA,gtvT:gtvT,gtoSaving:gtoSaving,hasPV:hasPV,hasBat:hasBat,charts:scenOpt.charts||[]});
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
  var sumYears=_optim.allTs&&_optim.allTs.length?(_optim.allTs.length*0.25/8760):1;
  var nonAnnual=Math.abs(sumYears-1)>0.05;

  // ── Per-aansluiting analyse (uit perKw, op id gematcht) ──
  var connData=proj.companies.map(function(c){
    var wi=-1;
    for(var j=0;j<_optim.withData.length;j++){if(_optim.withData[j].id===c.id){wi=j;break;}}
    var row=(wi>=0&&_optim.perKw&&_optim.perKw[wi])?_optim.perKw[wi]:null;
    var o={c:c,has:!!row,jvMWh:0,tlMWh:0,piekA:0,piekT:0,ovA:0,ovT:0};
    if(row){
      var sumA=0,sumT=0;
      for(var q=0;q<row.length;q++){
        var v=row[q];if(v==null)continue;
        if(v>0){sumA+=v;if(v>o.piekA)o.piekA=v;if(v>(c.gtvA||0))o.ovA++;}
        else if(v<0){var a=-v;sumT+=a;if(a>o.piekT)o.piekT=a;if(a>(c.gtvT||0))o.ovT++;}
      }
      o.jvMWh=sumA*0.25/1000/sumYears;
      o.tlMWh=sumT*0.25/1000/sumYears;
    }
    return o;
  });
  var tot={gtvA:0,gtvT:0,jv:0,tl:0};
  connData.forEach(function(o){tot.gtvA+=o.c.gtvA||0;tot.gtvT+=o.c.gtvT||0;tot.jv+=o.jvMWh;tot.tl+=o.tlMWh;});
  var basisKpis=computeKpis(_optim.baseKw,_optim.gtvA,_optim.gtvT);

  // ── Kaart-snapshot voor de cover (gedeeld, zie captureProjectMap bovenaan) ──
  var mapImg=await captureProjectMap(proj);

  // ────────────────────────────────────────────────────────────
  // PAGINA 1 — COVER
  // ────────────────────────────────────────────────────────────
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
      '<div class="cover-left">'+
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
      '</div>'+
      '<div class="cover-right">'+
        (mapImg?'<div class="cover-map"><img src="'+mapImg+'" alt="Kaart project"><div class="cover-map-cap">Geografische ligging van de aansluitingen</div></div>':'')+
      '</div>'+
    '</div>'+
    '<div class="cover-foot">'+
      '<span>impulszeeland.nl</span>'+
      '<span class="fr">Energy Studio</span>'+
    '</div>'+
  '</div>';

  // ────────────────────────────────────────────────────────────
  // PAGINA 2 — PROJECTOVERZICHT (groeps-KPI's + per-aansluiting tabel)
  // ────────────────────────────────────────────────────────────
  var grpCards='<div class="kg k6">'+
    kpiCard('Jaarverbruik afname',_fmtN(basisKpis.volA/sumYears,1)+' MWh','collectief, per jaar',' dark')+
    kpiCard('Teruglevering',_fmtN(basisKpis.volT/sumYears,1)+' MWh','collectief, per jaar',' dark')+
    kpiCard('Piekafname',_fmtN(basisKpis.maxA,0)+' kW','GTV-A '+_optim.gtvA+' kW',basisKpis.maxA>_optim.gtvA?'red':'grn')+
    kpiCard('Piek teruglevering',_fmtN(basisKpis.maxT,0)+' kW','GTV-T '+_optim.gtvT+' kW',basisKpis.maxT>_optim.gtvT?'red':'grn')+
    kpiCard('Overschr. GTV-A',_fmtI(basisKpis.ovA),'kwartierwaarden',basisKpis.ovA>0?'red':'grn')+
    kpiCard('Overschr. GTV-T',_fmtI(basisKpis.ovT),'kwartierwaarden',basisKpis.ovT>0?'red':'grn')+
  '</div>';

  var colg='<colgroup>'+
    '<col style="width:11%"><col style="width:12%"><col style="width:13%">'+
    '<col style="width:5%"><col style="width:6%"><col style="width:6%"><col style="width:6%">'+
    '<col style="width:8%"><col style="width:8%"><col style="width:7%"><col style="width:7%">'+
    '<col style="width:5.5%"><col style="width:5.5%">'+
  '</colgroup>';
  var thead='<thead>'+
    '<tr><th class="grp" colspan="7">Aansluitgegevens</th>'+
      '<th class="grp" colspan="6">Analyse · '+(nonAnnual?'per jaar (geëxtrapoleerd)':'meetperiode')+'</th></tr>'+
    '<tr>'+
      '<th>Naam</th><th>EAN</th><th>Adres</th>'+
      '<th class="num">kVA</th><th>Zekering</th>'+
      '<th class="num">GTV-A</th><th class="num">GTV-T</th>'+
      '<th class="num">Jaarverbr.<br>MWh</th><th class="num">Teruglev.<br>MWh</th>'+
      '<th class="num">Piek afn.<br>kW</th><th class="num">Piek ter.<br>kW</th>'+
      '<th class="num">Ovsch.<br>GTV-A</th><th class="num">Ovsch.<br>GTV-T</th>'+
    '</tr></thead>';
  var connRows=connData.map(function(o,idx){
    var c=o.c;
    return'<tr>'+
      '<td><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:'+PAL[idx%PAL.length]+';margin-right:4px;vertical-align:middle"></span>'+c.name+'</td>'+
      '<td>'+(c.ean||'—')+'</td>'+
      '<td>'+(c.adres||'—')+'</td>'+
      '<td class="num">'+(c.kva!=null?_fmtN(c.kva,0):'—')+'</td>'+
      '<td>'+(c.zekering||'—')+'</td>'+
      '<td class="num">'+(c.gtvA!=null?c.gtvA:'—')+'</td>'+
      '<td class="num">'+(c.gtvT!=null?c.gtvT:'—')+'</td>'+
      '<td class="num">'+(o.has?_fmtN(o.jvMWh,1):'—')+'</td>'+
      '<td class="num">'+(o.has?_fmtN(o.tlMWh,1):'—')+'</td>'+
      '<td class="num">'+(o.has?_fmtN(o.piekA,0):'—')+'</td>'+
      '<td class="num">'+(o.has?_fmtN(o.piekT,0):'—')+'</td>'+
      '<td class="num"'+(o.has&&o.ovA>0?' style="color:#c0392b;font-weight:700"':'')+'>'+(o.has?o.ovA:'—')+'</td>'+
      '<td class="num"'+(o.has&&o.ovT>0?' style="color:#c0392b;font-weight:700"':'')+'>'+(o.has?o.ovT:'—')+'</td>'+
    '</tr>';
  }).join('');
  var totRow='<tr class="tot">'+
    '<td>Totaal / collectief</td><td></td><td></td><td></td><td></td>'+
    '<td class="num">'+_fmtI(tot.gtvA)+'</td>'+
    '<td class="num">'+_fmtI(tot.gtvT)+'</td>'+
    '<td class="num">'+_fmtN(tot.jv,1)+'</td>'+
    '<td class="num">'+_fmtN(tot.tl,1)+'</td>'+
    '<td class="num">'+_fmtN(basisKpis.maxA,0)+'</td>'+
    '<td class="num">'+_fmtN(basisKpis.maxT,0)+'</td>'+
    '<td class="num">'+_fmtI(basisKpis.ovA)+'</td>'+
    '<td class="num">'+_fmtI(basisKpis.ovT)+'</td>'+
  '</tr>';

  var dpHtml='<div class="page pb">'+
    pageHdr+
    '<div class="rsh"><div class="rsh-n">1</div><div class="rsh-t">Projectoverzicht</div></div>'+
    '<p class="rintro">Het project <strong>'+proj.name+'</strong> bestaat uit '+nrAansl+' aansluiting'+(nrAansl!==1?'en':'')+
      ' met een gezamenlijk gecontracteerd transportvermogen van <strong>'+_fmtI(tot.gtvA)+' kW</strong> afname en <strong>'+_fmtI(tot.gtvT)+' kW</strong> teruglevering'+
      (periode?', gemeten over '+periode:'')+'. Hieronder de collectieve kerncijfers, gevolgd door de analyse per aansluiting.</p>'+
    grpCards+
    '<table class="compact">'+colg+thead+'<tbody>'+connRows+totRow+'</tbody></table>'+
    '<div class="rib2">De piek- en overschrijdingskolommen op de totaalrij tonen de <strong>collectieve</strong> waarde (gelijktijdig groepsprofiel), niet de som van de individuele pieken — dankzij diversiteit ligt de collectieve piek doorgaans lager.</div>'+
    '<div class="rib-warn"><strong>GTV bij scenario\'s:</strong> bij een scenario met meerdere aansluitingen worden de GTV\'s standaard <strong>bij elkaar opgeteld</strong> (tenzij anders vermeld in de titel van het scenario). Volledige optelling van GTV\'s is bij een collectief transportcontract (GTO) in de praktijk zelden mogelijk; of en in welke mate dit kan, hangt af van de onderhandelingen met de netbeheerder.</div>'+
    (nonAnnual?'<div class="rib-warn">De meetperiode beslaat '+_fmtN(sumYears,2)+' jaar; verbruiks- en terugleverwaarden (MWh) zijn geëxtrapoleerd naar een vol jaar. Pieken en overschrijdingen betreffen de werkelijke meetperiode.</div>':'')+
    pageFooter()+
  '</div>';

  // ────────────────────────────────────────────────────────────
  // PAGINA 5 — ANALYSE (per scenario, uniforme sub-secties)
  // ────────────────────────────────────────────────────────────
  // Sectie per scenario: kernparameters + jaarprofiel + gemiddeld weekprofiel
  function buildScenarioSection(scenData,scenIdx){
    var imgs=imgsByScen[scenIdx];
    var k=scenData.kpis;
    var gtvA=scenData.gtvA,gtvT=scenData.gtvT;
    var sectionNum=String(2+scenIdx);
    var title=scenData.scenName;

    // Accentkleur per scenario — herkenbaar bij snel bladeren
    var SCEN_COLORS=['#46962b','#2980b9','#e67e22','#8e44ad','#c0392b','#16a085','#d35400','#2c3e50'];
    var scenColor=SCEN_COLORS[scenIdx%SCEN_COLORS.length];

    var badges='',cfgBits=[];
    var introHtml='';
    if(scenData.sc){
      var sc=scenData.sc;
      if(sc.connectionIds&&sc.connectionIds.length){
        var n=sc.connectionIds.length;var t=proj.companies.length;
        badges+='<span class="rsh-badge">'+n+(t>n?'/'+t:'')+' aansluitingen</span>';
        if(t>n)cfgBits.push('subset van '+n+' van de '+t+' aansluitingen');
      }
      if(sc.solar&&sc.solar.enabled){badges+='<span class="rsh-badge">Zon '+sc.solar.kWp+' kWp</span>';cfgBits.push('zonnepanelen '+sc.solar.kWp+' kWp');}
      if(sc.bat&&sc.bat.enabled){badges+='<span class="rsh-badge">Batterij '+sc.bat.cap+' kWh</span>';cfgBits.push('batterij '+sc.bat.cap+' kWh / '+sc.bat.pMax+' kW');}
      if(cfgBits.length)introHtml='<p class="rintro">Configuratie: '+cfgBits.join(', ')+'.</p>';
    }else{
      badges='<span class="rsh-badge">Alle aansluitingen · gemeten</span>';
      // Basis-toelichting: duidelijk wat dit scenario is en wat de GTV betekent
      introHtml='<div class="rib" style="margin-bottom:10px">'+
        '<strong>Basisscenario — gecombineerd gemeten profiel.</strong> '+
        'Dit scenario toont het collectieve verbruiksprofiel van <strong>alle '+proj.companies.length+' aansluitingen</strong> in het project samen, '+
        'zoals gemeten over de meetperiode. '+
        'Het GTV-A van <strong>'+_fmtI(gtvA)+' kW</strong> en GTV-T van <strong>'+_fmtI(gtvT)+' kW</strong> zijn de '+
        '<strong>som van de individuele contractvermogens</strong> per aansluiting — dit is de referentiegrens als ieder bedrijf zijn eigen transportcontract behoudt. '+
        'Dankzij diversiteit in gebruikspatronen ligt de collectieve piek ('+_fmtN(k.maxA,0)+' kW) doorgaans lager dan de som van de individuele pieken.'+
      '</div>';
    }

    var kpiHtml='<div class="kg k6">'+
      kpiCard('Piekafname',_fmtN(k.maxA,0)+' kW','GTV-A '+gtvA+' kW',k.maxA>gtvA?'red':'grn')+
      kpiCard('Piek teruglevering',_fmtN(k.maxT,0)+' kW','GTV-T '+gtvT+' kW',k.maxT>gtvT?'red':'grn')+
      kpiCard('Overschr. GTV-A',_fmtI(k.ovA),'kwartierwaarden',k.ovA>0?'red':'grn')+
      kpiCard('Overschr. GTV-T',_fmtI(k.ovT),'kwartierwaarden',k.ovT>0?'red':'grn')+
      kpiCard('Volume afname',_fmtN(k.volA/sumYears,1)+' MWh','per jaar',' dark')+
      kpiCard('Volume teruglevering',_fmtN(k.volT/sumYears,1)+' MWh','per jaar',' dark')+
    '</div>';

    // Eén "blok" = één pagina. Volgorde volgt de gekozen grafieken.
    var legHtml=imgs.piekLeg?'<div style="margin-bottom:8px">'+imgs.piekLeg+'</div>':'';
    var blocks=[];
    if(imgs.jaar)blocks.push({label:'Jaarprofiel',html:
      '<div class="rchart"><h3>Jaarprofiel — collectief groepsvermogen (kW)</h3>'+imgs.jaar+'</div>'});
    if(imgs.week)blocks.push({label:'Gemiddeld weekprofiel',html:
      '<div class="rchart"><h3>Gemiddeld weekprofiel — dag-/uurpatroon met min/max-band (kW)</h3>'+imgs.week+'</div>'});
    if(imgs.gelijktKpis||imgs.gelijktW)blocks.push({label:'Gelijktijdigheid',html:
      (imgs.gelijktKpis?'<div class="rchart"><h3>Kernparameters gelijktijdigheid</h3>'+imgs.gelijktKpis+'</div>':'')+
      (imgs.gelijktW?'<div class="rchart"><h3>Weekpatroon gelijktijdigheid</h3>'+imgs.gelijktW+'</div>':'')});
    if(imgs.bdk)blocks.push({label:'Belastingduurkromme',html:
      '<div class="rchart"><h3>Belastingduurkromme — afname naar teruglevering (kW)</h3>'+imgs.bdk+'</div>'});
    // Overschrijdingen: kernparameters + heatmap samen op één pagina
    if(imgs.ovKpis||imgs.heat)blocks.push({label:'Overschrijdingen',html:
      (imgs.ovKpis?'<div class="rchart"><h3>Kernparameters overschrijdingen</h3>'+imgs.ovKpis+'</div>':'')+
      (imgs.heat?'<div class="rchart"><h3>Heatmap — overschrijdingen per uur en maand</h3>'+imgs.heat+'</div>':'')});
    // Piekanalyse: afname en teruglevering elk op volle breedte, aparte pagina's
    if(imgs.piekA)blocks.push({label:'Piekanalyse — maandpieken afname',html:
      legHtml+'<div class="rchart"><h3>Maandpieken afname — individueel vs. collectief (kW)</h3>'+imgs.piekA+'</div>'});
    if(imgs.piekT)blocks.push({label:'Piekanalyse — maandpieken teruglevering',html:
      legHtml+'<div class="rchart"><h3>Maandpieken teruglevering — individueel vs. collectief (kW)</h3>'+imgs.piekT+'</div>'});
    if(imgs.gto)blocks.push({label:'GTO-besparing per maand',html:
      '<div class="rchart"><h3>GTO-besparing per maand (kW-max diversiteit)</h3>'+imgs.gto+'</div>'});
    if(imgs.pvYear||imgs.pvMonth)blocks.push({label:'Zonnepanelen',html:'<div class="r2col">'+
      (imgs.pvYear?'<div class="rchart"><h3>Zon — jaarprofiel</h3>'+imgs.pvYear+'</div>':'')+
      (imgs.pvMonth?'<div class="rchart"><h3>Maandopbrengst (kWh)</h3>'+imgs.pvMonth+'</div>':'')+'</div>'});
    if(imgs.batYear||imgs.batSoC)blocks.push({label:'Batterij',html:'<div class="r2col">'+
      (imgs.batYear?'<div class="rchart"><h3>Batterij — vermogen (kW)</h3>'+imgs.batYear+'</div>':'')+
      (imgs.batSoC?'<div class="rchart"><h3>Laadstatus (SoC %)</h3>'+imgs.batSoC+'</div>':'')+'</div>'});

    // Sectie-header: unieke accentkleur per scenario voor snelle visuele herkenning
    function scenHdr(extra){
      return'<div class="rsh">'+
        '<div class="rsh-n" style="background:'+scenColor+';-webkit-print-color-adjust:exact;print-color-adjust:exact">'+sectionNum+'</div>'+
        '<div class="rsh-t" style="border-left:4px solid '+scenColor+';-webkit-print-color-adjust:exact;print-color-adjust:exact">'+
          (scenData.isBasis?'Basisscenario':'Scenario')+' — '+title+' '+badges+
          (extra?'<span class="rsh-badge" style="margin-left:auto;background:'+scenColor+'55">'+extra+'</span>':'')+'</div></div>';
    }

    // Pagina 1: kerncijfers + eerste gekozen grafiek
    var first=blocks.length?blocks[0]:null;
    var pages='<div class="page pb">'+
      pageHdr+
      scenHdr('Kerncijfers'+(first?' &amp; '+first.label:''))+
      introHtml+
      kpiHtml+
      (first?first.html:'')+
      pageFooter()+
    '</div>';
    // Vervolgpagina's: één gekozen grafiek per pagina, met banner
    for(var b=1;b<blocks.length;b++){
      pages+='<div class="page pb">'+pageHdr+scenHdr(blocks[b].label)+blocks[b].html+pageFooter()+'</div>';
    }
    return pages;
  }

  var scenarioHtml=scenDataArr.map(function(d,idx){return buildScenarioSection(d,idx);}).join('');

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
            '<div class="row"><span class="lbl">E-mail</span><a href="mailto:energie@impulszeeland.nl">energie@impulszeeland.nl</a></div>'+
            '<div class="row"><span class="lbl">Telefoon</span><span>0118 724900</span></div>'+
            '<div class="row"><span class="lbl">Adres</span><span>Edisonweg 37 D1, 4382 NV Vlissingen</span></div>'+
          '</div>'+
        '</div>'+
      '</div>'+
      '<div class="endp-disc">'+
        '<strong>Disclaimer.</strong> Dit rapport is opgesteld op basis van door deelnemers aangeleverde meetdata en publiek beschikbare tarieven (Stedin 2026). Berekende besparingen en opbrengsten zijn indicatief en kunnen afwijken van werkelijke realisatie door wijzigingen in tarieven, weerpatronen, gebruikspatronen of contractvoorwaarden. Aan dit rapport kunnen geen rechten worden ontleend.'+
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
      dpHtml+
      scenarioHtml+
      endHtml+
    '</body></html>';
}
