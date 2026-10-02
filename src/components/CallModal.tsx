import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Volume2, VolumeX, PhoneOff, User } from 'lucide-react';
import { ActiveCall } from '../contexts/CallContext';
import { createVolumeMeterWorklet } from '../lib/audioWorklet';
import { getApiUrl } from '../lib/apiConfig';

interface CallModalProps {
  call: ActiveCall;
  onClose: (duration?: number, recordingUrl?: string) => void;
}

export default function CallModal({ call, onClose }: CallModalProps) {
  const [callStatus, setCallStatus] = useState<'dialing' | 'connected' | 'ended'>('dialing');
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [duration, setDuration] = useState(0);
  const [localVolume, setLocalVolume] = useState(0);
  const [remoteVolume, setRemoteVolume] = useState(0);

  const timerRef = useRef<any>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const ringOscRef = useRef<any>(null);
  const ringAudioCtxRef = useRef<AudioContext | null>(null);
  const workletAudioCtxRef = useRef<AudioContext | null>(null);
  const localWorkletDisconnectRef = useRef<(() => void) | null>(null);
  const remoteWorkletDisconnectRef = useRef<(() => void) | null>(null);

  // Call Audio Recording Engine (Dual-Stream Mixer)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const mixAudioCtxRef = useRef<AudioContext | null>(null);
  const mixDestNodeRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const localSourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const remoteSourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);

  // Start dual-channel recording mixer
  const startRecordingMixer = (micStream: MediaStream, rStream?: MediaStream | null) => {
    try {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') return;

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      const actx = mixAudioCtxRef.current || new AudioCtx();
      mixAudioCtxRef.current = actx;
      if (actx.state === 'suspended') actx.resume().catch(() => {});

      const dest = mixDestNodeRef.current || actx.createMediaStreamDestination();
      mixDestNodeRef.current = dest;

      // Connect local mic
      if (micStream && micStream.getAudioTracks().length > 0 && !localSourceNodeRef.current) {
        try {
          const micSource = actx.createMediaStreamSource(micStream);
          micSource.connect(dest);
          localSourceNodeRef.current = micSource;
        } catch (e) {}
      }

      // Connect remote stream if ready
      if (rStream && rStream.getAudioTracks().length > 0 && !remoteSourceNodeRef.current) {
        try {
          const remoteSource = actx.createMediaStreamSource(rStream);
          remoteSource.connect(dest);
          remoteSourceNodeRef.current = remoteSource;
        } catch (e) {}
      }

      const mixedStream = dest.stream;
      recordedChunksRef.current = [];

      let mimeType = 'audio/webm;codecs=opus';
      if (typeof MediaRecorder !== 'undefined') {
        if (!MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          if (MediaRecorder.isTypeSupported('audio/webm')) mimeType = 'audio/webm';
          else if (MediaRecorder.isTypeSupported('audio/mp4')) mimeType = 'audio/mp4';
          else if (MediaRecorder.isTypeSupported('audio/ogg')) mimeType = 'audio/ogg';
          else mimeType = '';
        }

        const recorder = mimeType ? new MediaRecorder(mixedStream, { mimeType }) : new MediaRecorder(mixedStream);
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            recordedChunksRef.current.push(e.data);
          }
        };

        recorder.start(1000);
        console.log('[VoIP Recording] Gravação da chamada iniciada:', mimeType || 'default');
      }
    } catch (e) {
      console.warn('[VoIP Recording] Erro ao iniciar gravação:', e);
    }
  };

  const connectRemoteToMixer = (rStream: MediaStream) => {
    try {
      if (mixAudioCtxRef.current && mixDestNodeRef.current && !remoteSourceNodeRef.current) {
        const remoteSource = mixAudioCtxRef.current.createMediaStreamSource(rStream);
        remoteSource.connect(mixDestNodeRef.current);
        remoteSourceNodeRef.current = remoteSource;
      }
    } catch (e) {}
  };

  // Realistic telephone ringing tone generator
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

  const cleanupAudio = () => {
    stopRingTone();

    if (localWorkletDisconnectRef.current) {
      localWorkletDisconnectRef.current();
      localWorkletDisconnectRef.current = null;
    }
    if (remoteWorkletDisconnectRef.current) {
      remoteWorkletDisconnectRef.current();
      remoteWorkletDisconnectRef.current = null;
    }

    if (workletAudioCtxRef.current && workletAudioCtxRef.current.state !== 'closed') {
      try { workletAudioCtxRef.current.close(); } catch (e) {}
      workletAudioCtxRef.current = null;
    }

    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => {
        try { track.stop(); } catch (e) {}
      });
      micStreamRef.current = null;
    }

    if (pcRef.current) {
      try { pcRef.current.close(); } catch (e) {}
      pcRef.current = null;
    }

    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
  };

  // Official AstraCalls v0.0.4 WebRTC VoIP Connection Engine with AudioWorklet Voice Activity
  useEffect(() => {
    playRingTone();

    const sessionId = call.sessionId || '8090cca3add0b8eb3e41efb9eec363e4';
    const apiKey = call.astracallsApiKey || 'rs_piscinas_segredo_2026';
    const astracallsUrl = (call.astracallsUrl || 'https://calls.rspiscinas.app.br').trim().replace(/\/$/, '');

    let isCleanedUp = false;

    const establishWebRTC = async () => {
      if (!call.callId || call.callId.startsWith('call_')) return;

      try {
        // 1. Capture microphone
        const micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
        if (isCleanedUp) {
          micStream.getTracks().forEach(t => t.stop());
          return;
        }
        micStreamRef.current = micStream;

        // Initialize AudioWorklet for local microphone volume level
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const actx = new AudioCtx();
          workletAudioCtxRef.current = actx;
          const { disconnect } = await createVolumeMeterWorklet(actx, micStream, (vol) => {
            if (!isCleanedUp) setLocalVolume(vol);
          });
          localWorkletDisconnectRef.current = disconnect;
        }

        // 2. Setup RTCPeerConnection
        const pc = new RTCPeerConnection({ iceServers: [] });
        pcRef.current = pc;

        micStream.getAudioTracks().forEach(track => pc.addTrack(track, micStream));
        pc.addTransceiver('audio', { direction: 'recvonly' });

        pc.ontrack = async (event) => {
          if (event.streams && event.streams[0]) {
            const rStream = event.streams[0];
            remoteStreamRef.current = rStream;
            if (remoteAudioRef.current) {
              remoteAudioRef.current.srcObject = rStream;
              remoteAudioRef.current.play().catch(() => {});
            }

            // Connect remote stream to call recording mixer
            connectRemoteToMixer(rStream);

            // Setup AudioWorklet for remote caller volume level
            if (workletAudioCtxRef.current) {
              const { disconnect } = await createVolumeMeterWorklet(workletAudioCtxRef.current, rStream, (vol) => {
                if (!isCleanedUp) setRemoteVolume(vol);
              });
              remoteWorkletDisconnectRef.current = disconnect;
            }
          }
        };

        pc.oniceconnectionstatechange = () => {
          if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
            stopRingTone();
            setCallStatus('connected');
            if (micStreamRef.current) {
              startRecordingMixer(micStreamRef.current, remoteStreamRef.current);
            }
          } else if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'closed') {
            if (!isCleanedUp && callStatus === 'connected') {
              handleEndCall();
            }
          }
        };

        // 3. Create Offer and wait for ICE gathering
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        await new Promise<void>((resolve) => {
          if (pc.iceGatheringState === 'complete') {
            resolve();
          } else {
            const checkGather = () => {
              if (pc.iceGatheringState === 'complete') {
                pc.removeEventListener('icegatheringstatechange', checkGather);
                resolve();
              }
            };
            pc.addEventListener('icegatheringstatechange', checkGather);
            setTimeout(resolve, 1500);
          }
        });

        // 4. Exchange SDP with AstraCalls WebRTC endpoint
        const res = await fetch(`${astracallsUrl}/api/sessions/${sessionId}/calls/${call.callId}/webrtc`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Api-Key': apiKey
          },
          body: JSON.stringify({ sdp_offer: pc.localDescription?.sdp })
        });

        if (res.ok) {
          const data = await res.json();
          if (data.sdp_answer) {
            await pc.setRemoteDescription({ type: 'answer', sdp: data.sdp_answer });
            stopRingTone();
            setCallStatus('connected');
            if (micStreamRef.current) {
              startRecordingMixer(micStreamRef.current, remoteStreamRef.current);
            }
          }
        }
      } catch (err) {
        console.warn('[WebRTC VoIP connect error]:', err);
      }
    };

    establishWebRTC();

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
        track.enabled = isMuted;
      });
    }
    setIsMuted(!isMuted);
  };

  // Handle Speaker Toggle
  const toggleSpeaker = () => {
    if (remoteAudioRef.current) {
      remoteAudioRef.current.muted = isSpeakerOn;
    }
    setIsSpeakerOn(!isSpeakerOn);
  };

  // Handle End Call with Audio Recording Save
  const handleEndCall = async () => {
    const finalDuration = duration;
    let finalRecordingUrl = '';

    // Stop recording and upload audio
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        await new Promise<void>((resolve) => {
          if (!mediaRecorderRef.current) return resolve();
          mediaRecorderRef.current.onstop = async () => {
            try {
              if (recordedChunksRef.current && recordedChunksRef.current.length > 0) {
                const mime = mediaRecorderRef.current?.mimeType || 'audio/webm';
                const audioBlob = new Blob(recordedChunksRef.current, { type: mime });
                
                const reader = new FileReader();
                reader.readAsDataURL(audioBlob);
                reader.onloadend = async () => {
                  const base64data = reader.result as string;
                  try {
                    const uploadUrl = getApiUrl('/api/chat/upload');
                    const upRes = await fetch(uploadUrl, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        mediaBase64: base64data,
                        mimeType: mime
                      })
                    });
                    if (upRes.ok) {
                      const upData = await upRes.json();
                      if (upData?.publicUrl) {
                        finalRecordingUrl = upData.publicUrl;
                      }
                    }
                  } catch (upErr) {
                    console.warn('[Call Recording Upload Error]:', upErr);
                  }
                  resolve();
                };
              } else {
                resolve();
              }
            } catch (e) {
              resolve();
            }
          };
          mediaRecorderRef.current.stop();
        });
      } catch (e) {}
    }

    cleanupAudio();
    setCallStatus('ended');
    setTimeout(() => {
      onClose(finalDuration, finalRecordingUrl);
    }, 400);
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

        {/* Client Avatar with Audio Visualizer Glow */}
        <div className="relative mb-5">
          <div 
            className={`w-28 h-28 rounded-full p-1 shadow-lg flex items-center justify-center transition-all duration-150 ${
              callStatus === 'connected' && remoteVolume > 0.05
                ? 'bg-gradient-to-tr from-emerald-500 to-green-400 ring-4 ring-emerald-400/40 shadow-emerald-500/40 scale-105'
                : 'bg-gradient-to-tr from-emerald-600 to-teal-500 shadow-emerald-500/20'
            }`}
          >
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
            <span className="absolute bottom-1 right-1 w-5 h-5 bg-emerald-500 border-2 border-gray-900 rounded-full animate-pulse" />
          )}
        </div>

        {/* Client Name */}
        <h2 className="text-xl font-bold text-white tracking-wide truncate max-w-xs mb-1">
          {call.clientName || 'Cliente'}
        </h2>

        {/* Call Timer or Ringing Subtext */}
        <div className="text-sm font-medium text-gray-400 mb-6">
          {callStatus === 'dialing' && 'Tocando no WhatsApp do cliente...'}
          {callStatus === 'connected' && (
            <div className="flex flex-col items-center gap-2">
              <span className="text-lg font-semibold text-emerald-400 font-mono">
                {formatTime(duration)}
              </span>

              {/* Real-time Audio Activity Waveform (AudioWorklet) */}
              <div className="flex items-center gap-1 h-3 mt-1">
                <span className="text-[10px] text-gray-400 mr-1.5">Voz:</span>
                {[0.2, 0.4, 0.6, 0.8, 1.0].map((threshold, idx) => {
                  const active = Math.max(localVolume * 4, remoteVolume * 4) >= threshold;
                  return (
                    <span
                      key={idx}
                      className={`w-1 rounded-full transition-all duration-75 ${
                        active ? 'bg-emerald-400 h-3' : 'bg-gray-700 h-1.5'
                      }`}
                    />
                  );
                })}
              </div>
            </div>
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

        {/* Hardware accelerated sound routing */}
        <audio ref={remoteAudioRef} autoPlay playsInline />

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
