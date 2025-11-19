import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// IMPORTANT: Replace these with your actual Supabase credentials
// Get these from: https://app.supabase.com/project/[your-project]/settings/api

const SUPABASE_URL = 'https://wbzfljzuxcnuwhyppkkm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndiemZsanp1eGNudXdoeXBwa2ttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMyMjA1NTMsImV4cCI6MjA3ODc5NjU1M30.sycu0fAECsNLL3W6ieOkhX0owZ9H0Z3-ST43PAoQbEE';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
