# Energy Studio

Browserapplicatie voor het analyseren van collectieve energieprofielen, groeps-GTV en energiehandelsplatformen. De tool is gericht op Nederlandse energiecooperaties, bedrijventerreinen en energiehubs die kwartierdata willen combineren, visualiseren en rapporteren.

## Wat kun je ermee?

- Projecten en aansluitingen beheren voor elektra, gas en warmte.
- Meetdata importeren uit CSV of MEPS-achtige JSON-bestanden.
- Groepsprofielen berekenen op basis van kwartierwaarden.
- Groeps-GTV, pieken, overschrijdingen, weekprofielen en jaarprofielen analyseren.
- Scenario's doorrekenen, zoals zonnepanelen en batterijopslag.
- Energiehandelsplatformen (EHP) modelleren met opwek, EPEX/forwardprijzen, gelijktijdigheid, GVO en onbalans.
- Individuele aansluitingen analyseren: kengetallen, netcongestie (GTV), baseload, top-10 pieken en jaar-/week-/duurbelastingprofiel.
- Rapporten genereren voor GTO, EHP en individuele analyses, inclusief HTML/PDF-export.
- Projectdata exporteren en importeren, optioneel versleuteld met AES-256.

## Snel starten

Er is geen buildstap en geen server nodig.

1. Clone of download deze repository.
2. Open `index.html` in een moderne browser.
3. Voer het toegangswachtwoord in.
4. Maak een project aan of gebruik het standaardproject.
5. Voeg aansluitingen toe en upload meetdata.
6. Klik op `Bereken groepsprofiel` om de analyse te starten.

Voor sommige browserfuncties, zoals versleutelde export via Web Crypto, werkt openen via `file://` of HTTPS het betrouwbaarst.

## Toegang

De applicatie heeft een eenvoudige client-side wachtwoordpoort in `access.js`. Wil je het wachtwoord wijzigen, vervang dan de SHA-256 hash in `access.js`. Voorbeeld met Node.js:

```bash
node -e "console.log(require('crypto').createHash('sha256').update('nieuw-wachtwoord').digest('hex'))"
```

Vervang daarna de waarde van `ACCESS_HASH` door de nieuwe hash.

Belangrijk: dit is alleen een praktische drempel tegen direct gebruik. Omdat de app volledig in de browser draait, kan iemand met toegang tot de broncode deze controle omzeilen. Gebruik voor echte toegangscontrole een private repository, besloten hosting, HTTP Basic Auth, Cloudflare Access, Netlify/Vercel-password protection of een server-side login.

## Invoerformaten

### Elektra

CSV met minimaal twee kolommen:

```csv
timestamp;waarde
2024-01-01T00:00;12.34
2024-01-01T00:15;11.80
```

De waarde wordt gelezen als kWh per kwartier en intern omgerekend naar kW. Negatieve waarden worden gebruikt als teruglevering/opwek.

Ook ondersteund:

- komma- of puntkomma-gescheiden CSV;
- CSV met kolomnaam `netto`;
- MEPS-achtige JSON met `market_evaluation_points`, `meter_readings` en `interval_readings`.

### Gas en warmte

CSV met `timestamp;waarde`.

- Gas: waarde in m3 per interval.
- Warmte: waarde in kWh per interval.

Het interval wordt tijdens de analyse genormaliseerd naar kwartieren.

### EHP-data

Voor het energiehandelsplatform kunnen aanvullende bestanden worden gebruikt, zoals:

- opwekdata per asset;
- EPEX-prijzen;
- forwardcurve-data;
- platform- en tariefinstellingen.

## Exports

De applicatie kan verschillende bestanden genereren:

- groepsprofiel als JSON;
- volledige projectexport als JSON;
- versleutelde projectexport;
- GTO-rapport als HTML/PDF;
- EHP-rapport als HTML/PDF;
- individueel analyserapport als HTML/PDF.

Alle projectdata wordt lokaal in de browser opgeslagen via IndexedDB. Er is geen backend in deze repository.

## Techniek

De app is gebouwd met plain HTML, CSS en JavaScript. De modules worden direct door `index.html` geladen.

Belangrijkste externe libraries via CDN:

- Chart.js voor grafieken;
- chartjs-chart-sankey voor energiestromen;
- Leaflet voor kaartweergave;
- SheetJS voor Excel-invoer;
- html2pdf.js en html-to-image voor rapportage/export;
- Google Fonts, Barlow.

## Projectstructuur

