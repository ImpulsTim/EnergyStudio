// ─── EHP-rapport ───────────────────────────────────────────────
// Losstaand rapport voor het Energiehandelsplatform. Hergebruikt de gedeelde
// huisstijl/bouwstenen uit rapport.js (rapportCss, _rapCi, _rapCihEl,
// captureProjectMap) en de bestaande preview-modal (#mRap / #rPreview).

// ─── Modal: platform-selectie ───────────────────────────────────
function openEhpRapportModal(){
  var p=_ehpProj();
  if(!p||!p.ehps||!p.ehps.length){notify('Maak eerst een handelsplatform aan',false);return;}
  var html=p.ehps.map(function(pf){
    var n=(pf.members||[]).length;
    return '<label class="rap-opt-lbl" style="display:flex;align-items:center;gap:8px;border:1px solid #dce6e0;border-radius:6px;padding:8px 10px;margin-bottom:6px;font-weight:600">'+
      '<input type="checkbox" class="ehprap-chk" data-id="'+pf.id+'" checked> '+
      '<span style="flex:1">'+_ehpEsc(pf.name||'Platform')+'</span>'+
      '<span style="font-size:11px;color:#888;font-weight:400">'+n+' deelnemer'+(n===1?'':'s')+'</span>'+
    '</label>';
  }).join('');
  document.getElementById('ehpRapPlatList').innerHTML=html;
  var allBtn=document.getElementById('btnEhpRoptAll');
  var noneBtn=document.getElementById('btnEhpRoptNone');
  if(allBtn)allBtn.onclick=function(){[].slice.call(document.querySelectorAll('.ehprap-chk')).forEach(function(c){c.checked=true;});};
  if(noneBtn)noneBtn.onclick=function(){[].slice.call(document.querySelectorAll('.ehprap-chk')).forEach(function(c){c.checked=false;});};
  showM('mEhpRapOpts');
}

async function generateEhpRapport(){
  var btn=document.getElementById('btnGenEhpRap');
  btn.textContent='Bezig…';btn.disabled=true;
  try{
    var ids=[].slice.call(document.querySelectorAll('.ehprap-chk:checked')).map(function(el){return el.dataset.id;});
    if(!ids.length){notify('Selecteer minimaal één platform',false);return;}
    var html=await buildEhpRapport({platforms:ids});
    var iframe=document.getElementById('rPreview');
    var doc=iframe.contentDocument||iframe.contentWindow.document;
    doc.open();doc.write(html);doc.close();
    hideM('mEhpRapOpts');showM('mRap');
    notify('EHP-rapport klaar');
  }catch(e){notify('Rapport mislukt: '+e.message,false);console.error(e);}
  finally{btn.textContent='Rapport genereren →';btn.disabled=false;}
}

// ─── Opmaak-hulpjes ─────────────────────────────────────────────
function _ehpRapMoney(n){
  if(n==null||isNaN(n))return'—';
  var s=n<0?'− ':(n>0?'+ ':'');
  return s+'€ '+Math.abs(Math.round(n)).toLocaleString('nl-NL');
}
function _ehpRapCt(eurPerKwh){
  if(eurPerKwh==null||isNaN(eurPerKwh))return'—';
  return (Math.round(eurPerKwh*10000)/100).toLocaleString('nl-NL',{minimumFractionDigits:2,maximumFractionDigits:2})+' ct/kWh';
}
function _ehpRapMwh(kwh){
  if(kwh==null||isNaN(kwh))return'—';
  return (Math.round(kwh/1000*10)/10).toLocaleString('nl-NL',{minimumFractionDigits:1,maximumFractionDigits:1})+' MWh';
}
function _ehpRapKwh(kwh){
  if(kwh==null||isNaN(kwh))return'—';
  return Math.round(kwh).toLocaleString('nl-NL');
}
function _ehpRapCard(lbl,val,unit,cls){
  cls=cls||'';
  return '<div class="kb '+cls.trim()+'"><div class="kl">'+lbl+'</div>'+
    '<div class="kv '+cls.trim()+'" style="font-size:13pt">'+val+'</div>'+
    (unit?'<div class="ku">'+unit+'</div>':'')+'</div>';
}

