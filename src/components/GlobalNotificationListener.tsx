import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { MessageSquare, X } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

let sharedAudioCtx: AudioContext | null = null;
let hasInteracted = false;

function initAudio() {
  if (!sharedAudioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
       sharedAudioCtx = new AudioContextClass();
    }
  }
  if (sharedAudioCtx && sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume();
  }
}

// Attach a one-time global interaction listener to resume audio context
if (typeof window !== 'undefined') {
  const resumeAudio = () => {
    hasInteracted = true;
    initAudio();
    if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
      Notification.requestPermission().catch(() => {});
    }
    window.removeEventListener('click', resumeAudio);
    window.removeEventListener('keydown', resumeAudio);
    window.removeEventListener('touchstart', resumeAudio);
  };
  window.addEventListener('click', resumeAudio);
  window.addEventListener('keydown', resumeAudio);
  window.addEventListener('touchstart', resumeAudio);
}

function playNotificationSound() {
  try {
    const audio = new Audio('/notificacao.mp3');
    audio.play().catch(e => console.warn('Could not play audio', e));
  } catch(e) {
    console.warn("Audio play failed", e);
  }
}

export default function GlobalNotificationListener() {
  const { userProfile } = useAuth();
  const initialLoadRef = useRef(true);
  const lastTimestampRef = useRef<number>(0);
  const [toast, setToast] = useState<{show: boolean, senderName: string}>({ show: false, senderName: '' });
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!userProfile) return;

    const unsub = onSnapshot(doc(db, 'notifications', userProfile.uid), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (initialLoadRef.current) {
          initialLoadRef.current = false;
          lastTimestampRef.current = data.timestamp || 0;
          return;
        }

        if (data.timestamp && data.timestamp > lastTimestampRef.current) {
          lastTimestampRef.current = data.timestamp;
          
          // Only show notification if we are not already on the chat page
          if (!location.pathname.startsWith('/chat')) {
            // Trigger Audio
            playNotificationSound();

            // Push Notification
            if ('Notification' in window && Notification.permission === 'granted') {
              try {
                new Notification('Nova Mensagem', {
                  body: `Você tem uma nova mensagem de ${data.senderName || 'um contato'}.`,
                  icon: '/logo.png'
                });
              } catch(e) {
                console.warn('Notification failed', e);
              }
            }

            // In-app Toast
            setToast({ show: true, senderName: data.senderName || 'um contato' });
            setTimeout(() => {
              setToast(prev => ({ ...prev, show: false }));
            }, 5000);
          }
        }
      } else {
        initialLoadRef.current = false;
      }
    }, (error) => {
      console.error("Notification listener error:", error);
    });

    return () => unsub();
  }, [userProfile, location.pathname]);

  if (!toast.show) return null;

  return (
    <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-top fade-in duration-300">
      <div 
        className="bg-white rounded-lg shadow-lg border border-gray-200 p-4 flex items-start gap-4 max-w-sm cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => {
          setToast({ show: false, senderName: '' });
          navigate('/chat');
        }}
      >
        <div className="bg-primary/20 p-2 rounded-full text-primary shrink-0">
          <MessageSquare size={24} />
        </div>
        <div className="flex-1">
          <h4 className="font-bold text-gray-900 text-sm">Nova Mensagem</h4>
          <p className="text-gray-600 text-sm mt-1 leading-tight">
            Você recebeu uma mensagem de {toast.senderName}.
          </p>
        </div>
        <button 
          onClick={(e) => {
            e.stopPropagation();
            setToast({ show: false, senderName: '' });
          }}
          className="text-gray-400 hover:text-gray-600 p-1 -mt-1 -mr-1"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
