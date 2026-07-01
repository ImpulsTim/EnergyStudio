# EnergieModel — rekenlogica specificatie

**Bron:** `EnergieModel_zet_zip_om_naar_exe_voor_gebruik.exe` (PyInstaller, Python 3.14, run_model.py)
**Modelversie:** `2026-05-28_v72_exe_compatibel`
**Doel:** complete specificatie voor herimplementatie in Energy Studio's energiehandelsplatform module.

> Deze spec is gereconstrueerd uit de bytecode (pyc niet direct decompileerbaar, want pycdc/uncompyle ondersteunen 3.14 nog niet). Bytecode is gedisassembleerd met een lokaal gebouwde CPython 3.14 en handmatig terugvertaald naar leesbare pseudo-code. Alle kolomnamen, parameterkeys, formules en signaturen zijn 1-op-1 uit de constantenpool gehaald.

---

## 1. Wat het model doet

Per kwartier wordt voor een energiegemeenschap berekend:

1. **Fysieke allocatie** — opwek wordt prioritair toegewezen aan gemeenschapsvraag (laagste Prioriteit eerst, binnen prio pro rata naar volume).
2. **Hoofdmeter-/prosumer-correctie** — netto hoofdmeter wordt gesplitst in `bruto_afname` (positief) en `afname_invoeden` (negatief), waarna invoeden als aparte opwekstroom met Prioriteit=0 (hoogste) wordt toegevoegd.
3. **Economische laag** — koppelt tarieven (gelijktijdigheid zon/wind/invoeden, platform, GVO bilateraal/rest, EPEX-tekort, onbalans) aan de fysieke kwartieren.
4. **Forwardscenario** — projecteert het bronjaarprofiel naar een scenariojaar via maand-forwardprijzen.
5. **Per deelnemer / per opwekker** — verdeelt alle kosten en opbrengsten naar individuele locaties en assets.
6. **Maandrapportage + staten + dashboard** — Excel-output.

Voor Energy Studio is laag 1–5 de kern; laag 6 is enkel rapportage-rendering.

---

## 2. Inputs

Allemaal Excel, in een `input/` map.

### `verbruik.xlsx`
Long óf breed formaat. Breed wordt automatisch gepivot naar long.

- **Long-kolommen:** `Tijd (UTC)`, `Locatie`, `gebruik (kWh)` (synoniemen: `verbruik (kWh)`, `netto (kWh)`, `netto`, `gebruik`, `verbruik`)
- **Breed:** `Tijd (UTC)` + één kolom per meter/locatie.
- Tijdkolom synoniemen: `Tijd (UTC)`, `Tijd`, `timestamp`.
- Locatie synoniemen: `Locatie`, `Location`, `Aansluiting`.
- **Positief = afname uit gemeenschap/markt. Negatief = teruglevering (Afname-Invoeden).** Er wordt NIET op kolomnaam gefilterd (Netto/Levering/Teruglevering).
- Zelfconsumptie wordt bewust niet afgeleid — hoofdmeter ziet die niet.

### `opwek.xlsx`
Drie vormen:

1. **Long:** `Tijd (UTC) | Asset | Type | Prioriteit | opwek (kWh)`
2. **Breed standaard:** `Tijd (UTC) | Asset A | Asset B | …` (rij 1 = headers, rij 2+ = data)
3. **Breed multi-header:**
   - rij 1: `Tijd (UTC) | Asset A | Asset B | …`
   - rij 2: `Type     | zon     | wind    | …`
   - rij 3: `Prioriteit| 1       | 1       | …`
   - rij 4+: kwartierwaarden

Asset/Type/Prioriteit kunnen ook in een aparte `metadata` sheet staan.

Type-normalisatie (`normalize_type`):
- `pv`, `solar`, `zonne`, `zonopwek` → `zon`
- `windopwek`, `windturbine` → `wind`
- anders: lowercase stripped string, leeg → `onbekend`

Default Prioriteit als ontbrekend: `9999`.

### `epex.xlsx`
`Tijd (UTC)` + één prijskolom. Synoniemen: `prijs_eur_per_kWh`, `prijs`, `epex`, `euro`.

Auto-detectie EUR/MWh vs EUR/kWh op basis van mediaan van absolute waarden (drempel onbekend in bytecode, vermoedelijk ~1).
Auto-detectie uur vs kwartier; uurprijzen worden naar elk kwartier in dat uur gekopieerd (`normalize_epex_to_quarters`).

### `Tarieven.xlsx`
3 kolommen: `Component | Type | Waarde` (kolomsynoniemen: `Tarieven/Tarief/Component/Kostenpost`, `Type/Categorie/Drager`, `Prijs/Waarde/Tariefwaarde/Bedrag`).

Mapping `(component, type)` → interne parameterkey. Zie sectie 3.

### `Forwardcurve.xlsx` (optioneel)
`Maand_ID_FORECAST | forward_eur_per_MWh`. `Maand_ID_FORECAST` = jaar·100 + maand, bijv. `202601`.

### `scenario.xlsx` (optioneel)
`Parameter | Waarde`. Keys:
- `bronjaar` (int, alleen check tegen data)
- `scenariojaar` (int, default = bronjaar+1)
- `prijsmodus` (`forward` of anders → skip forward)
- `scenario_naam` (string, default `Gelijktijdigheidsanalyse`)
- `rapporttitel` (string)
- `snelle_modus` (bool, default false)
- `uitgebreide_controle` (bool, default true)

---

## 3. Tariefparameters (de `p` dict)

`read_tarieven` mapt input naar deze keys. EUR/MWh wordt gedeeld door 1000 → `p[key]` is altijd EUR/kWh (behalve `_pct` keys, die zijn fractie). Lookup is fuzzy: zoekt op tokens "gelijktijd / afname / invoed / zon / wind / platform / bilateraal / rest|epex / onbalans / verbruik|gebruiker | risic|risoc | afwijk".

