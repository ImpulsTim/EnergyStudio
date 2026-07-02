# Energy Studio

Browserapplicatie voor het analyseren van collectieve energieprofielen, groeps-GTV en energiehandelsplatformen. De tool is gericht op Nederlandse energiecooperaties, bedrijventerreinen en energiehubs die kwartierdata willen combineren, visualiseren en rapporteren.

## Wat kun je ermee?

- Projecten en aansluitingen beheren voor elektra, gas en warmte.
- Meetdata importeren uit CSV of MEPS-achtige JSON-bestanden.
- Groepsprofielen berekenen op basis van kwartierwaarden.
- Groeps-GTV, pieken, overschrijdingen, weekprofielen en jaarprofielen analyseren.
- Scenario's doorrekenen, zoals zonnepanelen en batterijopslag.
- Energiehandelsplatformen (EHP) modelleren met opwek, EPEX/forwardprijzen, gelijktijdigheid, GVO en onbalans.
- Rapporten genereren voor GTO en EHP, inclusief HTML/PDF-export.
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
- EHP-rapport als HTML/PDF.

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
├── rekenkern.js            # Analyse- en rekenlogica
├── energiemodel.js         # EnergieModel/EHP-rekenmodel
├── ehp.js                  # EHP-interface en berekeningen
├── financieel.js           # Financiele analyses
├── rapport.js              # GTO-rapportage
├── rapport_ehp.js          # EHP-rapportage
├── crypto.js               # Versleutelde export/import
├── tarieven.js             # Tarief- en systeemdefinities
└── charts/                 # Grafiekmodules
```

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
