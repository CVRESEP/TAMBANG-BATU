// Supabase Configuration
// Silakan isi URL dan Anon Key dari dashboard Supabase Anda
const SUPABASE_URL = 'https://cyvbwuiinnfxxuuhmbfw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN5dmJ3dWlpbm5meHh1dWhtYmZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNDYxMTEsImV4cCI6MjA5MTgyMjExMX0.bLE1datJhfWiu4TlNyCa2Q0ci8JxeRgynrFW6l343e0';

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

window.supabaseClient = _supabase;
