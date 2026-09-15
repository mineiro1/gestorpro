const fs = require('fs');
let content = fs.readFileSync('src/components/Layout.tsx', 'utf8');

content = content.replace("const notifiedJobsRef = useRef<Set<string>>(new Set());", "");

// Find `export default function Layout() {` and insert the ref there.
content = content.replace(
  "export default function Layout() {",
  "export default function Layout() {\n  const notifiedJobsRef = useRef<Set<string>>(new Set());"
);

fs.writeFileSync('src/components/Layout.tsx', content);
