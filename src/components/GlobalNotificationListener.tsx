import React, { useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';

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

  useEffect(() => {
    if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
      Notification.requestPermission();
    }
  }, []);

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
          
          // Trigger Audio
          playNotificationSound();

          // Push Notification
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('Nova Mensagem', {
              body: `Você tem uma nova mensagem de ${data.senderName || 'um contato'}.`,
              icon: '/logo.png'
            });
          }
        }
      } else {
        initialLoadRef.current = false;
      }
    }, (error) => {
      console.error("Notification listener error:", error);
    });

    return () => unsub();
  }, [userProfile]);

  return null;
}
