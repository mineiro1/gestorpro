import re

with open('src/components/ChatModal.tsx', 'r') as f:
    content = f.read()

old_sub = """        const subscription = supabase
          .channel(`chat_${client.id}`)
          .on('postgres_changes', { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'chat_messages'
          }, payload => {
            // Verificar se a mensagem pertence a alguma sessão deste cliente
            supabase.from('chat_sessions').select('id').eq('client_id', client.id).then(({ data }) => {
               if (data && data.some(s => s.id === payload.new.session_id)) {
                  setMessages(prev => {
                     // avoid duplicates
                     if (prev.find(m => m.id === payload.new.id)) return prev;
                     return [...prev, payload.new];
                  });
               }
            });
          })
          .subscribe();"""

new_sub = """        const subscription = supabase
          .channel(`chat_${client.id}`)
          .on('postgres_changes', { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'chat_messages'
          }, async payload => {
            // Fast local check: does this message belong to any of our known sessions?
            // To ensure we don't miss anything, we query just this session ID
            const { data } = await supabase.from('chat_sessions').select('client_id').eq('id', payload.new.session_id).single();
            if (data && data.client_id === client.id) {
               setMessages(prev => {
                  if (prev.find(m => m.id === payload.new.id)) return prev;
                  return [...prev, payload.new];
               });
            }
          })
          .subscribe();"""

content = content.replace(old_sub, new_sub)

with open('src/components/ChatModal.tsx', 'w') as f:
    f.write(content)
