import React, { useState, useEffect, useRef } from 'react';
import { X, Send, User, MessageCircle, Clock } from 'lucide-react';
import { MediaViewer, AudioViewer } from './chat/MediaViewer';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { evaluateSessionExpiry, checkDailyChatAvailability, markClientChatAsRead } from '../lib/chatSessionUtils';

export function ChatModal({ isOpen, onClose, visit, client, waSettings }: any) {
  const { userProfile } = useAuth();
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const clientSessionIdsRef = useRef<Set<string>>(new Set());

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

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Main lifecycle: load session, load messages, mark as read, subscribe in real-time
  useEffect(() => {
    if (!isOpen || !client?.id) {
      setMessages([]);
      setSession(null);
      setLoading(false);
      clientSessionIdsRef.current = new Set();
      return;
    }

    let isMounted = true;
    let channel: any = null;

    const setupChat = async () => {
      setLoading(true);
      setMessages([]);
      
      try {
        // 1. Marca imediatamente como lido em todos os dispositivos
        markClientChatAsRead(client.id, supabase);

        // 2. Busca disponibilidade diária e sessão ativa
        const check = await checkDailyChatAvailability(client.id, supabase);
        if (!isMounted) return;

        let currentSession = null;

        if (check.activeSession) {
          currentSession = check.activeSession;
        } else if (check.canStartNewSession && !visit?.isCompleted && visit?.status !== 'finalizada') {
          const adminId = userProfile?.role === 'admin' ? userProfile.uid : userProfile?.adminId;
          
          const { data: newSession, error: createError } = await supabase
            .from('chat_sessions')
            .insert({
              visit_id: visit?.id || null,
              admin_id: adminId,
              client_id: client.id,
              employee_id: userProfile?.uid,
              status: 'open',
              created_at: new Date().toISOString()
            }).select().single();

          if (!createError && newSession) {
            currentSession = newSession;
          }
        } else if (check.lastSession) {
          currentSession = { ...check.lastSession, status: 'closed' };
        }
        
        if (!currentSession) {
          currentSession = { status: 'closed' };
        }
        
        if (!isMounted) return;
        setSession(currentSession);

        // 3. Carrega histórico de mensagens de todas as sessões do cliente
        const { data: allSessions } = await supabase
          .from('chat_sessions')
          .select('id')
          .eq('client_id', client.id);

        const sessionIds = new Set<string>();
        if (allSessions) {
          allSessions.forEach((s: any) => sessionIds.add(s.id));
        }
        if (currentSession?.id) {
          sessionIds.add(currentSession.id);
        }
        clientSessionIdsRef.current = sessionIds;

        if (sessionIds.size > 0) {
          const { data: loadedMsgs } = await supabase
            .from('chat_messages')
            .select('*')
            .in('session_id', Array.from(sessionIds))
            .order('created_at', { ascending: true });

          if (isMounted && loadedMsgs) {
            setMessages(loadedMsgs.filter((m: any) => m.sender_type !== 'read'));
          }
        }

        // 4. Cria inscrição em tempo real dedicada para novas mensagens
        const channelName = `chat-modal-${client.id}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        channel = supabase
          .channel(channelName)
          .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'chat_messages'
          }, (payload) => {
            if (!isMounted) return;
            const newMsg = payload.new as any;
            if (!newMsg) return;

            // Verifica se a mensagem pertence a alguma sessão do cliente aberto
            if (clientSessionIdsRef.current.has(newMsg.session_id) || newMsg.session_id === currentSession?.id) {
              if (newMsg.sender_type !== 'read') {
                setMessages((prev) => {
                  if (prev.some((m) => m.id === newMsg.id)) return prev;
                  return [...prev, newMsg];
                });
              }
              // Marca como lido globalmente se for mensagem de cliente
              if (newMsg.sender_type === 'client') {
                markClientChatAsRead(client.id, supabase);
              }
            }
          })
          .subscribe();

      } catch (err) {
        console.error('[ChatModal] Erro ao carregar mensagens:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    setupChat();

    return () => {
      isMounted = false;
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [isOpen, client?.id, visit?.id]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || !session || session.status === 'closed' || timeLeft === 0) return;
    
    setNewMessage('');
    
    try {
      // 1. Insert into Supabase from the client (authenticated)
      const { data: insertedMsg } = await supabase.from('chat_messages').insert({
        session_id: session.id,
        sender_type: 'tech',
        content: text
      }).select().single();

      if (insertedMsg) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === insertedMsg.id)) return prev;
          return [...prev, insertedMsg];
        });
      }

      // 2. Marca como lido no sistema
      markClientChatAsRead(client.id, supabase);

      // 3. Dispatch to backend to send via Evolution (bypasses CORS)
      await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          clientPhone: client.local_phone || client.phone,
          waSettings
        })
      });
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

        <div className="flex-1 overflow-y-auto p-4 bg-gray-50 space-y-4">
          {loading ? (
            <div className="flex justify-center mt-10">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center text-gray-500 mt-10 text-sm">
              Nenhuma mensagem ainda. Use os botões abaixo para avisar o cliente.
            </div>
          ) : (
            messages.map((msg, idx) => (
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
                  
                  {msg.media_url ? (
                    (msg.media_url.includes('audio') || msg.content.includes('Áudio') || msg.media_url.includes('.ogg') || msg.media_url.includes('.mp3')) && !msg.media_url.includes('image') ? (
                      <div>
                        <p className="text-sm text-gray-500 mb-1">{msg.content}</p>
                        <AudioViewer url={msg.media_url} className="max-w-[220px] md:max-w-[300px]" />
                      </div>
                    ) : (
                      <MediaViewer url={msg.media_url} alt="Mídia" className="max-w-full md:max-w-[300px] max-h-[300px] object-cover rounded-lg cursor-pointer hover:opacity-90" />
                    )
                  ) : (
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  )}
                  
                  <span className={`text-[10px] block mt-1 ${msg.sender_type === 'tech' ? 'text-blue-200 text-right' : 'text-gray-400'}`}>
                    {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            ))
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
