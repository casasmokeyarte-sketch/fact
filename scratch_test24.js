import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://huhcynfdivqnjvkyccoz.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh1aGN5bmZkaXZxbmp2a3ljY296Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTAwMDkwOSwiZXhwIjoyMDg2NTc2OTA5fQ.h0AptYhmhuFYpEnHAfkn1t50itUaLmIOnkQ6NbZvSag'; 
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const payload = {
      user_id: '6a92c59f-b140-464a-a180-ea59c0556af2',
      name: 'Test Product Default',
      price: 100,
      cost: 50,
      status: 'activo',
      reorder_level: 10
      // Notice: NO company_id
    };
  const { data, error } = await supabase.from('products').insert([payload]).select();

  console.log('Insert Error Product (no company_id):', error);
  if (!error) {
     await supabase.from('products').delete().eq('id', data[0].id);
  }
}

test();
