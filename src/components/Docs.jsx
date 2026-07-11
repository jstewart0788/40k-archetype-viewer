import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { InlineMath, BlockMath } from 'react-katex';
import 'katex/dist/katex.min.css';
import { useTournamentData } from '../data/TournamentDataContext';

// Section metadata — single source of truth for both the sidebar nav and
// the scroll-spy active state. Edit here, the rest follows.
const SECTIONS = [
  { id: 'overview',      label: 'Overview' },
  { id: 'not-for',       label: 'What this is not' },
  { id: 'assumptions',   label: 'Assumptions' },
  { id: 'builds',        label: 'Build clusters' },
  { id: 'playstyles',    label: 'Playstyle archetypes' },
  { id: 'features',      label: 'List features (basis inputs)' },
  { id: 'skill',         label: 'Skill rating' },
  { id: 'winrate',       label: 'Win rate calculation' },
  { id: 'matchup',       label: 'Matchup model' },
  { id: 'examples',      label: 'Example list ranking' },
  { id: 'filters',       label: 'Filters & quality controls' },
  { id: 'caveats',       label: 'Caveats' },
  { id: 'pushback',      label: 'Where to push back' },
  { id: 'feedback',      label: 'Feedback' },
];

const FEEDBACK_EMAIL = 'corinward@proton.me';

