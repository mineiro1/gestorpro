import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { X, Send, User, MessageCircle, Clock } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MediaViewer, AudioViewer } from './chat/MediaViewer';
import { MessageStatus, parseMessageStatus } from './chat/MessageStatus';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { evaluateSessionExpiry, checkDailyChatAvailability, markClientChatAsRead } from '../lib/chatSessionUtils';

export function ChatModal({ isOpen, onClose, visit, client, waSettings }: any) {
  const { userProfile } = useAuth();
  const queryClient = useQueryClient();
  const [newMessage, setNewMessage] = useState('');
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isInitialScrollDoneRef = useRef(false);
  const isSyncingRef = useRef(false);
  const isSendingRef = useRef(false);
  const recentSentTextRef = useRef<Map<string, number>>(new Map());

  const clientId = client?.id;

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

  // 1. React Query: Carregar Sessão Ativa e Disponibilidade
  const { data: sessionData } = useQuery({
    queryKey: ['chat-session', clientId],
    queryFn: async () => {
      if (!clientId) return null;
      const [check, sessionsRes] = await Promise.all([
        checkDailyChatAvailability(clientId, supabase),
        supabase
          .from('chat_sessions')
          .select('id, status, created_at, closed_at')
          .eq('client_id', clientId)
          .order('created_at', { ascending: false })
      ]);

      const allSessions = sessionsRes.data || [];
      const session = check.activeSession || allSessions.find((s: any) => s.status === 'open' || s.status === 'active') || check.lastSession || allSessions[0] || { status: 'closed' };
      const sessionIds = new Set<string>();
      allSessions.forEach((s: any) => sessionIds.add(s.id));
      if (session?.id) sessionIds.add(session.id);

      return { session, sessionIds: Array.from(sessionIds) };
    },
    enabled: !!isOpen && !!clientId,
    staleTime: 1000 * 15,
  });

  const session = sessionData?.session || null;

  // 2. React Query: Carregar Mensagens com Polling Inteligente e Estável
  const { data: messages = [], isLoading: loadingMessages } = useQuery<any[]>({
    queryKey: ['chat-messages', clientId],
    queryFn: async () => {
      if (!clientId) return [];
      
      // Busca todas as sessões do cliente
      const { data: sData } = await supabase
        .from('chat_sessions')
        .select('id')
        .eq('client_id', clientId);

      if (!sData || sData.length === 0) return [];
      const sessionIds = sData.map((s) => s.id);

      const { data: loadedMsgs, error } = await supabase
        .from('chat_messages')
        .select('*')
        .in('session_id', sessionIds)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('[ChatModal] Erro ao carregar mensagens:', error);
        return [];
      }

      // Deduplicação e filtragem
      const map = new Map<string, any>();
      (loadedMsgs || []).forEach((m) => {
        if (m && m.id && m.sender_type !== 'read') {
          map.set(m.id, m);
        }
      });

      return Array.from(map.values()).sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    },
    enabled: !!isOpen && !!clientId,
    refetchInterval: 2500, // Polling de mensagens leve em segundo plano
    refetchOnWindowFocus: true,
    staleTime: 1000,
  });

  // Mensagens do colaborador que ainda não foram confirmadas como lidas
  const unreadTechMsgIds = useMemo(() => {
    return messages
      .filter((m) => {
        if (m.sender_type !== 'tech') return false;
        let status = 'sent';
        try {
          const meta = typeof m.media_url === 'string' && m.media_url.startsWith('{') ? JSON.parse(m.media_url) : {};
          status = meta.status || m.status || 'sent';
        } catch (e) {}
        return status !== 'read';
      })
      .map((m) => m.id)
      .filter(Boolean);
  }, [messages]);

  // 3. Sincronização Ativa de Status de Entrega/Leitura (WhatsApp)
  const runSyncStatus = useCallback(async () => {
    if (!isOpen || !clientId || isSyncingRef.current || unreadTechMsgIds.length === 0) return;

    isSyncingRef.current = true;
    try {
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
        } catch (e) {}
      }

      const syncRes = await fetch('/api/chat/sync-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageIds: unreadTechMsgIds, waSettings: currentSettings })
      });

      if (syncRes.ok) {
        const resData = await syncRes.json();
        if (resData?.statusMap && Object.keys(resData.statusMap).length > 0) {
          queryClient.setQueryData(['chat-messages', clientId], (prev: any[] | undefined) => {
            if (!prev) return prev;
            let changed = false;
            const next = prev.map((m) => {
              const newStatus = resData.statusMap[m.id];
              if (newStatus) {
                let meta: any = {};
                try {
                  meta = typeof m.media_url === 'string' && m.media_url.startsWith('{') ? JSON.parse(m.media_url) : {};
                } catch (e) {}
                if (meta.status !== newStatus) {
                  changed = true;
                  return {
                    ...m,
                    media_url: JSON.stringify({ ...meta, status: newStatus }),
                    status: newStatus
                  };
                }
              }
              return m;
            });
            return changed ? next : prev;
          });
        }
      }
    } catch (err) {
      console.warn('[ChatModal] Erro no sync status:', err);
    } finally {
      isSyncingRef.current = false;
    }
  }, [isOpen, clientId, unreadTechMsgIds, waSettings, userProfile, queryClient]);

  // Loop de polling de status enquanto houver mensagens não lidas
  useEffect(() => {
    if (!isOpen || !clientId || unreadTechMsgIds.length === 0) return;
    runSyncStatus();
    const interval = setInterval(runSyncStatus, 1500);
    return () => clearInterval(interval);
  }, [isOpen, clientId, unreadTechMsgIds.length, runSyncStatus]);

  // 4. Inscrição em Tempo Real (Supabase Realtime) com Atualização Atômica do Cache
  useEffect(() => {
    if (!isOpen || !clientId) return;

    markClientChatAsRead(clientId, supabase);
    isInitialScrollDoneRef.current = false;

    const channelName = `chat-modal-rq-${clientId}-${Date.now()}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'chat_messages'
      }, async (payload) => {
        const newMsg = (payload.new || payload.old) as any;
        if (!newMsg || newMsg.sender_type === 'read') return;

        // Atualiza diretamente o cache do React Query sem duplicar mensagens
        queryClient.setQueryData(['chat-messages', clientId], (prev: any[] | undefined) => {
          let list = prev ? [...prev] : [];

          // Remove mensagens temporárias otimistas que coincidam
          if (newMsg.sender_type === 'tech') {
            list = list.filter(m => !m.id || !String(m.id).startsWith('temp-') || m.content !== newMsg.content);
          }

          const idx = list.findIndex((m) => m.id === newMsg.id);
          if (idx >= 0) {
            list[idx] = { ...list[idx], ...newMsg };
          } else {
            list.push(newMsg);
          }
          return list.sort(
            (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );
        });

        if (payload.eventType === 'INSERT' && newMsg.sender_type === 'client') {
          markClientChatAsRead(clientId, supabase);
          scrollToBottom(true);
        }
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'chat_sessions',
        filter: `client_id=eq.${clientId}`
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['chat-session', clientId] });
        queryClient.invalidateQueries({ queryKey: ['chat-messages', clientId] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isOpen, clientId, queryClient, scrollToBottom]);

  // Timer countdown para a sessão ativa
  useEffect(() => {
    if (session?.status === 'open' && session.created_at) {
      const updateTimer = () => {
        const evaluation = evaluateSessionExpiry(session);
        if (evaluation.isExpired) {
          setTimeLeft(0);
          queryClient.invalidateQueries({ queryKey: ['chat-session', clientId] });
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
  }, [session, clientId, queryClient]);

  // Controle de Rolagem Automática
  useEffect(() => {
    if (messages.length === 0) return;

    if (!isInitialScrollDoneRef.current) {
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
      scrollToBottom(true);
      const t = setTimeout(() => scrollToBottom(true), 80);
      return () => clearTimeout(t);
    }
  }, [messages, scrollToBottom]);

  // 5. React Query Mutation: Envio Otimista e Estável de Mensagens com Idempotência
  const sendMutation = useMutation({
    mutationFn: async ({ text, message_client_id }: { text: string; message_client_id: string }) => {
      let currentSession = session;
      if (!currentSession || currentSession.status === 'closed') {
        const { data: newSess } = await supabase
          .from('chat_sessions')
          .insert({
            client_id: clientId,
            visit_id: visit?.id || null,
            admin_id: userProfile?.role === 'admin' ? userProfile.uid : userProfile?.adminId,
            status: 'open',
            created_at: new Date().toISOString()
          })
          .select()
          .single();

        if (newSess) {
          currentSession = newSess;
          queryClient.setQueryData(['chat-session', clientId], { session: newSess, sessionIds: [newSess.id] });
        }
      }

      const sessionId = currentSession?.id;
      if (!sessionId) throw new Error('Não foi possível iniciar a sessão de chat');

      const initialMetadata = { status: 'sending', message_client_id };
      const { data: insertedMsg, error: insertErr } = await supabase
        .from('chat_messages')
        .insert({
          session_id: sessionId,
          sender_type: 'tech',
          content: text,
          media_url: JSON.stringify(initialMetadata)
        })
        .select()
        .single();

      if (insertErr) throw insertErr;

      // Resolve configurações de WhatsApp
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
        } catch (e) {}
      }

      const clientPhone = client.local_phone || client.phone || '';
      let externalId = '';

      if (clientPhone) {
        try {
          const apiRes = await fetch('/api/chat/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text,
              clientPhone,
              waSettings: currentSettings,
              messageId: insertedMsg.id,
              senderName: userProfile?.name || 'Colaborador',
              message_client_id
            })
          });
          if (apiRes.ok) {
            const apiData = await apiRes.json().catch(() => null);
            if (apiData?.externalId) externalId = apiData.externalId;
          }
        } catch (apiErr) {
          console.error('[ChatModal] Erro no envio via backend:', apiErr);
        }
      }

      return { ...insertedMsg, media_url: JSON.stringify({ status: 'sent', external_id: externalId || undefined, message_client_id, sent_at: new Date().toISOString() }) };
    },
    onMutate: async ({ text, message_client_id }: { text: string; message_client_id: string }) => {
      // Atualização Otimista Instantânea (0ms)
      const tempId = `temp-${message_client_id}`;
      const optimisticMsg = {
        id: tempId,
        session_id: session?.id || 'temp-sess',
        sender_type: 'tech',
        content: text,
        media_url: JSON.stringify({ status: 'sending', message_client_id }),
        created_at: new Date().toISOString()
      };

      queryClient.setQueryData(['chat-messages', clientId], (prev: any[] | undefined) => {
        return [...(prev || []), optimisticMsg];
      });

      requestAnimationFrame(() => scrollToBottom(true));
      return { tempId };
    },
    onSuccess: (newInsertedMsg, _vars, context) => {
      // Atualiza o cache local substituindo o tempId pelo registro real
      queryClient.setQueryData(['chat-messages', clientId], (prev: any[] | undefined) => {
        if (!prev) return [newInsertedMsg];
        const filtered = prev.filter(m => m.id !== context?.tempId && m.id !== newInsertedMsg.id);
        return [...filtered, newInsertedMsg].sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
      });

      queryClient.invalidateQueries({ queryKey: ['chat-messages', clientId] });
      queryClient.invalidateQueries({ queryKey: ['chat-session', clientId] });
      // Dispara checagem rápida de status após o envio
      setTimeout(runSyncStatus, 400);
      setTimeout(runSyncStatus, 1200);
      setTimeout(runSyncStatus, 2500);
    },
    onError: (err) => {
      console.error('[ChatModal] Erro ao enviar mensagem:', err);
      queryClient.invalidateQueries({ queryKey: ['chat-messages', clientId] });
    },
    onSettled: () => {
      isSendingRef.current = false;
    }
  });

  const handleSendMessage = (textToSend: string) => {
    const trimmed = textToSend.trim();
    if (!trimmed || isSendingRef.current || sendMutation.isPending) return;

    // Proteção de Idempotência no frontend: previne múltiplos envios idênticos em menos de 3s
    const now = Date.now();
    const lastTime = recentSentTextRef.current.get(trimmed) || 0;
    if (now - lastTime < 3000) {
      console.warn('[ChatModal] Ignorando envio repetido no cliente:', trimmed);
      return;
    }
    recentSentTextRef.current.set(trimmed, now);

    isSendingRef.current = true;
    setNewMessage('');
    const message_client_id = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    sendMutation.mutate({ text: trimmed, message_client_id });
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg flex flex-col h-[600px] max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 bg-primary text-white flex justify-between items-center rounded-t-xl shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white font-bold">
              {client.name ? client.name.charAt(0).toUpperCase() : <User size={20} />}
            </div>
            <div>
              <h3 className="font-bold text-lg leading-tight flex items-center gap-2">
                {client.name}
              </h3>
              <div className="flex items-center gap-1.5 mt-0.5">
                {session?.status === 'open' ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-500/30 text-emerald-100 rounded-full text-[11px] font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
                    Atendimento Ativo
                  </span>
                ) : (
                  <span className="text-xs text-blue-100/80 font-medium">
                    WhatsApp
                  </span>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            {session?.status === 'open' && timeLeft !== null && timeLeft > 0 && (
              <div className="flex items-center space-x-1 bg-white/20 px-2.5 py-1 rounded-full text-xs font-mono">
                <Clock size={12} className="animate-spin-slow" />
                <span>{formatTime(timeLeft)}</span>
              </div>
            )}
            <button 
              onClick={onClose}
              className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Messages Body */}
        <div ref={messagesContainerRef} className="flex-1 p-4 overflow-y-auto space-y-3 bg-gray-50/60">
          {loadingMessages && messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-xs font-medium">Carregando mensagens...</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 space-y-2">
              <MessageCircle size={40} className="stroke-[1.5] text-gray-300" />
              <p className="text-sm font-medium">Nenhuma mensagem nesta conversa.</p>
              <p className="text-xs text-gray-400 text-center max-w-[240px]">
                Envie uma mensagem abaixo para iniciar o atendimento no WhatsApp.
              </p>
            </div>
          ) : (
            messages.map((msg: any) => {
              const deliveryStatus = parseMessageStatus(msg, messages);
              let realMediaUrl = '';
              try {
                if (typeof msg.media_url === 'string') {
                  if (msg.media_url.startsWith('{')) {
                    const parsed = JSON.parse(msg.media_url);
                    realMediaUrl = parsed.url || '';
                  } else {
                    realMediaUrl = msg.media_url;
                  }
                }
              } catch (e) {
                realMediaUrl = msg.media_url || '';
              }

              return (
                <div 
                  key={msg.id} 
                  className={`flex ${msg.sender_type === 'tech' ? 'justify-end' : 'justify-start'}`}
                >
                  <div 
                    className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 shadow-xs ${
                      msg.sender_type === 'tech' 
                        ? 'bg-primary text-white rounded-br-xs' 
                        : 'bg-white text-gray-800 border border-gray-100 rounded-bl-xs'
                    }`}
                  >
                    {msg.sender_name && (
                      <div className={`text-[10px] font-semibold mb-1 ${msg.sender_type === 'tech' ? 'text-blue-200' : 'text-primary'}`}>
                        {msg.sender_name}
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
                        <MessageStatus
                          status={deliveryStatus}
                          size={15}
                          isBubbleOnPrimary={true}
                        />
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input & Quick Actions Footer */}
        <div className="p-4 bg-white border-t border-gray-100 rounded-b-xl shrink-0">
          <div className="flex gap-2 mb-3 overflow-x-auto pb-1 scrollbar-hide">
            <button 
              onClick={() => handleSendMessage("Olá, estou indo realizar a limpeza da sua piscina.")} 
              disabled={sendMutation.isPending}
              className="whitespace-nowrap px-3 py-1.5 bg-blue-50 text-blue-700 text-xs font-semibold rounded-full hover:bg-blue-100 transition-colors disabled:opacity-50"
            >
              🚗 Estou a caminho
            </button>
            <button 
              onClick={() => handleSendMessage("Cheguei, estou aguardando aqui na frente")} 
              disabled={sendMutation.isPending}
              className="whitespace-nowrap px-3 py-1.5 bg-blue-50 text-blue-700 text-xs font-semibold rounded-full hover:bg-blue-100 transition-colors disabled:opacity-50"
            >
              📍 Cheguei
            </button>
          </div>
          
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage(newMessage);
                }
              }}
              placeholder="Digite uma mensagem..."
              disabled={sendMutation.isPending}
              className="flex-1 bg-gray-100 border-transparent focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 rounded-full px-4 py-2 text-sm transition-all disabled:bg-gray-50"
            />
            <button 
              onClick={() => handleSendMessage(newMessage)}
              disabled={!newMessage.trim() || sendMutation.isPending}
              className="bg-primary text-white p-2.5 rounded-full hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center min-w-[40px] min-h-[40px] shadow-sm"
            >
              <Send size={18} className={sendMutation.isPending ? 'animate-pulse' : ''} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