| Interne key | Eenheid | Toegepast op |
|---|---|---|
| `gelijktijdigheid_zon` | EUR/kWh | `gelijktijdig_zon_kWh` |
| `gelijktijdigheid_wind` | EUR/kWh | `gelijktijdig_wind_kWh` |
| `gelijktijdigheid_afname_invoeden` | EUR/kWh | `gelijktijdig_afname_invoeden_kWh` |
| `platform` | EUR/kWh | `totaal_verbruik_kWh` (gebruiker) / `totaal_opwek_kWh` (opwekker) |
| `gvo_bilateraal` | EUR/kWh | `gelijktijdig_kWh` |
| `gvo_rest` | EUR/kWh | `tekort_kWh` (gebruiker) / `overschot_kWh` (opwekker) |
| `onbalans_zon_pct` | fractie | `opwek_zon_kWh` (afwijkingsvolume) |
| `onbalans_wind_pct` | fractie | `opwek_wind_kWh` |
| `onbalans_verbruik_pct` | fractie | `totaal_verbruik_kWh` |
| `onbalans_zon_risicoprijs` | EUR/kWh | `onbalans_afwijking_zon_kWh` |
| `onbalans_wind_risicoprijs` | EUR/kWh | `onbalans_afwijking_wind_kWh` |
| `onbalans_verbruik_risicoprijs` | EUR/kWh | `onbalans_afwijking_verbruik_kWh` |

Ontbrekende keys → 0 (met "LET OP" markering in fallback rij).

---

## 4. Datamodel (centraal kwartier-DataFrame `model`)

Eén rij per kwartier (`Tijd (UTC)`) na alle joins. Kolommen die door de pipeline ontstaan:

**Energie fysiek:**
- `totaal_verbruik_kWh` — netto afname gemeenschap (positieve hoofdmeterstromen)
- `totaal_bruto_afname_kWh` — som van bruto_afname over locaties (zelfde als verbruik als geen prosumers)
- `prosumer_opwek_kWh`, `zelfconsumptie_kWh` — beide 0 (hoofdmeter ziet ze niet)
- `afname_invoeden_kWh` — negatieve hoofdmeting, omgedraaid naar positief
- `totaal_opwek_kWh` — som van alle opwek_kWh (incl. invoeden als pseudo-opwek)
- `opwek_zon_kWh`, `opwek_wind_kWh` — getotaald per Type_norm
- `opwek_afname_invoeden_kWh` — totale invoeden als opwekbron

**Allocatie resultaat (uit `allocate_opwek_priority`):**
- `gelijktijdig_kWh` — totaal toegewezen aan vraag dat kwartier
- `gelijktijdig_zon_kWh`, `gelijktijdig_wind_kWh`, `gelijktijdig_afname_invoeden_kWh`
- `overschot_kWh` — opwek niet gebruikt (gaat naar EPEX)
- `overschot_zon_kWh`, `overschot_wind_kWh`, `overschot_afname_invoeden_kWh`
- `tekort_kWh` — vraag niet gedekt door opwek (gaat naar EPEX-inkoop)
- `opwek_prio_<n>_kWh` — opwek per Prioriteit-niveau (pivot)

**Prijzen:**
- `epex_eur_per_kWh` — uit epex.xlsx (na uur→kwartier normalisatie)
- in forwardmodel: `forward_eur_per_kWh`, `epex_basisjaar_eur_per_kWh`, `gemiddelde_epex_basismaand_eur_per_kWh`

**Economisch (uit `apply_economic_columns`):**
- `kosten_gelijktijdigheid_zon_EUR`, `_wind_EUR`, `_afname_invoeden_EUR`, `_totaal_EUR`
- `kosten_platform_EUR`
- `kosten_gvo_bilateraal_EUR`
- `kosten_gvo_rest_EUR`
- `kosten_epex_tekort_EUR`
- `opbrengst_epex_overschot_EUR`, `_zon_EUR`, `_wind_EUR`
- `onbalans_afwijking_zon_kWh`, `_wind_kWh`, `_verbruik_kWh`
- `onbalans_basis_zon_EUR`, `_wind_EUR`, `_verbruik_EUR` (basis = volume × risicoprijs, vóór afwijking)
- `kosten_onbalans_zon_EUR`, `_wind_EUR`, `_verbruik_EUR`, `_totaal_EUR`
- `kosten_totaal_EUR` — eindtotaal

---

## 5. Kernalgoritmes — gereconstrueerde pseudo-code

### 5.1 `allocate_opwek_priority(opwek_asset_kwartier, verbruik_kwartier)`

**Input:**
- `opwek_asset_kwartier`: long DataFrame met `Tijd (UTC), Asset, Type, Type_norm, Prioriteit, opwek_kWh, Gebruiker`
- `verbruik_kwartier`: DataFrame met `Tijd (UTC), totaal_verbruik_kWh`

**Algoritme:**

