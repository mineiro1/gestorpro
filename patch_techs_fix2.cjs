const fs = require('fs');

let code = fs.readFileSync('src/pages/PartnerTechnicians.tsx', 'utf-8');

const replacement = `  const getWhatsAppLink = (techPhone: string) => {
    const companyName = userProfile?.whatsappSettings?.companyName || 'nossa empresa';
    const message = \`Olá, a empresa \${companyName} me indicou seus serviços, gostaria de um orçamento.\`;
    const cleanPhone = techPhone.replace(/\\D/g, '');
    return \`https://wa.me/55\${cleanPhone}?text=\${encodeURIComponent(message)}\`;
  };`;

code = code.replace(/const getWhatsAppLink = [\s\S]*?};/, replacement);

fs.writeFileSync('src/pages/PartnerTechnicians.tsx', code);
