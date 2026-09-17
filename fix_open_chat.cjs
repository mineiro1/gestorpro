const fs = require('fs');

let layout = fs.readFileSync('src/pages/RoutesPage.tsx', 'utf8');

layout = layout.replace(
  `    let visitId = null;
    const adminId = isAdmin ? userProfile.uid : userProfile.adminId;
    
    try {
      const { data: existingVisit } = await supabase.from('visits')
        .select('id, status')
        .eq('client_id', client.id)
        .eq('date', routeDate)
        .limit(1);
        
      if (existingVisit && existingVisit.length > 0) {
         visitId = existingVisit[0].id;
         var visitStatus = existingVisit[0].status;
         console.log("Found existing visit:", visitId);`,
  `    let visitId = null;
    const adminId = isAdmin ? userProfile.uid : userProfile.adminId;
    
    try {
      const { data: existingVisit } = await supabase.from('visits')
        .select('id, status')
        .eq('client_id', client.id)
        .or(\`date.like.\${routeDate}%,time.eq.\${routeDate}\`)
        .order('created_at', { ascending: false })
        .limit(1);
        
      if (existingVisit && existingVisit.length > 0) {
         visitId = existingVisit[0].id;
         var visitStatus = existingVisit[0].status;
         console.log("Found existing visit:", visitId);`
);

fs.writeFileSync('src/pages/RoutesPage.tsx', layout);
console.log("RoutesPage fixed!");
