const fs = require('fs');

let code = fs.readFileSync('src/pages/Settings.tsx', 'utf-8');

const targetStr = `      if (error) throw error;
      
      alert('Configurações salvas com sucesso! (As alterações no painel serão aplicadas no próximo login ou recarregamento)');`;

const replacementStr = `      if (error) throw error;

      if (userProfile.whatsappSettings) {
        userProfile.whatsappSettings.companyName = companyName;
        userProfile.whatsappSettings.companyLogo = companyLogo;
      }
      
      alert('Configurações salvas com sucesso! (As alterações no painel serão aplicadas no próximo login ou recarregamento)');`;

if (code.includes(targetStr)) {
  code = code.replace(targetStr, replacementStr);
  fs.writeFileSync('src/pages/Settings.tsx', code);
  console.log("Settings.tsx patched successfully.");
} else {
  console.error("Could not find target in Settings.tsx");
}
