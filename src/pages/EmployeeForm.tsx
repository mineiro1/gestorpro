import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase, secondarySupabase } from '../lib/supabase';

export default function EmployeeForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { userProfile } = useAuth();
  
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    password: '',
    role: 'employee',
  });
  const [originalPassword, setOriginalPassword] = useState('');
  const [originalPhone, setOriginalPhone] = useState('');
  const [availableClients, setAvailableClients] = useState<any[]>([]);
  const [selectedClients, setSelectedClients] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!userProfile) return;

    const fetchData = async () => {
      try {
        // Fetch clients available for this admin
        const adminId = userProfile.role === 'admin' ? userProfile.uid : userProfile.adminId;
        const { data: clientsData, error: clientsErr } = await supabase.from('clients').select('*').eq('admin_id', adminId);
        
        if (clientsErr) throw clientsErr;
        const allClients = clientsData || [];
        
        if (id) {
          // Edit mode
          const { data, error: userErr } = await supabase.from('users').select('*').eq('id', id).single();
          if (userErr) throw userErr;

          if (data) {
            setFormData({
              name: data.name || '',
              phone: data.phone || '',
              password: data.password || '', // Load password if it exists
              role: data.role === 'manager' ? 'manager' : 'employee',
            });
            setOriginalPassword(data.password || '');
            setOriginalPhone(data.phone || '');
          }

          // Filter clients: show those unassigned OR assigned to THIS employee
          const filteredClients = allClients.filter((c: any) => !c.employee_id || c.employee_id === id);
          setAvailableClients(filteredClients);
          
          const assigned = filteredClients.filter((c: any) => c.employee_id === id).map(c => c.id);
          setSelectedClients(assigned);
        } else {
          // Create mode
          // Filter clients: show only unassigned
          const filteredClients = allClients.filter((c: any) => !c.employee_id);
          setAvailableClients(filteredClients);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setFetching(false);
      }
    };

    fetchData();
  }, [id, userProfile]);

  const handleClientToggle = (clientId: string) => {
    setSelectedClients(prev => 
      prev.includes(clientId)
        ? prev.filter(id => id !== clientId)
        : [...prev, clientId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile) return;
    setLoading(true);
    setError('');

    try {
      let employeeUid = id;
      const cleanPhone = formData.phone.replace(/\D/g, '');
      
      if (cleanPhone.length < 10) throw new Error('Telefone inválido');
      if (!formData.password || formData.password.length < 6) {
        throw new Error('A senha deve ter pelo menos 6 caracteres');
      }

      if (!id) {
        // Create Auth User
        const email = `${cleanPhone}@gestaopro.com`;
        
        const targetPassword = formData.password.trim();
        let authDataToUse = null;

        const { data: authData, error: authErr } = await secondarySupabase.auth.signUp({
          email,
          password: targetPassword
        });
        
        if (authErr) {
          if (authErr.message?.includes('already registered') || authErr.message?.includes('unique constraint')) {
            // Attempt to recover orphaned user by signing in
            const { data: signInData, error: signInErr } = await secondarySupabase.auth.signInWithPassword({
              email,
              password: targetPassword
            });
            if (!signInErr && signInData?.user) {
              authDataToUse = signInData.user;
              await secondarySupabase.auth.signOut();
            } else {
              throw new Error('Este número já está cadastrado num teste anterior. Se você excluiu o colaborador pelo botão "Apagar Teste", precisa usar a MESMA SENHA que havia cadastrado originalmente para reativá-lo.');
            }
          } else if (authErr.message?.includes('Email logins are disabled')) {
            throw new Error('Por favor, ative o provedor de E-mail no painel do Supabase: Authentication -> Providers -> Email -> Enable Email provider.');
          } else if (authErr.message?.includes('rate limit')) {
            throw new Error('Limite de envios de e-mail excedido no Supabase! Vá no painel do Supabase -> Authentication -> Providers -> Email e DESATIVE o "Confirm email". O plano grátis do Supabase envia max 3 emails por hora, então a confirmação deve ficar desabilitada.');
          } else {
            throw authErr;
          }
        } else {
          if (!authData?.user) throw new Error('Não foi possível criar o usuário no sistema auth');
          authDataToUse = authData.user;
        }

        employeeUid = authDataToUse.id;

        // Note: We don't try to manually insert into users here since there is a PG trigger on insert!
        // But we DO need to update the role, name, phone, admin_id since the trigger just creates a skeleton!
        // Wait! Let's update the existing row created by the trigger if possible, or upsert.
        // The trigger created id, role=client. We should UPDATE it.
        // Wait briefly for trigger to complete, or use upsert.
        let retryCount = 0;
        let pgUpdateErr = null;
        
        while (retryCount < 3) {
          const { data: updatedData, error } = await supabase.from('users').update({
            role: formData.role,
            name: formData.name,
            phone: cleanPhone,
            password: targetPassword,
            admin_id: userProfile.role === 'admin' ? userProfile.uid : userProfile.adminId,
          }).eq('id', employeeUid).select();
          
          if (!error && updatedData && updatedData.length > 0) {
            pgUpdateErr = null;
            break;
          }
          pgUpdateErr = error || new Error('Row not found yet');
          retryCount++;
          await new Promise(r => setTimeout(r, 1000)); // wait 1s before retry
        }
        
        if(pgUpdateErr && retryCount >= 3) {
           // Fallback to insert/upsert if trigger failed
           const { error } = await supabase.from('users').upsert({
              id: employeeUid,
              role: formData.role,
              email: email,
              name: formData.name,
              phone: cleanPhone,
              password: formData.password,
              admin_id: userProfile.role === 'admin' ? userProfile.uid : userProfile.adminId,
           });
           if (error) throw error;
        }
      } else {
        const targetPassword = formData.password.trim();
        // Update existing user
        // If password changed, we need to update it in Supabase Auth
        if (targetPassword !== originalPassword) {
          if (!originalPassword) {
            throw new Error('Não é possível alterar a senha deste colaborador pois a senha original não foi salva no sistema. Exclua o colaborador e crie novamente.');
          }
          
          const oldEmailGestao = `${originalPhone.replace(/\D/g, '')}@gestaopro.com`;
          const oldEmailServi = `${originalPhone.replace(/\D/g, '')}@serviplay.com`;
          
          // Sign in to secondary auth to update password
          try {
            let authExists = true;
            let loginData = await secondarySupabase.auth.signInWithPassword({ email: oldEmailGestao, password: originalPassword });
            if (loginData.error) {
              loginData = await secondarySupabase.auth.signInWithPassword({ email: oldEmailServi, password: originalPassword });
              if (loginData.error) {
                authExists = false;
              }
            }
            
            if (authExists) {
              const { error: updateAuthErr } = await secondarySupabase.auth.updateUser({ password: targetPassword });
              if(updateAuthErr) throw updateAuthErr;
              await secondarySupabase.auth.signOut();
            } else {
              const email = `${cleanPhone}@gestaopro.com`;
              const { data: authData, error: signUpErr } = await secondarySupabase.auth.signUp({
                email,
                password: targetPassword
              });
              
              if (signUpErr) {
                 if (signUpErr.message?.includes('already registered') || signUpErr.message?.includes('unique constraint')) {
                   // Ignore error since we are just updating
                 } else {
                   throw signUpErr;
                 }
              } else if (authData?.user) {
                 await supabase.from('users').update({
                   password: targetPassword
                 }).eq('id', authData.user.id);
              }
            }
          } catch (authErr: any) {
            console.error(authErr);
            throw new Error('Erro ao atualizar senha no provedor de autenticação.');
          }
        }

        await supabase.from('users').update({
          name: formData.name,
          phone: cleanPhone,
          password: targetPassword,
          role: formData.role,
        }).eq('id', id);
      }

      // Update clients
      const updatePromises = availableClients.map(client => {
        const isSelected = selectedClients.includes(client.id);
        const currentEmployeeId = client.employee_id;
        
        if (isSelected && currentEmployeeId !== employeeUid) {
          return supabase.from('clients').update({ employee_id: employeeUid }).eq('id', client.id);
        } else if (!isSelected && currentEmployeeId === employeeUid) {
          return supabase.from('clients').update({ employee_id: null }).eq('id', client.id);
        }
        return Promise.resolve();
      });

      await Promise.all(updatePromises);

      navigate('/employees');
    } catch (err: any) {
      console.error(err);
      let errorMsg = err.message || 'Erro ao salvar colaborador';
      if (err.code === 'auth/email-already-in-use') {
        errorMsg = 'Este usuário já foi criado no sistema (telefone ou e-mail já existe).';
      } else if (err.code === 'auth/invalid-credential' || err.code === 'auth/invalid-login-credentials' || err.message?.includes('invalid-credential')) {
        errorMsg = 'A senha ou telefone não confere com o registrado no sistema.';
      } else if (err.code === 'auth/weak-password') {
        errorMsg = 'A senha deve ter pelo menos 6 caracteres.';
      }
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  if (fetching) return <div>Carregando...</div>;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">
          {id ? 'Editar Colaborador' : 'Novo Colaborador'}
        </h1>
        <button
          onClick={() => navigate('/employees')}
          className="text-gray-600 hover:text-gray-900"
        >
          Voltar
        </button>
      </div>

      {error && (
        <div className="bg-red-50 text-red-500 p-3 rounded-md mb-6 text-sm">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome Completo</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-primary focus:border-primary outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
              <input
                type="tel"
                required
                value={formData.phone}
                onChange={e => setFormData({...formData, phone: e.target.value})}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-primary focus:border-primary outline-none"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">Perfil de Acesso</label>
              <div className="flex gap-4">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="radio"
                    name="role"
                    value="employee"
                    checked={formData.role === 'employee'}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    className="form-radio text-primary"
                  />
                  <span>Colaborador Padrão</span>
                </label>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="radio"
                    name="role"
                    value="manager"
                    checked={formData.role === 'manager'}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    className="form-radio text-primary"
                  />
                  <span>Gestor (Acesso Amplo, Sem Ações Críticas)</span>
                </label>
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Senha de Acesso</label>
              <input
                type="text"
                required
                minLength={6}
                value={formData.password}
                onChange={e => setFormData({...formData, password: e.target.value})}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-primary focus:border-primary outline-none"
                placeholder="Digite a senha"
              />
              {id && (
                <p className="text-xs text-gray-500 mt-1">
                  Altere este campo para atualizar a senha do colaborador.
                </p>
              )}
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">Vincular Clientes</label>
              <div className="border border-gray-200 rounded-lg max-h-60 overflow-y-auto p-4 space-y-2">
                {availableClients.length === 0 ? (
                  <p className="text-sm text-gray-500">Nenhum cliente disponível para vínculo.</p>
                ) : (
                  availableClients.map(client => (
                    <label key={client.id} className="flex items-center space-x-3 p-2 hover:bg-gray-50 rounded-md cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedClients.includes(client.id)}
                        onChange={() => handleClientToggle(client.id)}
                        className="w-4 h-4 text-primary rounded border-gray-300 focus:ring-primary"
                      />
                      <span className="text-sm text-gray-700">{client.name} - {client.address}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="pt-4 flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="bg-primary text-white px-6 py-2 rounded-lg font-semibold hover:bg-primary-light transition-colors disabled:opacity-50"
            >
              {loading ? 'Salvando...' : 'Salvar Colaborador'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
