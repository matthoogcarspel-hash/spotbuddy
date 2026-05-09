import fs from 'node:fs/promises';

const envFile = await fs.readFile('.env', 'utf8');
const env = Object.fromEntries(
  envFile
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && line.includes('='))
    .map((line) => {
      const [key, ...valueParts] = line.split('=');
      return [key, valueParts.join('=')];
    })
);

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

const spotsResponse = await fetch(
  `${env.EXPO_PUBLIC_SUPABASE_URL}/rest/v1/spots?select=name,country,canonical_name,latitude,longitude,coordinate_status&country=eq.Netherlands&order=name.asc`,
  {
    headers: {
      apikey: env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${env.EXPO_PUBLIC_SUPABASE_ANON_KEY}`,
    },
  }
);

if (!spotsResponse.ok) {
  throw new Error(`Supabase failed: ${spotsResponse.status}`);
}

const spots = (await spotsResponse.json()).slice(0, 10);
const rows = [];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

for (const spot of spots) {
  const lat = Number(spot.latitude);
  const lon = Number(spot.longitude);
  const radiusMeters = 4000;

  const query = `
[out:json][timeout:30];
(
  node(around:${radiusMeters},${lat},${lon})["natural"="beach"];
  way(around:${radiusMeters},${lat},${lon})["natural"="beach"];
  relation(around:${radiusMeters},${lat},${lon})["natural"="beach"];
  node(around:${radiusMeters},${lat},${lon})["natural"="coastline"];
  way(around:${radiusMeters},${lat},${lon})["natural"="coastline"];
);
out center tags 100;
`;

  console.log(`Snapping: ${spot.name}`);

  const response = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
      'User-Agent': 'SpotBuddy coordinate verification script',
    },
    body: query,
  });

  if (!response.ok) {
    console.log(`Overpass failed ${response.status}: ${spot.name}`);
    await sleep(1500);
    continue;
  }

  const data = await response.json();

  const candidates = (data.elements ?? [])
    .map((element) => {
      const candidateLat = Number(element.lat ?? element.center?.lat);
      const candidateLon = Number(element.lon ?? element.center?.lon);
      if (!Number.isFinite(candidateLat) || !Number.isFinite(candidateLon)) return null;

      const distance = Math.round(distanceMeters(lat, lon, candidateLat, candidateLon));
      const tags = element.tags ?? {};
      const score =
        (tags.natural === 'beach' ? 70 : 0) +
        (tags.natural === 'coastline' ? 45 : 0) -
        Math.min(40, Math.round(distance / 100));

      return {
        spot_name: spot.name,
        canonical_name: spot.canonical_name,
        current_latitude: lat,
        current_longitude: lon,
        candidate_latitude: candidateLat,
        candidate_longitude: candidateLon,
        osm_type: element.type,
        osm_id: element.id,
        osm_name: tags.name ?? '',
        osm_natural: tags.natural ?? '',
        distance_from_current_m: distance,
        score,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || a.distance_from_current_m - b.distance_from_current_m)
    .slice(0, 5);

  rows.push(...candidates);
  await sleep(1500);
}

const headers = [
  'spot_name',
  'canonical_name',
  'current_latitude',
  'current_longitude',
  'candidate_latitude',
  'candidate_longitude',
  'osm_type',
  'osm_id',
  'osm_name',
  'osm_natural',
  'distance_from_current_m',
  'score',
];

const csv = [
  headers.join(','),
  ...rows.map((row) =>
    headers.map((header) => `"${String(row[header] ?? '').replaceAll('"', '""')}"`).join(',')
  ),
].join('\n');

await fs.writeFile('tmp/coastline-snap-candidates.csv', csv);

console.log(`Done. Wrote ${rows.length} candidates to tmp/coastline-snap-candidates.csv`);
