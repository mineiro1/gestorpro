import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, getDocs, addDoc, deleteDoc, doc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { jsPDF } from 'jspdf';
import { Share2, FileText, Map, Camera, CheckCircle } from 'lucide-react';

const DAYS_OF_WEEK = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

export default function RoutesPage() {
  const { userProfile, isAdmin } = useAuth();
  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [selectedDay, setSelectedDay] = useState('');
  const [routeClients, setRouteClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);

  // Report Modal State
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [selectedClientForReport, setSelectedClientForReport] = useState<any>(null);
  const [reportNotes, setReportNotes] = useState('');
  const [reportPhoto, setReportPhoto] = useState<string | null>(null);
  const [submittingReport, setSubmittingReport] = useState(false);
  const [completedVisitsToday, setCompletedVisitsToday] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isAdmin && userProfile?.uid) {
      const fetchEmployees = async () => {
        try {
          const q = query(
            collection(db, 'users'),
            where('adminId', '==', userProfile.uid),
            where('role', '==', 'employee')
          );
          const snap = await getDocs(q);
          setEmployees(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        } catch (error) {
          handleFirestoreError(error, OperationType.LIST, 'users');
        }
      };
      fetchEmployees();
    } else if (userProfile?.uid) {
      setSelectedEmployee(userProfile.uid);
    }
  }, [isAdmin, userProfile]);

  const handleGenerateRoute = async () => {
    if (!selectedEmployee || !selectedDay || !userProfile) return;
    setLoading(true);
    setGenerated(false);

    try {
      const adminId = isAdmin ? userProfile.uid : userProfile.adminId;
      
      const q = query(
        collection(db, 'clients'),
        where('adminId', '==', adminId),
        where('employeeId', '==', selectedEmployee),
        where('visitDays', 'array-contains', selectedDay)
      );
      
      const snap = await getDocs(q);
      const clientsData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setRouteClients(clientsData);

      // Check which clients were already visited today
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      
      const visitsQuery = query(
        collection(db, 'visits'),
        where('adminId', '==', adminId),
        where('date', '>=', Timestamp.fromDate(todayStart))
      );
      
      const visitsSnap = await getDocs(visitsQuery);
      const completedIds = new Set<string>();
      visitsSnap.docs.forEach(doc => {
        const data = doc.data();
        if (data.employeeId === selectedEmployee || isAdmin) {
          completedIds.add(data.clientId);
        }
      });
      setCompletedVisitsToday(completedIds);

      setGenerated(true);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'clients');
    } finally {
      setLoading(false);
    }
  };

  const generatePDF = () => {
    const doc = new jsPDF();
    const employeeName = isAdmin 
      ? employees.find(e => e.id === selectedEmployee)?.name 
      : userProfile?.name;

    doc.setFontSize(18);
    doc.text('Rota do Dia', 14, 22);
    
    doc.setFontSize(12);
    doc.text(`Dia da Semana: ${selectedDay}`, 14, 32);
    doc.text(`Colaborador: ${employeeName}`, 14, 40);
    
    doc.line(14, 45, 196, 45);

    let yPos = 55;
    
    if (routeClients.length === 0) {
      doc.text('Nenhum cliente para esta rota.', 14, yPos);
    } else {
      routeClients.forEach((client, index) => {
        if (yPos > 270) {
          doc.addPage();
          yPos = 20;
        }
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text(`${index + 1}. ${client.name}`, 14, yPos);
        
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        
        // Split address if too long
        const splitAddress = doc.splitTextToSize(`Endereço: ${client.address}`, 180);
        doc.text(splitAddress, 14, yPos + 6);
        
        doc.text(`Telefone: ${client.phone || 'N/A'}`, 14, yPos + 6 + (splitAddress.length * 5));
        
        yPos += 15 + (splitAddress.length * 5);
      });
    }

    return doc;
  };

  const handleShare = async () => {
    const doc = generatePDF();
    const pdfBlob = doc.output('blob');
    const file = new File([pdfBlob], `Rota_${selectedDay}.pdf`, { type: 'application/pdf' });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          title: `Rota - ${selectedDay}`,
          text: 'Segue a rota do dia.',
          files: [file],
        });
      } catch (error) {
        console.error('Erro ao compartilhar:', error);
      }
    } else {
      // Fallback: download the file
      doc.save(`Rota_${selectedDay}.pdf`);
      alert('Seu dispositivo não suporta compartilhamento direto. O arquivo foi baixado.');
    }
  };

  const handleOpenReport = (client: any) => {
    if (completedVisitsToday.has(client.id)) return;
    setSelectedClientForReport(client);
    setReportNotes('');
    setReportPhoto(null);
    setReportModalOpen(true);
  };

  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 800;
          const MAX_HEIGHT = 800;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.6));
        };
        img.onerror = (error) => reject(error);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressedBase64 = await compressImage(file);
      setReportPhoto(compressedBase64);
    } catch (error) {
      console.error("Erro ao processar imagem:", error);
      alert("Erro ao processar a imagem. Tente novamente.");
    }
  };

  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClientForReport || !userProfile || !reportNotes.trim()) return;
    
    setSubmittingReport(true);
    try {
      const adminId = isAdmin ? userProfile.uid : userProfile.adminId;
      
      await addDoc(collection(db, 'visits'), {
        adminId,
        clientId: selectedClientForReport.id,
        employeeId: isAdmin ? null : userProfile.uid,
        date: serverTimestamp(),
        notes: reportNotes.trim(),
        photoUrl: reportPhoto
      });

      // Cleanup old visits (keep only the 3 most recent)
      try {
        const q = query(collection(db, 'visits'), where('clientId', '==', selectedClientForReport.id), where('adminId', '==', adminId));
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

      // Update local state to mark as completed
      setCompletedVisitsToday(prev => new Set(prev).add(selectedClientForReport.id));
      
      setReportModalOpen(false);
      setSelectedClientForReport(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'visits');
    } finally {
      setSubmittingReport(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Gerar Rotas</h1>

      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {isAdmin && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Selecione o Colaborador</label>
              <select
                value={selectedEmployee}
                onChange={(e) => setSelectedEmployee(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-primary focus:border-primary outline-none"
              >
                <option value="">Selecione...</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Dia da Semana</label>
            <select
              value={selectedDay}
              onChange={(e) => setSelectedDay(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-primary focus:border-primary outline-none"
            >
              <option value="">Selecione...</option>
              {DAYS_OF_WEEK.map(day => (
                <option key={day} value={day}>{day}</option>
              ))}
            </select>
          </div>
        </div>

        <button
          onClick={handleGenerateRoute}
          disabled={!selectedEmployee || !selectedDay || loading}
          className="w-full md:w-auto bg-primary text-white px-6 py-2 rounded-lg font-semibold hover:bg-primary-light transition-colors disabled:opacity-50"
        >
          {loading ? 'Gerando...' : 'Gerar Rota'}
        </button>
      </div>

      {generated && (
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-bold text-gray-800">Resultado da Rota</h2>
            <button
              onClick={handleShare}
              className="flex items-center bg-secondary-dark text-white px-4 py-2 rounded-lg hover:bg-secondary transition-colors"
            >
              <Share2 size={18} className="mr-2" />
              Compartilhar PDF
            </button>
          </div>

          {routeClients.length === 0 ? (
            <p className="text-gray-500 text-center py-8">Nenhum cliente encontrado para esta rota.</p>
          ) : (
            <div className="space-y-4">
              {routeClients.map((client, index) => {
                const isCompleted = completedVisitsToday.has(client.id);
                return (
                  <div 
                    key={client.id} 
                    onClick={() => handleOpenReport(client)}
                    className={`border rounded-lg p-4 flex items-start transition-colors ${
                      isCompleted 
                        ? 'border-green-200 bg-green-50 cursor-default' 
                        : 'border-gray-100 hover:border-primary/50 hover:bg-gray-50 cursor-pointer'
                    }`}
                  >
                    <div className={`${isCompleted ? 'bg-green-500' : 'bg-primary/10 text-primary'} font-bold w-8 h-8 rounded-full flex items-center justify-center shrink-0 mr-4`}>
                      {isCompleted ? <CheckCircle size={16} className="text-white" /> : index + 1}
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between items-start">
                        <h3 className={`font-semibold text-lg ${isCompleted ? 'text-green-800 line-through opacity-70' : 'text-gray-800'}`}>
                          {client.name}
                        </h3>
                        {isCompleted && (
                          <span className="text-xs font-bold bg-green-200 text-green-800 px-2 py-1 rounded-full">
                            Concluído
                          </span>
                        )}
                      </div>
                      <p className={`mt-1 flex items-start ${isCompleted ? 'text-green-600/70' : 'text-gray-600'}`}>
                        <Map size={16} className="mr-1 mt-1 shrink-0" />
                        {client.address}
                      </p>
                      {client.phone && (
                        <p className={`text-sm mt-1 ${isCompleted ? 'text-green-600/70' : 'text-gray-500'}`}>
                          Tel: {client.phone}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Report Modal */}
      {reportModalOpen && selectedClientForReport && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold text-gray-900 mb-1">Relatório de Atendimento</h3>
            <p className="text-gray-600 mb-6 font-medium">{selectedClientForReport.name}</p>
            
            <form onSubmit={handleSubmitReport} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Observações da Visita *</label>
                <textarea
                  required
                  rows={4}
                  value={reportNotes}
                  onChange={(e) => setReportNotes(e.target.value)}
                  placeholder="Descreva o que foi feito, problemas encontrados, etc."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-colors resize-none"
                ></textarea>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Foto (Opcional)</label>
                <div className="mt-1 flex items-center space-x-4">
                  <label className="cursor-pointer bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg flex items-center transition-colors">
                    <Camera size={18} className="mr-2" />
                    Tirar Foto / Galeria
                    <input 
                      type="file" 
                      accept="image/*" 
                      capture="environment"
                      onChange={handlePhotoUpload}
                      className="hidden" 
                    />
                  </label>
                </div>
                {reportPhoto && (
                  <div className="mt-4 relative inline-block">
                    <img src={reportPhoto} alt="Preview" className="h-32 w-auto rounded-lg border border-gray-200" />
                    <button
                      type="button"
                      onClick={() => setReportPhoto(null)}
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold hover:bg-red-600"
                    >
                      X
                    </button>
                  </div>
                )}
              </div>

              <div className="pt-4 flex justify-end space-x-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setReportModalOpen(false)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingReport || !reportNotes.trim()}
                  className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary-light transition-colors disabled:opacity-50 flex items-center"
                >
                  {submittingReport ? 'Salvando...' : 'Finalizar Atendimento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
