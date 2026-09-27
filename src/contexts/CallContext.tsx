import React, { createContext, useContext, useState } from 'react';
import CallModal from '../components/CallModal';
import { getApiUrl } from '../lib/apiConfig';

export interface ActiveCall {
  clientId?: string;
  clientName: string;
  avatarUrl?: string;
  callId?: string;
  sessionId?: string;
  astracallsUrl?: string;
  astracallsApiKey?: string;
  startedAt?: number;
}

interface CallContextType {
  activeCall: ActiveCall | null;
  isCallOpen: boolean;
  startCall: (callData: { clientId?: string; clientName: string; avatarUrl?: string }) => Promise<void>;
  endCall: (duration?: number) => void;
}

const CallContext = createContext<CallContextType | undefined>(undefined);

export function CallProvider({ children }: { children: React.ReactNode }) {
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [isCallOpen, setIsCallOpen] = useState(false);

  const startCall = async ({ clientId, clientName, avatarUrl }: { clientId?: string; clientName: string; avatarUrl?: string }) => {
    let callId = `call_${Date.now()}`;
    let sessionId = 'd4f80e0ee23755d62116e25eabe7501b';
    let astracallsUrl = 'https://calls.rspiscinas.app.br';
    let astracallsApiKey = 'rs_piscinas_segredo_2026';

    setActiveCall({
      clientId,
      clientName: clientName || 'Cliente',
      avatarUrl,
      callId,
      sessionId,
      astracallsUrl,
      astracallsApiKey,
      startedAt: Date.now(),
    });
    setIsCallOpen(true);

    try {
      if (clientId) {
        const startRes = await fetch(getApiUrl('/api/call/start'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId, callId }),
        });

        if (startRes.ok) {
          const startData = await startRes.json().catch(() => null);
          if (startData && startData.callId) {
            callId = startData.callId;
            sessionId = startData.sessionId || sessionId;
            astracallsUrl = startData.astracallsUrl || astracallsUrl;
            astracallsApiKey = startData.astracallsApiKey || astracallsApiKey;

            setActiveCall((prev) => prev ? {
              ...prev,
              callId,
              sessionId,
              astracallsUrl,
              astracallsApiKey
            } : null);
          }
        }
      }
    } catch (e) {
      console.warn('Erro ao inicializar chamada no backend:', e);
    }
  };

  const endCall = (duration?: number) => {
    if (activeCall) {
      const callDuration = duration || (activeCall.startedAt ? Math.round((Date.now() - activeCall.startedAt) / 1000) : 0);
      
      fetch(getApiUrl('/api/call/hangup'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: activeCall.clientId,
          clientName: activeCall.clientName,
          callId: activeCall.callId,
          sessionId: activeCall.sessionId,
          duration: callDuration,
        }),
      }).catch((e) => console.warn('Erro ao encerrar chamada no backend:', e));

      fetch(getApiUrl('/api/calls/log'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: activeCall.clientId,
          clientName: activeCall.clientName,
          callId: activeCall.callId,
          duration: callDuration,
          status: 'completed',
        }),
      }).catch(() => {});
    }
    setIsCallOpen(false);
    setActiveCall(null);
  };

  return (
    <CallContext.Provider value={{ activeCall, isCallOpen, startCall, endCall }}>
      {children}
      {isCallOpen && activeCall && (
        <CallModal call={activeCall} onClose={(d) => endCall(d)} />
      )}
    </CallContext.Provider>
  );
}

export function useCall() {
  const context = useContext(CallContext);
  if (!context) {
    throw new Error('useCall must be used within a CallProvider');
  }
  return context;
}
