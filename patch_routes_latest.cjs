const fs = require('fs');
let code = fs.readFileSync('src/pages/RoutesPage.tsx', 'utf-8');

// 1. Products state definition
code = code.replace(
  "const [products, setProducts] = useState({ cloroGranulado: false, algicida: false, clarificante: false, barrilha: false, sulfato: false, elevadorAlcalinidade: false });",
  "const [products, setProducts] = useState({ cloroGranulado: false, algicida: false, clarificante: false, barrilha: false, sulfatoAluminio: false, elevadorAlcalinidade: false, sulfatoCobre: false, redutorPh: false, peroxidoHidrogenio: false, hipoclorito: false, cloroPastilha: false });"
);

// Products state reset
code = code.replace(
  "setProducts({ cloroGranulado: false, algicida: false, clarificante: false, barrilha: false, sulfato: false, elevadorAlcalinidade: false });",
  "setProducts({ cloroGranulado: false, algicida: false, clarificante: false, barrilha: false, sulfatoAluminio: false, elevadorAlcalinidade: false, sulfatoCobre: false, redutorPh: false, peroxidoHidrogenio: false, hipoclorito: false, cloroPastilha: false });"
);

// 2. Checklist state definition
code = code.replace(
  /motorLigado: false\s*\}\);/,
  "motorLigado: false,\n    ausente: false\n  });"
);

// Checklist state reset
code = code.replace(
  "setChecklist({ peneirar: false, escovar: false, aspirar: false, lavarFiltro: false, lavarCapa: false, limparBordas: false, decantar: false, motorLigado: false });",
  "setChecklist({ peneirar: false, escovar: false, aspirar: false, lavarFiltro: false, lavarCapa: false, limparBordas: false, decantar: false, motorLigado: false, ausente: false });"
);

// 3. Checklist text generation
code = code.replace(
  "if (checklist.motorLigado) checkedItems.push('O motor ficou ligado filtrando');",
  "if (checklist.motorLigado) checkedItems.push('O motor ficou ligado filtrando');\n      if (checklist.ausente) checkedItems.push('Cliente ausente, não foi possivel executar o serviço.');"
);

// 4. Products text generation
const oldProdGen = `      const prodItems = [];
      if (products.cloroGranulado) prodItems.push('Cloro Granulado');
      if (products.algicida) prodItems.push('Algicida');
      if (products.clarificante) prodItems.push('Clarificante');
      if (products.barrilha) prodItems.push('Barrilha');
      if (products.sulfato) prodItems.push('Sulfato');
      if (products.elevadorAlcalinidade) prodItems.push('Elevador de Alcalinidade');`;

const newProdGen = `      const prodItems = [];
      if (products.cloroGranulado) prodItems.push('Cloro Granulado');
      if (products.algicida) prodItems.push('Algicida');
      if (products.clarificante) prodItems.push('Clarificante');
      if (products.barrilha) prodItems.push('Barrilha');
      if (products.sulfatoAluminio) prodItems.push('Sulfato de alumínio');
      if (products.elevadorAlcalinidade) prodItems.push('Elevador de Alcalinidade');
      if (products.sulfatoCobre) prodItems.push('Sulfato de cobre');
      if (products.redutorPh) prodItems.push('Redutor de pH');
      if (products.peroxidoHidrogenio) prodItems.push('Peróxido de Hidrogênio');
      if (products.hipoclorito) prodItems.push('Hipoclorito');
      if (products.cloroPastilha) prodItems.push('Cloro Pastilha');`;

code = code.replace(oldProdGen, newProdGen);