// ─── Hoofdfunctie ───────────────────────────────────────────────
async function buildEhpRapport(opts){
  var proj=_ehpProj();
  if(!proj)throw new Error('Geen actief project');
  var ids=(opts&&opts.platforms)||[];
  if(!ids.length)throw new Error('Geen platform geselecteerd');

  var origActive=_ehpActiveId;
  var datum=new Date().toLocaleDateString('nl-NL',{day:'numeric',month:'long',year:'numeric'});
  var logoUrl='https://www.impulszeeland.nl/assets/img/logo.svg';
  var srcLbl={zon:'Zon',wind:'Wind',overig:'Overig',none:'Alleen afnemer',
    afname_invoeden:'Afname-invoeden',alleen_afname:'Alleen afnemer',geen:'Geen'};

  var pageHdr='<div class="hdr">'+
    '<div><div class="brand">ENERGY <span>STUDIO</span></div><div class="brand-by">by Impuls Zeeland</div></div>'+
    '<div class="hdr-dt">'+datum+'<br><span style="font-size:7pt;opacity:.85">'+(proj.name||'')+' · Handelsplatform</span></div>'+
    '</div><div class="divider"></div>';
  function pageFooter(){
    return '<div class="ft"><span>Energy Studio · Impuls Zeeland — Energiehandelsplatform</span><span>'+datum+'</span></div>';
  }
  function fmtDate(s){
    if(!s)return'';
    var p=String(s).split(/[T ]/)[0].split('-');
    if(p.length<3)return s;
    return parseInt(p[2],10)+' '+['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december'][parseInt(p[1],10)-1]+' '+p[0];
  }

  // ── Kaart-snapshot voor de cover ──
  var mapImg=await captureProjectMap(proj);

  // ── Per platform berekenen + secties bouwen ──
  var sections=[];
  var coverPeriode='';

  for(var pi=0;pi<ids.length;pi++){
    var id=ids[pi];
    var plat=null;
    for(var j=0;j<proj.ehps.length;j++){if(proj.ehps[j].id===id){plat=proj.ehps[j];break;}}
    if(!plat)continue;

    // Activeer + bereken; calcEHP vult _ehpLast synchroon en rendert de live UI
    // (grafieken + tabellen), waaruit we onderdelen als afbeelding vastleggen.
    selectEhp(id);
    try{await calcEHP();}catch(e){console.error('calcEHP('+id+'):',e);continue;}
    var res=_ehpLast;
    if(!res||!res.parties||!res.parties.length)continue;

    if(!coverPeriode&&res.ts&&res.ts.length)
      coverPeriode=fmtDate(res.ts[0])+' t/m '+fmtDate(res.ts[res.ts.length-1]);

    // Energiestromen-SVG + live grafiek 'gelijktijdigheid & EPEX-prijs'
    var flowSvg='';
    try{flowSvg=_ehpFlowSvg(res);}catch(e){console.error('flowSvg:',e);}
    var gelEpexImg=await _rapCi('cEhpGelEpex',230);

    // Kansen-tab: markt-mismatchanalyse (KPI's + urgentie-heatmaps) en top kansvensters
    // (zelfde live DOM/berekening als de Kansen-tab in de app, als afbeelding vastgelegd).
    var urgKpisImg=await _rapCihEl(document.getElementById('ehpUrgentieKpis'),1040);
    var urgHeatImg=await _rapCihEl(document.getElementById('ehpUrgentieWrap'),1040,
      'width:auto;max-width:100%;max-height:120mm;height:auto;display:block;margin:0 auto');
    var kans=_ehpKansenCompute(res);

    // Bestaande UI-tabellen vastleggen (hergebruik van de app-logica en -styling):
    //  • platform- en per-deelnemer gelijktijdigheidstabellen
    //  • financieel overzicht (EPEX historisch + forward scenario)
    //  • jaarfactuur per deelnemer
    var gelCap=await _ehpRapCaptureGel(res);
    var finBloks=await _ehpRapCapturePieces(_ehpOverzichtHtml(res),'.ehp-ov-blok',1180);
    var factuurMap=await _ehpRapCaptureFactuur(res);

    sections.push(buildPlatformSection(res,{
      flowSvg:flowSvg,gelEpexImg:gelEpexImg,
      urgKpisImg:urgKpisImg,urgHeatImg:urgHeatImg,kansenBuckets:kans.buckets,
      platGel:gelCap.platform,memberGel:gelCap.members,
      finBloks:finBloks,factuur:factuurMap
    },pi+1));
  }

  // ── Editor herstellen ──
  _ehpActiveId=origActive;
  try{renderEHP();}catch(e){}

  if(!sections.length)throw new Error('Geen platform met meetdata om te rapporteren');

  // ── Cover ──
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
        '<div class="cover-eyebrow">Energiehandelsplatform · Analyserapport</div>'+
        '<h1 class="cover-title">'+_ehpEsc(proj.name)+'</h1>'+
        '<div class="cover-sub">Interne energie-uitwisseling en verrekening binnen het collectief</div>'+
        (proj.desc?'<p class="cover-desc">'+_ehpEsc(proj.desc)+'</p>':'')+
        '<div class="cover-info">'+
          (coverPeriode?'<b>Meetperiode:</b> '+coverPeriode+'<br>':'')+
          '<b>Platforms in dit rapport:</b> '+sections.length+'<br>'+
          '<b>Aansluitingen in project:</b> '+(proj.companies||[]).length+'<br>'+
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

  // ── Eindpagina ──
  var endHtml='<div class="page pb endp">'+
    '<div class="endp-hero">'+
      '<img src="'+logoUrl+'" alt="Impuls Zeeland" onerror="this.style.display=\'none\'">'+
      '<div class="endp-hero-tag">Samen werken aan Zeeuwse energie</div>'+
      '<div class="endp-hero-sub">Impuls Zeeland helpt ondernemers, gemeenten en samenwerkingsverbanden bij het opzetten van collectieve energie-uitwisseling — van eerste analyse tot een werkend handelsplatform.</div>'+
    '</div>'+
    '<div class="endp-body">'+
      '<div class="endp-grid">'+
        '<div class="endp-block">'+
          '<div class="endp-h">Over dit rapport</div>'+
          '<p>Dit rapport brengt de interne energiestromen en verrekening van het energiehandelsplatform in kaart: welke opwek intern wordt benut, wat naar en van het net gaat, en welke interne verrekenprijzen en resultaten per deelnemer gelden.</p>'+
          '<p>Vragen over het opzetten van een handelsplatform, de verrekensystematiek of vervolgstappen? Neem gerust contact met ons op.</p>'+
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
        '<strong>Disclaimer.</strong> Dit rapport is opgesteld op basis van door deelnemers aangeleverde meetdata en de in het platform ingevoerde verreken- en tariefaannames. De getoonde verrekenprijzen, kosten en opbrengsten zijn indicatief en kunnen afwijken van de werkelijke realisatie door wijzigingen in tarieven, marktprijzen, gebruikspatronen of contractvoorwaarden. Aan dit rapport kunnen geen rechten worden ontleend.'+
      '</div>'+
    '</div>'+
    '<div class="endp-foot">'+
      '<strong>Energy Studio</strong> · '+_ehpEsc(proj.name)+' · '+datum+
    '</div>'+
  '</div>';

  return '<!DOCTYPE html><html lang="nl"><head><meta charset="UTF-8">'+
    '<link rel="preconnect" href="https://fonts.googleapis.com">'+
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;600;700;900&display=swap">'+
    '<title>EHP-rapport — '+_ehpEsc(proj.name)+' — Energy Studio</title>'+
    '<style>'+rapportCss()+'</style>'+
    '</head><body>'+
      coverHtml+
      sections.join('')+
      endHtml+
    '</body></html>';

  // ─── Sectie per platform ──────────────────────────────────────
  function buildPlatformSection(res,cap,num){
    var cfg=res.cfg||{};
    var flowSvg=cap.flowSvg;
    function shdr(extra){
      return '<div class="rsh"><div class="rsh-n">'+num+'</div><div class="rsh-t">Platform — '+_ehpEsc(res.platName)+
        (extra?'<span class="rsh-badge" style="margin-left:auto">'+extra+'</span>':'')+'</div></div>';
    }

    // ── Verrekenprijzen (gem. verkoop/inkoop zoals _ehpPrijsblok) ──
    var mb=res.matchedBySrc||{};
    var totMatched=res.totMatchedKwh||0;
    var gemVerkoop=0;
    if(totMatched>0){
      gemVerkoop=((mb.zon||0)*(cfg.pZon||0)+(mb.wind||0)*(cfg.pWind||0)+(mb.overig||0)*(cfg.pOverig||0))/totMatched;
    }
    var gemInkoop=gemVerkoop+(cfg.feeMode!=='dag'?(cfg.fee||0):0);

    // ── PAGINA: Platformoverzicht (neutrale kaarten; groen alleen op kerncijfers) ──
    var kpiHtml='<div class="kg k4">'+
      _ehpRapCard('Deelnemers',res.parties.length,'',' dark')+
      _ehpRapCard('Totaal opwek',_ehpRapMwh(res.totProdKwh),'',' dark')+
      _ehpRapCard('Totaal verbruik',_ehpRapMwh(res.totConsKwh),'',' dark')+
      _ehpRapCard('Intern verrekend',_ehpRapMwh(res.totMatchedKwh),'lokaal benut',' dark')+
      _ehpRapCard('Zelfconsumptie',(res.selfCons||0).toFixed(1)+'%','van opwek','grn')+
      _ehpRapCard('Zelfvoorziening',(res.selfSuff||0).toFixed(1)+'%','van verbruik','grn')+
      _ehpRapCard('Naar net',_ehpRapMwh(res.totGridExpKwh),'overschot opwek',' dark')+
      _ehpRapCard('Van net',_ehpRapMwh(res.totGridImpKwh),'tekort verbruik',' dark')+
    '</div>';

    var prijsHtml='<div class="rsub"><span class="rsub-num">Verrekenprijzen</span>intern afgesproken</div>'+
      '<div class="kg k5">'+
        _ehpRapCard('Zon',_ehpRapCt(cfg.pZon),'intern',' dark')+
        _ehpRapCard('Wind',_ehpRapCt(cfg.pWind),'intern',' dark')+
        _ehpRapCard('Overig',_ehpRapCt(cfg.pOverig),'intern',' dark')+
        (totMatched>0?_ehpRapCard('Gem. verkoopprijs',_ehpRapCt(gemVerkoop),'producent ontvangt',' dark'):'')+
        (totMatched>0?_ehpRapCard('Gem. inkoopprijs',_ehpRapCt(gemInkoop),'afnemer betaalt',' dark'):'')+
      '</div>';

    var simHtml='<div class="rsub"><span class="rsub-num">Gelijktijdigheid</span>opwek &amp; afname</div>'+
      '<div class="kg k6">'+
        _ehpRapCard('Kwartieren overlap',_fmtI(res.nBoth),'opwek én verbruik',' dark')+
        _ehpRapCard('Alleen opwek',_fmtI(res.nProdOnly),'→ naar net',' dark')+
        _ehpRapCard('Alleen verbruik',_fmtI(res.nDemOnly),'→ van net',' dark')+
        _ehpRapCard('Piek-overlap',_fmtI(res.maxMatchKw)+' kW','max. gelijktijdig',' dark')+
        _ehpRapCard('Piek opwek',_fmtI(res.peakProdKw)+' kW','groep',' dark')+
        _ehpRapCard('Piek verbruik',_fmtI(res.peakDemKw)+' kW','groep',' dark')+
      '</div>';

    var pages='<div class="page pb">'+pageHdr+shdr('Platformoverzicht')+
      '<p class="rintro">Het platform <strong>'+_ehpEsc(res.platName)+'</strong> telt '+res.parties.length+' deelnemer'+(res.parties.length!==1?'s':'')+
      '. Hieronder de belangrijkste volumes en gelijktijdigheid, gevolgd door de interne verrekenprijzen.</p>'+
      kpiHtml+prijsHtml+simHtml+
      '<div class="rib2">De interne verrekenprijzen zijn de binnen het collectief afgesproken tarieven waartegen opwek onderling wordt verrekend. De gemiddelde verkoop-/inkoopprijs is gewogen naar het intern verrekende volume per bron.</div>'+
      pageFooter()+'</div>';

    // ── PAGINA('s): Gelijktijdigheid platform (maandtabel; EPEX + forward) ──
    (cap.platGel||[]).forEach(function(g){
      var gl=(g.label||'').replace(/^Gemeenschap\s*[—-]\s*/,'');
      pages+='<div class="page pb">'+pageHdr+shdr('Gelijktijdigheid platform'+(gl?' — '+_ehpEsc(gl):''))+
        '<p class="rintro">Maandoverzicht van de bruto afname, opwek per bron en het gelijktijdig (intern gesaldeerde) volume van de hele gemeenschap, met de bijbehorende gelijktijdigheidspercentages.</p>'+
        '<div class="rchart">'+g.img+'</div>'+
        _ehpGelLegend('platform')+
        pageFooter()+'</div>';
    });

    // ── PAGINA('s): Financieel overzicht (EPEX historisch + forward scenario) ──
    (cap.finBloks||[]).forEach(function(b){
      pages+='<div class="page pb">'+pageHdr+shdr('Financieel overzicht'+(b.label?' — '+_ehpEsc(b.label):''))+
        '<p class="rintro">Kosten en opbrengsten van de gemeenschap, opgesplitst naar afnemers en producenten: gelijktijdigheid, EPEX, platformtarief, GVO en onbalans.</p>'+
        '<div class="rchart">'+b.img+'</div>'+
        pageFooter()+'</div>';
    });

    // ── PAGINA: Energiestromen ──
    if(flowSvg){
      pages+='<div class="page pb">'+pageHdr+shdr('Energiestromen')+
        '<p class="rintro">Schematische weergave van de energiestromen over de hele periode: van opwekbronnen via de interne pool naar de deelnemers, met overschot naar en tekort van het net. Lijndikte ∝ kWh.</p>'+
        '<div class="ehp-flow-box">'+flowSvg+'</div>'+
        '<div class="rib2">De <strong>pool</strong> is het intern verrekende volume ('+_ehpRapMwh(res.totMatchedKwh)+'). Wat niet intern gematcht kan worden, gaat naar het net (overschot) of wordt van het net betrokken (tekort).</div>'+
        pageFooter()+'</div>';
    }

    // ── PAGINA: Weekpatroon gelijktijdigheid & EPEX-prijs ──
    if(cap.gelEpexImg){
      pages+='<div class="page pb">'+pageHdr+shdr('Weekpatroon gelijktijdigheid &amp; EPEX-prijs')+
        '<p class="rintro">Gemiddeld vermogen per kwartier van de week. Groen = opwek gesaldeerd binnen de groep, grijs = overschot teruggeleverd aan het net. De oranje stippellijn is de gemiddelde EPEX-prijs per kwartier (rechter-as).</p>'+
        '<div class="rchart">'+cap.gelEpexImg+'</div>'+
        '<div class="rib2">Zo zie je wanneer de groep eigen opwek benut en tegen welke marktprijs het overschot naar het net weglekt.</div>'+
        pageFooter()+'</div>';
    }

    // ── PAGINA: Markt-mismatchanalyse (urgentie dure inkoop / goedkope teruglevering) ──
    if(cap.urgHeatImg){
      pages+='<div class="page pb">'+pageHdr+shdr('Markt-mismatchanalyse')+
        '<p class="rintro">Deze analyse laat zien waar prijsongunstige markturen samenvallen met relevante energievolumes. Donkere vlakken geven kansvensters aan waar extra opwek, flexibiliteit, opslag of betere lokale benutting mogelijk waarde kan toevoegen. De urgentie is een indicatieve, gecombineerde score van prijsongunstigheid en volume — geen automatische businesscaseberekening.</p>'+
        (cap.urgKpisImg?'<div class="rchart">'+cap.urgKpisImg+'</div>':'')+
        '<div class="rchart">'+cap.urgHeatImg+'</div>'+
        '<div class="rib2">Links: netinkoop tijdens relatief dure EPEX-uren. Rechts: teruglevering tijdens relatief goedkope, zeer lage of negatieve EPEX-uren.</div>'+
        pageFooter()+'</div>';
    }

    // ── PAGINA: Top kansvensters voor verbetering ──
    if(cap.kansenBuckets&&cap.kansenBuckets.length){
      var kansTypeLbl={tekort:'Tekort',tekort_gevoelig:'Tekort · prijsgevoelig',overschot:'Overschot',overschot_gevoelig:'Overschot · prijsgevoelig'};
      var kansColg='<colgroup><col style="width:28%"><col style="width:20%"><col style="width:18%"><col style="width:34%"></colgroup>';
      var kansRows=cap.kansenBuckets.map(function(b){
        var epexTxt=b.avgEpex!=null?_ehpRapCt(b.avgEpex):'—';
        return '<tr><td style="font-weight:700">'+_ehpEsc(b.label)+'</td><td>'+kansTypeLbl[b.type]+'</td>'+
          '<td class="num">'+epexTxt+'</td><td style="font-size:8pt">'+_ehpEsc(b.suggestie)+'</td></tr>';
      }).join('');
      pages+='<div class="page pb">'+pageHdr+shdr('Top kansvensters voor verbetering')+
        '<p class="rintro">Deze analyse vertaalt de mismatch in het platform naar concrete kansvensters. Per venster wordt aangegeven of het vooral gaat om tekort of overschot, en of het moment prijsgevoelig is. De onderstaande vensters zijn indicatief en bedoeld als aanknopingspunt voor vervolgonderzoek — geen automatisch advies.</p>'+
        '<table class="compact">'+kansColg+'<thead><tr><th>Periode</th><th>Type</th><th class="num">Gem. EPEX-prijs</th><th>Suggestie</th></tr></thead>'+
        '<tbody>'+kansRows+'</tbody></table>'+
        pageFooter()+'</div>';
    }

    // ── PAGINA: Deelnemersoverzicht ──
    var colg='<colgroup>'+
      '<col style="width:18%"><col style="width:9%">'+
      '<col style="width:11%"><col style="width:11%"><col style="width:11%"><col style="width:11%">'+
      '<col style="width:10%"><col style="width:10%"><col style="width:9%"></colgroup>';
    var rows=res.parties.map(function(x,idx){
      var zc=x.prodKwh>0?Math.round(x.intSoldKwh/x.prodKwh*100)+'%':'—';
      var zv=x.consKwh>0?Math.round(x.intBoughtKwh/x.consKwh*100)+'%':'—';
      return '<tr>'+
        '<td><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:'+(PAL[idx%PAL.length])+';margin-right:4px;vertical-align:middle"></span>'+_ehpEsc(x.name)+'</td>'+
        '<td>'+(srcLbl[x.source]||x.source)+'</td>'+
        '<td class="num">'+_ehpRapKwh(x.prodKwh)+'</td>'+
        '<td class="num">'+_ehpRapKwh(x.consKwh)+'</td>'+
        '<td class="num">'+_ehpRapKwh(x.intSoldKwh)+'</td>'+
        '<td class="num">'+_ehpRapKwh(x.intBoughtKwh)+'</td>'+
        '<td class="num">'+_ehpRapKwh(x.gridExpKwh)+'</td>'+
        '<td class="num">'+_ehpRapKwh(x.gridImpKwh)+'</td>'+
        '<td class="num">'+zc+' / '+zv+'</td>'+
      '</tr>';
    }).join('');
    var thead='<thead>'+
      '<tr><th class="grp" colspan="2">Deelnemer</th>'+
        '<th class="grp" colspan="6">Volumes (kWh)</th>'+
        '<th class="grp" colspan="1">Match %</th></tr>'+
      '<tr><th>Naam</th><th>Bron</th>'+
        '<th class="num">Opwek</th><th class="num">Verbruik</th>'+
        '<th class="num">Intern<br>verkocht</th><th class="num">Intern<br>gekocht</th>'+
        '<th class="num">Naar net</th><th class="num">Van net</th>'+
        '<th class="num">ZC% / ZV%</th></tr></thead>';
    pages+='<div class="page pb">'+pageHdr+shdr('Deelnemersoverzicht')+
      '<p class="rintro">Per deelnemer de energiestromen over de meetperiode. <strong>ZC%</strong> = zelfconsumptie (deel van de opwek dat intern wordt afgenomen). <strong>ZV%</strong> = zelfvoorzieningsgraad (deel van het verbruik dat intern wordt gedekt).</p>'+
      '<table class="compact">'+colg+thead+'<tbody>'+rows+'</tbody></table>'+
      '<div class="rib2">Intern verkocht = opwek die rechtstreeks aan een andere deelnemer geleverd wordt. Intern gekocht = verbruik dat van een andere deelnemer afgenomen wordt in plaats van van het net.</div>'+
      pageFooter()+'</div>';

    // ── PAGINA('s) per deelnemer (params + flows, en financieel + gelijktijdigheid) ──
    res.parties.forEach(function(x,idx){
      pages+=buildMemberPage(x,res,num,idx,cap);
    });

    return pages;
  }

  // ─── Eén pagina per deelnemer ─────────────────────────────────
  function buildMemberPage(x,res,num,idx,cap){
    var isProducer=x.prodKwh>0&&x.source!=='none';
    var isMixed=isProducer&&x.consKwh>0;

    // Percentages
    var zc=x.prodKwh>0?x.intSoldKwh/x.prodKwh*100:0;
    var zv=x.consKwh>0?x.intBoughtKwh/x.consKwh*100:0;
    var demCovNet=x.consKwh>0?x.gridImpKwh/x.consKwh*100:0;
    var prodToNet=x.prodKwh>0?x.gridExpKwh/x.prodKwh*100:0;

    // Rol-badge
    var rol=isProducer?(isMixed?'Opwekker + afnemer':'Opwekker'):'Afnemer';
    var badge='<span class="rsh-badge" style="margin-left:auto">'+rol+'</span>';

    // Intro-tekst
    var introTxt;
    if(isProducer&&isMixed){
      introTxt='<strong>'+_ehpEsc(x.name)+'</strong> wekt energie op én verbruikt energie. '+
        'Van de opwek gaat <strong>'+zc.toFixed(0)+'%</strong> ('+_ehpRapKwh(x.intSoldKwh)+' kWh) intern naar andere deelnemers en '+
        prodToNet.toFixed(0)+'% ('+_ehpRapKwh(x.gridExpKwh)+' kWh) terug naar het net. '+
        'Van het verbruik wordt <strong>'+zv.toFixed(0)+'%</strong> ('+_ehpRapKwh(x.intBoughtKwh)+' kWh) intern gedekt en '+
        demCovNet.toFixed(0)+'% ('+_ehpRapKwh(x.gridImpKwh)+' kWh) van het net betrokken.';
    }else if(isProducer){
      introTxt='<strong>'+_ehpEsc(x.name)+'</strong> levert opwek aan het platform. '+
        'Van de totale opwek van '+_ehpRapKwh(x.prodKwh)+' kWh gaat <strong>'+zc.toFixed(0)+'%</strong> ('+_ehpRapKwh(x.intSoldKwh)+' kWh) intern en '+
        prodToNet.toFixed(0)+'% ('+_ehpRapKwh(x.gridExpKwh)+' kWh) terug naar het net.';
    }else{
      introTxt='<strong>'+_ehpEsc(x.name)+'</strong> neemt energie af van het platform. '+
        'Van het totale verbruik van '+_ehpRapKwh(x.consKwh)+' kWh wordt <strong>'+zv.toFixed(0)+'%</strong> ('+_ehpRapKwh(x.intBoughtKwh)+' kWh) intern betrokken en '+
        demCovNet.toFixed(0)+'% ('+_ehpRapKwh(x.gridImpKwh)+' kWh) van het net.';
    }

    // KPI-cards — params (neutraal; groen alleen op de zelfconsumptie/zelfvoorziening)
    var kpiCards='<div class="kg '+(isMixed?'k6':'k4')+'">'+
      (x.prodKwh>0?_ehpRapCard('Opwek',_ehpRapMwh(x.prodKwh),'totale productie',' dark'):'')+
      (x.consKwh>0?_ehpRapCard('Verbruik',_ehpRapMwh(x.consKwh),'totaal verbruik',' dark'):'')+
      (x.prodKwh>0?_ehpRapCard('Zelfconsumptie opwek',zc.toFixed(0)+'%','intern geleverd','grn'):'')+
      (x.consKwh>0?_ehpRapCard('Zelfvoorzieningsgraad',zv.toFixed(0)+'%','intern betrokken','grn'):'')+
      (x.gridExpKwh>0?_ehpRapCard('Teruggeleverd net',_ehpRapMwh(x.gridExpKwh),'overschot opwek',' dark'):'')+
      (x.gridImpKwh>0?_ehpRapCard('Betrokken net',_ehpRapMwh(x.gridImpKwh),'tekort verbruik',' dark'):'')+
    '</div>';

    // Dekkingsbalken
    var consBar=x.consKwh>0?
      '<div style="margin-bottom:4px;font-size:8.5pt;font-weight:700;color:#555">Hoe wordt het verbruik gedekt?</div>'+
      '<div class="ehp-bar"><span style="width:'+zv.toFixed(1)+'%;background:#5fb3df"></span><span style="width:'+demCovNet.toFixed(1)+'%;background:#bbb"></span></div>'+
      '<div class="ehp-bar-lbl">'+zv.toFixed(0)+'% intern ('+_ehpRapKwh(x.intBoughtKwh)+' kWh) · '+demCovNet.toFixed(0)+'% net ('+_ehpRapKwh(x.gridImpKwh)+' kWh)</div>':'';
    var prodBar=x.prodKwh>0?
      '<div style="margin-top:10px;margin-bottom:4px;font-size:8.5pt;font-weight:700;color:#555">Waar gaat de opwek naartoe?</div>'+
      '<div class="ehp-bar"><span style="width:'+zc.toFixed(1)+'%;background:#46962b"></span><span style="width:'+prodToNet.toFixed(1)+'%;background:#bbb"></span></div>'+
      '<div class="ehp-bar-lbl">'+zc.toFixed(0)+'% intern ('+_ehpRapKwh(x.intSoldKwh)+' kWh) · '+prodToNet.toFixed(0)+'% net ('+_ehpRapKwh(x.gridExpKwh)+' kWh)</div>':'';

    // Platform-aandeel toelichting
    var totaalFlow=x.prodKwh+x.consKwh;
    var internFlow=x.intSoldKwh+x.intBoughtKwh;
    var internPct=totaalFlow>0?Math.round(internFlow/totaalFlow*100):0;
    var internTxt='<div class="rib2" style="margin-top:10px">'+
      'Van het totale energievolume van deze deelnemer ('+_ehpRapKwh(totaalFlow)+' kWh) wordt '+
      '<strong>'+internPct+'%</strong> intern via het platform verrekend — de rest loopt via het net.'+
    '</div>';

    // Volumes-tabel (met subtitels)
    function r2(lbl,v,sub){
      return '<tr><td>'+lbl+(sub?'<div style="font-size:7.5pt;color:#aaa;margin-top:1px">'+sub+'</div>':'')+'</td><td class="num">'+v+'</td></tr>';
    }
    var kwhRows='';
    if(x.prodKwh>0)kwhRows+=r2('Totale opwek',_ehpRapKwh(x.prodKwh)+' kWh');
    if(x.consKwh>0)kwhRows+=r2('Totaal verbruik',_ehpRapKwh(x.consKwh)+' kWh');
    if(x.intSoldKwh>0)kwhRows+=r2('Intern geleverd',_ehpRapKwh(x.intSoldKwh)+' kWh','aan andere deelnemers');
    if(x.intBoughtKwh>0)kwhRows+=r2('Intern betrokken',_ehpRapKwh(x.intBoughtKwh)+' kWh','van andere deelnemers');
    if(x.gridExpKwh>0)kwhRows+=r2('Teruggeleverd aan net',_ehpRapKwh(x.gridExpKwh)+' kWh','overschot opwek');
    if(x.gridImpKwh>0)kwhRows+=r2('Betrokken van net',_ehpRapKwh(x.gridImpKwh)+' kWh','tekort verbruik');
    var kwhTbl='<table><thead><tr><th>Energiestroom</th><th class="num">Volume</th></tr></thead><tbody>'+kwhRows+'</tbody></table>';

    // ── Pagina A: parameters + verdeling energiestromen + jaarfactuur ──
    // Jaarfactuur (smalle tabel) compact in de rechterkolom; valt terug op de
    // volumetabel als er geen factuur is. Zo blijft het op één liggende pagina passen.
    var factImg=(cap&&cap.factuur)?cap.factuur[x.name]:'';
    var rightCol=factImg
      ? '<div class="rsub" style="margin-top:0"><span class="rsub-num">Jaarfactuur</span>kostenuitsplitsing</div>'+
        '<div class="rchart" style="margin:0">'+factImg+'</div>'
      : '<div class="rsub" style="margin-top:0"><span class="rsub-num">Volumes</span>kWh over de meetperiode</div>'+kwhTbl;
    var pageA='<div class="page pb">'+pageHdr+
      '<div class="rsh"><div class="rsh-n">'+num+'</div><div class="rsh-t">Deelnemer — '+_ehpEsc(x.name)+badge+'</div></div>'+
      '<p class="rintro">'+introTxt+'</p>'+
      kpiCards+
      '<div class="ehp-pc-grid">'+
        '<div>'+
          '<div class="rsub" style="margin-top:0"><span class="rsub-num">Verdeling</span>energiestromen</div>'+
          consBar+prodBar+
          internTxt+
        '</div>'+
        '<div>'+rightCol+'</div>'+
      '</div>'+
      pageFooter()+'</div>';

    // ── Pagina('s): gelijktijdigheidstabel — afname en/of teruglevering ──
    // Elke (brede) maandtabel krijgt een eigen volle-breedte pagina. Afname-invoeders
    // hebben er twee: de afnamezijde én de terugleverzijde.
    var gel=(cap&&cap.memberGel)?cap.memberGel[x.name]:null;
    var gelAfn=gel?gel.afname:'';
    var gelInv=gel?gel.invoed:'';
    var both=!!(gelAfn&&gelInv);
    function gelPage(img,sub,ctx){
      return '<div class="page pb">'+pageHdr+
        '<div class="rsh"><div class="rsh-n">'+num+'</div><div class="rsh-t">Deelnemer — '+_ehpEsc(x.name)+
          '<span class="rsh-badge" style="margin-left:auto">Gelijktijdigheid'+(sub?' — '+sub:'')+'</span></div></div>'+
        '<p class="rintro">Maandoverzicht van de gelijktijdigheid van <strong>'+_ehpEsc(x.name)+'</strong>'+
        (sub?' ('+sub+')':'')+': bruto afname, opwek per bron en het intern gesaldeerde volume met de bijbehorende percentages.</p>'+
        '<div class="rchart">'+img+'</div>'+
        _ehpGelLegend(ctx)+
        pageFooter()+'</div>';
    }
    var gelPages='';
    if(gelAfn)gelPages+=gelPage(gelAfn,both?'afname':'','afnemers');
    if(gelInv)gelPages+=gelPage(gelInv,both?'teruglevering':'','invoeders');

    return pageA+gelPages;
  }
}

