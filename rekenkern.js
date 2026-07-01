// Rekenkern — pure, DOM-loze financiële rekenkern voor de huidige contractsituatie
// en het energiehandelsplatform (EHP). Eén bron van waarheid, los testbaar (test.html).
//
// Conventies (gelijk aan de rest van de app):
//   - kwartierdata: array van {ts, kw}. kw > 0 = afname, kw < 0 = teruglevering. kWh = kw * 0.25.
//   - prijsreeks (EPEX/EEX): array van {ts, price}. price = KALE marktprijs in €/kWh
//     (zonder energiebelasting, btw, netkosten of leveranciersopslag). Negatief toegestaan.
//   - timestamps worden genormaliseerd op minuut-precisie (slice(0,16)) voor het matchen
//     van kwartier- en prijsreeksen.
//
// Afhankelijkheden: optioneel SA, ST, isDL/HOL uit tarieven.js (voor netkosten). Ontbreken
// die globals (bv. in Node), dan vallen netkosten terug op 0 — de kern blijft werken.

// --- Defaults / configuratie -------------------------------------------------

var REKEN_DEFAULTS={
  // Energiebelasting elektriciteit, €/kWh EXCL. btw. Officiële NL-tarieven (Belastingdienst).
  // Verifieer per jaar; tarieven wijzigen jaarlijks.
  energiebelasting:{
    // Jaarspecifieke staffels; kies via opts.jaar. Onbekend/leeg jaar → .staffel (default = 2025).
    // Bron-tabel splitst 0–2.900 / 2.901–10.000 kWh, maar die tarieven zijn identiek → hier
    // samengevoegd tot één schijf 0–10.000. De hoogste schijf (>10 mln kWh) gebruikt het
    // ZAKELIJKE tarief (deze tool is voor zakelijke/coöperatieve aansluitingen).
    // NB 2022: het laagste tarief is tijdelijk verlaagd en daardoor lager dan schijf 2 (geen fout).
    staffels:{
      2019:[{tot:10000,tarief:0.09863},{tot:50000,tarief:0.05337},{tot:10000000,tarief:0.01421},{tot:Infinity,tarief:0.00058}],
      2020:[{tot:10000,tarief:0.09770},{tot:50000,tarief:0.05083},{tot:10000000,tarief:0.01353},{tot:Infinity,tarief:0.00055}],
      2021:[{tot:10000,tarief:0.09428},{tot:50000,tarief:0.05164},{tot:10000000,tarief:0.01375},{tot:Infinity,tarief:0.00056}],
      2022:[{tot:10000,tarief:0.03679},{tot:50000,tarief:0.04361},{tot:10000000,tarief:0.01189},{tot:Infinity,tarief:0.00057}],
      2023:[{tot:10000,tarief:0.12599},{tot:50000,tarief:0.10046},{tot:10000000,tarief:0.03942},{tot:Infinity,tarief:0.00115}],
      2024:[{tot:10000,tarief:0.10880},{tot:50000,tarief:0.09037},{tot:10000000,tarief:0.03943},{tot:Infinity,tarief:0.00188}],
      2025:[{tot:10000,tarief:0.10154},{tot:50000,tarief:0.06937},{tot:10000000,tarief:0.03868},{tot:Infinity,tarief:0.00321}],
      2026:[{tot:10000,tarief:0.09161},{tot:50000,tarief:0.06671},{tot:10000000,tarief:0.03735},{tot:Infinity,tarief:0.00310}]
    },
    // Default-staffel (gebruikt als geen/onbekend jaar is opgegeven) = 2025.
    staffel:[
      {tot:10000,    tarief:0.10154},   // schijf 1: 0 – 10.000 kWh
      {tot:50000,    tarief:0.06937},   // schijf 2: 10.000 – 50.000 kWh
      {tot:10000000, tarief:0.03868},   // schijf 3: 50.000 – 10.000.000 kWh
      {tot:Infinity, tarief:0.00321}    // schijf 4: > 10.000.000 kWh (zakelijk)
    ],
    heffingskorting:0,  // vermindering energiebelasting €/jaar per aansluiting (default uit; instelbaar)
    waarschuwing:'Fiscale behandeling is afhankelijk van de juridische leveringsstructuur.'
  },
  btwPct:0.21
};

// Kiest de EB-staffel: expliciete opts.staffel > jaarspecifiek > default.
function _ebStaffel(opts){
  opts=opts||{};
  if(opts.staffel)return opts.staffel;
  var eb=REKEN_DEFAULTS.energiebelasting;
  if(opts.jaar!=null&&eb.staffels&&eb.staffels[opts.jaar])return eb.staffels[opts.jaar];
  return eb.staffel;
}

// --- Interne hulpfuncties ----------------------------------------------------

function _num(v,d){return (typeof v==='number'&&!isNaN(v))?v:d;}
function _normTs(ts){ts=String(ts).trim();return ts.length>=16?ts.slice(0,16):ts;}
function _isDal(ts){return (typeof isDL==='function')?isDL(ts):false;}

function _aantalMaanden(data,override){
  if(typeof override==='number'&&override>0)return override;
  var s={};(data||[]).forEach(function(d){if(d&&d.ts!=null)s[String(d.ts).slice(0,7)]=1;});
  return Object.keys(s).length||12;
}

// --- Contract normaliseren ---------------------------------------------------

// Levert een volledig contract-object met defaults en legacy-fallback
// (priceA/priceT/priceType uit het bestaande aansluitingsmodel).
function normalizeContract(company){
  company=company||{};
  var c=company.contract||{};
  var type=c.type||(company.priceType==='dynamic'?'dynamisch':'vast');
  return {
    type:type,
    vasteAfnamePrijs:          _num(c.vasteAfnamePrijs,_num(company.priceA,0.12)),
    vasteTerugleverVergoeding: _num(c.vasteTerugleverVergoeding,_num(company.priceT,0.08)),
    dynOpslagAfname:           _num(c.dynOpslagAfname,0),
    dynAfslagTeruglever:       _num(c.dynAfslagTeruglever,0),
    vasteLeveringskosten:      _num(c.vasteLeveringskosten,0),
    onbalansOpslag:            _num(c.onbalansOpslag,0),
    profielOpslag:             _num(c.profielOpslag,0),
    energiebelastingToepassen: c.energiebelastingToepassen!==false,
    btwToepassen:              c.btwToepassen!==false,
    saldering:                 c.saldering===true,
    benchmarkFactuur:          _num(c.benchmarkFactuur,0),
    blendFactor:               Math.max(0,Math.min(1,_num(c.blendFactor,1))), // hybride: aandeel afname dynamisch
    notities:                  c.notities||''
  };
}

// --- Prijsindex --------------------------------------------------------------

// Bouwt een {ts -> price}-map. priceAt(ts) geeft de prijs of null (ontbrekend → te markeren).
function buildPriceIndex(priceSeries){
  var map={};
  (priceSeries||[]).forEach(function(r){
    if(r&&r.ts!=null&&typeof r.price==='number'&&!isNaN(r.price)){
      // Normaliseer opgeslagen timestamps naar ISO (space→T, voor bestaande data)
      var key=_normTs(String(r.ts).replace(' ','T'));
      map[key]=r.price;
    }
  });
  return {
    map:map,
    size:Object.keys(map).length,
    priceAt:function(ts){
      var norm=_normTs(ts);
      var v=map[norm];
      if(v!==undefined)return v;
      // Uurlijkse EPEX-data (ENTSO-E): geen kwartierprijs → zoek het :00 van hetzelfde uur
      var hourKey=norm.slice(0,13)+':00';
      v=map[hourKey];
      return v!==undefined?v:null;
    }
  };
}

// --- Kwartier splitsen -------------------------------------------------------

