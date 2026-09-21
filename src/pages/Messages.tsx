import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { openWhatsApp, sendMetaMessage } from '../lib/whatsapp';
import { 
  MessageSquare, 
  MessageCircle, 
  CheckSquare, 
  Square, 
  Image as ImageIcon, 
  Video, 
  X, 
  Play, 
  Search, 
  User, 
  Send,
  Sparkles,
  Phone,
  Clock
} from 'lucide-react';
import { useRealtimeUpdates } from '../hooks/useRealtimeUpdates';
import { ChatModal } from '../components/ChatModal';
import { MessageStatus, parseMessageStatus } from '../components/chat/MessageStatus';
import { markClientChatAsRead } from '../lib/chatSessionUtils';

interface ConversationSummary {
  clientId: string;
  clientName: string;
  clientPhone: string;
  sessionId?: string;
  lastMessage?: string;
  lastMessageTime?: string;
  lastSenderType?: 'tech' | 'client' | 'admin' | 'employee';
  lastStatus?: string;
  unreadCount: number;
}

export default function Messages() {
  const { userProfile, isAdmin, isManager } = useAuth();
  
  const adminId = userProfile?.role === 'admin' ? userProfile.uid : userProfile?.adminId;
  const refreshTrigger = useRealtimeUpdates(['clients', 'chat_messages', 'chat_sessions'], 'admin_id', adminId);

  // Tab selection: 'conversations' vs 'broadcast'
  const [activeTab, setActiveTab] = useState<'conversations' | 'broadcast'>('conversations');

  // Broadcast state
  const [clients, setClients] = useState<any[]>([]);
  const [selectedClients, setSelectedClients] = useState<Set<string>>(new Set());
  const [messageText, setMessageText] = useState('');
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sendStatuses, setSendStatuses] = useState<Record<string, 'pending' | 'sending' | 'success' | 'error'>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Conversations & Live Chat state
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [conversationSearch, setConversationSearch] = useState('');
  const [activeChatClient, setActiveChatClient] = useState<any | null>(null);
  const [chatModalOpen, setChatModalOpen] = useState(false);

  // Fetch recipients and initial conversations
  useEffect(() => {
    if (!userProfile) return;

    const fetchRecipientsAndConversations = async () => {
      try {
        const currentAdminId = isAdmin ? userProfile.uid : userProfile.adminId;
        
        // 1. Fetch clients
        let snapClients;
        if (userProfile.role === 'employee') {
          snapClients = await supabase.from('clients').select('*').eq('admin_id', currentAdminId).eq('employee_id', userProfile.uid);
        } else {
          snapClients = await supabase.from('clients').select('*').eq('admin_id', currentAdminId);
        }
        
        let clientsData: any[] = [];
        if (snapClients.data) {
          clientsData = snapClients.data.map((doc: any) => ({ id: doc.id, type: 'client', ...doc }));
        }
        
        // Fetch agenda contacts (only for admin/manager)
        let agendaData: any[] = [];
        if (isAdmin || isManager) {
          const snapAgenda = await supabase.from('agenda_contacts').select('*').eq('admin_id', currentAdminId);
          if (snapAgenda.data) {
            agendaData = snapAgenda.data.map((doc: any) => ({ id: doc.id, type: 'agenda', ...doc }));
          }
        }

        const combinedData = [...clientsData, ...agendaData];
        combinedData.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        setClients(combinedData);

        // 2. Fetch recent chat messages and sessions to build conversation summaries
        const { data: recentMsgs } = await supabase
          .from('chat_messages')
          .select('id, session_id, sender_type, content, media_url, created_at')
          .order('created_at', { ascending: false })
          .limit(500);

        const { data: allSessions } = await supabase
          .from('chat_sessions')
          .select('id, client_id, status, updated_at')
          .eq('admin_id', currentAdminId);

        const sessionClientMap = new Map<string, string>();
        if (allSessions) {
          allSessions.forEach((s) => {
            if (s.id && s.client_id) {
              sessionClientMap.set(s.id, s.client_id);
            }
          });
        }

        // Aggregate by client
        const clientSummaries = new Map<string, ConversationSummary>();

        // Initialize with clients
        clientsData.forEach((c) => {
          clientSummaries.set(c.id, {
            clientId: c.id,
            clientName: c.name || 'Cliente',
            clientPhone: c.phone || '',
            unreadCount: 0,
          });
        });

        if (recentMsgs) {
          // Process messages from latest to oldest
          for (const msg of recentMsgs) {
            const cId = sessionClientMap.get(msg.session_id);
            if (!cId || !clientSummaries.has(cId)) continue;

            const existing = clientSummaries.get(cId)!;

            if (!existing.lastMessage) {
              existing.sessionId = msg.session_id;
              existing.lastMessage = msg.content || (msg.media_url ? '📷 Mídia' : '');
              existing.lastMessageTime = msg.created_at;
              existing.lastSenderType = msg.sender_type;
              existing.lastStatus = parseMessageStatus(msg);
            }

            if (msg.sender_type === 'client') {
              let isUnread = true;
              if (msg.media_url) {
                try {
                  const parsed = JSON.parse(msg.media_url);
                  if (parsed.read_by_tech || parsed.status === 'read') isUnread = false;
                } catch (e) {}
              }
              if (isUnread) {
                existing.unreadCount = (existing.unreadCount || 0) + 1;
              }
            }
          }
        }

        const convList = Array.from(clientSummaries.values()).sort((a, b) => {
          // Unread first, then by last message time, then alphabetical
          if (a.unreadCount > 0 && b.unreadCount === 0) return -1;
          if (b.unreadCount > 0 && a.unreadCount === 0) return 1;
          if (a.lastMessageTime && b.lastMessageTime) {
            return new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime();
          }
          if (a.lastMessageTime) return -1;
          if (b.lastMessageTime) return 1;
          return a.clientName.localeCompare(b.clientName);
        });

        setConversations(convList);
      } catch (error) {
        console.error('Error fetching messages page data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchRecipientsAndConversations();
  }, [userProfile, isAdmin, isManager, refreshTrigger]);

  // Real-time listener for incoming webhook updates or messages on chat_messages table
  useEffect(() => {
    if (!userProfile) return;

    const channel = supabase
      .channel('messages-page-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_messages' },
        (payload) => {
          const newMsg = payload.new as any;
          if (!newMsg || !newMsg.session_id) return;

          // Update the conversation status in real-time
          setConversations((prev) => {
            return prev.map((conv) => {
              if (conv.sessionId === newMsg.session_id) {
                const status = parseMessageStatus(newMsg);
                return {
                  ...conv,
                  lastMessage: newMsg.content || (newMsg.media_url ? '📷 Mídia' : conv.lastMessage),
                  lastMessageTime: newMsg.created_at || conv.lastMessageTime,
                  lastSenderType: newMsg.sender_type,
                  lastStatus: status,
                  unreadCount: newMsg.sender_type === 'client' ? (conv.unreadCount || 0) + 1 : conv.unreadCount
                };
              }
              return conv;
            });
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userProfile]);

  const handleOpenChat = (clientSummary: ConversationSummary) => {
    const fullClient = clients.find((c) => c.id === clientSummary.clientId) || {
      id: clientSummary.clientId,
      name: clientSummary.clientName,
      phone: clientSummary.clientPhone,
    };
    
    // Clear unread count locally
    setConversations((prev) =>
      prev.map((c) =>
        c.clientId === clientSummary.clientId ? { ...c, unreadCount: 0 } : c
      )
    );
    markClientChatAsRead(clientSummary.clientId, supabase);

    setActiveChatClient(fullClient);
    setChatModalOpen(true);
  };

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
        const result = reader.result as string;
        const base64Data = result.split(',')[1];
        resolve(base64Data);
      };
      reader.onerror = error => reject(error);
    });
  };

  const sendEvolutionMessageApi = async (client: any, text: string, waSettings: any, mediaBase64?: string, mimeType?: string) => {
    if (!waSettings || !waSettings.evolutionApiUrl || !waSettings.evolutionApiKey || !waSettings.evolutionInstanceName) {
      throw new Error("Evolution API não configurada corretamente.");
    }

    const { evolutionApiKey, evolutionInstanceName } = waSettings;
    let baseUrl = waSettings.evolutionApiUrl.trim().replace(/\/$/, '');
    if (baseUrl && !baseUrl.startsWith('http')) {
      baseUrl = 'https://' + baseUrl;
    }
    const phoneInfo = client.phone.replace(/\D/g, '');
    const number = `55${phoneInfo}`;

    let endpoint = `${baseUrl}/message/sendText/${evolutionInstanceName}`;
    let body: any = {
      number: number,
      text: text,
      options: {
        delay: 1000,
        presence: "composing",
        linkPreview: false
      }
    };

    if (mediaBase64 && mimeType) {
      endpoint = `${baseUrl}/message/sendMedia/${evolutionInstanceName}`;
      const mediatype = mimeType.startsWith('image/') ? 'image' : 'video';
      body = {
        number: number,
        mediatype: mediatype,
        caption: text,
        media: mediaBase64,
        options: {
          delay: 1000,
          presence: "composing"
        }
      };
    }

    let response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': evolutionApiKey
        },
        body: JSON.stringify(body)
      });
    } catch (e: any) {
      if (e.message === 'Failed to fetch') {
        throw new Error(`Falha de conexão. Verifique se o seu servidor Evolution API (${baseUrl}) possui o CORS habilitado.`);
      }
      throw e;
    }

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      const errMsg = errData?.response?.message || errData?.message || JSON.stringify(errData);
      if (response.status === 500 && errMsg.includes('Connection Closed')) {
        throw new Error(`O seu WhatsApp está desconectado da Evolution API (Connection Closed). Conecte o QR Code no seu painel da API e tente novamente.`);
      }
      throw new Error(`Erro na Evolution API: ${errMsg}`);
    }
  };

  const handleSendBroadcast = async () => {
    if (selectedClients.size === 0) {
      alert("Por favor, selecione pelo menos um cliente.");
      return;
    }
    if (!messageText.trim() && !mediaFile) {
      alert("Por favor, insira uma mensagem ou anexe uma mídia.");
      return;
    }

    let waSettings = userProfile?.whatsappSettings;
    if (userProfile?.uid) {
      const currentAdminId = userProfile.role === 'admin' ? userProfile.uid : userProfile.adminId;
      const { data } = await supabase.from('users').select('whatsapp_settings').eq('id', currentAdminId).single();
      if (data && data.whatsapp_settings) {
        waSettings = data.whatsapp_settings;
      }
    }
    
    const isEvolution = waSettings?.useEvolutionApi;

    if (!isEvolution && mediaFile) {
      alert("Avisos com mídia só são suportados automaticamente pela Evolution API. No modo WhatsApp Web, a mídia não será carregada (apenas o texto).");
    }

    setSending(true);
    setSendStatuses({});
    
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
    targets.forEach(c => setSendStatuses(prev => ({ ...prev, [c.id]: 'pending' })));

    if (!isEvolution && !waSettings?.useMetaApi) {
      alert(`Serão enviadas ${targets.length} mensagens pelo WhatsApp Web. Você terá que clicar em enviar para cada uma que for aberta.`);
      
      for (const client of targets) {
        if (!client.phone) {
          setSendStatuses(prev => ({ ...prev, [client.id]: 'error' }));
          errorCount++;
          continue;
        }
        setSendStatuses(prev => ({ ...prev, [client.id]: 'sending' }));
        const phoneInfo = client.phone.replace(/\D/g, '');
        const message = messageText.replace(/\{nome\}/g, client.name || '');
        openWhatsApp(`55${phoneInfo}`, message);
        setSendStatuses(prev => ({ ...prev, [client.id]: 'success' }));
        successCount++;
        await new Promise(r => setTimeout(r, 1000));
      }
    } else if (isEvolution) {
      if (!waSettings || !waSettings.evolutionApiUrl || !waSettings.evolutionApiKey || !waSettings.evolutionInstanceName) {
        alert("Evolution API não configurada corretamente. Preencha as configurações.");
        setSending(false);
        return;
      }

      let lastError = '';
      for (const client of targets) {
        if (!client.phone) {
          setSendStatuses(prev => ({ ...prev, [client.id]: 'error' }));
          errorCount++;
          lastError = 'Telefone ausente';
          continue;
        }
        setSendStatuses(prev => ({ ...prev, [client.id]: 'sending' }));
        try {
          const personalizedText = messageText.replace(/\{nome\}/g, client.name || '');
          await sendEvolutionMessageApi(client, personalizedText, waSettings, base64Media, mimeType);
          setSendStatuses(prev => ({ ...prev, [client.id]: 'success' }));
          successCount++;
        } catch (e: any) {
          console.error("Erro Evolution:", e);
          setSendStatuses(prev => ({ ...prev, [client.id]: 'error' }));
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
    } else if (waSettings?.useMetaApi) {
      if (mediaFile) {
        alert("Não é possível enviar imagens e vídeos utilizando a API Oficial da Meta nas mensagens em lote. O envio será cancelado.");
        setSending(false);
        return;
      }
      if (!waSettings.metaToken) {
        alert("O Token/Key da API Oficial (Meta) é obrigatório.");
        setSending(false);
        return;
      }

      let lastError = '';
      for (const client of targets) {
        if (!client.phone) {
          setSendStatuses(prev => ({ ...prev, [client.id]: 'error' }));
          errorCount++;
          lastError = 'Telefone ausente';
          continue;
        }
        setSendStatuses(prev => ({ ...prev, [client.id]: 'sending' }));
        try {
          const personalizedText = messageText.replace(/\{nome\}/g, client.name || '');
          await sendMetaMessage(client.phone, personalizedText, waSettings || {});
          setSendStatuses(prev => ({ ...prev, [client.id]: 'success' }));
          successCount++;
        } catch (e: any) {
          console.error("Erro Meta:", e);
          setSendStatuses(prev => ({ ...prev, [client.id]: 'error' }));
          errorCount++;
          lastError = e?.message || 'Erro desconhecido';
        }
        await new Promise(r => setTimeout(r, 1000));
      }
      
      let alertMsg = `Envios API Meta concluídos!\nSucesso: ${successCount}\nErros: ${errorCount}`;
      if (errorCount > 0) {
        alertMsg += `\n\nÚltimo erro: ${lastError}`;
      }
      alert(alertMsg);
    }

    setSending(false);
  };

  const filteredConversations = conversations.filter((c) => {
    const term = conversationSearch.toLowerCase();
    return (
      (c.clientName || '').toLowerCase().includes(term) ||
      (c.clientPhone || '').includes(term) ||
      (c.lastMessage || '').toLowerCase().includes(term)
    );
  });

  const allSelected = clients.length > 0 && selectedClients.size === clients.length;

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64 text-gray-500">
        Carregando mensagens e atendimentos...
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header & Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <MessageSquare className="text-primary" size={26} />
            Central de Mensagens
          </h1>
          <p className="text-gray-600 text-sm mt-0.5">
            Acompanhe conversas em tempo real com status de entrega e envie comunicados em lote.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex bg-gray-100 p-1 rounded-xl shadow-inner border border-gray-200 self-start sm:self-auto">
          <button
            id="tab-conversations-btn"
            onClick={() => setActiveTab('conversations')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'conversations'
                ? 'bg-white text-primary shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <MessageCircle size={17} />
            Conversas & Chat
            {conversations.some((c) => c.unreadCount > 0) && (
              <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full">
                {conversations.reduce((acc, curr) => acc + (curr.unreadCount || 0), 0)}
              </span>
            )}
          </button>

          <button
            id="tab-broadcast-btn"
            onClick={() => setActiveTab('broadcast')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'broadcast'
                ? 'bg-white text-primary shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Play size={16} />
            Envio em Lote
          </button>
        </div>
      </div>

      {/* TAB 1: CONVERSATIONS & CHAT */}
      {activeTab === 'conversations' && (
        <div className="space-y-4">
          {/* Search bar & status legend */}
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                id="search-conversation-input"
                type="text"
                placeholder="Buscar cliente, telefone ou mensagem..."
                value={conversationSearch}
                onChange={(e) => setConversationSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all"
              />
            </div>

            {/* Status Legend */}
            <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600 bg-gray-50 px-3 py-2 rounded-lg border border-gray-100">
              <span className="font-semibold text-gray-500">Status dos tiques:</span>
              <div className="flex items-center gap-1" title="Mensagem enviada">
                <MessageStatus status="sent" size={14} />
                <span>Enviada (1 cinza)</span>
              </div>
              <div className="flex items-center gap-1" title="Mensagem entregue">
                <MessageStatus status="delivered" size={14} />
                <span>Entregue (2 cinzas)</span>
              </div>
              <div className="flex items-center gap-1" title="Mensagem lida pelo cliente">
                <MessageStatus status="read" size={14} />
                <span className="text-[#0284c7] font-medium">Lida (2 azuis)</span>
              </div>
            </div>
          </div>

          {/* Conversation List Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredConversations.length === 0 ? (
              <div className="col-span-full py-16 text-center bg-white rounded-xl border border-gray-100 p-8 shadow-sm">
                <MessageSquare size={48} className="mx-auto text-gray-300 mb-3" />
                <p className="text-gray-600 font-medium text-base">Nenhuma conversa encontrada</p>
                <p className="text-gray-400 text-sm mt-1">
                  Inicie um atendimento nas Rotas ou envie uma mensagem para ver as conversas aqui.
                </p>
              </div>
            ) : (
              filteredConversations.map((conv) => {
                const isTechLast = conv.lastSenderType === 'tech' || conv.lastSenderType === 'admin';
                return (
                  <div
                    key={conv.clientId}
                    id={`conversation-card-${conv.clientId}`}
                    onClick={() => handleOpenChat(conv)}
                    className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:border-primary/40 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between group"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2.5">
                          <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0 group-hover:bg-primary group-hover:text-white transition-colors">
                            {conv.clientName.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <h3 className="font-bold text-gray-800 text-sm group-hover:text-primary transition-colors line-clamp-1">
                              {conv.clientName}
                            </h3>
                            <p className="text-xs text-gray-400 font-mono flex items-center gap-1">
                              <Phone size={11} /> {conv.clientPhone || 'Sem telefone'}
                            </p>
                          </div>
                        </div>

                        {conv.unreadCount > 0 && (
                          <span className="bg-red-500 text-white text-[11px] font-bold px-2 py-0.5 rounded-full shadow-sm animate-pulse shrink-0">
                            {conv.unreadCount} nova{conv.unreadCount > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>

                      {/* Last message preview with visual status icon */}
                      <div className="bg-gray-50/80 rounded-lg p-2.5 mt-2 border border-gray-100">
                        {conv.lastMessage ? (
                          <div className="flex items-center justify-between text-xs gap-2">
                            <div className="flex items-center gap-1.5 min-w-0 flex-1">
                              {isTechLast && (
                                <MessageStatus
                                  status={conv.lastStatus || 'sent'}
                                  size={14}
                                  className="shrink-0"
                                />
                              )}
                              <span className="truncate text-gray-600">
                                {conv.lastMessage}
                              </span>
                            </div>

                            {conv.lastMessageTime && (
                              <span className="text-[10px] text-gray-400 whitespace-nowrap shrink-0">
                                {new Date(conv.lastMessageTime).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            )}
                          </div>
                        ) : (
                          <p className="text-xs text-gray-400 italic">Nenhuma mensagem recente</p>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-gray-50 flex items-center justify-between text-xs text-primary font-semibold">
                      <span className="flex items-center gap-1">
                        <MessageCircle size={14} /> Abrir Conversa
                      </span>
                      <span className="text-gray-400 group-hover:translate-x-1 transition-transform">
                        →
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* TAB 2: BROADCAST MESSAGES */}
      {activeTab === 'broadcast' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Editor de Mensagem */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
              <h2 className="text-lg font-bold text-gray-800 mb-4">Compor Mensagem em Lote</h2>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Texto da Mensagem
                </label>
                <textarea
                  id="broadcast-message-text"
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
                    id="broadcast-media-btn"
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
                id="broadcast-send-btn"
                onClick={handleSendBroadcast}
                disabled={sending || selectedClients.size === 0}
                className="w-full sm:w-auto bg-green-500 text-white px-6 py-3 rounded-lg font-bold hover:bg-green-600 transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed shadow-sm border border-transparent cursor-pointer"
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
                          <div className="flex flex-col items-end gap-1">
                            {client.type === 'agenda' && (
                              <span className="text-[10px] uppercase font-bold px-2 py-0.5 bg-gray-200 text-gray-600 rounded-full">Agenda</span>
                            )}
                            {sendStatuses[client.id] === 'pending' && <span className="text-[10px] uppercase font-bold px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full border border-gray-200">Aguardando</span>}
                            {sendStatuses[client.id] === 'sending' && <span className="text-[10px] uppercase font-bold px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full border border-blue-200">Enviando...</span>}
                            {sendStatuses[client.id] === 'success' && <span className="text-[10px] uppercase font-bold px-2 py-0.5 bg-green-100 text-green-700 rounded-full border border-green-200">Enviada</span>}
                            {sendStatuses[client.id] === 'error' && <span className="text-[10px] uppercase font-bold px-2 py-0.5 bg-red-100 text-red-700 rounded-full border border-red-200">Erro</span>}
                          </div>
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
      )}

      {/* Realtime Chat Modal Triggerable from Conversations list */}
      {chatModalOpen && activeChatClient && (
        <ChatModal
          isOpen={chatModalOpen}
          onClose={() => {
            setChatModalOpen(false);
            setActiveChatClient(null);
          }}
          client={activeChatClient}
          waSettings={userProfile?.whatsappSettings}
        />
      )}
    </div>
  );
}