```text
.
├── index.html              # Hoofdscherm en scriptvolgorde
├── style.css               # Styling van de applicatie
├── app.js                  # Applicatiestatus, UI-events en hoofdflow
├── db.js                   # IndexedDB-opslag
├── parsers.js              # CSV/JSON-prijs- en meetdataparsers
├── rekenkern.js            # Analyse- en rekenlogica (incl. maandDekking)
├── energiemodel.js         # EnergieModel/EHP-rekenmodel
├── ehp.js                  # EHP-interface en berekeningen
├── individueel.js          # Individuele analyse: rekenkern + UI
├── financieel.js           # Financiele analyses
├── rapport.js              # GTO-rapportage
├── rapport_ehp.js          # EHP-rapportage
├── rapport_ind.js          # Individueel analyserapport
├── crypto.js               # Versleutelde export/import
├── tarieven.js             # Tarief- en systeemdefinities
└── charts/                 # Grafiekmodules (incl. individueel.js)
```

## Datadekking per maand

Maandgrafieken sommeren per kalendermaand. Ontbreekt er meetdata — begin/eind van de meetperiode, meteruitval, of afkapping door het jaarfilter — dan wordt een staaf lager zonder dat dat iets over het verbruik zegt. `maandDekking()` in `rekenkern.js` bepaalt per maand welk deel van de verwachte kwartieren (`dagen × 96`) daadwerkelijk aanwezig is. Onder `MAAND_DEKKING_DREMPEL` (99%) geldt een maand als onvolledig; zomertijd kost hooguit 4 kwartieren en valt dus buiten de markering.

Onvolledige maanden worden overal hetzelfde weergegeven: gearceerde staaf met contour (`hatchPat()`/`hatchBar()` in `app.js`), een asterisk bij het aslabel, de exacte dagentelling in de tooltip, en een waarschuwing in de kaart via `onvolledigNotice()`. Ze tellen bovendien niet mee in afgeleide getallen die anders vertekenen: de gas-baseload ("laagste maand") en de jaar-extrapolatie van de GTO-besparing.

Toegepast in: individuele analyse (`charts/individueel.js`), gas- en huboverzicht en jaarvergelijking (`app.js`), gelijktijdigheid (`charts/gelijktijdigheid.js`) en piekanalyse (`charts/piekanalyse.js`).

## Netkosten bij een GTO (kW-max en kW-contract)

De rekenregels staan als helpers in `tarieven.js` en worden gedeeld door de piekanalyse, het GTO-rapport, de scenario's en de rekenkern. Ze zijn op 22-09-2026 regel voor regel geverifieerd tegen de originele bronnen:

| Bron | Gebruikt voor |
|------|---------------|
| Stedin tariefblad elektriciteit grootverbruik 2026, tabel 2 en 3 | alle bedragen in `SA` en `ST` (exact gecontroleerd, inclusief het onderscheid tussen decimalen en voetnootverwijzingen) |
| Stedin Tarieven- en vergoedingsregeling 2026, art. 3 lid 2 en art. 5 lid 1 | indeling op GTV, met plafond op de aansluitcategorie |
| Tarievencode elektriciteit art. 3.7.1, 3.7.2, 3.7.9, 3.7.10 | tariefcategorieën en tariefdragers; art. 3.7.10a levert de "verhoging" voor de toeslag |
| ACM Codebesluit groepstransportovereenkomst, Stcrt. 2025 nr. 43262 (besluit 11-12-2025, in werking 20-12-2025) | de nieuwe artikelen 3.1.3a, 3.7.2a, 3.7.18 en 3.7.19 |

### Drie begrippen die niet samenvallen

- **Netvlak / aansluitcategorie** — waar de aansluiting fysiek op zit. `connNetvlakCat()`, afgeleid uit kVA met `stCatUitKva()`.
- **Individuele tariefcategorie** — waarop een deelnemer *zonder* GTO wordt afgerekend: het systeemvlak van de aansluiting. `connTariefCat()`. Zie de keuze hieronder.
- **Groepstariefcategorie** — waarop de GTO wordt afgerekend: het hoogste netvlak in de groep (art. 3.7.2a), ongeacht GTV. `groepsStCat()`.

### Bewuste keuze: systeemvlak, niet gecontracteerd vermogen

Voor de individuele "voor"-situatie botsen twee lezingen:

- **Tarievencode art. 3.7.2** en **Stedin TVE 2026 art. 5 lid 1** delen een losse afnemer in op zijn **gecontracteerd transportvermogen** (t/m 50 kW LS, 51–150 Trafo MS/LS, 151–1.500 MS), begrensd door de aansluitcategorie.
- **Stedin heeft schriftelijk bevestigd**, op de concrete vraag of een aansluiting van 3×315A (218 kVA) met een kW-contract van 137 het Trafo MS/LS- of het MS-D-tarief betaalt: *"Het GTV is niet leidend voor de tariefcategorie maar de aansluiting van de klant. Er moet dus niet gekeken worden naar kWcontract maar naar het systeemvlak waarop de aansluitingen aangesloten zijn."*

