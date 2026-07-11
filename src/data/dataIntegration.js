/**
 * Data Integration Layer
 *
 * Pure functions that merge fetched tournament data with the app's archetype
 * structure + emit metadata. Called at runtime by TournamentDataContext after
 * the JSON has been loaded.
 *
 * Module-level static exports kept here are limited to constants (canonical
 * faction set, alias map) and the re-export of `archetypes` for components
 * that don't need fetched data.
 */

import { archetypes, factionRatings as manualRatings } from './archetypeData.js';

// Explicit canonical faction set. The data is the source of truth — at load
// time we assert every key in factionRatings is in this set, and emit a
// console.error if anything new shows up. Catches the "upstream silently
// renamed Genestealer Cult → Genestealer Cults" failure mode that would
// otherwise split a faction across two map keys with no error.
const CANONICAL_FACTIONS = new Set([
  'Adepta Sororitas',
  'Adeptus Custodes',
  'Adeptus Mechanicus',
  'Aeldari',
  'Astra Militarum',
  'Black Templars',
  'Blood Angels',
  'Chaos Daemons',
  'Chaos Knights',
  'Chaos Space Marines',
  'Dark Angels',
  'Death Guard',
  'Deathwatch',
  'Drukhari',
  "Emperor's Children",
  'Genestealer Cult',
  'Grey Knights',
  'Imperial Agents',
  'Imperial Knights',
  'Leagues of Votann',
  'Necrons',
  'Orks',
  'Space Marines (Astartes)',
  'Space Wolves',
  "T'au Empire",
  'Thousand Sons',
  'Tyranids',
  'World Eaters',
]);

// Common aliases / abbreviations / legacy spellings — kept narrow so a
// genuine upstream rename triggers the assertion below rather than silently
// landing on the wrong canonical.
const ALIAS_TO_CANONICAL = {
  'Custodes': 'Adeptus Custodes',
  'Imperial Guard': 'Astra Militarum',
  'Daemons': 'Chaos Daemons',
  'CSM': 'Chaos Space Marines',
  'Dark Eldar': 'Drukhari',
  'Genestealer Cults': 'Genestealer Cult',
  'GSC': 'Genestealer Cult',
  'Adeptus Astartes': 'Space Marines (Astartes)',
  'Space Marines': 'Space Marines (Astartes)',
  'Tau Empire': "T'au Empire",
  "T'au": "T'au Empire",
};

function normalizeFactionName(name) {
  const normalized = (name || '').trim();
  if (CANONICAL_FACTIONS.has(normalized)) return normalized;
  if (ALIAS_TO_CANONICAL[normalized]) return ALIAS_TO_CANONICAL[normalized];
  return normalized;  // pass through for downstream warnings
}

function assertCanonicalFactions(td) {
  if (!td?.factionRatings) return;
  const unrecognised = Object.keys(td.factionRatings)
    .filter((k) => !CANONICAL_FACTIONS.has(k));
  if (unrecognised.length) {
    console.error(
      `[dataIntegration] Unrecognised faction keys in tournamentData.json: ${JSON.stringify(unrecognised)}. ` +
      `Either add them to CANONICAL_FACTIONS or fix the upstream taxonomy.`
    );
  }
}

export function mergeFactionRatings(tournamentData) {
  if (!tournamentData?.factionRatings) {
    return manualRatings;
  }
  assertCanonicalFactions(tournamentData);

  const merged = { ...manualRatings };
  Object.entries(tournamentData.factionRatings).forEach(([factionName, ratings]) => {
    const normalizedName = normalizeFactionName(factionName);

    if (merged[normalizedName]) {
      merged[normalizedName] = {
        ...merged[normalizedName],
        ...ratings,
        source: 'tournament',
      };
    } else {
      merged[normalizedName] = {
        ...ratings,
        source: 'tournament',
      };
    }
  });

  return merged;
}

export function getDataMetadata(tournamentData) {
  if (!tournamentData?.metadata) {
    return {
      source: 'manual',
      description: 'Manual ratings by archetype experts',
      lastUpdated: null,
    };
  }
  return {
    source: tournamentData.metadata.source || 'internal',
    sourceLabel: tournamentData.metadata.sourceLabel || 'Tournament data',
    description: 'Live tournament data',
    // Edition scope of the snapshot. Authoritative (never date-inferred). Older
    // snapshots predate the field — fall back to 10th edition, which is what all
    // pre-2026-06-20 data is.
    edition: tournamentData.metadata.edition || '10e',
    editionLabel: tournamentData.metadata.editionLabel || '10th Edition',
    editionExcludedEvents: tournamentData.metadata.editionExcludedEvents || null,
    lastUpdated: tournamentData.metadata.importDate,
    eventsCount: tournamentData.metadata.eventsCount,
    gamesCount: tournamentData.metadata.gamesCount,
    dateRange: tournamentData.metadata.dateRange,
    factionCount: tournamentData.metadata.factionCount,
    buildCount: tournamentData.metadata.buildCount,
  };
}

export { archetypes };
