import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://huhcynfdivqnjvkyccoz.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh1aGN5bmZkaXZxbmp2a3ljY296Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTAwMDkwOSwiZXhwIjoyMDg2NTc2OTA5fQ.h0AptYhmhuFYpEnHAfkn1t50itUaLmIOnkQ6NbZvSag'; // Service Role
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data: cData } = await supabase.from('clients').select('id, name, created_at, updated_at').order('updated_at', { ascending: false }).limit(2);
  console.log('Recent Clients:', cData);

  const { data: pData } = await supabase.from('products').select('id, name, created_at, updated_at').order('updated_at', { ascending: false }).limit(2);
  console.log('Recent Products:', pData);
}

test();
