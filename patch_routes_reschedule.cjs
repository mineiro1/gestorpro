const fs = require('fs');
let code = fs.readFileSync('src/pages/RoutesPage.tsx', 'utf-8');

// 1. Modify handleAnticipate
const oldAnticipate = `        if (client.isOneOffJob) {
          const updates: any = { updated_at: new Date().toISOString() };
          if (client.return_date === routeDate) {
            updates.return_date = today;
          } else {
            updates.date = today;
          }
          await supabase.from('oneoffjobs').update(updates).eq('id', client.id);
        } else {
          const extraVisits = client.extra_visits || [];
          if (!extraVisits.includes(today)) {
            await supabase.from('clients').update({
              extra_visits: [...extraVisits, today]
            }).eq('id', client.id);
          }
        }`;

const newAnticipate = `        if (client.isOneOffJob) {
          const updates: any = { updated_at: new Date().toISOString() };
          if (client.return_date === routeDate) {
            updates.return_date = today;
          } else {
            updates.date = today;
          }
          await supabase.from('oneoffjobs').update(updates).eq('id', client.id);
        } else {
          const extraVisits = client.extra_visits || [];
          const newEntry = today + ':from:' + (routeDate || today);
          if (!extraVisits.includes(newEntry) && !extraVisits.includes(today)) {
            await supabase.from('clients').update({
              extra_visits: [...extraVisits, newEntry]
            }).eq('id', client.id);
          }
        }`;

code = code.replace(oldAnticipate, newAnticipate);

// 2. Add handlePostpone right after handleAnticipate
const anticipateEnd = `    } finally {
      setAnticipating(false);
    }
  };`;

const postponeCode = `
  const handlePostpone = async () => {
    if (selectedForAnticipation.size === 0) return;
    if (!confirm('Deseja adiar as visitas dos clientes selecionados para amanhã? Eles passarão a aparecer na rota de amanhã.')) return;
    
    setAnticipating(true);
    const tomorrowDate = new Date();
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    
    // Convert to ISO local
    tomorrowDate.setMinutes(tomorrowDate.getMinutes() - tomorrowDate.getTimezoneOffset());
    const tomorrowStr = tomorrowDate.toISOString().split('T')[0];
    
    try {
      for (const clientId of selectedForAnticipation) {
        const client = routeClients.find(c => c.id === clientId);
        if (!client) continue;

        if (client.isOneOffJob) {
          const updates: any = { updated_at: new Date().toISOString() };
          if (client.return_date === routeDate) {
            updates.return_date = tomorrowStr;
          } else {
            updates.date = tomorrowStr;
          }
          await supabase.from('oneoffjobs').update(updates).eq('id', client.id);
        } else {
          const extraVisits = client.extra_visits || [];
          const newEntry = tomorrowStr + ':from:' + (routeDate || getLocalISODate());
          if (!extraVisits.includes(newEntry) && !extraVisits.includes(tomorrowStr)) {
            await supabase.from('clients').update({
              extra_visits: [...extraVisits, newEntry]
            }).eq('id', client.id);
          }
        }
      }
      alert('Visitas adiadas com sucesso!');
      setSelectedForAnticipation(new Set());
    } catch (error) {
      console.error(error);
      alert('Erro ao tentar adiar visitas.');
    } finally {
      setAnticipating(false);
    }
  };
`;

code = code.replace(anticipateEnd, anticipateEnd + postponeCode);

fs.writeFileSync('src/pages/RoutesPage.tsx', code);
console.log("Patched handlers");
