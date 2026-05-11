import fs from 'node:fs/promises';

const matches = JSON.parse(
  await fs.readFile('tmp/nkv-matches.json', 'utf8')
);

const acceptedBeforeConflictFilter = matches.filter(
  (row) => row.auto_accept === 'yes'
);

const matchCountByNkvTitle = acceptedBeforeConflictFilter.reduce((result, row) => {
  result[row.nkv_title] = (result[row.nkv_title] ?? 0) + 1;
  return result;
}, {});

const accepted = acceptedBeforeConflictFilter.filter((row) => {
  const hasConflict = matchCountByNkvTitle[row.nkv_title] > 1;
  return !hasConflict;
});

const sql = [
  '-- Generated from NKV spotkaart',
  '-- Safe verified imports only',
  '',
];

for (const row of accepted) {
  const canonical = String(
    row.db_canonical_name
  ).replaceAll("'", "''");

  sql.push(`update public.spots`);
  sql.push(`set`);
  sql.push(`  launch_latitude = ${Number(row.nkv_latitude)},`);
  sql.push(`  launch_longitude = ${Number(row.nkv_longitude)},`);
  sql.push(`  coordinate_status = 'verified',`);
  sql.push(`  coordinate_source = 'nkv_spotkaart',`);
  sql.push(`  coordinate_confidence = 95,`);
  sql.push(`  coordinate_source_priority = 100,`);
  sql.push(`  coordinate_verification_source = 'nkv_import',`);
  sql.push(`  coordinate_verification_notes = 'Imported from NKV spotkaart',`);
  sql.push(`  coordinate_verified_at = now()`);
  sql.push(`where canonical_name = '${canonical}';`);
  sql.push('');
}

await fs.writeFile(
  'tmp/nkv-auto-updates.sql',
  sql.join('\n')
);

console.log(`Generated ${accepted.length} updates`);
console.table(
  accepted.map((row) => ({
    db: row.db_name,
    nkv: row.nkv_title,
    lat: row.nkv_latitude,
    lon: row.nkv_longitude,
  }))
);
