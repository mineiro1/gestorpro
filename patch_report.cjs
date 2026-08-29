const fs = require('fs');

let code = fs.readFileSync('src/pages/RoutesPage.tsx', 'utf-8');

// Line 667
code = code.replace(
  'if (!selectedClientForReport || !userProfile || !reportNotes.trim()) return;',
  'if (!selectedClientForReport || !userProfile) return;'
);

// Line 1387 & 1389
code = code.replace(
  '<label className="block text-sm font-medium text-gray-700 mb-1">Observações da Visita *</label>',
  '<label className="block text-sm font-medium text-gray-700 mb-1">Observações da Visita</label>'
);

code = code.replace(
  `                <textarea
                  required
                  rows={4}
                  value={reportNotes}`,
  `                <textarea
                  rows={4}
                  value={reportNotes}`
);

// Line 1488
code = code.replace(
  'disabled={submittingReport || !reportNotes.trim() || !(checklist.peneirar || checklist.escovar || checklist.aspirar || checklist.lavarFiltro || checklist.lavarCapa || checklist.limparBordas || checklist.decantar || checklist.motorLigado || checklist.ausente)}',
  'disabled={submittingReport || !(checklist.peneirar || checklist.escovar || checklist.aspirar || checklist.lavarFiltro || checklist.lavarCapa || checklist.limparBordas || checklist.decantar || checklist.motorLigado || checklist.ausente)}'
);

fs.writeFileSync('src/pages/RoutesPage.tsx', code);
console.log('RoutesPage.tsx patched');
