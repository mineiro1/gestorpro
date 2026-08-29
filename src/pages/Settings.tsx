import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Settings as SettingsIcon, Save, Image, Building } from 'lucide-react';

export default function Settings() {
  const { userProfile, isAdmin } = useAuth();
  const [companyName, setCompanyName] = useState('');
  const [companyLogo, setCompanyLogo] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (userProfile?.whatsappSettings) {
      setCompanyName(userProfile.whatsappSettings.companyName || '');
      setCompanyLogo(userProfile.whatsappSettings.companyLogo || '');
    }
  }, [userProfile]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || !userProfile?.uid) return;
    
    setLoading(true);
    try {
      const currentSettings = userProfile.whatsappSettings || {};
      const newSettings = {
        ...currentSettings,
        companyName,
        companyLogo
      };
      
      const { error } = await supabase.from('users').update({
        whatsapp_settings: newSettings
      }).eq('id', userProfile.uid);
      
      if (error) throw error;

      if (userProfile) {
        if (!userProfile.whatsappSettings) userProfile.whatsappSettings = {};
        userProfile.whatsappSettings.companyName = companyName;
        userProfile.whatsappSettings.companyLogo = companyLogo;
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
    </div>
  );
}
