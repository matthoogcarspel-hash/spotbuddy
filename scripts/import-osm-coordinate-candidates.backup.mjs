import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

const env = fs.readFileSync('.env', 'utf8');
const url = env.match(/EXPO_PUBLIC_SUPABASE_URL=(.+)/)?.[1]?.trim();
const key = env.match(/EXPO_PUBLIC_SUPABASE_ANON_KEY=(.+)/)?.[1]?.trim();

const supabase = createClient(url, key);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const { data: spots, error } = await supabase
  .from('spot_coordinate_review_queue')
  .select('spot_id, name, canonical_name')
  .limit(10);

if (error) throw error;

async function searchOsm(query) {
  const endpoint =
    `https://nominatim.openstreetmap.org/search?` +
    new URLSearchParams({
      q: query,
      format: 'jsonv2',
      limit: '1',
    });

  const response = await fetch(endpoint, {
    headers: { 'User-Agent': 'SpotBuddy coordinate enrichment dev script' },
  });

  const json = await response.json();
  await sleep(1100);
  return json[0] ?? null;
}

function confidenceFor(match, spotName, matchedQuery) {
  const display = String(match?.display_name ?? '').toLowerCase();
  const name = spotName.toLowerCase();

  let score = 35;

  if (display.includes(name)) score += 20;
  if (matchedQuery.toLowerCase().includes('beach')) score += 10;
  if (matchedQuery.toLowerCase().includes('surf')) score += 10;
  if (matchedQuery.toLowerCase().includes('kitesurf')) score += 15;

  return Math.min(score, 75);
}

const inserted = [];

for (const spot of spots) {
  const queries = [
    `${spot.name}`,
    `${spot.name} beach`,
    `${spot.name} surf`,
    `${spot.name} kitesurf`,
  ];

  let match = null;
  let matchedQuery = null;

  for (const query of queries) {
    match = await searchOsm(query);
    if (match) {
      matchedQuery = query;
      break;
    }
  }

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
    confidence: confidenceFor(match, spot.name, matchedQuery),
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
