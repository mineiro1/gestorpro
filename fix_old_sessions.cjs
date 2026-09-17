require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data: openSessions } = await s.from('chat_sessions').select('*').eq('status', 'open').is('closed_at', null);
  if (openSessions && openSessions.length > 0) {
     for (const session of openSessions) {
        // If created more than 1 hour ago, just hard close them.
        const created = new Date(session.created_at).getTime();
        const now = new Date().getTime();
        if (now - created > 60 * 60 * 1000) {
           await s.from('chat_sessions').update({ status: 'closed', closed_at: session.created_at }).eq('id', session.id);
        } else {
           // Otherwise set closed_at to created_at so they expire 30 mins after creation
           await s.from('chat_sessions').update({ closed_at: session.created_at }).eq('id', session.id);
        }
     }
  }
  
  // Also close any sessions that have closed_at set and > 30 mins have passed
  const { data: closingSessions } = await s.from('chat_sessions').select('*').eq('status', 'open').not('closed_at', 'is', null);
  if (closingSessions) {
     for (const session of closingSessions) {
        const closed = new Date(session.closed_at).getTime();
        const now = new Date().getTime();
        if (now - closed > 30 * 60 * 1000) {
           await s.from('chat_sessions').update({ status: 'closed' }).eq('id', session.id);
        }
     }
  }
  console.log("Old sessions fixed.");
}
run();
