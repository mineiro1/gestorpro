const fs = require('fs');
let code = fs.readFileSync('src/pages/ClientPanel.tsx', 'utf-8');

const oldRenderNotes = code.match(/const renderNotes = \(notes: string\) => {[\s\S]*?};/)[0];

const newRenderNotes = `
const renderNotes = (notes: string) => {
  if (!notes) return null;
  
  // Extract main notes (before any of our inserted sections)
  let mainNotes = notes;
  let tarefas = [];
  let parametros = [];
  let produtos = [];

  const extractSection = (text, header) => {
    const headerStr = \`\\n\\n\${header}:\\n- \`;
    const startIdx = text.indexOf(headerStr);
    if (startIdx === -1) return { extracted: [], remaining: text };
    
    // Find the end of this section (the next \n\n)
    const endIdx = text.indexOf('\\n\\n', startIdx + headerStr.length);
    const content = endIdx === -1 ? text.substring(startIdx + headerStr.length) : text.substring(startIdx + headerStr.length, endIdx);
    const remaining = text.substring(0, startIdx) + (endIdx === -1 ? '' : text.substring(endIdx));
    
    return { extracted: content.split('\\n- ').filter(Boolean), remaining };
  };

  const prodResult = extractSection(mainNotes, 'Produtos Utilizados');
  produtos = prodResult.extracted;
  mainNotes = prodResult.remaining;

  const paramResult = extractSection(mainNotes, 'Parâmetros da Água');
  parametros = paramResult.extracted;
  mainNotes = paramResult.remaining;

  const tarResult = extractSection(mainNotes, 'Tarefas realizadas');
  tarefas = tarResult.extracted;
  mainNotes = tarResult.remaining;

  if (tarefas.length === 0 && parametros.length === 0 && produtos.length === 0) {
    return <p className="text-sm text-gray-700 bg-gray-50 p-4 rounded-lg border border-gray-100 whitespace-pre-wrap">{notes}</p>;
  }

  return (
    <div className="bg-white rounded-lg border border-gray-100 overflow-hidden shadow-sm">
      {mainNotes.trim() && (
        <div className="p-4 bg-gray-50 border-b border-gray-100">
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{mainNotes.trim()}</p>
        </div>
      )}
      
      {tarefas.length > 0 && (
        <div className="p-4 border-b border-gray-100">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Serviços Executados</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {tarefas.map((item, idx) => (
              <div key={idx} className="flex items-center space-x-2 text-sm text-gray-700">
                <CheckCircle size={16} className="text-primary flex-shrink-0" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {parametros.length > 0 && (
        <div className="p-4 border-b border-gray-100">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Parâmetros da Água</h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {parametros.map((item, idx) => {
              const [label, val] = item.split(': ');
              return (
                <div key={idx} className="bg-blue-50 p-2 rounded border border-blue-100">
                  <span className="block text-xs text-blue-600 font-medium">{label}</span>
                  <span className="block text-sm font-bold text-gray-800">{val}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {produtos.length > 0 && (
        <div className="p-4 bg-green-50/30">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Produtos Utilizados</h4>
          <div className="flex flex-wrap gap-2">
            {produtos.map((item, idx) => (
              <span key={idx} className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-200">
                {item}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
`;

code = code.replace(oldRenderNotes, newRenderNotes);
fs.writeFileSync('src/pages/ClientPanel.tsx', code);
console.log("Patched renderNotes in ClientPanel");
