const fs = require('fs');

// Clients.tsx
let clients = fs.readFileSync('src/pages/Clients.tsx', 'utf8');
clients = clients.replace(
  `await supabase.from('payments').delete().eq('client_id', clientToHardDelete.id);`,
  `// First delete chat messages of this client's sessions
      const { data: sessions } = await supabase.from('chat_sessions').select('id').eq('client_id', clientToHardDelete.id);
      if (sessions && sessions.length > 0) {
         const sessionIds = sessions.map(s => s.id);
         await supabase.from('chat_messages').delete().in('session_id', sessionIds);
         await supabase.from('chat_sessions').delete().in('id', sessionIds);
      }
      await supabase.from('payments').delete().eq('client_id', clientToHardDelete.id);`
);
fs.writeFileSync('src/pages/Clients.tsx', clients);

// Employees.tsx
let emp = fs.readFileSync('src/pages/Employees.tsx', 'utf8');
emp = emp.replace(
  `await supabase.from('visits').delete().eq('employee_id', employeeToHardDelete.id);`,
  `// Cleanup sessions
      await supabase.from('chat_sessions').update({ employee_id: null }).eq('employee_id', employeeToHardDelete.id);
      await supabase.from('chat_sessions').update({ visit_id: null }).in('visit_id', (await supabase.from('visits').select('id').eq('employee_id', employeeToHardDelete.id)).data?.map(v => v.id) || []);
      await supabase.from('visits').delete().eq('employee_id', employeeToHardDelete.id);`
);
fs.writeFileSync('src/pages/Employees.tsx', emp);

// SuperAdminPage.tsx
let sa = fs.readFileSync('src/pages/SuperAdminPage.tsx', 'utf8');
sa = sa.replace(
  `await supabase.from('visits').delete().eq('admin_id', adminToDelete);`,
  `// Cleanup sessions
      const { data: adminSessions } = await supabase.from('chat_sessions').select('id').eq('admin_id', adminToDelete);
      if (adminSessions && adminSessions.length > 0) {
         const sessionIds = adminSessions.map(s => s.id);
         await supabase.from('chat_messages').delete().in('session_id', sessionIds);
         await supabase.from('chat_sessions').delete().in('id', sessionIds);
      }
      await supabase.from('visits').delete().eq('admin_id', adminToDelete);`
);
fs.writeFileSync('src/pages/SuperAdminPage.tsx', sa);

console.log("Deletes fixed for cascade");
