// Taxonomy v3 — eight axes derived blindly from sparse NMF (k=8, α_W=1e-4)
// on 42,341 lists × 46 features. Phase 1 (data discovery) selected the basis
// on three data-only metrics: held-out matchup log-loss, basis stability
// across pre/post-Q1-2026 dataslate slices, and axis discrimination. Phase 2
// hardening confirmed seed/feature/quarterly robustness. Phase 3 named the
// axes post-hoc from top loadings + medoid lists, deliberately NOT from
// faction identity.
//
// Definitions, strengths, weaknesses, and matchup pairings are grounded in
// research playbooks at data/models/playstyle_axes_v3/playbooks/, compiled
// from Goonhammer Detachment Focus, the Q1 2026 Balance Dataslate review,
// and tournament reports.
//
// Locked basis: data/models/playstyle_axes_v3/. Pipeline projects new lists
// into this basis via pseudo-inverse so axis identity is stable across data
// refreshes.

export const archetypes = {
  mobileToolbox: {
    id: 'mobileToolbox',
    name: 'Mobile Toolbox',
    shortName: 'Toolbox',
    group: 'agile',
    definition: 'Diverse fast roster with movement tricks — Necron teleport pylons, GSC Subterranean Assault deepstrike, World Eaters Berzerker Warband forward charges, Tyranid synaptic shifts — paired with 4+ invuln saves on the anchor units. Shooting weight is near-zero; the threat is positioning + melee follow-through, not damage at range. Canonical expressions: Awakened Dynasty, Cursed Legion, Subterranean Assault, Berzerker Warband, Invasion Fleet.',
    strengths: [
      '8-12 distinct datasheets answer almost any threat from one list',
      'Reserve plays (deepstrike, teleport, infiltrate) dictate Turn 1 engagement',
      'Trade-engine triggers — Cursed Legion chain-buff, Mark of Khorne Fight on Death — reward absorbing damage'
    ],
    weaknesses: [
      'Minimal long-range firepower; must commit to melee to score damage',
      'Volume-infantry screens absorb the deepstrike, then counter-charge with the bigger list'
    ],
    counters: 'Heavy Gunline Toolbox (mobility shuts planted firepower), Skimmer Skirmish Fire (4+ invuln tanks Pistol fire)',
    weakTo: 'Transport Infantry (mass Cultist screens), Layered Lethal Combat (T7-9 chassis + invuln/FNP walls)',
    color: '#a78bfa'
  },
  skimmerFire: {
    id: 'skimmerFire',
    name: 'Skimmer Skirmish Fire',
    shortName: 'Skimmer',
    group: 'agile',
    definition: 'Light, fast platforms (Raiders, Venoms, Wave Serpents) firing on the move via the Assault keyword and Pistol weapons; AP-heavy but fragile, typically 6+ invuln saves at best. Wins by kiting and hit-and-fade trades. Canonical expressions: Drukhari Reaper\'s Wager (the Harlequin-splash flavor that\'s currently the strongest Drukhari detachment), Realspace Raiders, Kabalite Cartel, Aeldari Aspect Host all-aspects builds.',
    strengths: [
      'Dictates engagement range every turn — opponent can\'t set the trade',
      'Combat Drugs / Pain Tokens / Shrine Tokens cycle the army\'s damage profile turn by turn',
      'Aspect Host\'s Preternatural Precision (1 CP) gives one of Lethal Hits / Sustained Hits 1 / Ignore Cover (two with a Shrine Token)'
    ],
    weaknesses: [
      'Fragile — focused fire on the transports collapses the delivery engine',
      'Fast vehicle anti-armour (Knights, Mont\'ka, Wardogs) matches the speed AND cracks the chassis'
    ],
    counters: 'Heavy Gunline Toolbox (faster than the guns), Layered Lethal Combat (kite around the slog)',
    weakTo: 'Mobile Anti-Armour Vehicles (matched speed + AP-3+ Melta), Mobile Toolbox melee (catches the skimmers)',
    color: '#06b6d4'
  },
  mobileAntiArmour: {
    id: 'mobileAntiArmour',
    name: 'Mobile Anti-Armour Vehicles',
    shortName: 'AA Vehicles',
    group: 'aggressive',
    definition: 'Fast hard-hitting vehicle gunline. Melta, AP-3+, and indirect fire on T7-9 chassis — Chaos Knights Infernal Lance (the dominant detachment post-Q3-2025), Imperial Knights Questoris Companions, T\'au Mont\'ka. Front-loads damage by closing on key targets, deleting them with concentrated anti-armour, then repositioning before counter-fire connects.',
    strengths: [
      'Cracks elite anvils and durable midfield in 1-2 turns via Melta + AP-3+',
      '12"-base movement + Knight chassis dictate target priority',
      'Indirect coverage (Wardog Brigands, Plague Crawlers) denies cover-camping'
    ],
    weaknesses: [
      'Low model count — 30-Boyz mobs tarpit the chassis where they can\'t shoot',
      'Activation gap loses primary scoring vs 12-15 activation infantry lists'
    ],
    counters: 'Layered Lethal Combat (Melta cracks T7-9 chassis + ion shields), Skimmer Skirmish Fire (matched speed pops Raiders)',
    weakTo: 'Mid-T Mixed Brawler (mob tarpit), Transport Infantry (volume on objectives)',
    color: '#f59e0b'
  },
  midTBrawler: {
    id: 'midTBrawler',
    name: 'Mid-T Mixed Brawler',
    shortName: 'Brawler',
    group: 'aggressive',
    definition: 'T5-6 mob roster with mixed-profile units, Extra Attacks weapons, and toolbox anti-vehicle support. The Ork shape — War Horde\'s [SUSTAINED HITS 1] always-on, Da Big Hunt\'s Beast Snagga anti-vehicle pressure, Bully Boyz Meganob bricks. Wins by trading favorably across many bodies and locking vehicles in melee where they can\'t shoot.',
    strengths: [
      'Tarpits Knights and elite anvils — 12-15 activations vs 3-5 forces them to spread fire',
      'War Horde Sustained Hits 1 + Da Big Hunt anti-vehicle Squighog charges close turn 1',
      'Mixed profiles (Boyz + Nobz + Mek tech) bring both melee push and just-enough shooting'
    ],
    weaknesses: [
      'Lethal Hits + layered defenses (Death Guard FNP-stack, Custodes 2+/4++) eats T5-6 chassis efficiently',
      'Skimmer kite denies the engagement entirely — without melee, no damage cycle'
    ],
    counters: 'Mobile Anti-Armour Vehicles (mob locks Knights), Heavy Gunline Toolbox (mob crashes the line)',
    weakTo: 'Skimmer Skirmish Fire (kite denies engagement), Layered Lethal Combat (Lethal Hits melts T5-6)',
    color: '#f97316'
  },
  transportInfantry: {
    id: 'transportInfantry',
    name: 'Transport Infantry',
    shortName: 'Mech',
    group: 'agile',
    definition: 'Battleline infantry shipped in transports (Rhinos, Chimeras, Razorbacks, Land Raiders) with Devastating Wounds and Precision crit-shooting. The dominant CSM expression and one of the strongest meta archetypes. Canonical: Pactbound Zealots (keyword-stacking + crit-spamming, mid-50s WR), Soulforged Warpack (Daemon Engine contracts), Renegade Raiders, Chaos Cult, Emperor\'s Children Carnival of Excess.',
    strengths: [
      'Pactbound bonus crits multiply Devastating Wounds + Precision damage spikes',
      'Cultist screen + Possessed counter-punch absorbs alpha strike then trades back',
      'Bodies on every objective by Turn 2 — primary scoring race tips against low-activation lists'
    ],
    weaknesses: [
      'Heavy gunlines (Russ Demolishers, Hydras) pop transports turn 1 and unravel the plan',
      'Mass infantry hordes (AM Recon Element) out-volume the Cultist screen on primary'
    ],
    counters: 'Mobile Toolbox (Cultist screens absorb deepstrike), Mobile Anti-Armour Vehicles (12-15 vs 3-5 activations)',
    weakTo: 'Heavy Gunline Toolbox (transports popped + screen blasted), Mass Volume Horde (more bodies wins primary)',
    color: '#3b82f6'
  },
  massHorde: {
    id: 'massHorde',
    name: 'Mass Volume Horde',
    shortName: 'Horde',
    group: 'defensive',
    definition: 'Slow, large infantry blocks — 20-Cadian / 20-Catachan squads, Termagant swarms, Conscripts. High total OC, big wound pool, low movement. Canonical: Astra Militarum Recon Element with Masters of Camouflage (always-on cover-equivalent saves) backed by Sentinel infiltrators. Wins by planting bodies on objectives and refusing to move while the opponent fails to clear them in time.',
    strengths: [
      '60-100+ infantry models swamp objective contests; primary lifts to 15/turn ceiling',
      'Master of Camouflage cover save means anti-infantry firepower wastes wounds on saves',
      'Activation gap punishes elite low-body-count lists'
    ],
    weaknesses: [
      'Russ blast templates ignore cover and clear 8-15 models per turn',
      'Slow movement — can be outmaneuvered onto backline objectives by faster lists'
    ],
    counters: 'Transport Infantry (more bodies wins primary), Skimmer Skirmish Fire (volume catches kiters)',
    weakTo: 'Heavy Gunline Toolbox (Russes mulch infantry blobs), Mobile Anti-Armour Vehicles (Knight blast templates)',
    color: '#10b981'
  },
  heavyGunline: {
    id: 'heavyGunline',
    name: 'Heavy Gunline Toolbox',
    shortName: 'Heavy Gun',
    group: 'static',
    definition: 'Long-range Blast + AP-2 platforms with diverse heavy-weapon roster. Canonical: Astra Militarum Grizzled Company — Ruthless Discipline grants every Officer an extra Order, doubling the Tank Commander Order economy across 4-6 Russ chassis (Demolishers, Punishers, Battle Tanks) plus Hydras for AA + a small Cadian footprint for objective claim. Plants on the deployment line and turns the board into a no-go zone for anything without invuln saves.',
    strengths: [
      'Sustained ranged damage every turn; Demolisher S14 AP-3 D6 cracks T9 chassis on 3+',
      'Blast templates ignore cover; auto-clear 8-15 horde infantry per turn',
      'Order economy + reroll-1s gives consistent damage outputs across the whole list'
    ],
    weaknesses: [
      'Loses if forced to move — Russes can\'t fall back from melee without losing the trade',
      'Fast lists (Wave Serpents, Knights) kite firing arcs and dictate engagement'
    ],
    counters: 'Mass Volume Horde (Russes love hordes), Transport Infantry (pop the Rhinos turn 1)',
    weakTo: 'Mobile Toolbox (mobility shuts planted gunline), Skimmer Skirmish Fire (faster than the guns)',
    color: '#ef4444'
  },
  layeredLethal: {
    id: 'layeredLethal',
    name: 'Layered Lethal Combat',
    shortName: 'Layered',
    group: 'defensive',
    definition: 'Stacked defensive layers (invulnerable saves OR Feel No Pain) combined with Lethal Hits weapon volume and a control-detachment lean. Captures both slow durable platforms (Death Guard Virulent Vectorium — Plague Marines + Plagueburst Crawlers running Disgustingly Resilient + Contagion FNP-style mitigation, the canonical expression) and fast invuln-stacked combatants (Aeldari Aspect Host with Preternatural Precision Lethal-Hits triggers, Custodes Talons of the Emperor 2+/4++, Knights with ion shields). The common thread is layered defenses + lethal punch — not the toughness bracket, and not exclusively invuln saves.',
    strengths: [
      'Invuln + FNP stacks absorb alpha strike regardless of AP',
      'Lethal Hits bypasses high-T defenses on a 6 to hit',
      'Vectorium sticky-objective + Aspect Path-of-the-Warrior strats lock primary scoring'
    ],
    weaknesses: [
      'Concentrated Melta + AP-3+ anti-armour focus fire cracks the durable core',
      'Pure ranged kiting (Skimmer Skirmish) denies the Lethal-Hits engagement entirely'
    ],
    counters: 'Mid-T Mixed Brawler (Lethal Hits eats T5-6), Mass Volume Horde (4+ invuln resists volume)',
    weakTo: 'Mobile Anti-Armour Vehicles (Melta cracks the chassis), Skimmer Skirmish Fire (can\'t catch them)',
    color: '#14b8a6'
  }
};

