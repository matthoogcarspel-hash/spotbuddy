import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

const env = fs.readFileSync('.env', 'utf8');
const url = env.match(/EXPO_PUBLIC_SUPABASE_URL=(.+)/)?.[1]?.trim();
const key = env.match(/EXPO_PUBLIC_SUPABASE_ANON_KEY=(.+)/)?.[1]?.trim();

const supabase = createClient(url, key);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const { data: spotsRaw, error } = await supabase
  .from('spots')
  .select('id, name, canonical_name, country')
  .in('country', ['Netherlands', 'Nederland', 'NL'])
  .or('launch_latitude.is.null,launch_longitude.is.null')
  .limit(50);

const spots = (spotsRaw || []).map((s) => ({
  spot_id: s.id,
  name: s.name,
  canonical_name: s.canonical_name,
}));

if (error) throw error;

async function searchOsm(query) {
  const endpoint =
    `https://nominatim.openstreetmap.org/search?` +
    new URLSearchParams({
      q: query,
      format: 'jsonv2',
      limit: '5',
    });

  const response = await fetch(endpoint, {
    headers: { 'User-Agent': 'SpotBuddy coordinate enrichment dev script' },
  });

  const json = await response.json();
  await sleep(1100);
  return json ?? [];
}

function scoreResult(result, spotName) {
  const text = `
    ${result.display_name ?? ''}
    ${result.type ?? ''}
    ${result.category ?? ''}
  `.toLowerCase();

  const name = spotName.toLowerCase();

  let score = 0;

  if (!text.includes('nederland') && !text.includes('netherlands')) {
    score -= 100;
  }

  if (text.includes(name)) score += 30;

  const positiveTerms = [
    'beach',
    'surf',
    'kite',
    'lagoon',
    'bay',
    'sea',
    'ocean',
    'coast',
    'island',
  ];

  for (const term of positiveTerms) {
    if (text.includes(term)) {
      score += 15;
    }
  }

  const negativeTerms = [
    'village',
    'city',
    'town',
    'administrative',
    'railway',
    'residential',
    'hotel',
    'parking',
    'golf',
    'restaurant',
    'bar',
  ];

  for (const term of negativeTerms) {
    if (text.includes(term)) {
      score -= 20;
    }
  }

  return score;
}

function confidenceFor(match, spotName, matchedQuery, bestScore = 35) {
  const display = String(match?.display_name ?? '').toLowerCase();
  const name = spotName.toLowerCase();

  let score = bestScore;

  if (display.includes(name)) score += 20;
  if (matchedQuery.toLowerCase().includes('beach')) score += 10;
  if (matchedQuery.toLowerCase().includes('surf')) score += 10;
  if (matchedQuery.toLowerCase().includes('kitesurf')) score += 15;

  return Math.max(0, Math.min(score, 75));
}

const inserted = [];

for (const spot of spots) {
  const queries = [
    `${spot.name}`,
    `${spot.name} beach`,
    `${spot.name} surf`,
    `${spot.name} kitesurf`,
  ];

  let bestMatch = null;
  let bestScore = -999;
  let matchedQuery = null;

  for (const query of queries) {
    const results = await searchOsm(query);

    for (const result of results) {
      const score = scoreResult(result, spot.name);

      if (score > bestScore) {
        bestScore = score;
        bestMatch = result;
        matchedQuery = query;
      }
    }
  }

  const match = bestMatch;

  if (!match) continue;

  const candidate = {
    spot_id: spot.spot_id,
    canonical_name: spot.canonical_name,
    spot_name: spot.name,
    candidate_latitude: Number(match.lat),
    candidate_longitude: Number(match.lon),
    source: 'osm_nominatim',
    source_label: matchedQuery,
    source_url: `https://www.openstreetmap.org/${match.osm_type}/${match.osm_id}`,
    confidence: confidenceFor(match, spot.name, matchedQuery, bestScore),
    status: 'pending',
    notes: match.display_name,
  };

  const { data: existing, error: lookupError } = await supabase
    .from('spot_coordinate_candidates')
    .select('id')
    .eq('spot_id', candidate.spot_id)
    .eq('source', candidate.source)
    .eq('candidate_latitude', candidate.candidate_latitude)
    .eq('candidate_longitude', candidate.candidate_longitude)
    .maybeSingle();

  if (lookupError) {
    console.error('Lookup failed:', spot.name, lookupError);
    continue;
  }

  if (existing) {
    continue;
  }

  const { error: insertError } = await supabase
    .from('spot_coordinate_candidates')
    .insert(candidate);

  if (insertError) {
    if (insertError.code === '23505') {
      continue;
    }

    console.error('Insert failed:', spot.name, insertError);
    continue;
  }

  inserted.push({
    name: spot.name,
    confidence: candidate.confidence,
    lat: candidate.candidate_latitude,
    lon: candidate.candidate_longitude,
    notes: candidate.notes,
  });
}

console.log(`Inserted ${inserted.length} pending OSM candidates`);
console.table(inserted);
