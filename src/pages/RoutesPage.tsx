import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { jsPDF } from 'jspdf';
import { Share2, FileText, Map, Camera, CheckCircle, MapPin, Image as ImageIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { openMap, openRouteMap, openWaze } from '../lib/maps';
import EmployeeMap from '../components/EmployeeMap';
import exifr from 'exifr';

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

  // TSP Optimization state
  const [optimizing, setOptimizing] = useState(false);
  const [highlightedClientId, setHighlightedClientId] = useState<string | null>(null);

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

  useEffect(() => {
    if (!generated || !userProfile || !routeDate) return;

    const adminId = isAdmin ? userProfile.uid : userProfile.adminId;
    if (!routeDate) return;
    const [year, month, day] = routeDate.split('-').map(Number);
    const start = new Date(year, month - 1, day, 0, 0, 0);
    const end = new Date(year, month - 1, day, 23, 59, 59, 999);
    const routeDateStart = start.toISOString();
    const routeDateEnd = end.toISOString();

    const fetchStatus = async () => {
      try {
        const activeRouteDate = routeDate || getLocalISODate();
        const { data: visitsByTime } = await supabase.from('visits')
          .select('client_id, date')
          .eq('admin_id', adminId)
          .eq('time', activeRouteDate);
          
        const { data: visitsByDate } = await supabase.from('visits')
          .select('client_id, date')
          .eq('admin_id', adminId)
          .gte('date', routeDateStart)
          .lte('date', routeDateEnd);
          
        const { data: visitsByCreated } = await supabase.from('visits')
          .select('client_id, date')
          .eq('admin_id', adminId)
          .gte('created_at', routeDateStart)
          .lte('created_at', routeDateEnd);
          
        const visitsData = [...(visitsByTime || []), ...(visitsByDate || []), ...(visitsByCreated || [])];
        
        let jobsQuery = supabase.from('oneoffjobs').select('*').eq('admin_id', adminId);
        if (!isAdmin && !isManager) {
          jobsQuery = jobsQuery.eq('employee_id', userProfile.uid);
        }
        const { data: jobsData } = await jobsQuery;

        setCompletedVisitsOnRouteDate(prev => {
          const next = new Set(prev);
          if (visitsData) {
            visitsData.forEach(data => {
              if (data.date) {
                next.add(data.client_id);
              }
            });
          }
          if (jobsData) {
            jobsData.forEach(job => {
              const updatedAtDate = job.updated_at ? new Date(job.updated_at) : null;
              const ds = new Date(routeDateStart);
              const de = new Date(routeDateEnd);
              const updatedToday = updatedAtDate && updatedAtDate >= ds && updatedAtDate <= de;
              
              if (job.status === 'concluido' || (job.status === 'em_andamento' && updatedToday)) {
                if ((job.date && job.date.startsWith(routeDate) && job.status !== 'pendente') || (job.return_date && job.return_date.startsWith(routeDate) && job.status === 'concluido') || updatedToday) {
                   next.add(job.id);
                }
              }
            });
          }
          return next;
        });
      } catch (err) {
        console.error(err);
      }
    };

    fetchStatus();

    const channel1 = supabase.channel('routes-visits')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'visits', filter: `admin_id=eq.${adminId}` }, fetchStatus)
      .subscribe();

    let jobFilter = `admin_id=eq.${adminId}`;
    if (!isAdmin && !isManager) jobFilter += `&employee_id=eq.${userProfile.uid}`;

    const channel2 = supabase.channel('routes-jobs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'oneoffjobs', filter: jobFilter }, fetchStatus)
      .subscribe();

    return () => {
      supabase.removeChannel(channel1);
      supabase.removeChannel(channel2);
    };
  }, [generated, routeDate, userProfile, isAdmin]);

  const handleGenerateRoute = async () => {
    if (!selectedEmployee || (!selectedDay && !routeDate) || !userProfile) return;
    setLoading(true);
    setGenerated(false);

    try {
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
        
        const matchesDayOfWeek = selectedDay ? (visitDays.includes(selectedDay)) : false;
        const matchesExtraVisit = routeDate ? (extraVisits.includes(routeDate)) : false;
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
      
      const filteredJobs = allJobs.filter((job: any) => {
        const matchesDate = job.date === routeDate || (job.date && job.date.startsWith(routeDate));
        const matchesReturnDate = job.return_date === routeDate || (job.return_date && job.return_date.startsWith(routeDate));
        return (matchesDate || matchesReturnDate) && job.status !== 'cancelado';
      });

      setRouteClients([...clientsData, ...filteredJobs]);

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
        
      const completedIds = new Set<string>();
      if (visitsSnap) {
        visitsSnap.forEach(data => {
            completedIds.add(data.client_id);
        });
      }
      
      // Add one-off jobs that are completed or already handled for this route date
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

      setCompletedVisitsOnRouteDate(completedIds);

      setGenerated(true);
      setSelectedForAnticipation(new Set());
    } catch (error) {
      console.error(error);
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
          const updates: any = { updated_at: new Date().toISOString() };
          if (client.return_date === routeDate) {
            updates.return_date = today;
          } else {
            updates.date = today;
          }
          await supabase.from('oneoffjobs').update(updates).eq('id', client.id);
        } else {
          const extraVisits = client.extra_visits || [];
          if (!extraVisits.includes(today)) {
            await supabase.from('clients').update({
              extra_visits: [...extraVisits, today]
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

  const handleOptimizeRoute = async () => {
    if (routeClients.length === 0) return;
    setOptimizing(true);
    
    try {
      const geocodedClients = [...routeClients];
      let userLocation: { lat: number, lng: number } | null = null;

      // Try to get user's current location to start the route
      try {
        if (navigator.geolocation) {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
          });
          userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        }
      } catch (err) {
        console.warn("Could not get user location for optimization.");
      }
      
      // Basic Nominatim Geocoding with a small delay to avoid aggressive rate limits 
      let geocodeCount = 0;
      for (let i = 0; i < geocodedClients.length; i++) {
        const c = geocodedClients[i];
        if (c.address && (!c.lat || !c.lng)) {
          try {
            const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(c.address)}`;
            const res = await fetch(url, { headers: { 'Accept-Language': 'pt-BR,pt;q=0.9' } });
            const data = await res.json();
            if (data && data.length > 0) {
               geocodedClients[i].lat = parseFloat(data[0].lat);
               geocodedClients[i].lng = parseFloat(data[0].lon);
               geocodeCount++;
            }
            await new Promise(r => setTimeout(r, 700)); // Be nice to Nominatim
          } catch(err) {
            console.warn("Geocode failed for " + c.address);
          }
        } else if (c.lat && c.lng) {
          geocodeCount++; // Already geocoded
        }
      }

      // TSP algorithm (Nearest Neighbor)
      const clientsWithLocation = geocodedClients.filter(c => c.lat && c.lng);
      const clientsWithoutLocation = geocodedClients.filter(c => !c.lat || !c.lng);

      if (clientsWithLocation.length > 0) {
        const sorted = [];
        let current = userLocation ? userLocation : clientsWithLocation.shift(); 
        
        if (!userLocation && current) {
          sorted.push(current as any);
        }

        while (clientsWithLocation.length > 0 && current) {
          let nearestIdx = 0;
          let minDistance = Infinity;

          for (let i = 0; i < clientsWithLocation.length; i++) {
             const candidate = clientsWithLocation[i];
             const d = Math.pow(candidate.lat - current.lat, 2) + Math.pow(candidate.lng - current.lng, 2);
             if (d < minDistance) {
                 minDistance = d;
                 nearestIdx = i;
             }
          }

          current = clientsWithLocation.splice(nearestIdx, 1)[0];
          sorted.push(current);
        }

        setRouteClients([...sorted, ...clientsWithoutLocation]);
        
        const missed = clientsWithoutLocation.length;
        if (missed > 0) {
          alert(`Rota otimizada! Nota: ${missed} cliente(s) não puderam ser localizados no mapa com precisão e foram movidos para o final da lista.`);
        } else {
          alert("A rota foi otimizada com sucesso com base na proximidade!");
        }
      } else {
        setRouteClients(geocodedClients);
        alert("Lamentamos, mas não conseguimos localizar os endereços dos clientes no mapa. Use o botão do Google Maps para traçar a rota.");
      }
    } catch (err) {
      console.error(err);
      alert("Falha ao otimizar rota. Verifique sua conexão.");
    } finally {
      setOptimizing(false);
    }
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
      
      if (selectedClientForReport.isOneOffJob) {
        // Avulso Update
        await supabase.from('oneoffjobs').update({
          status: needsReturn ? 'em_andamento' : 'concluido',
          return_date: needsReturn ? returnDate : null,
          report: reportNotes.trim(),
          updated_at: finalVisitDate
        }).eq('id', selectedClientForReport.id);
      } else {
        // Normal Client Visit
        const { error: insertError } = await supabase.from('visits').insert({
          admin_id: adminId,
          client_id: selectedClientForReport.id,
          employee_id: (isAdmin || isManager) && selectedEmployee ? selectedEmployee : userProfile.uid,
          date: finalVisitDate,
          time: activeRouteDate,
          notes: reportNotes.trim(),
          photo_urls: reportPhotos,
          location: locationData
        });
        
        if (insertError) throw insertError;

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

      // Update local state to mark as completed
      setCompletedVisitsOnRouteDate(prev => new Set(prev).add(selectedClientForReport.id));
      
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
          disabled={!selectedEmployee || (!selectedDay && !routeDate) || loading}
          className="w-full md:w-auto bg-primary text-white px-6 py-2 rounded-lg font-semibold hover:bg-primary-light transition-colors disabled:opacity-50"
        >
          {loading ? 'Gerando...' : 'Gerar Rota'}
        </button>
      </div>

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
                onClick={handleOptimizeRoute}
                disabled={routeClients.length === 0 || optimizing}
                className="flex items-center bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
                title="Otimizar Rota (TSP)"
              >
                {optimizing ? 'Otimizando...' : 'Otimizar Rota'}
              </button>
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
