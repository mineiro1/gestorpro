import { supabase } from './supabase';
import { getApiUrl } from './apiConfig';

export interface ExpenseItem {
  id: string;
  adminId: string;
  description: string;
  amount: number;
  date: string; // YYYY-MM-DD
  receiptUrl?: string | null;
  category?: string;
  created_at: string;
}

const LOCAL_STORAGE_KEY = 'rs_expenses_cache';

function getLocalCache(adminId: string): ExpenseItem[] {
  try {
    const raw = localStorage.getItem(`${LOCAL_STORAGE_KEY}_${adminId}`);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

function setLocalCache(adminId: string, items: ExpenseItem[]) {
  try {
    localStorage.setItem(`${LOCAL_STORAGE_KEY}_${adminId}`, JSON.stringify(items));
  } catch {}
}

export const expensesService = {
  /**
   * Busca todas as despesas da empresa com tripla redundância:
   * 1. Consulta direta na tabela 'expenses' do Supabase (funciona nativamente no Android e Web)
   * 2. Rota de API via getApiUrl (consolidação do servidor)
   * 3. Fallback na tabela 'settings' (linhas expense_*) e 'users.whatsapp_settings.expenses'
   * 4. Cache local offline (localStorage)
   */
  async getExpenses(adminId: string): Promise<ExpenseItem[]> {
    if (!adminId) return [];

    const expensesMap = new Map<string, ExpenseItem>();

    // 1. Consulta DIRETA na tabela 'expenses' do Supabase
    try {
      const { data: dbRows, error: dbErr } = await supabase
        .from('expenses')
        .select('*')
        .eq('admin_id', adminId)
        .order('date', { ascending: false });

      if (!dbErr && Array.isArray(dbRows) && dbRows.length > 0) {
        dbRows.forEach((r: any) => {
          const item: ExpenseItem = {
            id: r.id,
            adminId: r.admin_id || adminId,
            description: r.description || '',
            amount: Number(r.amount) || 0,
            date: r.date || '',
            category: r.category || 'Geral',
            receiptUrl: r.receipt_url || r.receiptUrl || null,
            created_at: r.created_at || new Date().toISOString()
          };
          expensesMap.set(item.id, item);
        });

        const list = Array.from(expensesMap.values()).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        setLocalCache(adminId, list);
        return list;
      }
    } catch (dbErr) {
      console.warn('[ExpensesService] Falha ao consultar tabela expenses no Supabase:', dbErr);
    }

    // 2. Consulta via API do Servidor (usando getApiUrl para compatibilidade com Android APK e Web)
    try {
      const apiUrl = getApiUrl(`/api/expenses?adminId=${adminId}`);
      const res = await fetch(apiUrl);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.expenses) && data.expenses.length > 0) {
          data.expenses.forEach((item: ExpenseItem) => {
            if (item && item.id) expensesMap.set(item.id, item);
          });
          const list = Array.from(expensesMap.values()).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
          setLocalCache(adminId, list);
          return list;
        }
      }
    } catch (apiErr) {
      console.warn('[ExpensesService] Falha na API do servidor:', apiErr);
    }

    // 3. Fallback na tabela 'settings' (backup em linhas individuais expense_*)
    try {
      const { data: settingRows } = await supabase
        .from('settings')
        .select('id, monthlyprice, updated_at')
        .like('id', 'expense_%');

      if (settingRows && settingRows.length > 0) {
        for (const row of settingRows) {
          try {
            const rawId = row.id || '';
            const parts = rawId.split('__meta_');
            if (parts.length > 1) {
              const b64 = parts[1];
              const jsonStr = decodeURIComponent(escape(atob(b64)));
              const parsed = JSON.parse(jsonStr);
              if (parsed && parsed.id && (parsed.adminId === adminId || !parsed.adminId)) {
                expensesMap.set(parsed.id, {
                  ...parsed,
                  amount: Number(parsed.amount) || Number(row.monthlyprice) || 0
                });
              }
            }
          } catch {}
        }
      }
    } catch (setErr) {
      console.warn('[ExpensesService] Erro ao ler backup em settings:', setErr);
    }

    // 4. Fallback no campo 'users.whatsapp_settings.expenses'
    try {
      const { data: userRow } = await supabase
        .from('users')
        .select('whatsapp_settings')
        .eq('id', adminId)
        .maybeSingle();

      const waExpenses = userRow?.whatsapp_settings?.expenses;
      if (Array.isArray(waExpenses) && waExpenses.length > 0) {
        waExpenses.forEach((exp: any) => {
          if (exp && exp.id && !expensesMap.has(exp.id)) {
            expensesMap.set(exp.id, {
              ...exp,
              amount: Number(exp.amount) || 0
            });
          }
        });
      }
    } catch (userErr) {
      console.warn('[ExpensesService] Erro ao ler users:', userErr);
    }

    if (expensesMap.size > 0) {
      const list = Array.from(expensesMap.values()).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      setLocalCache(adminId, list);
      return list;
    }

    // 5. Fallback final: Cache local offline
    const cached = getLocalCache(adminId);
    if (cached.length > 0) return cached;

    return [];
  },

  /**
   * Salva uma nova despesa ou atualiza existente simultaneamente em:
   * - Tabela dedicada 'expenses' do Supabase
   * - Tabela 'settings' (backup redundante)
   * - Tabela 'users.whatsapp_settings.expenses'
   * - Rota de API via getApiUrl
   * - Cache local offline
   */
  async saveExpense(expense: Omit<ExpenseItem, 'id' | 'created_at'> & { id?: string }): Promise<ExpenseItem> {
    const expenseId = expense.id || `exp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const fullExpense: ExpenseItem = {
      ...expense,
      id: expenseId,
      created_at: new Date().toISOString()
    };

    // 1. Atualização otimista no cache local
    const cached = getLocalCache(expense.adminId);
    const existingIdx = cached.findIndex(e => e.id === expenseId);
    if (existingIdx >= 0) {
      cached[existingIdx] = fullExpense;
    } else {
      cached.unshift(fullExpense);
    }
    setLocalCache(expense.adminId, cached);

    // 2. Gravação DIRETA no Supabase (Tabela 'expenses')
    try {
      const { error: insErr } = await supabase
        .from('expenses')
        .upsert({
          id: fullExpense.id,
          admin_id: expense.adminId,
          description: fullExpense.description,
          amount: fullExpense.amount,
          date: fullExpense.date,
          category: fullExpense.category || 'Geral',
          receipt_url: fullExpense.receiptUrl || null,
          created_at: fullExpense.created_at,
          updated_at: new Date().toISOString()
        });

      if (insErr) {
        console.warn('[ExpensesService] Erro ao salvar na tabela expenses:', insErr.message);
      } else {
        console.log('[ExpensesService] Despesa salva com sucesso na tabela expenses do Supabase!');
      }
    } catch (dbErr) {
      console.warn('[ExpensesService] Falha direta na tabela expenses:', dbErr);
    }

    // 3. Gravação redundante na tabela 'settings'
    try {
      const metaObj = {
        id: fullExpense.id,
        adminId: expense.adminId,
        description: fullExpense.description,
        amount: fullExpense.amount,
        date: fullExpense.date,
        category: fullExpense.category || 'Geral',
        receiptUrl: fullExpense.receiptUrl || null,
        created_at: fullExpense.created_at
      };
      const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(metaObj))));
      const rowId = `expense_${fullExpense.id}__meta_${b64}`;

      await supabase.from('settings').upsert({
        id: rowId,
        monthlyprice: fullExpense.amount,
        updated_at: new Date().toISOString()
      });
    } catch (setErr) {
      console.warn('[ExpensesService] Erro ao salvar backup em settings:', setErr);
    }

    // 4. Gravação na tabela 'users.whatsapp_settings.expenses'
    try {
      const { data: userRow } = await supabase
        .from('users')
        .select('whatsapp_settings')
        .eq('id', expense.adminId)
        .maybeSingle();

      const wa = userRow?.whatsapp_settings || {};
      const currentList: ExpenseItem[] = Array.isArray(wa.expenses) ? [...wa.expenses] : [];
      const idx = currentList.findIndex(e => e.id === expenseId);
      if (idx >= 0) {
        currentList[idx] = fullExpense;
      } else {
        currentList.unshift(fullExpense);
      }

      await supabase
        .from('users')
        .update({ whatsapp_settings: { ...wa, expenses: currentList } })
        .eq('id', expense.adminId);
    } catch (userErr) {
      console.warn('[ExpensesService] Erro ao salvar em users:', userErr);
    }

    // 5. Dispara sincronização com o backend (sem bloquear em caso de offline/rede restrita)
    try {
      const apiUrl = getApiUrl('/api/expenses');
      fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fullExpense)
      }).catch(err => {
        console.warn('[ExpensesService] Sincronização secundária com backend em segundo plano:', err);
      });
    } catch {}

    return fullExpense;
  },

  /**
   * Deleta uma despesa em todas as camadas (tabela expenses, settings, users, backend e cache)
   */
  async deleteExpense(id: string, adminId: string): Promise<boolean> {
    if (!id || !adminId) return false;

    // 1. Atualização otimista no cache local
    const cached = getLocalCache(adminId).filter(e => e.id !== id);
    setLocalCache(adminId, cached);

    // 2. Remoção DIRETA na tabela 'expenses'
    try {
      await supabase.from('expenses').delete().eq('id', id);
    } catch (dbErr) {
      console.warn('[ExpensesService] Erro ao deletar da tabela expenses:', dbErr);
    }

    // 3. Remoção na tabela 'settings'
    try {
      const { data: rows } = await supabase
        .from('settings')
        .select('id')
        .like('id', `expense_${id}%`);

      if (rows && rows.length > 0) {
        await supabase.from('settings').delete().in('id', rows.map(r => r.id));
      }
    } catch (setErr) {
      console.warn('[ExpensesService] Erro ao deletar da tabela settings:', setErr);
    }

    // 4. Remoção na tabela 'users'
    try {
      const { data: userRow } = await supabase
        .from('users')
        .select('whatsapp_settings')
        .eq('id', adminId)
        .maybeSingle();

      const wa = userRow?.whatsapp_settings || {};
      if (Array.isArray(wa.expenses)) {
        const filtered = wa.expenses.filter((e: any) => e.id !== id);
        await supabase
          .from('users')
          .update({ whatsapp_settings: { ...wa, expenses: filtered } })
          .eq('id', adminId);
      }
    } catch (userErr) {
      console.warn('[ExpensesService] Erro ao remover de users:', userErr);
    }

    // 5. Dispara remoção no backend via getApiUrl
    try {
      const apiUrl = getApiUrl(`/api/expenses/${id}?adminId=${adminId}`);
      fetch(apiUrl, { method: 'DELETE' }).catch(() => {});
    } catch {}

    return true;
  },

  /**
   * Faz upload de comprovante de despesa (galeria ou foto tirada na hora):
   * 1. Tenta upload DIRETO no Supabase Storage (bucket público 'chat-media', pasta 'comprovantes/')
   *    Isso funciona instantaneamente do celular e computador sem depender do servidor local!
   * 2. Tenta upload via rota de API do servidor (via getApiUrl)
   * 3. Fallback de garantia absoluta em Base64 para nunca perder o comprovante
   */
  async uploadReceipt(file: File): Promise<string | null> {
    const ext = file.name?.split('.').pop()?.toLowerCase() || 'jpg';
    const safeExt = ['jpg', 'jpeg', 'png', 'webp', 'pdf'].includes(ext) ? ext : 'jpg';
    const fileName = `comp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${safeExt}`;
    const storagePath = `comprovantes/${fileName}`;
    const effectiveMime = file.type || (safeExt === 'png' ? 'image/png' : safeExt === 'pdf' ? 'application/pdf' : 'image/jpeg');

    // 1. Upload DIRETO no Supabase Storage
    try {
      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from('chat-media')
        .upload(storagePath, file, {
          contentType: effectiveMime,
          upsert: true
        });

      if (!uploadErr && uploadData) {
        const { data: pubData } = supabase.storage.from('chat-media').getPublicUrl(storagePath);
        if (pubData?.publicUrl) {
          console.log('[ExpensesService] Comprovante enviado diretamente ao Supabase Storage:', pubData.publicUrl);
          return pubData.publicUrl;
        }
      } else if (uploadErr) {
        console.warn('[ExpensesService] Falha no upload direto ao Storage:', uploadErr.message);
      }
    } catch (stErr) {
      console.warn('[ExpensesService] Exceção no upload direto ao Supabase Storage:', stErr);
    }

    // 2. Converte para base64 para tentar API e fallback
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = async () => {
        const fileBase64 = reader.result as string;

        // Tenta enviar via rota de backend se disponível
        try {
          const uploadApiUrl = getApiUrl('/api/expenses/upload-receipt');
          const res = await fetch(uploadApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fileBase64,
              fileName: file.name,
              mimeType: effectiveMime
            })
          });

          if (res.ok) {
            const data = await res.json();
            if (data.success && data.url) {
              resolve(data.url);
              return;
            }
          }
        } catch (apiErr) {
          console.warn('[ExpensesService] Erro no upload via servidor:', apiErr);
        }

        // 3. Fallback de garantia: Preserva em Base64
        console.log('[ExpensesService] Utilizando Base64 como garantia de preservação do comprovante.');
        resolve(fileBase64);
      };

      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  }
};
