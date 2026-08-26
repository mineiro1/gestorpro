const fs = require('fs');
let code = fs.readFileSync('src/pages/RoutesPage.tsx', 'utf-8');

const oldFilter = `        let extraVisits = [];
        try { extraVisits = Array.isArray(client.extra_visits) ? client.extra_visits : (client.extra_visits ? JSON.parse(client.extra_visits) : []); } catch(e) {}
        
        const matchesDayOfWeek = selectedDay ? (visitDays.includes(selectedDay)) : false;
        const matchesExtraVisit = routeDate ? (extraVisits.includes(routeDate)) : false;
        return matchesDayOfWeek || matchesExtraVisit;
      });`;

const newFilter = `        let extraVisits = [];
        try { extraVisits = Array.isArray(client.extra_visits) ? client.extra_visits : (client.extra_visits ? JSON.parse(client.extra_visits) : []); } catch(e) {}
        
        const extraVisitsDates = extraVisits.map(v => typeof v === 'string' ? v.split(':from:')[0] : v);
        
        const matchesDayOfWeek = selectedDay ? (visitDays.includes(selectedDay)) : false;
        const matchesExtraVisit = routeDate ? (extraVisitsDates.includes(routeDate)) : false;
        return matchesDayOfWeek || matchesExtraVisit;
      });`;

code = code.replace(oldFilter, newFilter);

fs.writeFileSync('src/pages/RoutesPage.tsx', code);
console.log("Patched filter logic");
