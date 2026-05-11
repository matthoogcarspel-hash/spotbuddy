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

const results = [];

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

  results.push({
    name: spot.name,
    found: Boolean(match),
    matched_query: matchedQuery,
    lat: match?.lat ?? null,
    lon: match?.lon ?? null,
    display_name: match?.display_name ?? null,
  });
}

console.table(results);
