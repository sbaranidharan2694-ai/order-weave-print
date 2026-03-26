export const isSupabaseConfigured =
  !!(import.meta.env.VITE_SUPABASE_URL ?? 'https://hlpmmdmgdgyzsxnnrdjl.supabase.co') &&
  !!(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_-nGUo2cxoxIOXRoaKBiP_A_Ht4OsA9a');
