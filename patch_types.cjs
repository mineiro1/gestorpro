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
    code = code.replace(/userProfile\?\.whatsappSettings\?\.partnerStores/g, "(userProfile?.whatsappSettings as any)?.partnerStores");
    code = code.replace(/userProfile\?\.whatsappSettings\?\.partnerTechnicians/g, "(userProfile?.whatsappSettings as any)?.partnerTechnicians");
    code = code.replace(/userProfile\?\.whatsappSettings\?\.reportMessage1/g, "(userProfile?.whatsappSettings as any)?.reportMessage1");
    code = code.replace(/userProfile\?\.whatsappSettings\?\.reportMessage2/g, "(userProfile?.whatsappSettings as any)?.reportMessage2");
    code = code.replace(/userProfile\?\.whatsappSettings\?\.useMetaApi/g, "(userProfile?.whatsappSettings as any)?.useMetaApi");
    code = code.replace(/userProfile\?\.whatsappSettings\?\.useEvolutionApi/g, "(userProfile?.whatsappSettings as any)?.useEvolutionApi");
    
    // assignments
    code = code.replace(/userProfile\.whatsappSettings\.partnerStores/g, "(userProfile.whatsappSettings as any).partnerStores");
    code = code.replace(/userProfile\.whatsappSettings\.partnerTechnicians/g, "(userProfile.whatsappSettings as any).partnerTechnicians");

    fs.writeFileSync(file, code);
  }
}