function splitQuarter(kw){
  kw=_num(kw,0);
  var kwh=kw*0.25;
  return {afnameKwh:Math.max(0,kwh),terugleverKwh:Math.max(0,-kwh)};
}

// --- Energiebelasting --------------------------------------------------------

// Staffel-belasting over een gegeven grondslag (kWh). Retourneert {belasting, perSchijf}.
function _staffelTax(grondslag,staffel){
  var rest=Math.max(0,grondslag),vorige=0,belasting=0,perSchijf=[];
  for(var i=0;i<staffel.length;i++){
    var grens=staffel[i].tot,tarief=staffel[i].tarief;
    var breedte=(grens===Infinity?rest:Math.min(rest,grens-vorige));
    if(breedte<0)breedte=0;
    var deel=breedte*tarief;
    belasting+=deel;
    perSchijf.push({tot:grens,tarief:tarief,kwh:breedte,bedrag:deel});
    rest-=breedte;vorige=grens;
    if(rest<=0)break;
  }
  return {belasting:belasting,perSchijf:perSchijf};
}

// Energiebelasting over de grondslag. opts.grondslag bepaalt de basis:
//   'bruto'           → totale afname (default)
//   'netto'           → afname − teruglevering (ook via opts.saldering:true)
//   'externeLevering' → alleen netinkoop (opts.externeAfnameKwh)
// opts.jaar kiest een jaarspecifieke staffel; opts.heffingskorting is de vermindering €/jaar.
function calculateEnergyTax(afnameKwh,terugleverKwh,opts){
  opts=opts||{};
  var staffel=_ebStaffel(opts);
  var korting=(typeof opts.heffingskorting==='number')?opts.heffingskorting:REKEN_DEFAULTS.energiebelasting.heffingskorting;
  var mode=opts.grondslag||(opts.saldering===true?'netto':'bruto');
  var grondslag;
  if(mode==='netto')grondslag=Math.max(0,_num(afnameKwh,0)-_num(terugleverKwh,0));
  else if(mode==='externeLevering')grondslag=Math.max(0,_num(opts.externeAfnameKwh,0));
  else grondslag=_num(afnameKwh,0); // bruto
  var t=_staffelTax(grondslag,staffel);
  return {grondslagKwh:grondslag,grondslagMode:mode,belasting:t.belasting,heffingskorting:korting,
    netto:t.belasting-korting,perSchijf:t.perSchijf,saldering:mode==='netto',
    waarschuwing:REKEN_DEFAULTS.energiebelasting.waarschuwing};
}

// --- Btw ---------------------------------------------------------------------

// Btw éénmalig over de som van btw-plichtige componenten — geen dubbeltelling.
// componenten = { label: {bedrag, btwPlichtig} } of { label: bedrag } (dan alles btw-plichtig).
function calculateBtw(componenten,opts){
  opts=opts||{};componenten=componenten||{};
  var pct=(typeof opts.pct==='number')?opts.pct:REKEN_DEFAULTS.btwPct;
  var grondslag=0,perComponent={};
  Object.keys(componenten).forEach(function(k){
    var c=componenten[k];
    var bedrag=(typeof c==='number')?c:_num(c.bedrag,0);
    var plichtig=(typeof c==='number')?true:(c.btwPlichtig!==false);
    if(plichtig)grondslag+=bedrag;
    perComponent[k]={bedrag:bedrag,btwPlichtig:plichtig,btw:plichtig?bedrag*pct:0};
  });
  return {pct:pct,grondslag:grondslag,btw:grondslag*pct,perComponent:perComponent};
}

// --- Netkosten (Stedin) ------------------------------------------------------

// Pure herschrijving van drawKosten() uit charts/kosten.js: aansluitvergoeding,
// vastrecht transport, kW-contract (GTV-A), kW-max (piek per maand) en dubbeltarief.
// Uitbreidingen (additief; totaal ongewijzigd zolang overschrijdingsTarief/terugleverPiekTarief 0):
//   - gecontracteerd transportvermogen (company.gecontracteerdVermogen, default gtvA);
//   - overschrijdingskosten per maand bij maandpiek afname > gecontracteerd vermogen;
//   - maandpieken afname & teruglevering (GTV-A / GTV-T) bijgehouden in de output.
function calculateGridCosts(company,quarterData,opts){
  opts=opts||{};company=company||{};
  var sa=(typeof SA!=='undefined'&&SA[company.stedinA||'none'])||{l:'—',y:0};
  var st=(typeof ST!=='undefined'&&ST[company.stedinT||'none'])||{l:'—',vr:0,kc:0,km:0,dn:0,dl:0};
  var data=quarterData||[];
  var mndSet={},mPA={},mPT={},dn=0,dl=0;
  data.forEach(function(d){
    if(!d||d.kw==null)return;
    var mn=String(d.ts).slice(0,7);mndSet[mn]=1;
    var afname=Math.max(0,d.kw),terug=Math.max(0,-d.kw);
    if(!mPA[mn]||afname>mPA[mn])mPA[mn]=afname;
    if(!mPT[mn]||terug>mPT[mn])mPT[mn]=terug;
    var kwh=afname*0.25;
    if(_isDal(d.ts))dl+=kwh;else dn+=kwh;
  });
  var nMnd=Object.keys(mndSet).length||(opts.nMnd||12);
  var gtvA=_num(company.gtvA,150);
  var gecontracteerd=_num(company.gecontracteerdVermogen,gtvA);
  var overschrTarief=_num(opts.overschrijdingsTarief,0);
  var terugPiekTarief=_num(opts.terugleverPiekTarief,0);
  var aansl=sa.y/12*nMnd;
  var vast=st.vr*nMnd;
  var kwC=gtvA*st.kc*nMnd;
  var kwM=Object.keys(mPA).reduce(function(s,mn){return s+(mPA[mn]||0)*st.km;},0);
  var dubbel=dn*st.dn+dl*st.dl;
  var overschr=Object.keys(mPA).reduce(function(s,mn){return s+Math.max(0,(mPA[mn]||0)-gecontracteerd)*overschrTarief;},0);
  var terugPiek=Object.keys(mPT).reduce(function(s,mn){return s+(mPT[mn]||0)*terugPiekTarief;},0);
  var maandpiekAfname=Object.keys(mPA).sort().map(function(mn){return {maand:mn,piekKw:mPA[mn]};});
  var maandpiekTeruglever=Object.keys(mPT).sort().map(function(mn){return {maand:mn,piekKw:mPT[mn]};});
  return {aansluitvergoeding:aansl,vastrechtTransport:vast,kwContract:kwC,kwMax:kwM,
    dubbeltarief:dubbel,overschrijdingskosten:overschr,terugleverPiekkosten:terugPiek,
    kwhNormaal:dn,kwhDal:dl,nMnd:nMnd,gtvA:gtvA,gecontracteerdVermogen:gecontracteerd,
    maandpiekAfname:maandpiekAfname,maandpiekTeruglever:maandpiekTeruglever,sa:sa,st:st,
    totaal:aansl+vast+kwC+kwM+dubbel+overschr+terugPiek};
}

