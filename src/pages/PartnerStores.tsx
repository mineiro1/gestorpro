import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Store, Phone, Plus, Trash2, Send } from 'lucide-react';

export default function PartnerStores() {
  const { userProfile, isAdmin } = useAuth();
  const isClient = userProfile?.role === 'client';
  
  const partnerStores = (userProfile?.whatsappSettings as any)?.partnerStores || [];
  
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAddStore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || !userProfile?.uid) return;
    
    setLoading(true);
    try {
      const currentSettings = (userProfile.whatsappSettings as any) || {};
      const newStores = [...(currentSettings.partnerStores || []), { name, phone }];
      
      const { error } = await supabase
        .from('users')
        .update({
          whatsapp_settings: {
            ...currentSettings,
            partnerStores: newStores
          }
        })
        .eq('id', userProfile.uid);

      if (error) throw error;

      // Update local context
      if (userProfile) {
        if (!userProfile.whatsappSettings) userProfile.whatsappSettings = {} as any;
        (userProfile.whatsappSettings as any).partnerStores = newStores;
      }
      
      setName('');
      setPhone('');
      alert('Loja parceira adicionada com sucesso!');
    } catch (error) {
      console.error('Error saving partner store:', error);
      alert('Erro ao salvar loja parceira.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteStore = async (index: number) => {
    if (!isAdmin || !userProfile?.uid) return;
    
    if (!confirm('Deseja realmente remover esta loja parceira?')) return;

    setLoading(true);
    try {
      const currentSettings = (userProfile.whatsappSettings as any) || {};
      const currentStores = currentSettings.partnerStores || [];
      const newStores = currentStores.filter((_, i) => i !== index);
      
      const { error } = await supabase
        .from('users')
        .update({
          whatsapp_settings: {
            ...currentSettings,
            partnerStores: newStores
          }
        })
        .eq('id', userProfile.uid);

      if (error) throw error;

      // Update local context
      if (userProfile) {
        if (!userProfile.whatsappSettings) userProfile.whatsappSettings = {} as any;
        (userProfile.whatsappSettings as any).partnerStores = newStores;
      }
    } catch (error) {
      console.error('Error removing partner store:', error);
      alert('Erro ao remover loja parceira.');
    } finally {
      setLoading(false);
    }
  };

  const getWhatsAppLink = (storePhone: string) => {
    const companyName = userProfile?.whatsappSettings?.companyName || 'nossa empresa';
    const message = `Olá, a empresa ${companyName} me indicou sua loja para produtos de piscina, poderia me fazer um orçamento`;
    const cleanPhone = storePhone.replace(/\D/g, '');
    return `https://wa.me/55${cleanPhone}?text=${encodeURIComponent(message)}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-800 flex items-center">
          <Store className="mr-3 text-primary" size={32} />
          Lojas Parceiras
        </h1>
      </div>

      {isAdmin && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-xl font-semibold mb-4">Adicionar Loja Parceira</h2>
          <form onSubmit={handleAddStore} className="flex flex-col md:flex-row gap-4 items-end">
            <div className="w-full md:w-1/3">
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome da Loja</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:ring-primary focus:border-primary"
                placeholder="Ex: Piscina & Cia"
              />
            </div>
            <div className="w-full md:w-1/3">
              <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp da Loja</label>
              <input
                type="text"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:ring-primary focus:border-primary"
                placeholder="(00) 00000-0000"
              />
            </div>
            <div className="w-full md:w-auto">
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-primary text-secondary-light px-6 py-2 rounded-lg font-semibold hover:bg-primary-dark transition-colors flex items-center justify-center disabled:opacity-50"
              >
                <Plus size={20} className="mr-2" />
                Adicionar
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {partnerStores.length > 0 ? (
          <ul className="divide-y divide-gray-100">
            {partnerStores.map((store, index) => (
              <li key={index} className="p-4 md:p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:bg-gray-50 transition-colors">
                <div>
                  <h3 className="text-lg font-bold text-gray-800 flex items-center">
                    <Store size={20} className="mr-2 text-gray-500" />
                    {store.name}
                  </h3>
                  <p className="text-gray-600 flex items-center mt-1">
                    <Phone size={16} className="mr-2 text-gray-400" />
                    {store.phone}
                  </p>
                </div>
                
                <div className="flex gap-2 w-full md:w-auto">
                  {isClient && (
                    <a
                      href={getWhatsAppLink(store.phone)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 md:flex-none flex items-center justify-center bg-green-500 text-white px-4 py-2 rounded-lg font-medium hover:bg-green-600 transition-colors"
                    >
                      <Send size={18} className="mr-2" />
                      WhatsApp
                    </a>
                  )}
                  {isAdmin && (
                    <button
                      onClick={() => handleDeleteStore(index)}
                      className="flex items-center justify-center bg-red-50 text-red-600 px-4 py-2 rounded-lg font-medium hover:bg-red-100 transition-colors"
                      title="Remover"
                    >
                      <Trash2 size={18} />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="p-8 text-center text-gray-500">
            <Store size={48} className="mx-auto mb-4 opacity-20" />
            <p className="text-lg">Nenhuma loja parceira cadastrada.</p>
          </div>
        )}
      </div>
    </div>
  );
}