```python
def allocate_opwek_priority(opwek, verbruik):
    # 1. Vraag aansluiten op opwekregels
    demand = verbruik.rename(columns={'totaal_verbruik_kWh': 'vraag_kWh'})[['Tijd (UTC)', 'vraag_kWh']]
    df = opwek.merge(demand, on='Tijd (UTC)', how='left')
    df['vraag_kWh'] = df['vraag_kWh'].fillna(0)
    df = df.sort_values(['Tijd (UTC)', 'Prioriteit', 'Asset']).reset_index(drop=True)

    # 2. Aggregeer per (Tijd, Prioriteit) — som opwek, eerste vraag
    groups = (df
        .groupby(['Tijd (UTC)', 'Prioriteit'], as_index=False)
        .agg(groep_opwek_kWh=('opwek_kWh', 'sum'),
             vraag_kWh=('vraag_kWh', 'first'))
        .sort_values(['Tijd (UTC)', 'Prioriteit']))

    # 3. Cumulatieve opwek per kwartier (volgorde = prioriteit)
    groups['cumul_opwek_tot_en_met_groep'] = (
        groups.groupby('Tijd (UTC)')['groep_opwek_kWh'].cumsum())
    groups['cumul_opwek_voor_groep'] = (
        groups['cumul_opwek_tot_en_met_groep'] - groups['groep_opwek_kWh'])

    # 4. Hoeveel vraag is er nog over wanneer deze groep aan de beurt is?
    groups['resterende_vraag_voor_groep'] = (
        groups['vraag_kWh'] - groups['cumul_opwek_voor_groep']).clip(lower=0)

    # 5. Wat kan deze groep gelijktijdig leveren?
    groups['groep_gelijktijdig_kWh'] = groups[
        ['groep_opwek_kWh', 'resterende_vraag_voor_groep']
    ].min(axis=1)

    groups = groups[['Tijd (UTC)', 'Prioriteit',
                     'groep_opwek_kWh', 'groep_gelijktijdig_kWh']]

    # 6. Pro-rata verdelen binnen elke (tijd, prio) groep
    df = df.merge(groups, on=['Tijd (UTC)', 'Prioriteit'],
                  how='left', validate='many_to_one')

    df['gelijktijdig_kWh'] = np.where(
        df['groep_opwek_kWh'] > 0,
        df['opwek_kWh'] / df['groep_opwek_kWh'] * df['groep_gelijktijdig_kWh'],
        0.0
    )
    df['overschot_kWh'] = (df['opwek_kWh'] - df['gelijktijdig_kWh']).clip(lower=0)
    return df.drop(columns=['groep_opwek_kWh', 'groep_gelijktijdig_kWh'])
```

**JS-equivalent (per kwartier-loop):**
```javascript
function allocateOpwekPriority(opwekRows, verbruikByTijd) {
  // Groepeer per (tijd, prioriteit)
  const groepen = new Map(); // key: tijd|prio -> {opwek, assets:[]}
  for (const r of opwekRows) {
    const k = `${r.tijd}|${r.prioriteit}`;
    if (!groepen.has(k)) groepen.set(k, { tijd: r.tijd, prio: r.prioriteit, opwek: 0, assets: [] });
    const g = groepen.get(k);
    g.opwek += r.opwek_kWh;
    g.assets.push(r);
  }
  // Per tijdstip: sorteer prio oplopend, alloceer cumulatief
  const byTijd = new Map();
  for (const g of groepen.values()) {
    if (!byTijd.has(g.tijd)) byTijd.set(g.tijd, []);
    byTijd.get(g.tijd).push(g);
  }
  const out = [];
  for (const [tijd, groepenT] of byTijd) {
    groepenT.sort((a,b) => a.prio - b.prio);
    const vraag = verbruikByTijd.get(tijd) || 0;
    let cumOpwek = 0;
    for (const g of groepenT) {
      const cumVoor = cumOpwek;
      const resterend = Math.max(0, vraag - cumVoor);
      const groepGelijk = Math.min(g.opwek, resterend);
      // Pro-rata binnen de groep
      for (const a of g.assets) {
        const gelijk = g.opwek > 0 ? (a.opwek_kWh / g.opwek) * groepGelijk : 0;
        const overschot = Math.max(0, a.opwek_kWh - gelijk);
        out.push({ ...a, gelijktijdig_kWh: gelijk, overschot_kWh: overschot });
      }
      cumOpwek += g.opwek;
    }
  }
  return out;
}
```

### 5.2 `apply_prosumer_correction(verbruik, opwek)`

```python
def apply_prosumer_correction(verbruik, opwek):
    v = verbruik.copy()
    opwek = opwek.copy()

    # Netto hoofdmeting splitsen
    v['netto_hoofdmeter_kWh'] = pd.to_numeric(v['gebruik_kWh'], errors='coerce').fillna(0.0)
    v['bruto_afname_kWh']     = v['netto_hoofdmeter_kWh'].clip(lower=0.0)
    v['netto_afname_kWh']     = v['bruto_afname_kWh']
    v['afname_invoeden_kWh']  = (-v['netto_hoofdmeter_kWh'].clip(upper=0.0)).fillna(0.0)

    # Hoofdmeter ziet zelfconsumptie niet
    v['prosumer_opwek_kWh']   = 0.0
    v['zelfconsumptie_kWh']   = 0.0
    v['gebruik_kWh']          = v['netto_afname_kWh']

    # Bouw extra opwekstroom uit invoeden, prio 0 (hoogste)
    feed = v.loc[v['afname_invoeden_kWh'] > 0,
                 ['Tijd (UTC)', 'Locatie', 'afname_invoeden_kWh']].copy()
    if not feed.empty:
        feed['Asset']      = 'Afname-Invoeden - ' + feed['Locatie'].astype(str)
        feed['Type']       = 'afname_invoeden'
        feed['Type_norm']  = 'afname_invoeden'
        feed['Prioriteit'] = 0
        feed['opwek_kWh']  = feed['afname_invoeden_kWh']
        feed['Gebruiker']  = feed['Locatie']
        feed = feed[['Tijd (UTC)', 'Asset', 'Type', 'Type_norm',
                     'Prioriteit', 'opwek_kWh', 'Gebruiker']]
        opwek = pd.concat([feed, opwek], ignore_index=True, sort=False)

    # Zorg dat Type_norm/Gebruiker/Prioriteit bestaan op opwek
    if 'Type_norm' not in opwek.columns:
        opwek['Type_norm'] = opwek['Type'].map(normalize_type)
    else:
        opwek['Type_norm'] = opwek['Type_norm'].fillna(opwek['Type'].map(normalize_type))
    if 'Gebruiker' not in opwek.columns:
        opwek['Gebruiker'] = np.nan
    if 'Prioriteit' not in opwek.columns:
        opwek['Prioriteit'] = 9999
    opwek['Prioriteit'] = pd.to_numeric(
        opwek['Prioriteit'], errors='coerce').fillna(9999).astype(int)

    controle = [
        {'Controle':'hoofdmeter_netto_logica',         'Waarde':'toegepast; positief=afname, negatief=Afname-Invoeden'},
        {'Controle':'achter_de_meter_niet_afgeleid',   'Waarde':'niet afgeleid uit hoofdmeters'},
        {'Controle':'afname_invoeden_kWh',             'Waarde':float(v['afname_invoeden_kWh'].sum())},
        {'Controle':'afname_invoeden_prioriteit',      'Waarde':'hoogste prioriteit; technisch Prioriteit=0'},
        {'Controle':'aantal_gebruikers_met_afname_invoeden',
                                                      'Waarde':int(v.loc[v['afname_invoeden_kWh'] > 0, 'Locatie'].nunique())},
        {'Controle':'netto_negatieve_kwartieren',
                                                      'Waarde':int((v['netto_hoofdmeter_kWh'] < 0).sum())},
    ]
    return v, opwek, controle
```

