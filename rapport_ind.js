// ─── Individueel rapport ────────────────────────────────────────
// Losstaand rapport voor de individuele aansluitingsanalyse. Hergebruikt de
// gedeelde huisstijl/bouwstenen uit rapport.js (rapportCss, _rapCi,
// _fmtI/_fmtN/_fmtDate) en de gedeelde preview-modal (#mRap / #rPreview).
// Geen kaart op de cover (bewuste keuze — dit rapport gaat over één aansluiting,
// niet over de geografische spreiding van het project). De rekenkern + live
// grafieken komen uit individueel.js /
// charts/individueel.js: per aansluiting selecteren we die, draaien de analyse en
// leggen de verse grafieken offscreen vast — zelfde werkwijze als het EHP-rapport.

var _IND_RAP_SECTION_IDS=['kengetallen','congestie','jaar','week','maand','bdk'];

function _indRapSectionMap(ids){
  var all=!Array.isArray(ids);
  var pick={};(ids||[]).forEach(function(id){pick[id]=true;});
  var out={};_IND_RAP_SECTION_IDS.forEach(function(id){out[id]=all||!!pick[id];});
  return out;
}

function _indRapMoment(ts){
  if(!ts)return'—';
  var parts=String(ts).split(/[T ]/);
  var tijd=parts[1]?parts[1].slice(0,5):'';
  return _fmtDate(ts)+(tijd?', '+tijd:'');
}
function _indRapCard(l,v,u,cls){
  cls=cls||'';
  return '<div class="kb '+cls.trim()+'"><div class="kl">'+l+'</div>'+
    '<div class="kv '+cls.trim()+'" style="font-size:13pt">'+v+'</div>'+
    (u?'<div class="ku">'+u+'</div>':'')+'</div>';
}
function _indRapCardSm(l,v){
  return '<div class="kb"><div class="kl">'+l+'</div>'+
    '<div class="kv" style="font-size:9.5pt;line-height:1.3">'+v+'</div></div>';
}
function _indRapPeakRows(list,gtv,heeftGtv){
  if(!list||!list.length||list[0].kw<=0)
    return '<tr><td colspan="5" style="text-align:center;color:#aaa">Geen pieken</td></tr>';
  return list.map(function(p,i){
    var over=heeftGtv&&p.kw>gtv;
    var diff=over?('+'+_fmtN(p.kw-gtv,1)):'—';
    return '<tr'+(over?' style="background:#fdf3e8"':'')+'><td>'+(i+1)+'</td><td>'+_indRapMoment(p.ts)+'</td>'+
      '<td class="num"><strong>'+_fmtN(p.kw,1)+'</strong></td>'+
      '<td class="num">'+(heeftGtv?_fmtI(gtv):'—')+'</td>'+
      '<td class="num">'+diff+'</td></tr>';
  }).join('');
}

// ─── Modal: aansluiting-selectie ────────────────────────────────
function openIndRapportModal(){
  var conns=_indConns();
  if(!conns.length){notify('Voeg eerst een elektrische aansluiting toe',false);return;}
  document.getElementById('indRapConnList').innerHTML=conns.map(function(c){
    return '<label class="rap-opt-lbl" style="display:flex;align-items:center;gap:8px;border:1px solid #dce6e0;border-radius:6px;padding:8px 10px;margin-bottom:6px;font-weight:600">'+
      '<input type="checkbox" class="indrap-chk" data-id="'+c.id+'" checked> '+
      '<span style="flex:1">'+_indEsc(c.name||'Aansluiting')+'</span>'+
      '<span style="font-size:11px;color:#888;font-weight:400">GTV '+(+c.gtvA||0)+' kW</span>'+
    '</label>';
  }).join('');
  var allBtn=document.getElementById('btnIndRoptAll'), noneBtn=document.getElementById('btnIndRoptNone');
  if(allBtn)allBtn.onclick=function(){[].slice.call(document.querySelectorAll('.indrap-chk')).forEach(function(c){c.checked=true;});};
  if(noneBtn)noneBtn.onclick=function(){[].slice.call(document.querySelectorAll('.indrap-chk')).forEach(function(c){c.checked=false;});};
  [].slice.call(document.querySelectorAll('.indrap-sec')).forEach(function(c){c.checked=true;});
  showM('mIndRapOpts');
}

