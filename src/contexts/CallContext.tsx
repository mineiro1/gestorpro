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
  endCall: () => void;
}

const CallContext = createContext<CallContextType | undefined>(undefined);

export function CallProvider({ children }: { children: React.ReactNode }) {
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [isCallOpen, setIsCallOpen] = useState(false);

  const startCall = async ({ clientId, clientName, avatarUrl }: { clientId?: string; clientName: string; avatarUrl?: string }) => {
    setActiveCall({
      clientId,
      clientName: clientName || 'Cliente',
      avatarUrl,
      startedAt: Date.now(),
    });
    setIsCallOpen(true);

    try {
      if (clientId) {
        await fetch('/api/call/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId }),
        });
      }
    } catch (e) {
      console.warn('Erro ao inicializar chamada no backend:', e);
    }
  };

  const endCall = () => {
    if (activeCall?.clientId) {
      fetch('/api/call/hangup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: activeCall.clientId, callId: activeCall.callId }),
      }).catch((e) => console.warn('Erro ao encerrar chamada no backend:', e));
    }
    setIsCallOpen(false);
    setActiveCall(null);
  };

  return (
    <CallContext.Provider value={{ activeCall, isCallOpen, startCall, endCall }}>
      {children}
      {isCallOpen && activeCall && (
        <CallModal call={activeCall} onClose={endCall} />
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
