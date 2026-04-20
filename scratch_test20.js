import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://huhcynfdivqnjvkyccoz.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh1aGN5bmZkaXZxbmp2a3ljY296Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTAwMDkwOSwiZXhwIjoyMDg2NTc2OTA5fQ.h0AptYhmhuFYpEnHAfkn1t50itUaLmIOnkQ6NbZvSag'; // Service Role
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data: cData } = await supabase.from('clients').select('id, name').limit(1);
  const clientId = cData[0].id;
  const oldName = cData[0].name;

  console.log('Old Name:', oldName);

  await supabase.from('clients').update({ name: oldName + ' test' }).eq('id', clientId);
  
  const { data: updatedData } = await supabase.from('clients').select('id, name').eq('id', clientId);
  console.log('New Name:', updatedData[0].name);

  // Restore the name
  await supabase.from('clients').update({ name: oldName }).eq('id', clientId);
}

test();
