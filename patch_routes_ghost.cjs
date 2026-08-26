const fs = require('fs');
let code = fs.readFileSync('src/pages/RoutesPage.tsx', 'utf-8');

const oldInsert = `            const { error: insertError } = await supabase.from('visits').insert({
              admin_id: adminId,
              client_id: selectedClientForReport.id,
              employee_id: payload.employeeId,
              date: finalVisitDate,
              time: activeRouteDate,
              notes: finalNotes,
              photo_urls: reportPhotos,
              location: locationData
            });
            
            if (insertError) throw insertError;`;

const newInsert = `            const { error: insertError } = await supabase.from('visits').insert({
              admin_id: adminId,
              client_id: selectedClientForReport.id,
              employee_id: payload.employeeId,
              date: finalVisitDate,
              time: activeRouteDate,
              notes: finalNotes,
              photo_urls: reportPhotos,
              location: locationData
            });
            
            if (insertError) throw insertError;
            
            // Check if this visit was rescheduled from another date
            try {
              const extraVisitsRaw = selectedClientForReport.extra_visits || [];
              const targetStr = activeRouteDate + ':from:';
              const rescheduleEntry = extraVisitsRaw.find((v: string) => typeof v === 'string' && v.startsWith(targetStr));
              if (rescheduleEntry) {
                 const originalDate = rescheduleEntry.split(':from:')[1];
                 if (originalDate) {
                   await supabase.from('visits').insert({
                     admin_id: adminId,
                     client_id: selectedClientForReport.id,
                     employee_id: payload.employeeId,
                     date: finalVisitDate,
                     time: originalDate, // Setting time to originalDate makes it show up as completed for that original route
                     notes: \`[SERVIÇO REALIZADO NO DIA \${activeRouteDate.split('-').reverse().join('/')}]\\n\\n\` + finalNotes,
                     photo_urls: reportPhotos,
                     location: locationData
                   });
                   
                   // Clean up the extra_visit entry
                   const newExtraVisits = extraVisitsRaw.filter((v: string) => v !== rescheduleEntry);
                   await supabase.from('clients').update({ extra_visits: newExtraVisits }).eq('id', selectedClientForReport.id);
                 }
              }
            } catch(e) {
               console.error("Error saving ghost visit", e);
            }`;

code = code.replace(oldInsert, newInsert);
fs.writeFileSync('src/pages/RoutesPage.tsx', code);
console.log("Patched ghost insert");
