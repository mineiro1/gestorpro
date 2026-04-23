import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, collection, serverTimestamp, query, where, onSnapshot } from 'firebase/firestore';
import { History, Plus, X, Download } from 'lucide-react';

const DAYS_OF_WEEK = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

export default function ClientForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { userProfile, isAdmin } = useAuth();
  
  const [formData, setFormData] = useState({
    name: '',
    cpfCnpj: '',
    phone: '',
    address: '',
    monthlyFee: '',
    dueDate: '',
    visitDays: [] as string[],
  });
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(!!id);
  const [error, setError] = useState('');

  // Visit History State
  const [visits, setVisits] = useState<any[]>([]);
  const [newVisitNotes, setNewVisitNotes] = useState('');
  const [addingVisit, setAddingVisit] = useState(false);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      const fetchClient = async () => {
        try {
          const docRef = doc(db, 'clients', id);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const data = docSnap.data();
            setFormData({
              name: data.name || '',
              cpfCnpj: data.cpfCnpj || '',
              phone: data.phone || '',
              address: data.address || '',
              monthlyFee: data.monthlyFee?.toString() || '',
              dueDate: data.dueDate?.toString() || '',
              visitDays: data.visitDays || [],
            });
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, `clients/${id}`);
        } finally {
          setFetching(false);
        }
      };
      fetchClient();

      if (userProfile) {
        const adminId = isAdmin ? userProfile.uid : userProfile.adminId;
        const visitsQuery = query(
          collection(db, 'visits'),
          where('clientId', '==', id),
          where('adminId', '==', adminId)
        );
        
        const unsubscribeVisits = onSnapshot(visitsQuery, (snapshot) => {
          const visitsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          visitsData.sort((a: any, b: any) => {
            const dateA = a.date?.toMillis() || 0;
            const dateB = b.date?.toMillis() || 0;
            return dateB - dateA;
          });
          setVisits(visitsData);
        }, (err) => {
          console.error("Erro ao buscar histórico de visitas:", err);
        });

        return () => unsubscribeVisits();
      }
    }
  }, [id, userProfile, isAdmin]);

  const handleDayToggle = (day: string) => {
    setFormData(prev => ({
      ...prev,
      visitDays: prev.visitDays.includes(day)
        ? prev.visitDays.filter(d => d !== day)
        : [...prev.visitDays, day]
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile) return;
    setLoading(true);

    const clientData = {
      name: formData.name,
      cpfCnpj: formData.cpfCnpj,
      phone: formData.phone,
      address: formData.address,
      monthlyFee: parseFloat(formData.monthlyFee) || 0,
      dueDate: formData.dueDate, // Now a string YYYY-MM-DD
      baseDueDay: parseInt(formData.dueDate.split('-')[2], 10) || 1, // Extract day
      visitDays: formData.visitDays,
    };

    try {
      if (id) {
        await updateDoc(doc(db, 'clients', id), clientData);
      } else {
        await addDoc(collection(db, 'clients'), {
          ...clientData,
          adminId: userProfile.uid,
          employeeId: '',
          createdAt: serverTimestamp(),
        });
        // Clear form if adding new
        setFormData({
          name: '',
          cpfCnpj: '',
          phone: '',
          address: '',
          monthlyFee: '',
          dueDate: '',
          visitDays: [],
        });
      }
      navigate('/clients');
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Erro ao salvar cliente');
      handleFirestoreError(err, id ? OperationType.UPDATE : OperationType.CREATE, id ? `clients/${id}` : 'clients');
    } finally {
      setLoading(false);
    }
  };

  const handleAddVisit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !userProfile || !newVisitNotes.trim()) return;
    setAddingVisit(true);
    try {
      const adminId = isAdmin ? userProfile.uid : userProfile.adminId;
      await addDoc(collection(db, 'visits'), {
        adminId,
        clientId: id,
        employeeId: isAdmin ? null : userProfile.uid,
        date: serverTimestamp(),
        notes: newVisitNotes.trim()
      });
      setNewVisitNotes('');

      // Cleanup old visits (keep only the 3 most recent)
      try {
        const q = query(collection(db, 'visits'), where('clientId', '==', id), where('adminId', '==', adminId));
        const snap = await getDocs(q);
        const visitsData = snap.docs.map(d => ({ id: d.id, date: d.data().date?.toMillis() || 0 }));
        visitsData.sort((a, b) => b.date - a.date);
        
        if (visitsData.length > 3) {
          const toDelete = visitsData.slice(3);
          for (const v of toDelete) {
            await deleteDoc(doc(db, 'visits', v.id));
          }
        }
      } catch (cleanupErr) {
        console.error("Erro ao limpar visitas antigas:", cleanupErr);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'visits');
    } finally {
      setAddingVisit(false);
    }
  };

  if (fetching) return <div>Carregando...</div>;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">
          {id ? 'Editar Cliente' : 'Novo Cliente'}
        </h1>
        <button
          onClick={() => navigate('/clients')}
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
            <div className="md:col-span-2">
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
              <label className="block text-sm font-medium text-gray-700 mb-1">CPF/CNPJ</label>
              <input
                type="text"
                value={formData.cpfCnpj}
                onChange={e => setFormData({...formData, cpfCnpj: e.target.value})}
                placeholder="Opcional"
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

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Valor da Mensalidade (R$)</label>
              <input
                type="number"
                step="0.01"
                required
                value={formData.monthlyFee}
                onChange={e => setFormData({...formData, monthlyFee: e.target.value})}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-primary focus:border-primary outline-none"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Endereço Completo</label>
              <input
                type="text"
                required
                value={formData.address}
                onChange={e => setFormData({...formData, address: e.target.value})}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-primary focus:border-primary outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Data de Vencimento</label>
              <input
                type="date"
                required
                value={formData.dueDate}
                onChange={e => setFormData({...formData, dueDate: e.target.value})}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-primary focus:border-primary outline-none"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">Dias de Visita</label>
              <div className="flex flex-wrap gap-2">
                {DAYS_OF_WEEK.map(day => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => handleDayToggle(day)}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                      formData.visitDays.includes(day)
                        ? 'bg-primary text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {day}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="pt-4 flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="bg-primary text-white px-6 py-2 rounded-lg font-semibold hover:bg-primary-light transition-colors disabled:opacity-50"
            >
              {loading ? 'Salvando...' : 'Finalizar Cadastro'}
            </button>
          </div>
        </form>
      </div>

      {id && (
        <div className="mt-8 bg-white rounded-xl shadow-sm overflow-hidden border border-gray-100">
          <div className="bg-gray-50 px-6 py-4 border-b border-gray-100 flex items-center">
            <History size={20} className="text-gray-500 mr-2" />
            <div>
              <h2 className="text-lg font-bold text-gray-800">Histórico de Visitas</h2>
              <p className="text-sm text-gray-500">Registre e visualize as visitas realizadas a este cliente.</p>
            </div>
          </div>
          
          <div className="p-6">
            <form onSubmit={handleAddVisit} className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">Nova Visita / Observação</label>
              <div className="flex gap-3">
                <input
                  type="text"
                  required
                  value={newVisitNotes}
                  onChange={(e) => setNewVisitNotes(e.target.value)}
                  placeholder="Ex: Cliente não estava em casa, roteador trocado..."
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-colors"
                />
                <button
                  type="submit"
                  disabled={addingVisit || !newVisitNotes.trim()}
                  className="bg-secondary-dark text-white px-4 py-2 rounded-lg font-semibold hover:bg-secondary transition-colors disabled:opacity-50 flex items-center shrink-0"
                >
                  <Plus size={18} className="mr-1" />
                  {addingVisit ? 'Adicionando...' : 'Adicionar'}
                </button>
              </div>
            </form>

            {visits.length === 0 ? (
              <div className="text-gray-500 py-4 bg-gray-50 rounded-lg text-center border border-dashed border-gray-200">
                Nenhuma visita registrada para este cliente.
              </div>
            ) : (
              <div className="space-y-4">
                {visits.map(visit => (
                  <div key={visit.id} className="border border-gray-100 rounded-lg p-4 bg-gray-50">
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-sm font-semibold text-gray-600">
                        {visit.date ? new Date(visit.date.toMillis()).toLocaleDateString('pt-BR', {
                          day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
                        }) : 'Data não disponível'}
                      </span>
                    </div>
                    <p className="text-gray-800 whitespace-pre-wrap">{visit.notes}</p>
                    {visit.photoUrl && (
                      <div className="mt-3">
                        <img 
                          src={visit.photoUrl} 
                          alt="Foto da visita" 
                          onClick={() => setFullscreenImage(visit.photoUrl)}
                          className="max-w-full h-auto max-h-64 rounded-lg border border-gray-200 cursor-pointer hover:opacity-90 transition-opacity" 
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Fullscreen Image Modal */}
      {fullscreenImage && (
        <div className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center p-4">
          <button 
            onClick={() => setFullscreenImage(null)}
            className="absolute top-4 right-4 text-white hover:text-gray-300 p-2"
          >
            <X size={32} />
          </button>
          <img 
            src={fullscreenImage} 
            alt="Foto em tela cheia" 
            className="max-w-full max-h-[85vh] object-contain"
          />
          <a 
            href={fullscreenImage} 
            download={`visita_${id}_${new Date().getTime()}.jpg`}
            className="absolute bottom-8 bg-primary text-white px-6 py-3 rounded-full font-semibold hover:bg-primary-light transition-colors flex items-center"
          >
            <Download size={20} className="mr-2" />
            Baixar Foto
          </a>
        </div>
      )}
    </div>
  );
}
