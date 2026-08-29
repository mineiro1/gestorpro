const fs = require('fs');

let code = fs.readFileSync('src/pages/Billing.tsx', 'utf-8');

const targetStr = `      const { error } = await supabase.from('users').update({
        whatsapp_settings: waSettings
      }).eq('id', userProfile.uid);`;

const replacementStr = `      const currentSettings = userProfile.whatsappSettings || {};
      const { error } = await supabase.from('users').update({
        whatsapp_settings: {
          ...currentSettings,
          ...waSettings
        }
      }).eq('id', userProfile.uid);`;

if (code.includes(targetStr)) {
  code = code.replace(targetStr, replacementStr);
  fs.writeFileSync('src/pages/Billing.tsx', code);
  console.log("Billing.tsx patched successfully.");
} else {
  console.error("Could not find target in Billing.tsx");
}
