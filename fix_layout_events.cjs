const fs = require('fs');
let content = fs.readFileSync('src/components/Layout.tsx', 'utf8');

// Modify handleNewVisit to only notify if status is finalizada
const target = `    const handleNewVisit = async (payload: any) => {
      if (payload.new) {
        const isAdminOwner = userProfile.role === 'admin' && payload.new.admin_id === userProfile.uid;
        const isSelf = payload.new.employee_id === userProfile.uid;

        if (isAdminOwner && !isSelf) {`;

const replace = `    const handleNewVisit = async (payload: any) => {
      if (payload.new) {
        // Only trigger if it's explicitly finalizada
        const isNowFinalizada = payload.new.status === 'finalizada';
        const wasNotFinalizada = payload.old ? payload.old.status !== 'finalizada' : true;
        
        if (!isNowFinalizada || !wasNotFinalizada) return;
        
        const isAdminOwner = userProfile.role === 'admin' && payload.new.admin_id === userProfile.uid;
        const isSelf = payload.new.employee_id === userProfile.uid;

        if (isAdminOwner && !isSelf) {`;

content = content.replace(target, replace);

// And we must change the listener for visits to watch for UPDATE too
const oldListen = `.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'visits' }, handleNewVisit)`;
const newListen = `.on('postgres_changes', { event: '*', schema: 'public', table: 'visits' }, handleNewVisit)`;

content = content.replace(oldListen, newListen);

fs.writeFileSync('src/components/Layout.tsx', content);
console.log("Layout.tsx patched!");
