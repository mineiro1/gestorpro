const fs = require('fs');

let code = fs.readFileSync('src/pages/Billing.tsx', 'utf-8');

const targetStr = `      if (error) throw error;
      // Give feedback that it saved
      setSettingsModalOpen(false);`;

const replacementStr = `      if (error) throw error;
      if (userProfile) {
        userProfile.whatsappSettings = {
          ...currentSettings,
          ...waSettings
        };
      }
      // Give feedback that it saved
      setSettingsModalOpen(false);`;

if (code.includes(targetStr)) {
  code = code.replace(targetStr, replacementStr);
  fs.writeFileSync('src/pages/Billing.tsx', code);
  console.log("Billing.tsx patched successfully.");
} else {
  console.error("Could not find target in Billing.tsx");
}
