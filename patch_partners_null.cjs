const fs = require('fs');

['src/pages/PartnerStores.tsx', 'src/pages/PartnerTechnicians.tsx'].forEach(file => {
  let code = fs.readFileSync(file, 'utf-8');
  code = code.replace(
    /if \(userProfile\.whatsappSettings\) \{\s+userProfile\.whatsappSettings\.([a-zA-Z]+) = new([a-zA-Z]+);\s+\}/g,
    `if (userProfile) {
        if (!userProfile.whatsappSettings) userProfile.whatsappSettings = {};
        userProfile.whatsappSettings.$1 = new$2;
      }`
  );
  fs.writeFileSync(file, code);
});