// Vergelijkt netkosten individueel (Σ per aansluiting) vs. collectief (groep als één
// virtuele aansluiting met eigen tarieftype + gecontracteerd vermogen).
// perKwByMember[m][t] = kW per lid per kwartier, uitgelijnd op allTs.
function compareGridCostsIndividualVsCollective(companies,perKwByMember,allTs,collectief,opts){
  companies=companies||[];perKwByMember=perKwByMember||[];allTs=allTs||[];opts=opts||{};
  var perCompany=companies.map(function(c,m){
    var data=allTs.map(function(ts,i){return {ts:ts,kw:_num((perKwByMember[m]||[])[i],0)};});
    var g=calculateGridCosts(c,data,opts);
    return {id:c.id,name:c.name,totaal:g.totaal,detail:g};
  });
  var individueel=perCompany.reduce(function(s,x){return s+x.totaal;},0);
  var collectiefProfiel=allTs.map(function(ts,i){
    var sum=0;for(var m=0;m<perKwByMember.length;m++)sum+=_num((perKwByMember[m]||[])[i],0);
    return {ts:ts,kw:sum};
  });
  var collectiefDetail=calculateGridCosts(collectief||{},collectiefProfiel,opts);
  return {individueel:individueel,collectief:collectiefDetail.totaal,
    besparing:individueel-collectiefDetail.totaal,perCompany:perCompany,collectiefDetail:collectiefDetail};
}

// --- Huidige contractkosten per bedrijf --------------------------------------

// Rekent de huidige contractsituatie door voor vast / dynamisch / hybride / benchmark.
// Retourneert de volledige opbouw incl. ontbrekende-prijs-markering.
function calculateCurrentContractCosts(company,quarterData,priceSeries,opts){
  opts=opts||{};
  var c=normalizeContract(company);
  var data=quarterData||[];
  var idx=buildPriceIndex(priceSeries||[]);
  var fallback=(typeof opts.fallbackPrice==='number')?opts.fallbackPrice:null;
  var nMnd=_aantalMaanden(data,opts.nMnd);

  var afnameKwh=0,terugleverKwh=0,marktKostenAfname=0,opbrengstTeruglever=0,opslagAfname=0;
  var missingPriceCount=0,negativePriceCount=0,usedPriceCount=0;

  // Handmatige factuurbenchmark: geen kwartierberekening, alleen factuurbedrag schalen.
  if(c.type==='benchmark'){
    data.forEach(function(d){if(!d||d.kw==null)return;var sp=splitQuarter(d.kw);afnameKwh+=sp.afnameKwh;terugleverKwh+=sp.terugleverKwh;});
    var totaalBench=c.benchmarkFactuur*(nMnd/12);
    return {type:'benchmark',afnameKwh:afnameKwh,terugleverKwh:terugleverKwh,nMnd:nMnd,
      marktKostenAfname:0,opbrengstTeruglever:0,opslagAfname:0,leveringskosten:0,
      energiebelasting:0,energiebelastingDetail:null,netkosten:0,netkostenDetail:null,
      subtotaalExclBtw:totaalBench,btw:0,totaal:totaalBench,
      missingPriceCount:0,negativePriceCount:0,usedPriceCount:0,
      toelichting:'Handmatige factuurbenchmark (€'+c.benchmarkFactuur.toFixed(2)+'/jaar), geschaald naar '+nMnd+' maand(en).'};
  }

  data.forEach(function(d){
    if(!d||d.kw==null)return;
    var sp=splitQuarter(d.kw);
    afnameKwh+=sp.afnameKwh;terugleverKwh+=sp.terugleverKwh;
    if(sp.afnameKwh===0&&sp.terugleverKwh===0)return;

    if(c.type==='vast'){
      marktKostenAfname+=sp.afnameKwh*c.vasteAfnamePrijs;
      opbrengstTeruglever+=sp.terugleverKwh*c.vasteTerugleverVergoeding;
    }else{ // dynamisch of hybride — EPEX per kwartier
      var p=idx.priceAt(d.ts);
      if(p===null){
        if(fallback!==null){p=fallback;}
        else{missingPriceCount++;return;} // kwartier zonder prijs: markeren en overslaan
      }else{usedPriceCount++;if(p<0)negativePriceCount++;}
      if(c.type==='hybride'){
        var bf=c.blendFactor; // aandeel afname dynamisch; rest tegen vaste prijs. Teruglever: vast.
        marktKostenAfname+=sp.afnameKwh*(bf*(p+c.dynOpslagAfname)+(1-bf)*c.vasteAfnamePrijs);
        opbrengstTeruglever+=sp.terugleverKwh*c.vasteTerugleverVergoeding;
      }else{ // dynamisch
        marktKostenAfname+=sp.afnameKwh*(p+c.dynOpslagAfname);          // EPEX + opslag
        opbrengstTeruglever+=sp.terugleverKwh*(p-c.dynAfslagTeruglever); // EPEX - afslag
      }
    }
    opslagAfname+=sp.afnameKwh*(c.onbalansOpslag+c.profielOpslag);
  });

  var leveringskosten=c.vasteLeveringskosten*(nMnd/12);
  var eb=c.energiebelastingToepassen
    ? calculateEnergyTax(afnameKwh,terugleverKwh,{staffel:opts.staffel,jaar:opts.jaar,heffingskorting:opts.heffingskorting,saldering:c.saldering})
    : {netto:0,belasting:0,perSchijf:[],grondslagKwh:0};
  var grid=(opts.includeGridCosts!==false)?calculateGridCosts(company,data,{nMnd:nMnd}):{totaal:0};

  var leveringNetto=marktKostenAfname-opbrengstTeruglever+opslagAfname+leveringskosten;
  var subtotaalExclBtw=leveringNetto+eb.netto+grid.totaal;
  var btwPct=(opts.btwPct!=null)?opts.btwPct:REKEN_DEFAULTS.btwPct;
  var btw=c.btwToepassen?subtotaalExclBtw*btwPct:0;

  return {type:c.type,afnameKwh:afnameKwh,terugleverKwh:terugleverKwh,nMnd:nMnd,
    marktKostenAfname:marktKostenAfname,opbrengstTeruglever:opbrengstTeruglever,
    opslagAfname:opslagAfname,leveringskosten:leveringskosten,
    energiebelasting:eb.netto,energiebelastingDetail:eb,
    netkosten:grid.totaal,netkostenDetail:grid,
    subtotaalExclBtw:subtotaalExclBtw,btw:btw,totaal:subtotaalExclBtw+btw,
    missingPriceCount:missingPriceCount,negativePriceCount:negativePriceCount,usedPriceCount:usedPriceCount};
}

// --- Interne energie-allocatie (kwartier-matching) ---------------------------

