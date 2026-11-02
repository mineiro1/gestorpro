import { supabase } from './supabase';

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
   * Busca todas as despesas da empresa com persistência resiliente
   */
  async getExpenses(adminId: string): Promise<ExpenseItem[]> {
    if (!adminId) return [];

    let list: ExpenseItem[] = [];

    // 1. Tenta carregar via API do servidor (mais rápido e consolida DB + disco)
    try {
      const res = await fetch(`/api/expenses?adminId=${adminId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.expenses)) {
          list = data.expenses;
          setLocalCache(adminId, list);
          return list;
        }
      }
    } catch (e) {
      console.warn('[ExpensesService] Falha na rota /api/expenses, usando fallback direto no Supabase:', e);
    }

    // 2. Fallback direto no Supabase (users.whatsapp_settings.expenses)
    try {
      const { data: userRow } = await supabase
        .from('users')
        .select('whatsapp_settings')
        .eq('id', adminId)
        .maybeSingle();

      const waExpenses = userRow?.whatsapp_settings?.expenses;
      if (Array.isArray(waExpenses) && waExpenses.length > 0) {
        list = waExpenses;
        setLocalCache(adminId, list);
        return list;
      }
    } catch (err) {
      console.warn('[ExpensesService] Erro ao ler users:', err);
    }

    // 3. Fallback do cache local
    const cached = getLocalCache(adminId);
    if (cached.length > 0) return cached;

    return [];
  },

  /**
   * Salva uma nova despesa ou atualiza existente
   */
  async saveExpense(expense: Omit<ExpenseItem, 'id' | 'created_at'> & { id?: string }): Promise<ExpenseItem> {
    const expenseId = expense.id || `exp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const fullExpense: ExpenseItem = {
      ...expense,
      id: expenseId,
      created_at: new Date().toISOString()
    };

    // Atualização otimista no cache local
    const cached = getLocalCache(expense.adminId);
    const existingIdx = cached.findIndex(e => e.id === expenseId);
    if (existingIdx >= 0) {
      cached[existingIdx] = fullExpense;
    } else {
      cached.unshift(fullExpense);
    }
    setLocalCache(expense.adminId, cached);

    // Dispara salvamento no backend
    try {
      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fullExpense)
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.expense) {
          return data.expense;
        }
      }
    } catch (err) {
      console.warn('[ExpensesService] Falha ao salvar via API, tentando fallback Supabase:', err);
      // Fallback direto no Supabase
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
      } catch (dbErr) {
        console.error('[ExpensesService] Erro crítico ao salvar no Supabase:', dbErr);
      }
    }

    return fullExpense;
  },

  /**
   * Deleta uma despesa (só é removida quando o usuário clica no botão de deletar)
   */
  async deleteExpense(id: string, adminId: string): Promise<boolean> {
    if (!id || !adminId) return false;

    // Atualização otimista no cache local
    const cached = getLocalCache(adminId).filter(e => e.id !== id);
    setLocalCache(adminId, cached);

    try {
      const res = await fetch(`/api/expenses/${id}?adminId=${adminId}`, {
        method: 'DELETE'
      });
      if (res.ok) return true;
    } catch (err) {
      console.warn('[ExpensesService] Erro ao deletar via API:', err);
    }

    // Fallback no Supabase
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
        return true;
      }
    } catch (dbErr) {
      console.error('[ExpensesService] Erro ao remover do Supabase:', dbErr);
    }

    return true;
  },

  /**
   * Faz upload de comprovante de despesa (galeria ou foto tirada na hora)
   */
  async uploadReceipt(file: File): Promise<string | null> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = async () => {
        const fileBase64 = reader.result as string;
        try {
          const res = await fetch('/api/expenses/upload-receipt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fileBase64,
              fileName: file.name,
              mimeType: file.type
            })
          });

          if (res.ok) {
            const data = await res.json();
            if (data.success && data.url) {
              resolve(data.url);
              return;
            }
          }
          // Se o servidor retornar sem URL, preserva a imagem em Base64
          console.warn('[ExpensesService] Resposta sem URL de imagem, usando Base64 como garantia');
          resolve(fileBase64);
        } catch (err) {
          console.error('[ExpensesService] Erro no upload do comprovante, usando Base64 resiliente:', err);
          // Garantia absoluta: nunca perde o comprovante mesmo offline
          resolve(fileBase64);
        }
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  }
};
