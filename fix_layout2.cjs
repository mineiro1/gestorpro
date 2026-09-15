const fs = require('fs');
let content = fs.readFileSync('src/components/Layout.tsx', 'utf8');

const regex2 = /const handleNewJob = \(payload: any\) => \{[\s\S]*?showNotification\('Novo Serviço Avulso', msg\);\s*\}\s*\}\s*\};/;

const newCode2 = `const handleNewJob = (payload: any) => {
      if (payload.new && payload.eventType === 'INSERT') {
        const isAssignedToMe = payload.new.employee_id === userProfile.uid;
        const isAdminOwner = userProfile.role === 'admin' && payload.new.admin_id === userProfile.uid;

        if (isAssignedToMe || isAdminOwner) {
          const msg = isAssignedToMe
            ? 'Um novo serviço avulso foi agendado para você!'
            : 'Um novo serviço avulso foi criado no sistema.';
          showNotification('Novo Serviço Avulso', msg);
        }
      }
    };
    
    const handleJobUpdate = async (payload: any) => {
      if (payload.new && payload.old) {
        const isAdminOwner = userProfile.role === 'admin' && payload.new.admin_id === userProfile.uid;
        const isSelf = payload.new.employee_id === userProfile.uid;
        
        const wasNotCompleted = payload.old.status !== 'concluido';
        const isNowCompleted = payload.new.status === 'concluido';

        if (isAdminOwner && !isSelf && wasNotCompleted && isNowCompleted) {
          try {
            const { data: empData } = await supabase.from('users').select('name').eq('id', payload.new.employee_id).single();
            
            const empName = empData?.name || 'Colaborador';
            const cliName = payload.new.client_name || 'Cliente';
            
            showNotification('Serviço Avulso Finalizado', \`O colaborador \${empName} finalizou o serviço avulso para \${cliName}.\`);
          } catch (e) {
            showNotification('Serviço Avulso Finalizado', 'Um colaborador finalizou um serviço avulso.');
          }
        }
      }
    };`;

content = content.replace(regex2, newCode2);

// also need to update the subscription
content = content.replace(
  ".on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'oneoffjobs' }, handleNewJob)",
  ".on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'oneoffjobs' }, handleNewJob)\n      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'oneoffjobs' }, handleJobUpdate)"
)

fs.writeFileSync('src/components/Layout.tsx', content);
