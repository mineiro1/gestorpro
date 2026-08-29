const fs = require('fs');

let code = fs.readFileSync('src/components/Layout.tsx', 'utf-8');

const newEffect = `
  // Escuta novas visitas (e limpezas avulsas) agendadas para este técnico
  useEffect(() => {
    if (!userProfile || (userProfile.role !== 'employee' && userProfile.role !== 'manager')) return;

    if ('Notification' in window && Notification.permission !== 'granted') {
      Notification.requestPermission().catch(() => {});
    }

    const showNotification = (title, body) => {
      if ('Notification' in window && Notification.permission === 'granted') {
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
          navigator.serviceWorker.ready.then(registration => {
            registration.showNotification(title, {
              body,
              icon: 'https://cdn-icons-png.flaticon.com/512/123/123382.png',
              vibrate: [200, 100, 200],
            });
          });
        } else {
          new Notification(title, { body, icon: 'https://cdn-icons-png.flaticon.com/512/123/123382.png' });
        }
      }
    };

    const handleNewVisit = (payload) => {
      if (payload.new && payload.new.employee_id === userProfile.uid) {
        showNotification('Nova Visita Agendada', 'Você tem uma nova visita/manutenção agendada para hoje!');
      }
    };

    const handleNewJob = (payload) => {
      if (payload.new && payload.new.employee_id === userProfile.uid) {
        showNotification('Novo Serviço Avulso', 'Um novo serviço avulso foi agendado para você!');
      }
    };

    const channel = supabase.channel('employee-notifications')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'visits' }, handleNewVisit)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'one_off_jobs' }, handleNewJob)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userProfile]);
`;

const targetAnchor = "useEffect(() => {"; // line 51

// Let's replace the second useEffect with both effects
const parts = code.split('useEffect(() => {\n    // Solicita permissões');
if (parts.length > 1) {
  const newCode = parts[0] + newEffect + '\n  useEffect(() => {\n    // Solicita permissões' + parts[1];
  fs.writeFileSync('src/components/Layout.tsx', newCode);
  console.log('Layout patched successfully.');
} else {
  console.log('Failed to patch Layout');
}
