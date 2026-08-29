const fs = require('fs');

let code = fs.readFileSync('src/components/Layout.tsx', 'utf-8');

const oldLogic = `  // Escuta novas visitas (e limpezas avulsas) agendadas para este técnico
  useEffect(() => {
    if (!userProfile || (userProfile.role !== 'employee' && userProfile.role !== 'manager')) return;

    const requestPerms = async () => {
      if (Capacitor.isNativePlatform()) {
        try {
          await LocalNotifications.requestPermissions();
        } catch (e) {
          console.error("Local notifications permission error", e);
        }
      } else if ('Notification' in window && Notification.permission !== 'granted') {
        Notification.requestPermission().catch(() => {});
      }
    };
    requestPerms();

    const showNotification = async (title: string, body: string) => {
      if (Capacitor.isNativePlatform()) {
        try {
          await LocalNotifications.schedule({
            notifications: [
              {
                title,
                body,
                id: new Date().getTime(),
                schedule: { at: new Date(Date.now() + 1000) }
              }
            ]
          });
        } catch (e) {
          console.error("Capacitor local notification error", e);
        }
      } else {
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
  }, [userProfile]);`;

const newLogic = `  // Escuta novas visitas (e limpezas avulsas) agendadas para este técnico ou admin
  useEffect(() => {
    if (!userProfile) return;

    const requestPerms = async () => {
      if (Capacitor.isNativePlatform()) {
        try {
          await LocalNotifications.requestPermissions();
        } catch (e) {
          console.error("Local notifications permission error", e);
        }
      } else if ('Notification' in window && Notification.permission !== 'granted') {
        Notification.requestPermission().catch(() => {});
      }
    };
    requestPerms();

    const showNotification = async (title: string, body: string) => {
      if (Capacitor.isNativePlatform()) {
        try {
          await LocalNotifications.schedule({
            notifications: [
              {
                title,
                body,
                id: new Date().getTime(),
                schedule: { at: new Date(Date.now() + 1000) }
              }
            ]
          });
        } catch (e) {
          console.error("Capacitor local notification error", e);
        }
      } else {
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
      }
    };

    const handleNewVisit = (payload: any) => {
      if (payload.new) {
        const isAssignedToMe = payload.new.employee_id === userProfile.uid;
        const isAdminOwner = userProfile.role === 'admin' && payload.new.admin_id === userProfile.uid;
        if (isAssignedToMe || isAdminOwner) {
          const msg = isAssignedToMe 
            ? 'Você tem uma nova visita/manutenção agendada para hoje!'
            : 'Uma nova visita foi criada no sistema.';
          showNotification('Nova Visita Agendada', msg);
        }
      }
    };

    const handleNewJob = (payload: any) => {
      if (payload.new) {
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

    const channel = supabase.channel('employee-notifications-fix')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'visits' }, handleNewVisit)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'oneoffjobs' }, handleNewJob)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userProfile]);`;

if (code.includes(oldLogic)) {
  code = code.replace(oldLogic, newLogic);
  fs.writeFileSync('src/components/Layout.tsx', code);
  console.log("Layout.tsx patched with fixed notifications.");
} else {
  console.log("Could not find the old logic block to replace.");
}
