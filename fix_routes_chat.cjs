const fs = require('fs');

let layout = fs.readFileSync('src/pages/RoutesPage.tsx', 'utf8');

const target = `    try {
      const { data: existingVisit } = await supabase.from('visits')
        .select('id, status')
        .eq('client_id', client.id)
        .eq('date', routeDate)
        .limit(1);`;
        
const replacement = `    try {
      const { data: existingVisit } = await supabase.from('visits')
        .select('id, status')
        .eq('client_id', client.id)
        .or(\`date.like.\${routeDate}%,time.eq.\${routeDate}\`)
        .order('created_at', { ascending: false })
        .limit(1);`;

if (layout.includes(target)) {
    layout = layout.replace(target, replacement);
    fs.writeFileSync('src/pages/RoutesPage.tsx', layout);
    console.log("Success");
} else {
    console.log("Target not found");
}
