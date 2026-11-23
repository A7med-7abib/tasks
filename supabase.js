
// Supabase Project Configuration

const SUPABASE_URL =
  "https://rgzkkhqvsvnumpdiwxmt.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_XhBKjbY-Y_A3zD-JH_B7rg_Lbg9P-iY";

// Create Supabase Client
window.db = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

console.log("Supabase connected successfully!");
