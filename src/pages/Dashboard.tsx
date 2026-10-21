import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { useRealtimeUpdates } from '../hooks/useRealtimeUpdates';
import { 
  Users, DollarSign, AlertCircle, CheckCircle, Clock, CreditCard, 
  MessageCircle, Eye, EyeOff, RefreshCw, Send, Calendar, TrendingUp, 
  ShieldCheck, ArrowRight, Check, Sparkles, AlertTriangle,
  CloudSun, CloudRain, Sun, CloudLightning, Wind, Droplets, Percent, ChevronLeft, ChevronRight, X, ArrowUpRight, Award, FileCheck,
  Crown, Gem, Gift, Star, RotateCcw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  openWhatsApp, 
  sendMetaMessage, 
  sendEvolutionMessage, 
  sendAstraCallsMessage, 
  getEffectiveWhatsAppProvider,
  resolveAdminWhatsAppSettings,
  formatWhatsAppNumber
} from '../lib/whatsapp';
import { formatClientMessageTemplate } from '../lib/messageTemplates';
import { fetchWeatherData, WeatherData } from '../lib/weatherService';
import { evaluateClientContract, loadContractsMetadata, saveContractAdjustment, keepContractPrice, ClientContractInfo } from '../lib/contractUtils';

interface DashboardStats {
  totalClients: number;
  inactiveClients: number;
  totalToReceive: number;
  delayedClients: number;
  delayedTotalAmount: number;
  receivedThisMonth: number;
  receivedToday: number;
  pendingThisMonth: number;
  totalActiveContracts: number;
  ticketMedio: number;
  taxaRecebimento: number;
}

interface UpcomingClient {
  id: string;
  name: string;
  phone: string;
  monthlyPrice: number;
  extraAmount?: number;
  extraReason?: string;
  dueDate: string;
  diffDays: number;
  rawClient?: any;
}

export interface VipClientInfo {
  id: string;
  name: string;
  phone: string;
  monthlyFee: number;
  monthsActive: number;
  yearsActive: number;
  startDateFormatted: string;
  totalPaymentsCount: number;
  totalPaidAmount: number;
  isCurrentlyDelayed: boolean;
  vipScore: number;
  tier: 'diamond' | 'gold' | 'silver';
  tierLabel: string;
  tierBadgeColor: string;
  loyaltyBenefitSuggested: string;
  rawClient: any;
}

