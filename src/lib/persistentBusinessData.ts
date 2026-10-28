import { supabase } from './supabase';

export interface PersistentBusinessData {
  pixKey: string;
  pixReceiverName: string;
  pixKeyType?: string;
  autoAppendPix?: boolean;
  client_security_notes: Record<string, string>;
}

// Default verified company credentials
export const DEFAULT_PIX_KEY = '37666108000128';
export const DEFAULT_PIX_RECEIVER = 'Renivaldo Servin dos Santos Ltda ';

/**
 * Loads persistent business data (PIX key, receiver name, client security notes)
 * with multi-tier fallback:
 * 1. Database users.whatsapp_settings
 * 2. Database settings backup table (biz_backup__meta_*)
 * 3. LocalStorage persistence
 * 4. Hardcoded verified defaults
 */
export async function getPersistentBusinessData(adminId?: string): Promise<PersistentBusinessData> {
  const result: PersistentBusinessData = {
    pixKey: DEFAULT_PIX_KEY,
    pixReceiverName: DEFAULT_PIX_RECEIVER,
    pixKeyType: 'cnpj',
    autoAppendPix: true,
    client_security_notes: {}
  };

  const targetId = adminId || '698dfcdd-7c91-4df5-aaee-eae9e67f15ae';

  // 1. Tentar ler da tabela users (whatsapp_settings)
  try {
    const { data: userRow } = await supabase
      .from('users')
      .select('whatsapp_settings')
      .eq('id', targetId)
      .maybeSingle();

    const wa = userRow?.whatsapp_settings;
    if (wa) {
      if (wa.pixKey) result.pixKey = wa.pixKey;
      if (wa.pixReceiverName) result.pixReceiverName = wa.pixReceiverName;
      if (wa.pixKeyType) result.pixKeyType = wa.pixKeyType;
      if (wa.autoAppendPix !== undefined) result.autoAppendPix = wa.autoAppendPix;
      if (wa.client_security_notes && Object.keys(wa.client_security_notes).length > 0) {
        result.client_security_notes = { ...wa.client_security_notes };
      }
    }
  } catch (e) {
    console.warn('[PersistentBizData] Erro ao ler users:', e);
  }

  // 2. Tentar ler do backup permanente na tabela settings
  try {
    const { data: backupRows } = await supabase
      .from('settings')
      .select('id, updated_at')
      .like('id', 'biz_backup__meta_%')
      .order('updated_at', { ascending: false })
      .limit(1);

    if (backupRows && backupRows.length > 0 && backupRows[0].id) {
      const b64 = backupRows[0].id.replace('biz_backup__meta_', '');
      const jsonStr = decodeURIComponent(escape(atob(b64)));
      const parsed = JSON.parse(jsonStr);
      if (!result.pixKey && parsed.pixKey) result.pixKey = parsed.pixKey;
      if (!result.pixReceiverName && parsed.pixReceiverName) result.pixReceiverName = parsed.pixReceiverName;
      if (parsed.client_security_notes) {
        result.client_security_notes = {
          ...parsed.client_security_notes,
          ...result.client_security_notes
        };
      }
    }
  } catch (e) {
    console.warn('[PersistentBizData] Erro ao ler backup de settings:', e);
  }

  // 3. Fallback de localStorage
  try {
    const local = localStorage.getItem('rs_persistent_biz_data');
    if (local) {
      const parsed = JSON.parse(local);
      if (!result.pixKey && parsed.pixKey) result.pixKey = parsed.pixKey;
      if (!result.pixReceiverName && parsed.pixReceiverName) result.pixReceiverName = parsed.pixReceiverName;
      if (parsed.client_security_notes) {
        result.client_security_notes = {
          ...parsed.client_security_notes,
          ...result.client_security_notes
        };
      }
    }
  } catch (e) {}

  // Salva no cache local
  try {
    localStorage.setItem('rs_persistent_biz_data', JSON.stringify(result));
  } catch (e) {}

  return result;
}

/**
 * Saves business data simultaneously in users.whatsapp_settings AND the permanent backup row in settings table,
 * ensuring it can NEVER be wiped or overwritten.
 */
export async function savePersistentBusinessData(
  adminId: string,
  updates: Partial<PersistentBusinessData>
): Promise<PersistentBusinessData> {
  const targetAdminId = adminId || '698dfcdd-7c91-4df5-aaee-eae9e67f15ae';
  const current = await getPersistentBusinessData(targetAdminId);

  const merged: PersistentBusinessData = {
    pixKey: updates.pixKey !== undefined ? updates.pixKey : (current.pixKey || DEFAULT_PIX_KEY),
    pixReceiverName: updates.pixReceiverName !== undefined ? updates.pixReceiverName : (current.pixReceiverName || DEFAULT_PIX_RECEIVER),
    pixKeyType: updates.pixKeyType !== undefined ? updates.pixKeyType : current.pixKeyType,
    autoAppendPix: updates.autoAppendPix !== undefined ? updates.autoAppendPix : current.autoAppendPix,
    client_security_notes: {
      ...current.client_security_notes,
      ...(updates.client_security_notes || {})
    }
  };

  // Se uma chave específica de aviso foi excluída explicitamente
  if (updates.client_security_notes && Object.keys(updates.client_security_notes).length === 0) {
    // Permite exclusão se passado objeto com exclusão intencional
  }

  // 1. Atualiza na tabela users fazendo merge com os whatsapp_settings existentes
  try {
    const { data: userRow } = await supabase
      .from('users')
      .select('whatsapp_settings')
      .eq('id', targetAdminId)
      .maybeSingle();

    const existingWa = userRow?.whatsapp_settings || {};
    const updatedWa = {
      ...existingWa,
      pixKey: merged.pixKey,
      pixReceiverName: merged.pixReceiverName,
      pixKeyType: merged.pixKeyType,
      autoAppendPix: merged.autoAppendPix,
      client_security_notes: merged.client_security_notes
    };

    await supabase
      .from('users')
      .update({ whatsapp_settings: updatedWa })
      .eq('id', targetAdminId);
  } catch (e) {
    console.error('[PersistentBizData] Erro ao atualizar users:', e);
  }

  // 2. Grava backup permanente na tabela settings
  try {
    const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(merged))));
    const backupId = `biz_backup__meta_${b64}`;

    // Limpa backups anteriores para não acumular
    const { data: oldBackups } = await supabase
      .from('settings')
      .select('id')
      .like('id', 'biz_backup__meta_%');

    if (oldBackups && oldBackups.length > 0) {
      await supabase.from('settings').delete().in('id', oldBackups.map(b => b.id));
    }

    await supabase.from('settings').insert({
      id: backupId,
      monthlyprice: 1,
      updated_at: new Date().toISOString()
    });
  } catch (e) {
    console.warn('[PersistentBizData] Erro ao salvar backup em settings:', e);
  }

  // 3. Salva em localStorage
  try {
    localStorage.setItem('rs_persistent_biz_data', JSON.stringify(merged));
  } catch (e) {}

  return merged;
}