async function generateIndRapport(){
  var btn=document.getElementById('btnGenIndRap');
  var orig=btn?btn.textContent:'';
  if(btn){btn.textContent='Bezig…';btn.disabled=true;}
  try{
    var ids=[].slice.call(document.querySelectorAll('.indrap-chk:checked')).map(function(el){return el.dataset.id;});
    if(!ids.length){notify('Selecteer minimaal één aansluiting',false);return;}
    var sections=[].slice.call(document.querySelectorAll('.indrap-sec:checked')).map(function(el){return el.dataset.section;});
    if(!sections.length){notify('Selecteer minimaal één rapportonderdeel',false);return;}
    var html=await buildIndRapport({conns:ids,sections:sections});
    var iframe=document.getElementById('rPreview');
    var doc=iframe.contentDocument||iframe.contentWindow.document;
    doc.open();doc.write(html);doc.close();
    hideM('mIndRapOpts');showM('mRap');
    notify('Individueel rapport klaar');
  }catch(e){notify('Rapport mislukt: '+e.message,false);console.error(e);}
  finally{if(btn){btn.textContent=orig||'Rapport genereren';btn.disabled=false;}}
}

// ─── Hoofdfunctie ───────────────────────────────────────────────
async function buildIndRapport(opts){
  var proj=ap();
  if(!proj)throw new Error('Geen actief project');
  var ids=(opts&&opts.conns)||[];
  if(!ids.length)throw new Error('Geen aansluiting geselecteerd');
  var sec=_indRapSectionMap(opts&&opts.sections);
  var datum=new Date().toLocaleDateString('nl-NL',{day:'numeric',month:'long',year:'numeric'});
  var logoUrl='https://www.impulszeeland.nl/assets/img/logo.svg';
  var origSel=_indSelId;

  // Rapporttitel = aansluiting(en), niet het project — projectnaam blijft wel als
  // dataregel op de cover staan (zie cover-info hieronder).
  var connNames=ids.map(function(id){var cc=_indConn(id);return cc?(cc.name||'Aansluiting'):null;}).filter(Boolean);
  var repTitle=connNames.length===1?connNames[0]:(connNames.length&&connNames.length<=3?connNames.join(' · '):(connNames.length+' aansluitingen'));
  if(!repTitle)repTitle=proj.name||'Individuele analyse';

  var pageHdr='<div class="hdr">'+
    '<div><div class="brand">ENERGY <span>STUDIO</span></div><div class="brand-by">by Impuls Zeeland</div></div>'+
    '<div class="hdr-dt">'+datum+'<br><span style="font-size:7pt;opacity:.85">'+_indEsc(repTitle)+' · Individuele analyse</span></div>'+
    '</div><div class="divider"></div>';
  function pageFooter(){return '<div class="ft"><span>Energy Studio · Impuls Zeeland — Individuele analyse</span><span>'+datum+'</span></div>';}

  // ── Per aansluiting: selecteren, analyseren, grafieken vastleggen ──
  var sections=[], coverPeriode='', num=0;
  for(var pi=0;pi<ids.length;pi++){
    var c=_indConn(ids[pi]);
    if(!c)continue;
    _indSelId=c.id;
    try{await runIndAnalysis();}catch(e){console.error('runIndAnalysis('+c.id+'):',e);continue;}
    if(!_indLast||_indLast.c.id!==c.id||!_indLast.a.dataset.nPunten)continue; // geen meetdata
    var a=_indLast.a;
    await new Promise(function(r){setTimeout(r,180);}); // live charts laten settelen vóór capture
    num++;
    var imgs={};
    if(sec.jaar)imgs.jaar=await _rapCi('cIndJaar',330);
    if(sec.maand)imgs.maand=await _rapCi('cIndMaand',300);
    if(sec.week)imgs.week=await _rapCi('cIndWeek',360);
    if(sec.bdk)imgs.bdk=await _rapCi('cIndBdk',380);
    if(!coverPeriode&&a.dataset.begin)coverPeriode=_fmtDate(a.dataset.begin)+' t/m '+_fmtDate(a.dataset.eind);
    sections.push(_indRapSection(c,a,imgs,num));
  }

  // ── Selectie herstellen ──
  _indSelId=origSel;
  try{if(origSel)await runIndAnalysis(true);else renderInd();}catch(e){}

  if(!num)throw new Error('Geen aansluiting met meetdata om te rapporteren');

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
    '<div class="cover-body" style="grid-template-columns:1fr">'+
      '<div class="cover-left">'+
        '<div class="cover-eyebrow">Individuele aansluitingsanalyse · Analyserapport</div>'+
        '<h1 class="cover-title">'+_indEsc(repTitle)+'</h1>'+
        '<div class="cover-sub">Verbruik, teruglevering, netcongestie en belastingprofiel per aansluiting</div>'+
        '<div class="cover-info">'+
          (coverPeriode?'<b>Meetperiode:</b> '+coverPeriode+'<br>':'')+
          '<b>Aansluitingen in dit rapport:</b> '+num+'<br>'+
          '<b>Opgesteld op:</b> '+datum+'<br>'+
          '<b>Door:</b> Impuls Zeeland — Energy Studio'+
        '</div>'+
      '</div>'+
    '</div>'+
    '<div class="cover-foot"><span>impulszeeland.nl</span><span class="fr">Energy Studio</span></div>'+
  '</div>';

  // ── Eindpagina ──
  var endHtml='<div class="page pb endp">'+
    '<div class="endp-hero">'+
      '<img src="'+logoUrl+'" alt="Impuls Zeeland" onerror="this.style.display=\'none\'">'+
      '<div class="endp-hero-tag">Grip op je energieprofiel</div>'+
      '<div class="endp-hero-sub">Impuls Zeeland helpt ondernemers, gemeenten en samenwerkingsverbanden bij het analyseren van hun energieverbruik, netcongestie en verduurzamingskansen — van meetdata tot concreet advies.</div>'+
    '</div>'+
    '<div class="endp-body">'+
      '<div class="endp-grid">'+
        '<div class="endp-block">'+
          '<div class="endp-h">Over dit rapport</div>'+
          '<p>Dit rapport brengt het energieprofiel van één aansluiting in kaart: verbruik en teruglevering (piek/dal), netcongestie ten opzichte van het gecontracteerde transportvermogen (GTV), de zwaarste pieken en het jaar-, week- en duurbelastingprofiel.</p>'+
          '<p>Vragen over netcongestie, GTV-optimalisatie of verduurzaming? Neem gerust contact met ons op.</p>'+
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
        '<strong>Disclaimer.</strong> Dit rapport is opgesteld op basis van aangeleverde meetdata en de bij de aansluiting ingevoerde contract- en netparameters (GTV, zekering, fysieke capaciteit). De getoonde kengetallen zijn indicatief en kunnen afwijken door meetfouten, ontbrekende perioden of gewijzigde contractvoorwaarden. Aan dit rapport kunnen geen rechten worden ontleend.'+
      '</div>'+
    '</div>'+
    '<div class="endp-foot"><strong>Energy Studio</strong> · '+_indEsc(repTitle)+' · '+datum+'</div>'+
  '</div>';

  return '<!DOCTYPE html><html lang="nl"><head><meta charset="UTF-8">'+
    '<link rel="preconnect" href="https://fonts.googleapis.com">'+
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;600;700;900&display=swap">'+
    '<title>Individueel rapport — '+_indEsc(repTitle)+' — Energy Studio</title>'+
    '<style>'+rapportCss()+'</style>'+
    '</head><body>'+coverHtml+sections.join('')+endHtml+'</body></html>';

  // ─── Sectie per aansluiting ───────────────────────────────────
  function _indRapSection(c,a,imgs,num){
    var ds=a.dataset, ans=a.aansluiting, e=a.energie, cg=a.congestie, lbl=a.piekdalLbl;
    // Jaarfilter actief → benoemen, zodat het rapport niet onterecht de hele meetperiode claimt.
    var jf=ds.jaarFilter||null;
    var perLbl=jf?('kalenderjaar '+jf):'de hele meetperiode';
    function shdr(badge){
      return '<div class="rsh"><div class="rsh-n">'+num+'</div><div class="rsh-t">Aansluiting — '+_indEsc(ds.naam||c.name)+
        (badge?'<span class="rsh-badge" style="margin-left:auto">'+badge+'</span>':'')+'</div></div>';
    }
    var html='';

    // PAGINA: Kengetallen
    if(sec.kengetallen){
      var datasetKg='<div class="rsub"><span class="rsub-num">Dataset</span>'+(jf?('kalenderjaar '+jf):'meetperiode &amp; profiel')+'</div><div class="kg k4">'+
        _indRapCard('Begindatum',_fmtDate(ds.begin)||'—')+
        _indRapCard('Einddatum',_fmtDate(ds.eind)||'—')+
        _indRapCard('Meetpunten',_fmtI(ds.nPunten),'kwartierwaarden · ≈ '+ds.jaren.toLocaleString('nl-NL')+' jaar')+
        _indRapCard('Profiel / bestand',ds.bestand?_indEsc(ds.bestand):(ds.adres?_indEsc(ds.adres):'—'))+
      '</div>';
      var aansluitingKg='<div class="rsub"><span class="rsub-num">Aansluiting</span>contract &amp; capaciteit</div><div class="kg k4">'+
        _indRapCard('Zekering aansluitpunt',ans.zekering?_indEsc(ans.zekering):'—')+
        _indRapCard('Fysieke capaciteit',ans.kva!=null?_fmtI(ans.kva):'—','kW')+
        _indRapCard('GTV afname',ans.gtvA?_fmtI(ans.gtvA):'—','kW')+
        _indRapCard('GTV-T teruglevering',ans.gtvT?_fmtI(ans.gtvT):'—','kW')+
      '</div>';
      var energieKg='<div class="rsub"><span class="rsub-num">Energieverbruik</span>afname &amp; teruglevering</div><div class="kg k6">'+
        _indRapCard('Totaal verbruik',_fmtI(e.afnameKwh),'kWh',' dark')+
        _indRapCard('Verbruik '+lbl.piek,_fmtI(e.afnamePiekKwh),'kWh')+
        _indRapCard('Verbruik '+lbl.dal,_fmtI(e.afnameDalKwh),'kWh')+
        _indRapCard('Totale teruglevering',_fmtI(e.terugKwh),'kWh',' dark')+
        _indRapCard('Teruglevering '+lbl.piek,_fmtI(e.terugPiekKwh),'kWh')+
        _indRapCard('Teruglevering '+lbl.dal,_fmtI(e.terugDalKwh),'kWh')+
      '</div>';
      html+='<div class="page pb">'+pageHdr+shdr('Kengetallen')+
        datasetKg+aansluitingKg+energieKg+
        '<div class="rib">Piek/dal-verdeling: '+lbl.def+(jf?(' · Alle cijfers in dit rapport zijn berekend over kalenderjaar '+jf):'')+'</div>'+
        pageFooter()+'</div>';
    }

    // PAGINA: Netcongestie & top-pieken
    if(sec.congestie){
      var congKg='<div class="kg k4">'+
        _indRapCard('Max piekbelasting afname',_fmtN(cg.maxA,1),'kW',cg.heeftGtvA&&cg.maxA>ans.gtvA?'red':'')+
        _indRapCard('Max piekbelasting teruglevering',_fmtN(cg.maxT,1),'kW',cg.heeftGtvT&&cg.maxT>ans.gtvT?'red':'')+
        _indRapCard('Max overschrijding GTV afname',cg.heeftGtvA?(cg.overA>0?'+'+_fmtN(cg.overA,1):'0'):'n.v.t.',cg.heeftGtvA?'kW':'',cg.heeftGtvA&&cg.overA>0?'red':'')+
        _indRapCard('Max overschrijding GTV terug.',cg.heeftGtvT?(cg.overT>0?'+'+_fmtN(cg.overT,1):'0'):'n.v.t.',cg.heeftGtvT?'kW':'',cg.heeftGtvT&&cg.overT>0?'red':'')+
      '</div>'+
      '<div class="kg k4">'+
        _indRapCardSm('Moment hoogste piek afname',_indRapMoment(cg.tsMaxA))+
        _indRapCardSm('Moment hoogste piek terug.',_indRapMoment(cg.tsMaxT))+
        _indRapCard('Overschrijdingen afname',cg.heeftGtvA?_fmtI(cg.nOverA):'n.v.t.',cg.heeftGtvA?'kwartieren > GTV':'',cg.heeftGtvA&&cg.nOverA>0?'red':'')+
        _indRapCard('Overschrijdingen teruglevering',cg.heeftGtvT?_fmtI(cg.nOverT):'n.v.t.',cg.heeftGtvT?'kwartieren > GTV-T':'',cg.heeftGtvT&&cg.nOverT>0?'red':'')+
      '</div>';
      var cols='<colgroup><col style="width:8%"><col style="width:42%"><col style="width:18%"><col style="width:14%"><col style="width:18%"></colgroup>';
      var topTblA='<table class="compact">'+cols+'<thead><tr><th>#</th><th>Moment</th><th class="num">Afname kW</th><th class="num">GTV</th><th class="num">Overschr.</th></tr></thead><tbody>'+_indRapPeakRows(a.topA.slice(0,10),ans.gtvA,cg.heeftGtvA)+'</tbody></table>';
      var topTblT='<table class="compact">'+cols+'<thead><tr><th>#</th><th>Moment</th><th class="num">Terug. kW</th><th class="num">GTV-T</th><th class="num">Overschr.</th></tr></thead><tbody>'+_indRapPeakRows(a.topT.slice(0,10),ans.gtvT,cg.heeftGtvT)+'</tbody></table>';
      html+='<div class="page pb">'+pageHdr+shdr('Netcongestie')+
        '<p class="rintro">Piekbelasting en overschrijdingen ten opzichte van het gecontracteerde transportvermogen (GTV) voor afname en teruglevering, gevolgd door de tien zwaarste kwartierpieken per richting.</p>'+
        congKg+
        '<div class="rsub"><span class="rsub-num">Top 10 pieken</span>zwaarste kwartieren</div>'+
        '<div class="r2col"><div><div class="rchart"><h3>Afname</h3></div>'+topTblA+'</div><div><div class="rchart"><h3>Teruglevering</h3></div>'+topTblT+'</div></div>'+
        pageFooter()+'</div>';
    }

    // PAGINA: Jaarprofiel
    if(sec.jaar&&imgs.jaar){
      html+='<div class="page pb">'+pageHdr+shdr('Jaarprofiel')+
        '<p class="rintro">Gemeten vermogen over '+perLbl+': afname (groen, boven de nullijn) en teruglevering (geel, onder de nullijn), met de GTV-referentielijnen.</p>'+
        '<div class="rchart">'+imgs.jaar+'</div>'+
        '<div class="rib2">Groen = afname, geel = teruglevering. Rood gestippeld = GTV afname, oranje gestippeld = GTV-T teruglevering.</div>'+
        pageFooter()+'</div>';
    }

    // PAGINA: Weekprofiel
    if(sec.week&&imgs.week){
      html+='<div class="page pb">'+pageHdr+shdr('Weekprofiel')+
        '<p class="rintro">Gemiddeld vermogen per kwartier over een gemiddelde week (maandag t/m zondag), met de min/max-band die de spreiding toont.</p>'+
        '<div class="rchart">'+imgs.week+'</div>'+
        pageFooter()+'</div>';
    }

    // PAGINA: Netto verbruik per maand
    if(sec.maand&&imgs.maand){
      // Onvolledige maanden staan al gearceerd in de grafiek (die wordt als screenshot
      // overgenomen); hier komt de tekstuele toelichting erbij.
      var mnd=a.maand||{},mk=mnd.keys||[],onv=[];
      mk.forEach(function(k,i){
        if((mnd.volledig||[])[i]===false)
          onv.push(mndLabel(mk,k)+' ('+((mnd.dagen||[])[i]||0)+' van '+((mnd.dagenInMaand||[])[i]||0)+' dagen)');
      });
      html+='<div class="page pb">'+pageHdr+shdr('Netto verbruik per maand')+
        '<p class="rintro">Netto verbruik (afname − teruglevering) per maand. Een negatieve staaf betekent dat er in die maand méér is teruggeleverd dan afgenomen.</p>'+
        (onv.length?('<div class="rib-warn"><strong>Onvolledige '+(onv.length===1?'maand':'maanden')+':</strong> '+onv.join(', ')+
          '. '+(onv.length===1?'Deze staaf is':'Deze staven zijn')+' gearceerd en met een asterisk gemarkeerd — de lagere waarde komt door ontbrekende meetdata, niet door lager verbruik. Vergelijk deze '+(onv.length===1?'maand':'maanden')+' niet met de volledige maanden.</div>'):'')+
        '<div class="rchart">'+imgs.maand+'</div>'+
        pageFooter()+'</div>';
    }

    // PAGINA: Belastingduurkromme
    if(sec.bdk&&imgs.bdk){
      html+='<div class="page pb">'+pageHdr+shdr('Belastingduurkromme')+
        '<p class="rintro">Belastingduurkromme: het vermogen (y) uitgezet tegen het percentage van de tijd (x), aflopend gesorteerd van de hoogste afname (links) naar de hoogste teruglevering (rechts).</p>'+
        '<div class="rchart">'+imgs.bdk+'</div>'+
        '<div class="rib2">De GTV-referentielijnen tonen hoeveel marge er is tot het gecontracteerde transportvermogen, voor afname en teruglevering.</div>'+
        pageFooter()+'</div>';
    }

    return html;
  }
}

// ─── Wiring ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded',function(){
  [document.getElementById('btnRapportInd'),document.getElementById('btnRapportIndHome')].forEach(function(b){
    if(b)b.addEventListener('click',openIndRapportModal);
  });
  var g=document.getElementById('btnGenIndRap');
  if(g)g.addEventListener('click',function(){generateIndRapport();});
  ['btnCloseIndRapOpts','btnCloseIndRapOpts2'].forEach(function(id){
    var el=document.getElementById(id);
    if(el)el.addEventListener('click',function(){hideM('mIndRapOpts');});
  });
});
