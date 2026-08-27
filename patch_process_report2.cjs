const fs = require('fs');
let code = fs.readFileSync('src/pages/RoutesPage.tsx', 'utf-8');

const regex = /const processReportSubmission = async \(sendWhatsApp: boolean\) => \{[\s\S]*?setConfirmSendReportPopupOpen\(false\);\n\s*setSubmittingReport\(true\);/;

const replacement = `const processReportSubmission = async (sendWhatsApp: boolean) => {
    setConfirmSendReportPopupOpen(false);
    setSubmittingReport(true);

    const handleWhatsApp = async () => {
      if (sendWhatsApp) {
        if (selectedClientForReport?.phone) {
          const clientName = selectedClientForReport.name;
          const clientPhone = selectedClientForReport.phone;
          const cleanPhone = clientPhone.replace(/\\D/g, '');
          
          try {
            const adminId = isAdmin ? userProfile.uid : userProfile.adminId;
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            
            let useMessage2 = false;
            if (navigator.onLine) {
              const { data: recentVisits } = await supabase.from('visits')
                .select('date')
                .eq('client_id', selectedClientForReport.id)
                .eq('admin_id', adminId)
                .gte('date', thirtyDaysAgo.toISOString())
                .limit(1);
              if (recentVisits && recentVisits.length > 0) {
                useMessage2 = true;
              }
            }
            
            const waSettings = userProfile?.whatsappSettings || {};
            const msg1 = waSettings.reportMessage1 || \`Olá {nome},\\n\\nO atendimento da sua piscina foi finalizado! Você pode acessar o nosso painel para acompanhar todas as informações do tratamento.\\n\\nAcesse: https://www.zapmass.app.br/client-panel\\nLogin: {telefone}\\nSenha: {telefone}\`;
            const msg2 = waSettings.reportMessage2 || \`Olá {nome},\\n\\nO atendimento da sua piscina foi finalizado! Verifique as informações completas no nosso painel de clientes.\\n\\nAcesse: https://www.zapmass.app.br/client-panel\`;
            
            let message = useMessage2 ? msg2 : msg1;
            message = message.replace(/{nome}/g, clientName).replace(/{telefone}/g, cleanPhone);
            
            if (waSettings.useMetaApi) {
              await sendMetaMessage(clientPhone, message, waSettings);
              // Não bloqueia a tela com alert
            } else if (waSettings.useEvolutionApi) {
              await sendEvolutionMessage(clientPhone, message, waSettings);
              // Não bloqueia a tela com alert
            } else {
              openWhatsApp(clientPhone, message);
            }
          } catch (err: any) {
            console.error('Erro ao enviar mensagem via API WhatsApp:', err);
          }
        } else {
          console.warn('Este cliente não possui um número de telefone cadastrado para o envio do WhatsApp.');
        }
      }
    };

    // Dispara em segundo plano para não travar a UI de finalização da visita
    handleWhatsApp();`;

if (regex.test(code)) {
  code = code.replace(regex, replacement);
  fs.writeFileSync('src/pages/RoutesPage.tsx', code);
  console.log("processReportSubmission successfully patched.");
} else {
  console.log("Could not find regex target.");
}
