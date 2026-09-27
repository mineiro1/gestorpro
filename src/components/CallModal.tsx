import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Volume2, VolumeX, PhoneOff, User } from 'lucide-react';
import { ActiveCall } from '../contexts/CallContext';

interface CallModalProps {
  call: ActiveCall;
  onClose: (duration?: number) => void;
}

const SAMPLE_RATE = 16000;
const BUFFER_SIZE = 512;
const JITTER_BUFFER_MS = 0.06;

export default function CallModal({ call, onClose }: CallModalProps) {
  const [callStatus, setCallStatus] = useState<'dialing' | 'connected' | 'ended'>('dialing');
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [duration, setDuration] = useState(0);

  const timerRef = useRef<any>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const captureCtxRef = useRef<AudioContext | null>(null);
  const playbackCtxRef = useRef<AudioContext | null>(null);
  const processorNodeRef = useRef<ScriptProcessorNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const playCursorRef = useRef<number>(0);
  const ringOscRef = useRef<any>(null);
  const ringAudioCtxRef = useRef<AudioContext | null>(null);

  // Sound generator for realistic telephone ringing tone
  const playRingTone = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      ringAudioCtxRef.current = ctx;

      const playBeep = () => {
        if (ctx.state === 'closed') return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(425, ctx.currentTime);
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 1.2);
      };

      playBeep();
      ringOscRef.current = setInterval(playBeep, 3500);
    } catch (e) {
      console.warn('AudioContext not supported or blocked:', e);
    }
  };

  const stopRingTone = () => {
    if (ringOscRef.current) {
      clearInterval(ringOscRef.current);
      ringOscRef.current = null;
    }
    if (ringAudioCtxRef.current && ringAudioCtxRef.current.state !== 'closed') {
      try {
        ringAudioCtxRef.current.close();
      } catch (e) {}
    }
  };

  // Convert incoming PCM16 ArrayBuffer to Float32 and schedule playback
  const playPCMChunk = (arrayBuffer: ArrayBuffer) => {
    if (!playbackCtxRef.current) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      playbackCtxRef.current = new AudioCtx({ sampleRate: SAMPLE_RATE });
      playCursorRef.current = playbackCtxRef.current.currentTime;
    }

    const ctx = playbackCtxRef.current;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const int16 = new Int16Array(arrayBuffer);
    if (int16.length === 0) return;

    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768;
    }

    const buffer = ctx.createBuffer(1, float32.length, SAMPLE_RATE);
    buffer.copyToChannel(float32, 0);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    const now = ctx.currentTime;
    if (playCursorRef.current < now + 0.005) {
      playCursorRef.current = now + JITTER_BUFFER_MS;
    }

    source.start(playCursorRef.current);
    playCursorRef.current += buffer.duration;
  };

  // Capture Microphone and stream PCM16 chunks over WebSocket
  const startMicCapture = async (ws: WebSocket) => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) return;

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: SAMPLE_RATE,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });
      micStreamRef.current = stream;

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const actx = new AudioCtx({ sampleRate: SAMPLE_RATE });
      captureCtxRef.current = actx;

      const source = actx.createMediaStreamSource(stream);
      sourceNodeRef.current = source;

      const processor = actx.createScriptProcessor(BUFFER_SIZE, 1, 1);
      processorNodeRef.current = processor;

      processor.onaudioprocess = (e) => {
        if (ws.readyState !== WebSocket.OPEN) return;
        const input = e.inputBuffer.getChannelData(0);
        const int16 = new Int16Array(input.length);
        for (let i = 0; i < input.length; i++) {
          const clamped = Math.max(-1, Math.min(1, input[i]));
          int16[i] = clamped < 0 ? clamped * 32768 : clamped * 32767;
        }
        ws.send(int16.buffer);
      };

      source.connect(processor);
      processor.connect(actx.destination);
    } catch (micErr) {
      console.warn('Microfone não disponível ou permissão negada:', micErr);
    }
  };

  const cleanupAudio = () => {
    stopRingTone();

    if (processorNodeRef.current) {
      processorNodeRef.current.disconnect();
      processorNodeRef.current = null;
    }
    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }
    if (captureCtxRef.current) {
      captureCtxRef.current.close().catch(() => {});
      captureCtxRef.current = null;
    }
    if (playbackCtxRef.current) {
      playbackCtxRef.current.close().catch(() => {});
      playbackCtxRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
    }
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch (e) {}
      wsRef.current = null;
    }
  };

  // Main Call Lifecycle Effect
  useEffect(() => {
    playRingTone();

    const sessionId = call.sessionId || 'd4f80e0ee23755d62116e25eabe7501b';
    const apiKey = call.astracallsApiKey || 'rs_piscinas_segredo_2026';
    const rawUrl = call.astracallsUrl || 'https://calls.rspiscinas.app.br';
    const wsBaseUrl = rawUrl.replace(/^https:\/\//i, 'wss://').replace(/^http:\/\//i, 'ws://');

    let ws: WebSocket | null = null;
    let isCleanedUp = false;

    // Connect WebSocket when callId is assigned
    if (call.callId) {
      const wsUrl = `${wsBaseUrl}/api/sessions/${sessionId}/calls/${call.callId}/ws?apiKey=${encodeURIComponent(apiKey)}`;
      try {
        ws = new WebSocket(wsUrl, ['pcm16']);
        ws.binaryType = 'arraybuffer';
        wsRef.current = ws;

        ws.onopen = () => {
          if (isCleanedUp) return;
          stopRingTone();
          setCallStatus('connected');
          startMicCapture(ws!);
        };

        ws.onmessage = (event) => {
          if (event.data instanceof ArrayBuffer) {
            playPCMChunk(event.data);
          }
        };

        ws.onerror = (err) => {
          console.warn('[VoIP WebSocket error]:', err);
        };

        ws.onclose = () => {
          if (isCleanedUp) return;
          stopRingTone();
          setCallStatus('ended');
          setTimeout(() => {
            onClose(duration);
          }, 1000);
        };
      } catch (err) {
        console.warn('Erro ao conectar WebSocket de áudio:', err);
      }
    }

    return () => {
      isCleanedUp = true;
      cleanupAudio();
    };
  }, [call.callId, call.sessionId]);

  // Duration Timer when connected
  useEffect(() => {
    if (callStatus === 'connected') {
      timerRef.current = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [callStatus]);

  // Handle Mute Toggle
  const toggleMute = () => {
    if (micStreamRef.current) {
      micStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = isMuted; // toggle
      });
    }
    setIsMuted(!isMuted);
  };

  // Handle Speaker Toggle
  const toggleSpeaker = () => {
    if (playbackCtxRef.current) {
      if (isSpeakerOn) {
        playbackCtxRef.current.suspend().catch(() => {});
      } else {
        playbackCtxRef.current.resume().catch(() => {});
      }
    }
    setIsSpeakerOn(!isSpeakerOn);
  };

  // Handle End Call
  const handleEndCall = () => {
    const finalDuration = duration;
    cleanupAudio();
    setCallStatus('ended');
    setTimeout(() => {
      onClose(finalDuration);
    }, 600);
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-sm bg-gradient-to-b from-gray-900 via-gray-800 to-gray-950 text-white rounded-3xl p-6 shadow-2xl border border-gray-700/50 flex flex-col items-center text-center">
        
        {/* Top Status Badge */}
        <div className="mb-6">
          {callStatus === 'dialing' && (
            <div className="inline-flex items-center px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 text-xs font-medium animate-pulse border border-blue-500/30">
              <span className="w-2 h-2 rounded-full bg-blue-400 mr-2 animate-ping" />
              Chamando cliente no WhatsApp...
            </div>
          )}
          {callStatus === 'connected' && (
            <div className="inline-flex items-center px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-medium border border-emerald-500/30">
              <span className="w-2 h-2 rounded-full bg-emerald-400 mr-2 animate-pulse" />
              Em chamada de voz ao vivo
            </div>
          )}
          {callStatus === 'ended' && (
            <div className="inline-flex items-center px-3 py-1 rounded-full bg-red-500/20 text-red-300 text-xs font-medium border border-red-500/30">
              Chamada finalizada
            </div>
          )}
        </div>

        {/* Client Avatar (Total Privacy: Only Name and Avatar, NO Phone Number) */}
        <div className="relative mb-5">
          <div className="w-28 h-28 rounded-full bg-gradient-to-tr from-emerald-600 to-teal-500 p-1 shadow-lg shadow-emerald-500/20 flex items-center justify-center">
            {call.avatarUrl ? (
              <img
                src={call.avatarUrl}
                alt={call.clientName}
                className="w-full h-full rounded-full object-cover"
              />
            ) : (
              <div className="w-full h-full rounded-full bg-gray-800 flex items-center justify-center text-emerald-400">
                <User size={48} />
              </div>
            )}
          </div>
          {callStatus === 'connected' && (
            <span className="absolute bottom-1 right-1 w-5 h-5 bg-emerald-500 border-2 border-gray-900 rounded-full" />
          )}
        </div>

        {/* Client Name */}
        <h2 className="text-xl font-bold text-white tracking-wide truncate max-w-xs mb-1">
          {call.clientName || 'Cliente'}
        </h2>

        {/* Call Timer or Ringing Subtext */}
        <div className="text-sm font-medium text-gray-400 mb-8">
          {callStatus === 'dialing' && 'Tocando no WhatsApp do cliente...'}
          {callStatus === 'connected' && (
            <span className="text-lg font-semibold text-emerald-400 font-mono">
              {formatTime(duration)}
            </span>
          )}
          {callStatus === 'ended' && 'Desconectado'}
        </div>

        {/* Quick Action Controls */}
        <div className="w-full flex items-center justify-center gap-6 mb-6">
          {/* Mute Button */}
          <button
            type="button"
            onClick={toggleMute}
            disabled={callStatus === 'ended'}
            className={`flex flex-col items-center justify-center w-14 h-14 rounded-full transition-all duration-200 ${
              isMuted
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40 ring-2 ring-amber-500/20'
                : 'bg-gray-800/80 hover:bg-gray-700 text-gray-200 border border-gray-700'
            }`}
            title={isMuted ? 'Desativar mudo' : 'Silenciar microfone'}
          >
            {isMuted ? <MicOff size={22} /> : <Mic size={22} />}
            <span className="text-[10px] mt-0.5 text-gray-400 font-medium">
              {isMuted ? 'Mudo' : 'Mic'}
            </span>
          </button>

          {/* Speaker Button */}
          <button
            type="button"
            onClick={toggleSpeaker}
            disabled={callStatus === 'ended'}
            className={`flex flex-col items-center justify-center w-14 h-14 rounded-full transition-all duration-200 ${
              isSpeakerOn
                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40 ring-2 ring-blue-500/20'
                : 'bg-gray-800/80 hover:bg-gray-700 text-gray-200 border border-gray-700'
            }`}
            title={isSpeakerOn ? 'Viva-voz Ativado' : 'Fone de Ouvido'}
          >
            {isSpeakerOn ? <Volume2 size={22} /> : <VolumeX size={22} />}
            <span className="text-[10px] mt-0.5 text-gray-400 font-medium">
              {isSpeakerOn ? 'Viva-voz' : 'Fone'}
            </span>
          </button>
        </div>

        {/* Prominent Red Hang Up Button */}
        <button
          type="button"
          onClick={handleEndCall}
          className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-700 active:scale-95 text-white flex items-center justify-center shadow-lg shadow-red-600/30 transition-all duration-200 focus:outline-none ring-4 ring-red-500/20"
          title="Encerrar Chamada"
        >
          <PhoneOff size={26} />
        </button>
        <span className="text-xs text-gray-400 mt-2 font-medium">Encerrar</span>

      </div>
    </div>
  );
}
