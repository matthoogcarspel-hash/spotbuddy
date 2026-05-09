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

const response = await fetch(
  `${env.EXPO_PUBLIC_SUPABASE_URL}/rest/v1/spots?select=name,country,latitude,longitude,canonical_name,coordinate_status&country=eq.Netherlands&order=name.asc`,
  {
    headers: {
      apikey: env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${env.EXPO_PUBLIC_SUPABASE_ANON_KEY}`,
    },
  }
);

const spots = (await response.json()).slice(0, 25);
const rows = [];

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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

for (const spot of spots) {
  const lat = Number(spot.latitude);
  const lon = Number(spot.longitude);
  const delta = 0.035;

  const south = lat - delta;
  const west = lon - delta;
  const north = lat + delta;
  const east = lon + delta;

  const query = `
[out:json][timeout:25];
(
  node["name"](${south},${west},${north},${east});
  way["name"](${south},${west},${north},${east});
  relation["name"](${south},${west},${north},${east});
  node["sport"="kitesurfing"](${south},${west},${north},${east});
  way["sport"="kitesurfing"](${south},${west},${north},${east});
  relation["sport"="kitesurfing"](${south},${west},${north},${east});
  node["leisure"="beach_resort"](${south},${west},${north},${east});
  way["leisure"="beach_resort"](${south},${west},${north},${east});
  node["natural"="beach"](${south},${west},${north},${east});
  way["natural"="beach"](${south},${west},${north},${east});
);
out center tags 50;
`;

  console.log(`Searching nearby OSM: ${spot.name}`);

  const overpassResponse = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
      'User-Agent': 'SpotBuddy coordinate verification script',
    },
    body: query,
  });

  if (!overpassResponse.ok) {
    console.log(`Overpass failed ${overpassResponse.status}: ${spot.name}`);
    await sleep(1500);
    continue;
  }

  const data = await overpassResponse.json();

  for (const element of data.elements ?? []) {
    const candidateLat = Number(element.lat ?? element.center?.lat);
    const candidateLon = Number(element.lon ?? element.center?.lon);
    if (!Number.isFinite(candidateLat) || !Number.isFinite(candidateLon)) continue;

    const name = element.tags?.name ?? '';
    const tags = element.tags ?? {};
    const searchable = `${name} ${tags.sport ?? ''} ${tags.natural ?? ''} ${tags.leisure ?? ''} ${tags.tourism ?? ''}`.toLowerCase();

    const score =
      (searchable.includes('kite') ? 50 : 0) +
      (searchable.includes('surf') ? 30 : 0) +
      (searchable.includes('beach') || searchable.includes('strand') ? 20 : 0) +
      (String(name).toLowerCase().includes(String(spot.name).split(' ')[0].toLowerCase()) ? 20 : 0);

    rows.push({
      spot_name: spot.name,
      canonical_name: spot.canonical_name,
      current_latitude: spot.latitude,
      current_longitude: spot.longitude,
      candidate_name: name,
      candidate_latitude: candidateLat,
      candidate_longitude: candidateLon,
      osm_type: element.type,
      osm_id: element.id,
      tags: JSON.stringify(tags),
      distance_from_current_m: Math.round(distanceMeters(lat, lon, candidateLat, candidateLon)),
      score,
    });
  }

  await sleep(1500);
}

rows.sort((a, b) =>
  a.spot_name.localeCompare(b.spot_name)
  || b.score - a.score
  || a.distance_from_current_m - b.distance_from_current_m
);

const headers = [
  'spot_name',
  'canonical_name',
  'current_latitude',
  'current_longitude',
  'candidate_name',
  'candidate_latitude',
  'candidate_longitude',
  'osm_type',
  'osm_id',
  'tags',
  'distance_from_current_m',
  'score',
];

const csv = [
  headers.join(','),
  ...rows.map((row) => headers.map((header) => `"${String(row[header] ?? '').replaceAll('"', '""')}"`).join(',')),
].join('\n');

await fs.writeFile('tmp/nearby-osm-candidates.csv', csv);
console.log(`Done. Wrote ${rows.length} rows to tmp/nearby-osm-candidates.csv`);
