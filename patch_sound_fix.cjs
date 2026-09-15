const fs = require('fs');
let code = fs.readFileSync('src/components/Layout.tsx', 'utf-8');

const target = `                 showNotification('Nova Mensagem', \\\`\\\${cName} enviou uma nova mensagem no chat.\\\`);
              } else {
                 showNotification('Nova Mensagem', 'Você recebeu uma nova mensagem no chat.');
              }
            } catch(e) {
               showNotification('Nova Mensagem', 'Você recebeu uma nova mensagem no chat.');
            }`;

const replacement = `                 showNotification('Nova Mensagem', \\\`\\\${cName} enviou uma nova mensagem no chat.\\\`);
              } else {
                 showNotification('Nova Mensagem', 'Você recebeu uma nova mensagem no chat.');
              }
            } catch(e) {
               showNotification('Nova Mensagem', 'Você recebeu uma nova mensagem no chat.');
            }
            
            // Toca o som!
            try {
              const audio = new Audio('/notificacao.mp3');
              audio.play().catch(e => console.log("Audio play blocked by browser:", e));
            } catch (err) {}`;

if (code.includes(`                 showNotification('Nova Mensagem'`)) {
   // doing a more manual replace since the template literals might mess up string matching
   const splitCode = code.split("showNotification('Nova Mensagem', 'Você recebeu uma nova mensagem no chat.');");
   if(splitCode.length >= 3) {
      code = splitCode[0] + "showNotification('Nova Mensagem', 'Você recebeu uma nova mensagem no chat.');" + splitCode[1] + "showNotification('Nova Mensagem', 'Você recebeu uma nova mensagem no chat.');\n            try { const audio = new Audio('/notificacao.mp3'); audio.play().catch(e => {}); } catch(err){}" + splitCode[2];
      fs.writeFileSync('src/components/Layout.tsx', code);
      console.log("Sound patched!");
   } else {
      console.log("Could not split reliably.");
   }
}
