import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://huhcynfdivqnjvkyccoz.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh1aGN5bmZkaXZxbmp2a3ljY296Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEwMDA5MDksImV4cCI6MjA4NjU3NjkwOX0.LK46L7MxuoHv1AMAOGpTW6qRJ5sybVEpdG5e7iLwti8'
);

async function test() {
  const { data, error } = await supabase.from('clients').select('*').limit(1);
  console.log('SELECT:', { data, error });

  const { data: iData, error: iError } = await supabase.from('clients').insert([{
     name: "Test"
  }]);
  console.log('INSERT:', { iData, iError });
}

test();
