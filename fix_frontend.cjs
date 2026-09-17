const fs = require('fs');

// ROUTES PAGE
let routes = fs.readFileSync('src/pages/RoutesPage.tsx', 'utf8');

const routesSaveTarget = `            const { error: oneOffError } = await supabase.from('oneoffjobs').update({
              status: needsReturn ? 'em_andamento' : 'concluido',
              return_date: needsReturn ? returnDate : null,
              report: finalNotes,
              updated_at: finalVisitDate
            }).eq('id', selectedClientForReport.id);
            if (oneOffError) throw oneOffError;`;

const routesSaveReplace = `            const { error: oneOffError } = await supabase.from('oneoffjobs').update({
              status: needsReturn ? 'em_andamento' : 'concluido',
              return_date: needsReturn ? returnDate : null,
              report: finalNotes,
              updated_at: finalVisitDate
            }).eq('id', selectedClientForReport.id);
            if (oneOffError) throw oneOffError;
            
            if (!needsReturn) {
              await supabase.from('chat_sessions').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('client_id', selectedClientForReport.id).eq('status', 'open');
            }`;

routes = routes.replace(routesSaveTarget, routesSaveReplace);

const routesSaveTarget2 = `              const { error } = await supabase.from('visits').update({
                date: finalVisitDate,
                time: activeRouteDate,
                notes: finalNotes,
                photo_urls: reportPhotos,
                location: locationData,
                status: 'finalizada'
              }).eq('id', existingAgendada[0].id);
              insertError = error;
            } else {
              const { error } = await supabase.from('visits').insert({
                admin_id: adminId,
                client_id: selectedClientForReport.id,
                employee_id: payload.employeeId,
                date: finalVisitDate,
                time: activeRouteDate,
                notes: finalNotes,
                photo_urls: reportPhotos,
                location: locationData,
                status: 'finalizada'
              });
              insertError = error;
            }`;

const routesSaveReplace2 = `              const { error } = await supabase.from('visits').update({
                date: finalVisitDate,
                time: activeRouteDate,
                notes: finalNotes,
                photo_urls: reportPhotos,
                location: locationData,
                status: 'finalizada'
              }).eq('id', existingAgendada[0].id);
              insertError = error;
            } else {
              const { error } = await supabase.from('visits').insert({
                admin_id: adminId,
                client_id: selectedClientForReport.id,
                employee_id: payload.employeeId,
                date: finalVisitDate,
                time: activeRouteDate,
                notes: finalNotes,
                photo_urls: reportPhotos,
                location: locationData,
                status: 'finalizada'
              });
              insertError = error;
            }
            
            if (!needsReturn) {
              await supabase.from('chat_sessions').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('client_id', selectedClientForReport.id).eq('status', 'open');
            }`;

routes = routes.replace(routesSaveTarget2, routesSaveReplace2);
fs.writeFileSync('src/pages/RoutesPage.tsx', routes);

// ONEOFFJOBS PAGE
let jobs = fs.readFileSync('src/pages/OneOffJobs.tsx', 'utf8');

const jobsTarget = `    try {
      const { error } = await supabase.from('oneoffjobs').update({ status: 'concluido' }).eq('id', id);
      if (error) throw error;
      await fetchJobs();`;
      
const jobsReplace = `    try {
      const job = jobs.find(j => j.id === id);
      const { error } = await supabase.from('oneoffjobs').update({ status: 'concluido' }).eq('id', id);
      if (error) throw error;
      if (job?.client_id) {
         await supabase.from('chat_sessions').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('client_id', job.client_id).eq('status', 'open');
      }
      await fetchJobs();`;

jobs = jobs.replace(jobsTarget, jobsReplace);
fs.writeFileSync('src/pages/OneOffJobs.tsx', jobs);

console.log("Frontend patched!");