// ─── Rapport-capture van bestaande UI-componenten ──────────────
// We hergebruiken de live app-componenten (gelijktijdigheidstabellen, financieel
// overzicht, jaarfactuur) door hun HTML in een verborgen, met de app-CSS gestylede
// container te renderen en de losse onderdelen met html-to-image vast te leggen.
// Zo blijven cijfers en opmaak exact gelijk aan wat de gebruiker in de app ziet.
function _ehpRapMkScratch(html,width){
  var box=document.createElement('div');
  box.style.cssText='position:fixed;left:-99999px;top:0;width:'+(width||1180)+'px;background:#fff;padding:0;z-index:-1';
  box.innerHTML=html;
  document.body.appendChild(box);
  return box;
}

// Render `html`, leg elk element dat op `selector` matcht vast als <img>. Geeft
// [{label, img}] terug (label = tekst van een eventuele blok-koptekst).
async function _ehpRapCapturePieces(html,selector,width){
  if(!html)return [];
  var box=_ehpRapMkScratch(html,width);
  var out=[];
  try{
    var els=box.querySelectorAll(selector);
    for(var i=0;i<els.length;i++){
      var hdr=els[i].querySelector('.ehp-ov-blok-hdr,.gel-blok-hdr');
      var img=await _rapCihEl(els[i],width||1180);
      if(img)out.push({label:hdr?hdr.textContent.trim():'',img:img});
    }
  }catch(e){console.error('_ehpRapCapturePieces:',e);}
  finally{try{document.body.removeChild(box);}catch(e){}}
  return out;
}

