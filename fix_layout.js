const fs = require('fs');
let content = fs.readFileSync('src/components/Layout.tsx', 'utf8');

const regex = /const handleNewVisit = \(payload: any\) => \{[\s\S]*?showNotification\('Nova Visita Agendada', msg\);\s*\}\s*\}\s*\};/;

const newCode = `const handleNewVisit = async (payload: any) => {
      if (payload.new) {
        const isAdminOwner = userProfile.role === 'admin' && payload.new.admin_id === userProfile.uid;
        const isSelf = payload.new.employee_id === userProfile.uid;

        if (isAdminOwner && !isSelf) {
          try {
            const { data: empData } = await supabase.from('users').select('name').eq('id', payload.new.employee_id).single();
            const { data: cliData } = await supabase.from('clients').select('name').eq('id', payload.new.client_id).single();
            
            const empName = empData?.name || 'Colaborador';
            const cliName = cliData?.name || 'Cliente';
            
            showNotification('Visita Finalizada', \`O colaborador \${empName} finalizou a visita no cliente \${cliName}.\`);
          } catch (e) {
            showNotification('Visita Finalizada', 'Um colaborador finalizou uma visita.');
          }
        }
      }
    };`;

content = content.replace(regex, newCode);
fs.writeFileSync('src/components/Layout.tsx', content);
