import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseConfigError = (!supabaseUrl || !supabaseAnonKey)
    ? "Configuration Supabase invalide: définissez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY."
    : null;
export const isSupabaseConfigured = supabaseConfigError === null;

// Keep client creation deterministic; app surfaces a clear error screen when config is invalid.
export const supabase = createClient(
    supabaseUrl || 'https://invalid.local',
    supabaseAnonKey || 'invalid-anon-key'
);
