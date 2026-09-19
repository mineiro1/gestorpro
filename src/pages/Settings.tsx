import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Settings as SettingsIcon, Save, Image, Building, Smartphone, Server, Bell, CheckCircle2, AlertCircle, Send, Volume2 } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { requestPushPermissions, sendTestPushNotification } from '../lib/pushNotifications';

export default function Settings() {
  const { userProfile, isAdmin } = useAuth();
  const [companyName, setCompanyName] = useState('');
  const [companyLogo, setCompanyLogo] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSmsGateway, setIsSmsGateway] = useState(false);
  const [useSmsForReports, setUseSmsForReports] = useState(false);

  // Push Notification state
  const [pushPermStatus, setPushPermStatus] = useState<string>('checking');
  const [fcmToken, setFcmToken] = useState<string | null>(null);
  const [testingPush, setTestingPush] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    if (userProfile?.whatsappSettings) {
      setCompanyName((userProfile.whatsappSettings as any).companyName || '');
      setCompanyLogo((userProfile.whatsappSettings as any).companyLogo || '');
      setUseSmsForReports((userProfile.whatsappSettings as any).useSmsForReports || false);
    }
    // Load local SMS Gateway setting
    setIsSmsGateway(localStorage.getItem('isSmsGateway') === 'true');

    // Check Push status
    checkPushStatus();
  }, [userProfile]);

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
        useSmsForReports
      };
      
      const { error } = await supabase.from('users').update({
        whatsapp_settings: newSettings
      }).eq('id', userProfile.uid);
      
      if (error) throw error;

      if (userProfile) {
        if (!userProfile.whatsappSettings) userProfile.whatsappSettings = {} as any;
        (userProfile.whatsappSettings as any).companyName = companyName;
        (userProfile.whatsappSettings as any).companyLogo = companyLogo;
        (userProfile.whatsappSettings as any).useSmsForReports = useSmsForReports;
      }
      
      alert('Configurações salvas com sucesso! (As alterações no painel serão aplicadas no próximo login ou recarregamento)');
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
