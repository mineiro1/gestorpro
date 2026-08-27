const fs = require('fs');

let code = fs.readFileSync('src/pages/PartnerTechnicians.tsx', 'utf-8');

const target = `  const getWhatsAppLink = (techPhone: string) => {
    const companyName = userProfile?.whatsappSettings?.companyName || 'nossa empresa';
    const message = \\\`Olá, a empresa \\\${companyName} me indicou seus serviços, gostaria de um orçamento.\\\`;
    const cleanPhone = techPhone.replace(/\\\\D/g, '');
    return \\\`https://wa.me/55\\\${cleanPhone}?text=\\\${encodeURIComponent(message)}\\\`;
  };`;

// wait, the actual text in the file probably has the literal backslashes.
// let me just replace the whole function.

code = code.replace(/const getWhatsAppLink = [\\s\\S]*?};/, \`const getWhatsAppLink = (techPhone: string) => {
    const companyName = userProfile?.whatsappSettings?.companyName || 'nossa empresa';
    const message = \\\`Olá, a empresa \${companyName} me indicou seus serviços, gostaria de um orçamento.\\\`;
    const cleanPhone = techPhone.replace(/\\D/g, '');
    return \\\`https://wa.me/55\${cleanPhone}?text=\${encodeURIComponent(message)}\\\`;
  };\`);

fs.writeFileSync('src/pages/PartnerTechnicians.tsx', code);
