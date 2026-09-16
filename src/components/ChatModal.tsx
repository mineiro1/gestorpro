import React, { useState, useEffect, useRef } from 'react';
import { X, Send, User, MessageCircle, Clock } from 'lucide-react';
import { MediaViewer, AudioViewer } from './chat/MediaViewer';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export function ChatModal({ isOpen, onClose, visit, client, waSettings }: any) {
  const { userProfile } = useAuth();
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && visit && visit.id) {
      loadOrCreateSession();
    } else if (isOpen && visit && !visit.id) {
      // Waiting for visitId to be resolved
      setLoading(true);
    }
  }, [isOpen, visit]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadOrCreateSession = async () => {
    setLoading(true);
    try {
      // Find active session
      let { data: sessions, error } = await supabase
        .from('chat_sessions')
        .select('*')
        .eq('client_id', client.id)
        .eq('status', 'open')
        .order('created_at', { ascending: false });

      let currentSession = null;
      if (sessions && sessions.length > 0) {
        currentSession = sessions[0];
      } else {
        // Create new session if none exists
        const adminId = userProfile?.role === 'admin' ? userProfile.uid : userProfile?.adminId;
        
        const { data: newSession, error: createError } = await supabase
          .from('chat_sessions')
          .insert({
            visit_id: visit ? visit.id : null,
            admin_id: adminId,
            client_id: client.id,
            employee_id: userProfile?.uid,
            status: 'open'
          }).select().single();
          
        console.log("CREATE SESSION RESULT:", newSession, "ERROR:", createError, "PARAMS:", { visit_id: visit ? visit.id : null, admin_id: adminId, client_id: client.id, employee_id: userProfile?.uid });

          
        if (!createError && newSession) {
          currentSession = newSession;
        }
      }
      
      setSession(currentSession);
      if (currentSession) {
        loadMessages(currentSession.id);
        
        // Subscribe to new messages
        const subscription = supabase
          .channel(`chat_${client.id}`)
          .on('postgres_changes', { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'chat_messages'
          }, (payload) => {
            (async () => {
              const { data } = await supabase.from('chat_sessions').select('client_id').eq('id', payload.new.session_id).single();
              if (data && data.client_id === client.id) {
                 setMessages(prev => {
                    if (prev.find(m => m.id === payload.new.id)) return prev;
                    return [...prev, payload.new];
                 });
                 // Force a small delay to ensure ref scrolls after render
                 setTimeout(() => {
                   messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                 }, 100);
              }
            })();
          })
          .subscribe();
          
        return () => {
          supabase.removeChannel(subscription);
        };
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (sessionId: string) => {
    // Carregar histórico de TODAS as sessões do cliente, para não perder mensagens
    const { data: allSessions } = await supabase.from('chat_sessions').select('id').eq('client_id', client.id);
    if (allSessions && allSessions.length > 0) {
       const sessionIds = allSessions.map(s => s.id);
       const { data } = await supabase
         .from('chat_messages')
         .select('*')
         .in('session_id', sessionIds)
         .order('created_at', { ascending: true });
       if (data) setMessages(data);
    }
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || !session || session.status === 'closed') return;
    
    setNewMessage('');
    
    // Actually send to API endpoint which will forward to Meta/Evolution and save
    try {
      // 1. Insert into Supabase from the client (authenticated)
      await supabase.from('chat_messages').insert({
        session_id: session.id,
        sender_type: 'tech',
        content: text
      });

      // 2. Dispatch to backend to send via Evolution (bypasses CORS)
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
            {session?.status === 'closed' ? (
              <span className="text-xs text-red-500 font-semibold flex items-center mt-1">
                <Clock size={12} className="mr-1"/> Sessão Finalizada
              </span>
            ) : (
              <span className="text-xs text-green-500 font-semibold flex items-center mt-1">
                <Clock size={12} className="mr-1"/> Sessão Ativa
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

        {session?.status === 'open' && (
          <div className="p-4 bg-white border-t rounded-b-xl">
            {/* Quick Actions */}
            <div className="flex gap-2 mb-3 overflow-x-auto pb-2 scrollbar-hide">
              <button onClick={() => sendMessage("Olá, estou indo realizar a limpeza da sua piscina.")} className="whitespace-nowrap px-3 py-1.5 bg-blue-50 text-blue-700 text-xs font-semibold rounded-full hover:bg-blue-100 transition-colors">
                🚗 Estou a caminho
              </button>
              <button onClick={() => sendMessage("Cheguei no local, pode abrir a porta por favor?")} className="whitespace-nowrap px-3 py-1.5 bg-blue-50 text-blue-700 text-xs font-semibold rounded-full hover:bg-blue-100 transition-colors">
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
        )}
      </div>
    </div>
  );
}
// Atualização de segurança para renderização de mídia