### 5.3 `apply_economic_columns(model, p)`

Vectoriële multiplicaties. Volledige lijst:

```python
def apply_economic_columns(model, p):
    model = model.copy()
    g  = lambda k: model.get(k, 0)
    pg = lambda k: p.get(k, 0)

    model['kosten_gelijktijdigheid_afname_invoeden_EUR'] = g('gelijktijdig_afname_invoeden_kWh') * pg('gelijktijdigheid_afname_invoeden')
    model['kosten_gelijktijdigheid_zon_EUR']             = g('gelijktijdig_zon_kWh')             * p['gelijktijdigheid_zon']
    model['kosten_gelijktijdigheid_wind_EUR']            = g('gelijktijdig_wind_kWh')            * p['gelijktijdigheid_wind']
    model['kosten_gelijktijdigheid_totaal_EUR']          = (
        model['kosten_gelijktijdigheid_afname_invoeden_EUR']
      + model['kosten_gelijktijdigheid_zon_EUR']
      + model['kosten_gelijktijdigheid_wind_EUR'])

    model['kosten_platform_EUR']        = model['totaal_verbruik_kWh'] * p['platform']
    model['kosten_gvo_bilateraal_EUR']  = model['gelijktijdig_kWh']    * p['gvo_bilateraal']
    model['kosten_gvo_rest_EUR']        = model['tekort_kWh']          * p['gvo_rest']
    model['kosten_epex_tekort_EUR']     = model['tekort_kWh']          * model['epex_eur_per_kWh']
    model['opbrengst_epex_overschot_EUR']      = model['overschot_kWh']        * model['epex_eur_per_kWh']
    model['opbrengst_epex_overschot_zon_EUR']  = g('overschot_zon_kWh')        * model['epex_eur_per_kWh']
    model['opbrengst_epex_overschot_wind_EUR'] = g('overschot_wind_kWh')       * model['epex_eur_per_kWh']

    # Onbalans-volumeafwijking
    model['onbalans_afwijking_zon_kWh']      = g('opwek_zon_kWh')        * p['onbalans_zon_pct']
    model['onbalans_afwijking_wind_kWh']     = g('opwek_wind_kWh')       * p['onbalans_wind_pct']
    model['onbalans_afwijking_verbruik_kWh'] = model['totaal_verbruik_kWh'] * p['onbalans_verbruik_pct']

    # Onbalans-basis: vol volume × risicoprijs (informatief)
    model['onbalans_basis_zon_EUR']      = g('opwek_zon_kWh')               * p['onbalans_zon_risicoprijs']
    model['onbalans_basis_wind_EUR']     = g('opwek_wind_kWh')              * p['onbalans_wind_risicoprijs']
    model['onbalans_basis_verbruik_EUR'] = model['totaal_verbruik_kWh']     * p['onbalans_verbruik_risicoprijs']

    # Werkelijke onbalanskosten = afwijking × risicoprijs
    model['kosten_onbalans_zon_EUR']      = model['onbalans_afwijking_zon_kWh']      * p['onbalans_zon_risicoprijs']
    model['kosten_onbalans_wind_EUR']     = model['onbalans_afwijking_wind_kWh']     * p['onbalans_wind_risicoprijs']
    model['kosten_onbalans_verbruik_EUR'] = model['onbalans_afwijking_verbruik_kWh'] * p['onbalans_verbruik_risicoprijs']
    model['kosten_onbalans_totaal_EUR']   = (
        model['kosten_onbalans_zon_EUR']
      + model['kosten_onbalans_wind_EUR']
      + model['kosten_onbalans_verbruik_EUR'])

    # Eindtotaal: kosten + onbalans − opbrengst EPEX-overschot
    model['kosten_totaal_EUR'] = (
        model['kosten_gelijktijdigheid_totaal_EUR']
      + model['kosten_platform_EUR']
      + model['kosten_gvo_bilateraal_EUR']
      + model['kosten_gvo_rest_EUR']
      + model['kosten_epex_tekort_EUR']
      + model['kosten_onbalans_totaal_EUR']
      - model['opbrengst_epex_overschot_EUR'])
    return model
```

**Kernformules samengevat:**

