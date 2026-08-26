const fs = require('fs');

// 1. Fix Settings.tsx
let settings = fs.readFileSync('src/pages/Settings.tsx', 'utf-8');
settings = settings.replace(
  '<img \n                  src={companyLogo} \n                  alt="Preview" \n                  className="w-8 h-8 object-contain"\n                  onError={(e) => { e.currentTarget.style.display = \'none\'; }}\n                />',
  '<img \n                  key={companyLogo}\n                  src={companyLogo} \n                  alt="Preview" \n                  className="w-8 h-8 object-contain"\n                  onError={(e) => { e.currentTarget.style.display = \'none\'; }}\n                />'
);
fs.writeFileSync('src/pages/Settings.tsx', settings);

// 2. Fix Layout.tsx
let layout = fs.readFileSync('src/components/Layout.tsx', 'utf-8');
layout = layout.replace(
  '<img src={userProfile?.whatsappSettings?.companyLogo || "/logo.png"} alt="Logo" className="w-8 h-8 object-contain" onError={(e) => { e.currentTarget.style.display = "none"; }} />',
  '{userProfile?.whatsappSettings?.companyLogo && <img key={userProfile.whatsappSettings.companyLogo} src={userProfile.whatsappSettings.companyLogo} alt="Logo" className="w-8 h-8 object-contain" onError={(e) => { e.currentTarget.style.display = "none"; }} />}'
);
layout = layout.replace(
  '<img src={userProfile?.whatsappSettings?.companyLogo || "/logo.png"} alt="Logo" className="w-6 h-6 object-contain" onError={(e) => { e.currentTarget.style.display = "none"; }} />',
  '{userProfile?.whatsappSettings?.companyLogo && <img key={userProfile.whatsappSettings.companyLogo} src={userProfile.whatsappSettings.companyLogo} alt="Logo" className="w-6 h-6 object-contain" onError={(e) => { e.currentTarget.style.display = "none"; }} />}'
);
fs.writeFileSync('src/components/Layout.tsx', layout);

// 3. Fix ClientPanel.tsx
let panel = fs.readFileSync('src/pages/ClientPanel.tsx', 'utf-8');
panel = panel.replace(
  '<img src={userProfile.whatsappSettings.companyLogo} alt="Logo Empresa" className="h-12 w-auto mb-4 object-contain bg-white/20 p-1 rounded" onError={(e) => { e.currentTarget.style.display = \'none\'; }} />',
  '<img key={userProfile.whatsappSettings.companyLogo} src={userProfile.whatsappSettings.companyLogo} alt="Logo Empresa" className="h-12 w-auto mb-4 object-contain bg-white/20 p-1 rounded" onError={(e) => { e.currentTarget.style.display = \'none\'; }} />'
);
fs.writeFileSync('src/pages/ClientPanel.tsx', panel);

console.log("Images patched.");
