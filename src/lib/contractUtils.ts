/**
 * Contract & Annual Price Adjustment Utilities for GestãoPro / RS Piscinas
 */

import { supabase } from './supabase';

export interface ClientContractInfo {
  clientId: string;
  clientName: string;
  clientPhone?: string;
  startDate: string; // ISO or YYYY-MM-DD
  monthsActive: number;
  yearsActive: number;
  isEligibleForAdjustment: boolean;
  anniversaryMonthName: string;
  currentPrice: number;
  lastAdjustmentDate?: string;
  lastAdjustmentPercent?: number;
}

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

/**
 * Calculates contract duration and eligibility for annual price adjustment.
 * Regra:
 * - Todos os clientes completam 1 ano a partir do pagamento baixado em janeiro de 2027
 *   (ex: vence a mensalidade em 02/01/2027, assim que o admin der baixa no pagamento já libera a opção para reajuste).
 * - Exceção: cliente teste2 já tem mais de um ano a partir de hoje para realização de testes no sistema.
 */
export function evaluateClientContract(
  client: any,
  meta?: { lastAdjustmentDate?: string; customStartDate?: string; lastPercent?: number; status?: string },
  payments?: any[]
): ClientContractInfo {
  const rawPrice = Number(client.monthly_price || client.monthlyFee || client.monthly_fee || 0);
  const now = new Date();
  const clientName = String(client.name || '').trim();
  const isTeste2 = clientName.toLowerCase().includes('teste2');

  // Preço efetivo (para teste2 garante fallback de R$ 200 caso esteja zerado no banco)
  const currentPrice = (isTeste2 && rawPrice <= 0) ? 200 : rawPrice;

  // 1. Verifica se existe pagamento baixado em Janeiro de 2027 (ou posterior)
  let hasPaidJan2027OrLater = false;
  let jan2027PaymentDate: string | null = null;

  if (Array.isArray(payments) && payments.length > 0) {
    for (const p of payments) {
      const isPaid = p.status === 'pago' || !!p.paid_date;
      if (!isPaid) continue;

      const pRefYear = Number(p.ref_year || 0);
      const pRefMonth = Number(p.ref_month || 0);
      const pYear = Number(p.year || 0);
      const pMonth = Number(p.month || 0);
      const pDueDate = typeof p.due_date === 'string' ? p.due_date : '';
      const pPaidDate = typeof p.paid_date === 'string' ? p.paid_date : '';
      const pCreatedAt = typeof p.created_at === 'string' ? p.created_at : '';

      const isJan2027Ref = pRefYear > 2027 || (pRefYear === 2027 && pRefMonth >= 1);
      const isJan2027Direct = pYear > 2027 || (pYear === 2027 && pMonth >= 1);
      const isJan2027DueDate = pDueDate.startsWith('2027-01') || pDueDate >= '2027-01-01';
      const isJan2027PaidDate = pPaidDate.startsWith('2027-01') || pPaidDate >= '2027-01-01';
      const isJan2027Created = pCreatedAt.startsWith('2027-01') || pCreatedAt >= '2027-01-01';

      if (isJan2027Ref || isJan2027Direct || isJan2027DueDate || isJan2027PaidDate || isJan2027Created) {
        hasPaidJan2027OrLater = true;
        jan2027PaymentDate = p.paid_date || p.due_date || p.created_at || '2027-01-02';
        break;
      }
    }
  }

  // Fallback se o próprio registro do cliente possui vencimento em Janeiro/2027 e status pago
  if (!hasPaidJan2027OrLater) {
    const cliDueDate = typeof client.due_date === 'string' ? client.due_date : '';
    const cliPaymentStatus = String(client.payment_status || '').toLowerCase();
    if (cliDueDate >= '2027-01-01' && (cliPaymentStatus === 'pago' || cliPaymentStatus === 'paid')) {
      hasPaidJan2027OrLater = true;
      jan2027PaymentDate = cliDueDate;
    }
  }

  // Condição para considerar 1 ano completo atingido:
  // - ou o cliente é o "teste2" (ativo imediatamente para testes)
  // - ou o cliente teve pagamento baixado em janeiro de 2027
  const isOneYearCompleted = isTeste2 || hasPaidJan2027OrLater;

  // Data base de início
  const rawStartDate = meta?.customStartDate || client.created_at || new Date().toISOString();
  const startDate = new Date(rawStartDate);

  // Cálculo de meses e anos ativos
  let totalMonthsActive = Math.max(0, (now.getFullYear() - startDate.getFullYear()) * 12 + (now.getMonth() - startDate.getMonth()));
  if (isTeste2) {
    totalMonthsActive = Math.max(totalMonthsActive, 13);
  } else if (hasPaidJan2027OrLater) {
    totalMonthsActive = Math.max(totalMonthsActive, 12);
  }
  const yearsActive = Math.floor(totalMonthsActive / 12);

  // Verificação se já houve reajuste ou manutenção do valor neste ciclo
  const lastAdjDateStr = meta?.lastAdjustmentDate;
  let alreadyAdjustedThisCycle = false;
  if (lastAdjDateStr) {
    const lastAdjDate = new Date(lastAdjDateStr);
    if (isTeste2) {
      // Para teste2, se foi ajustado há menos de 10 minutos, marca como já concluído
      const diffMs = now.getTime() - lastAdjDate.getTime();
      alreadyAdjustedThisCycle = diffMs < 10 * 60 * 1000;
    } else if (jan2027PaymentDate) {
      // Se a data do reajuste foi igual ou posterior à data do pagamento de jan/2027
      alreadyAdjustedThisCycle = lastAdjDate.getTime() >= new Date(jan2027PaymentDate).getTime();
    } else {
      const diffYears = now.getFullYear() - lastAdjDate.getFullYear();
      const diffMonths = (diffYears * 12) + (now.getMonth() - lastAdjDate.getMonth());
      alreadyAdjustedThisCycle = diffMonths < 11;
    }
  }

  // Elegibilidade final:
  // Completa 1 ano, não foi reajustado/mantido ainda neste ciclo, valor > 0 e cliente ativo
  const isEligibleForAdjustment = isOneYearCompleted && !alreadyAdjustedThisCycle && currentPrice > 0 && client.active !== false;

  const anniversaryMonthName = isOneYearCompleted ? 'Janeiro' : (MONTH_NAMES[startDate.getMonth()] || 'Janeiro');

  return {
    clientId: client.id,
    clientName: client.name,
    clientPhone: client.phone || client.local_phone || '',
    startDate: isOneYearCompleted ? '2026-01-01' : rawStartDate.split('T')[0],
    monthsActive: totalMonthsActive,
    yearsActive,
    isEligibleForAdjustment,
    anniversaryMonthName,
    currentPrice,
    lastAdjustmentDate: lastAdjDateStr,
    lastAdjustmentPercent: meta?.lastPercent
  };
}