// Pure volume-allocatie over deelnemers. perKwByMember[m][t] = kW per lid per kwartier
// (uitgelijnd op dezelfde tijdstappen). sources[m] in {zon,wind,overig,none}.
// Borgt: interne afname == interne levering per kwartier (= min(opwek, vraag)).
function allocateInternalEnergy(perKwByMember,sources){
  perKwByMember=perKwByMember||[];sources=sources||[];
  var n=perKwByMember.length,T=n?perKwByMember[0].length:0;
  var R=[];
  for(var m=0;m<n;m++)R.push({source:sources[m]||'overig',prodKwh:0,consKwh:0,
    intSoldKwh:0,intBoughtKwh:0,gridExpKwh:0,gridImpKwh:0});
  var matchedBySrc={zon:0,wind:0,overig:0},prodBySrcTot={zon:0,wind:0,overig:0};
  var totProd=0,totCons=0,totMatched=0,perQuarter=[];

  for(var t=0;t<T;t++){
    var prod=new Array(n),dem=new Array(n),tProd=0,tDem=0,prodBySrc={zon:0,wind:0,overig:0};
    for(var i=0;i<n;i++){
      var raw=_num(perKwByMember[i][t],0)*0.25,src=sources[i]||'overig';
      var kwh=(src==='none'&&raw<0)?0:raw;
      if(kwh<0){var pk=-kwh;prod[i]=pk;dem[i]=0;tProd+=pk;(prodBySrc[src]!=null?prodBySrc[src]+=pk:prodBySrc.overig+=pk);R[i].prodKwh+=pk;}
      else if(kwh>0){prod[i]=0;dem[i]=kwh;tDem+=kwh;R[i].consKwh+=kwh;}
      else{prod[i]=0;dem[i]=0;}
    }
    totProd+=tProd;totCons+=tDem;
    prodBySrcTot.zon+=prodBySrc.zon;prodBySrcTot.wind+=prodBySrc.wind;prodBySrcTot.overig+=prodBySrc.overig;
    var matched=Math.min(tProd,tDem);totMatched+=matched;
    perQuarter.push({matched:matched,totProd:tProd,totDem:tDem});
    if(matched<=0){
      for(var a=0;a<n;a++){if(prod[a]>0)R[a].gridExpKwh+=prod[a];else if(dem[a]>0)R[a].gridImpKwh+=dem[a];}
      continue;
    }
    var fProd=matched/tProd,fDem=matched/tDem;
    matchedBySrc.zon+=prodBySrc.zon*fProd;matchedBySrc.wind+=prodBySrc.wind*fProd;matchedBySrc.overig+=prodBySrc.overig*fProd;
    for(var b=0;b<n;b++){
      if(prod[b]>0){var ms=prod[b]*fProd;R[b].intSoldKwh+=ms;R[b].gridExpKwh+=prod[b]-ms;}
      else if(dem[b]>0){var mb=dem[b]*fDem;R[b].intBoughtKwh+=mb;R[b].gridImpKwh+=dem[b]-mb;}
    }
  }
  return {members:R,totProdKwh:totProd,totConsKwh:totCons,totMatchedKwh:totMatched,
    prodBySrc:prodBySrcTot,matchedBySrc:matchedBySrc,perQuarter:perQuarter};
}

// --- Platformverrekening -----------------------------------------------------

// Verrekent het EHP per kwartier met EPEX-prijzen + interne prijzen per bron.
//   intern verkocht:   tegen interne prijs van de bron (zon/wind/overig)
//   intern gekocht:    tegen gemengde interne prijs (+ platformfee)
//   extern verkocht:   (EPEX - terugleverafslag)        — overschot opwek naar net
//   extern gekocht:    (EPEX + leveranciersopslag + onbalans) — tekort van net
// internalPrices = {zon,wind,overig}. opts = {leveranciersOpslag, terugleverAfslag, fee,
//   onbalansOpslag, fallbackPrice}.
function calculatePlatformSettlement(perKwByMember,ts,sources,priceSeries,internalPrices,opts){
  perKwByMember=perKwByMember||[];ts=ts||[];sources=sources||[];opts=opts||{};internalPrices=internalPrices||{};
  var pZon=_num(internalPrices.zon,0),pWind=_num(internalPrices.wind,0),pOverig=_num(internalPrices.overig,0);
  var lev=_num(opts.leveranciersOpslag,0),afslag=_num(opts.terugleverAfslag,0),fee=_num(opts.fee,0),onb=_num(opts.onbalansOpslag,0);
  var fallback=(typeof opts.fallbackPrice==='number')?opts.fallbackPrice:null;
  var idx=buildPriceIndex(priceSeries||[]);
  var n=perKwByMember.length,T=n?perKwByMember[0].length:0;
  var priceOf=function(src){return src==='zon'?pZon:src==='wind'?pWind:pOverig;};
  var R=[];
  for(var m=0;m<n;m++)R.push({source:sources[m]||'overig',prodKwh:0,consKwh:0,
    intSoldKwh:0,intBoughtKwh:0,gridExpKwh:0,gridImpKwh:0,eurInt:0,eurGrid:0});
  var totProd=0,totCons=0,totMatched=0,platformFee=0,missingPriceCount=0,negativePriceCount=0;

  for(var t=0;t<T;t++){
    var prod=new Array(n),dem=new Array(n),tProd=0,tDem=0,prodBySrc={zon:0,wind:0,overig:0};
    for(var i=0;i<n;i++){
      var raw=_num(perKwByMember[i][t],0)*0.25,src=sources[i]||'overig';
      var kwh=(src==='none'&&raw<0)?0:raw;
      if(kwh<0){var pk=-kwh;prod[i]=pk;dem[i]=0;tProd+=pk;(prodBySrc[src]!=null?prodBySrc[src]+=pk:prodBySrc.overig+=pk);R[i].prodKwh+=pk;}
      else if(kwh>0){prod[i]=0;dem[i]=kwh;tDem+=kwh;R[i].consKwh+=kwh;}
      else{prod[i]=0;dem[i]=0;}
    }
    totProd+=tProd;totCons+=tDem;
    var epex=idx.priceAt(ts[t]);
    if(epex===null){if(fallback!==null)epex=fallback;else missingPriceCount++;} // null → externe € niet verrekend
    else if(epex<0)negativePriceCount++;
    var matched=Math.min(tProd,tDem);totMatched+=matched;
    var blended=tProd>0?(prodBySrc.zon*pZon+prodBySrc.wind*pWind+prodBySrc.overig*pOverig)/tProd:0;
    var fProd=tProd>0?matched/tProd:0,fDem=tDem>0?matched/tDem:0;
    for(var b=0;b<n;b++){
      if(prod[b]>0){
        var ms=prod[b]*fProd,sp=prod[b]-ms;
        R[b].intSoldKwh+=ms;R[b].eurInt+=ms*priceOf(sources[b]||'overig');
        R[b].gridExpKwh+=sp;if(epex!==null)R[b].eurGrid+=sp*(epex-afslag);
      }else if(dem[b]>0){
        var mb=dem[b]*fDem,df=dem[b]-mb;
        R[b].intBoughtKwh+=mb;R[b].eurInt-=mb*(blended+fee);platformFee+=mb*fee;
        R[b].gridImpKwh+=df;if(epex!==null)R[b].eurGrid-=df*(epex+lev+onb);
      }
    }
  }
  var sumSold=0,sumBought=0,totNet=0;
  R.forEach(function(x){x.net=x.eurInt+x.eurGrid;sumSold+=x.intSoldKwh;sumBought+=x.intBoughtKwh;totNet+=x.net;});
  return {members:R,totProdKwh:totProd,totConsKwh:totCons,totMatchedKwh:totMatched,
    platformFee:platformFee,totNet:totNet,intSoldKwh:sumSold,intBoughtKwh:sumBought,
    internalBalanceOk:Math.abs(sumSold-sumBought)<1e-6,
    missingPriceCount:missingPriceCount,negativePriceCount:negativePriceCount};
}

// --- Jaarafrekening ----------------------------------------------------------

// Combineert de huidige contractkosten tot een gestructureerde afrekening met
// regels (markt, opslagen, leveringskosten, energiebelasting, netkosten, btw) en totaal.
// opts.annualiseer=true schaalt een deelperiode (< 12 mnd) door naar een jaarbedrag.
function calculateAnnualStatement(company,quarterData,priceSeries,opts){
  opts=opts||{};
  var cc=calculateCurrentContractCosts(company,quarterData,priceSeries,opts);
  var nMnd=cc.nMnd||12;
  var annualiseer=opts.annualiseer===true&&nMnd>0&&nMnd<12;
  var factor=annualiseer?(12/nMnd):1;
  function regel(label,bedrag){return {label:label,bedrag:bedrag,bedragJaar:bedrag*factor};}
  var regels=[
    regel('Marktkosten afname',cc.marktKostenAfname),
    regel('Opbrengst teruglevering',-cc.opbrengstTeruglever),
    regel('Onbalans- en profielopslag',cc.opslagAfname),
    regel('Vaste leveringskosten',cc.leveringskosten),
    regel('Energiebelasting',cc.energiebelasting),
    regel('Netkosten',cc.netkosten),
    regel('Btw',cc.btw)
  ];
  return {company:(company&&company.name)||'',contractType:cc.type,
    periodeMaanden:nMnd,geannualiseerd:annualiseer,factor:factor,
    afnameKwh:cc.afnameKwh,terugleverKwh:cc.terugleverKwh,regels:regels,
    subtotaalExclBtw:cc.subtotaalExclBtw,btw:cc.btw,
    totaal:cc.totaal,totaalJaar:cc.totaal*factor,
    missingPriceCount:cc.missingPriceCount,negativePriceCount:cc.negativePriceCount,detail:cc};
}

