import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Volume2, VolumeX, PhoneOff, User, PhoneCall, Check } from 'lucide-react';
import { ActiveCall } from '../contexts/CallContext';
import { createVolumeMeterWorklet } from '../lib/audioWorklet';
import { getApiUrl } from '../lib/apiConfig';

interface CallModalProps {
  call: ActiveCall;
  onClose: (duration?: number, recordingUrl?: string) => void;
}

export default function CallModal({ call, onClose }: CallModalProps) {
  const [callStatus, setCallStatus] = useState<'dialing' | 'ringing' | 'connected' | 'ended'>('dialing');
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [duration, setDuration] = useState(0);
  const [localVolume, setLocalVolume] = useState(0);
  const [remoteVolume, setRemoteVolume] = useState(0);

  const callStatusRef = useRef<'dialing' | 'ringing' | 'connected' | 'ended'>('dialing');
  const timerRef = useRef<any>(null);
  const statusPollRef = useRef<any>(null);
  const consecutiveVoiceSamplesRef = useRef<number>(0);

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

  useEffect(() => {
    callStatusRef.current = callStatus;
  }, [callStatus]);

  // Start dual-channel recording mixer - disparado ESTRITAMENTE quando o cliente atende
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
        console.log('[VoIP Recording] Cliente atendeu: gravação da conversa iniciada:', mimeType || 'default');
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

  // Realistic Telephone Ringback Tone ("Tuuu... Tuuu...")
  // Padrão de telefonia: duas frequências senoidais puras (440Hz + 480Hz) com envelope suave de 1.2s de toque e 3.0s de silêncio
  const playRingTone = () => {
    try {
      stopRingTone();
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      ringAudioCtxRef.current = ctx;

      const playBurst = () => {
        if (!ctx || ctx.state === 'closed') return;
        try {
          if (ctx.state === 'suspended') ctx.resume().catch(() => {});
          const now = ctx.currentTime;

          const osc1 = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          const gain = ctx.createGain();

          osc1.type = 'sine';
          osc1.frequency.setValueAtTime(440, now);

          osc2.type = 'sine';
          osc2.frequency.setValueAtTime(480, now);

          // Envelope realista do tom de chamada telefônica
          gain.gain.setValueAtTime(0.0001, now);
          gain.gain.linearRampToValueAtTime(0.12, now + 0.05);
          gain.gain.setValueAtTime(0.12, now + 1.15);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.25);

          osc1.connect(gain);
          osc2.connect(gain);
          gain.connect(ctx.destination);

          osc1.start(now);
          osc2.start(now);
          osc1.stop(now + 1.25);
          osc2.stop(now + 1.25);
        } catch (e) {}
      };

      playBurst();
      ringOscRef.current = setInterval(playBurst, 3800);
    } catch (e) {
      console.warn('AudioContext ring tone error:', e);
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
      ringAudioCtxRef.current = null;
    }
  };

  // Transição oficial: CLIENTE ATENDEU A CHAMADA
  // Corta o som de "Tuuu... Tuuu...", dispara o cronômetro a partir de 00:00 e liga a gravação
  const handleCallAnswered = () => {
    if (callStatusRef.current === 'connected' || callStatusRef.current === 'ended') return;
    console.log('[VoIP] 📞 Cliente atendeu a chamada! Iniciando cronômetro e gravador de áudio...');
    stopRingTone();
    setCallStatus('connected');
    callStatusRef.current = 'connected';
    setDuration(0);

    // Inicia gravação de áudio no momento do atendimento
    if (micStreamRef.current) {
      startRecordingMixer(micStreamRef.current, remoteStreamRef.current);
    }
  };

  const cleanupAudio = () => {
    stopRingTone();

    if (statusPollRef.current) {
      clearInterval(statusPollRef.current);
      statusPollRef.current = null;
    }

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

  // Motor WebRTC VoIP do AstraCalls com Detecção de Atendimento e Som de Chamada Real
  useEffect(() => {
    // 1. Inicia som realista de telefone chamando
    playRingTone();

    const sessionId = call.sessionId || '8090cca3add0b8eb3e41efb9eec363e4';
    const apiKey = call.astracallsApiKey || 'rs_piscinas_segredo_2026';
    const astracallsUrl = (call.astracallsUrl || 'https://calls.rspiscinas.app.br').trim().replace(/\/$/, '');

    let isCleanedUp = false;

    // 2. Prepara microfone em segundo plano (pronto para gravação assim que atender)
    const initMicrophone = async () => {
      try {
        if (micStreamRef.current) return;
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

        // Medidor de volume do microfone local
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const actx = new AudioCtx();
          workletAudioCtxRef.current = actx;
          const { disconnect } = await createVolumeMeterWorklet(actx, micStream, (vol) => {
            if (!isCleanedUp) setLocalVolume(vol);
          });
          localWorkletDisconnectRef.current = disconnect;
        }

        // Se WebRTC já estiver pronto, conecta faixa
        if (pcRef.current && micStream.getAudioTracks().length > 0) {
          micStream.getAudioTracks().forEach(track => pcRef.current?.addTrack(track, micStream));
        }
      } catch (err) {
        console.warn('[Call Setup] Erro ao obter microfone:', err);
      }
    };

    initMicrophone();

    const establishWebRTC = async () => {
      if (!call.callId || call.callId.startsWith('call_')) {
        // Modo local ou aguardando callId
        setCallStatus('ringing');
        return;
      }

      try {
        if (!micStreamRef.current) {
          await initMicrophone();
        }
        const micStream = micStreamRef.current;
        if (!micStream || isCleanedUp) return;

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

            connectRemoteToMixer(rStream);

            // AudioWorklet para volume remoto e detecção de voz do cliente
            if (workletAudioCtxRef.current) {
              const { disconnect } = await createVolumeMeterWorklet(workletAudioCtxRef.current, rStream, (vol) => {
                if (!isCleanedUp) {
                  setRemoteVolume(vol);
                  // Se o cliente falar e houver áudio remoto vindo da linha, atende automaticamente!
                  if (vol > 0.03) {
                    consecutiveVoiceSamplesRef.current += 1;
                    if (consecutiveVoiceSamplesRef.current >= 2 && callStatusRef.current !== 'connected') {
                      handleCallAnswered();
                    }
                  } else {
                    consecutiveVoiceSamplesRef.current = 0;
                  }
                }
              });
              remoteWorkletDisconnectRef.current = disconnect;
            }
          }
        };

        pc.oniceconnectionstatechange = () => {
          if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
            // A conexão de rede com o servidor AstraCalls foi feita -> a ligação agora está tocando no celular do cliente
            if (callStatusRef.current === 'dialing') {
              setCallStatus('ringing');
              callStatusRef.current = 'ringing';
            }
          } else if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'closed') {
            if (!isCleanedUp && callStatusRef.current === 'connected') {
              handleEndCall();
            }
          }
        };

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

        // Exchange SDP with AstraCalls WebRTC endpoint
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
            // Chamada enviada com sucesso ao WhatsApp -> tocando no aparelho do cliente
            if (callStatusRef.current === 'dialing') {
              setCallStatus('ringing');
              callStatusRef.current = 'ringing';
            }
          }
        }
      } catch (err) {
        console.warn('[WebRTC VoIP connect error]:', err);
      }
    };

    establishWebRTC();

    // 3. Monitoramento em tempo real do status da chamada no AstraCalls
    // Detecta o momento exato em que o cliente clica para atender ou rejeita
    const pollCallStatus = async () => {
      if (!call.callId || callStatusRef.current === 'connected' || callStatusRef.current === 'ended') return;

      try {
        const queryUrl = getApiUrl(`/api/call/status?callId=${encodeURIComponent(call.callId)}&sessionId=${encodeURIComponent(sessionId)}`);
        const statusRes = await fetch(queryUrl);
        if (statusRes.ok) {
          const sData = await statusRes.json().catch(() => null);
          const c = sData?.call;
          if (c) {
            const state = String(c.state || c.status || '').toLowerCase();
            // Estados de atendimento do WhatsApp VoIP
            if (state === 'accept' || state === 'in-progress' || state === 'connected' || state === 'active' || state === 'answered') {
              handleCallAnswered();
            } else if (state === 'rejected' || state === 'terminate' || state === 'ended' || state === 'declined' || state === 'busy' || state === 'missed') {
              stopRingTone();
              setCallStatus('ended');
              callStatusRef.current = 'ended';
              setTimeout(() => {
                onClose(0, '');
              }, 1200);
            }
          }
        }
      } catch (e) {}
    };

    statusPollRef.current = setInterval(pollCallStatus, 1200);

    return () => {
      isCleanedUp = true;
      cleanupAudio();
    };
  }, [call.callId, call.sessionId]);

  // Cronômetro de Duração: Começa ESTRITAMENTE quando callStatus === 'connected'
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
    stopRingTone();
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
                    const sanitize = (name: string) => (name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]/g, '_');
                    const clientNamePart = sanitize(call.clientName || 'Cliente');
                    const callerNamePart = sanitize(call.callerName || 'Colaborador');
                    const dateStr = new Date().toISOString().slice(0, 10);
                    const fileName = `${clientNamePart}_ligacao_${callerNamePart}_${dateStr}_${Date.now()}.webm`;

                    const uploadUrl = getApiUrl('/api/chat/upload');
                    const upRes = await fetch(uploadUrl, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        mediaBase64: base64data,
                        mimeType: mime,
                        fileName: fileName
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
    callStatusRef.current = 'ended';

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
              Iniciando conexão de voz...
            </div>
          )}
          {callStatus === 'ringing' && (
            <div className="inline-flex items-center px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 text-xs font-medium border border-amber-500/30">
              <span className="w-2 h-2 rounded-full bg-amber-400 mr-2 animate-ping" />
              Chamando telefone do cliente (Tuuu... Tuuu...)
            </div>
          )}
          {callStatus === 'connected' && (
            <div className="inline-flex items-center px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-medium border border-emerald-500/30">
              <span className="w-2 h-2 rounded-full bg-emerald-400 mr-2 animate-pulse" />
              Em chamada de voz ao vivo (Gravando)
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
            className={`w-28 h-28 rounded-full p-1 shadow-lg flex items-center justify-center transition-all duration-200 ${
              callStatus === 'connected'
                ? remoteVolume > 0.05
                  ? 'bg-gradient-to-tr from-emerald-500 to-green-400 ring-4 ring-emerald-400/40 shadow-emerald-500/40 scale-105'
                  : 'bg-gradient-to-tr from-emerald-600 to-teal-500 shadow-emerald-500/20'
                : 'bg-gradient-to-tr from-blue-600 to-indigo-500 shadow-blue-500/20 animate-pulse'
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
        <div className="text-sm font-medium text-gray-400 mb-6 min-h-[44px] flex flex-col items-center justify-center">
          {(callStatus === 'dialing' || callStatus === 'ringing') && (
            <div className="flex flex-col items-center gap-1.5">
              <span className="text-xs text-amber-300 flex items-center gap-1 font-medium">
                <PhoneCall size={14} className="animate-bounce" />
                Tocando no telefone do cliente...
              </span>
              <button
                type="button"
                onClick={handleCallAnswered}
                className="text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 border border-emerald-500/40 transition-colors flex items-center gap-1"
                title="Clique caso o cliente já tenha atendido"
              >
                <Check size={12} />
                Cliente já atendeu
              </button>
            </div>
          )}

          {callStatus === 'connected' && (
            <div className="flex flex-col items-center gap-2">
              <span className="text-xl font-bold text-emerald-400 font-mono tracking-wider">
                {formatTime(duration)}
              </span>

              {/* Real-time Audio Activity Waveform (AudioWorklet) */}
              <div className="flex items-center gap-1 h-3 mt-0.5">
                <span className="text-[10px] text-gray-400 mr-1.5 font-mono">Áudio:</span>
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

          {callStatus === 'ended' && (
            <span className="text-xs text-red-400">Ligação finalizada</span>
          )}
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
