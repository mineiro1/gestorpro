import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp, getDocs } from 'firebase/firestore';
import { Send, Mic, Square, User as UserIcon, MessageCircle, ArrowLeft } from 'lucide-react';

const BEEP_SOUND = 'data:audio/mp3;base64,//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq'; 
// That was just a stub, real base64 ringtone is too long. I will just rely on an external URL or use the silent stub. A generic remote sound might fail if blocked by CORS. I will use a simple Oscillator API for the beep.

function playNotificationSound() {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.2);
    
    gainNode.gain.setValueAtTime(0.5, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
    
    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
  } catch(e) {
    console.error("Audio play failed", e);
  }
}

export default function Chat() {
  const { userProfile, isAdmin, isManager } = useAuth();
  const [contacts, setContacts] = useState<any[]>([]);
  const [selectedContact, setSelectedContact] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [loading, setLoading] = useState(true);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Fetch contacts
  useEffect(() => {
    if (!userProfile) return;
    let q;
    
    const fetchContacts = async () => {
      try {
        const adminId = isAdmin ? userProfile.uid : userProfile.adminId;
        const usersQ = query(collection(db, 'users'), where('adminId', '==', adminId));
        const snap = await getDocs(usersQ);
        let c = snap.docs
          .map(doc => ({ id: doc.id, ...doc.data() }))
          .filter((u: any) => u.id !== userProfile.uid && u.role !== 'client');
        setContacts(c);
      } catch (err) {
         console.error("Erro ao carregar contatos", err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchContacts();
  }, [userProfile, isAdmin, isManager]);

  // Messages listener
  useEffect(() => {
    if (!userProfile || !selectedContact) return;

    const chatId = [userProfile.uid, selectedContact.id].sort().join('_');
    const q = query(collection(db, 'chats', chatId, 'messages'), orderBy('timestamp', 'asc'));

    let lastMessageCount = 0;
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
      setMessages(msgs);
      
      // Play sound if new message arrived and it's not from me
      if (msgs.length > lastMessageCount && lastMessageCount > 0) {
        const lastMsg = msgs[msgs.length - 1];
        if (lastMsg.senderId !== userProfile.uid) {
          playNotificationSound();
        }
      }
      lastMessageCount = msgs.length;
      
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }, (error) => {
      console.error("Chat error:", error);
    });

    return () => unsubscribe();
  }, [userProfile, selectedContact]);

  const handleSendMessage = async () => {
    if ((!newMessage.trim() && !isRecording) || !selectedContact || !userProfile) return;
    
    const chatId = [userProfile.uid, selectedContact.id].sort().join('_');
    const msgText = newMessage.trim();
    
    try {
      await addDoc(collection(db, 'chats', chatId, 'messages'), {
        senderId: userProfile.uid,
        text: msgText,
        type: 'text',
        timestamp: serverTimestamp()
      });
      setNewMessage('');
    } catch (e) {
       console.error("Error sending", e);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        // Since we don't have Cloud Storage configured, we need to convert to Base64 to store in Firestore.
        // NOTE: This limits the size of voice messages strictly because of Firestore 1MB limits.
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64Audio = reader.result;
          
           if (base64Audio && selectedContact && userProfile) {
              const chatId = [userProfile.uid, selectedContact.id].sort().join('_');
              try {
                await addDoc(collection(db, 'chats', chatId, 'messages'), {
                  senderId: userProfile.uid,
                  audioBase64: base64Audio,
                  type: 'audio',
                  timestamp: serverTimestamp()
                });
              } catch(e) {
                 console.error("Error sending voice message", e);
              }
           }
        };
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("Não foi possível acessar o microfone.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  if (loading) return <div className="p-8 text-center">Carregando contatos...</div>;

  return (
    <div className="h-[calc(100vh-8rem)] bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex">
      {/* Sidebar Contacts */}
      <div className={`${selectedContact ? 'hidden' : 'flex'} w-full md:w-1/3 border-r border-gray-200 bg-gray-50 flex-col`}>
        <div className="p-4 bg-primary text-white font-bold text-lg">Contatos</div>
        <div className="flex-1 overflow-y-auto">
          {contacts.map(c => (
            <button
              key={c.id}
              onClick={() => setSelectedContact(c)}
              className={`w-full flex items-center p-4 border-b border-gray-100 hover:bg-gray-100 transition-colors text-left ${selectedContact?.id === c.id ? 'bg-primary/5 border-l-4 border-l-primary' : ''}`}
            >
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold mr-3 shrink-0">
                <UserIcon size={20} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-800 truncate">{c.name}</p>
                <p className="text-xs text-gray-500 uppercase">{c.role === 'admin' ? 'Administrador' : c.role === 'manager' ? 'Gestor' : 'Colaborador'}</p>
              </div>
            </button>
          ))}
          {contacts.length === 0 && <p className="p-4 text-gray-500 text-sm">Nenhum contato disponível.</p>}
        </div>
      </div>

      {/* Chat Area */}
      {selectedContact ? (
        <div className="flex flex-1 flex-col bg-[#e5ddd5] relative">
          {/* Header */}
          <div className="p-4 bg-gray-100 border-b border-gray-200 flex items-center shadow-sm z-10">
              <button 
                onClick={() => setSelectedContact(null)}
                className="mr-3 p-2 -ml-2 rounded-full hover:bg-gray-200 text-gray-600 transition-colors"
                title="Voltar"
              >
                <ArrowLeft size={20} />
              </button>
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold mr-3 shrink-0">
                <UserIcon size={20} />
              </div>
              <span className="font-bold text-gray-800">{selectedContact.name}</span>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 z-10" style={{ 
              backgroundImage: 'url("https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png")',
              backgroundSize: 'contain'
            }}>
            {messages.map((m) => {
              const isMine = m.senderId === userProfile?.uid;
              return (
                <div key={m.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[70%] rounded-lg p-3 shadow-sm ${isMine ? 'bg-[#dcf8c6] rounded-tr-none' : 'bg-white rounded-tl-none'}`}>
                    {m.type === 'text' && <p className="text-sm text-gray-800">{m.text}</p>}
                    {m.type === 'audio' && m.audioBase64 && (
                      <audio controls src={m.audioBase64} className="h-10 max-w-full" />
                    )}
                    <span className="text-[10px] text-gray-400 block text-right mt-1">
                      {m.timestamp ? new Date(m.timestamp.toMillis()).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'}) : '...'}
                    </span>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-3 bg-gray-100 flex items-center gap-2 z-10 border-t border-gray-200">
            <input
              type="text"
              value={newMessage}
              onChange={e => setNewMessage(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
              placeholder="Digite uma mensagem..."
              className="flex-1 px-4 py-2 rounded-full border-none focus:ring-0 outline-none"
            />
            
            {newMessage ? (
               <button onClick={handleSendMessage} className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary-light transition-colors">
                  <Send size={18} />
               </button>
            ) : (
              <button 
                onPointerDown={startRecording}
                onPointerUp={stopRecording}
                onContextMenu={e => e.preventDefault()}
                className={`w-10 h-10 rounded-full text-white flex items-center justify-center transition-colors ${
                  isRecording ? 'bg-red-500 animate-pulse' : 'bg-primary hover:bg-primary-light'
                }`}
              >
                {isRecording ? <Square size={18} fill="currentColor" /> : <Mic size={18} />}
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="hidden flex-1 items-center justify-center bg-gray-50 flex-col md:flex">
          <MessageCircle size={64} className="text-gray-300 mb-4" />
          <p className="text-gray-500 text-lg font-medium">Selecione um contato para iniciar</p>
        </div>
      )}
    </div>
  );
}