// Modifier flags — orthogonal to playstyle. Surfaced as glyphs/badges, not
// as their own ratings.
export const archetypeFlags = {
  dependency: {
    id: 'dependency',
    name: 'Leader Dependent',
    shortName: 'Dep',
    icon: '⚙',
    definition: 'List relies on character/leader auras or chain buffs. Killing the leader breaks meaningful behavior across the rest of the army.',
    color: '#a78bfa'
  },
  fragility: {
    id: 'fragility',
    name: 'Glass Cannon',
    shortName: 'Frag',
    icon: '◇',
    definition: 'High AP-2+ output paired with low average toughness. Murderous output curve but folds under return fire.',
    color: '#fb7185'
  }
};

// Visual radar grouping. Order around the radar: Aggressive → Agile →
// Defensive → Static (clockwise).
export const archetypeGroups = {
  aggressive: { label: 'Aggressive', color: '#f97316', members: ['mobileAntiArmour', 'midTBrawler'] },
  agile:      { label: 'Agile',      color: '#06b6d4', members: ['mobileToolbox', 'skimmerFire', 'transportInfantry'] },
  defensive:  { label: 'Defensive',  color: '#10b981', members: ['massHorde', 'layeredLethal'] },
  static:     { label: 'Static',     color: '#ef4444', members: ['heavyGunline'] }
};

