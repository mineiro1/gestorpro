import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { jsPDF } from 'jspdf';
import { Share2, FileText, Map, Camera, CheckCircle, MapPin } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const DAYS_OF_WEEK = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

export default function RoutesPage() {
  const { userProfile, isAdmin, isManager } = useAuth();
  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [selectedDay, setSelectedDay] = useState('');
  const getLocalISODate = () => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().split('T')[0];
  };

  const [routeDate, setRouteDate] = useState(getLocalISODate());
  const [routeClients, setRouteClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);

  // Anticipation state
  const [selectedForAnticipation, setSelectedForAnticipation] = useState<Set<string>>(new Set());
  const [anticipating, setAnticipating] = useState(false);

  // Report Modal State
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [selectedClientForReport, setSelectedClientForReport] = useState<any>(null);
  const [reportNotes, setReportNotes] = useState('');
  const [reportPhoto, setReportPhoto] = useState<string | null>(null);
  const [submittingReport, setSubmittingReport] = useState(false);
  const [completedVisitsOnRouteDate, setCompletedVisitsOnRouteDate] = useState<Set<string>>(new Set());
  
  // Specific for One-Off Jobs (Avulsos)
  const [needsReturn, setNeedsReturn] = useState(false);
  const [returnDate, setReturnDate] = useState('');

  useEffect(() => {
    if (routeDate) {
      const dateStr = routeDate + 'T12:00:00';
      const dayIndex = new Date(dateStr).getDay();
      if (dayIndex >= 1 && dayIndex <= 6) {
        setSelectedDay(DAYS_OF_WEEK[dayIndex - 1]);
      } else {
        setSelectedDay(''); // Domingo
      }
    }
  }, [routeDate]);

  useEffect(() => {
    if ((isAdmin || isManager) && userProfile?.uid) {
      const fetchEmployees = async () => {
        try {
          const adminId = isAdmin ? userProfile.uid : userProfile.adminId;
          const q = query(
            collection(db, 'users'),
            where('adminId', '==', adminId),
            where('role', 'in', ['employee', 'manager'])
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
  }, [isAdmin, isManager, userProfile]);

  const handleGenerateRoute = async () => {
    if (!selectedEmployee || (!selectedDay && !routeDate) || !userProfile) return;
    setLoading(true);
    setGenerated(false);

    try {
      const adminId = isAdmin ? userProfile.uid : userProfile.adminId;
      
      const q = query(
        collection(db, 'clients'),
        where('adminId', '==', adminId),
        where('employeeId', '==', selectedEmployee)
      );
      
      const snap = await getDocs(q);
      const allEmployeeClients = snap.docs.map(doc => ({ id: doc.id, ...doc.data(), isOneOffJob: false }));
      
      const clientsData = allEmployeeClients.filter((client: any) => {
        const matchesDayOfWeek = selectedDay ? (client.visitDays && client.visitDays.includes(selectedDay)) : false;
        const matchesExtraVisit = routeDate ? (client.extraVisits && client.extraVisits.includes(routeDate)) : false;
        return matchesDayOfWeek || matchesExtraVisit;
      });
      
      // Fetch OneOffJobs
      const jobsQ = query(
        collection(db, 'oneoffjobs'),
        where('adminId', '==', adminId),
        where('employeeId', '==', selectedEmployee)
      );
      const jobsSnap = await getDocs(jobsQ);
      const allJobs = jobsSnap.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data(), 
        isOneOffJob: true,
        name: doc.data().clientName,
        phone: doc.data().clientPhone
      })) as any[];
      
      const filteredJobs = allJobs.filter((job: any) => {
        return job.date === routeDate || job.returnDate === routeDate;
      });

      setRouteClients([...clientsData, ...filteredJobs]);

      // Check which clients were already visited ON THE ROUTE DATE
      const routeDateStart = new Date(routeDate + 'T00:00:00');
      const routeDateEnd = new Date(routeDate + 'T23:59:59.999');
      
      const visitsQuery = query(
        collection(db, 'visits'),
        where('adminId', '==', adminId),
        where('date', '>=', Timestamp.fromDate(routeDateStart))
      );
      
      const visitsSnap = await getDocs(visitsQuery);
      const completedIds = new Set<string>();
      visitsSnap.docs.forEach(doc => {
        const data = doc.data();
        const visitDate = data.date?.toDate();
        // Since we query >= routeDateStart, filter out visits after routeDateEnd
        if (visitDate && visitDate <= routeDateEnd) {
          // If any visit exists for this client today (even by admin), mark as completed
          completedIds.add(data.clientId);
        }
      });
      
      // Add one-off jobs that are completed or already handled for this route date
      filteredJobs.forEach(job => {
        const updatedAtDate = job.updatedAt?.toDate();
        const updatedToday = updatedAtDate && updatedAtDate >= routeDateStart && updatedAtDate <= routeDateEnd;
        if (job.status === 'completed' || (job.status === 'needs_return' && updatedToday)) {
            // Alternatively, if it's 'needs_return' but today is the original date, it was already handled today.
            // If today is the returnDate, and it's 'needs_return', it is still pending for today unless updated today.
            if ((job.date === routeDate && job.status !== 'pending') || (job.returnDate === routeDate && job.status === 'completed') || updatedToday) {
                completedIds.add(job.id);
            }
        }
      });

      setCompletedVisitsOnRouteDate(completedIds);

      setGenerated(true);
      setSelectedForAnticipation(new Set());
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'clients');
    } finally {
      setLoading(false);
    }
  };

  const handleAnticipate = async () => {
    if (selectedForAnticipation.size === 0) return;
    if (!confirm('Deseja antecipar as visitas dos clientes selecionados para hoje? Eles passarão a aparecer na rota de hoje.')) return;
    
    setAnticipating(true);
    const today = getLocalISODate();
    try {
      for (const clientId of selectedForAnticipation) {
        const client = routeClients.find(c => c.id === clientId);
        if (!client) continue;

        if (client.isOneOffJob) {
          // It's a one-off job. We change its primary date or returnDate to today.
          // If returnDate was what placed it here, change returnDate. Else change date.
          const updates: any = { updatedAt: serverTimestamp() };
          if (client.returnDate === routeDate) {
            updates.returnDate = today;
          } else {
            updates.date = today;
          }
          await updateDoc(doc(db, 'oneoffjobs', client.id), updates);
        } else {
          // Regular client, add today to extraVisits if not present
          const extraVisits = client.extraVisits || [];
          if (!extraVisits.includes(today)) {
            await updateDoc(doc(db, 'clients', client.id), {
              extraVisits: [...extraVisits, today]
            });
          }
        }
      }
      alert('Visitas antecipadas com sucesso!');
      setSelectedForAnticipation(new Set());
    } catch (error) {
      console.error(error);
      alert('Erro ao tentar antecipar visitas.');
    } finally {
      setAnticipating(false);
    }
  };

  const generatePDF = () => {
    const doc = new jsPDF();
    const employeeName = (isAdmin || isManager)
      ? employees.find(e => e.id === selectedEmployee)?.name 
      : userProfile?.name;

    doc.setFontSize(18);
    doc.text('Rota do Dia', 14, 22);
    
    doc.setFontSize(12);
    doc.text(`Data da Rota: ${routeDate.split('-').reverse().join('/')}`, 14, 32);
    doc.text(`Dia da Semana: ${selectedDay}`, 14, 40);
    doc.text(`Colaborador: ${employeeName}`, 14, 48);
    
    doc.line(14, 53, 196, 53);

    let yPos = 63;
    
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

  const handleOpenGoogleMaps = () => {
    if (routeClients.length === 0) return;
    
    const addresses = routeClients
      .map(c => c.address)
      .filter(addr => addr && addr.trim() !== '')
      .map(addr => encodeURIComponent(addr));
      
    if (addresses.length === 0) {
      alert("Nenhum de seus clientes nesta rota possui endereço preenchido.");
      return;
    }
    
    const url = `https://www.google.com/maps/dir/${addresses.join('/')}`;
    window.open(url, '_blank');
  };

  const handleOpenWaze = () => {
    if (routeClients.length === 0) return;
    
    const addresses = routeClients
      .map(c => c.address)
      .filter(addr => addr && addr.trim() !== '');
      
    if (addresses.length === 0) {
      alert("Nenhum de seus clientes nesta rota possui endereço preenchido.");
      return;
    }
    
    // Waze via URL only really supports one destination reliably. 
    // We'll send them to the first uncompleted one or just the first one.
    const url = `https://waze.com/ul?q=${encodeURIComponent(addresses[0])}&navigate=yes`;
    window.open(url, '_blank');
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
    if (completedVisitsOnRouteDate.has(client.id)) return;
    setSelectedClientForReport(client);
    setReportNotes('');
    setReportPhoto(null);
    setNeedsReturn(false);
    setReturnDate('');
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
    
    let locationData = null;
    try {
      if (navigator.geolocation) {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
        });
        locationData = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      }
    } catch(err) {
      console.warn("Não foi possível obter a localização", err);
    }

    try {
      const adminId = isAdmin ? userProfile.uid : userProfile.adminId;
      
      if (selectedClientForReport.isOneOffJob) {
        // Avulso Update
        await updateDoc(doc(db, 'oneoffjobs', selectedClientForReport.id), {
          status: needsReturn ? 'needs_return' : 'completed',
          returnDate: needsReturn ? returnDate : null,
          report: reportNotes.trim(),
          updatedAt: serverTimestamp()
        });
        // One-off jobs do not store visit locations for the client history yet, they are just jobs.
        // Or if we want them, we could add visit logic. I'll stick to what was there.
      } else {
        // Normal Client Visit
        await addDoc(collection(db, 'visits'), {
          adminId,
          clientId: selectedClientForReport.id,
          employeeId: (isAdmin || isManager) && selectedEmployee ? selectedEmployee : userProfile.uid,
          date: serverTimestamp(),
          notes: reportNotes.trim(),
          photoUrl: reportPhoto,
          location: locationData
        });

        // Update client with lastVisitDate
        await updateDoc(doc(db, 'clients', selectedClientForReport.id), {
          lastVisitDate: serverTimestamp()
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
      }

      // Update local state to mark as completed
      setCompletedVisitsOnRouteDate(prev => new Set(prev).add(selectedClientForReport.id));
      
      setReportModalOpen(false);
      setSelectedClientForReport(null);
    } catch (error) {
      if (selectedClientForReport.isOneOffJob) {
        handleFirestoreError(error, OperationType.UPDATE, 'oneoffjobs');
      } else {
        handleFirestoreError(error, OperationType.CREATE, 'visits');
      }
    } finally {
      setSubmittingReport(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Gerar Rotas</h1>

      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {(isAdmin || isManager) && (
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Data da Rota</label>
            <input
              type="date"
              value={routeDate}
              onChange={(e) => setRouteDate(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-primary focus:border-primary outline-none"
            />
          </div>

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
          disabled={!selectedEmployee || (!selectedDay && !routeDate) || loading}
          className="w-full md:w-auto bg-primary text-white px-6 py-2 rounded-lg font-semibold hover:bg-primary-light transition-colors disabled:opacity-50"
        >
          {loading ? 'Gerando...' : 'Gerar Rota'}
        </button>
      </div>

      {generated && (
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 space-y-4 md:space-y-0">
            <h2 className="text-lg font-bold text-gray-800">Resultado da Rota</h2>
            <div className="flex flex-wrap gap-2">
              {(isAdmin || isManager) && routeDate > getLocalISODate() && routeClients.length > 0 && (
                <button
                  onClick={handleAnticipate}
                  disabled={selectedForAnticipation.size === 0 || anticipating}
                  className="flex items-center bg-orange-500 text-white px-4 py-2 rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50"
                  title="Antecipar clientes selecionados para hoje"
                >
                  {anticipating ? 'Processando...' : `Antecipar ${selectedForAnticipation.size > 0 ? `(${selectedForAnticipation.size})` : ''} para Hoje`}
                </button>
              )}
              <button
                onClick={handleOpenGoogleMaps}
                className="flex items-center bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                title="Google Maps"
              >
                <Map size={18} className="md:mr-2" />
                <span className="hidden md:inline">Google Maps</span>
              </button>
              <button
                onClick={handleOpenWaze}
                className="flex items-center bg-sky-500 text-white px-4 py-2 rounded-lg hover:bg-sky-600 transition-colors"
                title="Waze"
              >
                <Map size={18} className="md:mr-2" />
                <span className="hidden md:inline">Waze</span>
              </button>
              <button
                onClick={handleShare}
                className="flex items-center bg-secondary-dark text-white px-4 py-2 rounded-lg hover:bg-secondary transition-colors"
              >
                <Share2 size={18} className="mr-2" />
                Compartilhar PDF
              </button>
            </div>
          </div>

          {routeClients.length === 0 ? (
            <p className="text-gray-500 text-center py-8">Nenhum cliente encontrado para esta rota.</p>
          ) : (
            <div className="space-y-4">
              {routeClients.map((client, index) => {
                const isCompleted = completedVisitsOnRouteDate.has(client.id);
                const isFutureRoute = routeDate > getLocalISODate();
                const isSelectedForAnticipation = selectedForAnticipation.has(client.id);
                
                return (
                  <motion.div 
                    key={client.id} 
                    onClick={() => {
                      if (isFutureRoute && !isCompleted && !isAdmin && !isManager) {
                        alert('A data da rota ainda não chegou. Não é possível preencher a visita antecipadamente.');
                        return;
                      }
                      handleOpenReport(client);
                    }}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ 
                      opacity: 1, 
                      y: 0,
                      scale: isCompleted ? [0.98, 1.02, 1] : 1,
                    }}
                    transition={{ duration: 0.3 }}
                    className={`border rounded-lg p-4 flex items-start transition-colors relative ${
                      isCompleted 
                        ? 'border-green-200 bg-green-50 cursor-default' 
                        : isFutureRoute && !isAdmin && !isManager
                          ? 'border-gray-200 bg-gray-50 opacity-80 cursor-not-allowed'
                          : isSelectedForAnticipation
                            ? 'border-orange-300 bg-orange-50'
                            : 'border-gray-100 hover:border-primary/50 hover:bg-gray-50 cursor-pointer'
                    }`}
                  >
                    {(isAdmin || isManager) && isFutureRoute && !isCompleted && (
                      <div className="flex items-center justify-center mr-3 mt-1" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelectedForAnticipation}
                          onChange={(e) => {
                            const newSet = new Set(selectedForAnticipation);
                            if (e.target.checked) newSet.add(client.id);
                            else newSet.delete(client.id);
                            setSelectedForAnticipation(newSet);
                          }}
                          className="w-5 h-5 rounded text-orange-500 focus:ring-orange-500 border-gray-300 cursor-pointer"
                        />
                      </div>
                    )}
                    <motion.div 
                      layout
                      className={`${isCompleted ? 'bg-green-500' : 'bg-primary/10 text-primary'} font-bold w-8 h-8 rounded-full flex items-center justify-center shrink-0 mr-4 text-white`}
                    >
                      <AnimatePresence mode="wait">
                        {isCompleted ? (
                          <motion.div
                            key="checkmark"
                            initial={{ scale: 0, rotate: -180 }}
                            animate={{ scale: 1, rotate: 0 }}
                            transition={{ type: "spring", stiffness: 200, damping: 10 }}
                          >
                            <CheckCircle size={16} className="text-white" />
                          </motion.div>
                        ) : (
                          <motion.span
                            key="number"
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            exit={{ scale: 0 }}
                            className="text-primary"
                          >
                            {index + 1}
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </motion.div>
                    <div className="flex-1">
                      <div className="flex justify-between items-start">
                        <div className="flex items-center space-x-2">
                          <h3 className={`font-semibold text-lg ${isCompleted ? 'text-green-800 line-through opacity-70' : 'text-gray-800'}`}>
                            {client.name}
                          </h3>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(client.address)}`, '_blank');
                            }}
                            className="p-1 text-blue-600 hover:bg-blue-100 rounded-md transition-colors"
                            title="Abrir no Google Maps"
                          >
                            <MapPin size={20} />
                          </button>
                        </div>
                        {isCompleted && (
                          <motion.span 
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="text-xs font-bold bg-green-200 text-green-800 px-2 py-1 rounded-full"
                          >
                            Concluído
                          </motion.span>
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
                      
                      {isCompleted ? (
                        <div className="mt-3 inline-flex items-center text-sm font-semibold text-green-600 bg-green-100 px-3 py-1 rounded-full">
                          <CheckCircle size={16} className="mr-1" />
                          Visita Concluída
                        </div>
                      ) : isFutureRoute ? (
                        <div className="mt-3 text-sm text-gray-500 flex items-center font-medium bg-gray-100 px-3 py-1 rounded-full inline-flex">
                          Disponível em {routeDate.split('-').reverse().join('/')}
                        </div>
                      ) : (
                        <div className="mt-3 text-sm text-gray-500 flex items-center">
                          <Camera size={16} className="mr-1" />
                          Clique para registrar visita
                        </div>
                      )}
                    </div>
                  </motion.div>
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

              {selectedClientForReport?.isOneOffJob && (
                <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg space-y-3">
                  <label className="flex items-center space-x-2 text-orange-900 font-medium">
                    <input 
                      type="checkbox" 
                      checked={needsReturn} 
                      onChange={(e) => setNeedsReturn(e.target.checked)} 
                      className="rounded text-orange-600 focus:ring-orange-500 w-4 h-4 cursor-pointer"
                    />
                    <span>Agendar Retorno</span>
                  </label>
                  {needsReturn && (
                    <div>
                      <label className="block text-sm font-medium text-orange-800 mb-1">Data do Retorno</label>
                      <input 
                        type="date" 
                        required={needsReturn}
                        value={returnDate} 
                        onChange={(e) => setReturnDate(e.target.value)} 
                        className="w-full px-4 py-2 border border-orange-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none"
                      />
                    </div>
                  )}
                </div>
              )}

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
