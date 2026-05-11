import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

const env = fs.readFileSync('.env', 'utf8');
const url = env.match(/EXPO_PUBLIC_SUPABASE_URL=(.+)/)?.[1]?.trim();
const key = env.match(/EXPO_PUBLIC_SUPABASE_ANON_KEY=(.+)/)?.[1]?.trim();

const supabase = createClient(url, key);

const { data, error } = await supabase
  .from('spot_coordinate_candidates')
  .select('source,status,confidence');

if (error) throw error;

const summary = data.reduce((acc, row) => {
  const key = `${row.source} / ${row.status}`;
  acc[key] ??= { count: 0, avgConfidence: 0, totalConfidence: 0 };
  acc[key].count += 1;
  acc[key].totalConfidence += row.confidence;
  acc[key].avgConfidence = Math.round(acc[key].totalConfidence / acc[key].count);
  return acc;
}, {});

console.table(summary);
