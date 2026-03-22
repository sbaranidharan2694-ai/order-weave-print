import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const env = import.meta.env as Record<string, string | undefined>;

const SUPABASE_URL =
  env.VITE_SUPABASE_URL ??
  env.SUPABASE_URL ??
  "";

const SUPABASE_KEY =
  env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  env.VITE_SUPABASE_ANON_KEY ??
  env.SUPABASE_ANON_KEY ??
  "";

if (import.meta.env.DEV && (!SUPABASE_URL || !SUPABASE_KEY)) {
  console.error(
    "[supabase] VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY is missing. " +
    "Copy .env.example to .env and set the values from Supabase Dashboard → Project Settings → API."
  );
}

const configured = Boolean(
  SUPABASE_URL && SUPABASE_KEY && !SUPABASE_URL.includes("placeholder") && SUPABASE_KEY !== "placeholder"
);

let _client: ReturnType<typeof createClient<Database>>;
let _isConfigured: boolean;
try {
  _client = createClient<Database>(
    SUPABASE_URL || "https://placeholder.supabase.co",
    SUPABASE_KEY || "placeholder",
    {
      auth: {
        storage: (typeof localStorage !== "undefined" ? localStorage : { getItem: () => null, setItem: () => {}, removeItem: () => {} }) as Storage,
        persistSession: true,
        autoRefreshToken: true,
      },
    }
  );
  _isConfigured = configured;
} catch (e) {
  _client = createClient<Database>("https://placeholder.supabase.co", "placeholder", {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  _isConfigured = false;
}

export const isSupabaseConfigured = _isConfigured;
export const supabase = _client;