// --- Volledige per-kwartier verrekenmotor ------------------------------------

// settlePlatform: transparante per-kwartier doorrekening van het EHP. Levert per bedrijf
// élke component apart, rolt op naar maand/jaar, en valideert zichzelf.
//
// input = {
//   members:[{id,name,source,kw:[…], stedinA?,stedinT?,gtvA?,gecontracteerdVermogen?}],
//   ts:[…],                       // tijdstempels, uitgelijnd op member.kw
//   priceSeries:[{ts,price}],     // kale EPEX/EEX €/kWh
//   internalPrices:{zon,wind,overig},
//   platform:{leveranciersOpslag, terugleverAfslag, platformkosten, onbalansOpslag, fallbackPrice},
//   eb:{toepassen, grondslag:'externeLevering'|'bruto'|'netto', jaar, heffingskortingPerLid},
//   btw:{toepassen, pct},
//   net:{toepassen, overschrijdingsTarief, collectief:{stedinA,stedinT,gtvA,gecontracteerdVermogen}, individueel},
//   keepQuarterMatrix:false }
function settlePlatform(input){
  input=input||{};
  var members=input.members||[],ts=input.ts||[],T=ts.length,n=members.length;
  var sources=members.map(function(m){return m.source||'overig';});
  var ip=input.internalPrices||{};
  var pZon=_num(ip.zon,0),pWind=_num(ip.wind,0),pOverig=_num(ip.overig,0);
  var priceOf=function(src){return src==='zon'?pZon:src==='wind'?pWind:pOverig;};
  var pf=input.platform||{};
  var lev=_num(pf.leveranciersOpslag,0),afslag=_num(pf.terugleverAfslag,0),
      platformkosten=_num(pf.platformkosten,0),onb=_num(pf.onbalansOpslag,0);
  var platformkostenDag=_num(pf.platformkostenDag,0);
  var nDagen=ts.length/96;
  var fallback=(typeof pf.fallbackPrice==='number')?pf.fallbackPrice:null;
  var ebCfg=input.eb||{},btwCfg=input.btw||{},netCfg=input.net||{};
  var ebOn=ebCfg.toepassen!==false,btwOn=btwCfg.toepassen!==false,netOn=netCfg.toepassen!==false;
  var ebMode=ebCfg.grondslag||'externeLevering';
  var ebStaffel=_ebStaffel({jaar:ebCfg.jaar,staffel:ebCfg.staffel});
  var btwPct=(typeof btwCfg.pct==='number')?btwCfg.pct:REKEN_DEFAULTS.btwPct;
  var idx=buildPriceIndex(input.priceSeries||[]);
  var keepMatrix=input.keepQuarterMatrix===true;

  // Per-bedrijf accumulatoren (energie-componenten, exact per kwartier optelbaar).
  function blankAcc(){return {verbruikKwh:0,productieKwh:0,interneAfnameKwh:0,interneLeveringKwh:0,
    externeInkoopKwh:0,externeVerkoopKwh:0,eurInterneHandel:0,eurInterneInkoop:0,eurInterneVerkoop:0,
    eurExterneInkoop:0,eurExterneVerkoop:0,
    eurLeveranciersopslag:0,eurTerugleverafslag:0,eurOnbalans:0,eurPlatformkosten:0,energiebelasting:0};}
  var acc=[],ebCum=[],ebPrevTax=[],monthAcc=[];
  for(var m=0;m<n;m++){acc.push(blankAcc());ebCum.push(0);ebPrevTax.push(0);monthAcc.push({});}

  var perQuarter=keepMatrix?[]:null;
  var totMatched=0,missingPriceCount=0,negativePriceCount=0,tsWithPrice=0;
  var ebQuarterSumAll=0; // controle: Σ kwartier-attributie EB

  for(var t=0;t<T;t++){
    var prod=new Array(n),dem=new Array(n),tProd=0,tDem=0,prodBySrc={zon:0,wind:0,overig:0};
    for(var i=0;i<n;i++){
      var raw=_num((members[i].kw||[])[t],0)*0.25,src=sources[i];
      var kwh=(src==='none'&&raw<0)?0:raw;
      if(kwh<0){var pk=-kwh;prod[i]=pk;dem[i]=0;tProd+=pk;(prodBySrc[src]!=null?prodBySrc[src]+=pk:prodBySrc.overig+=pk);}
      else if(kwh>0){prod[i]=0;dem[i]=kwh;tDem+=kwh;}
      else{prod[i]=0;dem[i]=0;}
    }
    var epexRaw=idx.priceAt(ts[t]),epex=epexRaw;
    if(epexRaw===null){if(fallback!==null)epex=fallback;else{missingPriceCount++;epex=null;}}
    else{tsWithPrice++;if(epexRaw<0)negativePriceCount++;}
    var matched=Math.min(tProd,tDem);totMatched+=matched;
    var blended=tProd>0?(prodBySrc.zon*pZon+prodBySrc.wind*pWind+prodBySrc.overig*pOverig)/tProd:0;
    var fProd=tProd>0?matched/tProd:0,fDem=tDem>0?matched/tDem:0;
    var mn=String(ts[t]).slice(0,7);

    for(var b=0;b<n;b++){
      var a=acc[b],src2=sources[b];
      var mAcc=monthAcc[b][mn]||(monthAcc[b][mn]=blankAcc());
      var intS=0,intB=0,gExp=0,gImp=0,
          eIntHandel=0,eIntInkoop=0,eIntVerkoop=0,eExtIn=0,eExtUit=0,eLev=0,eAfslag=0,eOnb=0,ePlat=0;
      a.verbruikKwh+=dem[b];a.productieKwh+=prod[b];
      mAcc.verbruikKwh+=dem[b];mAcc.productieKwh+=prod[b];
      if(prod[b]>0){
        intS=prod[b]*fProd;gExp=prod[b]-intS;
        eIntVerkoop=intS*priceOf(src2);eIntHandel=-eIntVerkoop;  // producent ontvangt (negatieve kost)
        if(epex!==null){eExtUit=gExp*epex;eAfslag=gExp*afslag;} // opbrengst markt − afslag
      }else if(dem[b]>0){
        intB=dem[b]*fDem;gImp=dem[b]-intB;
        eIntInkoop=intB*blended;eIntHandel=eIntInkoop;ePlat=intB*platformkosten; // afnemer betaalt intern + platformkosten
        if(epex!==null){eExtIn=gImp*epex;eLev=gImp*lev;eOnb=gImp*onb;}
      }
      a.interneLeveringKwh+=intS;a.interneAfnameKwh+=intB;a.externeVerkoopKwh+=gExp;a.externeInkoopKwh+=gImp;
      a.eurInterneHandel+=eIntHandel;a.eurInterneInkoop+=eIntInkoop;a.eurInterneVerkoop+=eIntVerkoop;
      a.eurExterneInkoop+=eExtIn;a.eurExterneVerkoop+=eExtUit;
      a.eurLeveranciersopslag+=eLev;a.eurTerugleverafslag+=eAfslag;a.eurOnbalans+=eOnb;a.eurPlatformkosten+=ePlat;
      mAcc.interneLeveringKwh+=intS;mAcc.interneAfnameKwh+=intB;mAcc.externeVerkoopKwh+=gExp;mAcc.externeInkoopKwh+=gImp;
      mAcc.eurInterneHandel+=eIntHandel;mAcc.eurInterneInkoop+=eIntInkoop;mAcc.eurInterneVerkoop+=eIntVerkoop;
      mAcc.eurExterneInkoop+=eExtIn;mAcc.eurExterneVerkoop+=eExtUit;
      mAcc.eurLeveranciersopslag+=eLev;mAcc.eurTerugleverafslag+=eAfslag;mAcc.eurOnbalans+=eOnb;mAcc.eurPlatformkosten+=ePlat;

      // Energiebelasting: lopende cumulatieve grondslag → marginale attributie (telescopisch sluitend).
      var ebQ=0;
      if(ebOn){
        var delta=ebMode==='bruto'?dem[b]:ebMode==='netto'?(dem[b]-prod[b]):gImp; // externeLevering=netinkoop
        ebCum[b]+=delta;
        var tax=_staffelTax(Math.max(0,ebCum[b]),ebStaffel).belasting;
        ebQ=tax-ebPrevTax[b];ebPrevTax[b]=tax;
        a.energiebelasting+=ebQ;mAcc.energiebelasting+=ebQ;ebQuarterSumAll+=ebQ;
      }
      if(keepMatrix){
        perQuarter.push({t:t,ts:ts[t],member:members[b].id||b,
          verbruikKwh:dem[b],productieKwh:prod[b],nettoKwh:dem[b]-prod[b],
          interneAfnameKwh:intB,interneLeveringKwh:intS,externeInkoopKwh:gImp,externeVerkoopKwh:gExp,
          eurInterneHandel:eIntHandel,eurExterneInkoop:eExtIn,eurExterneVerkoop:eExtUit,
          eurLeveranciersopslag:eLev,eurTerugleverafslag:eAfslag,eurOnbalans:eOnb,eurPlatformkosten:ePlat,
          energiebelasting:ebQ,epex:epex});
      }
    }
  }

  // Periodieke componenten per bedrijf: heffingskorting (EB), netkosten, btw, totaalbedrag.
  function monthRollup(map){
    return Object.keys(map).sort().map(function(k){var o=map[k];o.maand=k;
      o.nettoKwh=o.verbruikKwh-o.productieKwh;return o;});
  }
  var perCompany=members.map(function(mem,b){
    var a=acc[b];
    var korting=ebOn?_num(ebCfg.heffingskortingPerLid,REKEN_DEFAULTS.energiebelasting.heffingskorting):0;
    var energiebelasting=a.energiebelasting-korting;
    var netDetail=null,netkosten=0;
    if(netOn){
      var memData=ts.map(function(tt,i){return {ts:tt,kw:_num((mem.kw||[])[i],0)};});
      netDetail=calculateGridCosts(mem,memData,{overschrijdingsTarief:netCfg.overschrijdingsTarief,terugleverPiekTarief:netCfg.terugleverPiekTarief});
      netkosten=netDetail.totaal;
    }
    // Vaste dagkosten per deelnemer (€/dag modus), bovenop de per-kWh platformkosten.
    var dagkosten=platformkostenDag>0?platformkostenDag*nDagen:0;
    var eurPlatformkosten=a.eurPlatformkosten+dagkosten;
    // Subtotaal excl. btw (kostpositief; opbrengst externe verkoop verlaagt de kosten).
    var subtotaalExclBtw=a.eurInterneHandel
      +a.eurExterneInkoop+a.eurLeveranciersopslag+a.eurOnbalans
      -a.eurExterneVerkoop+a.eurTerugleverafslag
      +eurPlatformkosten+energiebelasting+netkosten;
    var btw=btwOn?subtotaalExclBtw*btwPct:0;
    return {id:mem.id,name:mem.name,source:sources[b],
      verbruikKwh:a.verbruikKwh,productieKwh:a.productieKwh,nettoKwh:a.verbruikKwh-a.productieKwh,
      interneAfnameKwh:a.interneAfnameKwh,interneLeveringKwh:a.interneLeveringKwh,
      externeInkoopKwh:a.externeInkoopKwh,externeVerkoopKwh:a.externeVerkoopKwh,
      eurInterneHandel:a.eurInterneHandel,eurInterneInkoop:a.eurInterneInkoop,eurInterneVerkoop:a.eurInterneVerkoop,
      eurExterneInkoop:a.eurExterneInkoop,eurExterneVerkoop:a.eurExterneVerkoop,
      eurLeveranciersopslag:a.eurLeveranciersopslag,eurTerugleverafslag:a.eurTerugleverafslag,
      eurOnbalans:a.eurOnbalans,eurPlatformkosten:eurPlatformkosten,
      energiebelasting:energiebelasting,energiebelastingVoorKorting:a.energiebelasting,heffingskorting:korting,
      netkosten:netkosten,netkostenDetail:netDetail,
      subtotaalExclBtw:subtotaalExclBtw,btw:btw,totaalbedrag:subtotaalExclBtw+btw,
      perMonth:monthRollup(monthAcc[b])};
  });

  // Platformtotalen.
  function sum(f){return perCompany.reduce(function(s,c){return s+f(c);},0);}
  var platform={
    verbruikKwh:sum(function(c){return c.verbruikKwh;}),productieKwh:sum(function(c){return c.productieKwh;}),
    interneAfnameKwh:sum(function(c){return c.interneAfnameKwh;}),interneLeveringKwh:sum(function(c){return c.interneLeveringKwh;}),
    externeInkoopKwh:sum(function(c){return c.externeInkoopKwh;}),externeVerkoopKwh:sum(function(c){return c.externeVerkoopKwh;}),
    totMatchedKwh:totMatched,
    eurPlatformkosten:sum(function(c){return c.eurPlatformkosten;}),
    energiebelasting:sum(function(c){return c.energiebelasting;}),netkosten:sum(function(c){return c.netkosten;}),
    btw:sum(function(c){return c.btw;}),totaalbedrag:sum(function(c){return c.totaalbedrag;})};

  // Collectieve netkostenvergelijking (configureerbare collectieve aansluiting).
  var netVergelijking=null;
  if(netOn&&netCfg.individueel!==false){
    var perKwByMember=members.map(function(mem){return ts.map(function(tt,i){return _num((mem.kw||[])[i],0);});});
    netVergelijking=compareGridCostsIndividualVsCollective(members,perKwByMember,ts,
      netCfg.collectief||{},{overschrijdingsTarief:netCfg.overschrijdingsTarief,terugleverPiekTarief:netCfg.terugleverPiekTarief});
  }

  var result={
    perCompany:perCompany,platform:platform,netVergelijking:netVergelijking,
    perQuarter:perQuarter,
    meta:{aantalKwartieren:T,aantalBedrijven:n,
      missingPriceCount:missingPriceCount,negativePriceCount:negativePriceCount,
      tsTotaal:T,tsMetPrijs:tsWithPrice,tsDekkingPct:T>0?tsWithPrice/T*100:0,
      ebGrondslag:ebMode,btwPct:btwPct,
      ebKwartierSom:ebQuarterSumAll,ebPeriodeBelasting:sum(function(c){return c.energiebelastingVoorKorting;}),
      waarschuwingen:(ebOn?[REKEN_DEFAULTS.energiebelasting.waarschuwing]:[])}
  };
  result.validations=validatePlatform(result);
  return result;
}

