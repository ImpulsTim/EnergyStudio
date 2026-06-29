# Migration Audit — EnergieModel EXE → Energy Studio EHP

## Omvang van de wijzigingen (2026-06-23)

### Nieuwe bestanden
| Bestand | Doel |
|---|---|
| `energiemodel.js` | Rekenkern geporteerd vanuit EnergieModel_v72 — schema, parsers, engine |

### Gewijzigde bestanden
| Bestand | Wijziging |
|---|---|
| `index.html` | Script-tag `energiemodel.js` toegevoegd; prijsvelden vervangen door tariefformulier + file-uploads |
| `ehp.js` | `calcEHP()` volledig vervangen; `_ehpDefaults()`, `renderEHP()`, `_ehpCommit()`, `downloadEhpCsv()` bijgewerkt; file-upload handlers toegevoegd |

### Ongewijzigde bestanden
`rapport_ehp.js`, `financieel.js`, `rekenkern.js`, `db.js` — backward-compatibele velden in `_ehpLast` zorgen voor transparantie.

---

## Algoritme-verschil oud ↔ nieuw

| Aspect | Oud (`calcEHP`) | Nieuw (`EnergieModel.buildModel`) |
|---|---|---|
| Allocatiemethode | `min(totProd, totDem)` per kwartier, pro-rata naar consumenten | Prioriteitsgestuurd: laagste Prioriteit eerst, pro-rata binnen prio-laag |
| Brontypes | zon / wind / overig (3) | Type_norm: zon / wind / afname_invoeden (spec-conform) |
| Prosumer-correctie | Negatieve kW = productie voor dat lid | Negatieve hoofdmeter → `bruto_afname` + `afname_invoeden` (Prio=0 pseudo-opwek) |
| Tariefstructuur | 6 params (pZon, pWind, pOverig, fee, pNetAfname, pNetTerug) | 13 params (gelijktijdigheid×3, platform, GVO×2, onbalans×6) |
| Opwek-invoer | Negatieve kW uit IndexedDB per aansluiting | Apart Excel-bestand (Asset, Type, Prioriteit, opwek_kWh) |
| EPEX | Optioneel via jaarrekening-CSV | Optioneel via EPEX.xlsx (auto-detect EUR/MWh vs kWh, uur vs kwartier) |
| Forward-scenario | Niet aanwezig | Optioneel via Forwardcurve.xlsx (maand-ID + EUR/MWh) |
| Onbalans | Niet aanwezig | Onbalansafwijking × risicoprijs per type |
| GVO | Niet aanwezig | GVO bilateraal + GVO rest (tekort) |

---

## Backward-compatibiliteitslaag

`_ehpLast` bevat zowel nieuwe als oude velden:

| Oud veld | Nieuw equivalent |
|---|---|
| `totProdKwh` | `samenvatting.totaal_opwek_kWh` |
| `totConsKwh` | `samenvatting.totaal_verbruik_kWh` |
| `totMatchedKwh` | `samenvatting.gelijktijdig_kWh` |
| `totGridImpKwh` | `samenvatting.tekort_kWh` |
| `totGridExpKwh` | `samenvatting.overschot_kWh` |
| `selfCons` | `samenvatting.gelijktijdigheid_pct_van_opwek` |
| `selfSuff` | `samenvatting.gelijktijdigheid_pct_van_verbruik` |
| `parties[].consKwh` | `per_gebruiker[].totaal_verbruik_kWh` |
| `parties[].intBoughtKwh` | `per_gebruiker[].gelijktijdig_kWh` |
| `parties[].gridImpKwh` | `per_gebruiker[].tekort_kWh` |
| `cfg.pZon/pWind/pOverig` | `gel_zon_mwh/gel_wind_mwh/gel_ai_mwh` / 1000 |

`parties[].prodKwh` = `afname_invoeden_kWh` (negatieve hoofdmeter).  
`parties[].intSoldKwh` = 0 (opwek is nu per Asset, niet per verbruiker).

---

## Tariefformulier — eenheden

| UI-veld | Eenheid UI | Opgeslagen in cfg | Doorgegeven aan engine |
|---|---|---|---|
| Gelijktijdigheidsvergoeding | EUR/MWh | `gel_zon_mwh` | `/1000` → EUR/kWh |
| Platformtarief | EUR/MWh | `platform_mwh` | `/1000` |
| GVO | EUR/MWh | `gvo_bil_mwh`, `gvo_rest_mwh` | `/1000` |
| Onbalans risicoprijs | EUR/MWh | `onb_zon_risico_mwh`, etc. | `/1000` |
| Onbalans afwijking | % (bijv. 5 = 5%) | `/100` → fractie | direct als fractie |

---

## Bekende beperkingen v1.0

- `parties[].intSoldKwh = 0` — opbrengst per opwekker staat in `per_opwekker[]`, niet in verbruikerskaarten van rapport_ehp.js
- Jaarrekening (`calcJaarrekening`) gebruikt nog de oude matching-logica via `buildAnnualComparison` — dit is een losstaande module die los van de nieuwe engine draait
- Opwek/EPEX/forwardRows worden opgeslagen in `plat` binnen de `meta` IndexedDB-store; bij zeer grote datasets kan dit traag worden
- Scenario-paneel (scenariojaar, prijsmodus) is nog niet als UI aanwezig — forwardmodel draait met lege `scenario:{}`
