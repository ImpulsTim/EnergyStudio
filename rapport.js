function printRapport(){
  var content=document.getElementById('rContent').innerHTML;
  var w=window.open('','_blank');
  if(!w){notify('Sta pop-ups toe voor afdrukken',false);return;}
  w.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Rapport</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Tahoma,Arial,sans-serif;font-size:10pt;color:#242b38;line-height:1.6}h2{font-size:12pt;font-weight:900;margin:20px 0 5px;padding-bottom:3px;border-bottom:3px solid #fbba00;page-break-after:avoid}h3{font-size:10pt;font-weight:700;color:#46962b;margin:12px 0 3px;text-transform:uppercase}table{width:100%;border-collapse:collapse;font-size:9pt;margin-bottom:10px}thead th{background:#242b38;color:#fff;padding:4px 7px;text-align:left;-webkit-print-color-adjust:exact;print-color-adjust:exact}td{padding:4px 7px;border-bottom:1px solid #e2ecdf}tr:nth-child(even){background:#f7fbf5;-webkit-print-color-adjust:exact;print-color-adjust:exact}.ib{background:#edf5ea;border-left:3px solid #46962b;padding:5px 9px;font-size:9pt;color:#3a7d23;margin:4px 0 9px;-webkit-print-color-adjust:exact;print-color-adjust:exact}.ib2{background:#f2f8fa;border-left:3px solid #a6d6cc;padding:5px 9px;font-size:9pt;color:#555;margin:4px 0 9px;-webkit-print-color-adjust:exact;print-color-adjust:exact}.kg{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin:8px 0 13px}.kb{border:1px solid #e2ecdf;border-radius:4px;padding:6px 8px}.kl{font-size:8pt;font-weight:700;text-transform:uppercase;color:#999;margin-bottom:2px}.kv{font-size:14pt;font-weight:900}.ks{font-size:8pt;color:#aaa}img{width:100%;margin:4px 0;page-break-inside:avoid}.pb{page-break-before:always}.ft{margin-top:18px;padding-top:8px;border-top:1px solid #e2ecdf;font-size:8pt;color:#aaa;display:flex;justify-content:space-between}</style></head><body>'+content+'</body></html>');
  w.document.close();setTimeout(function(){w.focus();w.print();},500);
}

