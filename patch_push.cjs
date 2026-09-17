const fs = require('fs');

let content = fs.readFileSync('server.ts', 'utf8');

const target = `    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, async (payload) => {
       if (!fcmInitialized) return;`;

const replacement = `    .on('postgres_changes', { event: '*', schema: 'public', table: 'visits' }, async (payload) => {
       if (!fcmInitialized) return;
       const newVisit = payload.new;
       if (!newVisit) return;
       
       // Detect if it was just finalized
       let justFinalized = false;
       if (payload.eventType === 'INSERT' && newVisit.status === 'finalizada') {
           justFinalized = true;
       } else if (payload.eventType === 'UPDATE' && payload.old && payload.old.status !== 'finalizada' && newVisit.status === 'finalizada') {
           justFinalized = true;
       }
       
       if (justFinalized && newVisit.admin_id && newVisit.admin_id !== newVisit.employee_id) {
           const { data: users } = await supabaseAdmin.from('users').select('fcm_token').eq('id', newVisit.admin_id);
           if (users && users.length > 0) {
               // Get names
               const { data: empData } = await supabaseAdmin.from('users').select('name').eq('id', newVisit.employee_id).single();
               const { data: cliData } = await supabaseAdmin.from('clients').select('name').eq('id', newVisit.client_id).single();
               
               const empName = empData?.name || 'Um colaborador';
               const cliName = cliData?.name || 'um cliente';
               
               users.forEach(u => {
                   if (u.fcm_token) {
                       getMessaging().send({
                           token: u.fcm_token,
                           notification: {
                               title: 'Visita Concluída',
                               body: \`O colaborador \${empName} acaba de finalizar a visita ao cliente \${cliName}.\`
                           }
                       }).catch(e => console.error("FCM Send Error:", e));
                   }
               });
           }
       }
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'oneoffjobs' }, async (payload) => {
       if (!fcmInitialized) return;
       const newJob = payload.new;
       if (!newJob || !payload.old) return;
       
       if (payload.old.status !== 'concluido' && newJob.status === 'concluido' && newJob.admin_id && newJob.admin_id !== newJob.employee_id) {
           const { data: users } = await supabaseAdmin.from('users').select('fcm_token').eq('id', newJob.admin_id);
           if (users && users.length > 0) {
               const { data: empData } = await supabaseAdmin.from('users').select('name').eq('id', newJob.employee_id).single();
               const empName = empData?.name || 'Um colaborador';
               const cliName = newJob.client_name || 'um cliente';
               
               users.forEach(u => {
                   if (u.fcm_token) {
                       getMessaging().send({
                           token: u.fcm_token,
                           notification: {
                               title: 'Serviço Avulso Concluído',
                               body: \`O colaborador \${empName} acaba de finalizar a visita ao cliente \${cliName}.\`
                           }
                       }).catch(e => console.error("FCM Send Error:", e));
                   }
               });
           }
       }
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, async (payload) => {
       if (!fcmInitialized) return;`;

content = content.replace(target, replacement);

fs.writeFileSync('server.ts', content);
console.log("Push notifications updated!");
