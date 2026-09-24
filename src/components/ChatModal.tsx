import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { X, Send, User, MessageCircle, Clock, Phone, Mic, Square, Paperclip, Image as ImageIcon, Trash2, Check, Loader2 } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MediaViewer, AudioViewer } from './chat/MediaViewer';
import { MessageStatus, parseMessageStatus } from './chat/MessageStatus';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { evaluateSessionExpiry, checkDailyChatAvailability, markClientChatAsRead } from '../lib/chatSessionUtils';
import { getApiUrl } from '../lib/apiConfig';
import { sendMetaMessage, sendEvolutionMessage } from '../lib/whatsapp';

export function ChatModal({ isOpen, onClose, visit, client, waSettings }: any) {
  const { userProfile } = useAuth();
  const queryClient = useQueryClient();
  const [newMessage, setNewMessage] = useState('');
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  // Estados para Mídia e Áudio
  const [selectedMedia, setSelectedMedia] = useState<{
    file: File;
    previewUrl: string;
    type: 'image' | 'video';
    mimeType: string;
    base64: string;
  } | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordingError, setRecordingError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<any>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isInitialScrollDoneRef = useRef(false);
  const isSyncingRef = useRef(false);
  const isSendingRef = useRef(false);
  const recentSentTextRef = useRef<Map<string, number>>(new Map());

  const clientId = client?.id;
  const clientPhone = client?.local_phone || client?.phone || '';
  const cleanPhoneDigits = clientPhone ? String(clientPhone).replace(/\D/g, '') : '';

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
      try {
        const sessionUrl = getApiUrl(`/api/chat/session/${clientId}`);
        const res = await fetch(sessionUrl);
        if (res.ok) {
          const sJson = await res.json();
          if (sJson?.session) {
            const allSessions = sJson.allSessions || [sJson.session];
            const sessionIds = Array.from(new Set(allSessions.map((s: any) => s.id)));
            return { session: sJson.session, sessionIds };
          }
        }
      } catch (apiErr) {
        console.warn('[ChatModal] Falha ao consultar sessão via backend:', apiErr);
      }

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
      
      let loadedMsgs: any[] = [];

      // Tentativa 1: Via backend endpoint autenticado
      try {
        const msgsUrl = getApiUrl(`/api/chat/messages/${clientId}`);
        const res = await fetch(msgsUrl);
        if (res.ok) {
          const mJson = await res.json();
          if (Array.isArray(mJson?.messages)) {
            loadedMsgs = mJson.messages;
          }
        }
      } catch (apiErr) {
        console.warn('[ChatModal] Falha ao carregar mensagens via backend:', apiErr);
      }

      // Tentativa 2: Fallback direto no Supabase
      if (loadedMsgs.length === 0) {
        const { data: sData } = await supabase
          .from('chat_sessions')
          .select('id')
          .eq('client_id', clientId);

        if (sData && sData.length > 0) {
          const sessionIds = sData.map((s) => s.id);
          const { data: directMsgs } = await supabase
            .from('chat_messages')
            .select('*')
            .in('session_id', sessionIds)
            .order('created_at', { ascending: true });
          if (directMsgs) loadedMsgs = directMsgs;
        }
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
    refetchInterval: 2500,
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

      const syncUrl = getApiUrl('/api/chat/sync-status');
      const syncRes = await fetch(syncUrl, {
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

  // 4. Inscrição em Tempo Real (Supabase Realtime)
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

        queryClient.setQueryData(['chat-messages', clientId], (prev: any[] | undefined) => {
          let list = prev ? [...prev] : [];

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
          queryClient.invalidateQueries({ queryKey: ['chat-messages', clientId] });
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

  // Cleanup na desmontagem / fechamento do modal
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  // 5. React Query Mutation: Envio de Texto, Fotos, Vídeos e Áudio com Idempotência
  const sendMutation = useMutation({
    mutationFn: async ({
      text,
      message_client_id,
      mediaBase64,
      mimeType,
      isAudio
    }: {
      text: string;
      message_client_id: string;
      mediaBase64?: string;
      mimeType?: string;
      isAudio?: boolean;
    }) => {
      let currentSession = session;
      const admId = client?.admin_id || (userProfile?.role === 'admin' ? userProfile.uid : (userProfile?.adminId || userProfile?.uid));
      const empId = userProfile?.uid || admId;

      // 1. Garantir que temos uma sessão ativa via API Backend Segura (/api/chat/session/ensure)
      if (!currentSession || currentSession.status === 'closed' || !currentSession.id) {
        try {
          const sessionRes = await fetch(getApiUrl('/api/chat/session/ensure'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              clientId,
              adminId: admId,
              employeeId: empId,
              visitId: visit?.id || null
            })
          });

          if (sessionRes.ok) {
            const sessData = await sessionRes.json().catch(() => null);
            if (sessData?.session) {
              currentSession = sessData.session;
              queryClient.setQueryData(['chat-session', clientId], { session: currentSession, sessionIds: [currentSession.id] });
            }
          }
        } catch (sessEnsureErr) {
          console.warn('[ChatModal] Aviso ao garantir sessão via API:', sessEnsureErr);
        }
      }

      // Fallback de sessão caso a API não tenha respondido
      const sessionId = currentSession?.id;

      // Resolve configurações de WhatsApp
      let currentSettings = { ...(waSettings || {}), ...(userProfile?.whatsappSettings || {}) };
      const adminId = userProfile?.role === 'admin' ? userProfile?.uid : (userProfile?.adminId || userProfile?.uid);

      if (!currentSettings.metaToken && !currentSettings.evolutionApiKey) {
        try {
          if (adminId) {
            const { data: adminData } = await supabase
              .from('users')
              .select('whatsapp_settings')
              .eq('id', adminId)
              .maybeSingle();
            if (adminData?.whatsapp_settings) {
              currentSettings = { ...currentSettings, ...adminData.whatsapp_settings };
            }
          }
          if (!currentSettings.metaToken && !currentSettings.evolutionApiKey) {
            const { data: allUsers } = await supabase
              .from('users')
              .select('whatsapp_settings')
              .not('whatsapp_settings', 'is', null);
            const foundAdmin = allUsers?.find((u: any) => u.whatsapp_settings?.metaToken || u.whatsapp_settings?.evolutionApiKey);
            if (foundAdmin?.whatsapp_settings) {
              currentSettings = { ...currentSettings, ...foundAdmin.whatsapp_settings };
            }
          }
        } catch (e) {
          console.warn('[ChatModal] Erro ao buscar configurações de WhatsApp:', e);
        }
      }

      let externalId = '';
      let sentSuccess = false;
      let sendError: string | null = null;
      let insertedMessageId: string | null = null;

      if (clientPhone) {
        // Tentativa 1: Envio primário via Backend Seguro (/api/chat/send)
        // O backend cuida da inserção autorizada no Supabase e do disparo WhatsApp (Evolution / Meta)
        try {
          const sendEndpoint = getApiUrl('/api/chat/send');
          const apiRes = await fetch(sendEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text,
              clientPhone,
              clientId,
              sessionId,
              waSettings: currentSettings,
              senderName: userProfile?.name || 'Colaborador',
              message_client_id,
              mediaBase64,
              mimeType
            })
          });

          if (apiRes.ok) {
            const apiData = await apiRes.json().catch(() => null);
            if (apiData?.success) {
              sentSuccess = true;
              if (apiData?.externalId) externalId = apiData.externalId;
              if (apiData?.messageId) insertedMessageId = apiData.messageId;
              if (apiData?.message) return apiData.message;
            } else if (apiData?.error) {
              sendError = apiData.error;
              if (apiData?.messageId) insertedMessageId = apiData.messageId;
              if (apiData?.message) return apiData.message;
            }
          } else {
            console.warn('[ChatModal] Servidor backend retornou HTTP', apiRes.status);
          }
        } catch (apiErr: any) {
          console.warn('[ChatModal] Falha ao contatar backend, acionando fallback direto:', apiErr);
        }

        // Tentativa 2: Fallback direto no navegador (caso o backend esteja inacessível)
        if (!sentSuccess && !insertedMessageId) {
          try {
            if (currentSettings.useMetaApi && currentSettings.metaToken) {
              const metaRes = await sendMetaMessage(clientPhone, text, currentSettings, message_client_id, mediaBase64, mimeType);
              if (metaRes) {
                sentSuccess = true;
                externalId = metaRes.id || metaRes.messages?.[0]?.id || metaRes.key?.id || '';
              }
            } else if (currentSettings.useEvolutionApi && currentSettings.evolutionApiKey) {
              const evoRes = await sendEvolutionMessage(clientPhone, text, currentSettings, message_client_id, mediaBase64, mimeType);
              if (evoRes) {
                sentSuccess = true;
                externalId = evoRes.key?.id || evoRes.id || evoRes.messageId || '';
              }
            } else {
              sendError = 'Nenhuma configuração de WhatsApp ativa encontrada.';
            }
          } catch (directErr: any) {
            console.error('[ChatModal] Falha no fallback de envio direto:', directErr);
            sendError = directErr.message || 'Erro ao enviar mensagem via WhatsApp';
          }
        }
      } else {
        sendError = 'Cliente não possui telefone cadastrado.';
      }

      const finalMetadata = {
        status: sentSuccess ? 'sent' : 'failed',
        external_id: externalId || undefined,
        message_client_id,
        url: mediaBase64 || undefined,
        sent_at: sentSuccess ? new Date().toISOString() : undefined,
        error: sentSuccess ? undefined : (sendError || 'Falha no envio')
      };

      const finalMsgObject = {
        id: insertedMessageId || `msg_${message_client_id}`,
        session_id: sessionId || 'unknown',
        sender_type: 'tech',
        sender_name: userProfile?.name || 'Colaborador',
        content: text,
        media_url: JSON.stringify(finalMetadata),
        created_at: new Date().toISOString()
      };

      return finalMsgObject;
    },
    onMutate: async ({ text, message_client_id, mediaBase64 }) => {
      const tempId = `temp-${message_client_id}`;
      const optimisticMsg = {
        id: tempId,
        session_id: session?.id || 'temp-sess',
        sender_type: 'tech',
        sender_name: userProfile?.name || 'Colaborador',
        content: text,
        media_url: JSON.stringify({
          status: 'sending',
          message_client_id,
          url: mediaBase64 || undefined
        }),
        created_at: new Date().toISOString()
      };

      queryClient.setQueryData(['chat-messages', clientId], (prev: any[] | undefined) => {
        return [...(prev || []), optimisticMsg];
      });

      requestAnimationFrame(() => scrollToBottom(true));
      return { tempId };
    },
    onSuccess: (newInsertedMsg, _vars, context) => {
      queryClient.setQueryData(['chat-messages', clientId], (prev: any[] | undefined) => {
        if (!prev) return [newInsertedMsg];
        const filtered = prev.filter(m => m.id !== context?.tempId && m.id !== newInsertedMsg.id);
        return [...filtered, newInsertedMsg].sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
      });

      queryClient.invalidateQueries({ queryKey: ['chat-messages', clientId] });
      queryClient.invalidateQueries({ queryKey: ['chat-session', clientId] });
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

  // Função para envio de mensagem de texto simples ou com mídia anexada
  const handleSendMessage = (textToSend?: string) => {
    const rawText = textToSend !== undefined ? textToSend : newMessage;
    const trimmed = rawText.trim();

    if (!trimmed && !selectedMedia) return;
    if (isSendingRef.current || sendMutation.isPending) return;

    isSendingRef.current = true;
    const message_client_id = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    if (selectedMedia) {
      const mediaToSend = selectedMedia;
      setSelectedMedia(null);
      setNewMessage('');
      if (fileInputRef.current) fileInputRef.current.value = '';

      const content = trimmed || (mediaToSend.type === 'video' ? '🎥 Vídeo' : '📸 Foto');
      sendMutation.mutate({
        text: content,
        message_client_id,
        mediaBase64: mediaToSend.base64,
        mimeType: mediaToSend.mimeType
      });
      return;
    }

    // Proteção de Idempotência para textos repetidos < 3s
    const now = Date.now();
    const lastTime = recentSentTextRef.current.get(trimmed) || 0;
    if (now - lastTime < 3000) {
      console.warn('[ChatModal] Ignorando envio repetido no cliente:', trimmed);
      isSendingRef.current = false;
      return;
    }
    recentSentTextRef.current.set(trimmed, now);

    setNewMessage('');
    sendMutation.mutate({ text: trimmed, message_client_id });
  };

  // Tratamento de Seleção de Foto / Vídeo com compressão automática de imagem
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Tamanho máximo 30MB
    if (file.size > 30 * 1024 * 1024) {
      alert('O arquivo selecionado deve ter no máximo 30MB.');
      return;
    }

    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');

    if (!isImage && !isVideo) {
      alert('Por favor, selecione apenas imagens ou vídeos.');
      return;
    }

    // Se for imagem, fazemos compressão no Canvas para envio rápido e confiável no WhatsApp
    if (isImage) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const maxDim = 1280;
          let width = img.width;
          let height = img.height;

          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const compressedBase64 = canvas.toDataURL('image/jpeg', 0.8);
            setSelectedMedia({
              file,
              previewUrl: compressedBase64,
              type: 'image',
              mimeType: 'image/jpeg',
              base64: compressedBase64
            });
          } else {
            const rawBase64 = event.target?.result as string;
            setSelectedMedia({
              file,
              previewUrl: rawBase64,
              type: 'image',
              mimeType: file.type || 'image/jpeg',
              base64: rawBase64
            });
          }
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    } else {
      // Se for vídeo
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        setSelectedMedia({
          file,
          previewUrl: base64,
          type: 'video',
          mimeType: file.type || 'video/mp4',
          base64
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveMedia = () => {
    setSelectedMedia(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Gravação de Áudio (Voz)
  const startAudioRecording = async () => {
    setRecordingError(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('O seu dispositivo ou navegador não suporta a gravação de áudio ou a conexão não é segura (HTTPS).');
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      audioChunksRef.current = [];

      let mimeType = 'audio/webm';
      if (typeof MediaRecorder !== 'undefined') {
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          mimeType = 'audio/webm;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
          mimeType = 'audio/ogg;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
        }
      }

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.start(100);
      setIsRecording(true);
      setRecordingSeconds(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error('[ChatModal] Erro ao iniciar gravação de áudio:', err);
      const isDenied = err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError' || String(err.message).toLowerCase().includes('permission');
      if (isDenied) {
        setRecordingError('Permissão do microfone negada. Clique no cadeado na barra de endereço do navegador ou nas configurações do app para permitir o acesso ao microfone.');
      } else {
        setRecordingError(err.message || 'Não foi possível acessar o microfone.');
      }
    }
  };

  const cancelAudioRecording = () => {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(t => t.stop());
      audioStreamRef.current = null;
    }
    setIsRecording(false);
    setRecordingSeconds(0);
    audioChunksRef.current = [];
  };

  const stopAndSendAudio = () => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') return;

    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);

    const recorder = mediaRecorderRef.current;
    recorder.onstop = async () => {
      try {
        const mimeType = recorder.mimeType || 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });

        if (audioBlob.size < 500) {
          console.warn('[ChatModal] Áudio muito curto ou vazio.');
          return;
        }

        const reader = new FileReader();
        reader.onloadend = () => {
          const base64Data = reader.result as string;
          const message_client_id = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

          sendMutation.mutate({
            text: '🎤 Mensagem de voz',
            message_client_id,
            mediaBase64: base64Data,
            mimeType,
            isAudio: true
          });
        };
        reader.readAsDataURL(audioBlob);
      } catch (e) {
        console.error('[ChatModal] Erro ao processar áudio:', e);
      } finally {
        if (audioStreamRef.current) {
          audioStreamRef.current.getTracks().forEach(t => t.stop());
          audioStreamRef.current = null;
        }
        setIsRecording(false);
        setRecordingSeconds(0);
        audioChunksRef.current = [];
      }
    };

    recorder.stop();
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
                    WhatsApp {clientPhone ? `• ${clientPhone}` : ''}
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
                Envie uma mensagem de texto, foto, vídeo ou áudio abaixo para iniciar o atendimento.
              </p>
            </div>
          ) : (
            messages.map((msg: any) => {
              const deliveryStatus = parseMessageStatus(msg, messages);
              let realMediaUrl = '';
              let parsedMeta: any = {};
              try {
                if (typeof msg.media_url === 'string') {
                  if (msg.media_url.startsWith('{')) {
                    parsedMeta = JSON.parse(msg.media_url);
                    realMediaUrl = parsedMeta.url || '';
                  } else {
                    realMediaUrl = msg.media_url;
                  }
                }
              } catch (e) {
                realMediaUrl = msg.media_url || '';
              }

              const senderDisplayName = parsedMeta?.sender_name || msg.sender_name || (msg.sender_type === 'tech' ? (userProfile?.name || 'Colaborador') : (client.name || 'Cliente'));

              const isAudioMsg = (
                realMediaUrl.includes('audio') ||
                realMediaUrl.startsWith('data:audio') ||
                msg.content?.includes('Áudio') ||
                msg.content?.includes('voz') ||
                realMediaUrl.includes('.ogg') ||
                realMediaUrl.includes('.mp3') ||
                realMediaUrl.includes('.webm')
              ) && !realMediaUrl.includes('image') && !realMediaUrl.includes('video');

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
                    {senderDisplayName && (
                      <div className={`text-[10px] font-semibold mb-1 ${msg.sender_type === 'tech' ? 'text-blue-200' : 'text-primary'}`}>
                        {senderDisplayName}
                      </div>
                    )}
                    
                    {realMediaUrl ? (
                      isAudioMsg ? (
                        <div className="space-y-1">
                          <p className="text-xs opacity-80">{msg.content || '🎤 Mensagem de voz'}</p>
                          <AudioViewer url={realMediaUrl} className="max-w-[220px] md:max-w-[300px]" />
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <MediaViewer 
                            url={realMediaUrl} 
                            alt="Mídia" 
                            onLoad={() => scrollToBottom(false)}
                            className="max-w-full md:max-w-[300px] max-h-[300px] object-cover rounded-lg cursor-pointer hover:opacity-90" 
                          />
                          {msg.content && msg.content !== '📸 Foto' && msg.content !== '🎥 Vídeo' && (
                            <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                          )}
                        </div>
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
          {/* Respostas Rápidas */}
          {!isRecording && (
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
          )}

          {/* Prévia de Foto / Vídeo Selecionado */}
          {selectedMedia && (
            <div className="mb-3 p-2 bg-gray-50 border border-gray-200 rounded-xl flex items-center justify-between gap-3 animate-in fade-in">
              <div className="flex items-center gap-2 overflow-hidden">
                {selectedMedia.type === 'image' ? (
                  <img src={selectedMedia.previewUrl} alt="Prévia" className="w-12 h-12 rounded-lg object-cover border border-gray-300" />
                ) : (
                  <div className="w-12 h-12 bg-gray-900 text-white rounded-lg flex items-center justify-center font-bold text-xs">
                    VÍDEO
                  </div>
                )}
                <div className="text-xs truncate">
                  <p className="font-semibold text-gray-800 truncate">{selectedMedia.file.name}</p>
                  <p className="text-gray-500">{(selectedMedia.file.size / 1024 / 1024).toFixed(1)} MB • {selectedMedia.type === 'video' ? 'Vídeo' : 'Foto'}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleRemoveMedia}
                className="p-1.5 text-gray-500 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                title="Remover mídia"
              >
                <X size={18} />
              </button>
            </div>
          )}

          {/* Erro de Microfone */}
          {recordingError && (
            <div className="mb-2 p-2 bg-red-50 text-red-600 text-xs rounded-lg flex items-center justify-between">
              <span>{recordingError}</span>
              <button onClick={() => setRecordingError(null)} className="text-red-700 font-bold ml-2">×</button>
            </div>
          )}

          {/* Modo de Gravação de Áudio Ativo */}
          {isRecording ? (
            <div className="flex items-center gap-3 bg-red-50/80 border border-red-200 rounded-full px-4 py-2 animate-in fade-in">
              <div className="flex items-center gap-2 flex-1">
                <span className="w-3 h-3 rounded-full bg-red-500 animate-ping" />
                <span className="text-xs font-semibold text-red-700">Gravando áudio:</span>
                <span className="text-xs font-mono font-bold text-red-800">{formatTime(recordingSeconds)}</span>
              </div>
              
              <button
                type="button"
                onClick={cancelAudioRecording}
                className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-100 rounded-full transition-colors"
                title="Cancelar gravação"
              >
                <Trash2 size={18} />
              </button>

              <button
                type="button"
                onClick={stopAndSendAudio}
                disabled={sendMutation.isPending}
                className="bg-emerald-600 hover:bg-emerald-700 text-white p-2 rounded-full transition-colors flex items-center justify-center shadow-xs"
                title="Enviar áudio"
              >
                <Check size={18} />
              </button>
            </div>
          ) : (
            /* Barra Normal de Envio */
            <div className="flex items-center gap-2">
              {/* Input oculto de arquivo */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                onChange={handleFileSelect}
                className="hidden"
              />

              {/* Botão de Anexo (Fotos / Vídeos) */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={sendMutation.isPending}
                className="text-gray-500 hover:text-primary hover:bg-gray-100 p-2.5 rounded-full transition-colors"
                title="Anexar foto ou vídeo"
              >
                <Paperclip size={19} />
              </button>

              {/* Botão de Gravar Áudio */}
              <button
                type="button"
                onClick={startAudioRecording}
                disabled={sendMutation.isPending}
                className="text-gray-500 hover:text-red-500 hover:bg-red-50 p-2.5 rounded-full transition-colors"
                title="Gravar mensagem de áudio"
              >
                <Mic size={19} />
              </button>

              {/* Campo de Texto */}
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder={selectedMedia ? "Adicione uma legenda opcional..." : "Digite uma mensagem..."}
                disabled={sendMutation.isPending}
                className="flex-1 bg-gray-100 border-transparent focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 rounded-full px-4 py-2 text-sm transition-all disabled:bg-gray-50"
              />

              {/* Botão de Envio */}
              <button 
                onClick={() => handleSendMessage()}
                disabled={(!newMessage.trim() && !selectedMedia) || sendMutation.isPending}
                className="bg-primary text-white p-2.5 rounded-full hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center min-w-[40px] min-h-[40px] shadow-sm"
                title="Enviar"
              >
                {sendMutation.isPending ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <Send size={18} />
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
