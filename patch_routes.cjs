const fs = require('fs');
let code = fs.readFileSync('src/pages/RoutesPage.tsx', 'utf-8');

// 1. Add finalNotes logic
const finalVisitDateLine = "const activeRouteDate = routeDate || getLocalISODate();";
const finalNotesLogic = `
      const checkedItems = [];
      if (checklist.peneirar) checkedItems.push('Peneirar');
      if (checklist.escovar) checkedItems.push('Escovar Paredes');
      if (checklist.aspirar) checkedItems.push('Aspirar');
      if (checklist.lavarFiltro) checkedItems.push('Lavar o Filtro');
      if (checklist.lavarCapa) checkedItems.push('Lavar Capa');
      if (checklist.limparBordas) checkedItems.push('Limpar Bordas');
      
      const checklistText = checkedItems.length > 0 ? \`\\n\\nTarefas realizadas:\\n- \${checkedItems.join('\\n- ')}\` : '';
      const finalNotes = reportNotes.trim() + checklistText;
`;

code = code.replace(finalVisitDateLine, finalVisitDateLine + "\n" + finalNotesLogic);

// 2. Replace reportNotes.trim() with finalNotes in payload, oneoffjobs and visits
code = code.replace(/notes: reportNotes\.trim\(\),/g, "notes: finalNotes,");
code = code.replace(/report: reportNotes\.trim\(\),/g, "report: finalNotes,");

// 3. Fix the disabled condition on the submit button
const oldDisabled = "disabled={submittingReport || !reportNotes.trim() || !checklist.peneirar || !checklist.escovar || !checklist.aspirar || !checklist.lavarFiltro || !checklist.lavarCapa || !checklist.limparBordas}";
const newDisabled = "disabled={submittingReport || !reportNotes.trim() || !(checklist.peneirar || checklist.escovar || checklist.aspirar || checklist.lavarFiltro || checklist.lavarCapa || checklist.limparBordas)}";

code = code.replace(oldDisabled, newDisabled);

fs.writeFileSync('src/pages/RoutesPage.tsx', code);
console.log("Patched successfully");