De app volgt de bevestiging van de netbeheerder. Dat is ook de behoudende kant: de GTV-lezing plaatst deelnemers met een laag GTV individueel in de duurdere Trafo MS/LS-categorie, waardoor de GTO een tariefstap "bespaart" die de MS/LS-toeslag van art. 3.7.19 níét terughaalt — die toeslag hangt aan de fysieke categorie A.3, niet aan het GTV. Dat die twee niet op elkaar aansluiten, is het signaal dat de GTV-lezing de besparing overschat.

`gtoGtvAfwijking()` spoort de aansluitingen op waar beide lezingen uiteenlopen. De berekening verandert er niet door; de piekanalyse en het rapport benoemen ze, zodat de gevoeligheid zichtbaar blijft.

### Wat een GTO wel en niet verandert

| Post | Effect | Grond |
|------|--------|-------|
| kW-contract | één groeps-GTV tegen het groepstarief i.p.v. per deelnemer | art. 3.7.18 onderdeel a |
| kW-max | netto groepsprofiel per kwartier i.p.v. som van individuele pieken | art. 3.7.18 onderdeel b |
| MS/LS-toeslag | komt erbij zodra de groep A.3 én A.4/A.5 bevat | art. 3.7.19 |
| Vastrecht | ongewijzigd (som van de individuele netvlakken) | art. 3.1.3a |
| kWh / dubbeltarief | ongewijzigd (totaal over de afzonderlijke aansluitingen) | art. 3.7.18 onderdeel c |
| Periodieke aansluitvergoeding | ongewijzigd, de aansluitovereenkomst blijft per deelnemer | Stcrt. 2025-43262, rnr. 2 |

**Geen correctiefactor.** De netbeheerders stelden een factor 1,21 voor op kW-contract en kW-max van de groep. De ACM heeft die niet overgenomen (rnr. 177). Er wordt hier dus zonder opslagfactor gerekend.

**MS/LS-toeslag** (`MSLS_TOESLAG`, `gtoToeslagPerMaand()`). Art. 3.7.19 luidt: per maand 1/12 van de in art. 3.7.10 onderdeel a bedoelde verhoging, vermenigvuldigd met de som van de kW-max-waarden van de A.3-aansluitingen in de groep. Die verhoging is het bedrag waarmee het kW-contract-tarief van Trafo MS/LS dat van MS overstijgt. De wet rekent met jaartarieven en deelt door 12; Stedin publiceert maandtarieven, dus blijft het verschil in maandtarief over: **€ 1,9080/kW/maand** (3,9308 − 2,0228). Alleen de maandpieken van de A.3-deelnemers tellen mee.

### Bewuste aanname: de A.3-grens

Art. 3.7.19 wijst de toeslag toe aan aansluitcapaciteitscategorie **A.3**, door de ACM omschreven als "60 kVA tot en met 0,3 MVA met een zuivere LS-aansluiting". Stedin hanteert in tabel 1 en 2 van het tariefblad echter een grens van **175 kVA**. Deze app volgt de Stedin-grens, omdat de afrekening van Stedin komt. Aansluitingen tussen 175 en 300 kVA vallen daardoor in een grijze zone waar beide lezingen tot het tegenovergestelde antwoord leiden; `gtoGrijzeZone()` spoort die op en de piekanalyse waarschuwt er zichtbaar voor. De grenzen staan als constanten bovenin `tarieven.js` (`A3_GRENS_KVA`, `A3_GRENS_KVA_ACM`).

### Uitkomst

Totale besparing = (kW-max individueel − collectief − toeslag) + (kW-contract individueel − collectief). Beide delen kunnen negatief zijn: bij weinig diversiteit weegt de toeslag zwaarder dan de kW-max-winst. De piekanalyse toont alle posten apart en kleurt een negatieve uitkomst rood. De kW-contract-besparing hangt volledig aan het groeps-GTV dat met de netbeheerder wordt afgesproken (veld *GTV afname* in de zijbalk); staat dat gelijk aan de som van de individuele GTV's, dan resteert alleen het tariefeffect.

## Ontwikkelen

Omdat de applicatie geen bundler gebruikt, is de scriptvolgorde in `index.html` belangrijk. Nieuwe modules moeten voor `app.js` worden geladen als ze globale functies of configuratie leveren.

Aanbevolen werkwijze:

1. Open `index.html` in de browser.
2. Gebruik de browserconsole voor fouten en logging.
3. Pas JavaScript/CSS direct aan.
4. Test minimaal import, analyse, scenario's en rapportgeneratie na wijzigingen in gedeelde logica.

## Privacy

Meetdata en projectinstellingen blijven lokaal in de browser staan, tenzij je zelf een exportbestand deelt. Let op: browserdata kan worden gewist door browserinstellingen, profielopschoning of private/incognito-modus. Maak daarom regelmatig een projectexport.

## Licentie

MIT
