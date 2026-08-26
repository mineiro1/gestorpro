const fs = require('fs');
let code = fs.readFileSync('src/pages/RoutesPage.tsx', 'utf-8');

const oldBlock = `      const checkedItems = [];
      if (checklist.peneirar) checkedItems.push('Peneirar');
      if (checklist.escovar) checkedItems.push('Escovar Paredes');
      if (checklist.aspirar) checkedItems.push('Aspirar');
      if (checklist.lavarFiltro) checkedItems.push('Lavar o Filtro');
      if (checklist.lavarCapa) checkedItems.push('Lavar Capa');
      if (checklist.limparBordas) checkedItems.push('Limpar Bordas');
      if (checklist.decantar) checkedItems.push('Decantar');
      if (checklist.motorLigado) checkedItems.push('Motor Ligado');`;

const newBlock = `      const checkedItems = [];
      if (checklist.peneirar) checkedItems.push('A piscina foi peneirada');
      if (checklist.escovar) checkedItems.push('As paredes da piscina foram escovadas');
      if (checklist.aspirar) checkedItems.push('A piscina foi aspirada');
      if (checklist.lavarFiltro) checkedItems.push('O filtro da piscina foi limpo');
      if (checklist.lavarCapa) checkedItems.push('A capa da piscina foi lavada');
      if (checklist.limparBordas) checkedItems.push('As bordas da piscina foram limpas');
      if (checklist.decantar) checkedItems.push('A piscina foi decantada');
      if (checklist.motorLigado) checkedItems.push('O motor ficou ligado filtrando');`;

code = code.replace(oldBlock, newBlock);

fs.writeFileSync('src/pages/RoutesPage.tsx', code);
console.log("Patched phrases correctly");
