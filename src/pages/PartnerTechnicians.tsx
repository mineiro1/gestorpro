import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Wrench, Phone, Plus, Trash2, Send } from 'lucide-react';

export default function PartnerTechnicians() {
  const { userProfile, isAdmin } = useAuth();
  const isClient = userProfile?.role === 'client';
  
  const partnerTechnicians = userProfile?.whatsappSettings?.partnerTechnicians || [];
  
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAddTechnician = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || !userProfile?.uid) return;
    
    setLoading(true);
    try {
      const currentSettings = userProfile.whatsappSettings || {};
      const newTechnicians = [...(currentSettings.partnerTechnicians || []), { name, phone }];
      
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

      if (userProfile.whatsappSettings) {
        userProfile.whatsappSettings.partnerTechnicians = newTechnicians;
      }
      
      setName('');
      setPhone('');
      alert('Técnico parceiro adicionado com sucesso!');
    } catch (error) {
      console.error('Error saving partner technician:', error);
      alert('Erro ao salvar técnico parceiro.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTechnician = async (index: number) => {
    if (!isAdmin || !userProfile?.uid) return;
    
    if (!confirm('Deseja realmente remover este técnico parceiro?')) return;

    setLoading(true);
    try {
      const currentSettings = userProfile.whatsappSettings || {};
      const currentTechnicians = currentSettings.partnerTechnicians || [];
      const newTechnicians = currentTechnicians.filter((_, i) => i !== index);
      
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

      if (userProfile.whatsappSettings) {
        userProfile.whatsappSettings.partnerTechnicians = newTechnicians;
      }
    } catch (error) {
      console.error('Error removing partner technician:', error);
      alert('Erro ao remover técnico parceiro.');
    } finally {
      setLoading(false);
    }
  };

    const getWhatsAppLink = (techPhone: string) => {
    const companyName = userProfile?.whatsappSettings?.companyName || 'nossa empresa';
    const message = `Olá, a empresa ${companyName} me indicou seus serviços, gostaria de um orçamento.`;
    const cleanPhone = techPhone.replace(/\D/g, '');
    return `https://wa.me/55${cleanPhone}?text=${encodeURIComponent(message)}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-800 flex items-center">
          <Wrench className="mr-3 text-primary" size={32} />
          Técnicos Parceiros
        </h1>
      </div>

      {isAdmin && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-xl font-semibold mb-4">Adicionar Técnico Parceiro</h2>
          <form onSubmit={handleAddTechnician} className="flex flex-col md:flex-row gap-4 items-end">
            <div className="w-full md:w-1/3">
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome do Técnico</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:ring-primary focus:border-primary"
                placeholder="Ex: João Silva"
              />
            </div>
            <div className="w-full md:w-1/3">
              <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp do Técnico</label>
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
        {partnerTechnicians.length > 0 ? (
          <ul className="divide-y divide-gray-100">
            {partnerTechnicians.map((tech, index) => (
              <li key={index} className="p-4 md:p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:bg-gray-50 transition-colors">
                <div>
                  <h3 className="text-lg font-bold text-gray-800 flex items-center">
                    <Wrench size={20} className="mr-2 text-gray-500" />
                    {tech.name}
                  </h3>
                  <p className="text-gray-600 flex items-center mt-1">
                    <Phone size={16} className="mr-2 text-gray-400" />
                    {tech.phone}
                  </p>
                </div>
                
                <div className="flex gap-2 w-full md:w-auto">
                  {isClient && (
                    <a
                      href={getWhatsAppLink(tech.phone)}
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
                      onClick={() => handleDeleteTechnician(index)}
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
            <Wrench size={48} className="mx-auto mb-4 opacity-20" />
            <p className="text-lg">Nenhum técnico parceiro cadastrado.</p>
          </div>
        )}
      </div>
    </div>
  );
}
