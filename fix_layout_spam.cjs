const fs = require('fs');
let content = fs.readFileSync('src/components/Layout.tsx', 'utf8');

const importRegex = /import React, { useState, useEffect } from 'react';/;
content = content.replace(importRegex, "import React, { useState, useEffect, useRef } from 'react';");

const fnRegex = /const handleJobUpdate = async \(payload: any\) => \{/;
content = content.replace(fnRegex, `const notifiedJobsRef = useRef<Set<string>>(new Set());\n\n    const handleJobUpdate = async (payload: any) => {`);

const ifRegex = /if \(isAdminOwner && !isSelf && wasNotCompleted && isNowCompleted\) \{/;
content = content.replace(ifRegex, `if (isAdminOwner && !isSelf && isNowCompleted && !notifiedJobsRef.current.has(payload.new.id)) {
          notifiedJobsRef.current.add(payload.new.id);`);

fs.writeFileSync('src/components/Layout.tsx', content);
