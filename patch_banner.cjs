const fs = require('fs');
let layoutCode = fs.readFileSync('src/components/Layout.tsx', 'utf-8');

const target = `const NotificationBanner = () => {
  const [permission, setPermission] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'default');
  const [dismissed, setDismissed] = useState(sessionStorage.getItem('notif_banner_dismissed') === 'true');

  if (permission !== 'default' || dismissed) return null;

  const requestPermission = async () => {
    try {
      let perm;
      if (Capacitor.isNativePlatform()) {
        const res = await LocalNotifications.requestPermissions();
        perm = res.display === 'granted' ? 'granted' : 'denied';
      } else {
        perm = typeof Notification !== 'undefined' ? await Notification.requestPermission() : 'denied';
        if (perm === 'granted' && 'serviceWorker' in navigator) {
           const reg = await navigator.serviceWorker.ready;
           // Explicitly show a welcome notification to confirm it works via SW
           reg.showNotification('Notificações Ativadas!', {
             body: 'Você receberá alertas de visitas finalizadas aqui.',
             icon: 'https://cdn-icons-png.flaticon.com/512/123/123382.png'
           });
        }
      }
      setPermission(perm);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="bg-blue-600 text-white p-4 flex flex-col sm:flex-row items-center justify-between shadow-md z-50 relative">
      <div className="flex items-center space-x-3 mb-3 sm:mb-0">
        <Bell className="animate-bounce shrink-0" size={24} />
        <p className="text-sm font-medium">
          Ative as notificações para receber alertas quando um técnico finalizar uma visita.
        </p>
      </div>
      <div className="flex space-x-2 shrink-0">
        <button
          onClick={requestPermission}
          className="bg-white text-blue-600 px-4 py-2 rounded-md font-bold text-sm shadow hover:bg-gray-100 transition-colors"
        >
          Ativar
        </button>
        <button
          onClick={() => {
            setDismissed(true);
            sessionStorage.setItem('notif_banner_dismissed', 'true');
          }}
          className="bg-blue-700 text-white px-4 py-2 rounded-md font-bold text-sm hover:bg-blue-800 transition-colors"
        >
          Depois
        </button>
      </div>
    </div>
  );
};`;

const replacement = `const NotificationBanner = () => {
  const [permission, setPermission] = useState('default');
  const [dismissed, setDismissed] = useState(localStorage.getItem('notif_banner_dismissed') === 'true');

  useEffect(() => {
    const checkPerms = async () => {
      if (Capacitor.isNativePlatform()) {
        try {
          const status = await LocalNotifications.checkPermissions();
          if (status.display === 'granted') {
             setPermission('granted');
          } else if (status.display === 'denied') {
             setPermission('denied');
          }
        } catch(e) {}
      } else {
        setPermission(typeof Notification !== 'undefined' ? Notification.permission : 'default');
      }
    };
    checkPerms();
  }, []);

  if (permission !== 'default' || dismissed) return null;

  const requestPermission = async () => {
    try {
      let perm;
      if (Capacitor.isNativePlatform()) {
        const res = await LocalNotifications.requestPermissions();
        perm = res.display === 'granted' ? 'granted' : 'denied';
      } else {
        perm = typeof Notification !== 'undefined' ? await Notification.requestPermission() : 'denied';
        if (perm === 'granted' && 'serviceWorker' in navigator) {
           const reg = await navigator.serviceWorker.ready;
           // Explicitly show a welcome notification to confirm it works via SW
           reg.showNotification('Notificações Ativadas!', {
             body: 'Você receberá alertas do aplicativo aqui.',
             icon: 'https://cdn-icons-png.flaticon.com/512/123/123382.png'
           });
        }
      }
      setPermission(perm);
      localStorage.setItem('notif_banner_dismissed', 'true');
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="bg-blue-600 text-white p-4 flex flex-col sm:flex-row items-center justify-between shadow-md z-50 relative">
      <div className="flex items-center space-x-3 mb-3 sm:mb-0">
        <Bell className="animate-bounce shrink-0" size={24} />
        <p className="text-sm font-medium">
          Ative as notificações para receber alertas quando um técnico finalizar uma visita ou uma nova mensagem chegar.
        </p>
      </div>
      <div className="flex space-x-2 shrink-0">
        <button
          onClick={requestPermission}
          className="bg-white text-blue-600 px-4 py-2 rounded-md font-bold text-sm shadow hover:bg-gray-100 transition-colors"
        >
          Ativar
        </button>
        <button
          onClick={() => {
            setDismissed(true);
            localStorage.setItem('notif_banner_dismissed', 'true');
          }}
          className="bg-blue-700 text-white px-4 py-2 rounded-md font-bold text-sm hover:bg-blue-800 transition-colors"
        >
          Depois
        </button>
      </div>
    </div>
  );
};`;

if (layoutCode.includes(target)) {
    layoutCode = layoutCode.replace(target, replacement);
    fs.writeFileSync('src/components/Layout.tsx', layoutCode);
    console.log("Patched NotificationBanner successfully");
} else {
    console.log("Could not find target in Layout.tsx");
}
