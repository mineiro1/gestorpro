const fs = require('fs');

let layout = fs.readFileSync('src/components/Layout.tsx', 'utf8');

layout = layout.replace(
  `        const isAdminOwner = userProfile.role === 'admin' && payload.new.admin_id === userProfile.uid;
        const isSelf = payload.new.employee_id === userProfile.uid;

        if (isAdminOwner && !isSelf) {
          try {
            const { data: empData } = await supabase.from('users').select('name').eq('id', payload.new.employee_id).single();
            const { data: cliData } = await supabase.from('clients').select('name').eq('id', payload.new.client_id).single();`,
  `        let admin_id = payload.new.admin_id;
        let employee_id = payload.new.employee_id;
        let client_id = payload.new.client_id;
        
        if (!admin_id || !employee_id || !client_id) {
           const { data: fetchVisit } = await supabase.from('visits').select('admin_id, employee_id, client_id').eq('id', payload.new.id).single();
           if (fetchVisit) {
              admin_id = admin_id || fetchVisit.admin_id;
              employee_id = employee_id || fetchVisit.employee_id;
              client_id = client_id || fetchVisit.client_id;
           }
        }

        const isAdminOwner = userProfile.role === 'admin' && admin_id === userProfile.uid;
        const isSelf = employee_id === userProfile.uid;

        if (isAdminOwner && !isSelf) {
          try {
            const { data: empData } = await supabase.from('users').select('name').eq('id', employee_id).single();
            const { data: cliData } = await supabase.from('clients').select('name').eq('id', client_id).single();`
);

fs.writeFileSync('src/components/Layout.tsx', layout);
console.log("Layout fixed!");
