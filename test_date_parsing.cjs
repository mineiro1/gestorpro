const created = new Date('2026-09-18T01:33:55.874429+00:00').getTime();
const now = new Date('2026-09-18T02:55:40.241101+00:00').getTime();
console.log("Diff:", now - created);
console.log("30 min:", 30 * 60 * 1000);
console.log("Condition:", now - created > 30 * 60 * 1000);