// Radar display order (clockwise from top, group-clustered)
export const archetypeRadarOrder = [
  'mobileAntiArmour', 'midTBrawler',                       // aggressive
  'mobileToolbox', 'skimmerFire', 'transportInfantry',     // agile
  'massHorde', 'layeredLethal',                            // defensive
  'heavyGunline',                                          // static
];

// Fallback ratings — used when tournamentData.json doesn't cover a faction.
// All neutral 5s by design; the data overlay (dataIntegration.js) writes
// real values from our pipeline. Keys here exist mostly to define the
// faction list the UI iterates over.
const _fallback = (extras = {}) => ({
  mobileToolbox: 5, skimmerFire: 5, mobileAntiArmour: 5, midTBrawler: 5,
  transportInfantry: 5, massHorde: 5, heavyGunline: 5, layeredLethal: 5,
  dependencyShare: 0, fragilityShare: 0, ...extras,
});

export const factionRatings = {
  'Adepta Sororitas': _fallback(),
  'Adeptus Custodes': _fallback(),
  'Adeptus Mechanicus': _fallback(),
  'Aeldari': _fallback(),
  'Astra Militarum': _fallback(),
  'Black Templars': _fallback(),
  'Blood Angels': _fallback(),
  'Chaos Daemons': _fallback(),
  'Chaos Knights': _fallback(),
  'Chaos Space Marines': _fallback(),
  'Dark Angels': _fallback(),
  'Death Guard': _fallback(),
  'Deathwatch': _fallback(),
  'Drukhari': _fallback(),
  "Emperor's Children": _fallback(),
  'Genestealer Cult': _fallback(),
  'Grey Knights': _fallback(),
  'Imperial Agents': _fallback(),
  'Imperial Knights': _fallback(),
  'Leagues of Votann': _fallback(),
  'Necrons': _fallback(),
  'Orks': _fallback(),
  'Space Marines (Astartes)': _fallback(),
  'Space Wolves': _fallback(),
  "T'au Empire": _fallback(),
  'Thousand Sons': _fallback(),
  'Tyranids': _fallback(),
  'World Eaters': _fallback(),
};

