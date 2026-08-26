const fs = require('fs');
let code = fs.readFileSync('src/pages/RoutesPage.tsx', 'utf-8');

// 1. Initial State
code = code.replace(
  `limparBordas: false`,
  `limparBordas: false,\n    decantar: false,\n    motorLigado: false`
);

// 2. Open Modal State Reset
code = code.replace(
  `setChecklist({ peneirar: false, escovar: false, aspirar: false, lavarFiltro: false, lavarCapa: false, limparBordas: false });`,
  `setChecklist({ peneirar: false, escovar: false, aspirar: false, lavarFiltro: false, lavarCapa: false, limparBordas: false, decantar: false, motorLigado: false });`
);

// 3. Checked Items Push
code = code.replace(
  `if (checklist.limparBordas) checkedItems.push('Limpar Bordas');`,
  `if (checklist.limparBordas) checkedItems.push('Limpar Bordas');\n      if (checklist.decantar) checkedItems.push('Decantar');\n      if (checklist.motorLigado) checkedItems.push('Motor Ligado');`
);

// 4. UI Checkboxes
const checkboxesBlock = `<div className="grid grid-cols-2 gap-2 bg-gray-50 p-3 rounded-lg border border-gray-200">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="checkbox" checked={checklist.peneirar} onChange={e => setChecklist({...checklist, peneirar: e.target.checked})} className="w-4 h-4 text-primary rounded focus:ring-primary border-gray-300" />
                    <span className="text-gray-700 text-sm">Peneirar</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="checkbox" checked={checklist.escovar} onChange={e => setChecklist({...checklist, escovar: e.target.checked})} className="w-4 h-4 text-primary rounded focus:ring-primary border-gray-300" />
                    <span className="text-gray-700 text-sm">Escovar Paredes</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="checkbox" checked={checklist.aspirar} onChange={e => setChecklist({...checklist, aspirar: e.target.checked})} className="w-4 h-4 text-primary rounded focus:ring-primary border-gray-300" />
                    <span className="text-gray-700 text-sm">Aspirar</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="checkbox" checked={checklist.lavarFiltro} onChange={e => setChecklist({...checklist, lavarFiltro: e.target.checked})} className="w-4 h-4 text-primary rounded focus:ring-primary border-gray-300" />
                    <span className="text-gray-700 text-sm">Lavar o Filtro</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="checkbox" checked={checklist.lavarCapa} onChange={e => setChecklist({...checklist, lavarCapa: e.target.checked})} className="w-4 h-4 text-primary rounded focus:ring-primary border-gray-300" />
                    <span className="text-gray-700 text-sm">Lavar Capa</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="checkbox" checked={checklist.limparBordas} onChange={e => setChecklist({...checklist, limparBordas: e.target.checked})} className="w-4 h-4 text-primary rounded focus:ring-primary border-gray-300" />
                    <span className="text-gray-700 text-sm">Limpar Bordas</span>
                  </label>
                </div>`;

const checkboxesBlockNew = `<div className="grid grid-cols-2 gap-2 bg-gray-50 p-3 rounded-lg border border-gray-200">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="checkbox" checked={checklist.peneirar} onChange={e => setChecklist({...checklist, peneirar: e.target.checked})} className="w-4 h-4 text-primary rounded focus:ring-primary border-gray-300" />
                    <span className="text-gray-700 text-sm">Peneirar</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="checkbox" checked={checklist.escovar} onChange={e => setChecklist({...checklist, escovar: e.target.checked})} className="w-4 h-4 text-primary rounded focus:ring-primary border-gray-300" />
                    <span className="text-gray-700 text-sm">Escovar Paredes</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="checkbox" checked={checklist.aspirar} onChange={e => setChecklist({...checklist, aspirar: e.target.checked})} className="w-4 h-4 text-primary rounded focus:ring-primary border-gray-300" />
                    <span className="text-gray-700 text-sm">Aspirar</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="checkbox" checked={checklist.lavarFiltro} onChange={e => setChecklist({...checklist, lavarFiltro: e.target.checked})} className="w-4 h-4 text-primary rounded focus:ring-primary border-gray-300" />
                    <span className="text-gray-700 text-sm">Lavar o Filtro</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="checkbox" checked={checklist.lavarCapa} onChange={e => setChecklist({...checklist, lavarCapa: e.target.checked})} className="w-4 h-4 text-primary rounded focus:ring-primary border-gray-300" />
                    <span className="text-gray-700 text-sm">Lavar Capa</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="checkbox" checked={checklist.limparBordas} onChange={e => setChecklist({...checklist, limparBordas: e.target.checked})} className="w-4 h-4 text-primary rounded focus:ring-primary border-gray-300" />
                    <span className="text-gray-700 text-sm">Limpar Bordas</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="checkbox" checked={checklist.decantar} onChange={e => setChecklist({...checklist, decantar: e.target.checked})} className="w-4 h-4 text-primary rounded focus:ring-primary border-gray-300" />
                    <span className="text-gray-700 text-sm">Decantar</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="checkbox" checked={checklist.motorLigado} onChange={e => setChecklist({...checklist, motorLigado: e.target.checked})} className="w-4 h-4 text-primary rounded focus:ring-primary border-gray-300" />
                    <span className="text-gray-700 text-sm">Motor Ligado</span>
                  </label>
                </div>`;

code = code.replace(checkboxesBlock, checkboxesBlockNew);

// 5. Disabled Condition
const disabledOld = `disabled={submittingReport || !reportNotes.trim() || !(checklist.peneirar || checklist.escovar || checklist.aspirar || checklist.lavarFiltro || checklist.lavarCapa || checklist.limparBordas)}`;
const disabledNew = `disabled={submittingReport || !reportNotes.trim() || !(checklist.peneirar || checklist.escovar || checklist.aspirar || checklist.lavarFiltro || checklist.lavarCapa || checklist.limparBordas || checklist.decantar || checklist.motorLigado)}`;

code = code.replace(disabledOld, disabledNew);

fs.writeFileSync('src/pages/RoutesPage.tsx', code);
console.log("Patched correctly");