// 5 & 6. Update UI
const uiOld = `                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="checkbox" checked={checklist.motorLigado} onChange={e => setChecklist({...checklist, motorLigado: e.target.checked})} className="w-4 h-4 text-primary rounded focus:ring-primary border-gray-300" />
                    <span className="text-gray-700 text-sm">Motor Ligado</span>
                  </label>
                </div>
              </div>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Parâmetros Físico-Químicos da Água</label>
                <div className="grid grid-cols-2 gap-3 bg-blue-50 p-3 rounded-lg border border-blue-100">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Cloro (ppm)</label>
                    <input type="text" placeholder="Ex: 2.0" value={parameters.cloro} onChange={e => setParameters({...parameters, cloro: e.target.value})} className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:ring-primary focus:border-primary outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">pH</label>
                    <input type="text" placeholder="Ex: 7.2" value={parameters.ph} onChange={e => setParameters({...parameters, ph: e.target.value})} className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:ring-primary focus:border-primary outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Alcalinidade</label>
                    <input type="text" placeholder="Ex: 100" value={parameters.alcalinidade} onChange={e => setParameters({...parameters, alcalinidade: e.target.value})} className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:ring-primary focus:border-primary outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Ácido Cianúrico</label>
                    <input type="text" placeholder="Ex: 40" value={parameters.acidoCianurico} onChange={e => setParameters({...parameters, acidoCianurico: e.target.value})} className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:ring-primary focus:border-primary outline-none" />
                  </div>
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Produtos Utilizados</label>
                <div className="grid grid-cols-2 gap-2 bg-green-50 p-3 rounded-lg border border-green-100">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="checkbox" checked={products.cloroGranulado} onChange={e => setProducts({...products, cloroGranulado: e.target.checked})} className="w-4 h-4 text-green-600 rounded focus:ring-green-500 border-gray-300" />
                    <span className="text-gray-700 text-sm">Cloro Granulado</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="checkbox" checked={products.algicida} onChange={e => setProducts({...products, algicida: e.target.checked})} className="w-4 h-4 text-green-600 rounded focus:ring-green-500 border-gray-300" />
                    <span className="text-gray-700 text-sm">Algicida</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="checkbox" checked={products.clarificante} onChange={e => setProducts({...products, clarificante: e.target.checked})} className="w-4 h-4 text-green-600 rounded focus:ring-green-500 border-gray-300" />
                    <span className="text-gray-700 text-sm">Clarificante</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="checkbox" checked={products.barrilha} onChange={e => setProducts({...products, barrilha: e.target.checked})} className="w-4 h-4 text-green-600 rounded focus:ring-green-500 border-gray-300" />
                    <span className="text-gray-700 text-sm">Barrilha</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="checkbox" checked={products.sulfato} onChange={e => setProducts({...products, sulfato: e.target.checked})} className="w-4 h-4 text-green-600 rounded focus:ring-green-500 border-gray-300" />
                    <span className="text-gray-700 text-sm">Sulfato</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="checkbox" checked={products.elevadorAlcalinidade} onChange={e => setProducts({...products, elevadorAlcalinidade: e.target.checked})} className="w-4 h-4 text-green-600 rounded focus:ring-green-500 border-gray-300" />
                    <span className="text-gray-700 text-sm">Elevador de Alc.</span>
                  </label>
                </div>
              </div>`;