// Pairing matrix — soft rock-paper-scissors derived from each axis's
// tactical role + 10e mechanics. Sourced from the v3 archetype playbooks
// at data/models/playstyle_axes_v3/playbooks/.
export const pairingMatrix = [
  { archetype: 'Mobile Toolbox',              strongVs: 'Heavy Gunline Toolbox, Skimmer Skirmish Fire', weakVs: 'Transport Infantry, Layered Lethal Combat', neutral: 'Mobile Anti-Armour, Mid-T Brawler, Mass Horde' },
  { archetype: 'Skimmer Skirmish Fire',       strongVs: 'Heavy Gunline Toolbox, Layered Lethal Combat', weakVs: 'Mobile Anti-Armour Vehicles, Mobile Toolbox', neutral: 'Mid-T Brawler, Transport Infantry, Mass Horde' },
  { archetype: 'Mobile Anti-Armour Vehicles', strongVs: 'Layered Lethal Combat, Skimmer Skirmish Fire', weakVs: 'Mid-T Mixed Brawler (tarpit), Transport Infantry (volume)', neutral: 'Mobile Toolbox, Mass Horde, Heavy Gunline' },
  { archetype: 'Mid-T Mixed Brawler',         strongVs: 'Mobile Anti-Armour, Heavy Gunline Toolbox', weakVs: 'Skimmer Skirmish Fire, Layered Lethal Combat', neutral: 'Mobile Toolbox, Transport Infantry, Mass Horde' },
  { archetype: 'Transport Infantry',          strongVs: 'Mobile Toolbox, Mobile Anti-Armour Vehicles', weakVs: 'Heavy Gunline Toolbox, Mass Volume Horde', neutral: 'Skimmer Fire, Mid-T Brawler, Layered Lethal' },
  { archetype: 'Mass Volume Horde',           strongVs: 'Transport Infantry, Skimmer Skirmish Fire', weakVs: 'Heavy Gunline Toolbox, Mobile Anti-Armour Vehicles', neutral: 'Mobile Toolbox, Mid-T Brawler, Layered Lethal' },
  { archetype: 'Heavy Gunline Toolbox',       strongVs: 'Mass Volume Horde, Transport Infantry', weakVs: 'Mobile Toolbox, Skimmer Skirmish Fire', neutral: 'Mobile Anti-Armour, Mid-T Brawler, Layered Lethal' },
  { archetype: 'Layered Lethal Combat',       strongVs: 'Mid-T Mixed Brawler, Mass Volume Horde', weakVs: 'Mobile Anti-Armour Vehicles, Skimmer Skirmish Fire', neutral: 'Mobile Toolbox, Transport Infantry, Heavy Gunline' },
];

export const factions = Object.keys(factionRatings);
