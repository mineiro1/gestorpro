import React, { useState, useEffect, useRef } from 'react';
import { ChatModal } from '../components/ChatModal';
import { MessageCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { jsPDF } from 'jspdf';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Share2, FileText, Map, Camera, CheckCircle, MapPin, Image as ImageIcon, 
  ArrowUp, ArrowDown, Save, ListOrdered, Search, RefreshCw, Phone,
  Clock, ShieldAlert, AlertTriangle, Key, Zap, ArrowRightLeft, Trash2, Edit2, Users, Check, X
} from 'lucide-react';
import { useCall } from '../contexts/CallContext';
import { openMap, openRouteMap, openWaze } from '../lib/maps';
import { openWhatsApp, sendEvolutionMessage, sendMetaMessage, sendAstraCallsMessage, getEffectiveWhatsAppProvider } from '../lib/whatsapp';
import { formatClientMessageTemplate } from '../lib/messageTemplates';
import { notifyAdminAttendanceFinished } from '../lib/pushNotifications';
import { getLocalDayUtcRange, checkDailyChatAvailability, evaluateSessionExpiry, markClientChatAsRead } from '../lib/chatSessionUtils';
import { getApiUrl } from '../lib/apiConfig';
import EmployeeMap from '../components/EmployeeMap';
import exifr from 'exifr';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const DAYS_OF_WEEK = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

