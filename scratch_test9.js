import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://huhcynfdivqnjvkyccoz.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh1aGN5bmZkaXZxbmp2a3ljY296Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEwMDA5MDksImV4cCI6MjA4NjU3NjkwOX0.LK46L7MxuoHv1AMAOGpTW6qRJ5sybVEpdG5e7iLwti8'; // Anon Key
const supabase = createClient(supabaseUrl, supabaseKey, {
  global: {
    headers: {
      Authorization: 'Bearer [object Object]'
    }
  }
});

async function test() {
  const { data, error } = await supabase.from('clients').select('*').limit(1);
  console.log('Bad Auth Query:', JSON.stringify({ data, error }, null, 2));
}

test();