| Component | Formule |
|---|---|
| Kosten gelijktijdigheid zon | `gelijktijdig_zon_kWh × p['gelijktijdigheid_zon']` |
| Kosten gelijktijdigheid wind | `gelijktijdig_wind_kWh × p['gelijktijdigheid_wind']` |
| Kosten gelijktijdigheid invoeden | `gelijktijdig_afname_invoeden_kWh × p['gelijktijdigheid_afname_invoeden']` |
| Kosten platform | `totaal_verbruik_kWh × p['platform']` |
| Kosten GVO bilateraal | `gelijktijdig_kWh × p['gvo_bilateraal']` |
| Kosten GVO rest | `tekort_kWh × p['gvo_rest']` |
| Kosten EPEX tekort | `tekort_kWh × epex_eur_per_kWh` |
| Opbrengst EPEX overschot | `overschot_kWh × epex_eur_per_kWh` |
| Onbalans afwijking | `volume × afwijking_pct` |
| Onbalans kosten | `afwijking × risicoprijs` |
| **Kosten totaal** | `som van alle kosten + onbalans_totaal − opbrengst_epex_overschot` |

### 5.4 `make_forward_model(base_model, forwardcurve, p, scenario)`

```python
def make_forward_model(base_model, forwardcurve, p, scenario):
    if forwardcurve is None or forwardcurve.empty:
        return pd.DataFrame(), pd.DataFrame()
    scenario = scenario or {}
    prijsmodus = str(scenario.get('prijsmodus','forward')).strip().lower()
    if prijsmodus != 'forward':
        return pd.DataFrame(), pd.DataFrame([
            {'Controle':'prijsmodus',           'Waarde':prijsmodus},
            {'Controle':'forward_overgeslagen', 'Waarde':'prijsmodus is niet forward'},
        ])

    base = base_model.copy()
    base['Jaar_basis']     = base['Tijd (UTC)'].dt.year
    basisjaar_data         = int(base['Jaar_basis'].mode().iloc[0])
    bronjaar_scenario      = scenario.get('bronjaar')
    doeljaar               = scenario.get('scenariojaar') or (basisjaar_data + 1)
    doeljaar               = int(doeljaar)
    jaar_offset            = doeljaar - basisjaar_data

    base['Maand']             = base['Tijd (UTC)'].dt.month
    base['Maand_ID_basis']    = basisjaar_data * 100 + base['Maand']
    base['Maand_ID_FORECAST'] = doeljaar      * 100 + base['Maand']

    # Gemiddelde EPEX per basis-maand
    maandgem = (base.groupby('Maand', as_index=False)['epex_eur_per_kWh']
                    .mean()
                    .rename(columns={'epex_eur_per_kWh':
                                     'gemiddelde_epex_basismaand_eur_per_kWh'}))

    fwd = forwardcurve.copy()
    fwd['forward_eur_per_kWh'] = fwd['forward_eur_per_MWh'] / 1000.0

    out = base.merge(maandgem, on='Maand', how='left', validate='many_to_one')
    out = out.merge(fwd, on='Maand_ID_FORECAST', how='left', validate='many_to_one')

    missing = sorted(out.loc[out['forward_eur_per_kWh'].isna(),
                             'Maand_ID_FORECAST'].dropna().unique().tolist())
    if missing:
        raise ValueError(f'Forwardcurve mist maand(en) voor scenariojaar {doeljaar}: {missing}')

    out['epex_basisjaar_eur_per_kWh'] = out['epex_eur_per_kWh']
    # KERN-FORMULE forwardprijs:
    out['epex_eur_per_kWh'] = np.where(
        out['gemiddelde_epex_basismaand_eur_per_kWh'] != 0,
        out['epex_basisjaar_eur_per_kWh']
            * out['forward_eur_per_kWh']
            / out['gemiddelde_epex_basismaand_eur_per_kWh'],
        out['forward_eur_per_kWh']  # fallback
    )

    out['Tijd_basisjaar'] = out['Tijd (UTC)']
    out['Tijd (UTC)']     = out['Tijd (UTC)'] + pd.DateOffset(years=jaar_offset)
    out['Scenario']       = f'{doeljaar}_Forward_obv_{basisjaar_data}_profiel'
    out = apply_economic_columns(out, p)
    # ... + kolomvolgorde + controlerijen
    return out, controle
```

**De forwardprijs per kwartier:**
```
forward_kwartier(scenariojaar) = EPEX_kwartier(bronjaar) × forward_maand(scenariojaar) / gem_EPEX_maand(bronjaar)
```

Dus de **vorm** van het bronjaarprofiel blijft, alleen het **niveau** per maand wordt opgeschaald naar de forwardprijs.

### 5.5 `_safe_div(n, d)`

```python
def _safe_div(n, d):
    if d not in (0, 0.0, None) and not pd.isna(d):
        return float(n) / float(d)
    return 0.0
```

### 5.6 `gebruiker_staat_rows(row)` — verbruikersrapport

Per gebruiker-rij wordt een staatje van 10 regels opgebouwd. Alle EUR/MWh-tarieven worden uit afgeleide bedragen + volumes berekend via `_safe_div`.

