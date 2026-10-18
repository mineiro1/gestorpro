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
 * A client is eligible if active for 11 or more months since start (or since last adjustment).
 */
export function evaluateClientContract(
  client: any,
  meta?: { lastAdjustmentDate?: string; customStartDate?: string; lastPercent?: number }
): ClientContractInfo {
  const currentPrice = Number(client.monthly_price || client.monthlyFee || client.monthly_fee || 0);
  
  // Base start date: custom override -> client.created_at -> fallback 1 year ago for demo
  const rawStartDate = meta?.customStartDate || client.created_at || new Date().toISOString();
  const startDate = new Date(rawStartDate);
  const now = new Date();

  // If there was a previous adjustment, calculate elapsed months from that adjustment
  const lastAdjDateStr = meta?.lastAdjustmentDate;
  const referenceDate = lastAdjDateStr ? new Date(lastAdjDateStr) : startDate;

  // Calculate difference in months
  const diffYears = now.getFullYear() - referenceDate.getFullYear();
  const diffMonths = (diffYears * 12) + (now.getMonth() - referenceDate.getMonth());
  const totalMonthsActive = Math.max(0, (now.getFullYear() - startDate.getFullYear()) * 12 + (now.getMonth() - startDate.getMonth()));
  const yearsActive = Math.floor(totalMonthsActive / 12);

  // Eligible if 11+ months have elapsed since last reference date and price is greater than zero
  const isEligibleForAdjustment = diffMonths >= 11 && currentPrice > 0 && client.active !== false;

  const anniversaryMonthIndex = startDate.getMonth();
  const anniversaryMonthName = MONTH_NAMES[anniversaryMonthIndex] || '';

  return {
    clientId: client.id,
    clientName: client.name,
    clientPhone: client.phone || client.local_phone || '',
    startDate: rawStartDate.split('T')[0],
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
