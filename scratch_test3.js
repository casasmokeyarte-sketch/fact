import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://huhcynfdivqnjvkyccoz.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh1aGN5bmZkaXZxbmp2a3ljY296Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTAwMDkwOSwiZXhwIjoyMDg2NTc2OTA5fQ.h0AptYhmhuFYpEnHAfkn1t50itUaLmIOnkQ6NbZvSag'; // Service Role
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const payload = {
      name: 'Test Client',
      document: '123456789',
      referral_reward_granted: false,
      referral_credits_available: 0,
      referral_points: 0,
      successful_referral_count: 0
  };
  const { data, error } = await supabase.from('clients').insert([payload]).select();

  console.log('Client Insert Result:', JSON.stringify({ data, error }, null, 2));
}

test();
