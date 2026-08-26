const fs = require('fs');
let code = fs.readFileSync('src/pages/RoutesPage.tsx', 'utf-8');

// Add states
code = code.replace(
  "const [checklist, setChecklist] = useState({",
  `const [parameters, setParameters] = useState({ cloro: '', ph: '', alcalinidade: '', acidoCianurico: '' });
  const [products, setProducts] = useState({ cloroGranulado: false, algicida: false, clarificante: false, barrilha: false, sulfato: false, elevadorAlcalinidade: false });
  const [checklist, setChecklist] = useState({`
);

// Add state reset
code = code.replace(
  "setChecklist({ peneirar: false, escovar: false, aspirar: false, lavarFiltro: false, lavarCapa: false, limparBordas: false, decantar: false, motorLigado: false });",
  `setChecklist({ peneirar: false, escovar: false, aspirar: false, lavarFiltro: false, lavarCapa: false, limparBordas: false, decantar: false, motorLigado: false });
    setParameters({ cloro: '', ph: '', alcalinidade: '', acidoCianurico: '' });
    setProducts({ cloroGranulado: false, algicida: false, clarificante: false, barrilha: false, sulfato: false, elevadorAlcalinidade: false });`
);

// Add to finalNotes
const oldFinalNotes = `const checklistText = checkedItems.length > 0 ? \`\\n\\nTarefas realizadas:\\n- \${checkedItems.join('\\n- ')}\` : '';
      const finalNotes = reportNotes.trim() + checklistText;`;

const newFinalNotes = `const checklistText = checkedItems.length > 0 ? \`\\n\\nTarefas realizadas:\\n- \${checkedItems.join('\\n- ')}\` : '';
      
      const paramItems = [];
      if (parameters.cloro) paramItems.push(\`Cloro: \${parameters.cloro}\`);
      if (parameters.ph) paramItems.push(\`pH: \${parameters.ph}\`);
      if (parameters.alcalinidade) paramItems.push(\`Alcalinidade: \${parameters.alcalinidade}\`);
      if (parameters.acidoCianurico) paramItems.push(\`Ácido Cianúrico: \${parameters.acidoCianurico}\`);
      const paramText = paramItems.length > 0 ? \`\\n\\nParâmetros da Água:\\n- \${paramItems.join('\\n- ')}\` : '';
      
      const prodItems = [];
      if (products.cloroGranulado) prodItems.push('Cloro Granulado');
      if (products.algicida) prodItems.push('Algicida');
      if (products.clarificante) prodItems.push('Clarificante');
      if (products.barrilha) prodItems.push('Barrilha');
      if (products.sulfato) prodItems.push('Sulfato');
      if (products.elevadorAlcalinidade) prodItems.push('Elevador de Alcalinidade');
      const prodText = prodItems.length > 0 ? \`\\n\\nProdutos Utilizados:\\n- \${prodItems.join('\\n- ')}\` : '';

      const finalNotes = reportNotes.trim() + checklistText + paramText + prodText;`;

code = code.replace(oldFinalNotes, newFinalNotes);

fs.writeFileSync('src/pages/RoutesPage.tsx', code);
console.log("Patched states and logic");
