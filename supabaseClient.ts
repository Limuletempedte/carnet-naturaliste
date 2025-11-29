import { createClient } from '@supabase/supabase-js';

// These environment variables will be provided by your Supabase project
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

console.log('Supabase Config:', {
    url: supabaseUrl,
    keyLength: supabaseAnonKey?.length
});

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Supabase URL or Anon Key is missing. Check .env.local');
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');
