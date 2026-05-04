import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, getDoc, setDoc, collection, query, where, getDocs, updateDoc, serverTimestamp } from 'firebase/firestore';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, updatePassword } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

// Secondary app for creating/updating users without logging out the current admin
const secondaryApp = initializeApp(firebaseConfig, 'Secondary');
const secondaryAuth = getAuth(secondaryApp);

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
        const clientsQuery = query(collection(db, 'clients'), where('adminId', '==', adminId));
        const clientsSnap = await getDocs(clientsQuery);
        
        const allClients = clientsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        if (id) {
          // Edit mode
          const docRef = doc(db, 'users', id);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const data = docSnap.data();
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
          const filteredClients = allClients.filter((c: any) => !c.employeeId || c.employeeId === id);
          setAvailableClients(filteredClients);
          
          const assigned = filteredClients.filter((c: any) => c.employeeId === id).map(c => c.id);
          setSelectedClients(assigned);
        } else {
          // Create mode
          // Filter clients: show only unassigned
          const filteredClients = allClients.filter((c: any) => !c.employeeId);
          setAvailableClients(filteredClients);
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, 'employee_form_data');
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
        
        const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, formData.password);
        employeeUid = userCredential.user.uid;

        // Create Firestore User
        await setDoc(doc(db, 'users', employeeUid), {
          uid: employeeUid,
          role: formData.role,
          name: formData.name,
          phone: cleanPhone,
          password: formData.password, // Store password to allow future edits
          adminId: userProfile.uid,
          createdAt: serverTimestamp(),
        });
      } else {
        // Update existing user
        // If password changed, we need to update it in Firebase Auth
        if (formData.password !== originalPassword) {
          if (!originalPassword) {
            throw new Error('Não é possível alterar a senha deste colaborador pois a senha original não foi salva no sistema. Exclua o colaborador e crie novamente.');
          }
          
          const oldEmailGestao = `${originalPhone.replace(/\D/g, '')}@gestaopro.com`;
          const oldEmailServi = `${originalPhone.replace(/\D/g, '')}@serviplay.com`;
          
          // Sign in to secondary auth to update password
          try {
            let userCredential;
            try {
              userCredential = await signInWithEmailAndPassword(secondaryAuth, oldEmailGestao, originalPassword);
            } catch (err: any) {
              if (err.code === 'auth/invalid-credential') {
                userCredential = await signInWithEmailAndPassword(secondaryAuth, oldEmailServi, originalPassword);
              } else {
                throw err;
              }
            }
            await updatePassword(userCredential.user, formData.password);
          } catch (authErr: any) {
            console.error(authErr);
            if (authErr.code === 'auth/invalid-credential') {
              throw new Error('A senha original salva no sistema não confere com a autenticação. Exclua o colaborador e crie novamente.');
            }
            throw new Error('Erro ao atualizar senha no provedor de autenticação.');
          }
        }

        await updateDoc(doc(db, 'users', id), {
          name: formData.name,
          phone: cleanPhone,
          password: formData.password,
          role: formData.role,
        });
      }

      // Update clients
      const updatePromises = availableClients.map(client => {
        const isSelected = selectedClients.includes(client.id);
        const currentEmployeeId = client.employeeId;
        
        if (isSelected && currentEmployeeId !== employeeUid) {
          return updateDoc(doc(db, 'clients', client.id), { employeeId: employeeUid });
        } else if (!isSelected && currentEmployeeId === employeeUid) {
          return updateDoc(doc(db, 'clients', client.id), { employeeId: '' });
        }
        return Promise.resolve();
      });

      await Promise.all(updatePromises);

      navigate('/employees');
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Erro ao salvar colaborador');
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
