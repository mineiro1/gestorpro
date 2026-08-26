const fs = require('fs');
let code = fs.readFileSync('src/pages/RoutesPage.tsx', 'utf-8');

code = code.replace(
  "doc.text(`Telefone: ${client.phone || 'N/A'}`, 14, yPos + 6 + (splitAddress.length * 5));",
  "doc.text(`Telefone: ${(isAdmin || isManager) ? (client.phone || 'N/A') : '***'}`, 14, yPos + 6 + (splitAddress.length * 5));"
);

code = code.replace(
  "{client.phone && (\n                        <p className={`text-sm mt-1 ${isCompleted ? 'text-green-600/70' : 'text-gray-500'}`}>\n                          Tel: {client.phone}\n                        </p>\n                      )}",
  "{client.phone && (isAdmin || isManager) && (\n                        <p className={`text-sm mt-1 ${isCompleted ? 'text-green-600/70' : 'text-gray-500'}`}>\n                          Tel: {client.phone}\n                        </p>\n                      )}"
);

fs.writeFileSync('src/pages/RoutesPage.tsx', code);
