import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { jsPDF } from 'jspdf';
import { Share2, FileText, Map, Camera, CheckCircle, MapPin, Image as ImageIcon, ArrowUp, ArrowDown, Save, ListOrdered, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { openMap, openRouteMap, openWaze } from '../lib/maps';
import { openWhatsApp, sendEvolutionMessage, sendMetaMessage } from '../lib/whatsapp';
import EmployeeMap from '../components/EmployeeMap';
import exifr from 'exifr';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const DAYS_OF_WEEK = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

export default function RoutesPage() {
  const { userProfile, isAdmin, isManager } = useAuth();
  
  const queryClient = useQueryClient();

  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [selectedDay, setSelectedDay] = useState('');
  const getLocalISODate = () => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().split('T')[0];
  };

  const [routeDate, setRouteDate] = useState(getLocalISODate());

  const [generated, setGenerated] = useState(false);

  const [highlightedClientId, setHighlightedClientId] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');

  // Anticipation state
  const [selectedForAnticipation, setSelectedForAnticipation] = useState<Set<string>>(new Set());
  const [anticipating, setAnticipating] = useState(false);

  // Report Modal State
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [selectedClientForReport, setSelectedClientForReport] = useState<any>(null);
  const [reportNotes, setReportNotes] = useState('');
  const [reportPhotos, setReportPhotos] = useState<string[]>([]);
  const [photoDate, setPhotoDate] = useState<Date | null>(null);
  const [submittingReport, setSubmittingReport] = useState(false);
  const [confirmSendReportPopupOpen, setConfirmSendReportPopupOpen] = useState(false);
  const [parameters, setParameters] = useState({ cloro: '', ph: '', alcalinidade: '', acidoCianurico: '' });
  const [products, setProducts] = useState({ cloroGranulado: false, algicida: false, clarificante: false, barrilha: false, sulfatoAluminio: false, elevadorAlcalinidade: false, sulfatoCobre: false, redutorPh: false, peroxidoHidrogenio: false, hipoclorito: false, cloroPastilha: false });
  const [checklist, setChecklist] = useState({
    peneirar: false,
    escovar: false,
    aspirar: false,
    lavarFiltro: false,
    lavarCapa: false,
    limparBordas: false,
    decantar: false,
    motorLigado: false,
    ausente: false
  });

  
  // Specific for One-Off Jobs (Avulsos)
  const [needsReturn, setNeedsReturn] = useState(false);
  const [returnDate, setReturnDate] = useState('');

  // Ordering mode state
  const [isOrderingMode, setIsOrderingMode] = useState(false);
  const [orderedClients, setOrderedClients] = useState<any[]>([]);
  const [savingOrder, setSavingOrder] = useState(false);
  const [routeOrderChanged, setRouteOrderChanged] = useState(false);

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

  const syncOfflineVisits = async () => {
    if (!navigator.onLine) return;
    
    const offlineVisitsStr = localStorage.getItem('offlineVisits');
    if (!offlineVisitsStr) return;
    
    let offlineVisits: any[] = [];
    try {
      offlineVisits = JSON.parse(offlineVisitsStr);
    } catch (e) {
      localStorage.removeItem('offlineVisits');
      return;
    }
    
    if (offlineVisits.length === 0) return;
    
    let remainingVisits = [...offlineVisits];
    let syncedCount = 0;
    
    for (const payload of offlineVisits) {
      try {
        if (payload.isOneOffJob) {
          const { error } = await supabase.from('oneoffjobs').update({
            status: payload.needsReturn ? 'em_andamento' : 'concluido',
            return_date: payload.needsReturn ? payload.returnDate : null,
            report: payload.notes,
            updated_at: payload.date
          }).eq('id', payload.clientId);
          if (error) throw error;
        } else {
          const { error: insertError } = await supabase.from('visits').insert({
            admin_id: payload.adminId,
            client_id: payload.clientId,
            employee_id: payload.employeeId,
            date: payload.date,
            time: payload.time,
            notes: payload.notes,
            photo_urls: payload.photoUrls,
            location: payload.location
          });
          if (insertError) throw insertError;
          
          await supabase.from('clients').update({
            last_visit_date: payload.date
          }).eq('id', payload.clientId);
        }
        
        remainingVisits = remainingVisits.filter((v: any) => v !== payload);
        syncedCount++;
      } catch (err) {
        console.error("Failed to sync visit", err);
      }
    }
    
    if (syncedCount > 0) {
      alert(`${syncedCount} visita(s) offline sincronizada(s) com sucesso!`);
    }
    
    if (remainingVisits.length === 0) {
      localStorage.removeItem('offlineVisits');
    } else {
      localStorage.setItem('offlineVisits', JSON.stringify(remainingVisits));
    }
  };

  useEffect(() => {
    syncOfflineVisits();
    const handleOnline = () => syncOfflineVisits();
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  useEffect(() => {
    if ((isAdmin || isManager) && userProfile?.uid) {
      const fetchEmployees = async () => {
        try {
          const adminId = isAdmin ? userProfile.uid : userProfile.adminId;
          const { data, error } = await supabase.from('users')
            .select('*')
            .eq('admin_id', adminId)
            .in('role', ['employee', 'manager']);
          if (error) throw error;
          if (data) setEmployees(data);
        } catch (error) {
          console.error(error);
        }
      };
      fetchEmployees();
    } else if (userProfile?.uid) {
      setSelectedEmployee(userProfile.uid);
    }
  }, [isAdmin, isManager, userProfile]);

  
  const { data: queryData, isLoading, refetch } = useQuery({
    queryKey: ['routeData', routeDate, selectedEmployee, selectedDay, userProfile?.uid, generated],
    enabled: generated && !!userProfile && !!routeDate && !!selectedEmployee,
    refetchInterval: 15000, // Substitui o autoRefresh manual
    queryFn: async () => {
      const adminId = isAdmin ? userProfile.uid : userProfile.adminId;
      
      const { data: clientsDataAPI, error: cErr } = await supabase.from('clients')
        .select('*')
        .eq('admin_id', adminId)
        .eq('employee_id', selectedEmployee);
        
      if (cErr) throw cErr;
      const allEmployeeClients = (clientsDataAPI || []).map(doc => ({ ...doc, isOneOffJob: false }));
      
      const clientsData = allEmployeeClients.filter((client: any) => {
        if (client.active === false) return false;
        let visitDays = [];
        try { visitDays = Array.isArray(client.visit_days) ? client.visit_days : (client.visit_days ? JSON.parse(client.visit_days) : []); } catch(e) {}
        let extraVisits = [];
        try { extraVisits = Array.isArray(client.extra_visits) ? client.extra_visits : (client.extra_visits ? JSON.parse(client.extra_visits) : []); } catch(e) {}
        
        const extraVisitsDates = extraVisits.map(v => typeof v === 'string' ? v.split(':from:')[0] : v);
        
        const matchesDayOfWeek = selectedDay ? (visitDays.includes(selectedDay)) : false;
        const matchesExtraVisit = routeDate ? (extraVisitsDates.includes(routeDate)) : false;
        return matchesDayOfWeek || matchesExtraVisit;
      });
      
      // Fetch OneOffJobs
      const { data: jobsSnap, error: jErr } = await supabase.from('oneoffjobs')
        .select('*')
        .eq('admin_id', adminId)
        .eq('employee_id', selectedEmployee);
      if (jErr) throw jErr;
      
      const allJobs = (jobsSnap || []).map(doc => ({ 
        ...doc, 
        isOneOffJob: true,
        name: doc.client_name,
        phone: doc.client_phone
      })) as any[];
      
      const [y, m, d] = routeDate.split('-').map(Number); const currentDayOfWeek = new Date(y, m - 1, d).getDay().toString();
      const routeOrderName = 'system_route_order_' + currentDayOfWeek;
      const orderJob = jobsSnap?.find(job => job.client_name === routeOrderName);
      let savedOrder = [];
      if (orderJob && orderJob.description) {
        try { savedOrder = JSON.parse(orderJob.description); } catch(e) {}
      }

      const filteredJobs = allJobs.filter((job: any) => {
        if (job.client_name?.startsWith('system_route_order')) return false;
        const matchesDate = job.date === routeDate || (job.date && job.date.startsWith(routeDate));
        const matchesReturnDate = job.return_date === routeDate || (job.return_date && job.return_date.startsWith(routeDate));
        return (matchesDate || matchesReturnDate) && job.status !== 'cancelado';
      });

      const mergedClients = [...clientsData, ...filteredJobs];
      
      if (savedOrder.length > 0) {
        mergedClients.sort((a, b) => {
          const indexA = savedOrder.indexOf(a.id);
          const indexB = savedOrder.indexOf(b.id);
          if (indexA !== -1 && indexB !== -1) return indexA - indexB;
          if (indexA !== -1) return -1;
          if (indexB !== -1) return 1;
          return 0;
        });
      }

      // Check which clients were already visited ON THE ROUTE DATE
      const activeRouteDate = routeDate || getLocalISODate();

      const [year, month, day] = activeRouteDate.split('-').map(Number);
      const start = new Date(year, month - 1, day, 0, 0, 0);
      const end = new Date(year, month - 1, day, 23, 59, 59, 999);
      const routeDateStartStr = start.toISOString();
      const routeDateEndStr = end.toISOString();
      
      const { data: visitsByTime } = await supabase.from('visits')
        .select('client_id')
        .eq('admin_id', adminId)
        .eq('time', activeRouteDate);
        
      const { data: visitsByDate } = await supabase.from('visits')
        .select('client_id')
        .eq('admin_id', adminId)
        .gte('date', routeDateStartStr)
        .lte('date', routeDateEndStr);
        
      const { data: visitsByCreated } = await supabase.from('visits')
        .select('client_id')
        .eq('admin_id', adminId)
        .gte('created_at', routeDateStartStr)
        .lte('created_at', routeDateEndStr);
        
      const visitsSnap = [...(visitsByTime || []), ...(visitsByDate || []), ...(visitsByCreated || [])];
        
      const completedIds = new Set();
      if (visitsSnap) {
        visitsSnap.forEach(data => {
            completedIds.add(data.client_id);
        });
      }
      
      filteredJobs.forEach(job => {
        const updatedAtDate = job.updated_at ? new Date(job.updated_at) : null;
        const routeDateStart = new Date(routeDateStartStr);
        const routeDateEnd = new Date(routeDateEndStr);
        const updatedToday = updatedAtDate && updatedAtDate >= routeDateStart && updatedAtDate <= routeDateEnd;
        if (job.status === 'concluido' || (job.status === 'em_andamento' && updatedToday)) {
            if ((job.date && job.date.startsWith(activeRouteDate) && job.status !== 'pendente') || (job.return_date && job.return_date.startsWith(activeRouteDate) && job.status === 'concluido') || updatedToday) {
                completedIds.add(job.id);
            }
        }
      });
      
      return { clients: mergedClients, completed: completedIds };
    }
  });

  const routeClients = queryData?.clients || [];
  const completedVisitsOnRouteDate = queryData?.completed || new Set();

  useEffect(() => {
    if (!generated || !userProfile || !routeDate) return;
    const adminId = isAdmin ? userProfile.uid : userProfile.adminId;
    let jobFilter = `admin_id=eq.${adminId}`;
    if (!isAdmin && !isManager) jobFilter += `&employee_id=eq.${userProfile.uid}`;

    const channel1 = supabase.channel('routes-visits')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'visits', filter: `admin_id=eq.${adminId}` }, () => refetch())
      .subscribe();

    const channel2 = supabase.channel('routes-jobs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'oneoffjobs', filter: jobFilter }, (payload) => {
        refetch();
        if (payload.new && (payload.new as any).client_name && (payload.new as any).client_name.startsWith('system_route_order_')) {
          if (!isAdmin) setRouteOrderChanged(true);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel1);
      supabase.removeChannel(channel2);
    };
  }, [generated, routeDate, userProfile, isAdmin]);


  

  
  const handleGenerateRoute = () => {
    if (!selectedEmployee || (!selectedDay && !routeDate) || !userProfile) return;
    setGenerated(true);
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
          const updates: any = { updated_at: new Date().toISOString() };
          if (client.return_date === routeDate) {
            updates.return_date = today;
          } else {
            updates.date = today;
          }
          await supabase.from('oneoffjobs').update(updates).eq('id', client.id);
        } else {
          const extraVisits = client.extra_visits || [];
          const newEntry = today + ':from:' + (routeDate || today);
          if (!extraVisits.includes(newEntry) && !extraVisits.includes(today)) {
            await supabase.from('clients').update({
              extra_visits: [...extraVisits, newEntry]
            }).eq('id', client.id);
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
  const handlePostpone = async () => {
    if (selectedForAnticipation.size === 0) return;
    if (!confirm('Deseja adiar as visitas dos clientes selecionados para amanhã? Eles passarão a aparecer na rota de amanhã.')) return;
    
    setAnticipating(true);
    const tomorrowDate = new Date();
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    
    // Convert to ISO local
    tomorrowDate.setMinutes(tomorrowDate.getMinutes() - tomorrowDate.getTimezoneOffset());
    const tomorrowStr = tomorrowDate.toISOString().split('T')[0];
    
    try {
      for (const clientId of selectedForAnticipation) {
        const client = routeClients.find(c => c.id === clientId);
        if (!client) continue;

        if (client.isOneOffJob) {
          const updates: any = { updated_at: new Date().toISOString() };
          if (client.return_date === routeDate) {
            updates.return_date = tomorrowStr;
          } else {
            updates.date = tomorrowStr;
          }
          await supabase.from('oneoffjobs').update(updates).eq('id', client.id);
        } else {
          const extraVisits = client.extra_visits || [];
          const newEntry = tomorrowStr + ':from:' + (routeDate || getLocalISODate());
          if (!extraVisits.includes(newEntry) && !extraVisits.includes(tomorrowStr)) {
            await supabase.from('clients').update({
              extra_visits: [...extraVisits, newEntry]
            }).eq('id', client.id);
          }
        }
      }
      alert('Visitas adiadas com sucesso!');
      setSelectedForAnticipation(new Set());
    } catch (error) {
      console.error(error);
      alert('Erro ao tentar adiar visitas.');
    } finally {
      setAnticipating(false);
    }
  };


  const saveOrder = async () => {
    setSavingOrder(true);
    try {
      const orderArray = orderedClients.map(c => c.id);
      const adminId = isAdmin ? userProfile?.uid : userProfile?.adminId;
      const [y, m, d] = routeDate.split('-').map(Number); const currentDayOfWeek = new Date(y, m - 1, d).getDay().toString();
      const routeOrderName = 'system_route_order_' + currentDayOfWeek;
      
      const { data: jobsSnap } = await supabase.from('oneoffjobs')
        .select('*')
        .eq('admin_id', adminId)
        .eq('employee_id', selectedEmployee)
        .eq('client_name', routeOrderName);
        
      const orderJob = jobsSnap && jobsSnap.length > 0 ? jobsSnap[0] : null;
      
      if (orderJob) {
        const { error } = await supabase.from('oneoffjobs').update({ description: JSON.stringify(orderArray) }).eq('id', orderJob.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('oneoffjobs').insert({
           admin_id: adminId,
           employee_id: selectedEmployee,
           title: routeOrderName,
           client_name: routeOrderName,
           client_phone: '00000000000',
           description: JSON.stringify(orderArray),
           price: 0,
           date: routeDate,
           status: 'cancelado'
        });
        if (error) throw error;
      }
      queryClient.setQueryData(['routeData', routeDate, selectedEmployee, selectedDay, userProfile?.uid, generated], (old: any) => {
        if (!old) return old;
        return { ...old, clients: orderedClients };
      });
      setIsOrderingMode(false);
      alert('Ordem da rota salva com sucesso!');
    } catch(e) {
       console.error(e);
       alert('Erro ao salvar ordem.');
    } finally {
       setSavingOrder(false);
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
      .filter(addr => addr && addr.trim() !== '');
      
    if (addresses.length === 0) {
      alert("Nenhum de seus clientes nesta rota possui endereço preenchido.");
      return;
    }
    
    openRouteMap(addresses);
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
    openWaze(addresses[0]);
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
    setReportPhotos([]);
    setPhotoDate(null);
    setNeedsReturn(false);
    setReturnDate('');
    setChecklist({ peneirar: false, escovar: false, aspirar: false, lavarFiltro: false, lavarCapa: false, limparBordas: false, decantar: false, motorLigado: false, ausente: false });
    setParameters({ cloro: '', ph: '', alcalinidade: '', acidoCianurico: '' });
    setProducts({ cloroGranulado: false, algicida: false, clarificante: false, barrilha: false, sulfatoAluminio: false, elevadorAlcalinidade: false, sulfatoCobre: false, redutorPh: false, peroxidoHidrogenio: false, hipoclorito: false, cloroPastilha: false });
    setReportModalOpen(true);
  };

  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 1200;
          const MAX_HEIGHT = 1200;
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
        
        img.onerror = (error) => {
          console.error("Erro ao carregar a imagem", error);
          reject(error);
        };
        
        img.src = event.target?.result as string;
      };
      
      reader.onerror = (error) => {
        console.error("Erro ao ler o arquivo", error);
        reject(error);
      };
    });
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      if (!photoDate) {
        try {
          const exifData = await exifr.parse(file);
          if (exifData && exifData.DateTimeOriginal) {
            setPhotoDate(new Date(exifData.DateTimeOriginal));
          } else if (file.lastModified) {
            setPhotoDate(new Date(file.lastModified));
          }
        } catch (exifError) {
          console.warn("Exif error:", exifError);
          if (file.lastModified) {
             setPhotoDate(new Date(file.lastModified));
          }
        }
      }
      
      const compressedBase64 = await compressImage(file);
      setReportPhotos(prev => [...prev, compressedBase64]);
    } catch (error) {
      console.error("Erro ao processar imagem:", error);
      alert("Erro ao processar a imagem. Tente novamente.");
    }
    // reset the input
    e.target.value = '';
  };

  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClientForReport || !userProfile || !reportNotes.trim()) return;
    setConfirmSendReportPopupOpen(true);
  };

  const processReportSubmission = async (sendWhatsApp: boolean) => {
    if (sendWhatsApp) {
      if (selectedClientForReport?.phone) {
        const clientName = selectedClientForReport.name;
        const clientPhone = selectedClientForReport.phone;
        const cleanPhone = clientPhone.replace(/\D/g, '');
        
        try {
          const adminId = isAdmin ? userProfile.uid : userProfile.adminId;
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
          
          let useMessage2 = false;
          if (navigator.onLine) {
            const { data: recentVisits } = await supabase.from('visits')
              .select('date')
              .eq('client_id', selectedClientForReport.id)
              .eq('admin_id', adminId)
              .gte('date', thirtyDaysAgo.toISOString())
              .limit(1);
            if (recentVisits && recentVisits.length > 0) {
              useMessage2 = true;
            }
          }
          
          const waSettings = userProfile?.whatsappSettings || {};
          const msg1 = waSettings.reportMessage1 || `Olá {nome},\n\nO atendimento da sua piscina foi finalizado! Você pode acessar o nosso painel para acompanhar todas as informações do tratamento.\n\nAcesse: https://www.zapmass.app.br/client-panel\nLogin: {telefone}\nSenha: {telefone}`;
          const msg2 = waSettings.reportMessage2 || `Olá {nome},\n\nO atendimento da sua piscina foi finalizado! Verifique as informações completas no nosso painel de clientes.\n\nAcesse: https://www.zapmass.app.br/client-panel`;
          
          let message = useMessage2 ? msg2 : msg1;
          message = message.replace(/{nome}/g, clientName).replace(/{telefone}/g, cleanPhone);
          
          if (waSettings.useMetaApi) {
            await sendMetaMessage(clientPhone, message, waSettings);
            alert('Mensagem enviada com sucesso (Meta API)');
          } else if (waSettings.useEvolutionApi) {
            await sendEvolutionMessage(clientPhone, message, waSettings);
            alert('Mensagem enviada com sucesso (Evolution API)');
          } else {
            openWhatsApp(clientPhone, message);
          }
        } catch (err: any) {
          alert('Erro ao enviar mensagem: ' + err.message);
          console.error(err);
        }
      } else {
        alert('Este cliente não possui um número de telefone cadastrado para o envio do WhatsApp.');
      }
    }

    setConfirmSendReportPopupOpen(false);
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
      const finalVisitDate = photoDate ? photoDate.toISOString() : new Date().toISOString();
      const activeRouteDate = routeDate || getLocalISODate();
      
      
      const checkedItems = [];
      if (checklist.peneirar) checkedItems.push('A piscina foi peneirada');
      if (checklist.escovar) checkedItems.push('As paredes da piscina foram escovadas');
      if (checklist.aspirar) checkedItems.push('A piscina foi aspirada');
      if (checklist.lavarFiltro) checkedItems.push('O filtro da piscina foi limpo');
      if (checklist.lavarCapa) checkedItems.push('A capa da piscina foi lavada');
      if (checklist.limparBordas) checkedItems.push('As bordas da piscina foram limpas');
      if (checklist.decantar) checkedItems.push('A piscina foi decantada');
      if (checklist.motorLigado) checkedItems.push('O motor ficou ligado filtrando');
      if (checklist.ausente) checkedItems.push('Cliente ausente, não foi possivel executar o serviço.');
      
      const checklistText = checkedItems.length > 0 ? `\n\nTarefas realizadas:\n- ${checkedItems.join('\n- ')}` : '';
      
      const paramItems = [];
      if (parameters.cloro) paramItems.push(`Cloro: ${parameters.cloro}`);
      if (parameters.ph) paramItems.push(`pH: ${parameters.ph}`);
      if (parameters.alcalinidade) paramItems.push(`Alcalinidade: ${parameters.alcalinidade}`);
      if (parameters.acidoCianurico) paramItems.push(`Ácido Cianúrico: ${parameters.acidoCianurico}`);
      const paramText = paramItems.length > 0 ? `\n\nParâmetros da Água:\n- ${paramItems.join('\n- ')}` : '';
      
      const prodItems = [];
      if (products.cloroGranulado) prodItems.push('Cloro Granulado');
      if (products.algicida) prodItems.push('Algicida');
      if (products.clarificante) prodItems.push('Clarificante');
      if (products.barrilha) prodItems.push('Barrilha');
      if (products.sulfatoAluminio) prodItems.push('Sulfato de alumínio');
      if (products.elevadorAlcalinidade) prodItems.push('Elevador de Alcalinidade');
      if (products.sulfatoCobre) prodItems.push('Sulfato de cobre');
      if (products.redutorPh) prodItems.push('Redutor de pH');
      if (products.peroxidoHidrogenio) prodItems.push('Peróxido de Hidrogênio');
      if (products.hipoclorito) prodItems.push('Hipoclorito');
      if (products.cloroPastilha) prodItems.push('Cloro Pastilha');
      const prodText = prodItems.length > 0 ? `\n\nProdutos Utilizados:\n- ${prodItems.join('\n- ')}` : '';

      const finalNotes = reportNotes.trim() + checklistText + paramText + prodText;
      
      const payload = {
        adminId,
        clientId: selectedClientForReport.id,
        employeeId: (isAdmin || isManager) && selectedEmployee ? selectedEmployee : userProfile.uid,
        date: finalVisitDate,
        time: activeRouteDate,
        notes: finalNotes,
        photoUrls: reportPhotos,
        location: locationData,
        isOneOffJob: selectedClientForReport.isOneOffJob,
        needsReturn,
        returnDate
      };
      
      const handleSaveOffline = () => {
         const offlineVisits = JSON.parse(localStorage.getItem('offlineVisits') || '[]');
         offlineVisits.push(payload);
         localStorage.setItem('offlineVisits', JSON.stringify(offlineVisits));
         alert("Você está offline ou ocorreu um erro de conexão. A visita foi salva localmente e será sincronizada automaticamente.");
      };

      if (!navigator.onLine) {
         handleSaveOffline();
      } else {
        try {
          if (selectedClientForReport.isOneOffJob) {
            // Avulso Update
            const { error: oneOffError } = await supabase.from('oneoffjobs').update({
              status: needsReturn ? 'em_andamento' : 'concluido',
              return_date: needsReturn ? returnDate : null,
              report: finalNotes,
              updated_at: finalVisitDate
            }).eq('id', selectedClientForReport.id);
            if (oneOffError) throw oneOffError;
          } else {
            // Normal Client Visit
            const { error: insertError } = await supabase.from('visits').insert({
              admin_id: adminId,
              client_id: selectedClientForReport.id,
              employee_id: payload.employeeId,
              date: finalVisitDate,
              time: activeRouteDate,
              notes: finalNotes,
              photo_urls: reportPhotos,
              location: locationData
            });
            
            if (insertError) throw insertError;
            
            // Check if this visit was rescheduled from another date
            try {
              const extraVisitsRaw = selectedClientForReport.extra_visits || [];
              const targetStr = activeRouteDate + ':from:';
              const rescheduleEntry = extraVisitsRaw.find((v: string) => typeof v === 'string' && v.startsWith(targetStr));
              if (rescheduleEntry) {
                 const originalDate = rescheduleEntry.split(':from:')[1];
                 if (originalDate) {
                   await supabase.from('visits').insert({
                     admin_id: adminId,
                     client_id: selectedClientForReport.id,
                     employee_id: payload.employeeId,
                     date: finalVisitDate,
                     time: originalDate, // Setting time to originalDate makes it show up as completed for that original route
                     notes: `[SERVIÇO REALIZADO NO DIA ${activeRouteDate.split('-').reverse().join('/')}]\n\n` + finalNotes,
                     photo_urls: reportPhotos,
                     location: locationData
                   });
                   
                   // Clean up the extra_visit entry
                   const newExtraVisits = extraVisitsRaw.filter((v: string) => v !== rescheduleEntry);
                   await supabase.from('clients').update({ extra_visits: newExtraVisits }).eq('id', selectedClientForReport.id);
                 }
              }
            } catch(e) {
               console.error("Error saving ghost visit", e);
            }

            // Update client with lastVisitDate
            await supabase.from('clients').update({
              last_visit_date: finalVisitDate
            }).eq('id', selectedClientForReport.id);

            // Cleanup old visits (keep only the 3 most recent)
            try {
              const { data: visitsData } = await supabase.from('visits')
                .select('id, date')
                .eq('client_id', selectedClientForReport.id)
                .eq('admin_id', adminId)
                .order('date', { ascending: false });
              
              if (visitsData && visitsData.length > 3) {
                const toDelete = visitsData.slice(3).map(v => v.id);
                for (const id of toDelete) {
                   await supabase.from('visits').delete().eq('id', id);
                }
              }
            } catch (cleanupErr) {
              console.error("Erro ao limpar visitas antigas:", cleanupErr);
            }
          }
        } catch (dbError) {
          console.error("Database error, saving offline:", dbError);
          handleSaveOffline();
        }
      }

      // Update local state to mark as completed
      
      queryClient.setQueryData(['routeData', routeDate, selectedEmployee, selectedDay, userProfile?.uid, generated], (old: any) => {
        if (!old) return old;
        const nextSet = new Set(old.completed);
        nextSet.add(selectedClientForReport.id);
        return { ...old, completed: nextSet };
      });
      queryClient.invalidateQueries({ queryKey: ['routeData'] });

      
      setReportModalOpen(false);
      setSelectedClientForReport(null);
    } catch (error) {
       console.error("Error submitting report", error);
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
          disabled={!selectedEmployee || (!selectedDay && !routeDate) || isLoading}
          className="w-full md:w-auto bg-primary text-white px-6 py-2 rounded-lg font-semibold hover:bg-primary-light transition-colors disabled:opacity-50"
        >
          {isLoading ? 'Gerando...' : 'Gerar Rota'}
        </button>
      </div>

      {routeOrderChanged && (
        <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-6 rounded-r-xl shadow-sm flex items-center justify-between">
          <div>
            <h3 className="font-bold text-blue-800">Ordem atualizada!</h3>
            <p className="text-blue-700 text-sm">O administrador alterou a ordem da sua rota. Clique no botão ao lado para atualizar.</p>
          </div>
          <button 
            onClick={() => {
              setRouteOrderChanged(false);
              handleGenerateRoute();
            }}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-semibold transition-colors whitespace-nowrap"
          >
            Atualizar Rota
          </button>
        </div>
      )}

      {generated && (
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 space-y-4 md:space-y-0">
            <div>
              <h2 className="text-lg font-bold text-gray-800">Resultado da Rota</h2>
              {routeClients.length > 0 && (
                <p className="text-sm text-gray-600 mt-1">
                  Total: <span className="font-semibold">{routeClients.length}</span> |
                  Concluídos: <span className="font-semibold text-green-600">{routeClients.filter(c => completedVisitsOnRouteDate.has(c.id)).length}</span> |
                  Faltam: <span className="font-semibold text-red-600">{routeClients.length - routeClients.filter(c => completedVisitsOnRouteDate.has(c.id)).length}</span>
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {(isAdmin || isManager) && routeClients.length > 0 && !isOrderingMode && (
                <button
                  onClick={() => { setIsOrderingMode(true); setOrderedClients([...routeClients]); }}
                  className="flex items-center bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700 transition-colors"
                  title="Organizar ordem manualmente"
                >
                  <ListOrdered size={18} className="md:mr-2" />
                  <span className="hidden md:inline">Organizar Rota</span>
                </button>
              )}
              {(isAdmin || isManager) && routeDate > getLocalISODate() && routeClients.length > 0 && !isOrderingMode && (
                <button
                  onClick={handleAnticipate}
                  disabled={selectedForAnticipation.size === 0 || anticipating}
                  className="flex items-center bg-orange-500 text-white px-4 py-2 rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50 text-sm whitespace-nowrap"
                  title="Antecipar clientes selecionados para hoje"
                >
                  {anticipating ? 'Processando...' : `Antecipar ${selectedForAnticipation.size > 0 ? `(${selectedForAnticipation.size})` : ''}`}
                </button>
              )}
              {(isAdmin || isManager) && routeDate === getLocalISODate() && routeClients.length > 0 && !isOrderingMode && (
                <button
                  onClick={handlePostpone}
                  disabled={selectedForAnticipation.size === 0 || anticipating}
                  className="flex items-center bg-purple-500 text-white px-4 py-2 rounded-lg hover:bg-purple-600 transition-colors disabled:opacity-50 text-sm whitespace-nowrap"
                  title="Adiar clientes selecionados para amanhã"
                >
                  {anticipating ? 'Processando...' : `Adiar ${selectedForAnticipation.size > 0 ? `(${selectedForAnticipation.size})` : ''} p/ Amanhã`}
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

          {!isOrderingMode && routeClients.length > 0 && (
            <div className="mb-6 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
              <input
                type="text"
                placeholder="Buscar cliente por nome ou endereço..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-primary focus:border-primary outline-none shadow-sm"
              />
            </div>
          )}

          {routeClients.length === 0 ? (
            <p className="text-gray-500 text-center py-8">Nenhum cliente encontrado para esta rota.</p>
          ) : isOrderingMode ? (
            <div className="space-y-4">
              <div className="flex justify-between items-center mb-4 bg-teal-50 p-4 rounded-lg border border-teal-200">
                <h3 className="font-bold text-teal-800">Modo de Organização</h3>
                <div className="flex space-x-2">
                  <button onClick={() => setIsOrderingMode(false)} className="px-4 py-2 text-teal-700 bg-white border border-teal-300 rounded hover:bg-teal-100">
                    Cancelar
                  </button>
                  <button onClick={saveOrder} disabled={savingOrder} className="px-4 py-2 bg-teal-600 text-white rounded hover:bg-teal-700 flex items-center">
                    <Save size={16} className="mr-2" />
                    {savingOrder ? 'Salvando...' : 'Salvar Ordem'}
                  </button>
                </div>
              </div>
              {orderedClients.map((client, index) => (
                <div 
                  key={client.id} 
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', index.toString());
                    e.currentTarget.style.opacity = '0.5';
                  }}
                  onDragEnd={(e) => {
                    e.currentTarget.style.opacity = '1';
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const sourceIndex = parseInt(e.dataTransfer.getData('text/plain'));
                    const targetIndex = index;
                    if (sourceIndex === targetIndex || isNaN(sourceIndex)) return;
                    
                    const newArr = [...orderedClients];
                    const [removed] = newArr.splice(sourceIndex, 1);
                    newArr.splice(targetIndex, 0, removed);
                    setOrderedClients(newArr);
                  }}
                  className="border rounded-lg p-3 bg-white flex items-center justify-between border-gray-200 cursor-grab active:cursor-grabbing shadow-sm"
                >
                  <div className="flex items-center">
                    <div className="bg-teal-100 text-teal-800 font-bold w-8 h-8 rounded-full flex items-center justify-center mr-4 flex-shrink-0">
                      {index + 1}
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-800">{client.name}</h3>
                      <p className="text-sm text-gray-500">{client.address}</p>
                    </div>
                  </div>
                  <div className="flex flex-col space-y-1 opacity-50">
                    <ListOrdered size={20} className="text-gray-400" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {routeClients.map((client, index) => {
                if (searchTerm && !client.name?.toLowerCase().includes(searchTerm.toLowerCase()) && !client.address?.toLowerCase().includes(searchTerm.toLowerCase())) {
                  return null;
                }

                const isCompleted = completedVisitsOnRouteDate.has(client.id);
                const isFutureRoute = routeDate > getLocalISODate();
                const isSelectedForAnticipation = selectedForAnticipation.has(client.id);
                
                return (
                  <motion.div 
                    key={client.id} 
                    onClick={() => {
                      setHighlightedClientId(client.id);
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
                    {(isAdmin || isManager) && routeDate >= getLocalISODate() && !isCompleted && !isOrderingMode && (
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
                              openMap(client.address);
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

          {routeClients.length > 0 && (
            <div className="mt-8">
               <EmployeeMap clients={routeClients} highlightedClientId={highlightedClientId} />
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
              
              <div className="mb-1">
                <label className="block text-sm font-medium text-gray-700 mb-2">Checklist de Tarefas (Obrigatório) *</label>
                <div className="grid grid-cols-2 gap-2 bg-gray-50 p-3 rounded-lg border border-gray-200">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="checkbox" checked={checklist.peneirar} onChange={e => setChecklist({...checklist, peneirar: e.target.checked})} className="w-4 h-4 text-primary rounded focus:ring-primary border-gray-300" />
                    <span className="text-gray-700 text-sm">Peneirar</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="checkbox" checked={checklist.escovar} onChange={e => setChecklist({...checklist, escovar: e.target.checked})} className="w-4 h-4 text-primary rounded focus:ring-primary border-gray-300" />
                    <span className="text-gray-700 text-sm">Escovar Paredes</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="checkbox" checked={checklist.aspirar} onChange={e => setChecklist({...checklist, aspirar: e.target.checked})} className="w-4 h-4 text-primary rounded focus:ring-primary border-gray-300" />
                    <span className="text-gray-700 text-sm">Aspirar</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="checkbox" checked={checklist.lavarFiltro} onChange={e => setChecklist({...checklist, lavarFiltro: e.target.checked})} className="w-4 h-4 text-primary rounded focus:ring-primary border-gray-300" />
                    <span className="text-gray-700 text-sm">Lavar o Filtro</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="checkbox" checked={checklist.lavarCapa} onChange={e => setChecklist({...checklist, lavarCapa: e.target.checked})} className="w-4 h-4 text-primary rounded focus:ring-primary border-gray-300" />
                    <span className="text-gray-700 text-sm">Lavar Capa</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="checkbox" checked={checklist.limparBordas} onChange={e => setChecklist({...checklist, limparBordas: e.target.checked})} className="w-4 h-4 text-primary rounded focus:ring-primary border-gray-300" />
                    <span className="text-gray-700 text-sm">Limpar Bordas</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="checkbox" checked={checklist.decantar} onChange={e => setChecklist({...checklist, decantar: e.target.checked})} className="w-4 h-4 text-primary rounded focus:ring-primary border-gray-300" />
                    <span className="text-gray-700 text-sm">Decantar</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="checkbox" checked={checklist.motorLigado} onChange={e => setChecklist({...checklist, motorLigado: e.target.checked})} className="w-4 h-4 text-primary rounded focus:ring-primary border-gray-300" />
                    <span className="text-gray-700 text-sm">Motor Ligado</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="checkbox" checked={checklist.ausente} onChange={e => setChecklist({...checklist, ausente: e.target.checked})} className="w-4 h-4 text-red-500 rounded focus:ring-red-500 border-gray-300" />
                    <span className="text-gray-700 text-sm font-medium">Ausente</span>
                  </label>
                </div>
              </div>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Parâmetros Físico-Químicos da Água</label>
                <div className="grid grid-cols-2 gap-3 bg-blue-50 p-3 rounded-lg border border-blue-100">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Cloro (ppm)</label>
                    <input type="text" placeholder="Ex: 2.0" value={parameters.cloro} onChange={e => setParameters({...parameters, cloro: e.target.value})} className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:ring-primary focus:border-primary outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">pH</label>
                    <input type="text" placeholder="Ex: 7.2" value={parameters.ph} onChange={e => setParameters({...parameters, ph: e.target.value})} className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:ring-primary focus:border-primary outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Alcalinidade</label>
                    <input type="text" placeholder="Ex: 100" value={parameters.alcalinidade} onChange={e => setParameters({...parameters, alcalinidade: e.target.value})} className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:ring-primary focus:border-primary outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Ácido Cianúrico</label>
                    <input type="text" placeholder="Ex: 40" value={parameters.acidoCianurico} onChange={e => setParameters({...parameters, acidoCianurico: e.target.value})} className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:ring-primary focus:border-primary outline-none" />
                  </div>
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Produtos Utilizados</label>
                <div className="grid grid-cols-2 gap-2 bg-green-50 p-3 rounded-lg border border-green-100">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="checkbox" checked={products.cloroGranulado} onChange={e => setProducts({...products, cloroGranulado: e.target.checked})} className="w-4 h-4 text-green-600 rounded focus:ring-green-500 border-gray-300" />
                    <span className="text-gray-700 text-sm">Cloro Granulado</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="checkbox" checked={products.cloroPastilha} onChange={e => setProducts({...products, cloroPastilha: e.target.checked})} className="w-4 h-4 text-green-600 rounded focus:ring-green-500 border-gray-300" />
                    <span className="text-gray-700 text-sm">Cloro Pastilha</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="checkbox" checked={products.algicida} onChange={e => setProducts({...products, algicida: e.target.checked})} className="w-4 h-4 text-green-600 rounded focus:ring-green-500 border-gray-300" />
                    <span className="text-gray-700 text-sm">Algicida</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="checkbox" checked={products.clarificante} onChange={e => setProducts({...products, clarificante: e.target.checked})} className="w-4 h-4 text-green-600 rounded focus:ring-green-500 border-gray-300" />
                    <span className="text-gray-700 text-sm">Clarificante</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="checkbox" checked={products.barrilha} onChange={e => setProducts({...products, barrilha: e.target.checked})} className="w-4 h-4 text-green-600 rounded focus:ring-green-500 border-gray-300" />
                    <span className="text-gray-700 text-sm">Barrilha</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="checkbox" checked={products.sulfatoAluminio} onChange={e => setProducts({...products, sulfatoAluminio: e.target.checked})} className="w-4 h-4 text-green-600 rounded focus:ring-green-500 border-gray-300" />
                    <span className="text-gray-700 text-sm">Sulfato de Alumínio</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="checkbox" checked={products.sulfatoCobre} onChange={e => setProducts({...products, sulfatoCobre: e.target.checked})} className="w-4 h-4 text-green-600 rounded focus:ring-green-500 border-gray-300" />
                    <span className="text-gray-700 text-sm">Sulfato de Cobre</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="checkbox" checked={products.elevadorAlcalinidade} onChange={e => setProducts({...products, elevadorAlcalinidade: e.target.checked})} className="w-4 h-4 text-green-600 rounded focus:ring-green-500 border-gray-300" />
                    <span className="text-gray-700 text-sm">Elevador de Alc.</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="checkbox" checked={products.redutorPh} onChange={e => setProducts({...products, redutorPh: e.target.checked})} className="w-4 h-4 text-green-600 rounded focus:ring-green-500 border-gray-300" />
                    <span className="text-gray-700 text-sm">Redutor de pH</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="checkbox" checked={products.peroxidoHidrogenio} onChange={e => setProducts({...products, peroxidoHidrogenio: e.target.checked})} className="w-4 h-4 text-green-600 rounded focus:ring-green-500 border-gray-300" />
                    <span className="text-gray-700 text-sm">Peróxido de Hid.</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="checkbox" checked={products.hipoclorito} onChange={e => setProducts({...products, hipoclorito: e.target.checked})} className="w-4 h-4 text-green-600 rounded focus:ring-green-500 border-gray-300" />
                    <span className="text-gray-700 text-sm">Hipoclorito</span>
                  </label>
                </div>
              </div>
              
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fotos (Tiradas: {reportPhotos.length} {selectedClientForReport?.poolCount ? `/ Esperadas: ${selectedClientForReport.poolCount}` : ''})
                </label>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <label className="cursor-pointer bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg flex items-center transition-colors">
                    <Camera size={18} className="mr-2" />
                    Tirar Foto
                    <input 
                      type="file" 
                      accept="image/*" 
                      capture="environment"
                      onChange={handlePhotoUpload}
                      className="hidden" 
                    />
                  </label>
                  <label className="cursor-pointer bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg flex items-center transition-colors">
                    <ImageIcon size={18} className="mr-2" />
                    Enviar da Galeria
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={handlePhotoUpload}
                      className="hidden" 
                    />
                  </label>
                </div>
                {reportPhotos.length > 0 && (
                  <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
                    {reportPhotos.map((photo, index) => (
                      <div key={index} className="relative inline-block shrink-0">
                        <img src={photo} alt={`Preview ${index}`} className="h-32 w-auto rounded-lg border border-gray-200 object-cover" />
                        <button
                          type="button"
                          onClick={() => {
                            const newPhotos = reportPhotos.filter((_, i) => i !== index);
                            setReportPhotos(newPhotos);
                            if (newPhotos.length === 0) setPhotoDate(null);
                          }}
                          className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold hover:bg-red-600 shadow"
                        >
                          X
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {photoDate && reportPhotos.length > 0 && (
                  <p className="mt-2 text-xs text-gray-500">
                    <span className="font-semibold">Horário da visita:</span> {photoDate.toLocaleString('pt-BR')} (extraído da foto)
                  </p>
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
                  disabled={submittingReport || !reportNotes.trim() || !(checklist.peneirar || checklist.escovar || checklist.aspirar || checklist.lavarFiltro || checklist.lavarCapa || checklist.limparBordas || checklist.decantar || checklist.motorLigado || checklist.ausente)}
                  className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary-light transition-colors disabled:opacity-50 flex items-center"
                >
                  {submittingReport ? 'Salvando...' : 'Finalizar Atendimento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Send Report Popup */}
      {confirmSendReportPopupOpen && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full shadow-2xl">
            <h3 className="text-xl font-bold text-gray-900 mb-2">Enviar Relatório?</h3>
            <p className="text-gray-600 mb-6">
              Deseja enviar o relatório para o cliente?
            </p>
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => processReportSubmission(false)}
                className="px-6 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors font-medium"
              >
                Não
              </button>
              <button
                type="button"
                onClick={() => processReportSubmission(true)}
                className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary-light transition-colors font-medium"
              >
                Sim
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
