const fs = require('fs');
let code = fs.readFileSync('src/pages/ProductsPage.tsx', 'utf-8');

// 1. Add state for whatsappSettings
if (!code.includes('const [waSettings, setWaSettings]')) {
  code = code.replace(
    'const [sendingMessage, setSendingMessage] = useState(false);',
    'const [sendingMessage, setSendingMessage] = useState(false);\n  const [waSettings, setWaSettings] = useState<any>(null);'
  );
}

// 2. Fetch whatsapp_settings on mount
const fetchCode = `
  useEffect(() => {
    const fetchSettings = async () => {
      const adminId = isAdmin ? userProfile?.uid : userProfile?.adminId;
      if (!adminId) return;
      const { data } = await supabase.from('users').select('whatsapp_settings').eq('id', adminId).single();
      if (data) {
        setWaSettings(data.whatsapp_settings || {});
      }
    };
    if (userProfile) fetchSettings();
  }, [userProfile, isAdmin]);
`;

if (!code.includes('const fetchSettings = async () => {')) {
  code = code.replace(
    'useEffect(() => {\n    if (userProfile?.customProducts',
    fetchCode + '\n  useEffect(() => {\n    if (userProfile?.customProducts'
  );
}

// 3. Update handleSend to use waSettings
code = code.replace(
  'const settings = userProfile?.whatsappSettings || {};',
  'const settings = waSettings || userProfile?.whatsappSettings || {};'
);

fs.writeFileSync('src/pages/ProductsPage.tsx', code);
console.log("Patched ProductsPage with waSettings state");
