import React, { createContext, useContext, useState } from 'react';
import CallModal from '../components/CallModal';
import { getApiUrl } from '../lib/apiConfig';
import { useAuth } from './AuthContext';

export interface ActiveCall {
  clientId?: string;
  clientPhone?: string;
  clientName: string;
  avatarUrl?: string;
  callId?: string | null;
  sessionId?: string;
  astracallsUrl?: string;
  astracallsApiKey?: string;
  startedAt?: number;
}

interface CallContextType {
  activeCall: ActiveCall | null;
  isCallOpen: boolean;
  startCall: (callData: { clientId?: string; clientPhone?: string; clientName: string; avatarUrl?: string }) => Promise<void>;
  endCall: (duration?: number, recordingUrl?: string) => void;
}

const CallContext = createContext<CallContextType | undefined>(undefined);

export function CallProvider({ children }: { children: React.ReactNode }) {
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [isCallOpen, setIsCallOpen] = useState(false);
  const { userProfile } = useAuth();

  const startCall = async ({ clientId, clientPhone, clientName, avatarUrl }: { clientId?: string; clientPhone?: string; clientName: string; avatarUrl?: string }) => {
    let sessionId = '8090cca3add0b8eb3e41efb9eec363e4';
    let astracallsUrl = 'https://calls.rspiscinas.app.br';
    let astracallsApiKey = 'rs_piscinas_segredo_2026';

    // Open modal immediately in dialing state (callId null while connecting)
    setActiveCall({
      clientId,
      clientPhone,
      clientName: clientName || 'Cliente',
      avatarUrl,
      callId: null,
      sessionId,
      astracallsUrl,
      astracallsApiKey,
      startedAt: Date.now(),
    });
    setIsCallOpen(true);

    let realCallId: string | null = null;

    // 1. Tentar primeiro via backend /api/call/start
    try {
      if (clientId || clientPhone) {
        const startRes = await fetch(getApiUrl('/api/call/start'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId, phone: clientPhone }),
        });

        if (startRes.ok) {
          const startData = await startRes.json().catch(() => null);
          if (startData && startData.callId) {
            realCallId = startData.callId;
            sessionId = startData.sessionId || sessionId;
            astracallsUrl = startData.astracallsUrl || astracallsUrl;
            astracallsApiKey = startData.astracallsApiKey || astracallsApiKey;
          }
        }
      }
    } catch (e) {
      console.warn('Backend /api/call/start indisponível:', e);
    }

    // 2. Fallback direto ao AstraCalls caso o backend não retorne
    if (!realCallId && clientPhone) {
      const cleanDigits = String(clientPhone).replace(/\D/g, '');
      let baseNumber = cleanDigits;
      if (!baseNumber.startsWith('55') && (baseNumber.length === 10 || baseNumber.length === 11)) {
        baseNumber = '55' + baseNumber;
      } else if (!baseNumber.startsWith('55') && (baseNumber.length === 8 || baseNumber.length === 9)) {
        baseNumber = '5567' + baseNumber;
      }

      let twelveDigit = '';
      let thirteenDigit = '';
      if (baseNumber.startsWith('55') && baseNumber.length >= 12) {
        const ddd = baseNumber.substring(2, 4);
        const rest = baseNumber.substring(4);
        if (baseNumber.length === 13 && rest.startsWith('9')) {
          thirteenDigit = baseNumber;
          twelveDigit = `55${ddd}${rest.substring(1)}`;
        } else if (baseNumber.length === 12) {
          twelveDigit = baseNumber;
          thirteenDigit = `55${ddd}9${rest}`;
        }
      }

      // AstraCalls VoIP: O formato de 12 dígitos sem o 9 DEVE vir em primeiro lugar!
      const variants: string[] = [];
      if (twelveDigit) variants.push(twelveDigit);
      if (thirteenDigit) variants.push(thirteenDigit);
      if (!twelveDigit && !thirteenDigit) variants.push(baseNumber);

      for (const targetNumber of variants) {
        try {
          const directRes = await fetch(`${astracallsUrl}/api/sessions/${sessionId}/calls`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Api-Key': astracallsApiKey
            },
            body: JSON.stringify({ to: targetNumber, phone: targetNumber })
          });
          if (directRes.ok) {
            const directData = await directRes.json().catch(() => null);
            realCallId = directData?.call?.callId || directData?.callId || null;
            if (realCallId) break;
          }
        } catch (directErr) {
          console.warn('Erro ao disparar direto no AstraCalls:', directErr);
        }
      }
    }

    if (realCallId) {
      setActiveCall((prev) => prev ? {
        ...prev,
        callId: realCallId,
        sessionId,
        astracallsUrl,
        astracallsApiKey
      } : null);
    }
  };

  const endCall = (duration?: number, recordingUrl?: string) => {
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
          clientPhone: activeCall.clientPhone,
          callerName: userProfile?.name || 'Administrador',
          callId: activeCall.callId,
          duration: callDuration,
          recording_url: recordingUrl || undefined,
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
        <CallModal call={activeCall} onClose={(d, recUrl) => endCall(d, recUrl)} />
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
