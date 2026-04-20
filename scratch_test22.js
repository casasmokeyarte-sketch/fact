import fs from 'fs';

// If there's an error on the edge function, we can check it.
// Wait, I can't check the edge function without knowing the project. 
// VITE_CRM_SYNC_URL=https://zjimfjvqvdmztbttsbma.supabase.co/functions/v1/sync-fact-record
// Let's make an actual fetch to the URL just like the app does!

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://huhcynfdivqnjvkyccoz.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh1aGN5bmZkaXZxbmp2a3ljY296Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTAwMDkwOSwiZXhwIjoyMDg2NTc2OTA5fQ.h0AptYhmhuFYpEnHAfkn1t50itUaLmIOnkQ6NbZvSag'; 
const supabase = createClient(supabaseUrl, supabaseKey);

async function testSync() {
  const CRM_SYNC_URL = process.env.VITE_CRM_SYNC_URL || 'https://zjimfjvqvdmztbttsbma.supabase.co/functions/v1/sync-fact-record';
  const VITE_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'; // Replace with actual anon key from .env.local

  const payload = {
    action: 'client.updated',
    client: {
        id: '123'
    },
    source: 'FACT_DESKTOP',
    userId: 'test',
    timestamp: new Date().toISOString()
  };

  try {
      const response = await fetch(CRM_SYNC_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}` // Use service key or anon for testing
        },
        body: JSON.stringify(payload)
      });
      
      const text = await response.text();
      console.log("CRM SYNC RESPONSE:", response.status, text);
  } catch (e) {
      console.log("Fetch failed:", e);
  }
}

testSync();
