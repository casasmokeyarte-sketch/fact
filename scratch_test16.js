import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://huhcynfdivqnjvkyccoz.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh1aGN5bmZkaXZxbmp2a3ljY296Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTAwMDkwOSwiZXhwIjoyMDg2NTc2OTA5fQ.h0AptYhmhuFYpEnHAfkn1t50itUaLmIOnkQ6NbZvSag'; // Service Role
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  // Try to insert a product with is_visible to see if it's really missing,
  // we already did and saw PGRST204.
  // Is it possible to use RPC to query information_schema? No.
  console.log("We already know PGRST204 is thrown for is_visible");
}

test();
