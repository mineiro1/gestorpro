import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import CallModal from '../components/CallModal';

export interface ActiveCall {
  clientId?: string;
  clientName: string;
  avatarUrl?: string;
  callId?: string;
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
    const callId = `call_${Date.now()}`;
    setActiveCall({
      clientId,
      clientName: clientName || 'Cliente',
      avatarUrl,
      callId,
      startedAt: Date.now(),
    });
    setIsCallOpen(true);

    try {
      if (clientId) {
        await fetch('/api/call/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId, callId }),
        });
      }
    } catch (e) {
      console.warn('Erro ao inicializar chamada no backend:', e);
    }
  };

  const endCall = (duration?: number) => {
    if (activeCall) {
      const callDuration = duration || (activeCall.startedAt ? Math.round((Date.now() - activeCall.startedAt) / 1000) : 0);
      fetch('/api/call/hangup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: activeCall.clientId,
          clientName: activeCall.clientName,
          callId: activeCall.callId,
          duration: callDuration,
        }),
      }).catch((e) => console.warn('Erro ao encerrar chamada no backend:', e));

      fetch('/api/calls/log', {
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
