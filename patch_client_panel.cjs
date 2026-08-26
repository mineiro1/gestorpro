const fs = require('fs');
let code = fs.readFileSync('src/pages/ClientPanel.tsx', 'utf-8');

code = code.replace(
  '<h1 className="text-3xl font-bold mb-2">Olá, {(clientData.name || \'Cliente\').split(\' \')[0]}!</h1>',
  '{userProfile?.whatsappSettings?.companyLogo && (\n                <img src={userProfile.whatsappSettings.companyLogo} alt="Logo Empresa" className="h-12 w-auto mb-4 object-contain bg-white/20 p-1 rounded" onError={(e) => { e.currentTarget.style.display = \'none\'; }} />\n              )}\n              <h1 className="text-3xl font-bold mb-2">Olá, {(clientData.name || \'Cliente\').split(\' \')[0]}!</h1>'
);

fs.writeFileSync('src/pages/ClientPanel.tsx', code);
console.log("ClientPanel patched.");
