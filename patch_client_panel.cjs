const fs = require('fs');
let code = fs.readFileSync('src/pages/ClientPanel.tsx', 'utf-8');

const noteRendererStr = `
const renderNotes = (notes: string) => {
  if (!notes) return null;
  const parts = notes.split('\\n\\nTarefas realizadas:\\n- ');
  
  if (parts.length === 1) {
    return <p className="text-sm text-gray-700 bg-gray-50 p-4 rounded-lg border border-gray-100 whitespace-pre-wrap">{notes}</p>;
  }

  const mainNotes = parts[0];
  const checklistItems = parts[1].split('\\n- ');

  return (
    <div className="bg-white rounded-lg border border-gray-100 overflow-hidden shadow-sm">
      {mainNotes && (
        <div className="p-4 bg-gray-50 border-b border-gray-100">
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{mainNotes}</p>
        </div>
      )}
      <div className="p-4">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Serviços Executados</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {checklistItems.map((item, idx) => (
            <div key={idx} className="flex items-center space-x-2 text-sm text-gray-700">
              <CheckCircle size={16} className="text-green-500 flex-shrink-0" />
              <span>{item}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
`;

code = code.replace("export default function ClientPanel() {", noteRendererStr + "\nexport default function ClientPanel() {");

// Now replace the notes rendering
const oldNotesRender = `{v.notes && <p className="text-sm text-gray-600 bg-gray-100 p-3 rounded-lg">{v.notes}</p>}`;
const newNotesRender = `{v.notes && renderNotes(v.notes)}`;
code = code.replace(oldNotesRender, newNotesRender);

fs.writeFileSync('src/pages/ClientPanel.tsx', code);
console.log("Patched ClientPanel successfully");
