const fs = require('fs');

let code = fs.readFileSync('src/pages/ClientPanel.tsx', 'utf-8');

const targetStr = `          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">`;
const replacementStr = `          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">`;

const currentSituationCard = `            <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 flex items-center">
              <div className="w-12 h-12 rounded-full bg-green-100 text-green-600 flex items-center justify-center mr-4">
                <CheckCircle size={24} />
              </div>
              <div>
                <p className="text-sm text-gray-500 font-medium">Situação Atual</p>
                <p className="text-lg font-bold text-gray-800">No sistema</p>
              </div>
            </div>`;

const newDaysCard = `            <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 flex items-center">
              <div className="w-12 h-12 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center mr-4">
                <Calendar size={24} />
              </div>
              <div>
                <p className="text-sm text-gray-500 font-medium">Dias de Visita</p>
                <p className="text-lg font-bold text-gray-800">
                  {clientData.visit_days && clientData.visit_days.length > 0 
                    ? clientData.visit_days.join(', ') 
                    : 'A combinar'}
                </p>
              </div>
            </div>`;

code = code.replace(targetStr, replacementStr);
code = code.replace(currentSituationCard, currentSituationCard + '\n\n' + newDaysCard);

fs.writeFileSync('src/pages/ClientPanel.tsx', code);
console.log('ClientPanel patched.');
