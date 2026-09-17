const fs = require('fs');
let content = fs.readFileSync('src/components/Layout.tsx', 'utf8');

const targetLayout = `        // Only trigger if it's explicitly finalizada
        const isNowFinalizada = payload.new.status === 'finalizada';
        const wasNotFinalizada = payload.old ? payload.old.status !== 'finalizada' : true;
        
        if (!isNowFinalizada || !wasNotFinalizada) return;`;

const replaceLayout = `        const isNowFinalizada = payload.new.status === 'finalizada';
        if (!isNowFinalizada) return;
        
        // Prevent duplicate notifications using a ref
        if (!notifiedVisitsRef.current) notifiedVisitsRef.current = new Set();
        if (notifiedVisitsRef.current.has(payload.new.id)) return;
        notifiedVisitsRef.current.add(payload.new.id);`;

content = content.replace(targetLayout, replaceLayout);

// Also we need to make sure notifiedVisitsRef is defined
if (!content.includes('notifiedVisitsRef = useRef')) {
    content = content.replace('const notifiedJobsRef = useRef<Set<string>>(new Set());', 'const notifiedJobsRef = useRef<Set<string>>(new Set());\n  const notifiedVisitsRef = useRef<Set<string>>(new Set());');
}

fs.writeFileSync('src/components/Layout.tsx', content);
console.log("Layout.tsx rewritten.");
