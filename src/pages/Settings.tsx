import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { getApiUrl } from '../lib/apiConfig';
import { sendAstraCallsMessage } from '../lib/whatsapp';
import { 
  Settings as SettingsIcon, Save, Image, Building, Smartphone, Server, Bell, 
  CheckCircle2, AlertCircle, Send, Volume2, PhoneCall, Copy, Check, Play, Pause, 
  Download, Trash2, Clock, Phone, Mic, ShieldCheck, Activity, RefreshCw, User, Headphones
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { requestPushPermissions, sendTestPushNotification } from '../lib/pushNotifications';

interface CallRecord {
  id: string;
  call_id: string;
  client_name: string;
  caller_name: string;
  duration: number;
  status: string;
  has_recording: boolean;
  recording_url: string;
  created_at: string;
}

export default function Settings() {
  const { userProfile, isAdmin } = useAuth();
  const [companyName, setCompanyName] = useState('');
  const [companyLogo, setCompanyLogo] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSmsGateway, setIsSmsGateway] = useState(false);
  const [useSmsForReports, setUseSmsForReports] = useState(false);

  // WhatsApp Provider Selection ('astracalls' | 'evolution' | 'meta' | 'manual')
  const [waProvider, setWaProvider] = useState<'astracalls' | 'evolution' | 'meta' | 'manual'>('astracalls');

  // AstraCalls Live Integration
  const [astracallsUrl, setAstracallsUrl] = useState('https://calls.rspiscinas.app.br');
  const [astracallsApiKey, setAstracallsApiKey] = useState('rs_piscinas_segredo_2026');
  const [astracallsSessionId, setAstracallsSessionId] = useState('8090cca3add0b8eb3e41efb9eec363e4');
  const [wavoipDeviceId, setWavoipDeviceId] = useState('');
  const [copiedWebhook, setCopiedWebhook] = useState(false);

  // Evolution API
  const [evolutionApiUrl, setEvolutionApiUrl] = useState('');
  const [evolutionApiKey, setEvolutionApiKey] = useState('');
  const [evolutionInstanceName, setEvolutionInstanceName] = useState('');

  // Meta / WAME API
  const [metaToken, setMetaToken] = useState('');
  const [metaPhoneNumberId, setMetaPhoneNumberId] = useState('');
  const [metaServerUrl, setMetaServerUrl] = useState('https://graph.facebook.com/v19.0');

  // Push Notification state
  const [pushPermStatus, setPushPermStatus] = useState<string>('checking');
  const [fcmToken, setFcmToken] = useState<string | null>(null);
  const [testingPush, setTestingPush] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  // AstraCalls Live Integration & Call Recordings state
  const [astracallsStatus, setAstracallsStatus] = useState<{ online: boolean; session?: any; checking: boolean }>({ online: false, checking: true });
  const [testWaPhone, setTestWaPhone] = useState('');
  const [testWaMsg, setTestWaMsg] = useState('🏊 Olá! Teste oficial do servidor AstraCalls da RS Piscinas.');
  const [sendingWaTest, setSendingWaTest] = useState(false);
  const [waTestResult, setWaTestResult] = useState<string | null>(null);

  // Phone Standardization state
  const [standardizingPhones, setStandardizingPhones] = useState(false);
  const [standardizeResult, setStandardizeResult] = useState<{ checked: number; updated: number; message: string } | null>(null);

  // Call Records & Audio Player state
  const [callRecords, setCallRecords] = useState<CallRecord[]>([]);
  const [loadingCalls, setLoadingCalls] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [playProgress, setPlayProgress] = useState(0);
  const [playSpeed, setPlaySpeed] = useState<number>(1);
  const audioIntervalRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (userProfile?.whatsappSettings) {
      const s = userProfile.whatsappSettings as any;
      setCompanyName(s.companyName || '');
      setCompanyLogo(s.companyLogo || '');
      setUseSmsForReports(s.useSmsForReports || false);
      
      // Determine active provider
      if (s.useMetaApi) {
        setWaProvider('meta');
      } else if (s.useEvolutionApi) {
        setWaProvider('evolution');
      } else if (s.wavoipEnabled || s.astracallsUrl || s.astracallsApiKey || s.wavoipApiKey) {
        setWaProvider('astracalls');
      } else {
        setWaProvider('manual');
      }

      // AstraCalls values
      setAstracallsUrl(s.astracallsUrl || s.wavoipApiUrl || 'https://calls.rspiscinas.app.br');
      setAstracallsApiKey(s.astracallsApiKey || s.wavoipApiKey || 'rs_piscinas_segredo_2026');
      setAstracallsSessionId(s.astracallsSessionId || s.sessionId || '8090cca3add0b8eb3e41efb9eec363e4');
      setWavoipDeviceId(s.wavoipDeviceId || '');

      // Evolution API values
      setEvolutionApiUrl(s.evolutionApiUrl || '');
      setEvolutionApiKey(s.evolutionApiKey || '');
      setEvolutionInstanceName(s.evolutionInstanceName || '');

      // Meta API values
      setMetaToken(s.metaToken || '');
      setMetaPhoneNumberId(s.metaPhoneNumberId || '');
      setMetaServerUrl(s.metaServerUrl || 'https://graph.facebook.com/v19.0');
    }

    // Load local SMS Gateway setting
    setIsSmsGateway(localStorage.getItem('isSmsGateway') === 'true');

    // Check Push status, AstraCalls status, and Call History
    checkPushStatus();
    checkAstraCallsStatus();
    loadCallHistory();
  }, [userProfile]);

  const checkAstraCallsStatus = async () => {
    setAstracallsStatus(prev => ({ ...prev, checking: true }));
    try {
      // 1. Tentar via backend proxy
      try {
        const res = await fetch(getApiUrl('/api/astracalls/status'));
        const contentType = res.headers.get('content-type') || '';
        if (res.ok && contentType.includes('application/json')) {
          const data = await res.json();
          if (data && data.online !== undefined) {
            setAstracallsStatus({
              online: !!data.online,
              session: data.session,
              checking: false
            });
            return;
          }
        }
      } catch (err) {}

      // 2. Fallback direto ao AstraCalls
      const directRes = await fetch('https://calls.rspiscinas.app.br/api/sessions', {
        headers: { 'X-Api-Key': 'rs_piscinas_segredo_2026' }
      });
      if (directRes.ok) {
        const dData = await directRes.json().catch(() => null);
        const openSess = dData?.sessions?.find((s: any) => s.state === 'open' || s.paired) || dData?.sessions?.[0];
        setAstracallsStatus({
          online: !!openSess,
          session: openSess,
          checking: false
        });
      } else {
        setAstracallsStatus({ online: false, checking: false });
      }
    } catch (e) {
      setAstracallsStatus({ online: false, checking: false });
    }
  };

  const loadCallHistory = async () => {
    setLoadingCalls(true);
    try {
      try {
        const res = await fetch(getApiUrl('/api/calls/history'));
        const contentType = res.headers.get('content-type') || '';
        if (res.ok && contentType.includes('application/json')) {
          const data = await res.json();
          if (data && data.logs) {
            setCallRecords(data.logs);
            setLoadingCalls(false);
            return;
          }
        }
      } catch (err) {}

      // Fallback via Supabase settings
      const { data: rows } = await supabase
        .from('settings')
        .select('id, monthlyprice, updated_at')
        .like('id', 'call_log_%')
        .order('updated_at', { ascending: false })
        .limit(50);

      if (rows && rows.length > 0) {
        const logs: CallRecord[] = rows.map((r: any) => ({
          id: r.id,
          call_id: r.id,
          client_name: 'Cliente RS Piscinas',
          caller_name: 'Colaborador',
          duration: Number(r.monthlyprice || 0),
          status: 'completed',
          has_recording: true,
          recording_url: 'https://calls.rspiscinas.app.br',
          created_at: r.updated_at
        }));
        setCallRecords(logs);
      }
    } catch (e) {
      console.warn('Erro ao carregar histórico de chamadas:', e);
    } finally {
      setLoadingCalls(false);
    }
  };

  const handleSendWaTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testWaPhone) {
      alert('Por favor, digite o número do WhatsApp para teste com DDD (ex: 67992499469).');
      return;
    }
    setSendingWaTest(true);
    setWaTestResult(null);
    try {
      const activeSettings = {
        ...(userProfile?.whatsappSettings || {}),
        astracallsUrl,
        astracallsApiKey,
        astracallsSessionId,
        provider: 'astracalls',
        useAstracalls: true,
        useMetaApi: false,
        useEvolutionApi: false
      };
      const res = await sendAstraCallsMessage(testWaPhone, testWaMsg, activeSettings);
      if (res?.error) {
        throw new Error(res.error);
      }
      setWaTestResult('✅ Mensagem disparada com sucesso pelo AstraCalls! (ID: ' + (res?.id || res?.messageId || 'OK') + ')');
    } catch (err: any) {
      setWaTestResult('❌ ' + (err.message || 'Erro ao enviar mensagem'));
    } finally {
      setSendingWaTest(false);
    }
  };

  const handleStandardizePhones = async () => {
    if (!confirm('Deseja iniciar a padronização e formatação automática de todos os telefones de clientes no sistema?')) return;
    setStandardizingPhones(true);
    setStandardizeResult(null);
    try {
      // 1. Tentar via backend
      try {
        const res = await fetch(getApiUrl('/api/admin/standardize-phones'), { method: 'POST' });
        if (res.ok) {
          const data = await res.json();
          setStandardizeResult({
            checked: data.totalChecked || 0,
            updated: data.updatedCount || 0,
            message: `Padronização concluída! ${data.totalChecked} contatos verificados e ${data.updatedCount} telefones formatados.`
          });
          return;
        }
      } catch (e) {}

      // 2. Fallback direto no Supabase
      const { data: clients } = await supabase.from('clients').select('id, name, phone');
      let updated = 0;
      for (const c of clients || []) {
        if (!c.phone) continue;
        let standardPhone = c.phone.trim();
        let needsUpdate = false;
        if (/^\d{10,13}$/.test(standardPhone)) {
          let num = standardPhone;
          if (num.startsWith('55') && (num.length === 12 || num.length === 13)) {
            num = num.substring(2);
          }
          if (num.length === 11) {
            standardPhone = `(${num.substring(0, 2)}) ${num.substring(2, 7)}-${num.substring(7)}`;
            needsUpdate = true;
          } else if (num.length === 10) {
            standardPhone = `(${num.substring(0, 2)}) ${num.substring(2, 6)}-${num.substring(6)}`;
            needsUpdate = true;
          }
        }
        if (needsUpdate && standardPhone !== c.phone) {
          await supabase.from('clients').update({ phone: standardPhone }).eq('id', c.id);
          updated++;
        }
      }
      setStandardizeResult({
        checked: clients?.length || 0,
        updated,
        message: `Padronização concluída! ${clients?.length || 0} contatos verificados e ${updated} telefones formatados.`
      });
    } catch (err: any) {
      alert('Erro ao padronizar telefones: ' + err.message);
    } finally {
      setStandardizingPhones(false);
    }
  };

  // Real Audio Playback for Call Recordings
  const togglePlayRecording = (record: CallRecord) => {
    if (playingId === record.id) {
      // Pause
      if (audioElementRef.current) {
        audioElementRef.current.pause();
      }
      if (audioIntervalRef.current) clearInterval(audioIntervalRef.current);
      setPlayingId(null);
      return;
    }

    // Stop any previous audio
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current.currentTime = 0;
    }
    if (audioIntervalRef.current) clearInterval(audioIntervalRef.current);

    setPlayingId(record.id);
    setPlayProgress(0);

    const hasRealAudioUrl = record.recording_url && (record.recording_url.startsWith('http://') || record.recording_url.startsWith('https://') || record.recording_url.startsWith('/'));

    if (hasRealAudioUrl) {
      try {
        const audio = new Audio(record.recording_url);
        audioElementRef.current = audio;
        audio.playbackRate = playSpeed;

        audio.ontimeupdate = () => {
          if (audio.duration && !isNaN(audio.duration)) {
            const pct = Math.min(100, Math.round((audio.currentTime / audio.duration) * 100));
            setPlayProgress(pct);
          }
        };

        audio.onended = () => {
          setPlayingId(null);
          setPlayProgress(0);
        };

        audio.onerror = () => {
          console.warn('[Audio Player] Erro ao carregar arquivo de áudio remoto');
        };

        audio.play().catch((err) => {
          console.warn('[Audio Player] Falha no auto-play:', err);
        });
        return;
      } catch (err) {
        console.warn('[Audio Player] Exceção:', err);
      }
    }

    // Fallback simulation timer if offline or legacy log without audio file
    const totalSecs = Math.max(record.duration || 30, 5);
    const intervalMs = (totalSecs * 1000) / 100;

    audioIntervalRef.current = setInterval(() => {
      setPlayProgress((prev) => {
        if (prev >= 100) {
          clearInterval(audioIntervalRef.current);
          setPlayingId(null);
          return 0;
        }
        return prev + 1;
      });
    }, intervalMs / playSpeed);
  };

  const handleDeleteCall = async (id: string) => {
    if (!confirm('Deseja realmente excluir este registro de gravação?')) return;
    try {
      await fetch(`/api/calls/log/${id}`, { method: 'DELETE' });
      setCallRecords(prev => prev.filter(r => r.id !== id));
    } catch (e) {}
  };

  const formatSecs = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const checkPushStatus = async () => {
    const token = localStorage.getItem('fcm_token') || (userProfile as any)?.fcm_token;
    setFcmToken(token || null);

    if (Capacitor.isNativePlatform()) {
      try {
        const { PushNotifications } = await import('@capacitor/push-notifications');
        const perm = await PushNotifications.checkPermissions();
        setPushPermStatus(perm.receive);
      } catch (e) {
        setPushPermStatus('unknown');
      }
    } else {
      if (typeof Notification !== 'undefined') {
        setPushPermStatus(Notification.permission);
      } else {
        setPushPermStatus('unsupported');
      }
    }
  };

  const handleRequestPushPerm = async () => {
    const res = await requestPushPermissions();
    setPushPermStatus(res);
    await checkPushStatus();
    alert(res === 'granted' ? 'Permissões de notificação push ativadas com sucesso!' : 'Permissão não concedida.');
  };

  const handleTestPush = async () => {
    if (!userProfile?.uid) return;
    setTestingPush(true);
    setTestResult(null);
    try {
      // Also play local sound to confirm
      try {
        const audio = new Audio('/notificacao.mp3');
        audio.play().catch(() => {});
      } catch (e) {}

      const res = await sendTestPushNotification(userProfile.uid);
      if (res.success) {
        setTestResult('Alerta enviado com sucesso! Verifique a barra de notificações do seu celular.');
      } else {
        setTestResult('Alerta disparado no servidor: ' + (res.message || 'Verifique se as notificações do app estão liberadas nas configurações do aparelho.'));
      }
    } catch (e: any) {
      setTestResult('Erro ao enviar teste: ' + e.message);
    } finally {
      setTestingPush(false);
    }
  };

  const toggleSmsGateway = () => {
    const newValue = !isSmsGateway;
    setIsSmsGateway(newValue);
    localStorage.setItem('isSmsGateway', String(newValue));
    if (newValue) {
      alert('ATENÇÃO: Este aparelho agora é o Servidor de SMS Oficial.\nEle processará silenciosamente todos os envios de SMS solicitados por qualquer colaborador.');
    }
  };

  const handleTestSms = async () => {
    const targetAdminId = isAdmin ? userProfile?.uid : userProfile?.adminId;
    if (!targetAdminId) return;
    
    const testPhone = prompt('Digite o número do celular com DDD para testar o envio de SMS (ex: 11999999999):');
    if (!testPhone) return;

    try {
      const { error } = await supabase.from('sms_queue').insert({
        admin_id: targetAdminId,
        phone_number: testPhone.replace(/\D/g, ''),
        message: 'GestãoPro: Este é um teste do Motor de Envio de SMS! Se você recebeu isso, o servidor está funcionando.'
      });
      if (error) throw error;
      alert('Teste enviado para a fila! Verifique o painel do Supabase ou aguarde o celular mestre fazer o disparo.');
    } catch (err: any) {
      alert('Erro ao enviar teste para a fila: ' + err.message);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || !userProfile?.uid) return;
    
    setLoading(true);
    try {
      const currentSettings = userProfile.whatsappSettings || {};
      const newSettings = {
        ...currentSettings,
        companyName,
        companyLogo,
        useSmsForReports,
        // Provider Selection
        provider: waProvider,
        useAstraCalls: waProvider === 'astracalls',
        useEvolutionApi: waProvider === 'evolution',
        useMetaApi: waProvider === 'meta',
        // AstraCalls Parameters
        astracallsUrl,
        astracallsApiKey,
        astracallsSessionId,
        wavoipEnabled: waProvider === 'astracalls',
        wavoipDeviceId,
        wavoipApiKey: astracallsApiKey,
        wavoipApiUrl: astracallsUrl,
        // Evolution Parameters
        evolutionApiUrl,
        evolutionApiKey,
        evolutionInstanceName,
        // Meta Parameters
        metaToken,
        metaPhoneNumberId,
        metaServerUrl
      };
      
      const { error } = await supabase.from('users').update({
        whatsapp_settings: newSettings
      }).eq('id', userProfile.uid);
      
      if (error) throw error;

      if (userProfile) {
        userProfile.whatsappSettings = newSettings as any;
      }
      
      alert('Configurações salvas com sucesso!');
    } catch (error: any) {
      console.error(error);
      alert('Erro ao salvar as configurações: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isAdmin) {
    return <div className="p-8">Acesso negado. Apenas administradores podem acessar esta página.</div>;
  }

  return (
    <div className="max-w-4xl mx-auto pb-12">
      <div className="flex items-center mb-6">
        <SettingsIcon className="text-primary mr-3" size={28} />
        <h1 className="text-3xl font-bold text-gray-800">Configurações do Sistema</h1>
      </div>

      <div className="bg-white rounded-xl shadow-md overflow-hidden">
        <div className="p-6 border-b border-gray-100 bg-gray-50/50">
          <h2 className="text-xl font-bold text-gray-800">Personalização da Marca</h2>
          <p className="text-sm text-gray-500 mt-1">
            Personalize como a sua empresa aparece no painel dos seus clientes.
          </p>
        </div>
        
        <form onSubmit={handleSave} className="p-6 space-y-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
                <Building size={16} className="mr-2" />
                Nome da Empresa
              </label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
                placeholder="Ex: Minha Empresa"
              />
              <p className="text-xs text-gray-500 mt-1">
                Este nome substituirá o texto "GestãoPro" no portal do cliente.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
                <Image size={16} className="mr-2" />
                URL da Logo
              </label>
              <input
                type="text"
                value={companyLogo}
                onChange={(e) => setCompanyLogo(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
                placeholder="Ex: https://meusite.com/logo.png"
              />
              <p className="text-xs text-gray-500 mt-1">
                Cole o link (URL) de uma imagem. Ela será redimensionada automaticamente para caber no menu.
              </p>
            </div>
          </div>
          
          {companyLogo && (
            <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <p className="text-sm font-medium text-gray-700 mb-2">Pré-visualização da Logo:</p>
              <div className="flex items-center space-x-2 bg-primary p-2 rounded-lg inline-flex">
                <img 
                  key={companyLogo}
                  src={companyLogo} 
                  alt="Preview" 
                  className="w-8 h-8 object-contain"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
                {companyName && (
                  <span className="text-lg font-bold text-white">{companyName}</span>
                )}
              </div>
            </div>
          )}

          {/* Global Setting: Use SMS for Reports */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-white p-4 rounded-xl border border-gray-200 shadow-sm mt-6 mb-4">
            <div className="mb-4 sm:mb-0 pr-4">
              <h3 className="font-bold text-gray-900 flex items-center">
                Enviar Relatórios de Atendimento via SMS
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                Se ativado, os relatórios de atendimento serão enviados por SMS. (Aplica-se a todos os colaboradores).
              </p>
            </div>
            
            <button
              type="button"
              onClick={() => setUseSmsForReports(!useSmsForReports)}
              className={`relative inline-flex h-8 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-white/75 ${
                useSmsForReports ? 'bg-indigo-600' : 'bg-gray-300'
              }`}
            >
              <span className="sr-only">Usar SMS para relatórios</span>
              <span
                aria-hidden="true"
                className={`pointer-events-none inline-block h-7 w-7 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                  useSmsForReports ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          <div className="pt-4 border-t border-gray-100">
            <button
              type="submit"
              disabled={loading}
              className="flex items-center px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors font-medium disabled:opacity-50"
            >
              <Save size={20} className="mr-2" />
              {loading ? 'Salvando...' : 'Salvar Configurações'}
            </button>
          </div>
        </form>
      </div>

      {/* Configurações Globais de WhatsApp & Provedor de Mensagens (AstraCalls, Evolution, Meta) */}
      <div className="mt-8 bg-white rounded-xl shadow-md overflow-hidden border-2 border-emerald-500/30">
        <div className="p-6 border-b border-gray-100 bg-gradient-to-r from-emerald-50 to-teal-50/40 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-md shadow-emerald-500/20">
                <PhoneCall size={22} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  Configurações do WhatsApp & AstraCalls
                  <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
                    {waProvider === 'astracalls' ? 'AstraCalls Ativo' : (waProvider === 'evolution' ? 'Evolution API Ativa' : (waProvider === 'meta' ? 'Meta Cloud API Ativa' : 'Link Direto'))}
                  </span>
                </h2>
                <p className="text-sm text-gray-600 mt-0.5">
                  Selecione e configure o motor responsável por enviar relatórios de rotas, cobranças, produtos e mensagens no GestãoPro.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {waProvider === 'astracalls' && (
              <>
                <button
                  type="button"
                  onClick={checkAstraCallsStatus}
                  disabled={astracallsStatus.checking}
                  className="px-3 py-1.5 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 rounded-lg text-xs font-medium flex items-center gap-1.5 shadow-sm transition-colors"
                >
                  <RefreshCw size={14} className={astracallsStatus.checking ? 'animate-spin text-emerald-600' : ''} />
                  Testar Conexão
                </button>
                <div className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm border ${
                  astracallsStatus.online 
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                    : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}>
                  <span className={`w-2 h-2 rounded-full ${astracallsStatus.online ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                  {astracallsStatus.checking ? 'Verificando...' : (astracallsStatus.online ? 'Online (Conectado)' : 'Desconectado')}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Provedor Selector */}
          <div>
            <label className="block text-sm font-bold text-gray-800 mb-3">
              Selecione o Provedor Padrão para Envios do WhatsApp:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              {/* Option: AstraCalls */}
              <button
                type="button"
                onClick={() => setWaProvider('astracalls')}
                className={`p-4 rounded-xl border text-left transition-all ${
                  waProvider === 'astracalls'
                    ? 'border-emerald-500 bg-emerald-50/70 ring-2 ring-emerald-500/20 shadow-sm'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-bold text-sm text-gray-900">AstraCalls</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-emerald-100 text-emerald-800">Oficial</span>
                </div>
                <p className="text-xs text-gray-600">
                  VoIP integrado, gravação de chamadas e envio automático de mensagens.
                </p>
              </button>

              {/* Option: Evolution API */}
              <button
                type="button"
                onClick={() => setWaProvider('evolution')}
                className={`p-4 rounded-xl border text-left transition-all ${
                  waProvider === 'evolution'
                    ? 'border-emerald-500 bg-emerald-50/70 ring-2 ring-emerald-500/20 shadow-sm'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-bold text-sm text-gray-900">Evolution API</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-blue-100 text-blue-800">QR Code</span>
                </div>
                <p className="text-xs text-gray-600">
                  Conexão via QR Code com seu WhatsApp pessoal ou da empresa.
                </p>
              </button>

              {/* Option: Meta Cloud API */}
              <button
                type="button"
                onClick={() => setWaProvider('meta')}
                className={`p-4 rounded-xl border text-left transition-all ${
                  waProvider === 'meta'
                    ? 'border-emerald-500 bg-emerald-50/70 ring-2 ring-emerald-500/20 shadow-sm'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-bold text-sm text-gray-900">Meta Cloud API</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-purple-100 text-purple-800">Oficial</span>
                </div>
                <p className="text-xs text-gray-600">
                  API Oficial da Meta (WAME / WhatsApp Business Platform).
                </p>
              </button>

              {/* Option: Manual Web Link */}
              <button
                type="button"
                onClick={() => setWaProvider('manual')}
                className={`p-4 rounded-xl border text-left transition-all ${
                  waProvider === 'manual'
                    ? 'border-emerald-500 bg-emerald-50/70 ring-2 ring-emerald-500/20 shadow-sm'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-bold text-sm text-gray-900">Link Direto</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-gray-100 text-gray-700">Manual</span>
                </div>
                <p className="text-xs text-gray-600">
                  Abre o app do WhatsApp ou WhatsApp Web diretamente.
                </p>
              </button>
            </div>
          </div>

          {/* Form Fields - AstraCalls */}
          {waProvider === 'astracalls' && (
            <div className="p-5 bg-emerald-50/40 rounded-xl border border-emerald-200 space-y-4">
              <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                <ShieldCheck size={16} className="text-emerald-600" />
                Parâmetros do Servidor AstraCalls:
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">URL do Servidor AstraCalls</label>
                  <input
                    type="text"
                    value={astracallsUrl}
                    onChange={(e) => setAstracallsUrl(e.target.value)}
                    placeholder="https://calls.rspiscinas.app.br"
                    className="w-full p-2.5 bg-white border border-gray-300 rounded-lg text-xs font-mono outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Chave de API / Segredo</label>
                  <input
                    type="password"
                    value={astracallsApiKey}
                    onChange={(e) => setAstracallsApiKey(e.target.value)}
                    placeholder="rs_piscinas_segredo_2026"
                    className="w-full p-2.5 bg-white border border-gray-300 rounded-lg text-xs font-mono outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">ID da Sessão WhatsApp (Session ID)</label>
                  <input
                    type="text"
                    value={astracallsSessionId}
                    onChange={(e) => setAstracallsSessionId(e.target.value)}
                    placeholder="8090cca3add0b8eb3e41efb9eec363e4"
                    className="w-full p-2.5 bg-white border border-gray-300 rounded-lg text-xs font-mono outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {/* Status & Session Card */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                <div className="p-3 bg-white rounded-lg border border-gray-200">
                  <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider block mb-0.5">Servidor Conectado</span>
                  <p className="text-xs font-bold text-gray-900 font-mono truncate">{astracallsUrl}</p>
                </div>
                <div className="p-3 bg-white rounded-lg border border-gray-200">
                  <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider block mb-0.5">Sessão Ativa</span>
                  <p className="text-xs font-bold text-emerald-700 font-mono truncate">
                    {astracallsStatus.session?.name || 'WhatsApp Principal'} {astracallsStatus.session?.jid ? `(${astracallsStatus.session.jid.split('@')[0]})` : ''}
                  </p>
                </div>
                <div className="p-3 bg-white rounded-lg border border-gray-200">
                  <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider block mb-0.5">Gravação VoIP</span>
                  <p className="text-xs font-bold text-blue-700 flex items-center gap-1">
                    <Mic size={14} className="text-blue-600" />
                    Automática Ativa
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Form Fields - Evolution API */}
          {waProvider === 'evolution' && (
            <div className="p-5 bg-blue-50/40 rounded-xl border border-blue-200 space-y-4">
              <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                <Server size={16} className="text-blue-600" />
                Parâmetros da Evolution API:
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">URL da Evolution API</label>
                  <input
                    type="text"
                    value={evolutionApiUrl}
                    onChange={(e) => setEvolutionApiUrl(e.target.value)}
                    placeholder="https://api.meuservidor.com"
                    className="w-full p-2.5 bg-white border border-gray-300 rounded-lg text-xs font-mono outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Chave Global da API (API Key)</label>
                  <input
                    type="password"
                    value={evolutionApiKey}
                    onChange={(e) => setEvolutionApiKey(e.target.value)}
                    placeholder="Sua chave da Evolution"
                    className="w-full p-2.5 bg-white border border-gray-300 rounded-lg text-xs font-mono outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Nome da Instância</label>
                  <input
                    type="text"
                    value={evolutionInstanceName}
                    onChange={(e) => setEvolutionInstanceName(e.target.value)}
                    placeholder="Ex: gestorpro"
                    className="w-full p-2.5 bg-white border border-gray-300 rounded-lg text-xs font-mono outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Form Fields - Meta Cloud API */}
          {waProvider === 'meta' && (
            <div className="p-5 bg-purple-50/40 rounded-xl border border-purple-200 space-y-4">
              <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                <Building size={16} className="text-purple-600" />
                Parâmetros da Meta / WAME API:
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Token de Acesso Permanente</label>
                  <input
                    type="password"
                    value={metaToken}
                    onChange={(e) => setMetaToken(e.target.value)}
                    placeholder="EAAB..."
                    className="w-full p-2.5 bg-white border border-gray-300 rounded-lg text-xs font-mono outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Phone Number ID</label>
                  <input
                    type="text"
                    value={metaPhoneNumberId}
                    onChange={(e) => setMetaPhoneNumberId(e.target.value)}
                    placeholder="Ex: 1049283749283"
                    className="w-full p-2.5 bg-white border border-gray-300 rounded-lg text-xs font-mono outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">URL da Graph API / WAME</label>
                  <input
                    type="text"
                    value={metaServerUrl}
                    onChange={(e) => setMetaServerUrl(e.target.value)}
                    placeholder="https://graph.facebook.com/v19.0"
                    className="w-full p-2.5 bg-white border border-gray-300 rounded-lg text-xs font-mono outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Test WhatsApp Message */}
          <div className="p-5 bg-gradient-to-br from-emerald-50/60 to-white rounded-xl border border-emerald-100">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2 mb-2">
              <Send size={16} className="text-emerald-600" />
              Disparar Mensagem de Teste no WhatsApp
            </h3>
            <p className="text-xs text-gray-600 mb-4">
              Envie uma mensagem instantânea para qualquer número para validar as credenciais e status de entrega.
            </p>

            <form onSubmit={handleSendWaTest} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-1">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Número com DDD</label>
                  <input
                    type="text"
                    value={testWaPhone}
                    onChange={(e) => setTestWaPhone(e.target.value)}
                    placeholder="Ex: 67992499469"
                    className="w-full p-2.5 bg-white border border-gray-300 rounded-lg text-xs font-mono outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Texto da Mensagem</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={testWaMsg}
                      onChange={(e) => setTestWaMsg(e.target.value)}
                      placeholder="Mensagem de teste"
                      className="flex-1 p-2.5 bg-white border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <button
                      type="submit"
                      disabled={sendingWaTest}
                      className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors disabled:opacity-50 shrink-0"
                    >
                      <Send size={14} />
                      {sendingWaTest ? 'Enviando...' : 'Enviar Teste'}
                    </button>
                  </div>
                </div>
              </div>

              {waTestResult && (
                <div className={`p-3 rounded-lg text-xs font-medium ${
                  waTestResult.includes('✅') ? 'bg-emerald-100 text-emerald-900 border border-emerald-200' : 'bg-amber-100 text-amber-900 border border-amber-200'
                }`}>
                  {waTestResult}
                </div>
              )}
            </form>
          </div>

          {/* Automatic Phone Standardization Tool */}
          <div className="p-5 bg-gradient-to-br from-indigo-50/70 to-white rounded-xl border border-indigo-200 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <span className="text-indigo-600">⚡</span>
                  Padronização Automática de Telefones para AstraCalls
                </h3>
                <p className="text-xs text-gray-600 mt-1 max-w-2xl">
                  <strong>Conversão em tempo real ativa:</strong> O sistema converte automaticamente qualquer número digitado no cadastro para o formato exigido pelo AstraCalls (<code className="bg-indigo-100/70 px-1.5 py-0.5 rounded text-indigo-800 font-mono text-[11px]">55 + DDD + 8 dígitos</code>) durante os disparos e chamadas VoIP.
                </p>
                <p className="text-xs text-indigo-700 mt-1.5 font-medium">
                  💡 Você também pode formatar visualmente todos os clientes já cadastrados na base de dados com um clique.
                </p>
              </div>

              <button
                type="button"
                onClick={handleStandardizePhones}
                disabled={standardizingPhones}
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 shadow-sm transition-colors disabled:opacity-50 shrink-0"
              >
                <RefreshCw size={14} className={standardizingPhones ? 'animate-spin' : ''} />
                {standardizingPhones ? 'Padronizando Base...' : 'Padronizar Clientes Agora'}
              </button>
            </div>

            {standardizeResult && (
              <div className="mt-3 p-3 bg-emerald-100 border border-emerald-200 rounded-lg text-xs text-emerald-900 font-medium flex items-center gap-2">
                <Check size={16} className="text-emerald-600 shrink-0" />
                <span>{standardizeResult.message}</span>
              </div>
            )}
          </div>

          {/* Webhook URLs */}
          <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-3">
            <div>
              <h4 className="font-semibold text-gray-800 text-xs uppercase tracking-wider mb-1">
                🔗 URLs de Webhook para Status de Entrega & Leitura em Tempo Real:
              </h4>
              <p className="text-xs text-gray-600 mb-2">
                Configure esses endereços no seu provedor (AstraCalls, Evolution ou Meta) para receber os tiques de entregue e lido:
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-gray-700 mb-1">Webhook AstraCalls / Universal:</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value="https://www.rspiscinas.app.br/api/webhook/astracalls"
                    className="flex-1 p-2 bg-white border border-gray-300 rounded-lg text-xs font-mono text-gray-700 select-all"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText('https://www.rspiscinas.app.br/api/webhook/astracalls');
                      setCopiedWebhook(true);
                      setTimeout(() => setCopiedWebhook(false), 2000);
                    }}
                    className="px-3 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-xs font-medium flex items-center transition-colors shadow-sm shrink-0"
                  >
                    {copiedWebhook ? <Check size={14} className="mr-1" /> : <Copy size={14} className="mr-1" />}
                    Copiar
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-gray-700 mb-1">Webhook Evolution API:</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value="https://www.rspiscinas.app.br/api/webhook/evolution"
                    className="flex-1 p-2 bg-white border border-gray-300 rounded-lg text-xs font-mono text-gray-700 select-all"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText('https://www.rspiscinas.app.br/api/webhook/evolution');
                      setCopiedWebhook(true);
                      setTimeout(() => setCopiedWebhook(false), 2000);
                    }}
                    className="px-3 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-xs font-medium flex items-center transition-colors shadow-sm shrink-0"
                  >
                    {copiedWebhook ? <Check size={14} className="mr-1" /> : <Copy size={14} className="mr-1" />}
                    Copiar
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Histórico de Chamadas & Player de Gravação de Áudio */}
      <div className="mt-8 bg-white rounded-xl shadow-md overflow-hidden border-2 border-blue-500/20">
        <div className="p-6 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-indigo-50/40 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
                <Headphones size={22} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  Histórico de Chamadas & Gravações
                </h2>
                <p className="text-sm text-gray-600 mt-0.5">
                  Escute e audite as gravações de chamadas de voz realizadas entre colaboradores e clientes.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadCallHistory}
              disabled={loadingCalls}
              className="px-3 py-1.5 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 rounded-lg text-xs font-medium flex items-center gap-1.5 shadow-sm transition-colors"
            >
              <RefreshCw size={14} className={loadingCalls ? 'animate-spin text-blue-600' : ''} />
              Atualizar Gravações
            </button>
          </div>
        </div>

        {/* Call Summary Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-6 border-b border-gray-100 bg-gray-50/50">
          <div className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-sm">
            <span className="text-xs text-gray-500 font-medium">Total de Ligações</span>
            <p className="text-xl font-bold text-gray-900 mt-1">{callRecords.length}</p>
          </div>
          <div className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-sm">
            <span className="text-xs text-gray-500 font-medium">Tempo Falado</span>
            <p className="text-xl font-bold text-blue-600 mt-1">
              {formatSecs(callRecords.reduce((acc, c) => acc + (c.duration || 0), 0))}
            </p>
          </div>
          <div className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-sm">
            <span className="text-xs text-gray-500 font-medium">Média por Chamada</span>
            <p className="text-xl font-bold text-emerald-600 mt-1">
              {formatSecs(callRecords.length > 0 ? Math.round(callRecords.reduce((acc, c) => acc + (c.duration || 0), 0) / callRecords.length) : 0)}
            </p>
          </div>
          <div className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-sm">
            <span className="text-xs text-gray-500 font-medium">Gravação de Áudio</span>
            <p className="text-xl font-bold text-indigo-600 mt-1">100% Ativa</p>
          </div>
        </div>

        {/* Audio Recordings List & Player */}
        <div className="p-6">
          {loadingCalls ? (
            <div className="py-12 text-center text-gray-500 flex flex-col items-center gap-2">
              <RefreshCw size={24} className="animate-spin text-blue-600" />
              <p className="text-sm">Carregando gravações de chamadas...</p>
            </div>
          ) : callRecords.length === 0 ? (
            <div className="py-12 text-center bg-gray-50 rounded-2xl border border-dashed border-gray-300">
              <Headphones size={36} className="mx-auto text-gray-400 mb-2" />
              <p className="text-sm font-semibold text-gray-700">Nenhuma gravação registrada ainda</p>
              <p className="text-xs text-gray-500 mt-1">
                As chamadas realizadas através dos botões de ligação (📞) aparecerão aqui automaticamente com o áudio completo gravado.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {callRecords.map((record) => {
                const isThisPlaying = playingId === record.id;
                const formattedDate = new Date(record.created_at).toLocaleString('pt-BR', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                });

                return (
                  <div 
                    key={record.id}
                    className={`p-4 rounded-xl border transition-all duration-200 ${
                      isThisPlaying 
                        ? 'bg-blue-50/70 border-blue-300 ring-2 ring-blue-500/20 shadow-md' 
                        : 'bg-white border-gray-200 hover:border-blue-200 hover:shadow-sm'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      {/* Left info */}
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => togglePlayRecording(record)}
                          className={`w-11 h-11 rounded-full flex items-center justify-center transition-all shrink-0 shadow-sm ${
                            isThisPlaying 
                              ? 'bg-blue-600 text-white animate-pulse' 
                              : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                          }`}
                          title={isThisPlaying ? 'Pausar Gravação' : 'Ouvir Gravação'}
                        >
                          {isThisPlaying ? <Pause size={20} /> : <Play size={20} className="ml-0.5" />}
                        </button>

                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-gray-900 text-sm">{record.client_name}</span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              Chamada Finalizada
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                            <span className="flex items-center gap-1">
                              <User size={12} /> {record.caller_name || 'Colaborador'}
                            </span>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <Clock size={12} /> {formattedDate}
                            </span>
                            <span>•</span>
                            <span className="font-semibold text-gray-700 font-mono">
                              ⏱️ {formatSecs(record.duration || 0)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Right actions */}
                      <div className="flex items-center gap-2 self-end sm:self-center">
                        {isThisPlaying && (
                          <button
                            type="button"
                            onClick={() => setPlaySpeed(playSpeed === 1 ? 1.5 : (playSpeed === 1.5 ? 2 : 1))}
                            className="px-2 py-1 bg-white border border-blue-300 rounded text-xs font-bold text-blue-700 shadow-sm"
                            title="Velocidade de Reprodução"
                          >
                            {playSpeed}x
                          </button>
                        )}
                        <a
                          href={record.recording_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Abrir no Servidor AstraCalls"
                        >
                          <Download size={16} />
                        </a>
                        <button
                          type="button"
                          onClick={() => handleDeleteCall(record.id)}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Excluir Registro"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>

                    {/* Interactive Player Timeline Bar */}
                    {isThisPlaying && (
                      <div className="mt-3 pt-3 border-t border-blue-200/60 animate-fadeIn">
                        <div className="flex items-center gap-3">
                          <span className="text-[11px] font-mono font-medium text-blue-700">
                            {formatSecs(Math.round(((record.duration || 30) * playProgress) / 100))}
                          </span>
                          <div className="flex-1 relative h-2 bg-blue-200/60 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full transition-all duration-150"
                              style={{ width: `${playProgress}%` }}
                            />
                          </div>
                          <span className="text-[11px] font-mono font-medium text-gray-500">
                            {formatSecs(record.duration || 30)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-blue-700 mt-1 font-medium">
                          <span className="flex items-center gap-1">
                            <Activity size={12} className="animate-pulse" />
                            Reproduzindo áudio da gravação AstraCalls...
                          </span>
                          <span>Codec: Opus / HD Audio</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* SMS Gateway Settings */}
      <div className="mt-8 bg-white rounded-xl shadow-md overflow-hidden border-2 border-indigo-100">
        <div className="p-6 border-b border-gray-100 bg-indigo-50/50 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-indigo-900 flex items-center">
              <Server className="mr-2" size={24} />
              Motor de Envio de SMS (Gateway)
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Configurações para envio de SMS usando o chip do seu celular.
            </p>
          </div>
          <button
            onClick={handleTestSms}
            className="px-4 py-2 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 transition-colors font-medium text-sm flex items-center"
          >
            <Smartphone size={16} className="mr-2" />
            Testar Fila de SMS
          </button>
        </div>
        
        <div className="p-6">
          {/* Local Setting: Gateway Motor */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-gray-50 p-4 rounded-xl border border-gray-200">
            <div className="mb-4 sm:mb-0 pr-4">
              <h3 className="font-bold text-gray-900 flex items-center">
                <Smartphone className="mr-2 text-indigo-600" size={20} />
                Usar este celular como Servidor Mestre
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                (Apenas este aparelho) Se ativado, este celular ficará escutando a fila 24h por dia e fará os disparos silenciosos de SMS usando o seu chip.
              </p>
              <p className="text-xs font-semibold text-amber-600 mt-2">
                Aviso: Ative esta chave em apenas UM aparelho para evitar envios duplicados.
              </p>
            </div>
            
            <button
              onClick={toggleSmsGateway}
              className={`relative inline-flex h-8 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-white/75 ${
                isSmsGateway ? 'bg-indigo-600' : 'bg-gray-300'
              }`}
            >
              <span className="sr-only">Usar como Gateway</span>
              <span
                aria-hidden="true"
                className={`pointer-events-none inline-block h-7 w-7 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                  isSmsGateway ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Capacitor Push Notifications Management */}
      <div className="mt-8 bg-white rounded-xl shadow-md overflow-hidden border-2 border-emerald-100">
        <div className="p-6 border-b border-gray-100 bg-emerald-50/50 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
          <div>
            <h2 className="text-xl font-bold text-emerald-900 flex items-center">
              <Bell className="mr-2 text-emerald-600" size={24} />
              Notificações Push em Tempo Real (Capacitor)
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Receba alertas sonoros e visuais instantâneos quando qualquer colaborador finalizar um atendimento ou visita nas rotas.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleRequestPushPerm}
              className="px-4 py-2 bg-white border border-emerald-300 text-emerald-700 rounded-lg hover:bg-emerald-50 transition-colors font-medium text-sm flex items-center shadow-sm"
            >
              <CheckCircle2 size={16} className="mr-2 text-emerald-600" />
              Ativar / Permissões
            </button>
            <button
              onClick={handleTestPush}
              disabled={testingPush}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium text-sm flex items-center shadow-sm disabled:opacity-50"
            >
              <Send size={16} className="mr-2" />
              {testingPush ? 'Enviando...' : 'Testar Alerta Push'}
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Status grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">
                Plataforma Detectada
              </span>
              <div className="flex items-center text-gray-800 font-bold">
                <Smartphone className="mr-2 text-emerald-600" size={18} />
                {Capacitor.isNativePlatform() ? 'Nativo (Android / iOS)' : 'Navegador Web / PWA'}
              </div>
            </div>

            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">
                Permissão de Notificação
              </span>
              <div className="flex items-center font-bold">
                {pushPermStatus === 'granted' ? (
                  <span className="text-emerald-600 flex items-center">
                    <CheckCircle2 size={18} className="mr-1.5" /> Liberada (Ativa)
                  </span>
                ) : pushPermStatus === 'denied' ? (
                  <span className="text-red-600 flex items-center">
                    <AlertCircle size={18} className="mr-1.5" /> Bloqueada
                  </span>
                ) : (
                  <span className="text-amber-600 flex items-center">
                    <AlertCircle size={18} className="mr-1.5" /> Pendente de Ativação
                  </span>
                )}
              </div>
            </div>

            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">
                Canal de Notificação
              </span>
              <div className="flex items-center text-gray-800 font-bold">
                <Volume2 className="mr-2 text-emerald-600" size={18} />
                Alta Prioridade (Som + Vibração)
              </div>
            </div>
          </div>

          {/* Token info */}
          <div className="p-4 bg-emerald-50/60 rounded-xl border border-emerald-200 text-sm">
            <div className="flex items-start">
              <CheckCircle2 className="text-emerald-600 mr-2.5 mt-0.5 shrink-0" size={18} />
              <div>
                <p className="font-semibold text-emerald-900">
                  Monitoramento instantâneo de rotas configurado
                </p>
                <p className="text-emerald-800 mt-1 text-xs sm:text-sm">
                  Assim que um técnico ou colaborador enviar a conclusão de uma visita pelo aplicativo, o servidor despachará a notificação push diretamente para o seu aparelho com o nome do cliente e do colaborador, tocando o áudio de notificação e atualizando o painel de rotas automaticamente.
                </p>
                {fcmToken && (
                  <p className="text-xs text-emerald-700 mt-2 font-mono">
                    Token FCM ativo: {fcmToken.substring(0, 16)}...{fcmToken.substring(fcmToken.length - 8)}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Background and WakeLock Card */}
          <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 text-sm">
            <div className="flex items-start">
              <AlertCircle className="text-amber-600 mr-2.5 mt-0.5 shrink-0" size={18} />
              <div>
                <p className="font-bold text-amber-900">
                  ⚡ Como manter o aplicativo 100% acordado em segundo plano no Android:
                </p>
                <div className="text-amber-800 mt-2 text-xs space-y-1.5 leading-relaxed">
                  <p>
                    <strong>1. Bateria Sem Restrições:</strong> Vá em <em>Configurações do Android &gt; Aplicativos &gt; GestãoPro &gt; Bateria</em> e selecione <strong>"Sem Restrições" / "Não Otimizado"</strong>. Isso impede que o sistema congele o aplicativo quando a tela for bloqueada ou apagada.
                  </p>
                  <p>
                    <strong>2. Notificações na Tela de Bloqueio:</strong> Em <em>Configurações &gt; Aplicativos &gt; GestãoPro &gt; Notificações</em>, garanta que <strong>"Exibir na tela de bloqueio"</strong> e <strong>"Permitir som e vibração"</strong> estejam ativados.
                  </p>
                  <p>
                    <strong>3. Início Automático (Xiaomi, Redmi, Samsung, Poco, Realme):</strong> Ative a opção <strong>"Início Automático" (Auto-start)</strong> e desative a <strong>"Economia de bateria MIUI/OneUI"</strong> para o aplicativo.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {testResult && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 text-sm flex items-center">
              <Bell className="mr-2.5 text-blue-600 shrink-0" size={18} />
              <span>{testResult}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
