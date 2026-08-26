const fs = require('fs');
let code = fs.readFileSync('src/pages/ClientPanel.tsx', 'utf-8');

// Need to import Star icon
code = code.replace("import { Calendar, CheckCircle, X, Download } from 'lucide-react';", "import { Calendar, CheckCircle, X, Download, Star } from 'lucide-react';");

const ratingUI = `
                  {/* Modern multiple photos support */}
                  {v.photo_urls && v.photo_urls.length > 0 && (
                    <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
                      {v.photo_urls.map((photo: string, index: number) => (
                        <img 
                          key={index}
                          src={photo} 
                          alt={\`Foto da visita \${index + 1}\`}
                          onClick={() => setFullscreenImage(photo)}
                          className="w-32 h-32 object-cover rounded-lg shadow-sm border border-gray-200 cursor-pointer hover:opacity-90 transition-opacity"
                        />
                      ))}
                    </div>
                  )}

                  {/* Rating UI */}
                  <div className="mt-4 pt-4 border-t border-gray-100 flex flex-col items-center">
                    <p className="text-sm font-medium text-gray-600 mb-2">Avalie este atendimento</p>
                    <div className="flex space-x-2">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          onClick={() => {
                            const msg = \`Olá! Gostaria de deixar minha avaliação para o atendimento do dia \${new Date(v.date).toLocaleDateString('pt-BR')}. Minha nota foi: \${star} Estrela(s)! \u2B50\`;
                            window.open(\`https://wa.me/?text=\${encodeURIComponent(msg)}\`, '_blank');
                          }}
                          className="text-gray-300 hover:text-yellow-400 focus:outline-none transition-colors"
                          title={\`Avaliar com \${star} estrelas\`}
                        >
                          <Star size={24} className="fill-current" />
                        </button>
                      ))}
                    </div>
                  </div>
`;

code = code.replace(
`                  {/* Modern multiple photos support */}
                  {v.photo_urls && v.photo_urls.length > 0 && (
                    <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
                      {v.photo_urls.map((photo: string, index: number) => (
                        <img 
                          key={index}
                          src={photo} 
                          alt={\`Foto da visita \${index + 1}\`}
                          onClick={() => setFullscreenImage(photo)}
                          className="w-32 h-32 object-cover rounded-lg shadow-sm border border-gray-200 cursor-pointer hover:opacity-90 transition-opacity"
                        />
                      ))}
                    </div>
                  )}`, ratingUI);

fs.writeFileSync('src/pages/ClientPanel.tsx', code);
console.log("Patched rating UI in ClientPanel");
