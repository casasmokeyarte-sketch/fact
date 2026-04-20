import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://huhcynfdivqnjvkyccoz.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh1aGN5bmZkaXZxbmp2a3ljY296Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTAwMDkwOSwiZXhwIjoyMDg2NTc2OTA5fQ.h0AptYhmhuFYpEnHAfkn1t50itUaLmIOnkQ6NbZvSag'; // Service Role
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const payload = {
      user_id: '6a92c59f-b140-464a-a180-ea59c0556af2',
      name: 'Test Client Update',
      document: '666666666',
      phone: null,
      email: null,
      address: null,
      credit_level: 'ESTANDAR',
      credit_limit: 0,
      approved_term: 30,
      discount: 0,
      referrer_document: '',
      referrer_name: '',
      referral_reward_granted: false,
      referral_credits_available: 0,
      referral_points: 0,
      successful_referral_count: 0,
      active: true,
      updated_at: new Date().toISOString(),
      company_id: '09d70414-784e-449b-9efc-dbe23fd547ad'
    };
  const { data, error } = await supabase.from('clients').insert([payload]).select();

  console.log('Insert Error Client:', JSON.stringify(error, null, 2));

  if (!error) {
     await supabase.from('clients').delete().eq('id', data[0].id);
  }
}

test();
