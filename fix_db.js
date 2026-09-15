import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data, error } = await supabase.from('users').select('whatsapp_settings').eq('email', 'servincg@gmail.com').single();
  if (error) {
    console.error(error);
    return;
  }
  
  const settings = data.whatsapp_settings;
  settings.useMetaApi = false;
  settings.useEvolutionApi = true;
  settings.metaServerUrl = '';
  settings.metaToken = '';
  
  const { error: updateError } = await supabase.from('users').update({ whatsapp_settings: settings }).eq('email', 'servincg@gmail.com');
  if (updateError) console.error(updateError);
  else console.log('Fixed DB settings for servincg@gmail.com. Set useEvolutionApi = true, useMetaApi = false.');
}
run();
