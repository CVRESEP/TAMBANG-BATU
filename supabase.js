// ============================================================
// SUPABASE CONFIGURATION
// Ganti SUPABASE_URL dan SUPABASE_ANON_KEY dengan credential
// dari Supabase project Anda (Settings → API)
// ============================================================
const SUPABASE_URL = 'https://fqdeoknsqgqtgnozknug.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZxZGVva25zcWdxdGdub3prbnVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNTcyNDYsImV4cCI6MjA4OTkzMzI0Nn0.mcPWVWv6a3k8pKRLzjqKB3ZeH9_TYpWNyXnhYlvGAlc';

// Supabase client (diinisialisasi setelah CDN dimuat)
let supabase = null;

function initSupabase() {
    if (typeof window.supabase === 'undefined') {
        alert('🚨 ERROR FATAL: Browser Anda gagal mengunduh Supabase! Pastikan internet lancar dan matikan AdBlock/VPN jika mengganggu.');
        console.error('Supabase CDN belum dimuat!');
        return false;
    }
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return true;
}