const Docs = () => {
  const { dataMetadata } = useTournamentData();
  const [activeId, setActiveId] = useState(SECTIONS[0].id);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const observersRef = useRef([]);

  // Scroll-spy: highlight the section currently in view. Use IntersectionObserver
  // with a band centred near the top of the viewport so the active state flips
  // when a new section's heading crosses the mark — not when it's barely visible
  // at the bottom.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        // Pick the entry closest to the top that's intersecting.
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => a.target.getBoundingClientRect().top - b.target.getBoundingClientRect().top);
        if (visible.length) setActiveId(visible[0].target.id);
      },
      { rootMargin: '-15% 0% -70% 0%', threshold: 0 }
    );
    SECTIONS.forEach(s => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });
    observersRef.current.push(observer);
    return () => observer.disconnect();
  }, []);

  const handleNavClick = (e, id) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActiveId(id);
      setMobileNavOpen(false);
      // Update URL hash for deep-link without jumping.
      history.replaceState(null, '', `#${id}`);
    }
  };

  const games  = dataMetadata.gamesCount?.toLocaleString();
  const events = dataMetadata.eventsCount?.toLocaleString();
  const range  = dataMetadata.dateRange;

  return (
    <div className="min-h-screen">
      <div className="container mx-auto px-4 lg:px-6 py-8">
        {/* Mobile TOC trigger */}
        <div className="lg:hidden mb-4 flex items-center justify-between sticky top-16 bg-slate-950/95 backdrop-blur-sm py-2 -mx-4 px-4 border-b border-slate-800 z-40">
          <span className="text-sm text-slate-400">Docs · {SECTIONS.find(s => s.id === activeId)?.label}</span>
          <button
            onClick={() => setMobileNavOpen(o => !o)}
            className="text-xs px-3 py-1.5 rounded bg-slate-800 text-slate-200 hover:bg-slate-700"
          >
            {mobileNavOpen ? 'Close' : 'Sections'}
          </button>
        </div>
        {mobileNavOpen && (
          <nav className="lg:hidden mb-6 bg-slate-900/95 rounded-lg border border-slate-800 p-3">
            {SECTIONS.map(s => (
              <a
                key={s.id}
                href={`#${s.id}`}
                onClick={(e) => handleNavClick(e, s.id)}
                className={`block py-1.5 px-2 rounded text-sm ${
                  activeId === s.id ? 'bg-purple-900/40 text-white' : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                {s.label}
              </a>
            ))}
          </nav>
        )}

        <div className="lg:grid lg:grid-cols-[240px_minmax(0,680px)] lg:gap-12 max-w-5xl">
          {/* Sticky sidebar nav (desktop only) */}
          <aside className="hidden lg:block">
            <nav className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto pr-2">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-3">Documentation</div>
              <ul className="space-y-1 text-sm">
                {SECTIONS.map(s => (
                  <li key={s.id}>
                    <a
                      href={`#${s.id}`}
                      onClick={(e) => handleNavClick(e, s.id)}
                      className={`block py-1.5 px-2 rounded transition-colors border-l-2 ${
                        activeId === s.id
                          ? 'border-purple-500 text-white bg-purple-900/20'
                          : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
                      }`}
                    >
                      {s.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>

          {/* Reading column */}
          <main className="prose-doc">
            <header className="mb-12">
              <h1 className="text-4xl font-bold text-white mb-3">Docs</h1>
              <p className="text-slate-400">
                How the numbers on this site are calculated. Open architecture — push back where you disagree.
              </p>
              {games && (
                <p className="text-slate-500 text-xs mt-3">
                  Current dataset: <span className="text-slate-300">{games}</span> tournament games · <span className="text-slate-300">{events}</span> events · {range}
                </p>
              )}
            </header>

            {/* ─────────────────────────────────────────── Overview */}
            <Section id="overview" title="Overview">
              <p>
                Three things this site does: cluster tournament army lists into recurring "build" patterns per faction ({dataMetadata.buildCount ?? 'about 100'} of them), score each list across 8 playstyle axes for cross-faction comparison, and estimate matchup win rates between builds. Every number is derived from completed tournament games, with player skill explicitly modelled so faction- and build-level rates aren't just "who happens to play this."
              </p>
            </Section>

            {/* ─────────────────────────────────────────── What this is not */}
            <Section id="not-for" title="What this is not">
              <Callout>
                These are <strong>descriptive estimates</strong> of how tournament-game observations have resolved, not <strong>causal estimates</strong> of faction or build strength. A win rate reflects its players as much as its rules. If you take one thing from this page, take that.
              </Callout>
              <ul className="list-disc pl-5 space-y-1.5 mt-4">
                <li>Not a tier list. The 0–10 axes and win rates are quantile-ranked or Elo-adjusted across the observed meta — they say "this faction commits to <em>shooting</em> more than these others" or "this build's pilots beat their average matchup expectation," not "this faction is good."</li>
                <li>Not a single-game predictor. A 60% favourite still loses 40% of the time. Pilot skill, dice variance, mission, and deployment dominate any individual match.</li>
                <li>Not a rules database. Datasheet stats and detachment rules come from public references; this site only consumes them as features.</li>
              </ul>
            </Section>

            {/* ─────────────────────────────────────────── Assumptions */}
            <Section id="assumptions" title="Assumptions">
              <p>The load-bearing claims that, if violated, invalidate downstream numbers. Named here so you know exactly what to attack.</p>
              <ul className="list-disc pl-5 space-y-2 mt-3">
                <li><strong>Stationarity within a balance dataslate.</strong> Win rates and cluster centroids are assumed approximately stable inside one dataslate window. Across dataslates, faction strength shifts and old games become weakly informative.</li>
                <li><strong>Conditional independence of game outcomes</strong> given the players' skills, the faction matchup, and the list-feature differential. This is what lets the rating model converge.</li>
                <li><strong>Exchangeability of players within the skill prior.</strong> The Bayesian rating treats each player's true skill as drawn from a common Normal prior. Heavy regional or playstyle-specific selection effects could violate this.</li>
                <li><strong>Selection bias is real and unmodelled.</strong> Tournament-game observations are not a random sample of the meta — they're a sample of <em>players who travel to compete</em>. Casual play, kitchen-table results, and online-only formats are absent. Treat all numbers as conditional on "this player showed up and recorded a result."</li>
                <li><strong>Lists that didn't show up tell us nothing.</strong> A build with zero observations is treated as unmeasured, not weak. A build with five observations is treated as measured-with-large-uncertainty, not stable.</li>
              </ul>
            </Section>

            {/* ─────────────────────────────────────────── Build clusters */}
            <Section id="builds" title="Build clusters (the 104)">
              <p>
                Each faction's lists get grouped into <em>builds</em> — recurring patterns of which units appear together. Algorithm: TF-IDF transform of the list × datasheet count matrix, then non-negative matrix factorisation (NMF). The number of builds per faction <InlineMath math="k" /> scales with sample size:
              </p>
              <BlockMath math="k_{\text{faction}} = \mathrm{clip}\!\left(\mathrm{round}\!\left(\sqrt{n_{\text{lists}}/100}\right),\ 3,\ 7\right)" />
              <p>
                Datasheets appearing in fewer than 5 lists per faction are dropped before fitting (typo and one-off noise). Components with fewer than 50 hard-assigned lists post-fit are pruned.
              </p>
              <h3 className="text-lg font-semibold text-purple-300 mt-6 mb-2">Cluster ID stability across refits</h3>
              <p>
                When the model is refit (more games come in), the new components are Hungarian-matched against the previous run's centroids by cosine similarity. New components with cosine ≥ 0.60 to an existing cluster inherit that cluster's archetype ID and human-edited name. New emergent clusters (no match) get fresh IDs. This is what stops "Lion's Blade Task Force" from silently becoming "Cluster 47" after a refit.
              </p>
              <h3 className="text-lg font-semibold text-purple-300 mt-6 mb-2">Alias resolution</h3>
              <p>
                Before clustering, every unit name in every list is resolved through a curated alias table. This collapses faction-prefixed names ("Black Templars Repulsor Executioner" → "Repulsor Executioner"), localisations ("Cavaliers Krootox" → "Krootox Riders"), GW renames ("Marneus Calgar" → "Marneus Calgar in Armour of Antilochus"), diacritic strips, and known typos. Without this, "the same unit" splits across multiple feature columns and dilutes cluster centres.
              </p>
              <h3 className="text-lg font-semibold text-purple-300 mt-6 mb-2">Naming</h3>
              <p>
                Cluster names default to the dominant detachment when ≥65% of the cluster runs it and that detachment isn't shared with another cluster in the same faction. Otherwise the cluster gets a unit-based name (e.g. "Repulsor Gunline"). All names go through an LLM step that consumes a community-canon naming reference to prefer terminology players actually use ("Mortarion's Hammer" rather than "Plagueburst Crawler Build").
              </p>
            </Section>

            {/* ─────────────────────────────────────────── Playstyle archetypes */}
            <Section id="playstyles" title="Playstyle archetypes (the 8)">
              <p>
                A cross-faction taxonomy summarising <em>how</em> a list plays. The eight axes were derived blindly via sparse non-negative matrix factorisation on 42,341 lists × 46 features, not hand-designed. They are: Mobile Toolbox, Skimmer Skirmish Fire, Mobile Anti-Armour Vehicles, Mid-T Mixed Brawler, Transport Infantry, Mass Volume Horde, Heavy Gunline Toolbox, Layered Lethal Combat. Each axis has a researched playbook explaining the role, faction expressions, and matchup logic.
              </p>
              <h3 className="text-lg font-semibold text-purple-300 mt-6 mb-2">How the basis was selected</h3>
              <p>
                Three-phase discipline, deliberately data-first to avoid bias:
              </p>
              <ul className="list-disc pl-5 space-y-1.5 mt-3">
                <li><strong>Phase 1 (discovery).</strong> Fit candidate bases at <InlineMath math="k = 5..12" /> with varying sparsity, score on three data-only metrics: held-out matchup log-loss, max off-diagonal axis correlation (lower = more discriminative), and basis stability across pre-/post-Q1-2026-dataslate slices. Picked the basis that wins at least two of the three with no degenerate "dead axes" (background components that absorb noise at small sample sizes).</li>
                <li><strong>Phase 2 (hardening).</strong> Confirmed seed-robust (mean cosine 0.987 across 8 random seeds), feature-subset-robust (0.982 after dropping the 5 lowest-loading features), and quarterly-stable (0.935 across calendar quarters with one axis catching a real Q1→Q2 indirect-fire meta shift).</li>
                <li><strong>Phase 3 (post-hoc naming).</strong> Names assigned from top-loading features and medoid lists per axis — deliberately <em>not</em> from faction identity. The Aeldari Aspect Host case forced one rename (Durable Lethal Midfield → Layered Lethal Combat) when the data showed the axis was capturing invuln-stacks plus Lethal Hits, not "slow durable" specifically.</li>
              </ul>
              <h3 className="text-lg font-semibold text-purple-300 mt-6 mb-2">Projection</h3>
              <p>
                The basis is locked. New lists project into it via pseudo-inverse:
              </p>
              <BlockMath math="W_{\text{new}} = X_{\text{new}} \cdot H^{+}" />
              <p>
                where <InlineMath math="H" /> is the locked component-loadings matrix and <InlineMath math="X" /> is the z-scored, non-negative-shifted feature matrix. NMF non-negativity is enforced by clipping at zero. Re-fitting only happens on explicit re-derivation — axis identity stays stable across data refreshes.
              </p>
              <h3 className="text-lg font-semibold text-purple-300 mt-6 mb-2">The 0–10 scale is quantile-ranked</h3>
              <p>
                Raw projection scores aren't comparable across factions — Astra Militarum naturally has more long-range guns than Tyranids in absolute terms. So the displayed 0–10 is a quantile rank <em>across the {dataMetadata.factionCount ?? '28'} factions</em> for each axis:
              </p>
              <BlockMath math="\text{rating}_{f, a} = 10 \cdot \frac{\mathrm{rank}(s_{f, a})}{|F|}" />
              <p>
                where <InlineMath math="s_{f,a}" /> is faction <InlineMath math="f" />'s mean projection score on axis <InlineMath math="a" />, <InlineMath math="\mathrm{rank}(\cdot) \in \{1, \dots, |F|\}" /> is its rank from lowest to highest, and <InlineMath math="|F|" /> is the number of factions. The bottom faction lands at <InlineMath math="10/|F| \approx 0.36" /> rather than exactly 0; the top is exactly 10. So a Tyranids reading of 0.7 on Heavy Gunline Toolbox means "Tyranids commit much less to long-range Blast/AP-2 platforms than the rest of the meta," not "Tyranids cannot shoot." The bottom four or five factions on any axis compress into the 0–2 range; that's expected, not a bug.
              </p>
              <h3 className="text-lg font-semibold text-purple-300 mt-6 mb-2">Composition signal, not winning signal</h3>
              <p>
                The faction radar shows the average <em>composition</em> of the faction's lists across these eight axes — the kinds of units those lists tend to bring. It does not show which builds are <em>winning</em>. A 9 on Heavy Gunline Toolbox for Astra Militarum means "AM is at the top of the meta on long-range Blast/AP-2 platforms," not "AM's heavy-gunline build is the meta-strongest AM list." Use the build cards below the radar — and the win-rate / momentum signals on each — for the winning question. The two answer different things and both are honest at what they show.
              </p>
            </Section>

            {/* ─────────────────────────────────────────── List features (basis inputs) */}
            <Section id="features" title="List features (basis inputs)">
              <p>
                The 8 playstyle axes are derived from <strong>46 list-level features</strong> via NMF. Each feature is computed once per list during ingestion (<code>pipeline/list_features.py</code>) and z-scored across the corpus before projection. The same features cross-load into multiple axes — for example, <code>bulk_avg_movement</code> contributes to six of eight axes, which is honest about how mobility correlates with most modern competitive lists but means the axes are partially overlapping by construction.
              </p>
              <p>
                Cross-loading isn't a bug per se — NMF minimises reconstruction error with no orthogonality constraint, so any feature shared across "good lists" naturally loads on most axes. The way to clean it up is at the <em>feature engineering</em> layer: drop universal-correlate features, transform raw counts into bucketed flags, or add interaction terms.
              </p>

              <h3 className="text-lg font-semibold text-purple-300 mt-6 mb-2">Currently in the basis (46 features)</h3>

              <h4 className="text-base font-semibold text-purple-200 mt-4 mb-1">Detachment + faction shift axes (10)</h4>
              <p className="text-sm">
                Pre-computed weights describing how a detachment rule (<code>det_*_shift</code>) or faction army rule (<code>fac_*_shift</code>) tilts the list along five behavioural axes. Live in <code>wh_detachment_shifts</code> / <code>wh_faction_shifts</code>; hand-curated from rules text.
              </p>
              <ul className="list-disc pl-5 space-y-0.5 text-sm mt-2">
                <li><code>det_control_shift</code>, <code>fac_control_shift</code> — board-control / OC tools the detachment or army rule grants (action economy, sticky objectives, OC bonuses)</li>
                <li><code>det_mobility_shift</code> — extra movement / scout / advance + charge (no faction equivalent — mobility is unit-driven, not army-rule-driven in 10th)</li>
                <li><code>det_shooting_potency_shift</code> — re-rolls / sustained / lethal granted to ranged attacks</li>
                <li><code>det_melee_potency_shift</code>, <code>fac_melee_potency_shift</code> — re-rolls / extra attacks granted to melee</li>
                <li><code>det_durability_shift</code>, <code>fac_durability_shift</code> — FNP, +1 to save, halving damage, etc.</li>
                <li><code>det_trade_shift</code> — buffs that reward trading units (revive on death, points-back-on-loss, etc.)</li>
                <li><code>det_action_economy_shift</code> — extra orders, free strats, more CP per turn</li>
              </ul>

              <h4 className="text-base font-semibold text-purple-200 mt-4 mb-1">List composition (6)</h4>
              <ul className="list-disc pl-5 space-y-0.5 text-sm">
                <li><code>n_squads</code> — total squad count (a 12-squad list and a 5-squad list play very differently)</li>
                <li><code>n_battleline_squads</code> — battleline-keyword squads, the "scoring core" most lists need to hold objectives</li>
                <li><code>avg_unit_size</code> — average models per squad. Big-blob lists vs small-elite lists</li>
                <li><code>n_transports</code> — count of dedicated transport vehicles (Rhino, Impulsor, Land Raider, Raider, Wave Serpent, etc.)</li>
                <li><code>n_distinct_datasheets</code> — how varied the roster is. Toolbox lists run 12+ different datasheets; spam lists run 4–6</li>
                <li><code>total_oc</code> — sum of objective-control values across the army. Different lists have very different "presence" on objectives even at equal model count</li>
              </ul>

              <h4 className="text-base font-semibold text-purple-200 mt-4 mb-1">Bulk durability + movement (4)</h4>
              <ul className="list-disc pl-5 space-y-0.5 text-sm">
                <li><code>bulk_avg_movement</code> — points-weighted average movement value across all units. Loads heavily across most axes (a near-universal "fast lists do well" signal)</li>
                <li><code>bulk_avg_save_armor</code> — points-weighted average armor save. 2+/3+ marines vs 6+/5+ guard at scale</li>
                <li><code>bulk_wound_pool</code> — sum of wound counts across all models. Mass-infantry lists 200+, elite-vehicle lists 80–120</li>
                <li><code>n_squads_mixed_profile</code> — squads that mix sub-units with different profiles (e.g. Cadian Shock Troops + sergeant + special weapon variants)</li>
              </ul>

              <h4 className="text-base font-semibold text-purple-200 mt-4 mb-1">Toughness + invuln buckets (6)</h4>
              <p className="text-sm">
                Bucketed flags capture <em>how many</em> squads sit in each durability tier — finer than averages, which smear an elite anvil + chaff screen into mush.
              </p>
              <ul className="list-disc pl-5 space-y-0.5 text-sm mt-2">
                <li><code>n_squads_t5to6</code> — Marines, Custodes infantry, Tyranid mid-monsters, Beast Snagga Boyz</li>
                <li><code>n_squads_t7to9</code> — light vehicles, Daemon Princes, Knight Armigers, big monsters</li>
                <li><code>n_squads_t10plus</code> — main-battle tanks, Knight Castellans, C'tan Shards</li>
                <li><code>n_squads_invuln_4plus</code> — premium invuln stacks (Custodes, Sister Sacresants, Knight ion shields)</li>
                <li><code>n_squads_invuln_5plus</code> — middle-tier invuln (Possessed, Wraithguard, Lychguard)</li>
                <li><code>n_squads_invuln_6plus</code> — chaff invuln (cultists, gretchin, infiltrator squads)</li>
              </ul>

              <h4 className="text-base font-semibold text-purple-200 mt-4 mb-1">Range + AP + anti-X (9)</h4>
              <ul className="list-disc pl-5 space-y-0.5 text-sm">
                <li><code>sp_n_long_range</code>, <code>n_weapons_range_ge36</code> — squad-precise count of squads with a 36"+ weapon, plus raw weapon-row count at 36"+</li>
                <li><code>sp_ranged_attack_volume</code> — squad-precise sum of ranged attacks fired in a turn at full strength</li>
                <li><code>n_weapons_ap_2</code>, <code>n_weapons_ap_3plus</code> — counts of AP-2 and AP-3+ weapon profiles</li>
                <li><code>sp_n_high_ap</code> — squad-precise count of squads with AP-2+ shooting</li>
                <li><code>n_weapons_effective_anti_armour</code> — weapons that actually wound T9+ vehicles efficiently (S8+ AP-2+ anti-vehicle)</li>
                <li><code>sp_n_anti_vehicle</code> — squad-precise count of squads with the Anti-Vehicle keyword</li>
                <li><code>n_weapons_melta</code> — Melta-keyword weapon count (Melta Bomb / Meltagun / Multi-melta etc.)</li>
              </ul>

              <h4 className="text-base font-semibold text-purple-200 mt-4 mb-1">Weapon special rules (10)</h4>
              <p className="text-sm">
                Counts of weapon-row keywords across the army. Different lists weight these very differently — Dark Angels run lots of Devastating, Necron Wraith Spam runs Sustained, Iron Storm runs Heavy, etc.
              </p>
              <ul className="list-disc pl-5 space-y-0.5 text-sm mt-2">
                <li><code>n_weapons_sustained</code> — Sustained Hits keyword</li>
                <li><code>n_weapons_lethal</code> — Lethal Hits keyword (auto-wound on crit)</li>
                <li><code>n_weapons_devastating</code> — Devastating Wounds keyword (mortal wounds on crit)</li>
                <li><code>n_weapons_precision</code> — Precision keyword (target characters in unit)</li>
                <li><code>n_weapons_indirect</code> — Indirect Fire keyword (no LoS needed)</li>
                <li><code>n_weapons_assault</code> — Assault keyword (advance + shoot)</li>
                <li><code>n_weapons_heavy</code> — Heavy keyword (+1 to hit when stationary)</li>
                <li><code>n_weapons_blast</code> — Blast keyword (+1 attack per 5 models in target)</li>
                <li><code>n_weapons_pistol</code> — Pistol keyword (shoot in melee + ignore engagement range)</li>
                <li><code>n_weapons_extra_attacks</code> — Extra Attacks keyword (separate attack profile from a primary weapon)</li>
              </ul>

              <h4 className="text-base font-semibold text-purple-200 mt-4 mb-1">Melee (1)</h4>
              <ul className="list-disc pl-5 space-y-0.5 text-sm">
                <li><code>sp_melee_attack_volume</code> — squad-precise sum of melee attacks at full strength. The melee equivalent of the ranged-attack-volume feature; combined with <code>det_melee_potency_shift</code> it captures most of the "this list wants to fight you" signal</li>
              </ul>

              <h3 className="text-lg font-semibold text-purple-300 mt-8 mb-2">Proposed but not yet wired</h3>
              <p>
                Surfaced by the rules-mechanics + statistics reviewers and stashed in <code>.local-reference/shelved_ideas.md</code>. Listed here so the reader can see what the basis is currently <em>not</em> capturing — playstyles that depend on these features will read off-axis or load on the wrong axis until they're added.
              </p>

              <h4 className="text-base font-semibold text-purple-200 mt-4 mb-1">Defensive abilities</h4>
              <ul className="list-disc pl-5 space-y-0.5 text-sm">
                <li><code>n_squads_with_stealth</code> — Stealth keyword (−1 to hit at 12"+). Currently absent; affects Eldar Ranger / Drukhari Mandrake style lists</li>
                <li><code>n_squads_with_lone_op</code> — Lone Operative (untargetable beyond 12"). Hides characters from indirect; Spider/Phobos rely on it</li>
                <li><code>n_squads_with_minus_one_to_hit</code> — generic −1 to hit (Smokescreen, Pall of Despair, etc.) — separate from Stealth because triggers differently</li>
                <li><code>has_battle_shock_protection</code> — sources of Battle Shock immunity / re-roll. Mass-infantry lists with vs without this play very differently into Drukhari Power-from-Pain or AM Officio Prefectus stacks</li>
              </ul>

              <h4 className="text-base font-semibold text-purple-200 mt-4 mb-1">Rules interactions</h4>
              <ul className="list-disc pl-5 space-y-0.5 text-sm">
                <li><code>n_weapons_rapid_fire</code> — Rapid Fire keyword (×2 attacks within half range). Currently captured indirectly via attack volume but not as a discrete signal</li>
                <li><code>has_fall_back_and_shoot</code> — units that can Fall Back and shoot (Tau Crisis, Necron Lychguard variants). Changes how "can be tied up in melee" matters</li>
                <li><code>has_oc_negation</code> — abilities that ignore enemy OC on objectives (Necron Wraith Spam, certain Death Guard). Changes the value of <code>total_oc</code> in matchups</li>
                <li><code>has_sticky_objectives</code> — sticky-objective rules (battleline-only or ability-driven). The "OC matters less" lever</li>
              </ul>

              <h4 className="text-base font-semibold text-purple-200 mt-4 mb-1">Feature engineering refinements</h4>
              <ul className="list-disc pl-5 space-y-0.5 text-sm">
                <li><code>anti_x_value_parsing</code> — currently anti-vehicle is a flag; the actual rule has a <em>value</em> (Anti-Vehicle 2+ / 4+ / etc.) that determines effectiveness. Need to parse and store the threshold</li>
                <li><code>top_max_movement_normalisation</code> — the existing <code>top_max_movement</code> is sometimes ambiguous when a unit's profile changes mid-game (transformations, mounted/dismounted)</li>
                <li><code>heavy_assault_movement_interaction</code> — Heavy and Assault keywords interact with movement state; an interaction term <code>n_weapons_heavy × bulk_avg_movement</code> would let the basis distinguish a static-Heavy list from a moving-Heavy list</li>
                <li><code>detachment_aware_battleline_weighting</code> — battleline counts should be weighted by detachment (some detachments make battleline scoring-stronger; the raw count doesn't capture this)</li>
              </ul>

              <h4 className="text-base font-semibold text-purple-200 mt-4 mb-1">Cross-loading reduction</h4>
              <ul className="list-disc pl-5 space-y-0.5 text-sm">
                <li><strong>Bucketed mobility</strong> — replace <code>bulk_avg_movement</code> with categorical fast/medium/slow flags. Removes the "fast = good" universal correlate that's loading on six of eight axes</li>
                <li><strong>Drop <code>n_distinct_datasheets</code></strong> — currently loads on five axes' top-8; mostly captures list complexity rather than playstyle. Should either be dropped or transformed into a "spam vs toolbox" categorical</li>
              </ul>
            </Section>

            {/* ─────────────────────────────────────────── Skill rating */}
            <Section id="skill" title="Skill rating">
              <p>
                Player skill is fit jointly with faction effects via a hierarchical Bayesian model. Each game contributes one Bernoulli observation:
              </p>
              <BlockMath math="P(\text{p1 wins}) = \sigma\!\left(\theta_{p_1} - \theta_{p_2} + \beta_{f_1} - \beta_{f_2}\right)" />
              <p>
                where <InlineMath math="\theta_{p}" /> is player skill, <InlineMath math="\beta_f" /> is the faction effect, and <InlineMath math="\sigma" /> is the logistic. Priors:
              </p>
              <BlockMath math="\theta_p \sim \mathcal{N}(0, \sigma_{\text{skill}}^2),\quad \beta_f \sim \mathcal{N}(0, \sigma_{\text{faction}}^2),\quad \sigma_{\text{skill}}, \sigma_{\text{faction}} \sim \text{HalfNormal}(1.0)" />
              <p>
                Fit with NUTS, 2 chains × 1,000 warmup + 1,000 samples. Latest run diagnostics: <code>max R̂ = 1.015</code>, <code>min ESS = 166</code>, <code>0 divergences</code>. The posterior σ ratio <InlineMath math="\sigma_{\text{skill}} / \sigma_{\text{faction}} \approx 8.1" /> says player skill explains roughly 8× more variance than faction choice — most of who wins is who's playing.
              </p>
              <p className="mt-3">
                For per-game weighting in matchup aggregation, we use a simpler time-aware Elo as a leak-free per-event snapshot of the player's strength. The full Bayesian posterior backs the win-rate adjustment on faction- and build-level numbers.
              </p>
            </Section>

            {/* ─────────────────────────────────────────── Win rate calculation */}
            <Section id="winrate" title="Win rate calculation">
              <p>
                Faction- and build-level win rates aren't raw <InlineMath math="W/(W+L)" /> — they're <strong>Elo-adjusted</strong> (so a player carrying a list to wins doesn't inflate the build's rate), <strong>time-weighted</strong> (so recent meta dominates while old games contribute weakly), and <strong>empirical-Bayes shrunk</strong> toward a prior (so a 5-0 cell at <em>n</em>=5 doesn't look as confident as a 5-0 cell at <em>n</em>=200).
              </p>
              <h3 className="text-lg font-semibold text-purple-300 mt-6 mb-2">Time weighting</h3>
              <p>
                Each game contributes an exponential-decay weight by event date:
              </p>
              <BlockMath math="w_g = \begin{cases} 0 & \text{game falls in a 14-day post-dataslate blackout} \\ \exp\!\bigl(-d_g / 45 \bigr) & \text{otherwise} \end{cases}" />
              <p>
                where <InlineMath math="d_g" /> is the game's age in days. With a 45-day half-life, a game from yesterday counts 1.0×; a game from 60 days ago counts ~0.5×; a game from six months ago counts ~0.06×. Pre-dataslate games still inform the estimate but don't drown out current-meta signal.
              </p>
              <p>
                The 14-day post-dataslate blackout exists because the first weekends after a balance update are the noisiest games in the data — pilots are testing, fields are smaller, lists aren't optimized. Heavy-weighting that period would solve "reflect current meta" by accidentally heavy-weighting the messy transition.
              </p>
              <h3 className="text-lg font-semibold text-purple-300 mt-6 mb-2">Effective sample size</h3>
              <p>
                Under weighting, the nominal game count overstates evidence. Effective sample size is what EB shrinkage and confidence intervals key off:
              </p>
              <BlockMath math="n_{\text{eff}} = \frac{(\sum w_g)^2}{\sum w_g^2}" />
              <p>
                A cell with 200 nominal games but most weight concentrated in the last 30 days might have <InlineMath math="n_{\text{eff}}" /> closer to 60. EB and CIs use <InlineMath math="n_{\text{eff}}" /> not the nominal count — a thin recent slice gets the shrinkage it deserves.
              </p>
              <h3 className="text-lg font-semibold text-purple-300 mt-6 mb-2">EB shrinkage</h3>
              <p>
                Per-faction matchup cells are shrunk toward the global archetype-vs-archetype prior:
              </p>
              <BlockMath math="\widehat{p}_{\text{cell}} = \frac{n_{\text{eff}} \cdot \bar{p}_{\text{cell}} + K \cdot p_{\text{prior}}}{n_{\text{eff}} + K}" />
              <p>
                With <InlineMath math="K = 64" /> for archetype-vs-archetype, <InlineMath math="K = 30" /> for build-vs-playstyle, and <InlineMath math="K = 20" /> for build-vs-build (thinner cells shrink harder). A cell needs roughly <InlineMath math="K" /> weighted-effective games before its observed mean dominates the prior. Cells with <InlineMath math="n_{\text{eff}} < 20" /> get the "low n" badge in the matchup explorer.
              </p>
              <h3 className="text-lg font-semibold text-purple-300 mt-6 mb-2">Momentum (composition signal)</h3>
              <p>
                Win rate is a <em>lagging</em> indicator — by the time a build is winning at scale, mainstream coverage has already noticed. The leading indicator is <strong>representation share</strong>: what fraction of a faction's recent lists are running this build. Pros bring new tech before the wins materialize, so adoption rate moves first.
              </p>
              <p>
                Each build gets a momentum badge derived from two non-overlapping windows:
              </p>
              <BlockMath math="\Delta_{\text{momentum}} = \frac{n_{b,\,\text{last 30d}}}{n_{f,\,\text{last 30d}}} - \frac{n_{b,\,\text{days 31–90}}}{n_{f,\,\text{days 31–90}}}" />
              <p>
                where <InlineMath math="n_{b}" /> is the build's list count and <InlineMath math="n_{f}" /> is the faction's total list count in the same window. The badge renders as <span className="text-emerald-400">↑</span> when <InlineMath math="\Delta > +4" /> pp, <span className="text-rose-400">↓</span> when <InlineMath math="\Delta < -4" /> pp, and <span className="text-slate-500">=</span> in between. Suppressed entirely when either window has fewer than 20 lists for the build (a noisy 30-day signal on a thin sample is worse than no signal).
              </p>
              <p>
                One special case: a build can be brand new — many recent lists, but a prior-60-day baseline of effectively zero — in which case <InlineMath math="\Delta" /> is meaningless. Those render as <span className="text-amber-300">✦</span> <em>emerging</em> (≥ 5 % of faction adoption in the recent window, &lt; 20 lists in the prior). The Emperor's Children Defiler Hammer post-Q1-2026 is the canonical case: 0.6 % of EC lists prior, 52 % current. The directional badge can't fire because there's no comparable history; the emerging badge says "this is brand new, watch this space."
              </p>
              <p>
                Two more cases where adoption momentum and win rate disagree, marked in <span className="text-amber-300">amber</span> instead of the normal green/red:
              </p>
              <ul className="list-disc pl-5 space-y-1 mt-2 text-sm">
                <li><strong>Refuge (rising adoption + sub-50 % WR).</strong> The build's player base is growing, but it's losing more games than it wins. Most likely cause: the build is absorbing players fleeing a worse build — not a meta-strong build itself. Blood Angels Bladeguard Beatdown post-Q1-2026 is the canonical case: +16 pp adoption, ~46 % WR, with the previous BA top build (Rage-Cursed Onslaught) collapsing in adoption alongside it.</li>
                <li><strong>Reluctant decline (falling adoption + ≥ 52 % WR).</strong> The build is still winning more than it loses, but players are moving away. Most likely cause: a points/rules change has been announced or anticipated; some players are pre-emptively pivoting; or the meta has surfaced a new counter that hasn't fully materialised in the WR yet.</li>
              </ul>
              <p className="mt-2">
                These don't change the underlying math — adoption Δ is what it is — but the colour cue tells a glancing reader to look at WR before drawing conclusions about the trend.
              </p>
              <p>
                Hover the badge for the underlying percentages. Note: representation share is <em>compositional</em> within the faction — a build can rise from 22 % to 28 % because it actually grew, or because another build collapsed. The badge tells you the direction; cross-check the WR and the build-card detail to understand whether what you're seeing is genuine adoption or a denominator effect.
              </p>
            </Section>

            {/* ─────────────────────────────────────────── Matchup model */}
            <Section id="matchup" title="Matchup model">
              <p>
                Two distinct surfaces. Worth keeping them separate, because they answer slightly different questions.
              </p>
              <h3 className="text-lg font-semibold text-purple-300 mt-6 mb-2">Build-vs-build cells (what the predictor reads at request time)</h3>
              <p>
                Every (build A, build B) cell is the pre-computed Elo-adjusted, time-weighted, EB-shrunk historical aggregate from §<a href="#winrate" className="text-purple-400 hover:text-purple-300 underline">Win rate calculation</a>. The predictor doesn't run a model when you pick two builds — it looks up the cell. With <InlineMath math="K=20" /> for build-vs-build (cells are thinner than faction-vs-build), a thin cell gets pulled hard toward the build-vs-playstyle prior. The "Confidence" badge reflects this on effective sample size: <em>direct</em> at <InlineMath math="n_{\text{eff}} \geq 30" />, <em>shrunk</em> at <InlineMath math="5 \leq n_{\text{eff}} < 30" />, and below 5 the predictor refuses to render a verdict at all and shows an "insufficient direct sample" warning.
              </p>
              <h3 className="text-lg font-semibold text-purple-300 mt-6 mb-2">LightGBM list-feature model (second-opinion signal in the predictor)</h3>
              <p>
                A LightGBM gradient-boosted ensemble is trained on every eligible head-to-head game using ~30 list-feature differentials (datasheet-count diffs, mobility, weapon-class counts, melee/ranged points share, detachment ability shifts, weapon-match confidence) plus faction-pair and skill differential. Time-block split: train on the first ~75% of the date range, validate on the next ~10%, test on the last ~15%. Latest test-set metrics: classifier accuracy 64.8%, Brier 0.217, log-loss 0.624 (vs uniform-baseline 0.50 / 0.25 / 0.693).
              </p>
              <p>
                For every NMF build pair the model is run at pipeline build time on each build's <em>centroid</em> (mean of its assigned lists' features in feature space) with skill differential set to zero. The predictor surfaces this as a second-opinion line under the EB-cell verdict: same matchup number derived from a different angle. The EB cell answers "what happened when these builds met"; the list-feature model answers "what does the matchup math say given each build's unit composition."
              </p>
              <p>
                The agreement label compares the two: <em>high</em> when they match within 2 percentage points (trust the verdict more), <em>moderate</em> at 2–5 pp (same direction, different magnitude), <em>low</em> at &gt;5 pp (signals disagree). Low agreement usually points to something the cell isn't capturing — a recent meta shift the historical record hasn't fully digested, or a list-feature pattern that's underrepresented in head-to-head games.
              </p>
              <p>
                The headline percentage on the verdict is still the EB cell. The list-feature model is a calibration check, not a replacement.
              </p>
            </Section>

            {/* ─────────────────────────────────────────── Example list ranking */}
            <Section id="examples" title="Example list ranking">
              <p>
                Each build card shows up to 5 example lists. Picked by:
              </p>
              <BlockMath math="\text{score}(L) = (W - 0.4 \cdot L) \cdot \exp\!\left(-\frac{\text{age}_L}{60\text{ days}}\right)" />
              <p>
                Wins-with-loss-penalty multiplied by a 60-day exponential recency decay — recent strong performances rank above old strong ones. Soft cap of 2 lists per event per build card so a single major doesn't monopolise every cluster's examples. Lists with fewer than 3 games are excluded.
              </p>
            </Section>

            {/* ─────────────────────────────────────────── Filters & quality controls */}
            <Section id="filters" title="Filters & quality controls">
              <ul className="list-disc pl-5 space-y-2">
                <li><strong>2K-tournament cut.</strong> Only games where both players ran lists at ≥1,950 points are eligible. Sub-2K formats (Combat Patrol, escalation events) are excluded — different unit-selection economics, not comparable to standard tournament play.</li>
                <li><strong>Event-size floor.</strong> Events with fewer than 8 players are excluded at extraction time. Below that, you usually have one player smashing a friend group at the kitchen table, which doesn't behave like a tournament. The 8-player floor admits local RTTs alongside majors — both are real competitive play; both deserve representation.</li>
                <li><strong>Faction-vs-roster contamination filter.</strong> Lists where more than 50% of unit roster comes from a different faction than the player's tag are quarantined (typically multi-list tournament submissions where the wrong list parsed into the wrong slot, or upstream-tag errors). About 100 lists per refresh.</li>
                <li><strong>Low-n suppression.</strong> The matchup explorer hides any cell with fewer than 5 direct games, and fades cells with 5–19 games by sample size. The predictor refuses to render a verdict at <InlineMath math="n &lt; 5" /> and shows an "insufficient direct sample" warning instead. Cells where the predictor still shows a verdict but the raw rate is misleading (small denominators, extreme rates) hide the raw rate entirely; only the EB-shrunk rate is shown when <InlineMath math="n &lt; 20" />.</li>
                <li><strong>Active list filter.</strong> Lists with zero recorded games (e.g. submitted but never played a round) are excluded from cluster centroids and example pools.</li>
              </ul>
            </Section>

            {/* ─────────────────────────────────────────── Caveats */}
            <Section id="caveats" title="Caveats">
              <ul className="list-disc pl-5 space-y-2">
                <li><strong>Distribution shift across dataslates.</strong> Faction balance changes every dataslate; old data has weaker informative content for the current meta. The dataset's date range is shown in the header — older data may not reflect current top tables.</li>
                <li><strong>Selection on "showed up to compete."</strong> The numbers describe tournament-going players, not the wider playerbase. Net-deck players may be over-represented in the high-skill tail of the rating posterior.</li>
                <li><strong>Win rates here will read lower than narrow majors-only feeds for top factions, by design.</strong> A different question gets a different answer. We measure "how do all tournament-going players perform with this faction across the full competitive population, controlled for skill, time-weighted toward recent meta" — not "how do top-skill pilots perform with this faction at majors in the current month." Three choices pull our headline numbers toward 50% relative to majors-only feeds: <strong>(1)</strong> a wider event filter (1,950-point, eight or more players) that includes local RTTs alongside majors; <strong>(2)</strong> Elo adjustment, which discounts the strong-pilots-attract-to-strong-factions feedback loop that lifts raw majors-only rates; <strong>(3)</strong> exponential time weighting (45-day half-life) over a six-month corpus, keeping statistical power without ignoring the long tail. The result is more conservative and statistically tighter — tens of thousands of weighted-effective games means much narrower confidence intervals than a 1-month tracker can offer. Our build-level numbers (top builds at 57–62 % WR) align much more closely with public faction-top numbers than our faction averages do; the gap is largest at faction-average level specifically because we're averaging across many builds majors-only feeds would silently filter out.</li>
                <li><strong>The 8 playstyle axes are learned from data, but the basis is locked.</strong> Sparse NMF on 42,341 lists × 46 features picked the eight axes; the projection then runs against that fixed basis on every refresh. A genuinely novel approach (a list that doesn't resemble anything in the training corpus) will project to its closest neighbours rather than getting its own axis. Re-derivation requires an explicit re-fit and is anchored by a stability check so axis identity doesn't drift between dataslates.</li>
                <li><strong>Builds are statistical groupings, not labels endorsed by their players.</strong> Two players running similar units land in the same cluster regardless of intent.</li>
                <li><strong>Causal interpretation is unwarranted.</strong> A 60% Imperial Knights win rate means "Imperial Knights players, given how they're skilled and which lists they bring, won 60% of their games" — not "Imperial Knights are 60% better than average."</li>
              </ul>
            </Section>

            {/* ─────────────────────────────────────────── Where to push back */}
            <Section id="pushback" title="Where to push back">
              <p>
                Three places in the pipeline are <em>judgment calls dressed as parameters</em>. If the model feels off, these are the most likely culprits and the most valuable feedback we can get:
              </p>
              <ol className="list-decimal pl-5 space-y-2 mt-3">
                <li>
                  <strong>The k-per-faction NMF formula.</strong> <InlineMath math="k = \mathrm{clip}(\sqrt{n/100}, 3, 7)" /> is a heuristic — players have strong priors about "real" archetypes and can disagree with the cluster count for any specific faction. If a faction's clusters feel wrong (too granular, too coarse, missing a build), tell us which faction and what's missing.
                </li>
                <li>
                  <strong>Recency half-life + dataslate blackout.</strong> 45-day exponential half-life for the headline win rate, 14-day post-dataslate blackout where games get zero weight (transition noise — pilots testing, fields small, lists not optimized). 60-day half-life on example-list ranking. 30 vs 60 day windows for the momentum signal. These are calibrated defaults from a reviewer's-thumbs-sideways consensus, not theorems — if you watched the meta turn over the Q1 2026 dataslate and you think we're reading the transition wrong, tell us what you saw and where we look stale.
                </li>
                <li>
                  <strong>The contamination filter rules.</strong> 50% foreign-roster threshold catches obvious mistags but is conservative — some legitimate soup builds may be quarantined, and some marginal mistags may slip through. If a build's example lists feel wrong, this filter is probably involved.
                </li>
              </ol>
            </Section>

            {/* ─────────────────────────────────────────── Feedback */}
            <Section id="feedback" title="Feedback">
              <p>
                Email{' '}
                <a href={`mailto:${FEEDBACK_EMAIL}`} className="text-purple-400 hover:text-purple-300 underline">
                  {FEEDBACK_EMAIL}
                </a>. Two flavours that get specific responses:
              </p>
              <ul className="list-disc pl-5 space-y-1 mt-3">
                <li><strong>Methodology question</strong> — challenge a parameter, an assumption, or a calculation. Cite the section.</li>
                <li><strong>Data concern</strong> — flag a specific build / faction / matchup that looks wrong. Include the URL or screenshot.</li>
              </ul>
              <p className="mt-4 text-sm text-slate-500">
                Vague "this seems off" gets vague answers. Specific reproductions with numbers and context get specific responses.
              </p>
            </Section>

            <div className="mt-16 pt-8 border-t border-slate-800 text-sm text-slate-500">
              <Link to="/" className="text-purple-400 hover:text-purple-300">← Back to Factions</Link>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
};

// ── Helpers ────────────────────────────────────────────────────────────────

const Section = ({ id, title, children }) => (
  <section id={id} className="mb-14 scroll-mt-24">
    <h2 className="text-2xl font-bold text-white mb-3 group flex items-baseline gap-3">
      {title}
      <a
        href={`#${id}`}
        onClick={(e) => {
          e.preventDefault();
          history.replaceState(null, '', `#${id}`);
          document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }}
        className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-purple-400 text-sm transition-opacity"
        aria-label={`Link to ${title}`}
      >
        #
      </a>
    </h2>
    <div className="text-slate-300 text-[15px] leading-relaxed space-y-3">
      {children}
    </div>
  </section>
);

const Callout = ({ children }) => (
  <div className="bg-slate-800/60 border-l-4 border-purple-500 rounded-r-md px-4 py-3 my-2 text-slate-200">
    {children}
  </div>
);

export default Docs;
