import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const supabaseUrl = SUPABASE_URL ?? '';
const supabaseAnonKey = SUPABASE_ANON_KEY ?? '';
const SUPABASE_CLIENT_COUNT = 1;

console.log('SUPABASE_ACTIVE_URL', supabaseUrl);
console.log('SUPABASE_ACTIVE_KEY_PREFIX', String(supabaseAnonKey || '').slice(0, 12));
console.log('SUPABASE_CLIENT_COUNT', SUPABASE_CLIENT_COUNT);

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY environment variables.');
}

export type Profile = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  owner_uid?: string | null;
  email?: string | null;
  created_at?: string;
  nationality?: string | null;
  skill_level?: number | null;
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