```python
def gebruiker_staat_rows(row):
    gel_mwh        = row.get('gelijktijdig_kWh', 0) / 1000
    epex_mwh       = row.get('tekort_kWh', 0)       / 1000
    totaal_mwh     = row.get('totaal_verbruik_kWh', 0) / 1000
    bruto_mwh      = row.get('totaal_bruto_afname_kWh', row.get('totaal_verbruik_kWh', 0)) / 1000
    invoeden_mwh   = row.get('afname_invoeden_kWh', 0) / 1000

    c_gel          = row.get('kosten_gelijktijdigheid_EUR', 0)
    c_epex         = row.get('kosten_epex_tekort_EUR', 0)
    c_onb          = row.get('kosten_onbalans_verbruik_EUR', 0)
    c_platform     = row.get('kosten_platform_EUR', 0)
    c_gvo_b        = row.get('kosten_gvo_bilateraal_EUR', 0)
    c_gvo_r        = row.get('kosten_gvo_rest_EUR', 0)
    total          = row.get('kosten_totaal_EUR',
                             c_gel + c_epex + c_onb + c_platform + c_gvo_b + c_gvo_r)
    subtotal       = c_gel + c_epex + c_onb

    return [
        {'Post':'Inkoop Gelijktijdig',  'MWh':gel_mwh,   'Euro/MWh':_safe_div(c_gel,    gel_mwh),    'EUR':c_gel,      'Type':'body'},
        {'Post':'Inkoop EPEX',          'MWh':epex_mwh,  'Euro/MWh':_safe_div(c_epex,   epex_mwh),   'EUR':c_epex,     'Type':'body'},
        {'Post':'Onbalanskosten',       'MWh':None,      'Euro/MWh':None,                            'EUR':c_onb,      'Type':'italic'},
        {'Post':'Onbalanskosten % van energiekosten',
                                        'MWh':None,      'Euro/MWh':None,                            'EUR':_safe_div(c_onb, c_gel+c_epex), 'Type':'pct'},
        {'Post':'',                     'MWh':None,      'Euro/MWh':None,                            'EUR':None,       'Type':'blank'},
        {'Post':'Subtotaal energietransacties',
                                        'MWh':totaal_mwh,'Euro/MWh':_safe_div(subtotal, totaal_mwh), 'EUR':subtotal,   'Type':'subtotal'},
        {'Post':'Kosten Platform',      'MWh':totaal_mwh,'Euro/MWh':_safe_div(c_platform, totaal_mwh),'EUR':c_platform,'Type':'body'},
        {'Post':'Kosten GVO rechtstreeks (bilateraal)',
                                        'MWh':gel_mwh,   'Euro/MWh':_safe_div(c_gvo_b, gel_mwh),    'EUR':c_gvo_b,    'Type':'body'},
        {'Post':'Kosten GVO reststroom','MWh':epex_mwh,  'Euro/MWh':_safe_div(c_gvo_r, epex_mwh),   'EUR':c_gvo_r,    'Type':'body'},
        {'Post':'Kosten totaal',        'MWh':None,      'Euro/MWh':_safe_div(total, totaal_mwh),   'EUR':total,      'Type':'total'},
    ]
```

### 5.7 `opwekker_staat_rows(row, p)` — opwekkersrapport

Bij opwekkers worden platform, GVO bilateraal en GVO rest **niet** uit het kwartiermodel gehaald maar uit `p` × eigen volume. Tekens zijn omgekeerd t.o.v. gebruiker:

```python
def opwekker_staat_rows(row, p):
    gel_mwh    = row.get('gelijktijdig_kWh', 0)  / 1000
    epex_mwh   = row.get('overschot_kWh', 0)     / 1000
    totaal_mwh = row.get('totaal_opwek_kWh', 0)  / 1000

    r_gel      = row.get('opbrengst_gelijktijdigheid_EUR', 0)
    r_epex     = row.get('opbrengst_epex_overschot_EUR', 0)
    c_onb      = row.get('kosten_onbalans_opwek_EUR', 0)
    onb_display= -c_onb  # in opwekkersstaat als negatieve regel

    platform   = -((p.get('platform', 0)        * 1000) if p else 0) * totaal_mwh
    gvo_b_rate =   ((p.get('gvo_bilateraal', 0) * 1000) if p else 0)
    gvo_r_rate =   ((p.get('gvo_rest', 0)       * 1000) if p else 0)
    gvo_b      = gvo_b_rate * gel_mwh
    gvo_r      = gvo_r_rate * epex_mwh

    subtotal   = r_gel + r_epex + onb_display
    total      = subtotal + platform + gvo_b + gvo_r

    return [
        {'Post':'Verkoop Gelijktijdig', 'MWh':gel_mwh,   'Euro/MWh':_safe_div(r_gel,gel_mwh),    'EUR':r_gel,       'Type':'body'},
        {'Post':'Verkoop EPEX',         'MWh':epex_mwh,  'Euro/MWh':_safe_div(r_epex,epex_mwh),  'EUR':r_epex,      'Type':'body'},
        {'Post':'Onbalanskosten',       'MWh':None,      'Euro/MWh':None,                        'EUR':onb_display, 'Type':'italic'},
        {'Post':'Onbalanskosten % van opbrengsten',
                                        'MWh':None,      'Euro/MWh':None,                        'EUR':_safe_div(c_onb, r_gel+r_epex), 'Type':'pct'},
        {'Post':'',                     'MWh':None,      'Euro/MWh':None,                        'EUR':None,        'Type':'blank'},
        {'Post':'Subtotaal energietransacties',
                                        'MWh':totaal_mwh,'Euro/MWh':_safe_div(subtotal,totaal_mwh),'EUR':subtotal,  'Type':'subtotal'},
        {'Post':'Kosten Platform',      'MWh':totaal_mwh,'Euro/MWh':_safe_div(platform,totaal_mwh),'EUR':platform,  'Type':'body'},
        {'Post':'Inkomsten GVO rechtstreeks (bilateraal)',
                                        'MWh':gel_mwh,   'Euro/MWh':gvo_b_rate,                  'EUR':gvo_b,       'Type':'body'},
        {'Post':'Inkomsten GVO restvolume',
                                        'MWh':epex_mwh,  'Euro/MWh':gvo_r_rate,                  'EUR':gvo_r,       'Type':'body'},
        {'Post':'Inkomsten totaal',     'MWh':None,      'Euro/MWh':_safe_div(total,totaal_mwh), 'EUR':total,       'Type':'total'},
    ]
```

---

## 6. `build_model()` — orchestratie volgorde