/**
 * Loads contract metadata for all clients from settings table
 */
export async function loadContractsMetadata(): Promise<Record<string, { lastAdjustmentDate?: string; customStartDate?: string; lastPercent?: number }>> {
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('id, updated_at')
      .like('id', 'contract_meta_%');

    if (error || !data) return {};

    const result: Record<string, any> = {};
    for (const row of data) {
      const clientId = row.id.replace('contract_meta_', '');
      try {
        const stored = localStorage.getItem(`contract_meta_${clientId}`);
        if (stored) {
          result[clientId] = JSON.parse(stored);
        } else {
          result[clientId] = { lastAdjustmentDate: row.updated_at };
        }
      } catch {}
    }
    return result;
  } catch (e) {
    return {};
  }
}

/**
 * Records an annual price adjustment in Supabase and locally
 */
export async function saveContractAdjustment(
  clientId: string,
  newPrice: number,
  percentage: number,
  customStartDate?: string
): Promise<boolean> {
  try {
    const nowIso = new Date().toISOString();
    const meta = {
      lastAdjustmentDate: nowIso,
      lastPercent: percentage,
      customStartDate: customStartDate || undefined,
      updatedAt: nowIso
    };

    // 1. Update client in Supabase
    const { error: clientError } = await supabase
      .from('clients')
      .update({
        monthly_price: newPrice,
        monthly_fee: newPrice
      })
      .eq('id', clientId);

    if (clientError) throw clientError;

    // 2. Persist metadata in settings table and localStorage
    try {
      localStorage.setItem(`contract_meta_${clientId}`, JSON.stringify(meta));
      await supabase.from('settings').upsert({
        id: `contract_meta_${clientId}`,
        updated_at: nowIso
      });
    } catch {}

    return true;
  } catch (err) {
    console.error('[saveContractAdjustment] Erro ao salvar reajuste:', err);
    return false;
  }
}

/**
 * Keeps current contract price without adjustment, recording that it was reviewed for this cycle.
 */
export async function keepContractPrice(clientId: string): Promise<boolean> {
  try {
    const nowIso = new Date().toISOString();
    const meta = {
      lastAdjustmentDate: nowIso,
      lastPercent: 0,
      status: 'kept',
      updatedAt: nowIso
    };

    try {
      localStorage.setItem(`contract_meta_${clientId}`, JSON.stringify(meta));
      await supabase.from('settings').upsert({
        id: `contract_meta_${clientId}`,
        updated_at: nowIso
      });
    } catch {}

    return true;
  } catch (err) {
    console.error('[keepContractPrice] Erro ao manter valor do contrato:', err);
    return false;
  }
}