// --- Validaties --------------------------------------------------------------

// Controleert een settlePlatform-resultaat. Retourneert {status, checks:[{check,status,detail}]}.
function validatePlatform(result){
  result=result||{};
  var pc=result.perCompany||[],pl=result.platform||{},meta=result.meta||{};
  var TOL=1e-4,checks=[];
  function add(check,status,detail){checks.push({check:check,status:status,detail:detail});}

  // 1. interne afname == interne levering
  var dIntern=Math.abs((pl.interneAfnameKwh||0)-(pl.interneLeveringKwh||0));
  add('Interne afname == interne levering',dIntern<TOL?'pass':'fail',
    'Δ '+dIntern.toFixed(6)+' kWh (afname '+(pl.interneAfnameKwh||0).toFixed(2)+' / levering '+(pl.interneLeveringKwh||0).toFixed(2)+')');

  // 2. externe inkoop / verkoop niet negatief (per bedrijf)
  var negIn=pc.filter(function(c){return c.externeInkoopKwh<-TOL;});
  add('Externe inkoop niet negatief',negIn.length?'fail':'pass',negIn.length?negIn.length+' bedrijf/bedrijven negatief':'ok');
  var negUit=pc.filter(function(c){return c.externeVerkoopKwh<-TOL;});
  add('Externe verkoop niet negatief',negUit.length?'fail':'pass',negUit.length?negUit.length+' bedrijf/bedrijven negatief':'ok');

  // 3. ontbrekende prijsdata
  add('Prijsdata-dekking',meta.missingPriceCount>0?'warn':'pass',
    (meta.missingPriceCount||0)+' kwartier(en) zonder prijs · dekking '+(meta.tsDekkingPct||0).toFixed(1)+'%');

  // 4. negatieve EPEX correct verwerkt (informatief; niet geklemd)
  add('Negatieve EPEX-prijzen',(meta.negativePriceCount||0)>0?'info':'pass',
    (meta.negativePriceCount||0)+' kwartier(en) met negatieve prijs (correct verwerkt, niet geklemd)');

  // 5. btw niet dubbel geteld (btw == pct × btw-plichtige subtotaal per bedrijf)
  var btwOk=pc.every(function(c){return Math.abs((c.btw||0)-(c.subtotaalExclBtw||0)*(meta.btwPct||0))<TOL;});
  add('Btw niet dubbel geteld',btwOk?'pass':'fail','btw == '+( (meta.btwPct||0)*100).toFixed(0)+'% × subtotaal excl. btw');

  // 6. energiebelasting niet dubbel (Σ kwartier-attributie == periode-belasting)
  var dEb=Math.abs((meta.ebKwartierSom||0)-(meta.ebPeriodeBelasting||0));
  add('Energiebelasting reconcilieert',dEb<TOL?'pass':'fail','Δ € '+dEb.toFixed(6)+' (kwartier-attributie vs. periode)');

  // 7. timestamps meet- vs. prijsdata
  add('Timestamp-dekking meet/prijs',(meta.tsDekkingPct||0)>=100?'pass':((meta.tsDekkingPct||0)>0?'warn':'fail'),
    (meta.tsMetPrijs||0)+' / '+(meta.tsTotaal||0)+' kwartieren met prijs');

  // 8. kwartier ↔ maand ↔ jaar reconciliatie (volumes + energie-€)
  var reconStatus='pass',reconDetail='ok';
  pc.forEach(function(c){
    var mv=(c.perMonth||[]).reduce(function(s,m){return s+m.verbruikKwh;},0);
    var me=(c.perMonth||[]).reduce(function(s,m){return s+(m.eurExterneInkoop||0);},0);
    if(Math.abs(mv-c.verbruikKwh)>TOL||Math.abs(me-c.eurExterneInkoop)>TOL){reconStatus='fail';reconDetail='maand≠jaar bij '+(c.name||c.id);}
  });
  if(result.perQuarter){ // optionele matrix: Σ kwartier == jaar
    var qv={};result.perQuarter.forEach(function(r){qv[r.member]=(qv[r.member]||0)+r.verbruikKwh;});
    pc.forEach(function(c){if(Math.abs((qv[c.id]||0)-c.verbruikKwh)>TOL){reconStatus='fail';reconDetail='kwartier≠jaar bij '+(c.name||c.id);}});
  }
  add('Totalen kwartier↔maand↔jaar sluiten aan',reconStatus,reconDetail);

  var anyFail=checks.some(function(c){return c.status==='fail';});
  var anyWarn=checks.some(function(c){return c.status==='warn';});
  return {status:anyFail?'fail':(anyWarn?'warn':'pass'),checks:checks};
}

