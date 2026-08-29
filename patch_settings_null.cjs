const fs = require('fs');

let code = fs.readFileSync('src/pages/Settings.tsx', 'utf-8');
code = code.replace(
  `      if (userProfile.whatsappSettings) {
        userProfile.whatsappSettings.companyName = companyName;
        userProfile.whatsappSettings.companyLogo = companyLogo;
      }`,
  `      if (userProfile) {
        if (!userProfile.whatsappSettings) userProfile.whatsappSettings = {};
        userProfile.whatsappSettings.companyName = companyName;
        userProfile.whatsappSettings.companyLogo = companyLogo;
      }`
);
fs.writeFileSync('src/pages/Settings.tsx', code);
