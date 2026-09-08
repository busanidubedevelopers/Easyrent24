import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://odumgfqlihsjzxnsqibe.supabase.co';
const supabaseKey = 'sb_publishable_LTimJ8k0JbkayUKk6C6-Gw_AYkBM8wq';

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data, error } = await supabase
    .from('properties')
    .select('*')
    .limit(5);

  console.log('Error:', error);
  console.log('Data:', JSON.stringify(data, null, 2));
}

main();
