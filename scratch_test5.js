import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://huhcynfdivqnjvkyccoz.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh1aGN5bmZkaXZxbmp2a3ljY296Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTAwMDkwOSwiZXhwIjoyMDg2NTc2OTA5fQ.h0AptYhmhuFYpEnHAfkn1t50itUaLmIOnkQ6NbZvSag'; // Service Role
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const payload = {
      name: 'Test Client',
      document: '123456789123',
      user_id: 'f233ed70-bbfc-4f61-b8d1-808012878369', // dummy uuid
      // referral_... omitted
      active: true,
      credit_level: 'ESTANDAR',
      credit_limit: 0,
      approved_term: 30,
      discount: 0,
  };
  const { data, error } = await supabase.from('clients').insert([payload]).select();

  console.log('Client Insert Without Referrals Result:', JSON.stringify({ data, error }, null, 2));
}

test();
