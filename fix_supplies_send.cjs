const fs = require('fs');
let code = fs.readFileSync('src/pages/SuppliesForm.tsx', 'utf-8');

// 1. Add static imports
if (!code.includes("import { openWhatsApp, sendEvolutionMessage, sendMetaMessage }")) {
  code = code.replace(
    "import { useAuth } from '../contexts/AuthContext';",
    "import { useAuth } from '../contexts/AuthContext';\nimport { openWhatsApp, sendEvolutionMessage, sendMetaMessage } from '../lib/whatsapp';"
  );
}

// 2. Replace handleSend
const oldHandleSendStart = "  const handleSend = async () => {";
const oldHandleSendEndPattern = "    }\n  };\n\n  if (loading) {";

const startIndex = code.indexOf(oldHandleSendStart);
const endIndex = code.indexOf(oldHandleSendEndPattern) + "    }\n  };\n".length;

if (startIndex === -1 || endIndex === -1) {
  console.log("Could not find handleSend boundaries in SuppliesForm");
  process.exit(1);
}

const newHandleSend = `  const handleSend = async () => {
    if (!client) {
      alert('Cliente não encontrado.');
      return;
    }

    const selected = supplies.filter(s => s.quantity && Number(s.quantity) > 0);
    if (selected.length === 0) {
      alert('Preencha a quantidade de pelo menos um insumo.');
      return;
    }

    const number = client.phone;
    if (!number) {
      alert('O cliente não possui um número de telefone cadastrado.');
      return;
    }

    const message = \`Olá *\${client.name}*, estamos precisando de alguns insumos para a manutenção da sua piscina:\\n\\n\` + 
      selected.map(s => \`• \${s.name}: \${s.quantity} \${s.unit}\`).join('\\n') + 
      \`\\n\\nPor favor, providencie assim que possível para não interrompermos o tratamento.\`;

    const settings = userProfile?.whatsappSettings || {};
    
    if (!settings.useMetaApi && !settings.useEvolutionApi) {
       openWhatsApp(number, message);
       navigate('/clients');
       return;
    }

    setSendingMessage(true);

    try {
      if (settings.useMetaApi) {
        await sendMetaMessage(number, message, settings);
        alert('Mensagem de insumos enviada com sucesso via Meta API!');
      } else if (settings.useEvolutionApi) {
        await sendEvolutionMessage(number, message, settings);
        alert('Mensagem de insumos enviada com sucesso via Evolution API!');
      }
      navigate('/clients');
    } catch (error: any) {
      console.error(error);
      alert('Falha ao enviar mensagem: ' + error.message);
    } finally {
      setSendingMessage(false);
    }
  };
`;

code = code.substring(0, startIndex) + newHandleSend + code.substring(endIndex);

fs.writeFileSync('src/pages/SuppliesForm.tsx', code);
console.log("Patched SuppliesForm handleSend");
