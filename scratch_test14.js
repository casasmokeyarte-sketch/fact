import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://huhcynfdivqnjvkyccoz.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh1aGN5bmZkaXZxbmp2a3ljY296Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTAwMDkwOSwiZXhwIjoyMDg2NTc2OTA5fQ.h0AptYhmhuFYpEnHAfkn1t50itUaLmIOnkQ6NbZvSag'; // Service Role
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data, error } = await supabase.from('products').insert([{
    name: 'Test Product 123',
    status: 'activo',
    reorder_level: 10,
    price: 100,
    company_id: '09d70414-784e-449b-9efc-dbe23fd547ad' // VALID COMPANY
  }]).select();

  console.log('Product Retry Result:', JSON.stringify({ data, error }, null, 2));

  // Clean up
  if (data?.length > 0) {
    await supabase.from('products').delete().eq('id', data[0].id);
  }
}

test();
