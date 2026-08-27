const fs = require('fs');

// 1. Remove logo from ClientPanel.tsx
let clientPanel = fs.readFileSync('src/pages/ClientPanel.tsx', 'utf-8');
const logoToRemove = `              {userProfile?.whatsappSettings?.companyLogo && (
                <img key={userProfile.whatsappSettings.companyLogo} src={userProfile.whatsappSettings.companyLogo} alt="Logo Empresa" className="h-12 w-auto mb-4 object-contain bg-white/20 p-1 rounded" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
              )}`;
if (clientPanel.includes(logoToRemove)) {
  clientPanel = clientPanel.replace(logoToRemove + '\n', '');
  fs.writeFileSync('src/pages/ClientPanel.tsx', clientPanel);
  console.log('ClientPanel updated');
} else {
  console.log('Could not find logo in ClientPanel');
}

// 2. Update Layout.tsx logo container
let layout = fs.readFileSync('src/components/Layout.tsx', 'utf-8');
const layoutLogoTarget = `{userProfile?.whatsappSettings?.companyLogo && (
            <div className="w-full aspect-square bg-white flex items-center justify-center p-2 border-b border-gray-200">
              <img 
                key={userProfile.whatsappSettings.companyLogo} 
                src={userProfile.whatsappSettings.companyLogo} 
                alt="Logo" 
                className="w-full h-full object-contain" 
                onError={(e) => { e.currentTarget.style.display = "none"; }} 
              />
            </div>
          )}`;
const layoutLogoReplacement = `{userProfile?.whatsappSettings?.companyLogo && (
            <div className="w-full aspect-square bg-white overflow-hidden border-b border-gray-200">
              <img 
                key={userProfile.whatsappSettings.companyLogo} 
                src={userProfile.whatsappSettings.companyLogo} 
                alt="Logo" 
                className="w-full h-full object-cover" 
                onError={(e) => { e.currentTarget.style.display = "none"; }} 
              />
            </div>
          )}`;
if (layout.includes(layoutLogoTarget)) {
  layout = layout.replace(layoutLogoTarget, layoutLogoReplacement);
  fs.writeFileSync('src/components/Layout.tsx', layout);
  console.log('Layout updated');
} else {
  console.log('Could not find logo container in Layout');
}