// Gelijktijdigheidstabellen: platform (EPEX + forward) en per deelnemer (op naam).
async function _ehpRapCaptureGel(res){
  var out={platform:[],members:{}};
  var html;
  try{html=_ehpGelijktijdheidHtml(res);}catch(e){console.error('_ehpGelijktijdheidHtml:',e);return out;}
  if(!html)return out;
  var box=_ehpRapMkScratch(html,2000);
  // Alle panelen zichtbaar maken: anders worden tabellen uit een verborgen tab-paneel
  // niet op volle breedte uitgelijnd en komen ze smal/leeg uit de capture.
  [].slice.call(box.querySelectorAll('[data-gel-pane]')).forEach(function(p){p.hidden=false;p.style.display='block';});
  // overflow-wrappers tonen zodat brede maandtabellen niet worden afgekapt
  [].slice.call(box.querySelectorAll('div')).forEach(function(d){
    if(d.style&&(d.style.overflowX==='auto'||d.style.overflow==='hidden'))d.style.overflowX=d.style.overflow='visible';
  });
  [].slice.call(box.querySelectorAll('.gel-blok')).forEach(function(b){b.style.overflow='visible';});
  function ensure(nm){if(!out.members[nm])out.members[nm]={afname:'',invoed:''};return out.members[nm];}
  // De tabel heeft 11 kolommen met nowrap-koppen → van nature breder dan een pagina.
  // Meet de natuurlijke breedte (max-content) en leg de hele tabel op die breedte vast,
  // zodat álle kolommen meekomen; de <img> schaalt daarna naar de paginabreedte.
  async function capGel(el){
    var w=1180,tbl=el.querySelector('table.gel-tbl');
    if(tbl){
      var prev=tbl.style.width;
      tbl.style.width='max-content';
      void tbl.getBoundingClientRect();
      var nat=Math.ceil(tbl.getBoundingClientRect().width);
      tbl.style.width=prev;
      if(nat>0)w=Math.min(2400,Math.max(1180,nat+28));
    }
    return await _rapCihEl(el,w);
  }
  try{
    var plats=box.querySelectorAll('[data-gel-pane="platform"] .gel-blok--platform');
    for(var i=0;i<plats.length;i++){
      var h=plats[i].querySelector('.gel-blok-hdr');
      var img=await capGel(plats[i]);
      if(img)out.platform.push({label:h?h.textContent.trim():'',img:img});
    }
    // Afnemers-tabel (afnamezijde) per deelnemer.
    var afn=box.querySelectorAll('[data-gel-pane="afnemers"] .gel-blok--afnemers');
    for(var k=0;k<afn.length;k++){
      var h2=afn[k].querySelector('.gel-blok-hdr');
      var nm=h2?h2.textContent.trim():'';
      if(!nm)continue;
      var img2=await capGel(afn[k]);
      if(img2)ensure(nm).afname=img2;
    }
    // Invoeder-tabel (terugleverzijde) per deelnemer — bij afname-invoeders náást de afnametabel.
    var inv=box.querySelectorAll('[data-gel-pane="invoeders"] .gel-blok--invoeders');
    for(var m=0;m<inv.length;m++){
      var h3=inv[m].querySelector('.gel-blok-hdr');
      var nm3=h3?h3.textContent.trim():'';
      nm3=nm3.replace(/^Afname-Invoeden\s*-\s*/i,'').trim();   // invoeder-label → naam
      if(!nm3)continue;
      var img3=await capGel(inv[m]);
      if(img3)ensure(nm3).invoed=img3;
    }
  }catch(e){console.error('_ehpRapCaptureGel:',e);}
  finally{try{document.body.removeChild(box);}catch(e){}}
  return out;
}