```
1. read_inputs() →
   - verbruik (long, met kolommen Tijd (UTC), Locatie, gebruik_kWh)
   - opwek (long, met Tijd (UTC), Asset, Type, Type_norm, Prioriteit, opwek_kWh, Gebruiker)
   - epex (Tijd (UTC), epex_eur_per_kWh)
   - p (tariefparameters dict)
   - tarieven_tabel (rapportage-DataFrame)

2. apply_prosumer_correction(verbruik, opwek)
   → verbruik (met bruto/netto/invoeden), opwek (met afname_invoeden assets), prosumer_controle

3. Aggregeer verbruik per Tijd (UTC):
   verbruik_kwartier = verbruik.groupby('Tijd (UTC)').agg(
       totaal_verbruik_kWh    = ('gebruik_kWh', 'sum'),
       totaal_bruto_afname_kWh = ('bruto_afname_kWh', 'sum'),
       afname_invoeden_kWh     = ('afname_invoeden_kWh', 'sum'),
       prosumer_opwek_kWh      = ('prosumer_opwek_kWh', 'sum'),
       zelfconsumptie_kWh      = ('zelfconsumptie_kWh', 'sum'))

4. opwek_alloc = allocate_opwek_priority(opwek, verbruik_kwartier)
   → per asset/tijdkwartier: opwek_kWh, gelijktijdig_kWh, overschot_kWh

5. Aggregeer opwek per Tijd (UTC):
   opwek_kwartier = opwek_alloc.groupby('Tijd (UTC)').agg(
       totaal_opwek_kWh   = ('opwek_kWh', 'sum'),
       gelijktijdig_kWh   = ('gelijktijdig_kWh', 'sum'),
       overschot_kWh      = ('overschot_kWh', 'sum'))

6. Pivot per Type_norm (zon/wind/afname_invoeden) →
   opwek_zon_kWh, opwek_wind_kWh, opwek_afname_invoeden_kWh,
   gelijktijdig_zon_kWh, gelijktijdig_wind_kWh, gelijktijdig_afname_invoeden_kWh,
   overschot_zon_kWh, overschot_wind_kWh

7. Pivot per Prioriteit → opwek_prio_1_kWh, opwek_prio_2_kWh, ...

8. model = verbruik_kwartier ⋈ opwek_kwartier ⋈ (per_type) ⋈ (per_prio) ⋈ epex
   tekort_kWh = max(0, totaal_verbruik_kWh - gelijktijdig_kWh)

9. model = apply_economic_columns(model, p)

10. summarize_model(model) → samenvatting met totalen + kengetallen

11. Forward variant (als scenario.prijsmodus == 'forward'):
    forwardcurve = read_forwardcurve(...)
    model_forward, ctrl = make_forward_model(model, forwardcurve, p, scenario)

12. Voor elk model (basis + forward):
    per_gebruiker, per_opwekker = participant_outputs_for_model(model, verbruik, opwek_alloc, p, label, time_col_for_match)

13. Maandaggregaties + staten + Excel rendering.
```

---

## 7. Per-deelnemer allocatie (laag 5)

In `participant_outputs_for_model`:

- **Per gebruiker/locatie:** elk kwartier krijgt een aandeel:
  ```
  aandeel_verbruik_kwartier = gebruiker.gebruik_kWh / model.totaal_verbruik_kWh
  ```
  Alle gemeenschapskosten (gelijktijdigheid, platform, GVO, EPEX-tekort, onbalans_verbruik) worden via dit aandeel verdeeld.

  De gelijktijdig-kWh per gebruiker:
  ```
  gelijktijdig_kWh_gebruiker = aandeel × model.gelijktijdig_kWh
  ```

- **Per opwekker/asset:** rechtstreeks uit `opwek_alloc` (sommen `gelijktijdig_kWh`, `overschot_kWh` per Asset). Opbrengsten:
  ```
  gelijktijdigheid_tarief_EUR_per_kWh = np.select(
      [Type_norm == 'afname_invoeden',
       Type_norm == 'wind',
       Type_norm == 'zon'],
      [p['gelijktijdigheid_afname_invoeden'],
       p['gelijktijdigheid_wind'],
       p['gelijktijdigheid_zon']],
      default=0.0
  )
  opbrengst_gelijktijdigheid_EUR = gelijktijdig_kWh × gelijktijdigheid_tarief_EUR_per_kWh
  opbrengst_epex_overschot_EUR   = overschot_kWh × epex_eur_per_kWh
  onbalans_afwijking_opwek_kWh   = opwek_kWh × onbalans_<type>_pct
  kosten_onbalans_opwek_EUR      = onbalans_afwijking_opwek_kWh × onbalans_<type>_risicoprijs
  netto_opbrengst_EUR            = opbrengst_gelijktijdigheid_EUR + opbrengst_epex_overschot_EUR
                                 - kosten_onbalans_opwek_EUR
  ```

  Bij invoeden-assets: onbalans = 0 (geen risicoprijs).

---

## 8. Constantenpool — referentielijst

Alle interne kolomnamen, gegroepeerd. Houd deze namen aan in je JS-port; ze worden in tests/exports gebruikt.

**Identificatie / tijd:** `Tijd (UTC)`, `Tijd_basisjaar`, `Tijd_rapportage`, `Tijd_match`, `Scenario`, `Jaar_basis`, `Maand`, `Maand_ID_basis`, `Maand_ID_FORECAST`, `Locatie`, `Gebruiker`, `Asset`, `Type`, `Type_norm`, `Prioriteit`.

**Hoofdmeter splits:** `gebruik_kWh`, `netto_hoofdmeter_kWh`, `bruto_afname_kWh`, `netto_afname_kWh`, `afname_invoeden_kWh`, `prosumer_opwek_kWh`, `zelfconsumptie_kWh`.

**Volume-aggregaten:** `totaal_verbruik_kWh`, `totaal_bruto_afname_kWh`, `totaal_opwek_kWh`, `opwek_kWh`, `opwek_zon_kWh`, `opwek_wind_kWh`, `opwek_afname_invoeden_kWh`.