// --- Jaarrekening: huidige situatie vs. platformscenario ---------------------

// Verdeelt het gepoolde platformvoordeel via een sleutel. perCompany = [{id, eigenDelta,
// afnameKwh, productieKwh}]. sleutel: 'geen' (eigen delta) | 'gelijk' | 'volume' | 'inbreng'.
function distributeBenefit(perCompany,totaalVoordeel,sleutel){
  perCompany=perCompany||[];sleutel=sleutel||'geen';totaalVoordeel=_num(totaalVoordeel,0);
  var n=perCompany.length;
  var weights=perCompany.map(function(c){
    if(sleutel==='gelijk')return 1;
    if(sleutel==='volume')return Math.max(0,_num(c.afnameKwh,0));
    if(sleutel==='inbreng')return Math.max(0,_num(c.productieKwh,0));
    return 0;
  });
  var totW=weights.reduce(function(s,w){return s+w;},0);
  var out=perCompany.map(function(c,i){
    var aandeel;
    if(sleutel==='geen')aandeel=_num(c.eigenDelta,0);
    else if(totW>0)aandeel=totaalVoordeel*(weights[i]/totW);
    else aandeel=totaalVoordeel/(n||1); // fallback bij nul-gewichten: gelijk
    return {id:c.id,eigenDelta:_num(c.eigenDelta,0),aandeel:aandeel};
  });
  return {sleutel:sleutel,totaalVoordeel:totaalVoordeel,perCompany:out};
}

