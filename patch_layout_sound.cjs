const fs = require('fs');
let code = fs.readFileSync('src/components/Layout.tsx', 'utf-8');

const target = `    const channel = supabase.channel('employee-notifications-fix')`;
const replacement = `    const handleNewChatMessage = async (payload: any) => {
      if (payload.new) {
         // Se a mensagem for do cliente
         if (payload.new.sender_type === 'client') {
            try {
              const { data: sessionData } = await supabase.from('chat_sessions').select('client_id').eq('id', payload.new.session_id).single();
              if (sessionData && sessionData.client_id) {
                 const { data: clientData } = await supabase.from('clients').select('name').eq('id', sessionData.client_id).single();
                 const cName = clientData?.name || 'Cliente';
                 showNotification('Nova Mensagem', \`\${cName} enviou uma nova mensagem no chat.\`);
              } else {
                 showNotification('Nova Mensagem', 'Você recebeu uma nova mensagem no chat.');
              }
            } catch(e) {
               showNotification('Nova Mensagem', 'Você recebeu uma nova mensagem no chat.');
            }
         }
      }
    };

    const channel = supabase.channel('employee-notifications-fix')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, handleNewChatMessage)`;

if (code.includes(target)) {
   code = code.replace(target, replacement);
   fs.writeFileSync('src/components/Layout.tsx', code);
   console.log("Layout patched!");
} else {
   console.log("Target not found");
}