// Jaarfactuur per deelnemer: kaarten gekoppeld op deelnemernaam.
async function _ehpRapCaptureFactuur(res){
  var out={};
  var html;
  try{html=_ehpFactuurHtml(res);}catch(e){console.error('_ehpFactuurHtml:',e);return out;}
  if(!html)return out;
  var box=_ehpRapMkScratch(html,720);
  // Grid neutraliseren zodat elke kaart op volle containerbreedte ligt (geen kolomsplitsing).
  [].slice.call(box.querySelectorAll('.ehp-party-grid')).forEach(function(g){g.style.display='block';});
  try{
    var cards=box.querySelectorAll('.ehp-party-card');
    for(var i=0;i<cards.length;i++){
      var nmEl=cards[i].querySelector('.ehp-party-name');
      var nm=nmEl?((nmEl.firstChild&&nmEl.firstChild.textContent)||nmEl.textContent||'').trim():'';
      if(!nm)continue;
      var img=await _rapCihEl(cards[i],700);
      if(img)out[nm]=img;
    }
  }catch(e){console.error('_ehpRapCaptureFactuur:',e);}
  finally{try{document.body.removeChild(box);}catch(e){}}
  return out;
}

// ─── Kolomtoelichting bij de gelijktijdigheidstabellen ─────────
// Betekenis per context (platform / afnemers / invoeders), spiegelt de tooltips
// die de app bij deze kolommen toont (GEL_COLS in ehp.js).
var _EHP_GEL_LEGENDE=[
  {l:'Bruto afname MWh',
    p:'Totale elektriciteitsvraag van de groep, vóór salderen.',
    a:'Vraag van deze deelnemer, vóór salderen.',
    i:'Intern gesaldeerd (gematcht) volume van de invoeder.'},
  {l:'Afname-INVOEDEN MWh',
    p:'Opwek van afname-invoeders: levering aan de groep zonder aparte zon/wind-asset.',
    a:'Eigen invoeding van deze deelnemer als afname-invoeder.',
    i:'Productie van de invoeder — alleen bij afname-invoeders.'},
  {l:'Productie Zon MWh',
    p:'Totale zonopwek binnen de groep.',
    a:'Toegerekende zonopwek (naar rato) plus eventuele eigen zon-asset.',
    i:'Zonopwek van de invoeder — alleen bij een zon-asset.'},
  {l:'Productie Wind MWh',
    p:'Totale windopwek binnen de groep.',
    a:'Toegerekende windopwek (naar rato) plus eventuele eigen wind-asset.',
    i:'Windopwek van de invoeder — alleen bij een wind-asset.'},
  {l:'Gelijktijdig INVOEDEN MWh',
    p:'Afname-invoeding die gelijktijdig binnen de groep is benut (gesaldeerd).',
    a:'Invoeding gematcht aan de vraag van deze deelnemer.',
    i:'Eigen invoeding die gelijktijdig is benut — alleen bij afname-invoeders.'},
  {l:'Gelijktijdig totaal MWh',
    p:'Totale opwek (zon + wind + invoeden) die gelijktijdig binnen de groep is verbruikt.',
    a:'Opwek gelijktijdig met de vraag van deze deelnemer (gesaldeerd).',
    i:'Volume van de invoeder dat gelijktijdig binnen de groep is benut.'},
  {l:'Gelijktijdigheid afnemer %',
    p:'Bruto afname gedekt door gelijktijdige opwek (gesaldeerd ÷ bruto afname).',
    a:'Vraag van deze deelnemer gedekt door gelijktijdige opwek.',
    i:'Niet van toepassing op invoeders.'},
  {l:'Gelijk zonopwek %',
    p:'Zonopwek gelijktijdig benut (gematchte zon ÷ productie zon).',
    a:'Toegerekende zonopwek die gelijktijdig is benut.',
    i:'Zonopwek van de invoeder gelijktijdig benut — alleen bij zon-assets.'},
  {l:'Gelijk windopwek %',
    p:'Windopwek gelijktijdig benut (gematchte wind ÷ productie wind).',
    a:'Toegerekende windopwek die gelijktijdig is benut.',
    i:'Windopwek van de invoeder gelijktijdig benut — alleen bij wind-assets.'},
  {l:'Interne Gelijktijdigheid %',
    p:'Afname-invoeding die intern is gesaldeerd (gematchte invoeding ÷ totale invoeding).',
    a:'Eigen invoeding van deze deelnemer die intern is gesaldeerd.',
    i:'Invoeding van de invoeder intern benut — alleen bij afname-invoeders.'}
];
function _ehpGelLegend(ctx){
  var key=ctx==='afnemers'?'a':(ctx==='invoeders'?'i':'p');
  var items=_EHP_GEL_LEGENDE.map(function(c){
    return '<div style="break-inside:avoid;-webkit-column-break-inside:avoid;margin-bottom:3px">'+
      '<strong style="color:#242b38">'+c.l+'</strong> — '+c[key]+'</div>';
  }).join('');
  return '<div class="rib2" style="margin-top:10px">'+
    '<div style="font-weight:700;margin-bottom:5px">Toelichting kolommen</div>'+
    '<div style="column-count:2;column-gap:20px;font-size:8pt;line-height:1.45">'+
    '<div style="break-inside:avoid;-webkit-column-break-inside:avoid;margin-bottom:3px"><strong style="color:#242b38">Maand</strong> — kalendermaand; de rij <em>Totaal</em> is de som over de meetperiode.</div>'+
    items+'</div></div>';
}

// ─── Wiring ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded',function(){
  [document.getElementById('btnRapportEhp'),document.getElementById('btnRapportEhpHome')].forEach(function(b){
    if(b)b.addEventListener('click',openEhpRapportModal);
  });
  var g=document.getElementById('btnGenEhpRap');
  if(g)g.addEventListener('click',function(){generateEhpRapport();});
  ['btnCloseEhpRapOpts','btnCloseEhpRapOpts2'].forEach(function(id){
    var el=document.getElementById(id);
    if(el)el.addEventListener('click',function(){hideM('mEhpRapOpts');});
  });
});
