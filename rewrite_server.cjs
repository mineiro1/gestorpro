const fs = require('fs');

let content = fs.readFileSync('server.ts', 'utf8');

// We will do precise replacements

// 1. Evolution Webhook getCore restore
const evoRegex = /const matchedClient = clients\.find\(c => \{\s*const cp = \(c\.phone \|\| ''\)\.replace\(\/\\D\/g, ''\);\s*const lp = \(c\.local_phone \|\| ''\)\.replace\(\/\\D\/g, ''\);\s*return cp\.includes\(phone\) \|\| lp\.includes\(phone\) \|\| phone\.includes\(cp\) \|\| phone\.includes\(lp\);\s*\}\);/g;

const evoReplace = `const matchedClient = clients.find(c => {
         const cp = (c.phone || '').replace(/\\D/g, '');
         const lp = (c.local_phone || '').replace(/\\D/g, '');
         if (!cp && !lp) return false;
         
         const getCore = (num) => num.length >= 8 ? num.slice(-8) : num;
         const webhookCore = getCore(phone);
         
         let matchPhone = false;
         if (cp.length > 5) {
            matchPhone = cp.includes(phone) || phone.includes(cp) || getCore(cp) === webhookCore;
         }
         
         let matchLocal = false;
         if (lp.length > 5) {
            matchLocal = lp.includes(phone) || phone.includes(lp) || getCore(lp) === webhookCore;
         }
         
         return matchPhone || matchLocal;
      });`;
      
content = content.replace(evoRegex, evoReplace);


// 2. Chat push notification
const chatPushTarget = `                            title: 'Nova mensagem de ' + (session.client_name || 'Cliente'),
                            body: newMsg.message || 'Mensagem de texto'`;
const chatPushReplace = `                            title: 'Nova mensagem no Chat',
                            body: newMsg.content || 'Mensagem de texto'`;
content = content.replace(chatPushTarget, chatPushReplace);

// 3. Fix the visits notification in server.ts to be safe and use a cache
const visitsPushRegex = /let justFinalized = false;\s*if \(payload\.eventType === 'INSERT' && newVisit\.status === 'finalizada'\) \{\s*justFinalized = true;\s*\} else if \(payload\.eventType === 'UPDATE' && payload\.old && payload\.old\.status !== 'finalizada' && newVisit\.status === 'finalizada'\) \{\s*justFinalized = true;\s*\}/g;

const visitsPushReplace = `let justFinalized = false;
       if (newVisit.status === 'finalizada') {
           if (!global.notifiedVisits) global.notifiedVisits = new Set();
           if (!global.notifiedVisits.has(newVisit.id)) {
               global.notifiedVisits.add(newVisit.id);
               justFinalized = true;
               // Keep cache small
               if (global.notifiedVisits.size > 1000) global.notifiedVisits.clear();
           }
       }`;
content = content.replace(visitsPushRegex, visitsPushReplace);

// 4. Fix oneoffjobs notification similarly
const jobsPushRegex = /if \(payload\.old\.status !== 'concluido' && newJob\.status === 'concluido' && newJob\.admin_id && newJob\.admin_id !== newJob\.employee_id\) \{/g;
const jobsPushReplace = `if (newJob.status === 'concluido' && newJob.admin_id && newJob.admin_id !== newJob.employee_id) {
           if (!global.notifiedJobs) global.notifiedJobs = new Set();
           if (global.notifiedJobs.has(newJob.id)) return;
           global.notifiedJobs.add(newJob.id);
           if (global.notifiedJobs.size > 1000) global.notifiedJobs.clear();
`;
content = content.replace(jobsPushRegex, jobsPushReplace);

fs.writeFileSync('server.ts', content);
console.log("Rewrite completed.");
