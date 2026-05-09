import fs from 'node:fs/promises';

const csv = await fs.readFile('tmp/coastline-snap-candidates.csv', 'utf8');
const [headerLine, ...lines] = csv.trim().split('\n');
const headers = headerLine.split(',');

function parseCsvLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current);

  return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
}

const rows = lines.filter(Boolean).map(parseCsvLine);
const bestBySpot = new Map();

for (const row of rows) {
  const score = Number(row.score);
  const distance = Number(row.distance_from_current_m);

  if (!Number.isFinite(score) || !Number.isFinite(distance)) continue;

  const existing = bestBySpot.get(row.canonical_name);
  if (
    !existing ||
    score > Number(existing.score) ||
    (score === Number(existing.score) && distance < Number(existing.distance_from_current_m))
  ) {
    bestBySpot.set(row.canonical_name, row);
  }
}

const sqlLines = [
  '-- Generated candidate updates. Review before running.',
  '-- These set coordinate_status = review, not verified.',
  '',
];

for (const row of [...bestBySpot.values()].sort((a, b) => a.spot_name.localeCompare(b.spot_name))) {
  const score = Number(row.score);
  const distance = Number(row.distance_from_current_m);

  if (score < 55 || distance > 1500) {
    continue;
  }

  const lat = Number(row.candidate_latitude);
  const lon = Number(row.candidate_longitude);
  const canonicalName = row.canonical_name.replaceAll("'", "''");
  const notes = [
    `osm_type=${row.osm_type}`,
    `osm_id=${row.osm_id}`,
    `osm_natural=${row.osm_natural}`,
    `distance_m=${row.distance_from_current_m}`,
    `score=${row.score}`,
    `candidate=${row.osm_name || 'unnamed'}`,
  ].join('; ').replaceAll("'", "''");

  sqlLines.push(`update public.spots`);
  sqlLines.push(`set`);
  sqlLines.push(`  launch_latitude = ${lat},`);
  sqlLines.push(`  launch_longitude = ${lon},`);
  sqlLines.push(`  coordinate_status = 'review',`);
  sqlLines.push(`  coordinate_verification_source = 'osm_beach_coastline_snap',`);
  sqlLines.push(`  coordinate_verification_notes = '${notes}',`);
  sqlLines.push(`  coordinate_verified_at = null`);
  sqlLines.push(`where canonical_name = '${canonicalName}'`);
  sqlLines.push(`  and coordinate_status != 'verified';`);
  sqlLines.push('');
}

await fs.writeFile('tmp/coastline-review-updates.sql', sqlLines.join('\n'));

console.log(`Wrote ${bestBySpot.size} review updates to tmp/coastline-review-updates.sql`);