function doExportRapport(){
  if(!_piek){notify('Voer eerst een analyse uit',false);return;}
  var proj=ap();var cos=selC();
  var datum=new Date().toLocaleDateString('nl-NL',{day:'2-digit',month:'long',year:'numeric'});
  function ci(id,h){var c=document.getElementById(id);if(!c)return'';try{return '<img src="'+c.toDataURL()+'" style="height:'+(h||180)+'px;object-fit:contain">';}catch(e){return'';}}
  var krs=[
    ['Overlap kwartierwaarden',document.getElementById('kOvlp').textContent,'Aanwezig bij alle profielen'],
    ['Piek afname groep',document.getElementById('kPA').textContent+' kW','Hoogste kwartiergemiddeld vermogen'],
    ['Piek teruglevering',document.getElementById('kPT').textContent+' kW','Hoogste teruglevering'],
    ['GTV-overschrijdingen',document.getElementById('kOA').textContent,'Boven groeps-GTV afname'],
    ['GTV-T overschrijdingen',document.getElementById('kOT').textContent,'Boven groeps-GTV-T'],
    ['Totaal volume',document.getElementById('kVol').textContent+' MWh','Gecombineerd energievolume'],
  ];
  var gtoRws=[].slice.call(document.getElementById('gtoBody').querySelectorAll('tr')).map(function(tr){return [].slice.call(tr.querySelectorAll('td')).map(function(td){return td.textContent.trim();});}).filter(function(r){return r.length>1;});
  var aRows=cos.map(function(c,i){return '<tr><td><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:'+PAL[i%PAL.length]+';margin-right:4px"></span>'+c.name+'</td><td>'+(c.ean||'—')+'</td><td>'+c.category+'</td><td>'+c.gtvA+'kW</td><td>'+c.gtvT+'kW</td><td>'+(SA[c.stedinA||'none']||SA.none).l+'</td><td>'+(ST[c.stedinT||'none']||ST.none).l+'</td></tr>';}).join('');
  var html=
    '<div style="background:#242b38;padding:12px 16px;display:flex;align-items:center;gap:10px;margin:-24px -28px 18px">'+
    '<svg width="34" height="34" viewBox="0 0 44 44" fill="none"><circle cx="22" cy="22" r="21" stroke="#46962b" stroke-width="1.5" opacity=".4"/><path d="M14 22 Q18 14 22 22 Q26 30 30 22" stroke="#fbba00" stroke-width="2.5" fill="none" stroke-linecap="round"/><path d="M14 22 Q18 16 22 22 Q26 28 30 22" stroke="#a6d6cc" stroke-width="2" fill="none" stroke-linecap="round" opacity=".7"/><path d="M14 22 Q18 18 22 22 Q26 26 30 22" stroke="#46962b" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>'+
    '<div><div style="color:#fff;font-size:15pt;font-weight:900">Impuls <span style="color:#46962b">Zeeland</span></div><div style="color:#a6d6cc;font-size:8pt;font-weight:700;letter-spacing:1px;text-transform:uppercase">Energiegroepsprofiel Tool</div></div>'+
    '<div style="margin-left:auto;color:#a6d6cc;font-size:9pt;text-align:right">'+datum+'<br>Rapportage</div></div>'+
    '<div style="height:4px;background:#fbba00;margin:-3px -28px 16px"></div>'+
    '<div style="font-size:17pt;font-weight:900;margin-bottom:3px">'+proj.name+'</div>'+
    '<div style="font-size:11pt;font-weight:700;color:#46962b;margin-bottom:4px">Analyse Energiegroepsprofiel</div>'+
    '<div style="font-size:9pt;color:#888;margin-bottom:16px">'+datum+(proj.desc?' · '+proj.desc:'')+'</div>'+
    '<h2>1. Samenvatting</h2>'+
    '<div class="ib">Rapport van het gecombineerde energieprofiel van '+cos.length+' aansluiting'+(cos.length===1?'':'en')+' in project '+proj.name+'. Groepsprofiel berekend op overlappende kwartierwaarden. Eenheid: kW (kWh/kwartier x 4).</div>'+
    '<div class="kg">'+krs.map(function(r){return '<div class="kb"><div class="kl">'+r[0]+'</div><div class="kv">'+(r[1]||'—')+'</div><div class="ks">'+r[2]+'</div></div>';}).join('')+'</div>'+
    '<h2>2. Aansluitingen</h2>'+
    '<table><thead><tr><th>Naam</th><th>EAN</th><th>Cat.</th><th>GTV</th><th>GTV-T</th><th>Aansluitcat.</th><th>Transportcat.</th></tr></thead><tbody>'+aRows+'</tbody></table>'+
    '<h2 class="pb">3. Jaarprofiel</h2><div class="ib2">Vermogen per kwartier. Positief = afname, negatief = teruglevering. Stippellijnen = groeps-GTV.</div>'+ci('cJaarG',200)+'<h3>Per aansluiting</h3>'+ci('cJaar',160)+
    '<h2 class="pb">4. Weekprofiel</h2><div class="ib2">Gemiddeld, minimum en maximum vermogen per kwartier over alle weken.</div>'+ci('cWeek',180)+
    '<h2 class="pb">5. Belastingduurkromme</h2><div class="ib2">Hoe vaak een vermogensniveau bereikt of overschreden wordt. Dikke zwarte lijn = groep totaal. Rechter as = cumulatief MWh.</div><h3>Afname</h3>'+ci('cBdk',180)+'<h3>Teruglevering</h3>'+ci('cBdkT',160)+
    '<h2 class="pb">6. Piekanalyse & GTO-besparing</h2>'+
    '<div class="ib">Bij een GTO worden kW-max kosten berekend over de collectieve piek, niet de som van individuele pieken. Gecombineerde piek = maandpiek afname + maandpiek teruglevering.</div>'+
    ci('cPiek',200)+ci('cPiekK',160)+
    '<h3>GTO-besparing per maand</h3>'+
    '<table><thead><tr><th>Maand</th><th>Som ind. pieken (kW)</th><th>Coll. piek (kW)</th><th>Diversiteitswinst (kW)</th><th>Besparing (€)</th></tr></thead><tbody>'+
    gtoRws.map(function(r){return '<tr>'+r.map(function(v){return '<td>'+v+'</td>';}).join('')+'</tr>';}).join('')+'</tbody></table>'+
    '<h2 class="pb">7. Kostenoverzicht</h2><div class="ib2">Stedin tarieven 2026. kW-max en kW-contract = gecombineerde piek (afname + teruglevering). Excl. BTW.</div>'+ci('cKost',180)+
    '<h2>8. Methodologie</h2>'+
    '<table><thead><tr><th>Onderwerp</th><th>Toelichting</th></tr></thead><tbody>'+
    '<tr><td><strong>Eenheid</strong></td><td>kWh/kwartier x 4 = kW gemiddeld vermogen (CSV en JSON)</td></tr>'+
    '<tr><td><strong>Groepsprofiel</strong></td><td>Alleen overlappende timestamps aanwezig bij alle aansluitingen</td></tr>'+
    '<tr><td><strong>kW-max</strong></td><td>Maandpiek afname + maandpiek teruglevering per aansluiting</td></tr>'+
    '<tr><td><strong>kW-contract</strong></td><td>(GTV afname + GTV-T teruglevering) x tarief per maand</td></tr>'+
    '<tr><td><strong>Dubbel tarief</strong></td><td>Normaal: ma-vr 07:00-23:00. Laag: overig, weekenden, feestdagen</td></tr>'+
    '<tr><td><strong>GTO-besparing</strong></td><td>Verschil som individuele kW-max kosten en collectieve kW-max kosten</td></tr>'+
    '</tbody></table>'+
    '<div class="ft"><span>Impuls Zeeland · Energiegroepsprofiel Tool</span><span>'+datum+'</span></div>';
  document.getElementById('rContent').innerHTML=html;
  showM('mRap');notify('Rapport klaar — klik Afdrukken/PDF');
}
