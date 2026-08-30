const fs = require('fs');

const files = [
  'src/pages/PartnerStores.tsx',
  'src/pages/PartnerTechnicians.tsx',
  'src/pages/RoutesPage.tsx',
  'src/pages/Settings.tsx'
];

for (const file of files) {
  if (fs.existsSync(file)) {
    let code = fs.readFileSync(file, 'utf-8');
    
    // general replace
    code = code.replace(/userProfile\.whatsappSettings\?/g, "(userProfile.whatsappSettings as any)?");
    code = code.replace(/userProfile\.whatsappSettings\./g, "(userProfile.whatsappSettings as any).");
    code = code.replace(/userProfile\?\.whatsappSettings\./g, "(userProfile?.whatsappSettings as any).");

    fs.writeFileSync(file, code);
  }
}
