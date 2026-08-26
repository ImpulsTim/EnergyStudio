# Energy Studio

Browserapplicatie voor het analyseren van collectieve energieprofielen, groeps-GTV en energiehandelsplatformen. De tool is gericht op Nederlandse energiecooperaties, bedrijventerreinen en energiehubs die kwartierdata willen combineren, visualiseren en rapporteren.

## Wat kun je ermee?

- Projecten en aansluitingen beheren voor elektra, gas en warmte.
- Meetdata importeren uit CSV of MEPS-achtige JSON-bestanden.
- Groepsprofielen berekenen op basis van kwartierwaarden.
- Groeps-GTV, pieken, overschrijdingen, weekprofielen en jaarprofielen analyseren.
- Scenario's doorrekenen, zoals zonnepanelen en batterijopslag.
- Energiehandelsplatformen (EHP) modelleren met opwek, EPEX/forwardprijzen, gelijktijdigheid, GVO en onbalans.
- Batterijopslag doorrekenen in twee werkwijzen: matching eerst en daarna opslag, of opslag en matching in samenhang op prijs en tijd (zie [Matching en opslag](#matching-en-opslag-in-het-ehp)).
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
├── energiemodel.js         # EHP-rekenmodel (referentie/regressiebasis)
├── ehp/                    # EHP-modellaag: aannames, prijsmodel, dispatch, opslag, verdeling
│   ├── matching.js         #   modus 2: definities, routeprijzen, doelfunctie en dispatch-DP
│   ├── matching_run.js     #   modus 2: uitvoering, herkomstgrootboek, modelkoppeling
│   ├── matching_verrekening.js  # modus 2: verdeling van de opslagwaarde en controles
│   ├── matching_ui.js      #   modus 2: zijbalk, routeoverzicht en kwartier-inspector
│   ├── tests.js            #   scenario- en regressietests (browser: ehpTests())
│   └── tests_node.js       #   dezelfde tests vanaf de commandline
├── ehp.js                  # EHP-interface en berekeningen
├── individueel.js          # Individuele analyse: rekenkern + UI
├── rapport.js              # GTO-rapportage
├── rapport_ehp.js          # EHP-rapportage
├── rapport_ind.js          # Individueel analyserapport
├── crypto.js               # Versleutelde export/import
├── tarieven.js             # Tarief- en systeemdefinities
└── charts/                 # Grafiekmodules (incl. individueel.js)
```

## Matching en opslag in het EHP

Het handelsplatform kent twee werkwijzen voor de vraag wat er met een kWh gebeurt. De keuze staat in de zijbalk onder **Matching en opslag**.

### 1. Interne matching eerst, daarna opslag (standaard)

De bestaande werkwijze en de regressiebasis. Eerst wordt opwek binnen de groep aan verbruik gekoppeld via de merit order; wat daarna overblijft — overschot en tekort — is waar de accu mee werkt. Bestaande platforms vallen hier automatisch op terug: zonder de instelling `matching_modus` in `plat.cfg` geldt deze modus, dus opgeslagen platforms geven exact dezelfde getallen als voorheen. `ehpRegressie()` in de console toetst dat kolom voor kolom tegen `EnergieModel.buildModel()` zonder allocator.

### 2. Prijsgeoptimaliseerde opslag en matching

Per kwartier wordt, met volledige vooruitblik op de EPEX-prijzen en de profielen van de doorgerekende periode, gekozen tussen zeven routes: direct intern leveren, opslaan, direct exporteren, uit de accu leveren aan een afnemer, uit de accu exporteren, laden uit het net, en inkopen van het net voor afnemers.

Dit is nadrukkelijk geen "accu eerst"-volgorde. Voor de kale groepswaarde is matching-eerst meestal al de goede keuze: direct matchen levert altijd de wig tussen inkoop- en exportprijs op, en laden uit het net is een losstaande arbitrage die daar bovenop komt. De samenhangende modus verandert het antwoord in vijf situaties, en `ehp/matching.js` schrijft die in het kopcommentaar uit:

1. laden uit het net is uitgeschakeld — dan concurreert opslag rechtstreeks met directe levering;
2. een beschermingsgrens sluit een bron uit van interne verrekening, waardoor die beschikbaar komt voor de accu;
3. opgeslagen energie is duurder dan het netalternatief van de afnemer, zodat de accu moet exporteren;
4. netneutraliteit is een expliciet doel;
5. opgeslagen energie is goedkoper dan de duurste opwek van dat moment, zodat de accu vóór die opwek in de merit order hoort.

**Beschermingsregels.** Een afnemer betaalt nooit meer dan zijn netalternatief (EPEX plus de ingestelde leveringsopslag). Een producent ontvangt nooit minder dan directe verkoop op de markt in datzelfde kwartier. Per regel is te kiezen of de route vervalt of doorgaat met bijpassing uit de groepspool; die bijpassing staat als aparte post in de verrekening. Energie die de accu in gaat telt in het groepsmodel mee als teruglevering tegen EPEX, waardoor de producent zijn alternatief hoe dan ook ontvangt.

**Verdeling van de opslagwaarde.** Wat de accu op een kWh verdient bovenop de inkoopprijs en de slijtage gaat naar de energie-eigenaar, de accu-eigenaar, de groepspool, of een procentuele split daarvan. De contractuele opslagvergoeding hoort bij de verrekening en stuurt de dispatch niet; die rekent met marginale kosten (rendementsverlies en degradatie). LCOS blijft een businesscase-toets achteraf en is nergens een drempel.

**Herkomst van opgeslagen energie.** De accu is fysiek een mengvat. Voor de verrekening wordt **proportioneel gemengd**: bij ontladen wordt uit elke herkomst geput naar rato van haar aandeel in de voorraad op dat moment, met de bijbehorende inkoopprijs, verliezen en slijtage. FIFO is overwogen maar afgevallen, omdat het een volgorde suggereert die er niet is en de uitkomst laat afhangen van een oncontroleerbare aanname. Het blijft een administratieve toerekening, geen bewering over natuurkunde.

**Balansen.** Per kwartier geldt `opwek + ontladen + netinkoop = verbruik + laden + teruglevering`, en splitst de opwek exact in direct intern, naar de accu en direct naar het net. Beide worden bij elke doorrekening gecontroleerd; het resultaat staat op het tabblad Routes.

### Wat je in de interface ziet

- **Routes** — waar elke kWh heen ging, de verrekening per afnemer, per energie-eigenaar en per accu, en de herkomst en bestemming van opgeslagen energie.
- **Overzicht** — waarschuwingen wanneer een prijs- of verdelingsinstelling afnemers of producenten mogelijk niet beschermt.
- **Herleidbaarheid** — per kwartier de beschikbare alternatieven, de gekozen route, de vullingsgraad, de prijsgrenzen en welke grens de beslissing bepaalde.
- **Rapport EHP** — een pagina met de actieve modus, het optimalisatiedoel, de beschermingsregels, de verdelingskeuze en een disclaimer dat dit een modelmatige, administratieve toerekening is.

### Tests

De EHP-rekenlaag heeft een eigen scenariosuite zonder testframework:

```bash
node ehp/tests_node.js
```

Dezelfde tests draaien in de browserconsole met `ehpTests()`, of `ehpTests('3.')` voor één scenario. Ze dekken onder meer de regressie van de bestaande modus, beide beschermingsregels, de vier verdelingskeuzes, netneutraliteit, meerdere bronnen, meerdere batterijen en het sluiten van alle balansen.

## Datadekking per maand

Maandgrafieken sommeren per kalendermaand. Ontbreekt er meetdata — begin/eind van de meetperiode, meteruitval, of afkapping door het jaarfilter — dan wordt een staaf lager zonder dat dat iets over het verbruik zegt. `maandDekking()` in `rekenkern.js` bepaalt per maand welk deel van de verwachte kwartieren (`dagen × 96`) daadwerkelijk aanwezig is. Onder `MAAND_DEKKING_DREMPEL` (99%) geldt een maand als onvolledig; zomertijd kost hooguit 4 kwartieren en valt dus buiten de markering.

Onvolledige maanden worden overal hetzelfde weergegeven: gearceerde staaf met contour (`hatchPat()`/`hatchBar()` in `app.js`), een asterisk bij het aslabel, de exacte dagentelling in de tooltip, en een waarschuwing in de kaart via `onvolledigNotice()`. Ze tellen bovendien niet mee in afgeleide getallen die anders vertekenen: de gas-baseload ("laagste maand") en de jaar-extrapolatie van de GTO-besparing.

Toegepast in: individuele analyse (`charts/individueel.js`), gas- en huboverzicht en jaarvergelijking (`app.js`), gelijktijdigheid (`charts/gelijktijdigheid.js`) en piekanalyse (`charts/piekanalyse.js`).

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
