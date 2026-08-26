const fs = require('fs');
let code = fs.readFileSync('src/pages/RoutesPage.tsx', 'utf-8');

const checklistEnd = `                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="checkbox" checked={checklist.motorLigado} onChange={e => setChecklist({...checklist, motorLigado: e.target.checked})} className="w-4 h-4 text-primary rounded focus:ring-primary border-gray-300" />
                    <span className="text-gray-700 text-sm">Motor Ligado</span>
                  </label>
                </div>
              </div>`;

const newUI = `                  <label className="flex items-center space-x-2 cursor-pointer">
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

code = code.replace(checklistEnd, newUI);

fs.writeFileSync('src/pages/RoutesPage.tsx', code);
console.log("Patched UI");