**Allocatie:** `gelijktijdig_kWh`, `gelijktijdig_zon_kWh`, `gelijktijdig_wind_kWh`, `gelijktijdig_afname_invoeden_kWh`, `overschot_kWh`, `overschot_zon_kWh`, `overschot_wind_kWh`, `overschot_afname_invoeden_kWh`, `tekort_kWh`, `opwek_prio_<n>_kWh`, `afname_invoeden_gedeeld_kWh`, `afname_invoeden_totaal_kWh`, `gelijktijdig_afname_invoeden_totaal_kWh`, `aandeel_verbruik_kwartier`.

**Prijzen kwartier:** `epex_eur_per_kWh`, `epex_basisjaar_eur_per_kWh`, `forward_eur_per_kWh`, `forward_eur_per_MWh`, `gemiddelde_epex_basismaand_eur_per_kWh`.

**Kosten:** `kosten_gelijktijdigheid_zon_EUR`, `_wind_EUR`, `_afname_invoeden_EUR`, `_totaal_EUR`, `kosten_platform_EUR`, `kosten_gvo_bilateraal_EUR`, `kosten_gvo_rest_EUR`, `kosten_epex_tekort_EUR`.

**Opbrengsten:** `opbrengst_epex_overschot_EUR`, `_zon_EUR`, `_wind_EUR`, `opbrengst_gelijktijdigheid_EUR`, `netto_opbrengst_EUR`.

**Onbalans:** `onbalans_afwijking_zon_kWh`, `_wind_kWh`, `_verbruik_kWh`, `_opwek_kWh`, `onbalans_basis_zon_EUR`, `_wind_EUR`, `_verbruik_EUR`, `_opwek_EUR`, `kosten_onbalans_zon_EUR`, `_wind_EUR`, `_verbruik_EUR`, `_opwek_EUR`, `_totaal_EUR`.

**Totaal:** `kosten_totaal_EUR`.

**Kengetallen rapportage:** `gelijktijdigheid_pct_van_verbruik`, `gelijktijdigheid_pct_van_opwek`, `gemiddelde_kosten_EUR_per_kWh` (verbruiker), `gemiddelde_netto_opbrengst_EUR_per_kWh` (opwekker), `gemiddelde_gelijktijdigheidsprijs_EUR_per_MWh`, `lokale_dekking_kWh`, `lokale_dekking_pct_van_bruto_afname`, `invoeding_gedeeld_pct`, `gelijktijdigheid_tarief_EUR_per_kWh`, `gelijktijdigheid_tarief_EUR_per_MWh`.

---

## 9. Belangrijke aannames / valkuilen

- **Hoofdmeter-only:** zelfconsumptie kan niet gerekend worden uit hoofdmeter. Alles wat je teruglevert (negatieve hoofdmeting) wordt als `afname_invoeden` als nieuwe opwekstroom met Prioriteit=0 toegevoegd — die deelt dus *eerst* met de gemeenschap.
- **Prioriteit lager = eerder gealloceerd.** Default ontbrekend = 9999 (achterin).
- **Binnen één prioriteitslaag** wordt pro rata verdeeld over assets, op basis van `opwek_kWh` van dat kwartier.
- **Onbalanskosten** voor verbruikers worden in de staat tussen Inkoop EPEX en subtotaal getoond, voor opwekkers als negatieve regel tussen Verkoop EPEX en subtotaal.
- **EPEX-prijs** wordt automatisch genormaliseerd van uur naar kwartier én van EUR/MWh naar EUR/kWh (mediaan-detectie).
- **Forwardprijs** schaalt het bronjaarpatroon per maand naar het forwardniveau — kwartierdynamiek blijft dus bewaard.
- **Validatie** in `participant_outputs_for_model`: als gemiddelde gelijktijdigheidsprijs van afnemers buiten de componentrange [min, max] valt → `ValueError`. Doe hetzelfde bij wind die wel gelijktijdig kWh + tarief heeft maar 0 opbrengst.
- **Tarieven**: `gelijktijdigheid_*` en `gvo_*` zijn EUR/kWh in `p`. `_pct` keys zijn fracties (bijv. 0.05 = 5%). Risicoprijzen weer EUR/kWh.

---

## 10. Migratiestappen Energy Studio

Mijn voorstel (gefaseerd):

1. **Stub UI met inputmodel** — bouw eerst de invoerstructuur (verbruik long, opwek long, epex, tariefdict). Hardcode een mini-dataset (1 dag, 2 locaties, 2 assets) voor sneltest.
2. **Port `allocate_opwek_priority` naar JS** — dit is het hart. Unit-test met handgemaakt voorbeeld waar je per kwartier kan natellen.
3. **Port `apply_prosumer_correction` + de pivots naar JS** — zorg dat je `model` object dezelfde kolomnamen heeft als hierboven; dat maakt cross-checken later makkelijk.
4. **Port `apply_economic_columns`** — letterlijke vermenigvuldigingen, snel klaar.
5. **`make_forward_model`** — vereist DateOffset-ekwivalent, kan met dayjs.
6. **Per-deelnemer laag** — alleen nodig als je individuele rapportages wil tonen.
7. **Validatie tussen Python en JS** — laat het Python-model één keer draaien op een echte dataset, exporteer het kwartiermodel als CSV, en check dat je JS dezelfde getallen produceert tot op ε. Gebruik bijvoorbeeld `kosten_totaal_EUR` per dag/maand als sanity-check.

Wat dit waarschijnlijk **niet** waard is om mee te porten:
- Excel formatting (`postprocess_excel_number_formats`, `write_excel_fast`, voorblad/achterblad, navigation buttons) — Energy Studio is een webtool, gebruik gewoon zijn eigen Plotly-stijl.
- `make_rekenblad_kwartiermodel` rapport-laag-3 — als jouw UI al kwartierdetail kan tonen heb je dit niet nodig.

---

*Einde specificatie.*