export default function RoutesPage() {
  const { userProfile, isAdmin, isManager } = useAuth();
  const { startCall } = useCall();
  
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
  const [chatModalOpen, setChatModalOpen] = useState(false);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>(() => {
    try { return JSON.parse(localStorage.getItem('unreadCounts') || '{}'); } catch(e) { return {}; }
  });
  const activeChatClientRef = useRef<any>(null);
  const chatModalOpenRef = useRef<boolean>(false);

  useEffect(() => {
    localStorage.setItem('unreadCounts', JSON.stringify(unreadCounts));
  }, [unreadCounts]);



  useEffect(() => {
    chatModalOpenRef.current = chatModalOpen;
    if (chatModalOpen && activeChatClientRef.current) {
      const cid = activeChatClientRef.current.id;
      try {
        localStorage.setItem(`chat_last_read_${cid}`, new Date().toISOString());
      } catch (e) {
        console.error(e);
      }
      setUnreadCounts(prev => {
        const nc = {...prev};
        delete nc[cid];
        return nc;
      });
    }
  }, [chatModalOpen]);

  const [activeChatVisit, setActiveChatVisit] = useState<any>(null);
  const [activeChatClient, setActiveChatClient] = useState<any>(null);
  useEffect(() => {
    activeChatClientRef.current = activeChatClient;
  }, [activeChatClient]);


  const [highlightedClientId, setHighlightedClientId] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');

  // Filtros Rápidos por Abas: [Todas] | [A Fazer] | [Concluídas]
  const [routeFilterTab, setRouteFilterTab] = useState<'todas' | 'a_fazer' | 'concluidas'>('todas');

  // Avisos Fixos e Segurança do Imóvel State
  const [securityModalOpen, setSecurityModalOpen] = useState(false);
  const [selectedClientForSecurity, setSelectedClientForSecurity] = useState<any>(null);
  const [securityNoteInput, setSecurityNoteInput] = useState('');
  const [savingSecurityNote, setSavingSecurityNote] = useState(false);
  const [localSecurityNotes, setLocalSecurityNotes] = useState<Record<string, string>>({});

  // Repasse de Rota de Emergência (Hand-off) State
  const [handoffModalOpen, setHandoffModalOpen] = useState(false);
  const [handoffTargetEmployee, setHandoffTargetEmployee] = useState('');
  const [handoffSelectedClientIds, setHandoffSelectedClientIds] = useState<Set<string>>(new Set());
  const [handoffReason, setHandoffReason] = useState('');
  const [handoffType, setHandoffType] = useState<'today_only' | 'definitive'>('today_only');
  const [isExecutingHandoff, setIsExecutingHandoff] = useState(false);

  // Anticipation state
  const [selectedForAnticipation, setSelectedForAnticipation] = useState<Set<string>>(new Set());
  const [anticipating, setAnticipating] = useState(false);

  // Report Modal State
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [selectedClientForReport, setSelectedClientForReport] = useState<any>(null);
  const cachedLocationRef = useRef<{ lat: number; lng: number } | null>(null);

  // Pre-fetch location as soon as report modal opens
  useEffect(() => {
    if (reportModalOpen && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (pos?.coords) {
            cachedLocationRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          }
        },
        () => {},
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 300000 }
      );
    }
  }, [reportModalOpen]);
  const [reportNotes, setReportNotes] = useState('');
  const [reportPhotos, setReportPhotos] = useState<string[]>([]);
  const [photoDate, setPhotoDate] = useState<Date | null>(null);
  const [submittingReport, setSubmittingReport] = useState(false);
  const [confirmSendReportPopupOpen, setConfirmSendReportPopupOpen] = useState(false);
  const [parameters, setParameters] = useState({ cloro: '', ph: '', alcalinidade: '', acidoCianurico: '' });

  const handleNumericParamChange = (field: 'cloro' | 'ph' | 'alcalinidade' | 'acidoCianurico', rawVal: string) => {
    // Permite apenas números e no máximo um separador decimal (. ou ,)
    let clean = rawVal.replace(/[^0-9.,]/g, '');
    const firstSepIndex = clean.search(/[.,]/);
    if (firstSepIndex !== -1) {
      const sep = clean[firstSepIndex];
      const before = clean.substring(0, firstSepIndex).replace(/[.,]/g, '');
      const after = clean.substring(firstSepIndex + 1).replace(/[.,]/g, '');
      clean = `${before}${sep}${after}`;
    }
    setParameters(prev => ({ ...prev, [field]: clean }));
  };

  const handleNumericKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const allowedKeys = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter', '.', ','];
    if (allowedKeys.includes(e.key) || e.ctrlKey || e.metaKey) return;
    if (!/^[0-9]$/.test(e.key)) {
      e.preventDefault();
    }
  };
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
          // Prevenção de duplicidade: checa se a visita já foi gravada no banco
          const { data: alreadyExists } = await supabase
            .from('visits')
            .select('id')
            .eq('client_id', payload.clientId)
            .eq('time', payload.time)
            .in('status', ['finalizada', 'realizada'])
            .limit(1);

          if (!alreadyExists || alreadyExists.length === 0) {
            const safeEmployeeId = payload.employeeId || userProfile?.uid || '698dfcdd-7c91-4df5-aaee-eae9e67f15ae';
            const { error: insertError } = await supabase.from('visits').insert({
              admin_id: payload.adminId || '698dfcdd-7c91-4df5-aaee-eae9e67f15ae',
              client_id: payload.clientId,
              employee_id: safeEmployeeId,
              date: payload.date,
              time: payload.time,
              notes: payload.notes,
              photo_urls: payload.photoUrls || [],
              location: payload.location,
              status: 'realizada'
            });
            if (insertError) throw insertError;
          }
          
          try {
            await supabase.from('clients').update({
              last_visit_date: payload.date
            }).eq('id', payload.clientId);
          } catch (e) {}
        }
        
        // Dispara notificação push para o administrador ao sincronizar
        if (payload.adminId) {
          notifyAdminAttendanceFinished({
            adminId: payload.adminId,
            employeeId: payload.employeeId || userProfile?.uid,
            clientId: payload.clientId,
            clientName: payload.clientName || 'Cliente',
            techName: payload.techName || userProfile?.name || 'Colaborador',
            visitId: payload.clientId,
            type: payload.isOneOffJob ? 'job' : 'visit',
            notes: payload.notes
          }).catch(() => {});
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
      setGenerated(true);
    }
  }, [isAdmin, isManager, userProfile]);

  
  const { data: queryData, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['routeData', routeDate, selectedEmployee, selectedDay, userProfile?.uid, generated],
    enabled: generated && !!userProfile && !!routeDate && !!selectedEmployee,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: 4000,
    refetchIntervalInBackground: false,
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
      

      let currentDayOfWeek = '0';
      if (routeDate) {
         const [y, m, d] = routeDate.split('-').map(Number);
         currentDayOfWeek = new Date(y, m - 1, d).getDay().toString();
      } else if (selectedDay) {
         const DAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
         currentDayOfWeek = DAYS.indexOf(selectedDay).toString();
      }
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
        .select('client_id, status')
        .eq('admin_id', adminId)
        .eq('time', activeRouteDate);
        
      const { data: visitsByDate } = await supabase.from('visits')
        .select('client_id, status')
        .eq('admin_id', adminId)
        .gte('date', routeDateStartStr)
        .lte('date', routeDateEndStr);
        
      const { data: visitsByCreated } = await supabase.from('visits')
        .select('client_id, status')
        .eq('admin_id', adminId)
        .gte('created_at', routeDateStartStr)
        .lte('created_at', routeDateEndStr);
        
      const visitsSnap = [...(visitsByTime || []), ...(visitsByDate || []), ...(visitsByCreated || [])];
        
      const completedIds = new Set();
      if (visitsSnap) {
        visitsSnap.forEach(data => {
            if (data.status !== 'agendada') {
               completedIds.add(data.client_id);
            }
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
      
      // Busca sessões de chat de hoje para os clientes da rota para saber se o chat está ativo ou se expirou os 30 min
      const { startUtcIso, endUtcIso } = getLocalDayUtcRange();
      const clientIds = mergedClients.map((c: any) => c.id).filter(Boolean);
      const chatStatusByClient: Record<string, { hasSessionToday: boolean; isActive: boolean; isExpiredOrClosed: boolean }> = {};
      const unreadMap: Record<string, number> = {};

      if (clientIds.length > 0) {
        const { data: todaySessions } = await supabase
          .from('chat_sessions')
          .select('id, client_id, status, created_at, closed_at')
          .in('client_id', clientIds)
          .gte('created_at', startUtcIso)
          .lte('created_at', endUtcIso);

        const nowMs = Date.now();
        const activeSessions: { id: string; client_id: string }[] = [];

        (todaySessions || []).forEach((sess: any) => {
          const cid = sess.client_id;
          if (!chatStatusByClient[cid]) {
            chatStatusByClient[cid] = { hasSessionToday: true, isActive: false, isExpiredOrClosed: false };
          }
          if (sess.status === 'open') {
            const exp = evaluateSessionExpiry(sess, nowMs);
            if (!exp.isExpired && !completedIds.has(cid)) {
              chatStatusByClient[cid].isActive = true;
              activeSessions.push({ id: sess.id, client_id: cid });
            } else {
              chatStatusByClient[cid].isExpiredOrClosed = true;
            }
          } else {
            chatStatusByClient[cid].isExpiredOrClosed = true;
          }
        });

        // Carrega registros de leitura global da tabela settings para sincronia multi-dispositivo
        const settingKeys = clientIds.map((cid: string) => `chat_read_${cid}`);
        const { data: readSettings } = await supabase
          .from('settings')
          .select('id, updated_at')
          .in('id', settingKeys);

        const globalReadTimeByClient: Record<string, number> = {};
        (readSettings || []).forEach((s: any) => {
          if (s.id && s.updated_at) {
            const cid = s.id.replace('chat_read_', '');
            globalReadTimeByClient[cid] = new Date(s.updated_at).getTime();
          }
        });

        // Contagem real de mensagens não lidas para sessões ativas
        if (activeSessions.length > 0) {
          const sessionIds = activeSessions.map(s => s.id);
          const { data: clientMessages } = await supabase
            .from('chat_messages')
            .select('id, session_id, sender_type, created_at')
            .in('session_id', sessionIds)
            .eq('sender_type', 'client');

          if (clientMessages && clientMessages.length > 0) {
            const sessionToClientMap: Record<string, string> = {};
            activeSessions.forEach(s => {
              sessionToClientMap[s.id] = s.client_id;
            });
            for (const msg of clientMessages) {
              const cid = sessionToClientMap[msg.session_id];
              if (cid) {
                const localReadStr = localStorage.getItem(`chat_last_read_${cid}`);
                const localReadTime = localReadStr ? new Date(localReadStr).getTime() : 0;
                const globalReadTime = globalReadTimeByClient[cid] || 0;
                const lastReadTime = Math.max(localReadTime, globalReadTime);

                if (new Date(msg.created_at).getTime() > lastReadTime) {
                  unreadMap[cid] = (unreadMap[cid] || 0) + 1;
                }
              }
            }
          }
        }
      }

      // Mini Histórico da Última Visita no Card
        const lastVisitByClient: Record<string, { dateFormatted: string; techName: string; summary: string }> = {};
        if (clientIds.length > 0) {
          try {
            const { data: pastVisits } = await supabase
              .from('visits')
              .select('id, client_id, employee_id, date, created_at, status, notes, observation')
              .in('client_id', clientIds)
              .in('status', ['finalizada', 'realizada'])
              .order('created_at', { ascending: false });

            const techMap: Record<string, string> = {};
            (employees || []).forEach((emp: any) => {
              if (emp?.id && emp?.name) techMap[emp.id] = emp.name.split(' ')[0];
            });
            if (userProfile?.uid && userProfile?.name) {
              techMap[userProfile.uid] = userProfile.name.split(' ')[0];
            }

            const missingTechIds = (pastVisits || [])
              .map((v: any) => v.employee_id)
              .filter((id: string) => id && !techMap[id]);

            if (missingTechIds.length > 0) {
              const { data: missingUsers } = await supabase
                .from('users')
                .select('id, name')
                .in('id', Array.from(new Set(missingTechIds)));
              (missingUsers || []).forEach((u: any) => {
                if (u.id && u.name) techMap[u.id] = u.name.split(' ')[0];
              });
            }

            (pastVisits || []).forEach((v: any) => {
              if (!lastVisitByClient[v.client_id]) {
                let dateFormatted = '';
                const rawDate = v.date || v.created_at;
                if (rawDate) {
                  try {
                    const parts = rawDate.split('T')[0].split('-');
                    if (parts.length === 3) {
                      dateFormatted = `${parts[2]}/${parts[1]}`;
                    }
                  } catch (e) {}
                }

                const fullText = (v.notes || '').trim();
                const obsText = (v.observation || '').trim();
                const summaryParts: string[] = [];

                // 1. Tarefas realizadas (Checklist)
                let tasks: string[] = [];
                const tarefasSection = fullText.split(/tarefas\s*(?:realizadas)?:\s*/i)[1];
                if (tarefasSection) {
                  tasks = tarefasSection
                    .split(/\n\s*\n/)[0]
                    .split('\n')
                    .map(l => l.replace(/^[-•*–—\s]+/, '').trim())
                    .filter(Boolean);
                } else {
                  const servMatch = fullText.match(/servi[cç]os:\s*([^\n]+)/i);
                  if (servMatch && servMatch[1]) {
                    tasks = servMatch[1]
                      .split(',')
                      .map(s => s.replace(/^[-•*–—\s]+/, '').trim())
                      .filter(Boolean);
                  }
                }

                if (tasks.length > 0) {
                  const cleanTasks = tasks.map(t => {
                    let s = t
                      .replace(/^A piscina foi /i, '')
                      .replace(/^As paredes da piscina foram /i, 'Paredes ')
                      .replace(/^O filtro da piscina foi /i, 'Filtro ')
                      .replace(/^As bordas da piscina foram /i, 'Bordas ')
                      .replace(/^A capa da piscina foi /i, 'Capa ')
                      .replace(/^O motor ficou /i, 'Motor ')
                      .replace(/^Cliente ausente.*$/i, 'Cliente ausente');
                    return s.charAt(0).toUpperCase() + s.slice(1);
                  });
                  summaryParts.push(`Checklist: ${cleanTasks.join(', ')}`);
                }

                // 2. Produtos Utilizados
                let productsList: string[] = [];
                const prodSection = fullText.split(/produtos\s*(?:utilizados)?:\s*/i)[1];
                if (prodSection) {
                  productsList = prodSection
                    .split(/\n\s*\n/)[0]
                    .split('\n')
                    .map(l => l.replace(/^[-•*–—\s]+/, '').trim())
                    .filter(Boolean);
                } else {
                  const prodMatch = fullText.match(/produtos(?:\s+utilizados)?:\s*([^\n]+)/i);
                  if (prodMatch && prodMatch[1] && !prodMatch[1].includes(':')) {
                    productsList = prodMatch[1]
                      .split(',')
                      .map(s => s.replace(/^[-•*–—\s]+/, '').trim())
                      .filter(Boolean);
                  }
                }

                if (productsList.length > 0) {
                  summaryParts.push(`Produtos: ${productsList.join(', ')}`);
                }

                // 3. Observações digitadas
                let customObs = obsText;
                if (!customObs) {
                  const headerIndex = fullText.search(/(?:tarefas\s+realizadas|par[âa]metros\s+da\s+[áa]gua|produtos\s+utilizados)/i);
                  if (headerIndex > 0) {
                    customObs = fullText.substring(0, headerIndex).trim();
                  } else if (headerIndex === -1 && fullText && !fullText.toLowerCase().includes('tarefas')) {
                    customObs = fullText;
                  }
                }

                if (customObs && !customObs.toLowerCase().startsWith('tarefas')) {
                  summaryParts.push(`Obs: ${customObs.replace(/\n+/g, ' ')}`);
                }

                const summary = summaryParts.length > 0
                  ? summaryParts.join(' • ')
                  : (fullText.replace(/\n+/g, ' ') || 'Limpeza e manutenção realizadas');

                lastVisitByClient[v.client_id] = {
                  dateFormatted: dateFormatted || 'Anterior',
                  techName: techMap[v.employee_id] || 'Técnico',
                  summary
                };
              }
            });
          } catch (vErr) {
            console.warn('[Mini Histórico] Erro ao buscar histórico de visitas:', vErr);
          }
        }

        // Avisos Fixos e Segurança do Imóvel dos clientes
        let securityNotesByClient: Record<string, string> = {};
        try {
          const { data: adminUserRow } = await supabase
            .from('users')
            .select('whatsapp_settings')
            .eq('id', adminId)
            .maybeSingle();

          if (adminUserRow?.whatsapp_settings?.client_security_notes) {
            securityNotesByClient = { ...adminUserRow.whatsapp_settings.client_security_notes };
          }
        } catch (secErr) {
          console.warn('[Avisos Fixos] Erro ao buscar avisos de segurança:', secErr);
        }

        return { 
          clients: mergedClients, 
          completed: completedIds, 
          chatStatusByClient, 
          unreadMap,
          lastVisitByClient,
          securityNotesByClient
        };
      }
    });

  const routeClients = queryData?.clients || [];
  const completedVisitsOnRouteDate = queryData?.completed || new Set();
  const chatStatusByClient = queryData?.chatStatusByClient || {};
  const lastVisitByClient = queryData?.lastVisitByClient || {};
  const securityNotesByClient = queryData?.securityNotesByClient || {};

// Sincroniza avisos fixos locais
useEffect(() => {
  if (queryData?.securityNotesByClient) {
    setLocalSecurityNotes(prev => ({ ...queryData.securityNotesByClient, ...prev }));
  }
}, [queryData?.securityNotesByClient]);

  // Sincroniza automaticamente as mensagens não lidas reais
  useEffect(() => {
    if (queryData?.unreadMap !== undefined) {
      setUnreadCounts(queryData.unreadMap);
      try {
        localStorage.setItem('unreadCounts', JSON.stringify(queryData.unreadMap));
      } catch (e) {
        console.error(e);
      }
    }
  }, [queryData?.unreadMap]);

  useEffect(() => {
    if (!generated || !userProfile || !routeDate) return;
    const adminId = isAdmin ? userProfile.uid : userProfile.adminId;

    const channelPrefix = `routes-live-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    const channel1 = supabase.channel(`${channelPrefix}-visits`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'visits' }, (payload) => {
        const newV = payload.new as any;
        const oldV = payload.old as any;

        // Ensure visit belongs to this admin's workspace
        if (newV?.admin_id && newV.admin_id !== adminId) return;
        if (oldV?.admin_id && oldV.admin_id !== adminId) return;

        // Instant UI reaction: immediately flip visit to completed or uncompleted
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          if (newV?.client_id && newV.status !== 'agendada') {
            queryClient.setQueriesData({ queryKey: ['routeData'] }, (old: any) => {
              if (!old) return old;
              const next = new Set(old.completed || []);
              next.add(newV.client_id);
              return { ...old, completed: next };
            });
          }
        } else if (payload.eventType === 'DELETE') {
          if (oldV?.client_id) {
            queryClient.setQueriesData({ queryKey: ['routeData'] }, (old: any) => {
              if (!old) return old;
              const next = new Set(old.completed || []);
              next.delete(oldV.client_id);
              return { ...old, completed: next };
            });
          }
        }

        queryClient.invalidateQueries({ queryKey: ['routeData'] });
        refetch();
      })
      .subscribe((status) => {
        console.log('[Routes Live] Visits subscription status:', status);
      });

    const channelChat = supabase.channel(`${channelPrefix}-chat`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, async (payload) => {
        const newMsg = payload.new as any;
        if (!newMsg) return;

        const { data: session } = await supabase
          .from('chat_sessions')
          .select('id, client_id, status, created_at, closed_at')
          .eq('id', newMsg.session_id)
          .single();

        if (session && session.client_id) {
          const cid = session.client_id;
          
          if (newMsg.sender_type === 'tech') {
            // Colaborador ou admin respondeu em algum dispositivo -> limpa não lidas
            setUnreadCounts(prev => {
              if (!prev[cid]) return prev;
              const next = { ...prev };
              delete next[cid];
              return next;
            });
            return;
          }

          if (newMsg.sender_type === 'client') {
            // Se a visita já estiver finalizada para este cliente, não incrementa bolinha verde de não lidas
            if (completedVisitsOnRouteDate.has(cid)) return;

            // Se o colaborador/admin NÃO iniciou o chat, ou a sessão não estiver 'open', ou expirada, não incrementa
            if (session.status !== 'open') return;
            const exp = evaluateSessionExpiry(session);
            if (exp.isExpired) return;

            if (activeChatClientRef.current && activeChatClientRef.current.id === cid && chatModalOpenRef.current) {
              // Chat está aberto neste momento na tela -> marca como lido globalmente
              markClientChatAsRead(cid, supabase);
            } else {
              setUnreadCounts(prev => ({ ...prev, [cid]: (prev[cid] || 0) + 1 }));
            }
          }
        }
      })
      .subscribe();

    const channelSettings = supabase.channel(`${channelPrefix}-settings-chat-read`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settings' }, (payload) => {
        const newRecord = payload.new as any;
        if (newRecord?.id && typeof newRecord.id === 'string' && newRecord.id.startsWith('chat_read_')) {
          const cid = newRecord.id.replace('chat_read_', '');
          if (newRecord.updated_at) {
            try {
              localStorage.setItem(`chat_last_read_${cid}`, newRecord.updated_at);
            } catch (e) {
              // ignore
            }
          }
          setUnreadCounts(prev => {
            if (!prev[cid]) return prev;
            const next = { ...prev };
            delete next[cid];
            return next;
          });
        }
      })
      .subscribe();

    const channelChatSessions = supabase.channel(`${channelPrefix}-chat-sessions`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_sessions' }, () => {
        queryClient.invalidateQueries({ queryKey: ['routeData'] });
        refetch();
      })
      .subscribe();

    const channel2 = supabase.channel(`${channelPrefix}-jobs`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'oneoffjobs' }, (payload) => {
        const newJob = payload.new as any;
        const oldJob = payload.old as any;

        if (newJob?.admin_id && newJob.admin_id !== adminId) return;
        if (oldJob?.admin_id && oldJob.admin_id !== adminId) return;

        // Instant UI reaction for one-off jobs
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          if (newJob?.id && (newJob.status === 'concluido' || newJob.status === 'em_andamento')) {
            queryClient.setQueriesData({ queryKey: ['routeData'] }, (old: any) => {
              if (!old) return old;
              const next = new Set(old.completed || []);
              next.add(newJob.id);
              return { ...old, completed: next };
            });
          }
        }

        if (newJob && newJob.client_name && newJob.client_name.startsWith('system_route_order_')) {
          if (!isAdmin) setRouteOrderChanged(true);
        }

        queryClient.invalidateQueries({ queryKey: ['routeData'] });
        refetch();
      })
      .subscribe((status) => {
        console.log('[Routes Live] Jobs subscription status:', status);
      });

    const handleGlobal = () => {
      setGenerated(true);
      queryClient.invalidateQueries({ queryKey: ['routeData'] });
      refetch();
    };
    window.addEventListener('app-global-refresh', handleGlobal);

    return () => {
      window.removeEventListener('app-global-refresh', handleGlobal);
      supabase.removeChannel(channel1);
      supabase.removeChannel(channelChat);
      supabase.removeChannel(channelSettings);
      supabase.removeChannel(channelChatSessions);
      supabase.removeChannel(channel2);
    };
  }, [generated, routeDate, selectedEmployee, selectedDay, userProfile, isAdmin, isManager, queryClient]);


  

  
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

      let currentDayOfWeek = '0';
      if (routeDate) {
         const [y, m, d] = routeDate.split('-').map(Number);
         currentDayOfWeek = new Date(y, m - 1, d).getDay().toString();
      } else if (selectedDay) {
         const DAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
         currentDayOfWeek = DAYS.indexOf(selectedDay).toString();
      }
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
           date: routeDate || new Date().toISOString().split('T')[0],
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
        
        doc.text(`Telefone: ${(isAdmin || isManager) ? (client.phone || 'N/A') : '***'}`, 14, yPos + 6 + (splitAddress.length * 5));
        
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

    const handleOpenChat = async (client: any, isCompleted: boolean, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }

    const { localDateStr } = getLocalDayUtcRange();
    
    if (routeDate && routeDate !== localDateStr) {
       alert('O chat não pode ser iniciado. A data da rota visualizada não é a data de hoje.');
       return;
    }

    if (isCompleted) {
       alert('A visita já foi finalizada. O chat está inativo para esta data.');
       return;
    }

    // Validação de Limite Diário (Admin e PRO possuem acesso ilimitado sem bloqueio)
    const check = await checkDailyChatAvailability(client.id, supabase, isAdmin || isManager);

    if (check.dailyLimitReached && !isAdmin && !isManager) {
      alert(check.message || 'O limite diário de atendimento (30 minutos) já foi atingido para este cliente hoje. Um novo chat poderá ser aberto amanhã a partir das 00:00.');
      return;
    }

    let visitId = null;
    let visitStatus = 'agendada';
    const adminId = isAdmin ? userProfile.uid : userProfile.adminId;
    
    try {
      const { data: existingVisit } = await supabase.from('visits')
        .select('id, status')
        .eq('client_id', client.id)
        .or(`time.eq.${routeDate},date.gte.${routeDate}T00:00:00.000Z`)
        .order('created_at', { ascending: false })
        .limit(1);

      if (existingVisit && existingVisit.length > 0) {
         visitId = existingVisit[0].id;
         visitStatus = existingVisit[0].status;
      }
    } catch(err) {
      console.error(err);
    }

    // Se precisa criar nova sessão, confirma início
    if (check.canStartNewSession) {
      const confirmPrompt = (isAdmin || isManager)
        ? `Gostaria de iniciar o chat com o cliente ${client.name}?`
        : `Gostaria de iniciar o chat com o cliente ${client.name}? O atendimento terá duração de 30 minutos (limite diário).`;
      if (!window.confirm(confirmPrompt)) {
        return;
      }

      // CRIA A SESSÃO IMEDIATAMENTE NO SUPABASE PARA PROPAGAR A TODOS OS APARELHOS
      try {
        const { data: newSess, error: newSessErr } = await supabase
          .from('chat_sessions')
          .insert({
            visit_id: visitId || null,
            admin_id: adminId,
            client_id: client.id,
            employee_id: userProfile?.uid,
            status: 'open',
            created_at: new Date().toISOString()
          }).select().single();

        if (newSessErr) {
          console.error("Erro ao registrar início do chat:", newSessErr);
        } else if (newSess) {
          queryClient.setQueryData(['chat-session', client.id], { session: newSess, sessionIds: [newSess.id] });
          queryClient.invalidateQueries({ queryKey: ['chat-session', client.id] });
          queryClient.invalidateQueries({ queryKey: ['routeData'] });
        }
      } catch (sessError) {
        console.error("Erro ao criar sessão de chat:", sessError);
      }
    }

    try {
      markClientChatAsRead(client.id, supabase);
      setUnreadCounts(prev => {
        const next = { ...prev };
        delete next[client.id];
        return next;
      });
    } catch (e) {
      console.error(e);
    }

    setActiveChatVisit({ id: visitId, status: visitStatus, isCompleted });
    setActiveChatClient(client);
    setChatModalOpen(true);
  };

  // Handlers para Avisos Fixos e Segurança do Imóvel
  const handleOpenSecurityModal = (client: any, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    setSelectedClientForSecurity(client);
    const existing = localSecurityNotes[client.id] || securityNotesByClient[client.id] || '';
    setSecurityNoteInput(existing);
    setSecurityModalOpen(true);
  };

  const handleSaveSecurityNote = async () => {
    if (!selectedClientForSecurity || !userProfile) return;
    setSavingSecurityNote(true);
    try {
      const adminId = isAdmin ? userProfile.uid : userProfile.adminId;
      const cid = selectedClientForSecurity.id;
      const trimmed = securityNoteInput.trim();

      // Atualização otimista imediata na UI
      setLocalSecurityNotes(prev => {
        const next = { ...prev };
        if (trimmed) next[cid] = trimmed;
        else delete next[cid];
        return next;
      });

      // Busca whatsapp_settings atual para atualizar com o mapa de avisos de clientes
      const { data: userRow } = await supabase
        .from('users')
        .select('whatsapp_settings')
        .eq('id', adminId)
        .single();

      const currentSettings = userRow?.whatsapp_settings || {};
      const existingNotes = currentSettings.client_security_notes || {};
      const updatedNotes = { ...existingNotes };
      if (trimmed) {
        updatedNotes[cid] = trimmed;
      } else {
        delete updatedNotes[cid];
      }

      const updatedSettings = {
        ...currentSettings,
        client_security_notes: updatedNotes
      };

      const { error } = await supabase
        .from('users')
        .update({ whatsapp_settings: updatedSettings })
        .eq('id', adminId);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['routeData'] });
      setSecurityModalOpen(false);
      setSelectedClientForSecurity(null);
    } catch (err: any) {
      console.error('Erro ao salvar aviso fixo:', err);
      alert('Erro ao salvar aviso de segurança: ' + (err.message || 'Erro inesperado'));
    } finally {
      setSavingSecurityNote(false);
    }
  };

  const handleDeleteSecurityNote = async () => {
    if (!selectedClientForSecurity || !userProfile) return;
    if (!confirm('Deseja realmente remover o aviso fixo de segurança deste imóvel?')) return;
    setSavingSecurityNote(true);
    try {
      const adminId = isAdmin ? userProfile.uid : userProfile.adminId;
      const cid = selectedClientForSecurity.id;

      setLocalSecurityNotes(prev => {
        const next = { ...prev };
        delete next[cid];
        return next;
      });

      const { data: userRow } = await supabase
        .from('users')
        .select('whatsapp_settings')
        .eq('id', adminId)
        .single();

      const currentSettings = userRow?.whatsapp_settings || {};
      const existingNotes = currentSettings.client_security_notes || {};
      const updatedNotes = { ...existingNotes };
      delete updatedNotes[cid];

      const updatedSettings = {
        ...currentSettings,
        client_security_notes: updatedNotes
      };

      await supabase
        .from('users')
        .update({ whatsapp_settings: updatedSettings })
        .eq('id', adminId);

      queryClient.invalidateQueries({ queryKey: ['routeData'] });
      setSecurityModalOpen(false);
      setSelectedClientForSecurity(null);
    } catch (err: any) {
      console.error('Erro ao excluir aviso:', err);
      alert('Erro ao excluir aviso.');
    } finally {
      setSavingSecurityNote(false);
    }
  };

  // Handlers para Repasse de Rota de Emergência (Hand-off entre Técnicos)
  const handleOpenHandoff = (preSelectedClientId?: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    if (routeClients.length === 0) {
      alert('Não há clientes carregados nesta rota para repassar.');
      return;
    }

    const availableTargets = employees.filter((emp: any) => emp.id !== selectedEmployee);
    if (availableTargets.length === 0) {
      alert('Não foram encontrados outros colaboradores/técnicos cadastrados no sistema para receber o repasse.');
      return;
    }

    if (!handoffTargetEmployee || handoffTargetEmployee === selectedEmployee) {
      setHandoffTargetEmployee(availableTargets[0].id);
    }

    if (preSelectedClientId) {
      setHandoffSelectedClientIds(new Set([preSelectedClientId]));
    } else {
      // Pré-seleciona todos os clientes da rota que ainda estão pendentes
      const pendingIds = routeClients
        .filter((c: any) => !completedVisitsOnRouteDate.has(c.id))
        .map((c: any) => c.id);
      setHandoffSelectedClientIds(new Set(pendingIds.length > 0 ? pendingIds : [routeClients[0].id]));
    }

    setHandoffReason('');
    setHandoffType('today_only');
    setHandoffModalOpen(true);
  };

  const executeHandoff = async () => {
    if (!handoffTargetEmployee) {
      alert('Por favor, selecione o técnico que receberá os atendimentos.');
      return;
    }
    if (handoffSelectedClientIds.size === 0) {
      alert('Selecione pelo menos um cliente para efetuar o repasse.');
      return;
    }

    const targetTech = employees.find((emp: any) => emp.id === handoffTargetEmployee);
    const targetName = targetTech?.name || 'o técnico selecionado';
    const isTodayOnly = handoffType === 'today_only';

    const promptText = `Confirma o repasse de ${handoffSelectedClientIds.size} cliente(s) para ${targetName}?\n` +
      (isTodayOnly 
        ? 'Modalidade: Emergencial (Transferência de rota imediata)' 
        : 'Modalidade: Definitiva (Troca permanente de carteira)');

    if (!confirm(promptText)) return;

    setIsExecutingHandoff(true);
    try {
      const selectedIds = Array.from(handoffSelectedClientIds);

      for (const cid of selectedIds) {
        const clientObj = routeClients.find((c: any) => c.id === cid);
        if (clientObj?.isOneOffJob) {
          await supabase
            .from('oneoffjobs')
            .update({
              employee_id: handoffTargetEmployee,
              updated_at: new Date().toISOString()
            })
            .eq('id', cid);
        } else {
          // Atualiza o colaborador responsável pelo cliente
          await supabase
            .from('clients')
            .update({
              employee_id: handoffTargetEmployee
            })
            .eq('id', cid);
        }
      }

      alert(`✅ Repasse efetuado com sucesso!\n${selectedIds.length} cliente(s) foram transferidos para a rota de ${targetName}.`);
      setHandoffModalOpen(false);
      setHandoffSelectedClientIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['routeData'] });
    } catch (err: any) {
      console.error('Erro no repasse de rota:', err);
      alert('Falha ao concluir repasse: ' + (err.message || 'Erro inesperado'));
    } finally {
      setIsExecutingHandoff(false);
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
    if (!selectedClientForReport || !userProfile) return;
    setConfirmSendReportPopupOpen(true);
  };

  const processReportSubmission = async (sendWhatsApp: boolean) => {
    setConfirmSendReportPopupOpen(false);
    if (!selectedClientForReport || !userProfile) return;
    
    // Captura o cliente em uma constante para evitar erros de referência nula
    const targetClient = { ...selectedClientForReport };
    setSubmittingReport(true);

    const handleWhatsApp = async () => {
      if (!sendWhatsApp) return;
      if (!targetClient.phone) {
        console.warn('Este cliente não possui um número de telefone cadastrado para o envio do WhatsApp.');
        return;
      }

      const clientName = targetClient.name || 'Cliente';
      const clientPhone = targetClient.phone;
      const cleanPhone = clientPhone.replace(/\D/g, '');
      if (!cleanPhone) return;

      try {
        const adminId = (isAdmin ? userProfile?.uid : userProfile?.adminId) 
          || targetClient.admin_id 
          || (userProfile?.role === 'admin' ? userProfile?.uid : '698dfcdd-7c91-4df5-aaee-eae9e67f15ae');
        
        // 1. Obter configurações de WhatsApp mais recentes do admin
        let currentSettings = (userProfile?.whatsappSettings as any) || {};
        try {
          if (adminId) {
            const { data: adminData } = await supabase
              .from('users')
              .select('whatsapp_settings')
              .eq('id', adminId)
              .maybeSingle();
            if (adminData?.whatsapp_settings) {
              currentSettings = { ...currentSettings, ...adminData.whatsapp_settings };
            }
          }
          if (!currentSettings.metaToken && !currentSettings.evolutionApiKey) {
            const { data: allAdmins } = await supabase
              .from('users')
              .select('whatsapp_settings')
              .not('whatsapp_settings', 'is', null);
            const foundAdmin = allAdmins?.find((u: any) => u.whatsapp_settings?.metaToken || u.whatsapp_settings?.evolutionApiKey);
            if (foundAdmin?.whatsapp_settings) {
              currentSettings = { ...currentSettings, ...foundAdmin.whatsapp_settings };
            }
          }
        } catch (e) {
          console.warn('Erro ao carregar whatsapp_settings atualizado:', e);
        }

        // 2. Verificar histórico recente (últimos 30 dias) para alternar entre mensagem 1 e 2
        let useMessage2 = false;
        try {
          if (navigator.onLine && targetClient.id) {
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            const { data: recentVisits } = await supabase.from('visits')
              .select('date')
              .eq('client_id', targetClient.id)
              .eq('admin_id', adminId)
              .gte('date', thirtyDaysAgo.toISOString())
              .limit(1);
            if (recentVisits && recentVisits.length > 0) {
              useMessage2 = true;
            }
          }
        } catch (e) {}

        const defaultReportMsg = `Olá, {Primeiro nome do cliente}! 😊 Passando para avisar que já estive aí e fiz a limpeza da sua piscina. 💦✨\nPara acompanhar o serviço executado acesse:\nwww.rspiscinas.app.br/client-panel\nLogin: {telefone de cadastro do cliente}\nSenha: {telefone de cadastro do cliente}`;
        const msg1 = currentSettings.reportMessage1 || defaultReportMsg;
        const msg2 = currentSettings.reportMessage2 || defaultReportMsg;

        // Busca o número real cadastrado na tabela 'users' para o login/senha do portal
        let userLoginPhone: string = targetClient.user_phone || targetClient.local_phone || '';
        try {
          if (targetClient.id) {
            const { data: userRow } = await supabase
              .from('users')
              .select('phone')
              .eq('client_id', targetClient.id)
              .maybeSingle();
            if (userRow?.phone) {
              userLoginPhone = userRow.phone;
            } else {
              const { data: userById } = await supabase
                .from('users')
                .select('phone')
                .eq('id', targetClient.id)
                .maybeSingle();
              if (userById?.phone) {
                userLoginPhone = userById.phone;
              }
            }
          }
        } catch (uErr) {
          console.warn('[WhatsApp Relatório] Erro ao buscar telefone em users:', uErr);
        }

        const rawTemplate = useMessage2 ? msg2 : msg1;
        const message = formatClientMessageTemplate(rawTemplate, {
          name: targetClient.name || 'Cliente',
          phone: cleanPhone || targetClient.phone || targetClient.local_phone || '',
          local_phone: targetClient.local_phone || '',
          user_phone: userLoginPhone,
          login_phone: userLoginPhone
        }, {
          techName: userProfile?.name || 'Técnico',
          companyName: currentSettings.companyName || userProfile?.whatsappSettings?.companyName || 'GestãoPro',
          portalUrl: 'www.rspiscinas.app.br/client-panel'
        });

        const reportMsgClientId = `visit_rep_${targetClient.id}_${Date.now()}`;
        const effectiveProvider = getEffectiveWhatsAppProvider(currentSettings);

        if (currentSettings.useSmsForReports) {
          await supabase.from('sms_queue').insert({
            admin_id: adminId,
            phone_number: cleanPhone,
            message: message
          });
          console.log('Mensagem de relatório adicionada à fila de SMS.');
        } else if (effectiveProvider === 'manual') {
          // Envio direto via WhatsApp Web / App no dispositivo
          openWhatsApp(cleanPhone || targetClient.phone || clientPhone, message);
        } else {
          // Envio via API (astracalls, meta, evolution)
          let sent = false;
          try {
            const sendUrl = getApiUrl('/api/chat/send');
            const apiRes = await fetch(sendUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                text: message,
                clientPhone: cleanPhone,
                clientId: targetClient.id,
                waSettings: currentSettings,
                senderName: userProfile?.name || 'Técnico',
                message_client_id: reportMsgClientId
              })
            });
            if (apiRes.ok) {
              const resData = await apiRes.json();
              if (resData.success) {
                sent = true;
                console.log('[WhatsApp Relatório] Enviado com sucesso via servidor:', resData);
              }
            }
          } catch (serverErr) {
            console.warn('[WhatsApp Relatório] Falha no backend, tentando fallback direto:', serverErr);
          }

          // Fallback: se o backend falhar, tenta envio direto pelo navegador
          if (!sent) {
            try {
              if (effectiveProvider === 'astracalls') {
                await sendAstraCallsMessage(cleanPhone, message, currentSettings, reportMsgClientId);
                sent = true;
              } else if (effectiveProvider === 'meta') {
                await sendMetaMessage(clientPhone, message, currentSettings, reportMsgClientId);
                sent = true;
              } else if (effectiveProvider === 'evolution') {
                await sendEvolutionMessage(clientPhone, message, currentSettings, reportMsgClientId);
                sent = true;
              }
            } catch (directErr) {
              console.error('[WhatsApp Relatório] Falha no envio direto pela API:', directErr);
            }
          }

          // Fallback final: se as APIs falharem, abre o WhatsApp no aparelho para garantir o envio
          if (!sent) {
            console.log('[WhatsApp Relatório] Acionando abertura no WhatsApp como fallback');
            openWhatsApp(cleanPhone || targetClient.phone || clientPhone, message);
          }
        }
      } catch (err: any) {
        console.error('Erro ao enviar mensagem via WhatsApp:', err);
      }
    };

    let locationData = cachedLocationRef.current || null;
    try {
      if (navigator.geolocation) {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { 
            enableHighAccuracy: true, 
            timeout: 2500, 
            maximumAge: 300000 // aceita localização recente de até 5 minutos
          });
        });
        if (pos && pos.coords) {
          locationData = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        }
      }
    } catch(err) {
      console.warn("Não foi possível obter a localização em tempo real, usando cache se houver", err);
    }

    try {
      const adminId = (isAdmin ? userProfile?.uid : userProfile?.adminId) 
        || targetClient.admin_id 
        || (userProfile?.role === 'admin' ? userProfile?.uid : '698dfcdd-7c91-4df5-aaee-eae9e67f15ae');
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
      
      
    // Fechamento Automático do Chat (Por Ação)
    try {
      const { error: chatUpdateErr } = await supabase.from('chat_sessions')
        .update({ 
          status: 'closed',
          closed_at: new Date().toISOString() 
        })
        .eq('client_id', targetClient.id)
        .eq('status', 'open');
      if (chatUpdateErr) console.error("Error updating chat session:", chatUpdateErr);
    } catch(e) {}

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
        clientId: targetClient.id,
        clientName: targetClient.name,
        techName: userProfile?.name || 'Colaborador',
        employeeId: (isAdmin || isManager) && selectedEmployee 
          ? selectedEmployee 
          : (userProfile?.uid || targetClient.employee_id || adminId || '698dfcdd-7c91-4df5-aaee-eae9e67f15ae'),
        date: finalVisitDate,
        time: activeRouteDate,
        notes: finalNotes,
        photoUrls: reportPhotos,
        location: locationData,
        isOneOffJob: targetClient.isOneOffJob,
        needsReturn,
        returnDate
      };
      
      const handleSaveOffline = () => {
         const offlineVisits = JSON.parse(localStorage.getItem('offlineVisits') || '[]');
         offlineVisits.push(payload);
         localStorage.setItem('offlineVisits', JSON.stringify(offlineVisits));
         alert("Você está offline ou ocorreu um erro de conexão. A visita foi salva localmente e será sincronizada automaticamente.");
      };

      let savedToDb = false;
      let recordedVisitId: string | null = null;

      if (!navigator.onLine) {
         handleSaveOffline();
      } else {
        try {
          if (targetClient.isOneOffJob) {
            // Avulso Update
            const { error: oneOffError } = await supabase.from('oneoffjobs').update({
              status: needsReturn ? 'em_andamento' : 'concluido',
              return_date: needsReturn ? returnDate : null,
              report: finalNotes,
              updated_at: finalVisitDate
            }).eq('id', targetClient.id);
            if (oneOffError) throw oneOffError;
            savedToDb = true;
            recordedVisitId = targetClient.id;
            
            if (!needsReturn) {
              try {
                await fetch(getApiUrl('/api/chat/close'), {
                   method: 'POST',
                   headers: { 'Content-Type': 'application/json' },
                   body: JSON.stringify({ clientId: targetClient.id })
                });
              } catch(e) { console.error(e); }
            }
          } else {
            // Normal Client Visit
            const { data: existingAgendada } = await supabase.from('visits')
              .select('id')
              .eq('client_id', targetClient.id)
              .eq('date', routeDate)
              .limit(1);

            recordedVisitId = existingAgendada?.[0]?.id || null;
            if (existingAgendada && existingAgendada.length > 0) {
              const { error: updateErr } = await supabase.from('visits').update({
                admin_id: adminId,
                client_id: targetClient.id,
                employee_id: payload.employeeId,
                date: finalVisitDate,
                time: activeRouteDate,
                notes: finalNotes,
                photo_urls: reportPhotos,
                location: locationData,
                status: 'realizada'
              }).eq('id', existingAgendada[0].id);
              if (updateErr) throw updateErr;
              savedToDb = true;
            } else {
              const { data: insertedList, error: insertErr } = await supabase.from('visits').insert({
                admin_id: adminId,
                client_id: targetClient.id,
                employee_id: payload.employeeId,
                date: finalVisitDate,
                time: activeRouteDate,
                notes: finalNotes,
                photo_urls: reportPhotos,
                location: locationData,
                status: 'realizada'
              }).select('id');
              if (insertErr) throw insertErr;
              savedToDb = true;
              if (insertedList && insertedList.length > 0) recordedVisitId = insertedList[0].id;
            }
            
            if (!needsReturn) {
              try {
                await fetch(getApiUrl('/api/chat/close'), {
                   method: 'POST',
                   headers: { 'Content-Type': 'application/json' },
                   body: JSON.stringify({ clientId: targetClient.id })
                });
              } catch(e) {}
            }

            // Check if this visit was rescheduled from another date
            try {
              const extraVisitsRaw = targetClient.extra_visits || [];
              const targetStr = activeRouteDate + ':from:';
              const rescheduleEntry = extraVisitsRaw.find((v: string) => typeof v === 'string' && v.startsWith(targetStr));
              if (rescheduleEntry) {
                 const originalDate = rescheduleEntry.split(':from:')[1];
                 if (originalDate) {
                   await supabase.from('visits').insert({
                     admin_id: adminId,
                     client_id: targetClient.id,
                     employee_id: payload.employeeId,
                     date: finalVisitDate,
                     time: originalDate,
                     notes: `[SERVIÇO REALIZADO NO DIA ${activeRouteDate.split('-').reverse().join('/')}]\n\n` + finalNotes,
                     photo_urls: reportPhotos,
                     location: locationData,
                     status: 'realizada'
                   });
                   
                   const newExtraVisits = extraVisitsRaw.filter((v: string) => v !== rescheduleEntry);
                   await supabase.from('clients').update({ extra_visits: newExtraVisits }).eq('id', targetClient.id);
                 }
              }
            } catch(e) {
               console.error("Error saving ghost visit", e);
            }

            // Update client with lastVisitDate
            try {
              await supabase.from('clients').update({
                last_visit_date: finalVisitDate
              }).eq('id', targetClient.id);
            } catch (e) {}

            // Cleanup old visits (keep only the 3 most recent)
            try {
              const { data: visitsData } = await supabase.from('visits')
                .select('id, date')
                .eq('client_id', targetClient.id)
                .eq('admin_id', adminId)
                .order('date', { ascending: false });
              
              if (visitsData && visitsData.length > 3) {
                const toDelete = visitsData.slice(3).map(v => v.id);
                for (const id of toDelete) {
                   try {
                     await supabase.from('chat_sessions').update({ visit_id: null }).eq('visit_id', id);
                     await supabase.from('visits').delete().eq('id', id);
                   } catch (delErr) {}
                }
              }
            } catch (cleanupErr) {}
          }

          // Trigger Push Notification alert to administrator
          if (adminId && savedToDb) {
            notifyAdminAttendanceFinished({
              adminId,
              employeeId: payload.employeeId || userProfile?.uid,
              clientId: targetClient.id,
              clientName: targetClient.name,
              techName: userProfile?.name || 'Colaborador',
              visitId: recordedVisitId || targetClient.id,
              type: targetClient.isOneOffJob ? 'job' : 'visit',
              notes: reportNotes
            }).catch(e => console.warn('[Push] Error triggering admin push notification:', e));
          }

          // Dispara envio do WhatsApp em segundo plano APÓS a visita estar salva e o push ter sido despachado
          handleWhatsApp();
        } catch (dbError) {
          console.error("Database error in processReportSubmission:", dbError);
          if (!savedToDb) {
            handleSaveOffline();
          }
        }
      }

      // Update local state to mark as completed
      
      queryClient.setQueryData(['routeData', routeDate, selectedEmployee, selectedDay, userProfile?.uid, generated], (old: any) => {
        if (!old) return old;
        const nextSet = new Set(old.completed);
        nextSet.add(targetClient.id);
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
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-3">
        <h1 className="text-2xl font-bold text-gray-800">Gerar Rotas e Atendimentos</h1>
        <button
          onClick={async () => {
            setGenerated(true);
            await queryClient.invalidateQueries({ queryKey: ['routeData'] });
            await refetch();
          }}
          disabled={isFetching}
          className="flex items-center justify-center bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 active:bg-gray-100 transition-all shadow-sm font-medium text-sm shrink-0 disabled:opacity-60"
          title="Atualizar rota e visitas agora"
        >
          <RefreshCw size={17} className={`mr-2 text-primary ${isFetching ? 'animate-spin' : ''}`} />
          {isFetching ? 'Atualizando Rota...' : 'Atualizar Rota'}
        </button>
      </div>

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
              <div className="flex items-center space-x-2.5">
                <h2 className="text-lg font-bold text-gray-800">Resultado da Rota</h2>
                <span className="inline-flex items-center text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 mr-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                  Tempo Real
                </span>
                <button
                  onClick={() => refetch()}
                  title="Atualizar agora"
                  className="p-1 text-gray-400 hover:text-blue-600 hover:bg-gray-100 rounded-md transition-colors"
                >
                  <RefreshCw size={14} className={isFetching ? "animate-spin text-blue-600" : ""} />
                </button>
              </div>
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
              {routeClients.length > 0 && !isOrderingMode && (
                <button
                  type="button"
                  onClick={() => handleOpenHandoff()}
                  className="flex items-center bg-indigo-600 text-white px-3.5 py-2 rounded-lg hover:bg-indigo-700 transition-colors shadow-xs"
                  title="Repassar clientes da rota em caso de imprevisto ou emergência"
                >
                  <ArrowRightLeft size={18} className="md:mr-2" />
                  <span className="hidden md:inline font-medium">Repasse de Rota</span>
                </button>
              )}
            </div>
          </div>

          {/* Filtros Rápidos por Abas: [Todas] | [A Fazer] | [Concluídas] */}
          {!isOrderingMode && routeClients.length > 0 && (
            <div className="flex items-center gap-1.5 p-1 bg-gray-100/90 rounded-xl mb-4 border border-gray-200/80 max-w-md shadow-xs">
              <button
                type="button"
                onClick={() => setRouteFilterTab('todas')}
                className={`flex-1 py-2 px-3 text-xs md:text-sm font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                  routeFilterTab === 'todas'
                    ? 'bg-white text-gray-900 shadow-xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <span>Todas</span>
                <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-md ${
                  routeFilterTab === 'todas' ? 'bg-gray-100 text-gray-800' : 'bg-gray-200/70 text-gray-600'
                }`}>
                  {routeClients.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setRouteFilterTab('a_fazer')}
                className={`flex-1 py-2 px-3 text-xs md:text-sm font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                  routeFilterTab === 'a_fazer'
                    ? 'bg-white text-amber-700 shadow-xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <span>A Fazer</span>
                <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-md ${
                  routeFilterTab === 'a_fazer' ? 'bg-amber-100 text-amber-800' : 'bg-gray-200/70 text-gray-600'
                }`}>
                  {routeClients.length - routeClients.filter(c => completedVisitsOnRouteDate.has(c.id)).length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setRouteFilterTab('concluidas')}
                className={`flex-1 py-2 px-3 text-xs md:text-sm font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                  routeFilterTab === 'concluidas'
                    ? 'bg-white text-emerald-700 shadow-xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <span>Concluídas</span>
                <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-md ${
                  routeFilterTab === 'concluidas' ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-200/70 text-gray-600'
                }`}>
                  {routeClients.filter(c => completedVisitsOnRouteDate.has(c.id)).length}
                </span>
              </button>
            </div>
          )}

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
              {(() => {
                const filteredRouteClients = routeClients.filter((client) => {
                  const isCompleted = completedVisitsOnRouteDate.has(client.id);
                  if (routeFilterTab === 'a_fazer' && isCompleted) return false;
                  if (routeFilterTab === 'concluidas' && !isCompleted) return false;
                  if (searchTerm) {
                    const q = searchTerm.toLowerCase();
                    const matchName = client.name?.toLowerCase().includes(q);
                    const matchAddress = client.address?.toLowerCase().includes(q);
                    if (!matchName && !matchAddress) return false;
                  }
                  return true;
                });

                if (filteredRouteClients.length === 0) {
                  return (
                    <div className="text-center py-10 px-4 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                      <p className="text-gray-500 font-medium">
                        {routeFilterTab === 'a_fazer'
                          ? '🎉 Excelente trabalho! Todas as visitas desta rota foram concluídas.'
                          : routeFilterTab === 'concluidas'
                            ? 'Nenhuma visita concluída ainda nesta rota.'
                            : 'Nenhum cliente encontrado para os termos da busca.'}
                      </p>
                    </div>
                  );
                }

                return filteredRouteClients.map((client, index) => {
                  const isCompleted = completedVisitsOnRouteDate.has(client.id);
                  const isFutureRoute = routeDate > getLocalISODate();
                  const isSelectedForAnticipation = selectedForAnticipation.has(client.id);
                  const secNotice = localSecurityNotes[client.id] || securityNotesByClient[client.id];
                  const lastVisit = lastVisitByClient[client.id];
                  
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
                          ? 'border-green-200 bg-green-50/70 cursor-default' 
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
                              className="text-primary font-bold"
                            >
                              {index + 1}
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </motion.div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start gap-2">
                          <div className="flex items-center space-x-2 flex-wrap">
                            <h3 className={`font-semibold text-lg ${isCompleted ? 'text-green-800 line-through opacity-70' : 'text-gray-800'}`}>
                              {client.name}
                            </h3>

                            {/* Botão de Ligação */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                startCall({
                                  clientId: client.id,
                                  clientPhone: client.phone,
                                  clientName: client.name,
                                  avatarUrl: client.photo_url || client.avatar_url,
                                });
                              }}
                              className="p-1 text-emerald-600 hover:bg-emerald-100 rounded-md transition-colors"
                              title="Ligar para o cliente"
                            >
                              <Phone size={20} />
                            </button>

                            {/* Botão Abrir no Maps */}
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
                            
                            {/* Botão Estou a caminho / Chat */}
                            {(() => {
                              const chatStatus = chatStatusByClient[client.id];
                              const isChatInactive = isCompleted || (!isAdmin && !isManager && chatStatus?.isExpiredOrClosed && !chatStatus?.isActive);
                              const unread = isChatInactive ? 0 : (unreadCounts[client.id] || 0);

                              return (
                                <button
                                  onClick={(e) => {
                                    if (isChatInactive) {
                                      e.stopPropagation();
                                      e.preventDefault();
                                      if (isCompleted) {
                                        alert('A visita já foi finalizada. O chat está inativo para este cliente.');
                                      } else {
                                        alert('O limite diário de 30 minutos já foi atingido para este cliente. O chat está inativo e poderá ser reaberto amanhã às 00:00.');
                                      }
                                      return;
                                    }
                                    handleOpenChat(client, isCompleted, e);
                                  }}
                                  disabled={isChatInactive}
                                  className={`relative p-1 rounded-md transition-colors ${
                                    isChatInactive
                                      ? 'text-gray-300 bg-gray-50 cursor-not-allowed opacity-50'
                                      : unread > 0
                                        ? 'text-green-600 bg-green-100 hover:bg-green-200 cursor-pointer'
                                        : chatStatus?.isActive
                                          ? 'text-blue-700 bg-blue-100 hover:bg-blue-200 ring-2 ring-blue-400 cursor-pointer'
                                          : 'text-blue-600 hover:bg-blue-100 cursor-pointer'
                                  }`}
                                  title={
                                    isCompleted
                                      ? 'Atendimento finalizado - Chat inativo'
                                      : chatStatus?.isActive
                                        ? 'Chat em andamento (Iniciado) - Clique para abrir'
                                        : chatStatus?.isExpiredOrClosed
                                          ? 'Limite de 30 min atingido - Chat inativo até as 00:00'
                                          : 'Iniciar chat (30 min)'
                                  }
                                >
                                  <MessageCircle size={20} />
                                  {unread > 0 && !isChatInactive ? (
                                    <span className="absolute -top-2 -right-2 flex h-4 w-4 items-center justify-center rounded-full bg-green-500 text-[9px] font-bold text-white shadow-sm ring-1 ring-white">
                                      {unread > 9 ? '9+' : unread}
                                    </span>
                                  ) : chatStatus?.isActive && !isChatInactive ? (
                                    <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white animate-pulse" title="Chat em andamento" />
                                  ) : null}
                                </button>
                              );
                            })()}

                            {/* Botão Repasse de Emergência (Hand-off) */}
                            <button
                              type="button"
                              onClick={(e) => handleOpenHandoff(client.id, e)}
                              className="p-1 text-indigo-600 hover:bg-indigo-100 rounded-md transition-colors"
                              title="Repassar este cliente para outro técnico (Hand-off)"
                            >
                              <ArrowRightLeft size={20} />
                            </button>
                          </div>
                          {isCompleted && (
                            <motion.span 
                              initial={{ opacity: 0, scale: 0.8 }}
                              animate={{ opacity: 1, scale: 1 }}
                              className="text-xs font-bold bg-green-200 text-green-800 px-2 py-1 rounded-full shrink-0"
                            >
                              Concluído
                            </motion.span>
                          )}
                        </div>

                        {/* Card de Avisos Fixos e Segurança do Imóvel */}
                        {(() => {
                          if (secNotice) {
                            return (
                              <div 
                                onClick={(e) => handleOpenSecurityModal(client, e)}
                                className="mt-2.5 mb-2 bg-amber-50 border border-amber-200/90 text-amber-950 rounded-lg p-2.5 flex items-start justify-between text-xs cursor-pointer hover:bg-amber-100/70 transition-colors shadow-xs"
                                title="Clique para editar aviso de segurança do imóvel"
                              >
                                <div className="flex items-start gap-2 pr-2">
                                  <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" />
                                  <div className="space-y-0.5">
                                    <span className="font-bold text-amber-950 uppercase tracking-wider text-[10px] block">
                                      Aviso Fixo &amp; Segurança do Imóvel
                                    </span>
                                    <p className="text-amber-900 leading-snug font-medium whitespace-pre-wrap">
                                      {secNotice}
                                    </p>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={(e) => handleOpenSecurityModal(client, e)}
                                  className="text-amber-700 hover:text-amber-950 hover:bg-amber-200/60 p-1 rounded transition-colors shrink-0"
                                  title="Editar aviso"
                                >
                                  <Edit2 size={13} />
                                </button>
                              </div>
                            );
                          }
                          return (
                            <div className="mt-1.5 mb-1">
                              <button
                                type="button"
                                onClick={(e) => handleOpenSecurityModal(client, e)}
                                className="inline-flex items-center gap-1.5 text-[11px] font-medium text-gray-500 hover:text-amber-800 hover:bg-amber-50 px-2 py-0.5 rounded border border-dashed border-gray-300 hover:border-amber-300 transition-colors"
                                title="Adicionar aviso crítico do imóvel (cão bravo, chave, disjuntor)"
                              >
                                <ShieldAlert size={12} className="text-amber-500 shrink-0" />
                                <span>+ Aviso Fixo do Imóvel</span>
                              </button>
                            </div>
                          );
                        })()}

                        <p className={`mt-1 flex items-start text-sm ${isCompleted ? 'text-green-600/70' : 'text-gray-600'}`}>
                          <Map size={16} className="mr-1 mt-0.5 shrink-0" />
                          <span className="truncate">{client.address}</span>
                        </p>
                        {client.phone && (isAdmin || isManager) && (
                          <p className={`text-sm mt-0.5 ${isCompleted ? 'text-green-600/70' : 'text-gray-500'}`}>
                            Tel: {client.phone}
                          </p>
                        )}

                        {/* Mini Histórico da Última Visita no Card */}
                        {lastVisit && (
                          <div className="mt-2 text-xs text-gray-700 flex items-start gap-1.5 bg-gray-50/95 p-2 rounded-lg border border-gray-200/80 leading-relaxed shadow-2xs">
                            <Clock size={14} className="text-gray-400 shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                              <span className="font-semibold text-gray-900">
                                Última visita ({lastVisit.dateFormatted}{lastVisit.techName ? ` por ${lastVisit.techName}` : ''}):
                              </span>{' '}
                              <span className="text-gray-700">{lastVisit.summary}</span>
                            </div>
                          </div>
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
                });
              })()}
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
                    <input 
                      type="text" 
                      inputMode="decimal"
                      pattern="[0-9]*[.,]?[0-9]*"
                      autoComplete="off"
                      placeholder="Ex: 2.0" 
                      value={parameters.cloro} 
                      onChange={e => handleNumericParamChange('cloro', e.target.value)}
                      onKeyDown={handleNumericKeyDown}
                      className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:ring-primary focus:border-primary outline-none bg-white font-mono" 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">pH</label>
                    <input 
                      type="text" 
                      inputMode="decimal"
                      pattern="[0-9]*[.,]?[0-9]*"
                      autoComplete="off"
                      placeholder="Ex: 7.2" 
                      value={parameters.ph} 
                      onChange={e => handleNumericParamChange('ph', e.target.value)}
                      onKeyDown={handleNumericKeyDown}
                      className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:ring-primary focus:border-primary outline-none bg-white font-mono" 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Alcalinidade</label>
                    <input 
                      type="text" 
                      inputMode="decimal"
                      pattern="[0-9]*[.,]?[0-9]*"
                      autoComplete="off"
                      placeholder="Ex: 100" 
                      value={parameters.alcalinidade} 
                      onChange={e => handleNumericParamChange('alcalinidade', e.target.value)}
                      onKeyDown={handleNumericKeyDown}
                      className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:ring-primary focus:border-primary outline-none bg-white font-mono" 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Ácido Cianúrico</label>
                    <input 
                      type="text" 
                      inputMode="decimal"
                      pattern="[0-9]*[.,]?[0-9]*"
                      autoComplete="off"
                      placeholder="Ex: 40" 
                      value={parameters.acidoCianurico} 
                      onChange={e => handleNumericParamChange('acidoCianurico', e.target.value)}
                      onKeyDown={handleNumericKeyDown}
                      className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:ring-primary focus:border-primary outline-none bg-white font-mono" 
                    />
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Observações da Visita</label>
                <textarea
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
                  disabled={submittingReport || !(checklist.peneirar || checklist.escovar || checklist.aspirar || checklist.lavarFiltro || checklist.lavarCapa || checklist.limparBordas || checklist.decantar || checklist.motorLigado || checklist.ausente)}
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

      {/* Modal de Avisos Fixos e Segurança do Imóvel */}
      {securityModalOpen && selectedClientForSecurity && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-gray-100 flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-start mb-4">
              <div>
                <div className="flex items-center gap-2 text-amber-700">
                  <ShieldAlert size={20} className="text-amber-600" />
                  <h3 className="text-lg font-bold text-gray-900">Avisos Fixos &amp; Segurança do Imóvel</h3>
                </div>
                <p className="text-sm font-semibold text-gray-700 mt-1">{selectedClientForSecurity.name}</p>
                <p className="text-xs text-gray-500">{selectedClientForSecurity.address}</p>
              </div>
              <button
                type="button"
                onClick={() => { setSecurityModalOpen(false); setSelectedClientForSecurity(null); }}
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-gray-600 mb-3 bg-amber-50/70 p-2.5 rounded-lg border border-amber-200/60 leading-relaxed">
              Informações críticas da residência (cão bravo, chaves, disjuntores, portões) que ficarão sempre visíveis no topo do card desta rota para todos os técnicos.
            </p>

            <div className="mb-3">
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                Inserir Sugestão Rápida:
              </label>
              <div className="flex flex-wrap gap-1.5">
                {[
                  '⚠️ Cão bravo no corredor dos fundos',
                  '🔑 Chave da casa de máquinas escondida no vaso',
                  '⚡ Disjuntor da bomba desarma se ligar junto com o aquecedor',
                  '🐕 Manter portão sempre trancado (cães soltos)',
                  '💧 Registro geral da piscina atrás da cascata',
                  '🚪 Tocar campainha e aguardar abertura do portão'
                ].map((sug, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      setSecurityNoteInput(prev => {
                        const trimmed = prev.trim();
                        if (!trimmed) return sug;
                        if (trimmed.includes(sug)) return trimmed;
                        return `${trimmed}\n${sug}`;
                      });
                    }}
                    className="text-[11px] bg-gray-100 hover:bg-amber-100/70 text-gray-700 hover:text-amber-900 px-2 py-1 rounded-md border border-gray-200 hover:border-amber-300 transition-colors cursor-pointer text-left font-medium"
                  >
                    {sug}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-4 flex-1">
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Aviso de Segurança:
              </label>
              <textarea
                rows={4}
                value={securityNoteInput}
                onChange={(e) => setSecurityNoteInput(e.target.value)}
                placeholder="Ex: ⚠️ Cão bravo no quintal. Chave da casa de máquinas fica no vaso azul ao lado da ducha..."
                className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none resize-none shadow-xs"
              />
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-gray-100">
              <div>
                {(localSecurityNotes[selectedClientForSecurity.id] || securityNotesByClient[selectedClientForSecurity.id]) && (
                  <button
                    type="button"
                    onClick={handleDeleteSecurityNote}
                    disabled={savingSecurityNote}
                    className="flex items-center text-xs font-semibold text-red-600 hover:text-red-800 hover:bg-red-50 px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    <Trash2 size={14} className="mr-1" />
                    Excluir Aviso
                  </button>
                )}
              </div>
              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={() => { setSecurityModalOpen(false); setSelectedClientForSecurity(null); }}
                  disabled={savingSecurityNote}
                  className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl transition-colors font-medium cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveSecurityNote}
                  disabled={savingSecurityNote}
                  className="flex items-center px-5 py-2 text-sm bg-amber-600 hover:bg-amber-700 text-white rounded-xl shadow-xs transition-colors font-semibold disabled:opacity-50 cursor-pointer"
                >
                  <Save size={15} className="mr-1.5" />
                  {savingSecurityNote ? 'Salvando...' : 'Salvar Aviso'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Repasse de Rota de Emergência (Hand-off entre Técnicos) */}
      {handoffModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-gray-100 flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-start mb-4">
              <div>
                <div className="flex items-center gap-2 text-indigo-700">
                  <ArrowRightLeft size={20} className="text-indigo-600" />
                  <h3 className="text-lg font-bold text-gray-900">Repasse de Rota de Emergência (Hand-off)</h3>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Transfira atendimentos para outro colaborador em caso de quebra de veículo, chuva ou sobrecarga.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setHandoffModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 overflow-y-auto pr-1 flex-1">
              {/* Seleção do Técnico de Destino */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                  1. Colaborador que Receberá o Atendimento:
                </label>
                <select
                  value={handoffTargetEmployee}
                  onChange={(e) => setHandoffTargetEmployee(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white font-medium shadow-xs"
                >
                  <option value="">Selecione o técnico de destino...</option>
                  {employees
                    .filter((emp: any) => emp.id !== selectedEmployee)
                    .map((emp: any) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name} ({emp.role === 'manager' ? 'Gerente' : 'Técnico'})
                      </option>
                    ))}
                </select>
              </div>

              {/* Modalidade do Repasse */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                  2. Tipo de Transferência:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setHandoffType('today_only')}
                    className={`p-3 text-left rounded-xl border text-xs transition-all cursor-pointer ${
                      handoffType === 'today_only'
                        ? 'border-indigo-600 bg-indigo-50/70 text-indigo-950 ring-2 ring-indigo-500/30 font-semibold'
                        : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                    }`}
                  >
                    <span className="font-bold block text-sm mb-0.5">🚨 Emergencial (Hoje)</span>
                    <span className="text-gray-500">Transfere apenas para a rota de hoje para concluir o serviço.</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setHandoffType('definitive')}
                    className={`p-3 text-left rounded-xl border text-xs transition-all cursor-pointer ${
                      handoffType === 'definitive'
                        ? 'border-indigo-600 bg-indigo-50/70 text-indigo-950 ring-2 ring-indigo-500/30 font-semibold'
                        : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                    }`}
                  >
                    <span className="font-bold block text-sm mb-0.5">🔄 Definitivo</span>
                    <span className="text-gray-500">Muda o responsável pela carteira fixa do cliente.</span>
                  </button>
                </div>
              </div>

              {/* Seleção dos Clientes para Transferência */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    3. Clientes a Repassar ({handoffSelectedClientIds.size} selecionado{handoffSelectedClientIds.size !== 1 ? 's' : ''}):
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const pendingIds = routeClients
                          .filter((c: any) => !completedVisitsOnRouteDate.has(c.id))
                          .map((c: any) => c.id);
                        setHandoffSelectedClientIds(new Set(pendingIds));
                      }}
                      className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                    >
                      Selecionar Pendentes
                    </button>
                    <span className="text-gray-300">|</span>
                    <button
                      type="button"
                      onClick={() => setHandoffSelectedClientIds(new Set())}
                      className="text-[11px] font-semibold text-gray-500 hover:text-gray-700 cursor-pointer"
                    >
                      Limpar
                    </button>
                  </div>
                </div>

                <div className="max-h-48 overflow-y-auto space-y-1.5 border border-gray-200 rounded-xl p-2 bg-gray-50/50">
                  {routeClients.map((client: any) => {
                    const isCompleted = completedVisitsOnRouteDate.has(client.id);
                    const isChecked = handoffSelectedClientIds.has(client.id);
                    return (
                      <label
                        key={client.id}
                        className={`flex items-start p-2 rounded-lg cursor-pointer transition-colors text-xs ${
                          isChecked ? 'bg-indigo-50/80 border border-indigo-200' : 'bg-white border border-gray-200 hover:bg-gray-100/60'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            const newSet = new Set(handoffSelectedClientIds);
                            if (e.target.checked) newSet.add(client.id);
                            else newSet.delete(client.id);
                            setHandoffSelectedClientIds(newSet);
                          }}
                          className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 mr-2.5 cursor-pointer shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-gray-800 truncate">{client.name}</span>
                            {isCompleted ? (
                              <span className="text-[10px] font-bold text-green-700 bg-green-100 px-1.5 py-0.2 rounded">
                                Concluído
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.2 rounded">
                                Pendente
                              </span>
                            )}
                          </div>
                          <span className="text-gray-500 truncate block text-[11px]">{client.address}</span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Motivo do Repasse (opcional) */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                  4. Motivo / Justificativa (Opcional):
                </label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {['🏍️ Moto com defeito', '🌧️ Chuva forte', '⏱️ Atraso no cronograma', '🤒 Mal-estar', '🤝 Ajuda mútua'].map((chip, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setHandoffReason(chip)}
                      className={`text-[11px] px-2 py-0.5 rounded-md border transition-colors cursor-pointer ${
                        handoffReason === chip ? 'bg-indigo-100 text-indigo-800 border-indigo-300 font-semibold' : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200'
                      }`}
                    >
                      {chip}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={handoffReason}
                  onChange={(e) => setHandoffReason(e.target.value)}
                  placeholder="Ex: Pneu furado na rota central, necessita suporte..."
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-4 border-t border-gray-100 mt-2">
              <button
                type="button"
                onClick={() => setHandoffModalOpen(false)}
                disabled={isExecutingHandoff}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl transition-colors font-medium cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={executeHandoff}
                disabled={isExecutingHandoff || handoffSelectedClientIds.size === 0 || !handoffTargetEmployee}
                className="flex items-center px-5 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-xs transition-colors font-semibold disabled:opacity-50 cursor-pointer"
              >
                <ArrowRightLeft size={16} className="mr-1.5" />
                {isExecutingHandoff
                  ? 'Transferindo...'
                  : `Confirmar Repasse (${handoffSelectedClientIds.size})`}
              </button>
            </div>
          </div>
        </div>
      )}

      <ChatModal 
        isOpen={chatModalOpen} 
        onClose={() => setChatModalOpen(false)} 
        visit={activeChatVisit} 
        client={activeChatClient} 
        waSettings={(userProfile?.whatsappSettings as any)}
      />
    </div>
  );
}
