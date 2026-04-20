import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://huhcynfdivqnjvkyccoz.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh1aGN5bmZkaXZxbmp2a3ljY296Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTAwMDkwOSwiZXhwIjoyMDg2NTc2OTA5fQ.h0AptYhmhuFYpEnHAfkn1t50itUaLmIOnkQ6NbZvSag'; // Service Role
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data, error } = await supabase.from('products').insert([{
    name: 'Test Product 123',
    status: 'activo',
    is_visible: true,
    reorder_level: 10,
    price: 100,
    company_id: 'f233ed70-bbfc-4f61-b8d1-808012878369'
  }]).select();

  console.log('Result:', JSON.stringify({ data, error }, null, 2));
}

test();
