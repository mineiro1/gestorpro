const fs = require('fs');
let code = fs.readFileSync('src/pages/RoutesPage.tsx', 'utf-8');

const oldUI = `              {(isAdmin || isManager) && routeDate > getLocalISODate() && routeClients.length > 0 && !isOrderingMode && (
                <button
                  onClick={handleAnticipate}
                  disabled={selectedForAnticipation.size === 0 || anticipating}
                  className="flex items-center bg-orange-500 text-white px-4 py-2 rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50"
                  title="Antecipar clientes selecionados para hoje"
                >
                  {anticipating ? 'Processando...' : \`Antecipar \${selectedForAnticipation.size > 0 ? \`(\${selectedForAnticipation.size})\` : ''} para Hoje\`}
                </button>
              )}`;

const newUI = `              {(isAdmin || isManager) && routeDate > getLocalISODate() && routeClients.length > 0 && !isOrderingMode && (
                <button
                  onClick={handleAnticipate}
                  disabled={selectedForAnticipation.size === 0 || anticipating}
                  className="flex items-center bg-orange-500 text-white px-4 py-2 rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50 text-sm whitespace-nowrap"
                  title="Antecipar clientes selecionados para hoje"
                >
                  {anticipating ? 'Processando...' : \`Antecipar \${selectedForAnticipation.size > 0 ? \`(\${selectedForAnticipation.size})\` : ''}\`}
                </button>
              )}
              {(isAdmin || isManager) && routeDate === getLocalISODate() && routeClients.length > 0 && !isOrderingMode && (
                <button
                  onClick={handlePostpone}
                  disabled={selectedForAnticipation.size === 0 || anticipating}
                  className="flex items-center bg-purple-500 text-white px-4 py-2 rounded-lg hover:bg-purple-600 transition-colors disabled:opacity-50 text-sm whitespace-nowrap"
                  title="Adiar clientes selecionados para amanhã"
                >
                  {anticipating ? 'Processando...' : \`Adiar \${selectedForAnticipation.size > 0 ? \`(\${selectedForAnticipation.size})\` : ''} p/ Amanhã\`}
                </button>
              )}`;

code = code.replace(oldUI, newUI);
fs.writeFileSync('src/pages/RoutesPage.tsx', code);
console.log("Patched UI button");
