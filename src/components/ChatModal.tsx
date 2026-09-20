import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Send, User, MessageCircle, Clock, Check, CheckCheck } from 'lucide-react';
import { MediaViewer, AudioViewer } from './chat/MediaViewer';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { evaluateSessionExpiry, checkDailyChatAvailability, markClientChatAsRead } from '../lib/chatSessionUtils';
import { sendMetaMessage, sendEvolutionMessage } from '../lib/whatsapp';

export function ChatModal({ isOpen, onClose, visit, client, waSettings }: any) {
  const { userProfile } = useAuth();
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const clientSessionIdsRef = useRef<Set<string>>(new Set());
  const isInitialScrollDoneRef = useRef(false);
  const messagesRef = useRef<any[]>(messages);
  messagesRef.current = messages;

  const scrollToBottom = useCallback((smooth = true) => {
    if (messagesContainerRef.current) {
      const { scrollHeight, clientHeight } = messagesContainerRef.current;
      const target = scrollHeight - clientHeight;
      if (target > 0) {
        if (smooth) {
          messagesContainerRef.current.scrollTo({ top: target, behavior: 'smooth' });
        } else {
          messagesContainerRef.current.scrollTop = target;
        }
      }
    }
    if (messagesEndRef.current) {
      try {
        messagesEndRef.current.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'end' });
      } catch (e) {}
    }
  }, []);

  // Timer countdown for active session
  useEffect(() => {
    if (session?.status === 'open' && session.created_at) {
      const updateTimer = () => {
        const evaluation = evaluateSessionExpiry(session);
        
        if (evaluation.isExpired) {
          setTimeLeft(0);
          setSession((prev: any) => prev ? { ...prev, status: 'closed' } : null);
          supabase
            .from('chat_sessions')
            .update({ status: 'closed', closed_at: new Date().toISOString() })
            .eq('id', session.id)
            .then(() => {}, () => {});
        } else {
          setTimeLeft(evaluation.secondsRemaining);
        }
      };

      updateTimer();
      const interval = setInterval(updateTimer, 1000);
      return () => clearInterval(interval);
    } else {
      setTimeLeft(null);
    }
  }, [session]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // Trigger auto-scroll on messages change
  useEffect(() => {
    if (messages.length === 0) return;

    if (!isInitialScrollDoneRef.current) {
      // Instant scroll immediately on first batch of messages
      scrollToBottom(false);
      const t1 = setTimeout(() => scrollToBottom(false), 50);
      const t2 = setTimeout(() => {
        scrollToBottom(false);
        isInitialScrollDoneRef.current = true;
      }, 200);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    } else {
      // Smooth scroll for subsequent messages
      scrollToBottom(true);
      const t = setTimeout(() => scrollToBottom(true), 80);
      return () => clearTimeout(t);
    }
  }, [messages, scrollToBottom]);

  // Main lifecycle: load session, load messages asynchronously, mark as read, real-time subscription
  useEffect(() => {
    if (!isOpen || !client?.id) {
      setMessages([]);
      setSession(null);
      setLoading(false);
      clientSessionIdsRef.current = new Set();
      isInitialScrollDoneRef.current = false;
      return;
    }

    let isMounted = true;
    let channel: any = null;
    isInitialScrollDoneRef.current = false;

    // Helper to merge and sort messages without duplicates
    const mergeMessages = (incoming: any[]) => {
      setMessages((prev) => {
        const map = new Map<string, any>();
        prev.forEach((m) => {
          if (m && m.id) map.set(m.id, m);
        });
        incoming.forEach((m) => {
          if (m && m.id && m.sender_type !== 'read') {
            map.set(m.id, m);
          }
        });
        return Array.from(map.values()).sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
      });
    };

    const fetchAllClientMessages = async (sessionIds: Set<string>) => {
      if (sessionIds.size === 0) return;
      try {
        const { data: loadedMsgs } = await supabase
          .from('chat_messages')
          .select('*')
          .in('session_id', Array.from(sessionIds))
          .order('created_at', { ascending: true });

        if (isMounted && loadedMsgs && loadedMsgs.length > 0) {
          mergeMessages(loadedMsgs);
        }
      } catch (err) {
        console.error('[ChatModal] Erro ao carregar mensagens:', err);
      }
    };

    const setupChat = async () => {
      setLoading(true);

      try {
        // 1. Marca imediatamente como lido em todos os dispositivos
        markClientChatAsRead(client.id, supabase);

        // 2. Busca sessões e disponibilidade em paralelo para carregamento instantâneo
        const [check, sessionsRes] = await Promise.all([
          checkDailyChatAvailability(client.id, supabase),
          supabase
            .from('chat_sessions')
            .select('id, status, created_at, closed_at')
            .eq('client_id', client.id)
            .order('created_at', { ascending: false })
        ]);

        if (!isMounted) return;

        const allSessions = sessionsRes.data || [];
        const sessionIds = new Set<string>();
        allSessions.forEach((s: any) => sessionIds.add(s.id));

        let currentSession = check.activeSession || allSessions.find((s: any) => s.status === 'open') || check.lastSession || allSessions[0] || { status: 'closed' };
        if (currentSession?.id) {
          sessionIds.add(currentSession.id);
        }
        clientSessionIdsRef.current = sessionIds;
        setSession(currentSession);

        // 3. Carrega todas as mensagens de todas as sessões do cliente
        if (sessionIds.size > 0) {
          const { data: loadedMsgs, error: msgsErr } = await supabase
            .from('chat_messages')
            .select('*')
            .in('session_id', Array.from(sessionIds))
            .order('created_at', { ascending: true });

          if (msgsErr) {
            console.error('[ChatModal] Erro ao carregar mensagens:', msgsErr);
          } else if (isMounted && loadedMsgs) {
            mergeMessages(loadedMsgs);
          }
        }
      } catch (err) {
        console.error('[ChatModal] Erro na configuração do chat:', err);
      } finally {
        if (isMounted) {
          setLoading(false);
          // Força rolagem imediata ao final após o término do carregamento
          requestAnimationFrame(() => {
            scrollToBottom(false);
          });
        }
      }
    };

    // 5. Inscrição em tempo real imediata para novas mensagens e atualizações de status
    const channelName = `chat-modal-${client.id}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    channel = supabase
      .channel(channelName)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'chat_messages'
      }, async (payload) => {
        if (!isMounted) return;
        const newMsg = (payload.new || payload.old) as any;
        if (!newMsg || newMsg.sender_type === 'read') return;

        // Verifica se a mensagem pertence a uma sessão conhecida deste cliente
        if (clientSessionIdsRef.current.has(newMsg.session_id) || newMsg.session_id === session?.id) {
          mergeMessages([newMsg]);
          if (payload.eventType === 'INSERT' && newMsg.sender_type === 'client') {
            markClientChatAsRead(client.id, supabase);
          }
        } else {
          // Se a sessão ainda não está no Set, verifica se pertence a este cliente
          try {
            const { data: sess } = await supabase
              .from('chat_sessions')
              .select('id, client_id')
              .eq('id', newMsg.session_id)
              .single();

            if (sess && sess.client_id === client.id) {
              clientSessionIdsRef.current.add(sess.id);
              mergeMessages([newMsg]);
              if (payload.eventType === 'INSERT' && newMsg.sender_type === 'client') {
                markClientChatAsRead(client.id, supabase);
              }
            }
          } catch (e) {}
        }
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'chat_sessions',
        filter: `client_id=eq.${client.id}`
      }, (payload) => {
        if (!isMounted) return;
        const updatedSession = payload.new as any;
        if (updatedSession) {
          clientSessionIdsRef.current.add(updatedSession.id);
          setSession((prev: any) => {
            if (!prev || prev.id === updatedSession.id) {
              return updatedSession;
            }
            return prev;
          });
        }
      })
      .subscribe();

    setupChat();

    // Sincronização ao focar novamente na janela
    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible' && isMounted) {
        markClientChatAsRead(client.id, supabase);
        if (clientSessionIdsRef.current.size > 0) {
          fetchAllClientMessages(clientSessionIdsRef.current);
        }
      }
    };

    // Polling ativo a cada 2 segundos para sincronizar confirmações de entrega/leitura do WhatsApp
    const runSyncStatus = async () => {
      if (!isMounted) return;
      try {
        // Obter mensagens que ainda não foram marcadas como 'read'
        const currentMsgs = messagesRef.current || [];
        const currentTechMsgs = currentMsgs.filter((m) => {
          if (m.sender_type !== 'tech') return false;
          let status = 'sent';
          try {
            const meta = typeof m.media_url === 'string' && m.media_url.startsWith('{') ? JSON.parse(m.media_url) : {};
            status = meta.status || m.status || 'sent';
          } catch(e) {}
          return status !== 'read';
        });

        if (currentTechMsgs.length > 0) {
          const msgIds = currentTechMsgs.map((m) => m.id).filter(Boolean);
          const syncRes = await fetch('/api/chat/sync-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messageIds: msgIds, waSettings })
          });

          if (syncRes.ok) {
            const resData = await syncRes.json();
            if (resData?.statusMap && Object.keys(resData.statusMap).length > 0) {
              setMessages((prev) =>
                prev.map((m) => {
                  const newStatus = resData.statusMap[m.id];
                  if (newStatus) {
                    let meta: any = {};
                    try {
                      meta = typeof m.media_url === 'string' && m.media_url.startsWith('{') ? JSON.parse(m.media_url) : {};
                    } catch (e) {}
                    if (meta.status !== newStatus) {
                      return {
                        ...m,
                        media_url: JSON.stringify({ ...meta, status: newStatus }),
                        status: newStatus
                      };
                    }
                  }
                  return m;
                })
              );
            }
          }
        }
      } catch (e) {}
    };

    // Executa sincronização inicial após carregamento
    setTimeout(() => {
      runSyncStatus();
    }, 400);

    const syncStatusInterval = setInterval(runSyncStatus, 2000);

    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);

    return () => {
      isMounted = false;
      clearInterval(syncStatusInterval);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [isOpen, client?.id, visit?.id, scrollToBottom, waSettings]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || !session || session.status === 'closed' || timeLeft === 0) return;
    
    setNewMessage('');
    
    try {
      // 1. Insert into Supabase from the client (authenticated)
      const initialMetadata = { status: 'sending' };
      const { data: insertedMsg } = await supabase.from('chat_messages').insert({
        session_id: session.id,
        sender_type: 'tech',
        content: text,
        media_url: JSON.stringify(initialMetadata)
      }).select().single();

      if (insertedMsg) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === insertedMsg.id)) return prev;
          return [...prev, insertedMsg];
        });
        requestAnimationFrame(() => scrollToBottom(true));
      }

      // 2. Marca como lido no sistema
      markClientChatAsRead(client.id, supabase);

      // 3. Resolve configurações de WhatsApp (inclusive para colaboradores/funcionários)
      let currentSettings = { ...(waSettings || {}) };
      const adminId = userProfile?.role === 'admin' ? userProfile?.uid : userProfile?.adminId;

      if (adminId && (!currentSettings.metaToken && !currentSettings.evolutionApiKey)) {
        try {
          const { data: adminData } = await supabase
            .from('users')
            .select('whatsapp_settings')
            .eq('id', adminId)
            .single();
          if (adminData?.whatsapp_settings) {
            currentSettings = { ...currentSettings, ...adminData.whatsapp_settings };
          }
        } catch (adminErr) {
          console.error('Erro ao buscar whatsapp_settings do administrador:', adminErr);
        }
      }

      const clientPhone = client.local_phone || client.phone || '';
      if (clientPhone) {
        let sentDirectly = false;
        let externalId = '';

        // Disparo direto (funciona nativamente no APK Android e navegadores com suporte a fetch direto)
        if (currentSettings.useMetaApi && currentSettings.metaToken) {
          try {
            const res = await sendMetaMessage(clientPhone, text, currentSettings);
            sentDirectly = true;
            if (res?.key?.id) externalId = res.key.id;
            else if (res?.data?.key?.id) externalId = res.data.key.id;
            else if (res?.messages?.[0]?.id) externalId = res.messages[0].id;
            else if (res?.id) externalId = res.id;
          } catch (metaErr) {
            console.warn('[ChatModal] Envio direto via Meta falhou, tentando fallback do backend:', metaErr);
          }
        } else if (currentSettings.useEvolutionApi && currentSettings.evolutionApiKey) {
          try {
            const res = await sendEvolutionMessage(clientPhone, text, currentSettings);
            sentDirectly = true;
            if (res?.key?.id) externalId = res.key.id;
            else if (res?.messageId) externalId = res.messageId;
          } catch (evoErr) {
            console.warn('[ChatModal] Envio direto via Evolution falhou, tentando fallback do backend:', evoErr);
          }
        }

        // Se não foi enviado diretamente (ex: CORS no ambiente web), tenta via rota /api/chat/send
        if (!sentDirectly) {
          try {
            const apiRes = await fetch('/api/chat/send', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                text,
                clientPhone,
                waSettings: currentSettings
              })
            });
            if (apiRes.ok) {
              const apiData = await apiRes.json().catch(() => null);
              if (apiData?.externalId) externalId = apiData.externalId;
            }
          } catch (apiErr) {
            console.error('[ChatModal] Erro ao enviar mensagem pelo backend:', apiErr);
          }
        }

        // Atualiza status da mensagem para 'sent' com o externalId
        if (insertedMsg?.id) {
          const finalMetadata = { status: 'sent', external_id: externalId || undefined };
          await supabase
            .from('chat_messages')
            .update({ media_url: JSON.stringify(finalMetadata) })
            .eq('id', insertedMsg.id);
        }
      }
    } catch (e) {
      console.error('Error sending msg', e);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl w-full max-w-lg shadow-2xl flex flex-col h-[600px] max-h-[90vh]">
        
        <div className="flex justify-between items-center p-4 border-b">
          <div>
            <h2 className="text-lg font-bold text-gray-800 flex items-center">
              <MessageCircle className="mr-2 text-blue-600" size={20} />
              Chat: {client?.name}
            </h2>
            {session?.status === 'closed' || timeLeft === 0 ? (
              <span className="text-xs text-red-500 font-semibold flex items-center mt-1">
                <Clock size={12} className="mr-1"/> Sessão Finalizada
              </span>
            ) : (
              <span className="text-xs text-green-500 font-semibold flex items-center mt-1">
                <Clock size={12} className="mr-1"/> Sessão Ativa {timeLeft !== null && `(Expira em ${formatTime(timeLeft)})`}
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-red-500 transition-colors">
            <X size={24} />
          </button>
        </div>

        <div 
          ref={messagesContainerRef}
          className="flex-1 overflow-y-auto p-4 bg-gray-50 space-y-4"
        >
          {loading ? (
            <div className="flex justify-center mt-10">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center text-gray-500 mt-10 text-sm">
              Nenhuma mensagem ainda. Use os botões abaixo para avisar o cliente.
            </div>
          ) : (
            messages.map((msg, idx) => {
              const parsedMedia = (() => {
                if (!msg.media_url) return null;
                if (typeof msg.media_url === 'string' && msg.media_url.trim().startsWith('{') && msg.media_url.trim().endsWith('}')) {
                  try {
                    return JSON.parse(msg.media_url);
                  } catch (e) {}
                }
                return { url: msg.media_url };
              })();

              const realMediaUrl = parsedMedia?.url;
              
              // Se o cliente já enviou alguma mensagem posterior no chat, esta mensagem foi visualizada
              const hasClientReplyAfter = messages.some(
                (other) =>
                  other.sender_type === 'client' &&
                  new Date(other.created_at).getTime() >= new Date(msg.created_at).getTime()
              );

              let deliveryStatus = parsedMedia?.status || msg.status || 'sent';
              if (hasClientReplyAfter) {
                deliveryStatus = 'read';
              }

              return (
                <div key={msg.id || idx} className={`flex ${msg.sender_type === 'tech' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-2xl px-4 py-2 shadow-sm ${
                    msg.sender_type === 'tech' 
                      ? 'bg-blue-600 text-white rounded-br-none' 
                      : 'bg-white text-gray-800 border border-gray-100 rounded-bl-none'
                  }`}>
                    {msg.sender_type !== 'tech' && (
                      <div className="text-xs font-bold text-gray-500 mb-1 flex items-center">
                        <User size={10} className="mr-1"/> Cliente
                      </div>
                    )}
                    
                    {realMediaUrl ? (
                      (realMediaUrl.includes('audio') || msg.content.includes('Áudio') || realMediaUrl.includes('.ogg') || realMediaUrl.includes('.mp3')) && !realMediaUrl.includes('image') ? (
                        <div>
                          <p className="text-sm text-gray-500 mb-1">{msg.content}</p>
                          <AudioViewer url={realMediaUrl} className="max-w-[220px] md:max-w-[300px]" />
                        </div>
                      ) : (
                        <MediaViewer 
                          url={realMediaUrl} 
                          alt="Mídia" 
                          onLoad={() => scrollToBottom(false)}
                          className="max-w-full md:max-w-[300px] max-h-[300px] object-cover rounded-lg cursor-pointer hover:opacity-90" 
                        />
                      )
                    ) : (
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    )}
                    
                    <div className={`text-[10px] mt-1 flex items-center gap-1 ${msg.sender_type === 'tech' ? 'text-blue-100 justify-end' : 'text-gray-400 justify-start'}`}>
                      <span>{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      {msg.sender_type === 'tech' && (
                        deliveryStatus === 'read' ? (
                          <span title="Visualizada pelo cliente" className="inline-flex items-center">
                            <CheckCheck size={15} className="text-[#53bdeb] font-bold ml-0.5" />
                          </span>
                        ) : deliveryStatus === 'delivered' ? (
                          <span title="Entregue ao cliente" className="inline-flex items-center">
                            <CheckCheck size={15} className="text-white/80 ml-0.5" />
                          </span>
                        ) : deliveryStatus === 'sending' ? (
                          <span title="Enviando..." className="inline-flex items-center">
                            <Clock size={12} className="text-white/60 ml-0.5" />
                          </span>
                        ) : (
                          <span title="Enviada" className="inline-flex items-center">
                            <Check size={15} className="text-white/70 ml-0.5" />
                          </span>
                        )
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {session?.status === 'open' && timeLeft !== 0 ? (
          <div className="p-4 bg-white border-t rounded-b-xl">
            {/* Quick Actions */}
            <div className="flex gap-2 mb-3 overflow-x-auto pb-2 scrollbar-hide">
              <button onClick={() => sendMessage("Olá, estou indo realizar a limpeza da sua piscina.")} className="whitespace-nowrap px-3 py-1.5 bg-blue-50 text-blue-700 text-xs font-semibold rounded-full hover:bg-blue-100 transition-colors">
                🚗 Estou a caminho
              </button>
              <button onClick={() => sendMessage("Cheguei, estou aguardando aqui na frente")} className="whitespace-nowrap px-3 py-1.5 bg-blue-50 text-blue-700 text-xs font-semibold rounded-full hover:bg-blue-100 transition-colors">
                📍 Cheguei
              </button>
            </div>
            
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendMessage(newMessage)}
                placeholder="Digite uma mensagem..."
                className="flex-1 bg-gray-100 border-transparent focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 rounded-full px-4 py-2 text-sm transition-all"
              />
              <button 
                onClick={() => sendMessage(newMessage)}
                disabled={!newMessage.trim()}
                className="bg-blue-600 text-white p-2.5 rounded-full hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Send size={18} />
              </button>
            </div>
          </div>
        ) : (
          <div className="p-3 bg-gray-100 border-t rounded-b-xl text-center">
            <p className="text-xs text-gray-500 font-medium">
              Sessão encerrada (Limite diário estrito). Novo atendimento disponível amanhã a partir das 00:00.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
// Atualização de segurança para renderização de mídia

