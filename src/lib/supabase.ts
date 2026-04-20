import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const supabaseUrl = SUPABASE_URL ?? '';

console.log("SUPABASE URL:", supabaseUrl);

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY environment variables.');
}

export type Profile = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  owner_uid?: string | null;
  email?: string | null;
  created_at?: string;
};

export const supabase = createClient(supabaseUrl, SUPABASE_ANON_KEY ?? '', {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
