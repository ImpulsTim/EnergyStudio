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
function _ehpRapEurAbs(n){
  if(n==null||isNaN(n))return'—';
  return '€ '+Math.abs(Math.round(n)).toLocaleString('nl-NL');
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
  var srcLbl={zon:'Zon',wind:'Wind',overig:'Overig',none:'Alleen afnemer'};

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

    // Activeer + bereken (selectEhp commit het vorige platform correct vanuit het formulier).
    // calcEHP zet _ehpJrLast op null en start zelf (fire-and-forget) de jaarrekening; we
    // wachten tot díe klaar is i.p.v. een tweede te starten (anders racet de opwekanalyse-render).
    selectEhp(id);
    try{await calcEHP();}catch(e){console.error('calcEHP('+id+'):',e);continue;}
    for(var w=0;w<80&&!_ehpJrLast;w++){await new Promise(function(r){setTimeout(r,50);});}
    var res=_ehpLast;
    if(!res||!res.parties||!res.parties.length)continue;
    var jr=_ehpJrLast;

    if(!coverPeriode&&res.ts&&res.ts.length)
      coverPeriode=fmtDate(res.ts[0])+' t/m '+fmtDate(res.ts[res.ts.length-1]);

    // Grafieken vastleggen
    var flowSvg='';
    try{flowSvg=_ehpFlowSvg(res);}catch(e){console.error('flowSvg:',e);}
    var weekImg=await _rapCi('cEhpPlatWeek',200);
    var monthImg=await _rapCi('cEhpPlatMonth',200);

    // Opwekanalyse per opwekker
    var producers=(jr&&jr.r&&jr.r.perCompany)?jr.r.perCompany.filter(function(c){return c.source!=='none';}):[];
    var oaPages=[];
    for(var qi=0;qi<producers.length;qi++){
      var prod=producers[qi];
      try{_ehpDrawOpwekAnalyse(prod.id,null);}catch(e){console.error('drawOA:',e);}
      await new Promise(function(r){setTimeout(r,70);});
      var oaImg=await _rapCi('ehpOaCanvas',200);
      var oaSum=await _rapCihEl(document.getElementById('ehpOaSummary'),1040,'width:100%;max-width:100%;height:auto;display:block;margin:6px auto 0');
      oaPages.push({name:prod.name,src:prod.source,img:oaImg,sum:oaSum});
    }

    sections.push(buildPlatformSection(res,jr,flowSvg,weekImg,monthImg,oaPages,pi+1));
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
  function buildPlatformSection(res,jr,flowSvg,weekImg,monthImg,oaPages,num){
    var cfg=res.cfg||{};
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

    // ── PAGINA: Platformoverzicht ──
    var kpiHtml='<div class="kg k4">'+
      _ehpRapCard('Deelnemers',res.parties.length,'',' dark')+
      _ehpRapCard('Totaal opwek',_ehpRapMwh(res.totProdKwh),'',' dark')+
      _ehpRapCard('Totaal verbruik',_ehpRapMwh(res.totConsKwh),'',' dark')+
      _ehpRapCard('Intern verrekend',_ehpRapMwh(res.totMatchedKwh),'lokaal benut','grn')+
      _ehpRapCard('Zelfconsumptie',(res.selfCons||0).toFixed(1)+'%','van opwek','grn')+
      _ehpRapCard('Zelfvoorziening',(res.selfSuff||0).toFixed(1)+'%','van verbruik','grn')+
      _ehpRapCard('Naar net',_ehpRapMwh(res.totGridExpKwh),'overschot opwek',' dark')+
      _ehpRapCard('Van net',_ehpRapMwh(res.totGridImpKwh),'tekort verbruik',' dark')+
    '</div>';

    var prijsHtml='<div class="rsub"><span class="rsub-num">Verrekenprijzen</span>intern afgesproken</div>'+
      '<div class="kg k5">'+
        _ehpRapCard('Zon',_ehpRapCt(cfg.pZon),'intern','acc')+
        _ehpRapCard('Wind',_ehpRapCt(cfg.pWind),'intern','acc')+
        _ehpRapCard('Overig',_ehpRapCt(cfg.pOverig),'intern','acc')+
        (totMatched>0?_ehpRapCard('Gem. verkoopprijs',_ehpRapCt(gemVerkoop),'producent ontvangt','grn'):'')+
        (totMatched>0?_ehpRapCard('Gem. inkoopprijs',_ehpRapCt(gemInkoop),'afnemer betaalt','grn'):'')+
      '</div>';

    var simHtml='<div class="rsub"><span class="rsub-num">Gelijktijdigheid</span>opwek &amp; afname</div>'+
      '<div class="kg k6">'+
        _ehpRapCard('Kwartieren overlap',_fmtI(res.nBoth),'opwek én verbruik',' dark')+
        _ehpRapCard('Alleen opwek',_fmtI(res.nProdOnly),'→ naar net',' dark')+
        _ehpRapCard('Alleen verbruik',_fmtI(res.nDemOnly),'→ van net',' dark')+
        _ehpRapCard('Piek-overlap',_fmtI(res.maxMatchKw)+' kW','max. gelijktijdig','grn')+
        _ehpRapCard('Piek opwek',_fmtI(res.peakProdKw)+' kW','groep',' dark')+
        _ehpRapCard('Piek verbruik',_fmtI(res.peakDemKw)+' kW','groep',' dark')+
      '</div>';

    var pages='<div class="page pb">'+pageHdr+shdr('Platformoverzicht')+
      '<p class="rintro">Het platform <strong>'+_ehpEsc(res.platName)+'</strong> telt '+res.parties.length+' deelnemer'+(res.parties.length!==1?'s':'')+
      '. Hieronder de belangrijkste volumes en gelijktijdigheid, gevolgd door de interne verrekenprijzen.</p>'+
      kpiHtml+prijsHtml+simHtml+
      '<div class="rib2">De interne verrekenprijzen zijn de binnen het collectief afgesproken tarieven waartegen opwek onderling wordt verrekend. De gemiddelde verkoop-/inkoopprijs is gewogen naar het intern verrekende volume per bron.</div>'+
      pageFooter()+'</div>';

    // ── PAGINA: Energiestromen ──
    if(flowSvg){
      pages+='<div class="page pb">'+pageHdr+shdr('Energiestromen')+
        '<p class="rintro">Schematische weergave van de energiestromen over de hele periode: van opwekbronnen via de interne pool naar de deelnemers, met overschot naar en tekort van het net. Lijndikte ∝ kWh.</p>'+
        '<div class="ehp-flow-box">'+flowSvg+'</div>'+
        '<div class="rib2">De <strong>pool</strong> is het intern verrekende volume ('+_ehpRapMwh(res.totMatchedKwh)+'). Wat niet intern gematcht kan worden, gaat naar het net (overschot) of wordt van het net betrokken (tekort).</div>'+
        pageFooter()+'</div>';
    }

    // ── PAGINA: Week- en maandpatroon ──
    if(weekImg||monthImg){
      pages+='<div class="page pb">'+pageHdr+shdr('Inkoop &amp; teruglevering — week en maand')+
        (weekImg?'<div class="rchart"><h3>Weekpatroon — gemiddeld nettovermogen per kwartier (kW)</h3>'+weekImg+'</div>':'')+
        (monthImg?'<div class="rchart"><h3>Maandpatroon — inkoop van net en teruglevering aan net (kWh)</h3>'+monthImg+'</div>':'')+
        '<div class="rib2">Blauw = inkoop van het net (vraag &gt; aanbod), groen = teruglevering aan het net (aanbod &gt; vraag), gemeten op platformniveau.</div>'+
        pageFooter()+'</div>';
    }

    // ── PAGINA('s): Opwekanalyse intern vs. markt (per opwekker) ──
    (oaPages||[]).forEach(function(oa){
      if(!oa.img)return;
      pages+='<div class="page pb">'+pageHdr+shdr('Opwekanalyse — '+_ehpEsc(oa.name))+
        '<p class="rintro">Weekpatroon van opwekker <strong>'+_ehpEsc(oa.name)+'</strong> ('+(srcLbl[oa.src]||oa.src)+'): groen = intern geleverd aan de groep, grijs = teruggeleverd aan het net, met percentage intern en — indien EPEX geladen — de gemiddelde marktprijs.</p>'+
        '<div class="rchart"><h3>Intern geleverd vs. teruglevering aan net</h3>'+oa.img+'</div>'+
        (oa.sum?'<div class="rchart" style="margin-top:4px">'+oa.sum+'</div>':'')+
        pageFooter()+'</div>';
    });

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

    // ── PAGINA per deelnemer: energiestromen ──
    res.parties.forEach(function(x,idx){
      pages+=buildMemberPage(x,res,num,idx);
    });

    return pages;
  }

  // ─── Eén pagina per deelnemer ─────────────────────────────────
  function buildMemberPage(x,res,num,idx){
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

    // KPI-cards (geen financieel)
    var kpiCards='<div class="kg '+(isMixed?'k6':'k4')+'">'+
      (x.prodKwh>0?_ehpRapCard('Opwek',_ehpRapMwh(x.prodKwh),'totale productie','grn'):'')+
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

    return '<div class="page pb">'+pageHdr+
      '<div class="rsh"><div class="rsh-n">'+num+'</div><div class="rsh-t">Deelnemer — '+_ehpEsc(x.name)+badge+'</div></div>'+
      '<p class="rintro">'+introTxt+'</p>'+
      kpiCards+
      '<div class="ehp-pc-grid">'+
        '<div>'+
          '<div class="rsub" style="margin-top:0"><span class="rsub-num">Verdeling</span>energiestromen</div>'+
          consBar+prodBar+
          internTxt+
        '</div>'+
        '<div>'+
          '<div class="rsub" style="margin-top:0"><span class="rsub-num">Volumes</span>kWh over de meetperiode</div>'+
          kwhTbl+
        '</div>'+
      '</div>'+
      pageFooter()+'</div>';
  }
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
