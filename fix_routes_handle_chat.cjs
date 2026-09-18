const fs = require('fs');
let code = fs.readFileSync('src/pages/RoutesPage.tsx', 'utf8');

const regex = /const handleOpenChat = async \([^]*?setChatModalOpen\(true\);/;

const replacement = `const handleOpenChat = async (client: any, isCompleted: boolean, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }

    const now = new Date();
    const todayStr = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
    
    if (routeDate && routeDate !== todayStr) {
       alert('O chat não pode ser iniciado. A data da visita não é a data de hoje.');
       return;
    }

    if (isCompleted) {
       alert('A visita já foi finalizada. O chat está inativo.');
       return;
    }

    const { data: existingSessions } = await supabase.from('chat_sessions')
        .select('id, status, created_at')
        .eq('client_id', client.id)
        .gte('created_at', \`\${todayStr}T00:00:00.000Z\`)
        .order('created_at', { ascending: false });

    let hasOpenSession = false;
    if (existingSessions && existingSessions.length > 0) {
        const sess = existingSessions[0];
        if (sess.status === 'open') {
            const sessTime = new Date(sess.created_at).getTime();
            if (now.getTime() - sessTime > 30 * 60 * 1000) {
                alert('O tempo de 30 minutos já expirou. O chat está inativo.');
                return;
            }
            hasOpenSession = true;
        } else {
            alert('A sessão de chat para hoje já foi encerrada ou expirou. O chat está inativo.');
            return;
        }
    }

    if (!hasOpenSession) {
        if (!window.confirm(\`Gostaria de iniciar o chat com o cliente \${client.name}?\`)) {
            return;
        }
    }

    setActiveChatClient(client);
    setChatModalOpen(true);`;

if (regex.test(code)) {
    code = code.replace(regex, replacement);
    fs.writeFileSync('src/pages/RoutesPage.tsx', code);
    console.log("Success replacing via regex");
} else {
    console.log("Regex not found");
}
