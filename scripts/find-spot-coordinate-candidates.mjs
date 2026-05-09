import fs from 'node:fs/promises';

const envFile = await fs.readFile('.env', 'utf8');

const env = Object.fromEntries(
  envFile
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const [key, ...valueParts] = line.split('=');
      return [key, valueParts.join('=')];
    })
);

const SUPABASE_URL = env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Could not read EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY from .env');
}

const spotsResponse = await fetch(`${SUPABASE_URL}/rest/v1/spots?select=name,country,latitude,longitude,canonical_name,coordinate_status&order=country.asc,name.asc`, {
  headers: {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  },
});

if (!spotsResponse.ok) {
  throw new Error(`Failed to fetch spots: ${spotsResponse.status}`);
}

const allSpots = await spotsResponse.json();
const spots = allSpots
  .filter((spot) => String(spot.country ?? '').toLowerCase().includes('netherlands'))
  .slice(0, 25);

console.log(`Loaded ${allSpots.length} spots. Searching ${spots.length} NL spots first.`);
const rows = [];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function distanceMeters(aLat, aLon, bLat, bLon) {
  const R = 6371000;
  const toRad = (value) => value * Math.PI / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

for (const spot of spots) {
  const country = spot.country ?? '';
  const name = spot.name ?? '';
  const query = `${name} kite beach kitesurf spot ${country}`.trim();

  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '5');
  url.searchParams.set('q', query);

  console.log(`Searching: ${query}`);

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'SpotBuddy coordinate verification script',
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    console.log(`Failed: ${name} ${response.status}`);
    await sleep(1200);
    continue;
  }

  const candidates = await response.json();

  for (const candidate of candidates) {
    const lat = Number(candidate.lat);
    const lon = Number(candidate.lon);

    rows.push({
      name,
      country,
      canonical_name: spot.canonical_name,
      current_latitude: spot.latitude,
      current_longitude: spot.longitude,
      candidate_name: candidate.display_name,
      candidate_latitude: lat,
      candidate_longitude: lon,
      candidate_type: candidate.type,
      candidate_class: candidate.class,
      distance_from_current_m: Number.isFinite(lat) && Number.isFinite(lon)
        ? Math.round(distanceMeters(Number(spot.latitude), Number(spot.longitude), lat, lon))
        : '',
    });
  }

  await sleep(1200);
}

const headers = Object.keys(rows[0] ?? {
  name: '',
  country: '',
  canonical_name: '',
  current_latitude: '',
  current_longitude: '',
  candidate_name: '',
  candidate_latitude: '',
  candidate_longitude: '',
  candidate_type: '',
  candidate_class: '',
  distance_from_current_m: '',
});

const csv = [
  headers.join(','),
  ...rows.map((row) => headers.map((header) => {
    const value = String(row[header] ?? '');
    return `"${value.replaceAll('"', '""')}"`;
  }).join(',')),
].join('\n');

await fs.writeFile('tmp/spot-coordinate-candidates.csv', csv);

console.log(`Done. Wrote ${rows.length} candidates to tmp/spot-coordinate-candidates.csv`);
