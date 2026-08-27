const fs = require('fs');

let code = fs.readFileSync('src/pages/PartnerStores.tsx', 'utf-8');

const target = `  const getWhatsAppLink = (storePhone: string) => {
    const companyName = userProfile?.whatsappSettings?.companyName || 'RS Piscina';
    const message = \`Olá, a empresa \${companyName} me indicou sua loja para produtos de piscina, poderia me fazer um orçamento\`;`;

const replacement = `  const getWhatsAppLink = (storePhone: string) => {
    const companyName = userProfile?.whatsappSettings?.companyName || 'nossa empresa';
    const message = \`Olá, a empresa \${companyName} me indicou sua loja para produtos de piscina, poderia me fazer um orçamento\`;`;

if (code.includes(target)) {
  code = code.replace(target, replacement);
  fs.writeFileSync('src/pages/PartnerStores.tsx', code);
  console.log("PartnerStores.tsx updated.");
} else {
  console.error("Could not find target in PartnerStores.tsx");
}