// Bouwt de financiële jaarrekening: per bedrijf de huidige contractsituatie
// (calculateCurrentContractCosts) vs. het platformscenario (settlePlatform), plus
// geconsolideerde totalen, voordeelverdeling en maand-rollup.
// members = [{id,name,source,company,data:[{ts,kw}]}]. assumptions = aannames-panel.
function buildAnnualComparison(members,priceSeries,assumptions){
  members=members||[];priceSeries=priceSeries||[];
  var a=assumptions||{};
  // 1. Overlappende kwartieren (zelfde basis voor beide scenario's).
  var maps=members.map(function(m){var mp={};(m.data||[]).forEach(function(d){mp[_normTs(d.ts)]=d.kw;});return mp;});
  var allTs=members.length?Object.keys(maps[0]).filter(function(ts){return maps.every(function(mp){return mp[ts]!==undefined;});}).sort():[];
  var perKwByMember=members.map(function(m,i){return allTs.map(function(ts){return _num(maps[i][ts],0);});});

  // 2. Platformscenario (één doorrekening voor de hele groep).
  var platMembers=members.map(function(m,i){var c=m.company||{};
    return {id:m.id,name:m.name,source:m.source,kw:perKwByMember[i],
      stedinA:c.stedinA,stedinT:c.stedinT,gtvA:c.gtvA,gecontracteerdVermogen:c.gecontracteerdVermogen};});
  var platRes=settlePlatform({
    members:platMembers,ts:allTs,priceSeries:priceSeries,internalPrices:a.internalPrices||{},
    platform:{leveranciersOpslag:a.leveranciersOpslag,terugleverAfslag:a.terugleverAfslag,
      platformkosten:a.platformkosten,platformkostenDag:a.platformkostenDag,onbalansOpslag:a.onbalansOpslag,fallbackPrice:a.fallbackPrice},
    eb:{toepassen:a.ebToepassen!==false,grondslag:a.ebGrondslag||'externeLevering',jaar:a.ebJaar,staffel:a.ebStaffel,heffingskortingPerLid:a.heffingskortingPerLid},
    btw:{toepassen:a.btwToepassen!==false,pct:a.btwPct},
    net:{toepassen:a.netToepassen!==false,overschrijdingsTarief:a.overschrijdingsTarief,collectief:a.collectief,individueel:true},
    keepQuarterMatrix:a.keepQuarterMatrix===true
  });

  // 3. Per bedrijf: huidige situatie + vergelijking.
  var gem=function(eur,kwh){return kwh>1e-9?eur/kwh:0;};
  var perCompany=members.map(function(m,i){
    var c=m.company||{};
    var overlapData=allTs.map(function(ts){return {ts:ts,kw:_num(maps[i][ts],0)};});
    var cur=calculateCurrentContractCosts(c,overlapData,priceSeries,{
      btwPct:a.btwPct,jaar:a.ebJaar,staffel:a.ebStaffel,heffingskorting:a.heffingskortingPerLid,fallbackPrice:a.fallbackPrice,includeGridCosts:a.netToepassen!==false});
    var pf=platRes.perCompany[i],afname=pf.verbruikKwh,terug=pf.productieKwh;
    var huidig={energiekosten:cur.marktKostenAfname,opbrengsten:cur.opbrengstTeruglever,opslagAfname:cur.opslagAfname,
      leveranciersopslag:0,terugleverafslag:0,onbalans:0,energiebelasting:cur.energiebelasting,btw:cur.btw,
      netkosten:cur.netkosten,platformkosten:0,vasteKosten:cur.leveringskosten,totaal:cur.totaal};
    var platform={energiekosten:pf.eurInterneInkoop+pf.eurExterneInkoop,opbrengsten:pf.eurInterneVerkoop+pf.eurExterneVerkoop,
      leveranciersopslag:pf.eurLeveranciersopslag,terugleverafslag:pf.eurTerugleverafslag,onbalans:pf.eurOnbalans,
      energiebelasting:pf.energiebelasting,btw:pf.btw,netkosten:pf.netkosten,platformkosten:pf.eurPlatformkosten,
      vasteKosten:0,totaal:pf.totaalbedrag};
    var verschil=huidig.totaal-platform.totaal;
    return {id:m.id,name:m.name,source:m.source,afnameKwh:afname,terugleverKwh:terug,
      internAfnameKwh:pf.interneAfnameKwh,internLeveringKwh:pf.interneLeveringKwh,
      externInkoopKwh:pf.externeInkoopKwh,externVerkoopKwh:pf.externeVerkoopKwh,
      gemInkoopHuidig:gem(huidig.energiekosten+huidig.opslagAfname,afname),gemVerkoopHuidig:gem(huidig.opbrengsten,terug),
      gemInkoopPlatform:gem(pf.eurInterneInkoop+pf.eurExterneInkoop+pf.eurLeveranciersopslag+pf.eurOnbalans,afname),
      gemVerkoopPlatform:gem(pf.eurInterneVerkoop+pf.eurExterneVerkoop-pf.eurTerugleverafslag,terug),
      huidig:huidig,platform:platform,nettoHuidig:huidig.totaal,nettoPlatform:platform.totaal,
      verschil:verschil,besparingPct:Math.abs(huidig.totaal)>1e-9?verschil/Math.abs(huidig.totaal)*100:0,
      curDetail:cur,platDetail:pf};
  });

  // 4. Geconsolideerd + voordeelverdeling.
  function csum(f){return perCompany.reduce(function(s,c){return s+f(c);},0);}
  var totaalVoordeel=csum(function(c){return c.verschil;}),totHuidig=csum(function(c){return c.nettoHuidig;});
  var consolidated={
    platformVolumeKwh:platRes.platform.verbruikKwh,productieKwh:platRes.platform.productieKwh,
    afnameKwh:csum(function(c){return c.afnameKwh;}),terugleverKwh:csum(function(c){return c.terugleverKwh;}),
    internMatchingKwh:platRes.platform.interneLeveringKwh,
    externInkoopKwh:csum(function(c){return c.externInkoopKwh;}),externVerkoopKwh:csum(function(c){return c.externVerkoopKwh;}),
    platformkosten:csum(function(c){return c.platform.platformkosten;}),
    nettoHuidig:totHuidig,nettoPlatform:csum(function(c){return c.nettoPlatform;}),
    totaalVoordeel:totaalVoordeel,totaalVoordeelPct:Math.abs(totHuidig)>1e-9?totaalVoordeel/Math.abs(totHuidig)*100:0};
  var voordeelverdeling=distributeBenefit(
    perCompany.map(function(c){return {id:c.id,eigenDelta:c.verschil,afnameKwh:c.afnameKwh,productieKwh:c.terugleverKwh};}),
    totaalVoordeel,a.verdeelsleutel||'geen');

  // 5. Platform-maandrollup (som van per-bedrijf perMonth).
  var monthMap={};
  platRes.perCompany.forEach(function(pf){(pf.perMonth||[]).forEach(function(mm){
    var o=monthMap[mm.maand]||(monthMap[mm.maand]={maand:mm.maand,verbruikKwh:0,productieKwh:0,
      eurInterneInkoop:0,eurInterneVerkoop:0,eurExterneInkoop:0,eurExterneVerkoop:0,
      eurLeveranciersopslag:0,eurTerugleverafslag:0,eurOnbalans:0,eurPlatformkosten:0,energiebelasting:0});
    o.verbruikKwh+=mm.verbruikKwh;o.productieKwh+=mm.productieKwh;
    o.eurInterneInkoop+=(mm.eurInterneInkoop||0);o.eurInterneVerkoop+=(mm.eurInterneVerkoop||0);
    o.eurExterneInkoop+=mm.eurExterneInkoop;o.eurExterneVerkoop+=mm.eurExterneVerkoop;
    o.eurLeveranciersopslag+=mm.eurLeveranciersopslag;o.eurTerugleverafslag+=mm.eurTerugleverafslag;
    o.eurOnbalans+=mm.eurOnbalans;o.eurPlatformkosten+=mm.eurPlatformkosten;o.energiebelasting+=mm.energiebelasting;
  });});
  var perMonth=Object.keys(monthMap).sort().map(function(k){return monthMap[k];});

  return {periode:{start:allTs[0]||null,end:allTs[allTs.length-1]||null,kwartieren:allTs.length},
    perCompany:perCompany,consolidated:consolidated,voordeelverdeling:voordeelverdeling,
    perMonth:perMonth,perQuarter:platRes.perQuarter,netVergelijking:platRes.netVergelijking,
    platformValidations:platRes.validations,meta:platRes.meta,allTs:allTs};
}

// --- Dual-mode export (browser-global + Node voor tests) ---------------------

if(typeof module!=='undefined'&&module.exports){
  module.exports={REKEN_DEFAULTS:REKEN_DEFAULTS,normalizeContract:normalizeContract,
    distributeBenefit:distributeBenefit,buildAnnualComparison:buildAnnualComparison,
    buildPriceIndex:buildPriceIndex,splitQuarter:splitQuarter,calculateEnergyTax:calculateEnergyTax,
    calculateBtw:calculateBtw,calculateGridCosts:calculateGridCosts,
    compareGridCostsIndividualVsCollective:compareGridCostsIndividualVsCollective,
    calculateCurrentContractCosts:calculateCurrentContractCosts,
    allocateInternalEnergy:allocateInternalEnergy,calculatePlatformSettlement:calculatePlatformSettlement,
    calculateAnnualStatement:calculateAnnualStatement,settlePlatform:settlePlatform,validatePlatform:validatePlatform};
}
