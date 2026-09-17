const fs = require('fs');

let emp = fs.readFileSync('src/pages/Employees.tsx', 'utf8');
emp = emp.replace(
  `await supabase.from('chat_sessions').update({ visit_id: null }).in('visit_id', (await supabase.from('visits').select('id').eq('employee_id', employeeToHardDelete.id)).data?.map(v => v.id) || []);`,
  `const empVisits = await supabase.from('visits').select('id').eq('employee_id', employeeToHardDelete.id);
      if (empVisits.data && empVisits.data.length > 0) {
          await supabase.from('chat_sessions').update({ visit_id: null }).in('visit_id', empVisits.data.map(v => v.id));
      }`
);
fs.writeFileSync('src/pages/Employees.tsx', emp);

// Also verify ClientForm.tsx just in case
let cf = fs.readFileSync('src/pages/ClientForm.tsx', 'utf8');
cf = cf.replace(
  `await supabase.from('chat_sessions').update({ visit_id: null }).in('visit_id', toDelete);`,
  `if (toDelete && toDelete.length > 0) await supabase.from('chat_sessions').update({ visit_id: null }).in('visit_id', toDelete);`
);
fs.writeFileSync('src/pages/ClientForm.tsx', cf);
console.log("Empty IN fixed.");
