import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

const env = fs.readFileSync('.env', 'utf8');

const url = env.match(/EXPO_PUBLIC_SUPABASE_URL=(.+)/)?.[1]?.trim();
const key = env.match(/EXPO_PUBLIC_SUPABASE_ANON_KEY=(.+)/)?.[1]?.trim();

if (!url || !key) {
  throw new Error('Missing Supabase env vars');
}

const supabase = createClient(url, key);

const { data, error } = await supabase
  .from('spot_coordinate_review_queue')
  .select(`
    spot_id,
    name,
    canonical_name
  `)
  .limit(25);

if (error) {
  console.error(error);
  process.exit(1);
}

console.log(`Found ${data.length} spots needing coordinates`);
console.table(data);
