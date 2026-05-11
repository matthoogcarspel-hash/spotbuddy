import fs from 'node:fs/promises';

const html = await fs.readFile('tmp/nkv-spotkaart.html', 'utf8');

const match = html.match(/<pre id="data"[^>]*>([\s\S]*?)<\/pre>/);

if (!match) {
  throw new Error('NKV data pre not found');
}

const rawJson = match[1]
  .replaceAll('&quot;', '"')
  .replaceAll('&amp;', '&')
  .replaceAll('&#038;', '&');

const spots = JSON.parse(rawJson);

const rows = spots.map((spot) => ({
  title: spot.titel ?? '',
  latitude: spot.lat_lng?.[0] ?? '',
  longitude: spot.lat_lng?.[1] ?? '',
  policy: Array.isArray(spot.beleid) ? spot.beleid.join('|') : '',
  wind_direction: Array.isArray(spot.windrichting) ? spot.windrichting.join('|') : '',
  discipline: Array.isArray(spot.discipline) ? spot.discipline.join('|') : '',
  level: Array.isArray(spot.niveau) ? spot.niveau.join('|') : '',
  water_depth: Array.isArray(spot.waterdiepte) ? spot.waterdiepte.join('|') : '',
  launch_zone: Array.isArray(spot.startzone) ? spot.startzone.join('|') : '',
  opening: spot.openstelling ?? '',
  permalink: spot.permalink ?? '',
}));

const headers = Object.keys(rows[0] ?? {});
const csv = [
  headers.join(','),
  ...rows.map((row) =>
    headers.map((header) => `"${String(row[header] ?? '').replaceAll('"', '""')}"`).join(',')
  ),
].join('\n');

await fs.writeFile('tmp/nkv-spots.csv', csv);
await fs.writeFile('tmp/nkv-spots.json', JSON.stringify(rows, null, 2));

console.log(`Extracted ${rows.length} NKV spots`);
console.log(rows.filter((row) => row.title.toLowerCase().includes('scheveningen')));