export default function Dashboard() {
  const { userProfile } = useAuth();
  const navigate = useNavigate();

  const [stats, setStats] = useState<DashboardStats>({
    totalClients: 0,
    inactiveClients: 0,
    totalToReceive: 0,
    delayedClients: 0,
    delayedTotalAmount: 0,
    receivedThisMonth: 0,
    receivedToday: 0,
    pendingThisMonth: 0,
    totalActiveContracts: 0,
    ticketMedio: 0,
    taxaRecebimento: 0,
  });

  const [upcomingClients3to5, setUpcomingClients3to5] = useState<UpcomingClient[]>([]);
  const [upcomingClientsNext7, setUpcomingClientsNext7] = useState<UpcomingClient[]>([]);
  const [upcomingTab, setUpcomingTab] = useState<'3to5' | '7days'>('3to5');

  const [clientsWithoutVisits, setClientsWithoutVisits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  // Privacy toggle (show/hide financial values)
  const [showValues, setShowValues] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('gestaopro_dashboard_show_values');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });

  const toggleShowValues = () => {
    setShowValues(prev => {
      const next = !prev;
      try {
        localStorage.setItem('gestaopro_dashboard_show_values', String(next));
      } catch {}
      return next;
    });
  };

  // Sent reminders tracking (persisted to localStorage)
  const [sentReminders, setSentReminders] = useState<Record<string, string>>(() => {
    try {
      const stored = localStorage.getItem('gestaopro_billed_clients');
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  const [sendingReminderId, setSendingReminderId] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<{ text: string; isError?: boolean } | null>(null);

  // Weather & Storm Alert State
  const [weatherData, setWeatherData] = useState<WeatherData | null>(null);
  const [weatherLoading, setWeatherLoading] = useState<boolean>(false);

  // Contract Management & Annual Readjustment State
  const [contractClients, setContractClients] = useState<ClientContractInfo[]>([]);
  const [eligibleContractClients, setEligibleContractClients] = useState<ClientContractInfo[]>([]);
  const [selectedContractClient, setSelectedContractClient] = useState<ClientContractInfo | null>(null);
  const [adjustmentPercent, setAdjustmentPercent] = useState<number>(8);
  const [increaseAmountInput, setIncreaseAmountInput] = useState<string>('20.00'); // Valor de aumento manual (ex: R$ 20,00)
  const [customPriceInput, setCustomPriceInput] = useState<string>('');
  const [contractMessagePreview, setContractMessagePreview] = useState<string>('');
  const [sendContractWhatsapp, setSendContractWhatsapp] = useState<boolean>(true);
  const [isApplyingAdjustment, setIsApplyingAdjustment] = useState<boolean>(false);
  const [contractModalOpen, setContractModalOpen] = useState<boolean>(false);

  // VIP Clients & Loyalty Program State
  const [vipClients, setVipClients] = useState<VipClientInfo[]>([]);
  const [vipTierFilter, setVipTierFilter] = useState<'all' | 'diamond' | 'gold' | 'silver'>('all');
  const [selectedVipClient, setSelectedVipClient] = useState<VipClientInfo | null>(null);
  const [vipBenefitType, setVipBenefitType] = useState<'discount_percent' | 'discount_fixed' | 'service_gift'>('discount_percent');
  const [vipDiscountPercent, setVipDiscountPercent] = useState<number>(10);
  const [vipDiscountFixed, setVipDiscountFixed] = useState<number>(30);
  const [vipServiceGiftName, setVipServiceGiftName] = useState<string>('Cristalização Total da Piscina de Cortesia');
  const [applyDiscountToClientFee, setApplyDiscountToClientFee] = useState<boolean>(true);
  const [sendVipWhatsapp, setSendVipWhatsapp] = useState<boolean>(true);
  const [isApplyingVipBenefit, setIsApplyingVipBenefit] = useState<boolean>(false);
  const [vipModalOpen, setVipModalOpen] = useState<boolean>(false);

  // Lateral scrolling refs for card carousels
  const upcomingScrollRef = useRef<HTMLDivElement>(null);
  const unvisitedScrollRef = useRef<HTMLDivElement>(null);
  const contractsScrollRef = useRef<HTMLDivElement>(null);
  const vipScrollRef = useRef<HTMLDivElement>(null);

  const scrollContainer = (ref: React.RefObject<HTMLDivElement | null>, direction: 'left' | 'right', distance = 350) => {
    if (ref.current) {
      ref.current.scrollBy({
        left: direction === 'left' ? -distance : distance,
        behavior: 'smooth'
      });
    }
  };

  const adminId = userProfile?.role === 'admin' ? userProfile.uid : userProfile?.adminId;
  const refreshTrigger = useRealtimeUpdates(['clients', 'visits', 'oneoffjobs', 'payments'], 'admin_id', adminId);

  // Fetch all stats & indicators
  const fetchStats = useCallback(async (isManual = false) => {
    if (!userProfile?.uid) return;
    if (isManual) setIsRefreshing(true);

    try {
      const currentDate = new Date();
      const currentMonth = currentDate.getMonth() + 1;
      const currentYear = currentDate.getFullYear();
      const currentAdminId = userProfile.role === 'admin' ? userProfile.uid : userProfile.adminId;

      const getFormattedLocalDate = (d: any) => {
        if (!d) return '';
        try {
          if (typeof d === 'string' && d.includes('-')) {
            return d.split('T')[0];
          }
          const dt = new Date(d);
          const y = dt.getFullYear();
          const m = String(dt.getMonth() + 1).padStart(2, '0');
          const day = String(dt.getDate()).padStart(2, '0');
          return `${y}-${m}-${day}`;
        } catch(e) {
          return '';
        }
      };
      const todayStr = getFormattedLocalDate(new Date());

      let totalClients = 0;
      let inactiveClients = 0;
      let totalToReceive = 0;
      let actualDelayedClients = 0;
      let delayedTotalAmount = 0;
      let pendingThisMonth = 0;
      let receivedThisMonth = 0;
      let receivedToday = 0;
      let totalActiveContracts = 0;

      const clientsNoVisit: any[] = [];
      const totalActiveClientsList: any[] = [];
      const clientsWhoPaidThisMonth = new Set<string>();
      const delayedClientIds = new Set<string>();

      // 1. Fetch Payments for current month
      const paymentsSnap = await supabase
        .from('payments')
        .select('*')
        .eq('admin_id', currentAdminId);

      if (paymentsSnap.data) {
        paymentsSnap.data.forEach((data: any) => {
          const paymentDate = data.paid_date || data.created_at;
          if (paymentDate) {
            let py: number, pm: number;
            if (typeof paymentDate === 'string' && paymentDate.includes('-')) {
              const parts = paymentDate.split('T')[0].split('-');
              py = parseInt(parts[0], 10);
              pm = parseInt(parts[1], 10);
            } else {
              const dateObj = new Date(paymentDate);
              py = dateObj.getFullYear();
              pm = dateObj.getMonth() + 1;
            }

            if (pm === currentMonth && py === currentYear) {
              receivedThisMonth += Number(data.amount || 0);
              clientsWhoPaidThisMonth.add(data.client_id);
            }

            if (getFormattedLocalDate(paymentDate) === todayStr) {
              receivedToday += Number(data.amount || 0);
            }
          }
        });
      }

      // 2. Fetch Clients
      let clientsSnap;
      if (userProfile.role === 'employee') {
        clientsSnap = await supabase
          .from('clients')
          .select('*')
          .eq('admin_id', currentAdminId)
          .eq('employee_id', userProfile.uid);
      } else {
        clientsSnap = await supabase
          .from('clients')
          .select('*')
          .eq('admin_id', currentAdminId);
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(today.getDate() - 7);

      const list3to5: UpcomingClient[] = [];
      const listNext7: UpcomingClient[] = [];

      if (clientsSnap.data) {
        clientsSnap.data.forEach((data: any) => {
          const clientPrice = Number(data.monthly_price || data.monthly_fee || 0);
          const extraPrice = Number(data.extra_amount || 0);
          const fullPrice = clientPrice + extraPrice;

          if (data.active === false) {
            inactiveClients++;
            // Se inativo, só somamos para o mês se ele pagou
            if (!clientsWhoPaidThisMonth.has(data.id)) {
              return;
            }
          } else {
            totalClients++;
            totalActiveContracts += clientPrice;
            totalActiveClientsList.push(data);
          }

          totalToReceive += fullPrice;

          if (data.due_date) {
            const [year, month, day] = data.due_date.split('-').map(Number);
            const due = new Date(year, month - 1, day);
            due.setHours(0, 0, 0, 0);

            const diffTime = due.getTime() - today.getTime();
            const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

            // Atrasados
            if (due.getTime() < today.getTime()) {
              if (!clientsWhoPaidThisMonth.has(data.id)) {
                actualDelayedClients++;
                delayedTotalAmount += fullPrice;
                delayedClientIds.add(data.id);
              }
            }

            // Pendente neste mês
            if (due.getFullYear() < currentYear || (due.getFullYear() === currentYear && due.getMonth() + 1 <= currentMonth)) {
              if (!clientsWhoPaidThisMonth.has(data.id)) {
                pendingThisMonth += fullPrice;
              }
            }

            // Próximos Vencimentos (somente se ainda não pagou no mês atual e estiver ativo)
            if (data.active !== false && !clientsWhoPaidThisMonth.has(data.id)) {
              const upcomingItem: UpcomingClient = {
                id: data.id,
                name: data.name,
                phone: data.phone || '',
                monthlyPrice: clientPrice,
                extraAmount: extraPrice > 0 ? extraPrice : undefined,
                extraReason: data.extra_reason || undefined,
                dueDate: data.due_date,
                diffDays,
                rawClient: data
              };

              // Janela de 3 a 5 dias
              if (diffDays >= 3 && diffDays <= 5) {
                list3to5.push(upcomingItem);
              }

              // Janela dos próximos 7 dias (de hoje a +7 dias)
              if (diffDays >= 0 && diffDays <= 7) {
                listNext7.push(upcomingItem);
              }
            }
          }
        });
      }

      // Ordena vencimentos pela data mais próxima
      list3to5.sort((a, b) => a.diffDays - b.diffDays);
      listNext7.sort((a, b) => a.diffDays - b.diffDays);
      setUpcomingClients3to5(list3to5);
      setUpcomingClientsNext7(listNext7);

      // 3. Fetch Recent Visits
      let recentVisitsSnap;
      if (userProfile.role === 'employee') {
        recentVisitsSnap = await supabase
          .from('visits')
          .select('client_id, date')
          .eq('admin_id', currentAdminId)
          .eq('employee_id', userProfile.uid)
          .gte('date', sevenDaysAgo.toISOString());
      } else {
        recentVisitsSnap = await supabase
          .from('visits')
          .select('client_id, date')
          .eq('admin_id', currentAdminId)
          .gte('date', sevenDaysAgo.toISOString());
      }

      const clientsWithRecentVisits = new Set(recentVisitsSnap.data?.map((v: any) => v.client_id) || []);

      totalActiveClientsList.forEach(data => {
        if (!clientsWithRecentVisits.has(data.id)) {
          clientsNoVisit.push({ ...data, lastVisitDate: data.last_visit_date });
        }
      });
      setClientsWithoutVisits(clientsNoVisit);

      // 4. Fetch One-Off Jobs (Serviços Avulsos do mês)
      let jobsSnap;
      if (userProfile.role === 'employee') {
        jobsSnap = await supabase
          .from('oneoffjobs')
          .select('*')
          .eq('admin_id', currentAdminId)
          .eq('employee_id', userProfile.uid);
      } else {
        jobsSnap = await supabase
          .from('oneoffjobs')
          .select('*')
          .eq('admin_id', currentAdminId);
      }

      if (jobsSnap.data) {
        jobsSnap.data.forEach((data: any) => {
          if (data.client_name === 'system_route_order' || data.title === 'system_route_order') return;
          let isCurrentMonthJob = false;
          let isPendingThisMonth = false;
          let isCompletedThisMonth = false;

          if (data.date) {
            const [year, month] = data.date.split('-').map(Number);
            if (year === currentYear && month === currentMonth) {
              isCurrentMonthJob = true;
            }
            if (year < currentYear || (year === currentYear && month <= currentMonth)) {
              if (data.status === 'pendente' || data.status === 'em_andamento') {
                isPendingThisMonth = true;
              }
            }
          } else if (data.created_at) {
            const dateObj = new Date(data.created_at);
            if (dateObj.getFullYear() === currentYear && dateObj.getMonth() + 1 === currentMonth) {
              isCurrentMonthJob = true;
            }
            if (dateObj.getFullYear() < currentYear || (dateObj.getFullYear() === currentYear && dateObj.getMonth() + 1 <= currentMonth)) {
              if (data.status === 'pendente' || data.status === 'em_andamento') {
                isPendingThisMonth = true;
              }
            }
          }

          if (data.status === 'concluido') {
            let checkDate: Date;
            if (data.updated_at) {
              checkDate = new Date(data.updated_at);
            } else if (data.date) {
              const [y, m, d] = data.date.split('-').map(Number);
              checkDate = new Date(y, m - 1, d || 1);
            } else {
              checkDate = new Date(data.created_at);
            }
            if (checkDate.getFullYear() === currentYear && checkDate.getMonth() + 1 === currentMonth) {
              isCompletedThisMonth = true;
            }
          }

          if (isCurrentMonthJob) {
            totalToReceive += Number(data.price || 0);
          }
          if (isPendingThisMonth) {
            pendingThisMonth += Number(data.price || 0);
          }
          if (data.status === 'concluido') {
            if (isCompletedThisMonth) {
              receivedThisMonth += Number(data.price || 0);
            }
            const jobDoneDate = data.completed_at || data.updated_at || data.created_at || data.date;
            if (getFormattedLocalDate(jobDoneDate) === todayStr) {
              receivedToday += Number(data.price || 0);
            }
          }
        });
      }

      // Calculations:
      const ticketMedio = totalClients > 0 ? (totalActiveContracts / totalClients) : 0;
      const taxaRecebimento = totalToReceive > 0 ? Math.min(100, Math.round((receivedThisMonth / totalToReceive) * 100)) : 0;

      setStats({
        totalClients,
        inactiveClients,
        totalToReceive,
        delayedClients: actualDelayedClients,
        delayedTotalAmount,
        receivedThisMonth,
        receivedToday,
        pendingThisMonth,
        totalActiveContracts,
        ticketMedio,
        taxaRecebimento,
      });

      // 5. Previsão do Tempo & Alerta Meteorológico para Piscinas (Open-Meteo)
      try {
        const weather = await fetchWeatherData();
        if (weather) setWeatherData(weather);
      } catch (err) {
        console.warn('Weather fetch failed:', err);
      }

      // 6. Gestão de Contratos e Alerta de Reajuste Anual Automático
      try {
        const contractsMeta = await loadContractsMetadata();
        const paymentsByClientList = new Map<string, any[]>();
        if (paymentsSnap?.data) {
          paymentsSnap.data.forEach((p: any) => {
            if (p.client_id) {
              const list = paymentsByClientList.get(p.client_id) || [];
              list.push(p);
              paymentsByClientList.set(p.client_id, list);
            }
          });
        }

        if (clientsSnap?.data) {
          const evaluated: ClientContractInfo[] = [];
          clientsSnap.data.forEach((client: any) => {
            if (client.active !== false) {
              const clientPayments = paymentsByClientList.get(client.id) || [];
              const info = evaluateClientContract(client, contractsMeta[client.id], clientPayments);
              evaluated.push(info);
            }
          });
          evaluated.sort((a, b) => b.monthsActive - a.monthsActive);
          setContractClients(evaluated);
          const eligible = evaluated.filter(c => c.isEligibleForAdjustment);
          setEligibleContractClients(eligible);
        }
      } catch (err) {
        console.warn('Contracts evaluation failed:', err);
      }

      // 7. Avaliação e Ranking de Clientes VIP (Maior tempo de contrato e pontualidade)
      try {
        const paymentsByClient: Record<string, { count: number; total: number }> = {};
        if (paymentsSnap?.data) {
          paymentsSnap.data.forEach((p: any) => {
            const cid = p.client_id;
            if (!cid) return;
            if (!paymentsByClient[cid]) paymentsByClient[cid] = { count: 0, total: 0 };
            paymentsByClient[cid].count += 1;
            paymentsByClient[cid].total += Number(p.amount || 0);
          });
        }

        const contractsMeta = await loadContractsMetadata();

        if (clientsSnap?.data) {
          const vips: VipClientInfo[] = [];

          clientsSnap.data.forEach((client: any) => {
            if (client.active === false) return;

            const isDelayed = delayedClientIds.has(client.id);
            // Clientes VIP priorizam pontualidade e fidelidade (sem débitos em atraso)
            if (isDelayed) return;

            const currentPrice = Number(client.monthly_price || client.monthly_fee || 0);
            if (currentPrice <= 0) return;

            const rawStartDate = contractsMeta[client.id]?.customStartDate || client.created_at || new Date().toISOString();
            const startDate = new Date(rawStartDate);
            const now = new Date();
            const totalMonths = Math.max(1, (now.getFullYear() - startDate.getFullYear()) * 12 + (now.getMonth() - startDate.getMonth()));
            const yearsActive = Math.floor(totalMonths / 12);

            const pInfo = paymentsByClient[client.id] || { count: 0, total: 0 };

            // Cálculo do Score VIP (0 a 100)
            // 1. Tempo de Contrato (até 45 pontos)
            let timeScore = 12;
            if (totalMonths >= 24) timeScore = 45;
            else if (totalMonths >= 18) timeScore = 40;
            else if (totalMonths >= 12) timeScore = 35;
            else if (totalMonths >= 6) timeScore = 25;
            else if (totalMonths >= 3) timeScore = 18;

            // 2. Pontualidade e Histórico de Pagamentos (até 35 pontos)
            // Está adimplente (+25) e tem pagamentos confirmados (+2 por pagamento registrado até +10)
            const punctualityScore = 25 + Math.min(10, pInfo.count * 2);

            // 3. Ticket Mensal (até 20 pontos)
            let ticketScore = 10;
            if (currentPrice >= 400) ticketScore = 20;
            else if (currentPrice >= 300) ticketScore = 16;
            else if (currentPrice >= 200) ticketScore = 12;

            const vipScore = Math.min(100, Math.round(timeScore + punctualityScore + ticketScore));

            // Classificação em Tiers
            let tier: 'diamond' | 'gold' | 'silver' = 'silver';
            let tierLabel = 'VIP Prata';
            let tierBadgeColor = 'bg-slate-100 text-slate-800 border-slate-300';
            let loyaltyBenefitSuggested = '5% de desconto de fidelidade OU Análise Química Especial de cortesia';

            if (vipScore >= 80 || totalMonths >= 18) {
              tier = 'diamond';
              tierLabel = 'VIP Diamante';
              tierBadgeColor = 'bg-cyan-100 text-cyan-900 border-cyan-300 shadow-xs';
              loyaltyBenefitSuggested = '10% de desconto de fidelidade OU Cristalização de Piscina de cortesia';
            } else if (vipScore >= 60 || totalMonths >= 9) {
              tier = 'gold';
              tierLabel = 'VIP Ouro';
              tierBadgeColor = 'bg-amber-100 text-amber-900 border-amber-300 shadow-xs';
              loyaltyBenefitSuggested = '8% de desconto de fidelidade OU Polimento de Bordas de cortesia';
            }

            vips.push({
              id: client.id,
              name: client.name,
              phone: client.phone || client.local_phone || '',
              monthlyFee: currentPrice,
              monthsActive: totalMonths,
              yearsActive,
              startDateFormatted: rawStartDate.split('T')[0],
              totalPaymentsCount: pInfo.count,
              totalPaidAmount: pInfo.total,
              isCurrentlyDelayed: false,
              vipScore,
              tier,
              tierLabel,
              tierBadgeColor,
              loyaltyBenefitSuggested,
              rawClient: client
            });
          });

          // Ordena por Score VIP decrescente e meses ativos decrescentes
          vips.sort((a, b) => b.vipScore - a.vipScore || b.monthsActive - a.monthsActive);
          setVipClients(vips);
        }
      } catch (err) {
        console.warn('VIP clients evaluation failed:', err);
      }

      setLastUpdated(new Date());
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
      if (isManual) {
        setTimeout(() => setIsRefreshing(false), 400);
      }
    }
  }, [userProfile]);

  useEffect(() => {
    fetchStats();

    const handleFocus = () => fetchStats();
    const handleGlobal = () => fetchStats(true);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('app-global-refresh', handleGlobal);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') fetchStats();
    });

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('app-global-refresh', handleGlobal);
    };
  }, [fetchStats, refreshTrigger]);

  // Currency Formatter
  const formatCurrency = (value: number) => {
    if (!showValues) return 'R$ ****';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const formatDateBR = (dateStr: string) => {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
  };

  // Envio de lembrete preventivo (WhatsApp AstraCalls / Meta / Evolution / Web)
  const handleSendPreventiveReminder = async (client: UpcomingClient) => {
    try {
      setSendingReminderId(client.id);

      const currentAdminId = userProfile?.role === 'admin' ? userProfile.uid : userProfile?.adminId;
      const resolved = await resolveAdminWhatsAppSettings(currentAdminId, userProfile);
      let currentSettings: any = { ...(userProfile?.whatsappSettings || {}), ...(resolved || {}) };

      if (!client.phone) {
        alert(`O cliente ${client.name} não possui telefone cadastrado.`);
        return;
      }

      const todayStr = new Date().toLocaleDateString('pt-BR');
      const updatedReminders = { ...sentReminders, [client.id]: todayStr };
      setSentReminders(updatedReminders);
      try {
        localStorage.setItem('gestaopro_billed_clients', JSON.stringify(updatedReminders));
      } catch (e) {}

      const cleanPhone = client.phone.replace(/\D/g, '');
      const reminderTemplate = currentSettings.reminderMessage || 
        'Olá {nome}, tudo bem? Passando para lembrar que sua mensalidade no valor de R$ {valor} vence no dia {vencimento}. Qualquer dúvida estamos à disposição!';

      const fullTotal = client.monthlyPrice + (client.extraAmount || 0);

      const currentPixKey = currentSettings.pixKey || (userProfile?.whatsappSettings as any)?.pixKey || '';
      const currentPixReceiver = currentSettings.pixReceiverName || (userProfile?.whatsappSettings as any)?.pixReceiverName || '';
      const shouldAppendPix = currentSettings.autoAppendPix !== false;

      let message = formatClientMessageTemplate(reminderTemplate, {
        name: client.name,
        phone: client.phone,
        monthly_price: fullTotal,
        monthlyFee: fullTotal,
        due_date: client.dueDate,
        dueDate: client.dueDate,
        extraAmount: client.extraAmount,
        extra_amount: client.extraAmount,
        extraReason: client.extraReason,
        extra_reason: client.extraReason,
        pixKey: currentPixKey,
        pixReceiverName: currentPixReceiver
      }, {
        companyName: currentSettings?.companyName || userProfile?.whatsappSettings?.companyName || 'RS Piscinas',
        portalUrl: 'www.rspiscinas.app.br/client-panel',
        pixKey: currentPixKey,
        pixReceiverName: currentPixReceiver
      });

      if (shouldAppendPix && currentPixKey && !message.includes(currentPixKey)) {
        message += `\n\n*Chave PIX para pagamento:*\n${currentPixKey}${currentPixReceiver ? `\n*Titular:* ${currentPixReceiver}` : ''}`;
      }

      const billingMsgClientId = `preventive_${client.id}_${client.dueDate}_${new Date().toISOString().slice(0, 10)}`;
      const effectiveProvider = getEffectiveWhatsAppProvider(currentSettings);

      if (effectiveProvider === 'manual') {
        openWhatsApp(`55${cleanPhone}`, message);
        setFeedbackMessage({ text: `WhatsApp aberto para envio a ${client.name}.` });
      } else if (effectiveProvider === 'astracalls') {
        try {
          await sendAstraCallsMessage(client.phone, message, currentSettings, billingMsgClientId);
          setFeedbackMessage({ text: `Lembrete preventivo enviado com sucesso para ${client.name} via AstraCalls!` });
        } catch (err: any) {
          console.error(err);
          if (confirm(`Falha no AstraCalls (${err.message}). Deseja abrir o WhatsApp no aparelho para enviar manualmente?`)) {
            openWhatsApp(`55${cleanPhone}`, message);
          }
        }
      } else if (effectiveProvider === 'meta') {
        try {
          await sendMetaMessage(client.phone, message, currentSettings, billingMsgClientId);
          setFeedbackMessage({ text: `Lembrete preventivo enviado via WhatsApp Oficial Meta para ${client.name}!` });
        } catch (err: any) {
          console.error(err);
          if (confirm(`Falha na Meta API (${err.message}). Deseja abrir o WhatsApp no aparelho para enviar manualmente?`)) {
            openWhatsApp(`55${cleanPhone}`, message);
          }
        }
      } else if (effectiveProvider === 'evolution') {
        try {
          await sendEvolutionMessage(client.phone, message, currentSettings, billingMsgClientId);
          setFeedbackMessage({ text: `Lembrete preventivo enviado via Evolution para ${client.name}!` });
        } catch (err: any) {
          console.error(err);
          if (confirm(`Falha na Evolution API (${err.message}). Deseja abrir o WhatsApp no aparelho para enviar manualmente?`)) {
            openWhatsApp(`55${cleanPhone}`, message);
          }
        }
      } else {
        openWhatsApp(`55${cleanPhone}`, message);
        setFeedbackMessage({ text: `WhatsApp aberto para envio a ${client.name}.` });
      }
    } catch (e: any) {
      console.error(e);
      alert('Erro ao enviar lembrete: ' + (e.message || ''));
    } finally {
      setSendingReminderId(null);
      setTimeout(() => setFeedbackMessage(null), 5000);
    }
  };

  // Weather Refresh
  const handleRefreshWeather = async () => {
    setWeatherLoading(true);
    try {
      localStorage.removeItem('gestaopro_weather_cache');
      const data = await fetchWeatherData();
      if (data) {
        setWeatherData(data);
        setFeedbackMessage({ text: 'Previsão do tempo atualizada com sucesso!' });
      }
    } catch (e: any) {
      console.error(e);
      setFeedbackMessage({ text: 'Não foi possível atualizar a previsão do tempo.', isError: true });
    } finally {
      setWeatherLoading(false);
      setTimeout(() => setFeedbackMessage(null), 4000);
    }
  };

  // Mensagem oficial requerida pelo usuário para comunicado de reajuste
  const generateContractMessage = (clientName: string, newPriceFormatted: string) => {
    return `Olá, ${clientName}! Tudo bem?

Passando primeiramente para agradecer pela confiança no meu trabalho com a RS Piscinas!

Gostaria de informar que, devido ao aumento recente nos custos necessários para a realização do serviço, precisarei fazer um pequeno reajuste na sua mensalidade para continuar entregando o mesmo padrão de qualidade.

Esse reajuste passará a valer a partir do seu próximo pagamento, e o novo valor da sua mensalidade será de R$ ${newPriceFormatted}.

Agradeço muito a compreensão e sigo à disposição para manter a sua piscina sempre limpa e bem cuidada! Qualquer dúvida, é só me chamar.

Um abraço,
Renivaldo`;
  };

  // Contract Adjustment Handlers
  const openAdjustmentModal = (clientInfo: ClientContractInfo) => {
    setSelectedContractClient(clientInfo);
    // Valor padrão do aumento sugerido: R$ 20,00 conforme solicitado pelo usuário
    const defaultIncrease = 20.0;
    const calculated = clientInfo.currentPrice + defaultIncrease;
    setIncreaseAmountInput(defaultIncrease.toFixed(2));
    setCustomPriceInput(calculated.toFixed(2));
    const pct = clientInfo.currentPrice > 0 ? (defaultIncrease / clientInfo.currentPrice) * 100 : 8;
    setAdjustmentPercent(Math.round(pct * 10) / 10);
    setContractMessagePreview(generateContractMessage(clientInfo.clientName, calculated.toFixed(2).replace('.', ',')));
    setSendContractWhatsapp(true);
    setContractModalOpen(true);
  };

  const handleIncreaseAmountChange = (val: string) => {
    setIncreaseAmountInput(val);
    const inc = parseFloat(val.replace(',', '.'));
    if (!isNaN(inc) && selectedContractClient) {
      const newTotal = Math.max(0, selectedContractClient.currentPrice + inc);
      setCustomPriceInput(newTotal.toFixed(2));
      const pct = selectedContractClient.currentPrice > 0 ? (inc / selectedContractClient.currentPrice) * 100 : 0;
      setAdjustmentPercent(Math.round(pct * 10) / 10);
      setContractMessagePreview(generateContractMessage(selectedContractClient.clientName, newTotal.toFixed(2).replace('.', ',')));
    }
  };

  const handlePresetIncrease = (amount: number) => {
    setIncreaseAmountInput(amount.toFixed(2));
    if (selectedContractClient) {
      const newTotal = selectedContractClient.currentPrice + amount;
      setCustomPriceInput(newTotal.toFixed(2));
      const pct = selectedContractClient.currentPrice > 0 ? (amount / selectedContractClient.currentPrice) * 100 : 0;
      setAdjustmentPercent(Math.round(pct * 10) / 10);
      setContractMessagePreview(generateContractMessage(selectedContractClient.clientName, newTotal.toFixed(2).replace('.', ',')));
    }
  };

  const handlePercentChange = (pct: number) => {
    setAdjustmentPercent(pct);
    if (selectedContractClient) {
      const inc = selectedContractClient.currentPrice * (pct / 100);
      const calculated = selectedContractClient.currentPrice + inc;
      setIncreaseAmountInput(inc.toFixed(2));
      setCustomPriceInput(calculated.toFixed(2));
      setContractMessagePreview(generateContractMessage(selectedContractClient.clientName, calculated.toFixed(2).replace('.', ',')));
    }
  };

  const handleCustomPriceChange = (val: string) => {
    setCustomPriceInput(val);
    const num = parseFloat(val.replace(',', '.'));
    if (!isNaN(num) && selectedContractClient) {
      const diff = num - selectedContractClient.currentPrice;
      setIncreaseAmountInput(diff > 0 ? diff.toFixed(2) : '0.00');
      const pct = selectedContractClient.currentPrice > 0 ? (diff / selectedContractClient.currentPrice) * 100 : 0;
      setAdjustmentPercent(Math.round(pct * 10) / 10);
      setContractMessagePreview(generateContractMessage(selectedContractClient.clientName, num.toFixed(2).replace('.', ',')));
    }
  };

  const handleKeepContractPrice = async (clientInfo?: ClientContractInfo | null) => {
    const target = clientInfo || selectedContractClient;
    if (!target) return;

    setIsApplyingAdjustment(true);
    try {
      const success = await keepContractPrice(target.clientId);
      if (!success) {
        throw new Error('Falha ao registrar manutenção do valor');
      }

      setFeedbackMessage({ text: `Valor mantido em R$ ${target.currentPrice.toFixed(2)} para ${target.clientName}. O contrato foi renovado para o próximo ciclo sem reajuste.` });
      setContractModalOpen(false);
      setSelectedContractClient(null);
      await fetchStats(true);
    } catch (err: any) {
      console.error(err);
      alert('Erro ao manter valor: ' + (err.message || ''));
    } finally {
      setIsApplyingAdjustment(false);
      setTimeout(() => setFeedbackMessage(null), 5000);
    }
  };

  const handleTestWithTeste2 = async () => {
    setIsApplyingAdjustment(true);
    try {
      let teste2Id = 'f1e48b7c-a410-43a4-bdb9-ffc70dbd33e8';
      const { data: existingClient } = await supabase
        .from('clients')
        .select('*')
        .ilike('name', '%teste2%')
        .maybeSingle();

      if (existingClient) {
        teste2Id = existingClient.id;
        await supabase
          .from('clients')
          .update({
            monthly_price: 200,
            monthly_fee: 200,
            active: true
          })
          .eq('id', teste2Id);
      } else {
        const { data: newClient } = await supabase
          .from('clients')
          .insert({
            id: teste2Id,
            name: 'teste2',
            monthly_price: 200,
            monthly_fee: 200,
            active: true,
            phone: '556791907236'
          })
          .select()
          .single();
        if (newClient) teste2Id = newClient.id;
      }

      localStorage.removeItem(`contract_meta_${teste2Id}`);
      await supabase.from('settings').delete().like('id', `%${teste2Id}%`);

      await fetchStats(true);

      const targetClient: ClientContractInfo = {
        clientId: teste2Id,
        clientName: existingClient?.name || 'teste2',
        clientPhone: existingClient?.phone || existingClient?.local_phone || '556791907236',
        startDate: '2025-01-01',
        monthsActive: 13,
        yearsActive: 1,
        isEligibleForAdjustment: true,
        anniversaryMonthName: 'Janeiro',
        currentPrice: 200
      };

      openAdjustmentModal(targetClient);
      setFeedbackMessage({ text: 'Cliente teste2 pronto para teste! Modal aberto para simulação (+ R$ 20,00).' });
    } catch (e: any) {
      console.error('Erro ao testar com teste2:', e);
      alert('Erro ao carregar teste com teste2: ' + (e.message || ''));
    } finally {
      setIsApplyingAdjustment(false);
      setTimeout(() => setFeedbackMessage(null), 5000);
    }
  };

  const handleResetTeste2 = handleTestWithTeste2;

  const executeContractAdjustment = async () => {
    if (!selectedContractClient) return;
    const newPrice = parseFloat(customPriceInput.replace(',', '.'));
    if (isNaN(newPrice) || newPrice <= 0) {
      alert('Por favor, informe um valor de mensalidade válido.');
      return;
    }

    setIsApplyingAdjustment(true);
    try {
      const success = await saveContractAdjustment(
        selectedContractClient.clientId,
        newPrice,
        adjustmentPercent
      );

      if (!success) {
        throw new Error('Falha ao salvar o reajuste no banco de dados');
      }

      const formattedNewPrice = newPrice.toFixed(2).replace('.', ',');

      // Se solicitado, dispara o comunicado de reajuste oficial no WhatsApp do cliente
      if (sendContractWhatsapp && selectedContractClient.clientPhone) {
        const currentAdminId = userProfile?.role === 'admin' ? userProfile.uid : userProfile?.adminId;
        const currentSettings = await resolveAdminWhatsAppSettings(currentAdminId, userProfile);

        const message = contractMessagePreview.trim() || generateContractMessage(selectedContractClient.clientName, formattedNewPrice);

        const effectiveProvider = getEffectiveWhatsAppProvider(currentSettings);
        const formattedPhone = formatWhatsAppNumber(selectedContractClient.clientPhone);
        const msgId = `adj_${selectedContractClient.clientId}_${Date.now()}`;

        if (effectiveProvider === 'astracalls') {
          try {
            await sendAstraCallsMessage(formattedPhone, message, currentSettings, msgId);
          } catch {
            openWhatsApp(formattedPhone, message);
          }
        } else if (effectiveProvider === 'meta') {
          try {
            await sendMetaMessage(formattedPhone, message, currentSettings, msgId);
          } catch {
            openWhatsApp(formattedPhone, message);
          }
        } else if (effectiveProvider === 'evolution') {
          try {
            await sendEvolutionMessage(formattedPhone, message, currentSettings, msgId);
          } catch {
            openWhatsApp(formattedPhone, message);
          }
        } else {
          openWhatsApp(formattedPhone, message);
        }
      }

      setFeedbackMessage({ text: `Mensalidade atualizada para R$ ${formattedNewPrice} no cadastro de ${selectedContractClient.clientName} com sucesso!` });
      setContractModalOpen(false);
      setSelectedContractClient(null);
      await fetchStats(true);
    } catch (err: any) {
      console.error(err);
      alert('Erro ao aplicar reajuste: ' + (err.message || ''));
    } finally {
      setIsApplyingAdjustment(false);
      setTimeout(() => setFeedbackMessage(null), 5000);
    }
  };

  // VIP Loyalty Benefit Handlers
  const openVipModal = (client: VipClientInfo) => {
    setSelectedVipClient(client);
    setVipBenefitType(client.tier === 'diamond' ? 'discount_percent' : client.tier === 'gold' ? 'discount_percent' : 'service_gift');
    setVipDiscountPercent(client.tier === 'diamond' ? 10 : client.tier === 'gold' ? 8 : 5);
    setVipDiscountFixed(30);
    setVipServiceGiftName(
      client.tier === 'diamond'
        ? 'Cristalização Total da Piscina de Cortesia'
        : client.tier === 'gold'
        ? 'Polimento e Limpeza de Bordas de Cortesia'
        : 'Análise Química Laboratorial Especial de Cortesia'
    );
    setApplyDiscountToClientFee(true);
    setSendVipWhatsapp(true);
    setVipModalOpen(true);
  };

  const getVipBenefitDescription = (client: VipClientInfo) => {
    if (vipBenefitType === 'discount_percent') {
      const discVal = client.monthlyFee * (vipDiscountPercent / 100);
      const newFee = client.monthlyFee - discVal;
      return `${vipDiscountPercent}% de desconto na mensalidade (de R$ ${client.monthlyFee.toFixed(2)} por R$ ${newFee.toFixed(2)})`;
    }
    if (vipBenefitType === 'discount_fixed') {
      const newFee = Math.max(0, client.monthlyFee - vipDiscountFixed);
      return `Desconto especial de R$ ${vipDiscountFixed.toFixed(2)} (mensalidade de R$ ${client.monthlyFee.toFixed(2)} por R$ ${newFee.toFixed(2)})`;
    }
    return vipServiceGiftName;
  };

  const executeVipBenefit = async () => {
    if (!selectedVipClient) return;

    setIsApplyingVipBenefit(true);
    try {
      const benefitText = getVipBenefitDescription(selectedVipClient);

      // Se for desconto e o usuário marcou para aplicar na mensalidade
      if ((vipBenefitType === 'discount_percent' || vipBenefitType === 'discount_fixed') && applyDiscountToClientFee) {
        let newMonthlyPrice = selectedVipClient.monthlyFee;
        if (vipBenefitType === 'discount_percent') {
          newMonthlyPrice = Math.round(selectedVipClient.monthlyFee * (1 - vipDiscountPercent / 100));
        } else {
          newMonthlyPrice = Math.max(0, Math.round(selectedVipClient.monthlyFee - vipDiscountFixed));
        }

        const { error: clientError } = await supabase
          .from('clients')
          .update({
            monthly_price: newMonthlyPrice,
            monthly_fee: newMonthlyPrice
          })
          .eq('id', selectedVipClient.id);

        if (clientError) throw clientError;
      }

      // Salva histórico do benefício nos settings e localStorage
      try {
        const nowIso = new Date().toISOString();
        const record = {
          clientId: selectedVipClient.id,
          benefit: benefitText,
          tier: selectedVipClient.tier,
          date: nowIso
        };
        localStorage.setItem(`vip_benefit_${selectedVipClient.id}`, JSON.stringify(record));
        await supabase.from('settings').upsert({
          id: `vip_benefit_${selectedVipClient.id}`,
          updated_at: nowIso
        });
      } catch (e) {}

      // Se solicitado, envia comunicado no WhatsApp
      if (sendVipWhatsapp && selectedVipClient.phone) {
        const currentAdminId = userProfile?.role === 'admin' ? userProfile.uid : userProfile?.adminId;
        const currentSettings = await resolveAdminWhatsAppSettings(currentAdminId, userProfile);
        const companyName = currentSettings?.companyName || userProfile?.whatsappSettings?.companyName || 'RS Piscinas';
        const cleanPhone = selectedVipClient.phone.replace(/\D/g, '');

        const durationStr = selectedVipClient.yearsActive > 0 
          ? `${selectedVipClient.yearsActive} ano${selectedVipClient.yearsActive > 1 ? 's' : ''}` 
          : `${selectedVipClient.monthsActive} meses`;

        const template = `Olá {nome}! Tudo bem? 🏊‍♂️✨

Temos a alegria de comunicar que você faz parte do seleto grupo de Clientes ${selectedVipClient.tierLabel} da {empresa}, com ${durationStr} de parceria e pontualidade exemplar! 💎

Como forma de reconhecimento e agradecimento pela sua fidelidade e confiança no nosso trabalho, concedemos a você o seguinte benefício especial:
🎁 Benefício: ${benefitText}

Agradecemos imensamente pela parceria e por nos permitir cuidar da sua piscina para mantê-la sempre cristalina e segura! 💦✨`;

        const message = formatClientMessageTemplate(template, {
          name: selectedVipClient.name,
          phone: selectedVipClient.phone,
          monthlyFee: selectedVipClient.monthlyFee,
          monthly_price: selectedVipClient.monthlyFee
        }, {
          companyName
        });

        const effectiveProvider = getEffectiveWhatsAppProvider(currentSettings);
        const msgId = `vip_${selectedVipClient.id}_${Date.now()}`;

        if (effectiveProvider === 'astracalls') {
          try {
            await sendAstraCallsMessage(selectedVipClient.phone, message, currentSettings, msgId);
          } catch {
            openWhatsApp(`55${cleanPhone}`, message);
          }
        } else if (effectiveProvider === 'meta') {
          try {
            await sendMetaMessage(selectedVipClient.phone, message, currentSettings, msgId);
          } catch {
            openWhatsApp(`55${cleanPhone}`, message);
          }
        } else if (effectiveProvider === 'evolution') {
          try {
            await sendEvolutionMessage(selectedVipClient.phone, message, currentSettings, msgId);
          } catch {
            openWhatsApp(`55${cleanPhone}`, message);
          }
        } else {
          openWhatsApp(`55${cleanPhone}`, message);
        }
      }

      setFeedbackMessage({ text: `Benefício VIP concedido com sucesso para ${selectedVipClient.name}!` });
      setVipModalOpen(false);
      setSelectedVipClient(null);
      await fetchStats(true);
    } catch (err: any) {
      console.error(err);
      alert('Erro ao conceder benefício VIP: ' + (err.message || ''));
    } finally {
      setIsApplyingVipBenefit(false);
      setTimeout(() => setFeedbackMessage(null), 5000);
    }
  };

  // Trial & Subscription checks
  const isTrial = userProfile?.role === 'admin' && userProfile?.subscriptionStatus === 'trial';
  const isExpiringSoon = () => {
    if (!userProfile?.subscriptionExpiresAt) return false;
    const expiresAt = new Date(userProfile.subscriptionExpiresAt);
    const now = new Date();
    const diffTime = expiresAt.getTime() - now.getTime();
    const diffDays = diffTime / (1000 * 3600 * 24);
    return diffDays <= 1;
  };

  const handlePay = async () => {
    try {
      let price = 99.90;
      try {
        const { data } = await supabase.from('settings').select('*').eq('id', 'platform').single();
        if (data && data.monthlyprice) {
          price = data.monthlyprice;
        }
      } catch (e) {
        console.error('Failed to get price', e);
      }
      const response = await fetch('/api/create-preference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Assinatura Mensal - GestãoPro',
          price: price,
          quantity: 1,
          adminId: userProfile?.role === 'admin' ? userProfile?.uid : userProfile?.adminId,
          email: userProfile?.email || 'admin@gestaopro.com',
          origin: window.location.origin
        })
      });

      if (!response.ok) {
        let errMsg = 'Falha ao gerar link';
        try {
          const text = await response.text();
          try {
            const errData = JSON.parse(text);
            errMsg = errData.error || errData.message || errMsg;
          } catch(e) {
            errMsg = `Erro no servidor (${response.status}): ${text.substring(0, 50)}`;
          }
        } catch (e) {}
        throw new Error(errMsg);
      }
      const data = await response.json();
      if (data.init_point) window.location.href = data.init_point;
    } catch (err: any) {
      console.error(err);
      alert('Houve um problema ao processar o pagamento: ' + err.message + '. Verifique com o administrador.');
    }
  };

  // SVG circular gauge math
  const circleRadius = 40;
  const circleCircumference = 2 * Math.PI * circleRadius;
  const circleStrokeOffset = circleCircumference - (Math.min(100, Math.max(0, stats.taxaRecebimento)) / 100) * circleCircumference;

  // Active upcoming list based on tab
  const activeUpcomingList = upcomingTab === '3to5' ? upcomingClients3to5 : upcomingClientsNext7;

  // VIP Clients metrics & active filtered list
  const diamondVips = vipClients.filter(c => c.tier === 'diamond');
  const goldVips = vipClients.filter(c => c.tier === 'gold');
  const silverVips = vipClients.filter(c => c.tier === 'silver');

  const filteredVipClients = vipClients.filter(c => {
    if (vipTierFilter === 'all') return true;
    return c.tier === vipTierFilter;
  });

  const totalVipRevenue = vipClients.reduce((acc, c) => acc + c.monthlyFee, 0);
  const avgVipMonths = vipClients.length > 0 ? Math.round(vipClients.reduce((acc, c) => acc + c.monthsActive, 0) / vipClients.length) : 0;

  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center h-80 space-y-4">
        <RefreshCw size={36} className="text-sky-500 animate-spin" />
        <p className="text-sm font-medium text-slate-400">Carregando indicadores de inteligência...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">

      {/* Feedback Toast */}
      <AnimatePresence>
        {feedbackMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`fixed top-4 right-4 z-50 p-4 rounded-xl shadow-2xl border flex items-center gap-3 max-w-md ${
              feedbackMessage.isError
                ? 'bg-red-950/95 border-red-500/50 text-red-200'
                : 'bg-emerald-950/95 border-emerald-500/50 text-emerald-200'
            }`}
          >
            {feedbackMessage.isError ? <AlertCircle size={20} className="shrink-0" /> : <CheckCircle size={20} className="shrink-0 text-emerald-400" />}
            <span className="text-sm font-medium">{feedbackMessage.text}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Subscription Active Banner */}
      {userProfile?.role === 'admin' && userProfile?.subscriptionExpiresAt && !isTrial && (
        <div className="bg-gradient-to-r from-blue-950 via-slate-900 to-blue-950 border border-sky-500/40 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between shadow-lg">
          <div className="flex items-center mb-4 sm:mb-0">
            <Clock className="text-sky-400 mr-3.5 hidden sm:block shrink-0" size={26} />
            <div>
              <h3 className="font-bold text-white text-base">Assinatura Ativa</h3>
              <p className="text-xs sm:text-sm text-sky-200 mt-0.5">
                Sua mensalidade vence em: <span className="font-bold text-white">{formatDateBR(userProfile.subscriptionExpiresAt.split('T')[0])}</span>
              </p>
            </div>
          </div>
          {isExpiringSoon() && (
            <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto mt-4 sm:mt-0">
              <button
                onClick={handlePay}
                className="px-6 py-2.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold rounded-xl shadow-md transition-all flex items-center justify-center whitespace-nowrap cursor-pointer text-sm"
              >
                <CreditCard size={18} className="mr-2" />
                Renovar Assinatura
              </button>
            </div>
          )}
        </div>
      )}

      {/* Trial Banner */}
      {isTrial && (
        <div className="bg-gradient-to-r from-amber-950/80 via-slate-900 to-amber-950/80 border border-amber-500/40 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between shadow-lg">
          <div className="flex items-center mb-4 sm:mb-0">
            <Clock className="text-amber-400 mr-3.5 hidden sm:block shrink-0" size={26} />
            <div>
              <h3 className="font-bold text-amber-200 text-base">Período de Teste (7 dias)</h3>
              <p className="text-xs sm:text-sm text-amber-300/80 mt-0.5">
                Evite a interrupção do serviço. Assine agora e garanta acesso contínuo às rotas e relatórios.
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto mt-4 sm:mt-0">
            <button
              onClick={() => window.open('https://wa.me/5567992499469', '_blank')}
              className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-amber-300 border border-amber-500/40 font-bold rounded-xl shadow-sm transition-all flex items-center justify-center whitespace-nowrap cursor-pointer text-sm"
            >
              <MessageCircle size={18} className="mr-2" />
              Contato
            </button>
            <button
              onClick={handlePay}
              className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl shadow-md transition-all flex items-center justify-center whitespace-nowrap cursor-pointer text-sm"
            >
              <CreditCard size={18} className="mr-2" />
              Assinar Agora
            </button>
          </div>
        </div>
      )}

      {/* Top Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
            Dashboard
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-sky-100 text-sky-800 border border-sky-200">
              Gestão Inteligente
            </span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Inteligência financeira, taxa de adimplência e controle de piscinas
            <span className="hidden md:inline text-slate-400"> · Atualizado às {lastUpdated.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {/* Privacy Eye Toggle */}
          <button 
            onClick={toggleShowValues}
            className="flex items-center gap-2 px-3.5 py-2.5 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 rounded-xl shadow-sm border border-slate-200 transition-all text-xs font-semibold cursor-pointer"
            title={showValues ? "Ocultar valores financeiros (Modo Privacidade)" : "Mostrar valores financeiros"}
          >
            {showValues ? (
              <>
                <EyeOff size={16} className="text-slate-500" />
                <span className="hidden sm:inline">Ocultar Cifras</span>
              </>
            ) : (
              <>
                <Eye size={16} className="text-sky-600" />
                <span className="hidden sm:inline">Exibir Cifras</span>
              </>
            )}
          </button>

          {/* Quick Refresh */}
          <button
            onClick={() => fetchStats(true)}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-3.5 py-2.5 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 rounded-xl shadow-sm border border-slate-200 transition-all text-xs font-semibold disabled:opacity-60 cursor-pointer"
            title="Atualizar dados agora"
          >
            <RefreshCw size={16} className={`text-sky-600 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{isRefreshing ? 'Atualizando...' : 'Atualizar'}</span>
          </button>

          {/* Direct Billing Link */}
          <button
            onClick={() => navigate('/billing')}
            className="flex items-center gap-1.5 px-3.5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl shadow-sm transition-all text-xs font-semibold cursor-pointer"
          >
            <DollarSign size={16} className="text-emerald-400" />
            <span>Financeiro</span>
          </button>
        </div>
      </div>

      {/* =========================================================================
          HERO ROW: TERMÔMETRO FINANCEIRO & TICKET MÉDIO POR PISCINA
          ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* 1. HERO CARD: Termômetro Financeiro e Taxa de Adimplência (8 cols on desktop) */}
        <div className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl p-5 sm:p-6 text-white relative overflow-hidden">
          {/* Subtle Ambient Glow */}
          <div className="absolute -right-20 -top-20 w-64 h-64 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -left-20 -bottom-20 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

          {/* Header of Termômetro */}
          <div className="flex items-start justify-between mb-6 relative z-10">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-sky-400 mb-1">
                <Sparkles size={14} />
                Termômetro Financeiro do Mês
              </div>
              <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                Taxa de Recebimento & Eficiência
              </h2>
            </div>

            <div className="text-right">
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${
                stats.taxaRecebimento >= 80 
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : stats.taxaRecebimento >= 50
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              }`}>
                {stats.taxaRecebimento >= 80 ? 'Ritmo Excelente' : stats.taxaRecebimento >= 50 ? 'Meta em Andamento' : 'Acompanhamento'}
              </span>
            </div>
          </div>

          {/* Main Visual Display: Circular Gauge + Metrics Breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center relative z-10">
            
            {/* Circular Gauge Meter (md: 4 cols) */}
            <div className="md:col-span-4 flex flex-col items-center justify-center p-3 bg-slate-950/60 rounded-2xl border border-slate-800/80">
              <div className="relative w-32 h-32 flex items-center justify-center">
                <svg className="w-32 h-32 transform -rotate-90" viewBox="0 0 100 100">
                  {/* Background Track */}
                  <circle
                    cx="50"
                    cy="50"
                    r={circleRadius}
                    className="text-slate-800"
                    strokeWidth="9"
                    stroke="currentColor"
                    fill="transparent"
                  />
                  {/* Foreground Animated Value */}
                  <circle
                    cx="50"
                    cy="50"
                    r={circleRadius}
                    strokeWidth="9"
                    strokeDasharray={circleCircumference}
                    strokeDashoffset={circleStrokeOffset}
                    strokeLinecap="round"
                    stroke="url(#dashboardProgressGradient)"
                    fill="transparent"
                    className="transition-all duration-1000 ease-out"
                  />
                  <defs>
                    <linearGradient id="dashboardProgressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#38bdf8" />
                      <stop offset="100%" stopColor="#10b981" />
                    </linearGradient>
                  </defs>
                </svg>

                {/* Inner Gauge Text */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-3xl font-black text-white tracking-tight">
                    {stats.taxaRecebimento}%
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 -mt-0.5">
                    Recebido
                  </span>
                </div>
              </div>

              <p className="text-xs text-center text-slate-400 mt-2 font-medium">
                {stats.taxaRecebimento}% da meta arrecadada
              </p>
            </div>

            {/* Metrics Breakdown (md: 8 cols) */}
            <div className="md:col-span-8 space-y-4">
              
              {/* Top Banner Numbers */}
              <div className="bg-slate-950/50 rounded-xl p-4 border border-slate-800/80">
                <div className="flex items-baseline justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-400">Progresso da Meta Mensal</span>
                  <span className="text-xs font-bold text-emerald-400">
                    {formatCurrency(stats.receivedThisMonth)} de {formatCurrency(stats.totalToReceive)}
                  </span>
                </div>

                {/* Visual Multi-Segment Progress Bar */}
                <div className="w-full bg-slate-800 h-3 rounded-full overflow-hidden flex">
                  {/* Received Segment */}
                  <div 
                    style={{ width: `${stats.taxaRecebimento}%` }}
                    className="bg-gradient-to-r from-sky-400 to-emerald-400 h-full transition-all duration-1000 ease-out"
                    title={`Recebido: ${formatCurrency(stats.receivedThisMonth)}`}
                  />
                  {/* Pending Segment */}
                  <div 
                    style={{ width: `${stats.totalToReceive > 0 ? Math.round((stats.pendingThisMonth / stats.totalToReceive) * 100) : 0}%` }}
                    className="bg-amber-400/80 h-full transition-all duration-1000 ease-out"
                    title={`Pendente: ${formatCurrency(stats.pendingThisMonth)}`}
                  />
                  {/* Delayed Segment */}
                  <div 
                    style={{ width: `${stats.totalToReceive > 0 ? Math.round((stats.delayedTotalAmount / stats.totalToReceive) * 100) : 0}%` }}
                    className="bg-red-500/80 h-full transition-all duration-1000 ease-out"
                    title={`Atrasado: ${formatCurrency(stats.delayedTotalAmount)}`}
                  />
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    Recebido ({stats.taxaRecebimento}%)
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    Pendente
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-red-400" />
                    Atrasados
                  </span>
                </div>
              </div>

              {/* Sub-Cards Row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-sky-950/30 rounded-xl border border-sky-500/30 relative overflow-hidden">
                  <span className="text-[11px] text-sky-400 block font-medium">Recebidos Hoje</span>
                  <span className="text-base sm:text-lg font-black text-sky-300 tracking-tight">
                    {formatCurrency(stats.receivedToday)}
                  </span>
                </div>

                <div className="p-3 bg-slate-950/40 rounded-xl border border-slate-800/60">
                  <span className="text-[11px] text-slate-400 block font-medium">Já Recebido</span>
                  <span className="text-base sm:text-lg font-black text-emerald-400 tracking-tight">
                    {formatCurrency(stats.receivedThisMonth)}
                  </span>
                </div>

                <div className="p-3 bg-slate-950/40 rounded-xl border border-slate-800/60">
                  <span className="text-[11px] text-slate-400 block font-medium">A Receber no Mês</span>
                  <span className="text-base sm:text-lg font-black text-amber-400 tracking-tight">
                    {formatCurrency(stats.pendingThisMonth)}
                  </span>
                </div>

                <div className="p-3 bg-slate-950/40 rounded-xl border border-slate-800/60">
                  <span className="text-[11px] text-slate-400 block font-medium">Em Atraso ({stats.delayedClients})</span>
                  <span className={`text-base sm:text-lg font-black tracking-tight ${stats.delayedClients > 0 ? 'text-red-400' : 'text-slate-300'}`}>
                    {formatCurrency(stats.delayedTotalAmount)}
                  </span>
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* 2. CARD: Ticket Médio por Piscina (4 cols on desktop) */}
        <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl p-5 sm:p-6 text-white flex flex-col justify-between relative overflow-hidden">
          <div className="absolute right-0 top-0 w-48 h-48 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />

          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                <TrendingUp size={15} />
                Inteligência de Tabela
              </span>
              <span className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
                <DollarSign size={18} />
              </span>
            </div>

            <p className="text-xs text-slate-400 font-medium">Ticket Médio por Piscina</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-3xl sm:text-4xl font-black text-white tracking-tight">
                {formatCurrency(stats.ticketMedio)}
              </span>
              <span className="text-xs font-semibold text-slate-400">/ mês</span>
            </div>

            <div className="mt-5 space-y-2.5 pt-4 border-t border-slate-800/80 text-xs">
              <div className="flex items-center justify-between text-slate-300">
                <span className="text-slate-400">Piscinas / Clientes Ativos</span>
                <span className="font-bold text-white">{stats.totalClients} piscinas</span>
              </div>
              <div className="flex items-center justify-between text-slate-300">
                <span className="text-slate-400">Contratos Ativos Recorrentes</span>
                <span className="font-bold text-sky-400">{formatCurrency(stats.totalActiveContracts)}</span>
              </div>
              <div className="flex items-center justify-between text-slate-300">
                <span className="text-slate-400">Clientes Pausados / Inativos</span>
                <span className="font-semibold text-slate-400">{stats.inactiveClients} clientes</span>
              </div>
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-slate-800/80 bg-slate-950/40 -mx-5 sm:-mx-6 -mb-5 sm:-mb-6 p-4 rounded-b-2xl">
            <p className="text-[11px] leading-relaxed text-slate-400">
              <span className="font-semibold text-slate-300">💡 Parâmetro de Reajuste:</span> Média calculada sobre as mensalidades ativas. Excelente termômetro para recalibrar novas propostas e aplicar reposição de custos químicos.
            </p>
          </div>
        </div>

      </div>

      {/* =========================================================================
          SECTION: PRÓXIMOS VENCIMENTOS DA SEMANA (3 A 5 DIAS)
          ========================================================================= */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                <Calendar className="text-sky-600" size={20} />
                Próximos Vencimentos da Semana
              </h2>
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-sky-100 text-sky-800">
                {activeUpcomingList.length} clientes
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Envie lembretes preventivos antes do vencimento para garantir alta taxa de recebimento
            </p>
          </div>

          {/* Tab selector for window filter & Lateral scroll navigation */}
          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200">
              <button
                onClick={() => setUpcomingTab('3to5')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  upcomingTab === '3to5'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Janela 3 a 5 dias ({upcomingClients3to5.length})
              </button>
              <button
                onClick={() => setUpcomingTab('7days')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  upcomingTab === '7days'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Próximos 7 dias ({upcomingClientsNext7.length})
              </button>
            </div>

            {/* Lateral scroll arrows */}
            {activeUpcomingList.length > 0 && (
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => scrollContainer(upcomingScrollRef, 'left')}
                  className="p-1.5 rounded-lg bg-white hover:bg-slate-200 text-slate-700 shadow-xs cursor-pointer transition-colors"
                  title="Rolar para esquerda"
                  aria-label="Rolar para esquerda"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => scrollContainer(upcomingScrollRef, 'right')}
                  className="p-1.5 rounded-lg bg-white hover:bg-slate-200 text-slate-700 shadow-xs cursor-pointer transition-colors"
                  title="Rolar para direita"
                  aria-label="Rolar para direita"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* List of Upcoming Clients with Horizontal Lateral Scrolling */}
        {activeUpcomingList.length === 0 ? (
          <div className="py-10 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
            <ShieldCheck size={36} className="text-emerald-500 mx-auto mb-2 opacity-80" />
            <p className="text-sm font-bold text-slate-800">Nenhum vencimento pendente na janela selecionada</p>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              Todos os clientes deste período já quitaram suas mensalidades ou os vencimentos estão fora do intervalo de 3 a 5 dias.
            </p>
            <button
              onClick={() => navigate('/billing')}
              className="mt-3.5 inline-flex items-center gap-1.5 text-xs font-bold text-sky-600 hover:text-sky-700 cursor-pointer"
            >
              Ver todas as cobranças no Financeiro <ArrowRight size={14} />
            </button>
          </div>
        ) : (
          <div 
            ref={upcomingScrollRef}
            className="flex gap-3.5 overflow-x-auto scroll-smooth pb-3 pt-1 no-scrollbar snap-x snap-mandatory"
          >
            {activeUpcomingList.map((client) => {
              const isSentToday = sentReminders[client.id] === new Date().toLocaleDateString('pt-BR');
              const isSending = sendingReminderId === client.id;
              const totalDue = client.monthlyPrice + (client.extraAmount || 0);

              return (
                <div 
                  key={client.id}
                  className="w-[300px] sm:w-[320px] md:w-[340px] shrink-0 snap-start p-4 rounded-xl border border-slate-200 hover:border-slate-300 bg-slate-50/70 hover:bg-white transition-all shadow-xs flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h4 className="font-bold text-slate-900 text-sm truncate" title={client.name}>
                          {client.name}
                        </h4>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {client.phone ? client.phone.replace(/(\d{2})(\d{2})(\d{5})(\d{4})/, '+$1 ($2) $3-$4') : 'Sem telefone'}
                        </p>
                      </div>

                      {/* Due Countdown Badge */}
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md shrink-0 ${
                        client.diffDays <= 3
                          ? 'bg-amber-100 text-amber-800 border border-amber-200'
                          : 'bg-sky-100 text-sky-800 border border-sky-200'
                      }`}>
                        {client.diffDays === 0 ? 'Vence Hoje' : `Em ${client.diffDays} dias`}
                      </span>
                    </div>

                    {/* Due Date & Amount */}
                    <div className="mt-3 flex items-baseline justify-between pt-2.5 border-t border-slate-200/80 text-xs">
                      <span className="text-slate-500">
                        Vencimento: <strong className="text-slate-700">{formatDateBR(client.dueDate)}</strong>
                      </span>
                      <span className="font-black text-slate-900 text-sm">
                        {formatCurrency(totalDue)}
                      </span>
                    </div>

                    {client.extraAmount && client.extraAmount > 0 && (
                      <p className="text-[11px] text-amber-700 mt-1 italic">
                        + R$ {client.extraAmount.toFixed(2).replace('.', ',')} ({client.extraReason || 'Serviço extra'})
                      </p>
                    )}
                  </div>

                  {/* Action Button: Enviar Lembrete Preventivo */}
                  <div className="mt-3.5 pt-2.5 border-t border-slate-200/60 flex items-center justify-between gap-2">
                    <button
                      onClick={() => handleSendPreventiveReminder(client)}
                      disabled={isSending}
                      className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                        isSentToday
                          ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                          : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs'
                      }`}
                      title={isSentToday ? "Lembrete já disparado hoje. Clique para reenviar se desejar." : "Enviar lembrete amigável antes do vencimento"}
                    >
                      {isSending ? (
                        <>
                          <RefreshCw size={13} className="animate-spin" />
                          <span>Enviando...</span>
                        </>
                      ) : isSentToday ? (
                        <>
                          <Check size={14} className="text-emerald-700" />
                          <span>Lembrete Enviado</span>
                        </>
                      ) : (
                        <>
                          <Send size={13} />
                          <span>Enviar Lembrete</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={() => navigate('/billing')}
                      className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 rounded-lg transition-colors cursor-pointer"
                      title="Ver histórico no financeiro"
                    >
                      <ArrowRight size={15} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer CTA */}
        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span>O lembrete preventivo utiliza o modelo configurado em Configurações de WhatsApp.</span>
          <button
            onClick={() => navigate('/billing')}
            className="font-bold text-sky-600 hover:text-sky-700 hover:underline flex items-center gap-1 cursor-pointer"
          >
            Abrir Painel Financeiro Completo <ArrowRight size={13} />
          </button>
        </div>
      </div>

      {/* =========================================================================
          OPERATIONAL ALERT: CLIENTES SEM VISITA HÁ MAIS DE 7 DIAS
          ========================================================================= */}
      {clientsWithoutVisits.length > 0 && (
        <div className="bg-red-50 border border-red-200 p-5 sm:p-6 rounded-2xl shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div className="flex items-center">
              <div className="p-2 bg-red-100 text-red-600 rounded-xl mr-3 shrink-0">
                <AlertCircle size={22} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-red-950 flex items-center gap-2">
                  Alerta Operacional: {clientsWithoutVisits.length} piscinas sem visita nos últimos 7 dias
                </h2>
                <p className="text-xs text-red-700 mt-0.5">
                  Piscinas ativas que demandam atenção na rota para manutenção de parâmetros químicos e filtragem
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              <button
                onClick={() => navigate('/routes')}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
              >
                Ver Rotas de Hoje <ArrowRight size={14} />
              </button>

              {/* Lateral scroll arrows */}
              {clientsWithoutVisits.length > 0 && (
                <div className="flex items-center gap-1 bg-red-100/80 p-1 rounded-xl border border-red-200">
                  <button
                    type="button"
                    onClick={() => scrollContainer(unvisitedScrollRef, 'left')}
                    className="p-1.5 rounded-lg bg-white hover:bg-red-50 text-red-800 shadow-xs cursor-pointer transition-colors"
                    title="Rolar piscinas para esquerda"
                    aria-label="Rolar para esquerda"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollContainer(unvisitedScrollRef, 'right')}
                    className="p-1.5 rounded-lg bg-white hover:bg-red-50 text-red-800 shadow-xs cursor-pointer transition-colors"
                    title="Rolar piscinas para direita"
                    aria-label="Rolar para direita"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              )}
            </div>
          </div>

          <div 
            ref={unvisitedScrollRef}
            className="flex gap-3 overflow-x-auto scroll-smooth pb-2 pt-1 no-scrollbar snap-x snap-mandatory"
          >
            {clientsWithoutVisits.map(client => (
              <div 
                key={client.id} 
                onClick={() => navigate('/routes')}
                className="w-[260px] sm:w-[280px] shrink-0 snap-start bg-white border border-red-200/80 p-3.5 rounded-xl shadow-xs flex flex-col justify-center hover:border-red-400 transition-colors cursor-pointer group"
              >
                <span className="font-bold text-slate-900 text-sm truncate group-hover:text-red-700 transition-colors" title={client.name}>
                  {client.name}
                </span>
                <span className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                  <Clock size={12} className="text-slate-400 shrink-0" />
                  <span className="truncate">
                    {client.lastVisitDate 
                      ? `Última visita: ${new Date(client.lastVisitDate).toLocaleDateString('pt-BR')}` 
                      : 'Nenhuma visita recente'}
                  </span>
                </span>
              </div>
            ))}
          </div>

          <div className="mt-2.5 pt-2 border-t border-red-200/50 flex items-center justify-between text-xs text-red-800 font-medium">
            <span>Deslize lateralmente para visualizar todas as {clientsWithoutVisits.length} piscinas pendentes de atendimento</span>
            <span className="font-bold text-red-900">Total: {clientsWithoutVisits.length}</span>
          </div>
        </div>
      )}

      {/* =========================================================================
          INTEGRAÇÃO COM PREVISÃO DO TEMPO & ALERTA DE TEMPESTADES PARA PISCINAS
          ========================================================================= */}
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs p-5 sm:p-6 overflow-hidden relative">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl shrink-0 ${weatherData?.hasStormAlert ? 'bg-amber-100 text-amber-700' : 'bg-sky-100 text-sky-700'}`}>
              {weatherData?.hasStormAlert ? <AlertTriangle size={24} /> : <CloudSun size={24} />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-slate-900 tracking-tight">
                  Previsão do Tempo & Alerta Meteorológico
                </h3>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                  {weatherData?.city || 'Campo Grande / MS'}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Inteligência climática com Open-Meteo para planejamento de rotas e dosagem preventiva de químicos
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              onClick={handleRefreshWeather}
              disabled={weatherLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition-all cursor-pointer disabled:opacity-60"
              title="Atualizar dados meteorológicos"
            >
              <RefreshCw size={13} className={`text-sky-600 ${weatherLoading ? 'animate-spin' : ''}`} />
              <span>{weatherLoading ? 'Atualizando...' : 'Atualizar Clima'}</span>
            </button>
          </div>
        </div>

        {weatherData ? (
          <div className="space-y-4">
            {/* Storm Alert Banner if storm or heavy rain detected */}
            {weatherData.hasStormAlert && (
              <div className="p-4 rounded-xl border border-amber-300 bg-amber-50/90 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-amber-950">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-amber-200 text-amber-900 shrink-0 mt-0.5 sm:mt-0">
                    <CloudLightning size={20} />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-amber-900 flex items-center gap-2">
                      ⚠️ Alerta de Tempestade / Chuva Severa Detectada
                    </h4>
                    <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
                      {weatherData.stormAlertMessage || 'Previsão de tempestades com descargas elétricas ou alto volume de precipitação nas próximas 24-48 horas.'}
                    </p>
                    <p className="text-[11px] text-amber-900 font-semibold mt-1.5">
                      💡 Recomendações RS Piscinas: Elevar dosagem de cloro residual para 3-5 ppm, conferir ralos de fundo/extravasores e aplicar clarificante após cessar a chuva para evitar proliferação rápida de algas.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Current Conditions Bar + 5-Day Forecast Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
              {/* Today Current Card */}
              <div className="lg:col-span-4 p-4 rounded-xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white flex items-center justify-between shadow-xs">
                <div>
                  <span className="text-xs text-slate-400 font-medium block">Agora em {weatherData.city}</span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-3xl font-black tracking-tight">{weatherData.currentTemp}°C</span>
                    <span className="text-xs text-sky-300 font-semibold">{weatherData.condition.label}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-300">
                    <span className="flex items-center gap-1">
                      <Droplets size={12} className="text-sky-400" /> {weatherData.humidity}% umidade
                    </span>
                    <span className="flex items-center gap-1">
                      <Wind size={12} className="text-teal-400" /> {weatherData.windSpeed} km/h
                    </span>
                  </div>
                </div>

                <div className="p-3 bg-white/10 rounded-xl text-amber-400">
                  {weatherData.condition.icon === 'sun' && <Sun size={32} />}
                  {weatherData.condition.icon === 'cloud-sun' && <CloudSun size={32} />}
                  {weatherData.condition.icon === 'cloud-rain' && <CloudRain size={32} />}
                  {weatherData.condition.icon === 'cloud-lightning' && <CloudLightning size={32} />}
                  {(!['sun', 'cloud-sun', 'cloud-rain', 'cloud-lightning'].includes(weatherData.condition.icon)) && <CloudSun size={32} />}
                </div>
              </div>

              {/* 5-Day Mini Forecast */}
              <div className="lg:col-span-8 grid grid-cols-5 gap-2">
                {weatherData.daily.slice(0, 5).map((day, idx) => (
                  <div 
                    key={day.date}
                    className={`p-2.5 rounded-xl border text-center transition-all ${
                      day.isStormOrHeavyRain 
                        ? 'bg-amber-50/80 border-amber-300 text-amber-950 font-medium' 
                        : idx === 0 
                        ? 'bg-sky-50/80 border-sky-300 text-slate-800'
                        : 'bg-slate-50 border-slate-200/80 text-slate-700'
                    }`}
                  >
                    <span className="text-xs font-bold block">{idx === 0 ? 'Hoje' : day.weekday}</span>
                    <div className="my-1.5 flex justify-center">
                      {day.condition.icon === 'sun' && <Sun size={20} className="text-amber-500" />}
                      {day.condition.icon === 'cloud-sun' && <CloudSun size={20} className="text-sky-500" />}
                      {day.condition.icon === 'cloud-rain' && <CloudRain size={20} className="text-blue-500" />}
                      {day.condition.icon === 'cloud-lightning' && <CloudLightning size={20} className="text-purple-600" />}
                      {(!['sun', 'cloud-sun', 'cloud-rain', 'cloud-lightning'].includes(day.condition.icon)) && <CloudSun size={20} className="text-slate-500" />}
                    </div>
                    <div className="text-[11px] font-bold text-slate-800">
                      {day.tempMax}° / <span className="text-slate-400 font-normal">{day.tempMin}°</span>
                    </div>
                    <div className="mt-1 flex items-center justify-center gap-0.5 text-[10px] text-blue-600 font-semibold">
                      <Droplets size={9} />
                      <span>{day.rainProbability}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Practical Pool Treatment Tip */}
            <div className="p-3 rounded-xl bg-sky-50/70 border border-sky-200 text-xs text-sky-950 flex items-center gap-2">
              <span className="font-bold text-sky-800 shrink-0">💧 Dica Técnica do Dia:</span>
              <span className="text-sky-900">{weatherData.poolAdvice}</span>
            </div>
          </div>
        ) : (
          <div className="py-6 text-center text-slate-400 text-xs">
            {weatherLoading ? 'Carregando dados meteorológicos via satélite...' : 'Previsão do tempo indisponível no momento.'}
          </div>
        )}
      </div>

      {/* =========================================================================
          GESTÃO DE CONTRATOS COM ALERTA DE REAJUSTE ANUAL AUTOMÁTICO
          ========================================================================= */}
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-100 text-purple-700 shrink-0">
              <Award size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-slate-900 tracking-tight">
                  Gestão de Contratos & Reajuste Anual Automático
                </h3>
                {eligibleContractClients.length > 0 ? (
                  <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200 animate-pulse">
                    {eligibleContractClients.length} {eligibleContractClients.length === 1 ? 'cliente completando 1 ano' : 'clientes completando 1 ano'}
                  </span>
                ) : (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Contratos em dia
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Reajuste anual: clientes completam 1 ano a partir da baixa da mensalidade de Janeiro/2027 (ex.: vencimento em 02/01/2027 baixado libera o reajuste). O cliente teste2 já está ativo para testes.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto">
            {/* Botão de Teste com teste2 SEMPRE visível no topo da seção */}
            <button
              type="button"
              onClick={handleTestWithTeste2}
              disabled={isApplyingAdjustment}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white font-bold text-xs shadow-sm hover:shadow-md transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98] shrink-0 disabled:opacity-50"
              title="Abrir imediatamente simulação de reajuste com o cliente teste2"
            >
              <RotateCcw size={14} className={isApplyingAdjustment ? "animate-spin" : ""} />
              <span>🧪 Testar com teste2</span>
            </button>

            <div className="text-xs text-slate-500 hidden sm:block">
              Total vigentes: <strong className="text-slate-800">{contractClients.length} contratos</strong>
            </div>

            {/* Lateral scroll arrows */}
            {eligibleContractClients.length > 0 && (
              <div className="flex items-center gap-1 bg-purple-50 p-1 rounded-xl border border-purple-200">
                <button
                  type="button"
                  onClick={() => scrollContainer(contractsScrollRef, 'left')}
                  className="p-1.5 rounded-lg bg-white hover:bg-purple-100 text-purple-800 shadow-xs cursor-pointer transition-colors"
                  title="Rolar contratos para esquerda"
                  aria-label="Rolar para esquerda"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => scrollContainer(contractsScrollRef, 'right')}
                  className="p-1.5 rounded-lg bg-white hover:bg-purple-100 text-purple-800 shadow-xs cursor-pointer transition-colors"
                  title="Rolar contratos para direita"
                  aria-label="Rolar para direita"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </div>
        </div>

        {eligibleContractClients.length > 0 ? (
          <div className="space-y-3">
            <div className="p-3 rounded-xl bg-purple-50/70 border border-purple-200 text-xs text-purple-950 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <span className="font-semibold text-purple-900">
                🎉 Clientes aptos para reajuste de valor (1 ano completo atingido):
              </span>
              <span className="text-[11px] text-purple-700 font-bold">
                Defina o valor do aumento manual (ex: + R$ 20,00) ou clique em Manter Valor
              </span>
            </div>

            <div 
              ref={contractsScrollRef}
              className="flex gap-3.5 overflow-x-auto scroll-smooth pb-3 pt-1 no-scrollbar snap-x snap-mandatory"
            >
              {eligibleContractClients.map((client) => {
                const suggestedNewPrice = Math.round(client.currentPrice * 1.08);
                const isTeste = client.clientName.toLowerCase().includes('teste2');

                return (
                  <div
                    key={client.clientId}
                    className={`w-[300px] sm:w-[320px] md:w-[340px] shrink-0 snap-start p-4 rounded-xl transition-all shadow-xs flex flex-col justify-between ${
                      isTeste
                        ? 'border-2 border-purple-500 bg-gradient-to-br from-white via-purple-50/40 to-purple-100/30 ring-2 ring-purple-200 shadow-md'
                        : 'border border-purple-200/90 bg-gradient-to-br from-white to-purple-50/30 hover:border-purple-300'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h4 className="font-bold text-slate-900 text-sm truncate" title={client.clientName}>
                            {client.clientName}
                          </h4>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {client.clientPhone || 'Sem telefone'}
                          </p>
                        </div>

                        {isTeste ? (
                          <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-purple-600 text-white border border-purple-700 shrink-0 shadow-2xs">
                            🧪 Teste (1 ano+)
                          </span>
                        ) : (
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200 shrink-0">
                            {client.monthsActive} meses ativos
                          </span>
                        )}
                      </div>

                      <div className="mt-3.5 pt-2.5 border-t border-purple-100 space-y-1.5 text-xs">
                        <div className="flex justify-between items-center text-slate-600">
                          <span>Mês de Aniversário:</span>
                          <strong className="text-purple-900 font-semibold">{client.anniversaryMonthName}</strong>
                        </div>
                        <div className="flex justify-between items-center text-slate-600">
                          <span>Mensalidade Atual:</span>
                          <strong className="text-slate-800 font-bold">R$ {client.currentPrice.toFixed(2)}</strong>
                        </div>
                        <div className="flex justify-between items-center text-slate-600">
                          <span>Sugestão (+8%):</span>
                          <strong className="text-emerald-700 font-black">R$ {suggestedNewPrice.toFixed(2)}</strong>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-purple-100">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleKeepContractPrice(client)}
                          disabled={isApplyingAdjustment}
                          className="flex-1 py-2 px-2.5 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold text-xs transition-all shadow-2xs flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                          title="Manter o mesmo valor sem aplicar reajuste para este ciclo"
                        >
                          <ShieldCheck size={14} className="text-slate-500" />
                          <span>Manter Valor</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openAdjustmentModal(client)}
                          disabled={isApplyingAdjustment}
                          className="flex-1 py-2 px-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition-all shadow-xs flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                          title="Definir aumento manual (ex: + R$ 20,00) e avisar cliente no WhatsApp"
                        >
                          <Percent size={14} />
                          <span>Atualizar Valor</span>
                        </button>
                      </div>

                      {isTeste && (
                        <button
                          type="button"
                          onClick={handleTestWithTeste2}
                          disabled={isApplyingAdjustment}
                          className="mt-2.5 w-full text-[11px] font-semibold text-purple-700 hover:text-purple-900 text-center flex items-center justify-center gap-1 cursor-pointer py-1 hover:underline"
                          title="Reiniciar os dados do teste2 para novas simulações"
                        >
                          <RotateCcw size={11} className={isApplyingAdjustment ? "animate-spin" : ""} />
                          <span>Resetar para novo teste</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-xl border border-purple-200 bg-gradient-to-r from-purple-50/70 to-slate-50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-700 shadow-2xs">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-purple-100 text-purple-700 rounded-lg shrink-0">
                <FileCheck size={18} />
              </div>
              <div>
                <strong className="block font-bold text-purple-950">Contratos de Janeiro/2027 em dia</strong>
                <span className="text-slate-600 text-[11px]">Nenhum cliente com pagamento de Janeiro/2027 aguardando reajuste neste momento.</span>
              </div>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={handleTestWithTeste2}
                disabled={isApplyingAdjustment}
                className="w-full sm:w-auto px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                title="Libera e abre imediatamente o cliente teste2 para testar o reajuste"
              >
                <RotateCcw size={13} className={isApplyingAdjustment ? "animate-spin" : ""} />
                <span>🧪 Testar com teste2</span>
              </button>
              <button
                onClick={() => navigate('/clients')}
                className="text-purple-700 hover:text-purple-900 font-bold flex items-center gap-1 cursor-pointer shrink-0 px-2 py-1.5"
              >
                Ver clientes <ArrowRight size={13} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* =========================================================================
          PAINEL DE CLIENTES VIP: LONGEVIDADE DE CONTRATO & PONTUALIDADE (FIDELIDADE)
          ========================================================================= */}
      <div className="bg-gradient-to-b from-amber-50/40 via-white to-white border border-amber-200/80 rounded-2xl shadow-xs p-5 sm:p-6 overflow-hidden relative">
        {/* Subtle Ambient Gold Glow */}
        <div className="absolute -right-24 -top-24 w-72 h-72 bg-amber-400/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5 relative z-10">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 text-white shadow-sm shrink-0">
              <Crown size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
                  Painel de Clientes VIP
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                    Programa de Fidelidade
                  </span>
                </h3>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Clientes com maior tempo de contrato ativo e histórico de pontualidade. Destacados para bonificações, descontos e retenção de receita.
              </p>
            </div>
          </div>

          {/* Tier Filter Tabs & Lateral scroll navigation */}
          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            <div className="flex items-center gap-1.5 p-1 bg-slate-100/80 rounded-xl border border-slate-200/80 text-xs">
              <button
                onClick={() => setVipTierFilter('all')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                  vipTierFilter === 'all'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Todos ({vipClients.length})
              </button>
              <button
                onClick={() => setVipTierFilter('diamond')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1 cursor-pointer ${
                  vipTierFilter === 'diamond'
                    ? 'bg-cyan-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-cyan-700'
                }`}
              >
                <Gem size={13} />
                <span>Diamante ({diamondVips.length})</span>
              </button>
              <button
                onClick={() => setVipTierFilter('gold')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1 cursor-pointer ${
                  vipTierFilter === 'gold'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-amber-700'
                }`}
              >
                <Star size={13} />
                <span>Ouro ({goldVips.length})</span>
              </button>
              <button
                onClick={() => setVipTierFilter('silver')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1 cursor-pointer ${
                  vipTierFilter === 'silver'
                    ? 'bg-slate-700 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>Prata ({silverVips.length})</span>
              </button>
            </div>

            {/* Lateral scroll arrows */}
            {filteredVipClients.length > 0 && (
              <div className="flex items-center gap-1 bg-amber-100/70 p-1 rounded-xl border border-amber-200">
                <button
                  type="button"
                  onClick={() => scrollContainer(vipScrollRef, 'left')}
                  className="p-1.5 rounded-lg bg-white hover:bg-amber-50 text-amber-900 shadow-xs cursor-pointer transition-colors"
                  title="Rolar clientes VIP para esquerda"
                  aria-label="Rolar para esquerda"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => scrollContainer(vipScrollRef, 'right')}
                  className="p-1.5 rounded-lg bg-white hover:bg-amber-50 text-amber-900 shadow-xs cursor-pointer transition-colors"
                  title="Rolar clientes VIP para direita"
                  aria-label="Rolar para direita"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Quick VIP Highlights Metrics Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <div className="p-3 bg-white rounded-xl border border-amber-200/70 shadow-xs">
            <span className="text-[11px] font-medium text-slate-500 block">Receita Protegida VIP</span>
            <span className="text-lg font-black text-emerald-600 tracking-tight mt-0.5 block">
              {formatCurrency(totalVipRevenue)}
            </span>
            <span className="text-[10px] text-slate-400">Total mensal de clientes fiéis</span>
          </div>

          <div className="p-3 bg-white rounded-xl border border-amber-200/70 shadow-xs">
            <span className="text-[11px] font-medium text-slate-500 block">Fidelidade Média</span>
            <span className="text-lg font-black text-slate-900 tracking-tight mt-0.5 block">
              {avgVipMonths} meses
            </span>
            <span className="text-[10px] text-slate-400">Tempo de contrato contínuo</span>
          </div>

          <div className="p-3 bg-white rounded-xl border border-amber-200/70 shadow-xs">
            <span className="text-[11px] font-medium text-slate-500 block">Índice de Pontualidade</span>
            <span className="text-lg font-black text-sky-600 tracking-tight mt-0.5 block">
              100%
            </span>
            <span className="text-[10px] text-slate-400">Sem faturas em atraso</span>
          </div>

          <div className="p-3 bg-white rounded-xl border border-amber-200/70 shadow-xs">
            <span className="text-[11px] font-medium text-slate-500 block">Top Tier Diamante</span>
            <span className="text-lg font-black text-cyan-700 tracking-tight mt-0.5 block">
              {diamondVips.length} clientes
            </span>
            <span className="text-[10px] text-slate-400">Fidelidade máxima (&gt;18 meses)</span>
          </div>
        </div>

        {/* VIP Clients Cards List with Horizontal Lateral Scrolling */}
        {filteredVipClients.length > 0 ? (
          <div>
            <div 
              ref={vipScrollRef}
              className="flex gap-3.5 overflow-x-auto scroll-smooth pb-3.5 pt-1 no-scrollbar snap-x snap-mandatory"
            >
              {filteredVipClients.map((client, index) => {
                const isDiamond = client.tier === 'diamond';
                const isGold = client.tier === 'gold';

                return (
                  <div
                    key={client.id}
                    className={`w-[310px] sm:w-[330px] md:w-[350px] shrink-0 snap-start p-4 rounded-xl border transition-all shadow-xs flex flex-col justify-between ${
                    isDiamond
                      ? 'bg-gradient-to-br from-white via-cyan-50/20 to-cyan-50/50 border-cyan-200 hover:border-cyan-400'
                      : isGold
                      ? 'bg-gradient-to-br from-white via-amber-50/20 to-amber-50/40 border-amber-200 hover:border-amber-400'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div>
                    {/* Header: Ranking, Name, Badge */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-slate-900 text-white">
                            #{index + 1}
                          </span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 ${client.tierBadgeColor}`}>
                            {isDiamond && <Gem size={11} className="text-cyan-600" />}
                            {isGold && <Crown size={11} className="text-amber-600" />}
                            {client.tierLabel}
                          </span>
                        </div>
                        <h4 className="font-bold text-slate-900 text-sm truncate" title={client.name}>
                          {client.name}
                        </h4>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {client.phone ? client.phone.replace(/(\d{2})(\d{2})(\d{5})(\d{4})/, '+$1 ($2) $3-$4') : 'Sem telefone'}
                        </p>
                      </div>

                      {/* VIP Score Circle */}
                      <div className="text-right shrink-0">
                        <span className="text-[10px] font-bold text-slate-400 block uppercase">Score VIP</span>
                        <span className="font-black text-amber-600 text-base">
                          {client.vipScore}<span className="text-xs font-normal text-slate-400">/100</span>
                        </span>
                      </div>
                    </div>

                    {/* Longevity & Punctuality Details */}
                    <div className="mt-3.5 pt-2.5 border-t border-slate-100 space-y-1.5 text-xs">
                      <div className="flex justify-between items-center text-slate-600">
                        <span className="flex items-center gap-1 text-slate-500">
                          <Clock size={12} className="text-slate-400" /> Tempo de Parceria:
                        </span>
                        <strong className="text-slate-900 font-bold">
                          {client.monthsActive} meses {client.yearsActive > 0 ? `(${client.yearsActive} ano${client.yearsActive > 1 ? 's' : ''})` : ''}
                        </strong>
                      </div>

                      <div className="flex justify-between items-center text-slate-600">
                        <span className="flex items-center gap-1 text-slate-500">
                          <ShieldCheck size={12} className="text-emerald-500" /> Pontualidade:
                        </span>
                        <span className="text-emerald-700 font-bold flex items-center gap-1">
                          <Check size={12} className="text-emerald-600" /> 100% em dia
                          {client.totalPaymentsCount > 0 && (
                            <span className="text-[10px] font-normal text-slate-500">({client.totalPaymentsCount} pagos)</span>
                          )}
                        </span>
                      </div>

                      <div className="flex justify-between items-center text-slate-600">
                        <span className="flex items-center gap-1 text-slate-500">
                          <DollarSign size={12} className="text-emerald-500" /> Mensalidade:
                        </span>
                        <strong className="text-slate-900 font-extrabold">
                          {formatCurrency(client.monthlyFee)}
                        </strong>
                      </div>
                    </div>

                    {/* Loyalty Benefit Suggestion Callout */}
                    <div className="mt-3 p-2 rounded-lg bg-amber-50/70 border border-amber-200/80 text-[11px] text-amber-950 flex items-start gap-1.5">
                      <Gift size={13} className="text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold block text-amber-900">Sugestão de Reconhecimento:</span>
                        <span className="text-amber-800 leading-tight">{client.loyaltyBenefitSuggested}</span>
                      </div>
                    </div>
                  </div>

                  {/* Action Button: Conceder Benefício & WhatsApp */}
                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-2">
                    <button
                      onClick={() => openVipModal(client)}
                      className={`flex-1 py-2 px-3 rounded-xl font-bold text-xs transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer ${
                        isDiamond
                          ? 'bg-gradient-to-r from-cyan-600 to-sky-600 hover:from-cyan-500 hover:to-sky-500 text-white'
                          : isGold
                          ? 'bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 text-white'
                          : 'bg-slate-900 hover:bg-slate-800 text-white'
                      }`}
                    >
                      <Gift size={13} />
                      <span>Conceder Benefício / Desconto</span>
                    </button>

                    {client.phone && (
                      <button
                        onClick={() => {
                          const cleanPhone = client.phone.replace(/\D/g, '');
                          const defaultMsg = `Olá ${client.name}! Gostaríamos de agradecer por sua parceria com a RS Piscinas ao longo destes ${client.monthsActive} meses! Estamos sempre à sua disposição. 🏊‍♂️✨`;
                          openWhatsApp(`55${cleanPhone}`, defaultMsg);
                        }}
                        className="p-2 text-emerald-600 hover:bg-emerald-50 border border-emerald-200 rounded-xl transition-colors cursor-pointer"
                        title="Abrir WhatsApp direto com o cliente VIP"
                      >
                        <MessageCircle size={15} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            </div>
            <div className="mt-3 pt-2 border-t border-amber-200/40 flex items-center justify-between text-xs text-amber-900/80 font-medium">
              <span>Deslize para o lado para ver todos os {filteredVipClients.length} clientes VIP</span>
              <span className="font-bold">Total listados: {filteredVipClients.length}</span>
            </div>
          </div>
        ) : (
          <div className="p-6 text-center text-slate-400 text-xs bg-white rounded-xl border border-slate-200">
            Nenhum cliente encontrado para esta categoria de filtro VIP.
          </div>
        )}
      </div>

      {/* =========================================================================
          QUICK STATS SUMMARY CARDS (CLEAN & NON-CLUTTERED)
          ========================================================================= */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold">Total Piscinas Ativas</span>
            <Users size={16} className="text-sky-600" />
          </div>
          <p className="text-2xl font-black text-slate-900 tracking-tight">{stats.totalClients}</p>
          <p className="text-[11px] text-slate-400 mt-1">{stats.inactiveClients} inativos/pausados</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold">Previsão Total do Mês</span>
            <DollarSign size={16} className="text-emerald-600" />
          </div>
          <p className="text-2xl font-black text-slate-900 tracking-tight">{formatCurrency(stats.totalToReceive)}</p>
          <p className="text-[11px] text-slate-400 mt-1">Mensalidades + Avulsos</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold">Faturas em Atraso</span>
            <AlertTriangle size={16} className="text-red-600" />
          </div>
          <p className={`text-2xl font-black tracking-tight ${stats.delayedClients > 0 ? 'text-red-600' : 'text-slate-900'}`}>
            {stats.delayedClients}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">
            {stats.delayedClients > 0 ? `${formatCurrency(stats.delayedTotalAmount)} a cobrar` : 'Zero inadimplência'}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold">Adimplência do Período</span>
            <ShieldCheck size={16} className="text-sky-600" />
          </div>
          <p className="text-2xl font-black text-emerald-600 tracking-tight">{stats.taxaRecebimento}%</p>
          <p className="text-[11px] text-slate-400 mt-1">Eficiência de cobrança</p>
        </div>

      </div>

      {/* Modal de Reajuste Anual de Contrato com Notificação no WhatsApp */}
      {contractModalOpen && selectedContractClient && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-gray-100 animate-in fade-in zoom-in duration-150">
            
            {/* Modal Header */}
            <div className="flex justify-between items-start pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-xl bg-purple-100 text-purple-700">
                  <Award size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Reajuste Anual de Contrato</h3>
                  <p className="text-xs text-gray-500">Atualização do valor mensal e envio de comunicado formal</p>
                </div>
              </div>
              <button
                onClick={() => setContractModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Resumo do Cliente e Contrato */}
            <div className="my-4 p-4 bg-purple-50/60 rounded-xl border border-purple-200/80 space-y-2">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-xs text-purple-700 block font-medium">Cliente</span>
                  <span className="font-bold text-gray-900 text-base">{selectedContractClient.clientName}</span>
                  <span className="text-xs text-gray-500 block mt-0.5">{selectedContractClient.clientPhone || 'Sem telefone'}</span>
                </div>
                <div className="text-right">
                  <span className="text-xs text-purple-700 block font-medium">Tempo de Contrato</span>
                  <span className="font-bold text-purple-900 text-sm">
                    {selectedContractClient.monthsActive} meses {selectedContractClient.yearsActive > 0 ? `(${selectedContractClient.yearsActive} ano${selectedContractClient.yearsActive > 1 ? 's' : ''})` : ''}
                  </span>
                  <span className="text-[11px] text-gray-500 block mt-0.5">Aniversário: {selectedContractClient.anniversaryMonthName}</span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2.5 border-t border-purple-200/70 text-xs">
                <span>Mensalidade Atual: <strong className="text-gray-800">R$ {selectedContractClient.currentPrice.toFixed(2)}</strong></span>
                <span>Novo Valor Calculado: <strong className="text-emerald-700 text-sm font-black">R$ {parseFloat(customPriceInput || '0').toFixed(2)}</strong></span>
              </div>
            </div>

            {/* Escolha do Valor do Aumento Manual (ex: R$ 20,00) */}
            <div className="space-y-3 mb-4">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-gray-800">
                  Valor do Aumento Desejado (R$):
                </label>
                <span className="text-[11px] text-purple-700 font-bold">
                  Soma direta ao valor atual
                </span>
              </div>

              {/* Botões rápidos de valores pré-definidos */}
              <div className="grid grid-cols-4 gap-2">
                {[10, 20, 30, 50].map(val => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => handlePresetIncrease(val)}
                    className={`py-2 px-3 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                      parseFloat(increaseAmountInput || '0') === val
                        ? 'bg-purple-600 border-purple-600 text-white shadow-xs'
                        : 'bg-purple-50/60 hover:bg-purple-100/70 border-purple-200 text-purple-900'
                    }`}
                  >
                    + R$ {val},00
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                    Valor do Aumento Manual (R$)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-xs text-gray-400 font-bold">R$</span>
                    <input
                      type="number"
                      step="1"
                      value={increaseAmountInput}
                      onChange={e => handleIncreaseAmountChange(e.target.value)}
                      placeholder="20,00"
                      className="w-full pl-9 pr-3 py-2 border border-purple-300 rounded-lg text-xs font-black text-purple-900 outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                    Novo Valor da Mensalidade (R$)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-xs text-gray-400 font-bold">R$</span>
                    <input
                      type="number"
                      step="0.01"
                      value={customPriceInput}
                      onChange={e => handleCustomPriceChange(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 border border-emerald-300 rounded-lg text-xs font-black text-emerald-800 outline-none focus:ring-2 focus:ring-emerald-500 bg-emerald-50/30"
                    />
                  </div>
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs flex items-center justify-between text-slate-700">
                <span>
                  Mensalidade atual: <strong>R$ {selectedContractClient.currentPrice.toFixed(2)}</strong> + Aumento: <strong className="text-purple-700">R$ {parseFloat(increaseAmountInput || '0').toFixed(2)}</strong>
                </span>
                <span className="text-emerald-700 font-black">
                  = R$ {parseFloat(customPriceInput || '0').toFixed(2)}
                </span>
              </div>
            </div>

            {/* Checkbox WhatsApp Notificação */}
            <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/50 space-y-2 mb-4">
              <label className="flex items-start gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={sendContractWhatsapp}
                  onChange={e => setSendContractWhatsapp(e.target.checked)}
                  className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                />
                <div>
                  <span className="font-bold text-xs text-emerald-950 flex items-center gap-1.5">
                    <MessageCircle size={15} className="text-emerald-700" />
                    Enviar Notificação Formal no WhatsApp
                  </span>
                  <span className="text-[11px] text-emerald-800 block mt-0.5">
                    Comunica cordialmente o reajuste e agradece pela confiança e parceria.
                  </span>
                </div>
              </label>

              {sendContractWhatsapp && (
                <div className="pt-2 border-t border-emerald-200/70">
                  <span className="text-[10px] font-semibold text-emerald-900 block mb-1">
                    Prévia da mensagem oficial que será enviada:
                  </span>
                  <div className="p-2.5 bg-white rounded-lg border border-emerald-300 text-[11px] text-gray-800 font-sans whitespace-pre-wrap leading-relaxed max-h-36 overflow-y-auto shadow-2xs">
                    {contractMessagePreview || generateContractMessage(selectedContractClient.clientName, parseFloat(customPriceInput || '0').toFixed(2).replace('.', ','))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="flex flex-col-reverse sm:flex-row sm:justify-between items-stretch sm:items-center gap-2 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setContractModalOpen(false)}
                disabled={isApplyingAdjustment}
                className="px-3.5 py-2 text-gray-600 hover:bg-gray-100 rounded-xl transition-colors font-semibold text-xs cursor-pointer text-center"
              >
                Cancelar
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleKeepContractPrice(selectedContractClient)}
                  disabled={isApplyingAdjustment}
                  className="flex-1 sm:flex-none px-4 py-2 border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold rounded-xl text-xs transition-all shadow-2xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  title="Não alterar o valor deste cliente e manter a mensalidade atual"
                >
                  <ShieldCheck size={14} className="text-slate-500" />
                  <span>Manter Valor</span>
                </button>

                <button
                  type="button"
                  onClick={executeContractAdjustment}
                  disabled={isApplyingAdjustment}
                  className="flex-1 sm:flex-none px-5 py-2 bg-purple-600 hover:bg-purple-500 active:bg-purple-700 text-white font-bold rounded-xl text-xs transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  title="Atualizar o valor no cadastro do cliente e enviar o aviso no WhatsApp"
                >
                  {isApplyingAdjustment ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" />
                      <span>Atualizando...</span>
                    </>
                  ) : (
                    <>
                      <Check size={14} />
                      <span>Atualizar Valor</span>
                    </>
                  )}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Modal de Concessão de Benefício de Fidelidade / Desconto VIP */}
      {vipModalOpen && selectedVipClient && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-gray-100 animate-in fade-in zoom-in duration-150">
            
            {/* Modal Header */}
            <div className="flex justify-between items-start pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2.5">
                <div className={`p-2.5 rounded-xl ${
                  selectedVipClient.tier === 'diamond'
                    ? 'bg-cyan-100 text-cyan-800'
                    : selectedVipClient.tier === 'gold'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-slate-100 text-slate-800'
                }`}>
                  <Crown size={22} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-gray-900">Benefício de Fidelidade VIP</h3>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${selectedVipClient.tierBadgeColor}`}>
                      {selectedVipClient.tierLabel}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">Reconhecimento por tempo de contrato e pontualidade</p>
                </div>
              </div>
              <button
                onClick={() => setVipModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Resumo do Cliente VIP */}
            <div className="my-4 p-4 bg-amber-50/50 rounded-xl border border-amber-200/80 space-y-2">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-xs text-amber-800 block font-semibold">Cliente VIP</span>
                  <span className="font-bold text-gray-900 text-base">{selectedVipClient.name}</span>
                  <span className="text-xs text-gray-500 block mt-0.5">{selectedVipClient.phone || 'Sem telefone'}</span>
                </div>
                <div className="text-right">
                  <span className="text-xs text-amber-800 block font-semibold">Tempo de Parceria</span>
                  <span className="font-bold text-gray-900 text-sm">
                    {selectedVipClient.monthsActive} meses {selectedVipClient.yearsActive > 0 ? `(${selectedVipClient.yearsActive} ano${selectedVipClient.yearsActive > 1 ? 's' : ''})` : ''}
                  </span>
                  <span className="text-[11px] text-emerald-700 font-semibold block mt-0.5">Pontualidade: 100%</span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2.5 border-t border-amber-200/70 text-xs">
                <span>Mensalidade Atual: <strong className="text-gray-900">R$ {selectedVipClient.monthlyFee.toFixed(2)}</strong></span>
                <span>Score de Fidelidade: <strong className="text-amber-700 font-black">{selectedVipClient.vipScore} pontos</strong></span>
              </div>
            </div>

            {/* Escolha do Tipo de Benefício */}
            <div className="space-y-3 mb-4">
              <label className="block text-xs font-bold text-gray-700">
                Selecione o Benefício de Reconhecimento:
              </label>

              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setVipBenefitType('discount_percent')}
                  className={`py-2 px-2.5 rounded-xl text-xs font-bold transition-all border text-center cursor-pointer ${
                    vipBenefitType === 'discount_percent'
                      ? 'bg-amber-600 border-amber-600 text-white shadow-xs'
                      : 'bg-gray-50 hover:bg-gray-100 border-gray-200 text-gray-700'
                  }`}
                >
                  <Percent size={14} className="mx-auto mb-1" />
                  <span>Desconto %</span>
                </button>

                <button
                  type="button"
                  onClick={() => setVipBenefitType('discount_fixed')}
                  className={`py-2 px-2.5 rounded-xl text-xs font-bold transition-all border text-center cursor-pointer ${
                    vipBenefitType === 'discount_fixed'
                      ? 'bg-amber-600 border-amber-600 text-white shadow-xs'
                      : 'bg-gray-50 hover:bg-gray-100 border-gray-200 text-gray-700'
                  }`}
                >
                  <DollarSign size={14} className="mx-auto mb-1" />
                  <span>Desconto em R$</span>
                </button>

                <button
                  type="button"
                  onClick={() => setVipBenefitType('service_gift')}
                  className={`py-2 px-2.5 rounded-xl text-xs font-bold transition-all border text-center cursor-pointer ${
                    vipBenefitType === 'service_gift'
                      ? 'bg-amber-600 border-amber-600 text-white shadow-xs'
                      : 'bg-gray-50 hover:bg-gray-100 border-gray-200 text-gray-700'
                  }`}
                >
                  <Gift size={14} className="mx-auto mb-1" />
                  <span>Cortesia / Brinde</span>
                </button>
              </div>

              {/* Opções dinâmicas de acordo com o tipo */}
              {vipBenefitType === 'discount_percent' && (
                <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 space-y-2">
                  <span className="text-[11px] font-semibold text-gray-600 block">Percentual de Desconto:</span>
                  <div className="grid grid-cols-4 gap-2">
                    {[5, 8, 10, 15].map(pct => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => setVipDiscountPercent(pct)}
                        className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all border cursor-pointer ${
                          vipDiscountPercent === pct
                            ? 'bg-amber-600 border-amber-600 text-white'
                            : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        -{pct}%
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-gray-200 text-xs">
                    <span className="text-gray-600">Novo valor mensal com desconto:</span>
                    <strong className="text-emerald-700 font-black text-sm">
                      R$ {(selectedVipClient.monthlyFee * (1 - vipDiscountPercent / 100)).toFixed(2)}
                    </strong>
                  </div>

                  <label className="flex items-center gap-2 pt-1 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={applyDiscountToClientFee}
                      onChange={e => setApplyDiscountToClientFee(e.target.checked)}
                      className="rounded text-amber-600 focus:ring-amber-500 w-3.5 h-3.5 cursor-pointer"
                    />
                    <span className="text-[11px] text-gray-700 font-medium">
                      Atualizar automaticamente a mensalidade do cliente no sistema
                    </span>
                  </label>
                </div>
              )}

              {vipBenefitType === 'discount_fixed' && (
                <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 space-y-2">
                  <span className="text-[11px] font-semibold text-gray-600 block">Valor Fixo de Desconto (R$):</span>
                  <div className="grid grid-cols-3 gap-2">
                    {[20, 30, 50].map(val => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setVipDiscountFixed(val)}
                        className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all border cursor-pointer ${
                          vipDiscountFixed === val
                            ? 'bg-amber-600 border-amber-600 text-white'
                            : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        -R$ {val},00
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-gray-200 text-xs">
                    <span className="text-gray-600">Novo valor mensal com desconto:</span>
                    <strong className="text-emerald-700 font-black text-sm">
                      R$ {Math.max(0, selectedVipClient.monthlyFee - vipDiscountFixed).toFixed(2)}
                    </strong>
                  </div>

                  <label className="flex items-center gap-2 pt-1 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={applyDiscountToClientFee}
                      onChange={e => setApplyDiscountToClientFee(e.target.checked)}
                      className="rounded text-amber-600 focus:ring-amber-500 w-3.5 h-3.5 cursor-pointer"
                    />
                    <span className="text-[11px] text-gray-700 font-medium">
                      Atualizar automaticamente a mensalidade do cliente no sistema
                    </span>
                  </label>
                </div>
              )}

              {vipBenefitType === 'service_gift' && (
                <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 space-y-2">
                  <span className="text-[11px] font-semibold text-gray-600 block">Selecione o Serviço ou Brinde de Cortesia:</span>
                  <div className="space-y-1.5">
                    {[
                      'Cristalização Total da Piscina de Cortesia',
                      'Polimento e Limpeza Química de Bordas de Cortesia',
                      'Análise Química Laboratorial Especial de Cortesia',
                      'Tratamento de Choque e Oxi-Ativo Gratuito'
                    ].map(gift => (
                      <label key={gift} className="flex items-center gap-2 p-2 rounded-lg bg-white border border-gray-200 hover:border-amber-300 text-xs cursor-pointer">
                        <input
                          type="radio"
                          name="vipGiftOption"
                          checked={vipServiceGiftName === gift}
                          onChange={() => setVipServiceGiftName(gift)}
                          className="text-amber-600 focus:ring-amber-500 w-3.5 h-3.5 cursor-pointer"
                        />
                        <span className="text-gray-800 font-medium">{gift}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Checkbox WhatsApp Notificação */}
            <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/50 space-y-2 mb-4">
              <label className="flex items-start gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={sendVipWhatsapp}
                  onChange={e => setSendVipWhatsapp(e.target.checked)}
                  className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                />
                <div>
                  <span className="font-bold text-xs text-emerald-950 flex items-center gap-1.5">
                    <MessageCircle size={15} className="text-emerald-700" />
                    Enviar Notificação de Reconhecimento no WhatsApp
                  </span>
                  <span className="text-[11px] text-emerald-800 block mt-0.5">
                    Comunica calorosamente a condição de Cliente VIP e detalha o benefício especial concedido.
                  </span>
                </div>
              </label>

              {sendVipWhatsapp && (
                <div className="pt-2 border-t border-emerald-200/70">
                  <span className="text-[10px] font-semibold text-emerald-900 block mb-1">
                    Prévia da mensagem VIP:
                  </span>
                  <div className="p-2.5 bg-white rounded-lg border border-emerald-300 text-[11px] text-gray-800 font-mono whitespace-pre-wrap leading-relaxed max-h-24 overflow-y-auto">
                    {`Olá ${selectedVipClient.name}! Tudo bem? 🏊‍♂️✨\n\nTemos a alegria de comunicar que você faz parte do seleto grupo de Clientes ${selectedVipClient.tierLabel} da RS Piscinas, com ${selectedVipClient.monthsActive} meses de parceria e pontualidade exemplar! 💎\n\nComo forma de reconhecimento e agradecimento pela sua fidelidade, concedemos a você o seguinte benefício especial:\n🎁 Benefício: ${getVipBenefitDescription(selectedVipClient)}\n\nAgradecemos imensamente pela preferência e por nos confiar a manutenção da sua piscina sempre cristalina! 💦🏊`}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="flex justify-end gap-2.5 pt-2 border-t border-gray-100">
              <button
                onClick={() => setVipModalOpen(false)}
                disabled={isApplyingVipBenefit}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-xl transition-colors font-semibold text-xs cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={executeVipBenefit}
                disabled={isApplyingVipBenefit}
                className="px-5 py-2 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white font-bold rounded-xl text-xs transition-all shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isApplyingVipBenefit ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    <span>Concedendo...</span>
                  </>
                ) : sendVipWhatsapp ? (
                  <>
                    <Gift size={14} />
                    <span>Conceder Benefício & Notificar</span>
                  </>
                ) : (
                  <>
                    <Check size={14} />
                    <span>Conceder Benefício</span>
                  </>
                )}
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
