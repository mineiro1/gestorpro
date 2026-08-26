const fs = require('fs');
let code = fs.readFileSync('src/pages/RoutesPage.tsx', 'utf-8');

const badInjection = `
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

code = code.replace(badInjection, ''); // removes the first one

fs.writeFileSync('src/pages/RoutesPage.tsx', code);
console.log("Fixed incorrectly injected code");
