import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Wrench, Phone, Plus, Trash2, MessageCircle, RefreshCw } from 'lucide-react';
import { openWhatsApp, normalizePhoneNumber } from '../lib/whatsapp';

export default function PartnerTechnicians() {
  const { userProfile, isAdmin } = useAuth();
  const isClient = userProfile?.role === 'client';
  
  const [partnerTechnicians, setPartnerTechnicians] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  const fetchTechnicians = async () => {
    setFetching(true);
    try {
      let targetAdminId = userProfile?.role === 'admin' ? userProfile?.uid : userProfile?.adminId;

      if (!targetAdminId && userProfile) {
        // Se for cliente, buscar o admin_id do cliente cadastrado
        if (userProfile.clientId) {
          const { data: cData } = await supabase.from('clients').select('admin_id').eq('id', userProfile.clientId).maybeSingle();
          if (cData?.admin_id) targetAdminId = cData.admin_id;
        }
        if (!targetAdminId && userProfile.phone) {
          const cleanPhone = userProfile.phone.replace(/\D/g, '');
          const { data: clients } = await supabase.from('clients').select('admin_id, phone');
          const matched = (clients || []).find(c => (c.phone || '').replace(/\D/g, '') === cleanPhone);
          if (matched?.admin_id) targetAdminId = matched.admin_id;
        }
        if (!targetAdminId) {
          const { data: defaultAdmin } = await supabase.from('users').select('id, whatsapp_settings').eq('role', 'admin').limit(1).maybeSingle();
          if (defaultAdmin) {
            targetAdminId = defaultAdmin.id;
            setPartnerTechnicians(defaultAdmin.whatsapp_settings?.partnerTechnicians || []);
            setFetching(false);
            return;
          }
        }
      }

      if (targetAdminId) {
        const { data: adminUser } = await supabase.from('users').select('whatsapp_settings').eq('id', targetAdminId).maybeSingle();
        if (adminUser?.whatsapp_settings) {
          setPartnerTechnicians(adminUser.whatsapp_settings.partnerTechnicians || []);
        }
      } else if (userProfile?.whatsappSettings?.partnerTechnicians) {
        setPartnerTechnicians(userProfile.whatsappSettings.partnerTechnicians);
      }
    } catch (err) {
      console.error('Erro ao carregar técnicos parceiros:', err);
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    fetchTechnicians();
  }, [userProfile]);

  const handleAddTechnician = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || !userProfile?.uid) return;
    
    setLoading(true);
    try {
      const currentSettings = (userProfile.whatsappSettings as any) || {};
      const newTechnicians = [...partnerTechnicians, { name, phone }];
      
      const { error } = await supabase
        .from('users')
        .update({
          whatsapp_settings: {
            ...currentSettings,
            partnerTechnicians: newTechnicians
          }
        })
        .eq('id', userProfile.uid);

      if (error) throw error;

      setPartnerTechnicians(newTechnicians);
      if (userProfile) {
        if (!userProfile.whatsappSettings) userProfile.whatsappSettings = {} as any;
        (userProfile.whatsappSettings as any).partnerTechnicians = newTechnicians;
      }
      
      setName('');
      setPhone('');
      alert('Técnico parceiro adicionado com sucesso!');
    } catch (error: any) {
      console.error('Error saving partner technician:', error);
      alert('Erro ao salvar técnico parceiro: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTechnician = async (index: number) => {
    if (!isAdmin || !userProfile?.uid) return;
    if (!confirm('Deseja realmente remover este técnico parceiro?')) return;

    setLoading(true);
    try {
      const currentSettings = (userProfile.whatsappSettings as any) || {};
      const newTechnicians = partnerTechnicians.filter((_, i) => i !== index);
      
      const { error } = await supabase
        .from('users')
        .update({
          whatsapp_settings: {
            ...currentSettings,
            partnerTechnicians: newTechnicians
          }
        })
        .eq('id', userProfile.uid);

      if (error) throw error;

      setPartnerTechnicians(newTechnicians);
      if (userProfile) {
        if (!userProfile.whatsappSettings) userProfile.whatsappSettings = {} as any;
        (userProfile.whatsappSettings as any).partnerTechnicians = newTechnicians;
      }
    } catch (error: any) {
      console.error('Error removing partner technician:', error);
      alert('Erro ao remover técnico parceiro.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex justify-between items-center bg-slate-900/90 border border-slate-800 p-5 rounded-2xl shadow-xl">
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center">
            <Wrench size={24} />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-white">Técnicos Parceiros</h1>
            <p className="text-xs sm:text-sm text-slate-400">
              {isClient 
                ? 'Profissionais qualificados recomendados para reparos e manutenções técnicas' 
                : 'Gerencie os técnicos e eletricistas parceiros indicados aos clientes'}
            </p>
          </div>
        </div>
        <button
          onClick={fetchTechnicians}
          disabled={fetching}
          className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors disabled:opacity-50"
          title="Recarregar técnicos"
        >
          <RefreshCw size={18} className={fetching ? 'animate-spin text-amber-400' : ''} />
        </button>
      </div>

      {isAdmin && (
        <div className="bg-slate-900/90 rounded-2xl shadow-xl border border-slate-800 p-5 sm:p-6">
          <h2 className="text-base sm:text-lg font-bold text-white mb-4 flex items-center">
            <Plus size={18} className="mr-2 text-amber-400" />
            Adicionar Novo Técnico Parceiro
          </h2>
          <form onSubmit={handleAddTechnician} className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-end">
            <div className="sm:col-span-6">
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Nome do Técnico / Especialidade</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-amber-500 transition-colors placeholder:text-slate-600"
                placeholder="Ex: Fabiano Ribas (Motores e Bombas)"
              />
            </div>
            <div className="sm:col-span-4">
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">WhatsApp / Telefone com DDD</label>
              <input
                type="text"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-amber-500 transition-colors placeholder:text-slate-600"
                placeholder="Ex: (67) 99110-4814"
              />
            </div>
            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-amber-600 hover:bg-amber-500 text-white py-2.5 px-4 rounded-xl font-bold text-sm transition-all shadow-md flex items-center justify-center disabled:opacity-50 cursor-pointer active:scale-95"
              >
                <Plus size={16} className="mr-1.5" />
                Salvar
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-slate-900/90 rounded-2xl shadow-xl border border-slate-800 overflow-hidden">
        <div className="p-5 border-b border-slate-800 bg-slate-900 flex items-center justify-between">
          <h2 className="text-base sm:text-lg font-bold text-white">Técnicos Cadastrados</h2>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-800 text-amber-400 border border-slate-700">
            {partnerTechnicians.length} {partnerTechnicians.length === 1 ? 'técnico' : 'técnicos'}
          </span>
        </div>

        {fetching ? (
          <div className="p-12 text-center text-slate-400 text-sm">Carregando técnicos parceiros...</div>
        ) : partnerTechnicians.length > 0 ? (
          <div className="divide-y divide-slate-800/80">
            {partnerTechnicians.map((tech, index) => (
              <div key={index} className="p-4 sm:p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:bg-slate-800/40 transition-colors">
                <div className="flex items-center space-x-3.5">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center shrink-0">
                    <Wrench size={20} />
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-bold text-white">{tech.name}</h3>
                    <p className="text-xs text-slate-400 flex items-center mt-0.5">
                      <Phone size={13} className="mr-1.5 text-slate-500" />
                      {normalizePhoneNumber(tech.phone)}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    onClick={() => openWhatsApp(tech.phone, `Olá ${tech.name}! Sou cliente da RS Piscinas e gostaria de solicitar uma manutenção especializada na minha piscina.`)}
                    className="flex-1 sm:flex-none flex items-center justify-center bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white px-4 py-2 rounded-xl text-xs sm:text-sm font-bold shadow-md transition-all cursor-pointer gap-1.5"
                    title="Conversar no WhatsApp"
                  >
                    <MessageCircle size={16} />
                    <span>WhatsApp</span>
                  </button>
                  {isAdmin && (
                    <button
                      onClick={() => handleDeleteTechnician(index)}
                      className="p-2 rounded-xl bg-red-950/60 hover:bg-red-900/80 text-red-400 border border-red-800/40 transition-colors cursor-pointer"
                      title="Remover técnico"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-12 text-center text-slate-400">
            <Wrench size={44} className="mx-auto mb-3 opacity-30 text-slate-500" />
            <p className="text-sm font-medium">Nenhum técnico parceiro cadastrado no momento.</p>
          </div>
        )}
      </div>
    </div>
  );
}
