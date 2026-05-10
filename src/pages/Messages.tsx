import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { MessageCircle, CheckSquare, Square, Image as ImageIcon, Video, X, Play } from 'lucide-react';

export default function Messages() {
  const { userProfile, isAdmin, isManager } = useAuth();
  const [clients, setClients] = useState<any[]>([]);
  const [selectedClients, setSelectedClients] = useState<Set<string>>(new Set());
  const [messageText, setMessageText] = useState('');
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!userProfile) return;

    const fetchRecipients = async () => {
      try {
        const adminId = isAdmin ? userProfile.uid : userProfile.adminId;
        
        // Fetch clients
        let qClients = query(collection(db, 'clients'), where('adminId', '==', adminId));
        if (userProfile.role === 'employee') {
          qClients = query(qClients, where('employeeId', '==', userProfile.uid));
        }
        const snapClients = await getDocs(qClients);
        const clientsData = snapClients.docs.map(doc => ({ id: doc.id, type: 'client', ...(doc.data() as any) }));
        
        // Fetch agenda contacts (only for admin/manager)
        let agendaData: any[] = [];
        if (isAdmin || isManager) {
          const qAgenda = query(collection(db, 'agenda_contacts'), where('adminId', '==', adminId));
          const snapAgenda = await getDocs(qAgenda);
          agendaData = snapAgenda.docs.map(doc => ({ id: doc.id, type: 'agenda', ...(doc.data() as any) }));
        }

        const combinedData = [...clientsData, ...agendaData];
        combinedData.sort((a, b) => a.name.localeCompare(b.name));
        setClients(combinedData);
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, 'clients');
      } finally {
        setLoading(false);
      }
    };

    fetchRecipients();
  }, [userProfile, isAdmin]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedClients(new Set(clients.map(c => c.id)));
    } else {
      setSelectedClients(new Set());
    }
  };

  const handleSelectClient = (id: string, checked: boolean) => {
    const newSet = new Set(selectedClients);
    if (checked) newSet.add(id);
    else newSet.delete(id);
    setSelectedClients(newSet);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
        setMediaFile(file);
      } else {
        alert('Por favor, selecione apenas arquivos de imagem ou vídeo.');
      }
    }
  };

  const clearFile = () => {
    setMediaFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        let result = reader.result as string;
        // Strip the data:image/jpeg;base64, part if needed by Evolution API
        // actually evolution usually accepts base64 with or without mime type, but just the raw base64 is safer for media
        const base64Data = result.split(',')[1];
        resolve(base64Data);
      };
      reader.onerror = error => reject(error);
    });
  };

  const sendEvolutionMessage = async (client: any, text: string, mediaBase64?: string, mimeType?: string) => {
    const waSettings = userProfile?.whatsappSettings;
    if (!waSettings || !waSettings.evolutionApiUrl || !waSettings.evolutionApiKey || !waSettings.evolutionInstanceName) {
      throw new Error("Evolution API não configurada corretamente.");
    }

    const { evolutionApiUrl, evolutionApiKey, evolutionInstanceName } = waSettings;
    const phoneInfo = client.phone.replace(/\D/g, '');
    const number = `55${phoneInfo}`;

    let endpoint = `${evolutionApiUrl}/message/sendText/${evolutionInstanceName}`;
    let body: any = {
      number: number,
      text: text,
      textMessage: {
        text: text
      },
      options: {
        delay: 1200,
        presence: "composing"
      }
    };

    if (mediaBase64 && mimeType) {
      endpoint = `${evolutionApiUrl}/message/sendMedia/${evolutionInstanceName}`;
      const mediatype = mimeType.startsWith('image/') ? 'image' : 'video';
      body = {
        number: number,
        mediatype: mediatype,
        caption: text,
        mediaMessage: {
          mediatype: mediatype,
          caption: text,
          media: mediaBase64
        },
        media: mediaBase64,
        options: {
          delay: 1200,
          presence: "composing"
        }
      };
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': evolutionApiKey
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(`Erro na Evolution API: ${JSON.stringify(errData)}`);
    }
  };

  const handleSend = async () => {
    if (selectedClients.size === 0) {
      alert("Por favor, selecione pelo menos um cliente.");
      return;
    }
    if (!messageText.trim() && !mediaFile) {
      alert("Por favor, insira uma mensagem ou anexe uma mídia.");
      return;
    }

    const waSettings = userProfile?.whatsappSettings;
    const isEvolution = waSettings?.useEvolutionApi;

    if (!isEvolution && mediaFile) {
      alert("Avisos com mídia só são suportados automaticamente pela Evolution API. No modo WhatsApp Web, a mídia não será carregada (apenas o texto).");
    }

    setSending(true);
    let successCount = 0;
    let errorCount = 0;

    let base64Media = '';
    let mimeType = '';
    if (mediaFile && isEvolution) {
      try {
        base64Media = await fileToBase64(mediaFile);
        mimeType = mediaFile.type;
      } catch (e) {
        alert("Erro ao processar arquivo de mídia.");
        setSending(false);
        return;
      }
    }

    const targets = clients.filter(c => selectedClients.has(c.id));

    if (!isEvolution && !waSettings?.useMetaApi) {
      // Manual Web Fallback
      alert(`Serão enviadas ${targets.length} mensagens pelo WhatsApp Web. Você terá que clicar em enviar para cada uma que for aberta.`);
      
      for (const client of targets) {
        if (!client.phone) {
          errorCount++;
          continue;
        }
        const phoneInfo = client.phone.replace(/\D/g, '');
        const message = messageText.replace(/\{nome\}/g, client.name || '');
        const encodedMessage = encodeURIComponent(message);
        window.open(`https://wa.me/55${phoneInfo}?text=${encodedMessage}`, '_blank');
        successCount++;
        // Short pause between opening tabs to avoid browser blocking
        await new Promise(r => setTimeout(r, 1000));
      }
    } else if (isEvolution) {
      if (!waSettings || !waSettings.evolutionApiUrl || !waSettings.evolutionApiKey || !waSettings.evolutionInstanceName) {
        alert("Evolution API não configurada corretamente. Preencha as configurações.");
        setSending(false);
        return;
      }

      // Evolution Background
      let lastError = '';
      for (const client of targets) {
        if (!client.phone) {
          errorCount++;
          lastError = 'Telefone ausente';
          continue;
        }
        try {
          const personalizedText = messageText.replace(/\{nome\}/g, client.name || '');
          await sendEvolutionMessage(client, personalizedText, base64Media, mimeType);
          successCount++;
        } catch (e: any) {
          console.error("Erro Evolution:", e);
          errorCount++;
          lastError = e?.message || 'Erro desconhecido';
        }
        await new Promise(r => setTimeout(r, 1000));
      }
      let alertMsg = `Envios Evolution API concluídos!\nSucesso: ${successCount}\nErros: ${errorCount}`;
      if (errorCount > 0) {
        alertMsg += `\n\nÚltimo erro: ${lastError}`;
      }
      alert(alertMsg);
    } else {
       alert("Meta API não implementada para mídia em massa. Configure Evolution ou tente pelo Web.");
    }

    setSending(false);
  };

  if (loading) return <div className="flex justify-center items-center h-64">Carregando...</div>;

  const allSelected = clients.length > 0 && selectedClients.size === clients.length;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Mensagens em Lote</h1>
        <p className="text-gray-600 mt-1">Envie comunicados e avisos gerais para seus clientes.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Editor de Mensagem */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
            <h2 className="text-lg font-bold text-gray-800 mb-4">Compor Mensagem</h2>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Texto da Mensagem
              </label>
              <textarea
                value={messageText}
                onChange={e => setMessageText(e.target.value)}
                rows={6}
                placeholder="Escreva sua mensagem aqui... Use {nome} para inserir o nome do cliente."
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-primary focus:border-primary outline-none resize-none transition-colors"
              />
              <p className="text-xs text-gray-500 mt-1">Dica: Digite <code className="bg-gray-100 px-1 py-0.5 rounded text-primary">{'{nome}'}</code> para personalizar a mensagem.</p>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">Anexar Mídia (Opcional, apenas Evolution API)</label>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 transition-colors flex items-center"
                >
                  <ImageIcon size={18} className="mr-2" />
                  Imagem / Video
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="image/*,video/*"
                  className="hidden"
                />
                {mediaFile && (
                  <div className="flex items-center bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg text-sm border border-blue-100">
                    {mediaFile.type.startsWith('video') ? <Video size={16} className="mr-2" /> : <ImageIcon size={16} className="mr-2" />}
                    <span className="truncate max-w-[200px] font-medium">{mediaFile.name}</span>
                    <button onClick={clearFile} className="ml-2 hover:text-red-600 transition-colors">
                      <X size={16} />
                    </button>
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={handleSend}
              disabled={sending || selectedClients.size === 0}
              className="w-full sm:w-auto bg-green-500 text-white px-6 py-3 rounded-lg font-bold hover:bg-green-600 transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed shadow-sm border border-transparent"
            >
              <Play size={20} className="mr-2" />
              {sending ? 'Enviando Mensagens...' : `Enviar para ${selectedClients.size} Clientes`}
            </button>

            {(!userProfile?.whatsappSettings?.useEvolutionApi) && (
              <p className="text-xs text-gray-500 mt-4 bg-gray-50 p-3 rounded border border-gray-100">
                <strong>Modo Web:</strong> Seu envio não é automatizado pela Evolution API. A cada envio tentaremos abrir o seu WhatsApp Web para gerar o gatilho manualmente.
              </p>
            )}
          </div>
        </div>

        {/* Lista de Clientes */}
        <div className="lg:col-span-1 border border-gray-100 bg-white rounded-xl shadow-sm flex flex-col h-[600px]">
          <div className="p-4 border-b border-gray-100 bg-gray-50 shrink-0 rounded-t-xl">
            <h2 className="font-bold text-gray-800 flex justify-between items-center">
              Destinatários
              <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full text-xs">
                {selectedClients.size} selecionados
              </span>
            </h2>
          </div>
          
          <div className="p-4 border-b border-gray-100 bg-white shrink-0 flex items-center justify-between">
            <label className="flex items-center space-x-3 cursor-pointer text-sm font-medium select-none text-gray-700 group">
              <div className="relative flex items-center justify-center w-5 h-5 rounded border border-gray-300 group-hover:border-primary transition-colors">
                 <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                  className="opacity-0 absolute inset-0 cursor-pointer"
                />
                {allSelected && <CheckSquare size={20} className="text-primary absolute inset-0 pointer-events-none" />}
                {!allSelected && <Square size={20} className="text-transparent absolute inset-0 pointer-events-none" />}
              </div>
              <span>Selecionar Todos ({clients.length})</span>
            </label>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            <ul className="space-y-1">
              {clients.map(client => {
                const isSelected = selectedClients.has(client.id);
                return (
                  <li key={client.id} className="hover:bg-gray-50 p-2 rounded-lg transition-colors">
                    <label className="flex items-center space-x-3 cursor-pointer group">
                      <div className="relative flex items-center justify-center w-5 h-5 rounded border border-gray-300 group-hover:border-primary transition-colors">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => handleSelectClient(client.id, e.target.checked)}
                          className="opacity-0 absolute inset-0 cursor-pointer"
                        />
                        {isSelected && <CheckSquare size={20} className="text-primary absolute inset-0 pointer-events-none scale-110" />}
                        {!isSelected && <Square size={20} className="text-transparent absolute inset-0 pointer-events-none" />}
                      </div>
                      <div className="flex-1 min-w-0 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-gray-800 truncate">{client.name}</p>
                          <p className="text-xs text-gray-500 font-mono">{client.phone}</p>
                        </div>
                        {client.type === 'agenda' && (
                          <span className="text-[10px] uppercase font-bold px-2 py-0.5 bg-gray-200 text-gray-600 rounded-full">Agenda</span>
                        )}
                      </div>
                    </label>
                  </li>
                );
              })}
            </ul>
            {clients.length === 0 && (
              <p className="text-center text-gray-500 text-sm mt-8">Nenhum destinatário disponível.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