const uiNew = `                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="checkbox" checked={checklist.motorLigado} onChange={e => setChecklist({...checklist, motorLigado: e.target.checked})} className="w-4 h-4 text-primary rounded focus:ring-primary border-gray-300" />
                    <span className="text-gray-700 text-sm">Motor Ligado</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="checkbox" checked={checklist.ausente} onChange={e => setChecklist({...checklist, ausente: e.target.checked})} className="w-4 h-4 text-red-500 rounded focus:ring-red-500 border-gray-300" />
                    <span className="text-gray-700 text-sm font-medium">Ausente</span>
                  </label>
                </div>
              </div>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Parâmetros Físico-Químicos da Água</label>
                <div className="grid grid-cols-2 gap-3 bg-blue-50 p-3 rounded-lg border border-blue-100">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Cloro (ppm)</label>
                    <input type="text" placeholder="Ex: 2.0" value={parameters.cloro} onChange={e => setParameters({...parameters, cloro: e.target.value})} className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:ring-primary focus:border-primary outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">pH</label>
                    <input type="text" placeholder="Ex: 7.2" value={parameters.ph} onChange={e => setParameters({...parameters, ph: e.target.value})} className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:ring-primary focus:border-primary outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Alcalinidade</label>
                    <input type="text" placeholder="Ex: 100" value={parameters.alcalinidade} onChange={e => setParameters({...parameters, alcalinidade: e.target.value})} className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:ring-primary focus:border-primary outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Ácido Cianúrico</label>
                    <input type="text" placeholder="Ex: 40" value={parameters.acidoCianurico} onChange={e => setParameters({...parameters, acidoCianurico: e.target.value})} className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:ring-primary focus:border-primary outline-none" />
                  </div>
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Produtos Utilizados</label>
                <div className="grid grid-cols-2 gap-2 bg-green-50 p-3 rounded-lg border border-green-100">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="checkbox" checked={products.cloroGranulado} onChange={e => setProducts({...products, cloroGranulado: e.target.checked})} className="w-4 h-4 text-green-600 rounded focus:ring-green-500 border-gray-300" />
                    <span className="text-gray-700 text-sm">Cloro Granulado</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="checkbox" checked={products.cloroPastilha} onChange={e => setProducts({...products, cloroPastilha: e.target.checked})} className="w-4 h-4 text-green-600 rounded focus:ring-green-500 border-gray-300" />
                    <span className="text-gray-700 text-sm">Cloro Pastilha</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="checkbox" checked={products.algicida} onChange={e => setProducts({...products, algicida: e.target.checked})} className="w-4 h-4 text-green-600 rounded focus:ring-green-500 border-gray-300" />
                    <span className="text-gray-700 text-sm">Algicida</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="checkbox" checked={products.clarificante} onChange={e => setProducts({...products, clarificante: e.target.checked})} className="w-4 h-4 text-green-600 rounded focus:ring-green-500 border-gray-300" />
                    <span className="text-gray-700 text-sm">Clarificante</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="checkbox" checked={products.barrilha} onChange={e => setProducts({...products, barrilha: e.target.checked})} className="w-4 h-4 text-green-600 rounded focus:ring-green-500 border-gray-300" />
                    <span className="text-gray-700 text-sm">Barrilha</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="checkbox" checked={products.sulfatoAluminio} onChange={e => setProducts({...products, sulfatoAluminio: e.target.checked})} className="w-4 h-4 text-green-600 rounded focus:ring-green-500 border-gray-300" />
                    <span className="text-gray-700 text-sm">Sulfato de Alumínio</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="checkbox" checked={products.sulfatoCobre} onChange={e => setProducts({...products, sulfatoCobre: e.target.checked})} className="w-4 h-4 text-green-600 rounded focus:ring-green-500 border-gray-300" />
                    <span className="text-gray-700 text-sm">Sulfato de Cobre</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="checkbox" checked={products.elevadorAlcalinidade} onChange={e => setProducts({...products, elevadorAlcalinidade: e.target.checked})} className="w-4 h-4 text-green-600 rounded focus:ring-green-500 border-gray-300" />
                    <span className="text-gray-700 text-sm">Elevador de Alc.</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="checkbox" checked={products.redutorPh} onChange={e => setProducts({...products, redutorPh: e.target.checked})} className="w-4 h-4 text-green-600 rounded focus:ring-green-500 border-gray-300" />
                    <span className="text-gray-700 text-sm">Redutor de pH</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="checkbox" checked={products.peroxidoHidrogenio} onChange={e => setProducts({...products, peroxidoHidrogenio: e.target.checked})} className="w-4 h-4 text-green-600 rounded focus:ring-green-500 border-gray-300" />
                    <span className="text-gray-700 text-sm">Peróxido de Hid.</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="checkbox" checked={products.hipoclorito} onChange={e => setProducts({...products, hipoclorito: e.target.checked})} className="w-4 h-4 text-green-600 rounded focus:ring-green-500 border-gray-300" />
                    <span className="text-gray-700 text-sm">Hipoclorito</span>
                  </label>
                </div>
              </div>`;

code = code.replace(uiOld, uiNew);

// 7. Disabled Submit button
code = code.replace(
  "disabled={submittingReport || !reportNotes.trim() || !(checklist.peneirar || checklist.escovar || checklist.aspirar || checklist.lavarFiltro || checklist.lavarCapa || checklist.limparBordas || checklist.decantar || checklist.motorLigado)}",
  "disabled={submittingReport || !reportNotes.trim() || !(checklist.peneirar || checklist.escovar || checklist.aspirar || checklist.lavarFiltro || checklist.lavarCapa || checklist.limparBordas || checklist.decantar || checklist.motorLigado || checklist.ausente)}"
);

fs.writeFileSync('src/pages/RoutesPage.tsx', code);
console.log("Patched everything.");
