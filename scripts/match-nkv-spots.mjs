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

const normalize = (value) =>
  String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ij/g, 'y')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const tokenSet = (value) => new Set(normalize(value).split(' ').filter(Boolean));

const similarity = (a, b) => {
  const aTokens = tokenSet(a);
  const bTokens = tokenSet(b);

  if (aTokens.size === 0 || bTokens.size === 0) return 0;

  let intersection = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) intersection += 1;
  }

  const union = new Set([...aTokens, ...bTokens]).size;
  return intersection / union;
};

const dbResponse = await fetch(
  `${env.EXPO_PUBLIC_SUPABASE_URL}/rest/v1/spots?country=eq.Netherlands&select=name,canonical_name,latitude,longitude,coordinate_status&order=name.asc`,
  {
    headers: {
      apikey: env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${env.EXPO_PUBLIC_SUPABASE_ANON_KEY}`,
    },
  }
);

const dbSpots = await dbResponse.json();
const nkvSpots = JSON.parse(await fs.readFile('tmp/nkv-spots.json', 'utf8'));

const manualAliases = {
  'Scheveningen KZVS': 'Scheveningen - Noorderstrand',
  'Scheveningen Jump Team': 'Scheveningen - Zwarte Pad',
  'Scheveningen Zuid': 'Kijkduin',

  'Brouwersdam Noordzee': 'Brouwersdam',
  'Brouwersdam Zuid': 'Brouwersdam',

  'Katwijk aan Zee': 'Katwijk',
  'Noordwijk': 'Noordwijk aan Zee',
  'Noordwijk Zuid': 'Noordwijk Langevelderslag',

  'Maasvlakte': 'Maasvlakte 2 - Spot P1 t/m P3',
  'Oostvoorne Maasvlakte Slufter': 'Maasvlakte 2 - Slufter',
  'Slufter Maasvlakte': 'Maasvlakte 2 - Slufter',
  'Rockanje Strand 1e slag': 'Rockanje Sportstrand',
  'Rockanje Strand 2e slag': 'Rockanje Sportstrand',
  'Ijmuiden Zuidpier': 'IJmuiden Zone 2 (gem. Velsen)',
  'IJmuiden': 'IJmuiden Zone 2 (gem. Velsen)',
  'Mirns IJsselmeer kitestrand': 'Mirns',
  'Workum Kitebeach': 'Workum',
  'Texel Paal 17 kitezone': 'Texel Paal 17',
};

const matches = dbSpots.map((dbSpot) => {
  const aliasTitle = manualAliases[dbSpot.name];

  const aliasMatch = aliasTitle
    ? nkvSpots.find((nkvSpot) => nkvSpot.title === aliasTitle)
    : null;

  const best = aliasMatch
    ? { nkvSpot: aliasMatch, score: 1, method: 'manual_alias' }
    : nkvSpots
        .map((nkvSpot) => ({
          nkvSpot,
          score: similarity(dbSpot.name, nkvSpot.title),
          method: 'token_similarity',
        }))
        .sort((a, b) => b.score - a.score)[0];

  return {
    db_name: dbSpot.name,
    db_canonical_name: dbSpot.canonical_name,
    db_latitude: dbSpot.latitude,
    db_longitude: dbSpot.longitude,
    current_status: dbSpot.coordinate_status,
    nkv_title: best?.nkvSpot?.title ?? '',
    nkv_latitude: best?.nkvSpot?.latitude ?? '',
    nkv_longitude: best?.nkvSpot?.longitude ?? '',
    nkv_policy: best?.nkvSpot?.policy ?? '',
    nkv_permalink: best?.nkvSpot?.permalink ?? '',
    score: best?.score ?? 0,
    method: best?.method ?? '',
    auto_accept: best && (best.method === 'manual_alias' || best.score >= 0.75) ? 'yes' : 'no',
  };
});

const headers = Object.keys(matches[0] ?? {});
const csv = [
  headers.join(','),
  ...matches.map((row) =>
    headers.map((header) => `"${String(row[header] ?? '').replaceAll('"', '""')}"`).join(',')
  ),
].join('\n');

await fs.writeFile('tmp/nkv-matches.csv', csv);
await fs.writeFile('tmp/nkv-matches.json', JSON.stringify(matches, null, 2));

console.log(`Matched ${matches.length} DB NL spots to ${nkvSpots.length} NKV spots`);
console.table(matches.map((row) => ({
  db: row.db_name,
  nkv: row.nkv_title,
  score: row.score,
  method: row.method,
  accept: row.auto_accept,
})));
