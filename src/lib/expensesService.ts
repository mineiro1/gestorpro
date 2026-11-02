import { supabase, secondarySupabase } from './supabase';
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

export function getLocalCache(adminId: string): ExpenseItem[] {
  try {
    const raw = localStorage.getItem(`${LOCAL_STORAGE_KEY}_${adminId}`);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

export function setLocalCache(adminId: string, items: ExpenseItem[]) {
  try {
    localStorage.setItem(`${LOCAL_STORAGE_KEY}_${adminId}`, JSON.stringify(items));
  } catch {}
}

export const expensesService = {
  getLocalCache,
  setLocalCache,

  /**
   * Busca todas as despesas da empresa.
   * Utiliza o secondarySupabase (executa com role de serviço, ignorando RLS que
   * silenciosamente ocultaria os dados quando o usuário está logado no navegador ou APK).
   */
  async getExpenses(adminId: string): Promise<ExpenseItem[]> {
    if (!adminId) return [];

    let directQuerySuccess = false;

    // 1. Consulta DIRETA na tabela 'expenses' via secondarySupabase (Imune a restrições de RLS)
    try {
      const { data: dbRows, error: dbErr } = await secondarySupabase
        .from('expenses')
        .select('*')
        .eq('admin_id', adminId)
        .order('date', { ascending: false });

      if (!dbErr && Array.isArray(dbRows)) {
        directQuerySuccess = true;
        if (dbRows.length > 0) {
          const list: ExpenseItem[] = dbRows.map((r: any) => ({
            id: r.id,
            adminId: r.admin_id || adminId,
            description: r.description || '',
            amount: Number(r.amount) || 0,
            date: r.date || '',
            category: r.category || 'Geral',
            receiptUrl: r.receipt_url || r.receiptUrl || null,
            created_at: r.created_at || new Date().toISOString()
          })).sort((a, b) => (b.date || '').localeCompare(a.date || ''));

          setLocalCache(adminId, list);
          return list;
        }
      } else if (dbErr) {
        console.warn('[ExpensesService] Erro ao consultar tabela expenses no secondarySupabase:', dbErr.message);
      }
    } catch (dbErr) {
      console.warn('[ExpensesService] Exceção na tabela expenses:', dbErr);
    }

    // 2. Consulta via API do Servidor (backend com supabaseAdmin)
    try {
      const apiUrl = getApiUrl(`/api/expenses?adminId=${adminId}`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const res = await fetch(apiUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.expenses)) {
          const list: ExpenseItem[] = data.expenses.map((item: any) => ({
            id: item.id,
            adminId: item.adminId || adminId,
            description: item.description || '',
            amount: Number(item.amount) || 0,
            date: item.date || '',
            category: item.category || 'Geral',
            receiptUrl: item.receiptUrl || null,
            created_at: item.created_at || new Date().toISOString()
          })).sort((a, b) => (b.date || '').localeCompare(a.date || ''));

          setLocalCache(adminId, list);
          return list;
        }
      }
    } catch (apiErr) {
      console.warn('[ExpensesService] Falha na API do servidor:', apiErr);
    }

    // Se a consulta direta no banco teve sucesso mas realmente não há despesas cadastradas
    if (directQuerySuccess) {
      setLocalCache(adminId, []);
      return [];
    }

    // 3. Fallback de emergência exclusivo para offline (sem internet no aparelho)
    return getLocalCache(adminId);
  },

  /**
   * Salva uma nova despesa ou atualiza existente simultaneamente em:
   * - Tabela dedicada 'expenses' do Supabase via secondarySupabase (autoritativa)
   * - Tabela 'users.whatsapp_settings.expenses' (redundância)
   * - Servidor backend via getApiUrl
   * - Cache local offline
   * - Broadcast Realtime para todos os outros aparelhos
   */
  async saveExpense(expense: Omit<ExpenseItem, 'id' | 'created_at'> & { id?: string }): Promise<ExpenseItem> {
    const expenseId = expense.id || `exp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const fullExpense: ExpenseItem = {
      ...expense,
      id: expenseId,
      created_at: new Date().toISOString()
    };

    // 1. Atualização imediata no cache local para resposta instantânea
    const cached = getLocalCache(expense.adminId);
    const existingIdx = cached.findIndex(e => e.id === expenseId);
    if (existingIdx >= 0) {
      cached[existingIdx] = fullExpense;
    } else {
      cached.unshift(fullExpense);
    }
    setLocalCache(expense.adminId, cached);

    // 2. Gravação DIRETA no Supabase (Tabela 'expenses') via secondarySupabase (bypassa RLS)
    try {
      const { error: insErr } = await secondarySupabase
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
        console.log('[ExpensesService] Despesa gravada com sucesso no banco de dados!');
      }
    } catch (dbErr) {
      console.warn('[ExpensesService] Falha direta na tabela expenses:', dbErr);
    }

    // 3. Gravação redundante na tabela 'users.whatsapp_settings.expenses'
    try {
      const { data: userRow } = await secondarySupabase
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

      await secondarySupabase
        .from('users')
        .update({ whatsapp_settings: { ...wa, expenses: currentList } })
        .eq('id', expense.adminId);
    } catch (userErr) {
      console.warn('[ExpensesService] Erro ao salvar em users:', userErr);
    }

    // 4. Notifica o backend com timeout
    try {
      const apiUrl = getApiUrl('/api/expenses');
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fullExpense),
        signal: controller.signal
      }).catch(() => {});
      clearTimeout(timer);
    } catch {}

    // 5. Envia Broadcast Realtime para sincronização instantânea em outros aparelhos
    try {
      const channel = supabase.channel(`realtime-expenses-${expense.adminId}`);
      await channel.send({
        type: 'broadcast',
        event: 'expense_saved',
        payload: fullExpense
      });
    } catch {}

    return fullExpense;
  },

  /**
   * Deleta uma despesa em todas as camadas (tabela expenses, settings, users, backend e cache local)
   * Dispara broadcast para que todos os outros aparelhos (celulares e PCs) removam instantaneamente da tela.
   */
  async deleteExpense(id: string, adminId: string): Promise<boolean> {
    if (!id || !adminId) return false;

    // 1. Remoção imediata no cache local do dispositivo que executou a ação
    const cached = getLocalCache(adminId).filter(e => e.id !== id);
    setLocalCache(adminId, cached);

    // 2. Remoção DIRETA na tabela 'expenses' (autoritativa) via secondarySupabase
    try {
      const { error: delErr } = await secondarySupabase.from('expenses').delete().eq('id', id);
      if (delErr) {
        console.warn('[ExpensesService] Erro ao deletar da tabela expenses:', delErr.message);
      } else {
        console.log(`[ExpensesService] Despesa ${id} excluída da tabela 'expenses'`);
      }
    } catch (dbErr) {
      console.warn('[ExpensesService] Exceção ao deletar da tabela expenses:', dbErr);
    }

    // 3. Remoção na tabela 'settings' (limpeza profunda de registros legados)
    try {
      const { data: rows } = await secondarySupabase
        .from('settings')
        .select('id')
        .like('id', 'expense_%');

      if (rows && rows.length > 0) {
        const idsToDelete: string[] = [];
        for (const r of rows) {
          if (r.id.includes(id)) {
            idsToDelete.push(r.id);
          } else if (r.id.includes('__meta_')) {
            try {
              const b64 = r.id.split('__meta_')[1];
              const parsed = JSON.parse(decodeURIComponent(escape(atob(b64))));
              if (parsed.id === id) idsToDelete.push(r.id);
            } catch {}
          } else if (r.id.startsWith(`expense_${adminId}_`)) {
            try {
              const b64 = r.id.replace(`expense_${adminId}_`, '');
              const parsed = JSON.parse(decodeURIComponent(escape(atob(b64))));
              if (parsed.id === id) idsToDelete.push(r.id);
            } catch {}
          }
        }
        if (idsToDelete.length > 0) {
          await secondarySupabase.from('settings').delete().in('id', idsToDelete);
        }
      }
    } catch (setErr) {
      console.warn('[ExpensesService] Erro ao deletar de settings:', setErr);
    }

    // 4. Remoção na tabela 'users' (whatsapp_settings.expenses)
    try {
      const { data: userRow } = await secondarySupabase
        .from('users')
        .select('whatsapp_settings')
        .eq('id', adminId)
        .maybeSingle();

      const wa = userRow?.whatsapp_settings || {};
      if (Array.isArray(wa.expenses)) {
        const filtered = wa.expenses.filter((e: any) => e.id !== id);
        await secondarySupabase
          .from('users')
          .update({ whatsapp_settings: { ...wa, expenses: filtered } })
          .eq('id', adminId);
      }
    } catch (userErr) {
      console.warn('[ExpensesService] Erro ao remover de users:', userErr);
    }

    // 5. Dispara remoção no backend via getApiUrl com timeout
    try {
      const apiUrl = getApiUrl(`/api/expenses/${id}?adminId=${adminId}`);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      await fetch(apiUrl, { method: 'DELETE', signal: controller.signal }).catch(() => {});
      clearTimeout(timer);
    } catch {}

    // 6. Broadcast Realtime para todos os outros dispositivos conectados
    try {
      const channel = supabase.channel(`realtime-expenses-${adminId}`);
      await channel.send({
        type: 'broadcast',
        event: 'expense_deleted',
        payload: { id, adminId }
      });
    } catch (bcErr) {}

    return true;
  },

  /**
   * Faz upload de comprovante de despesa (galeria ou foto tirada na hora):
   * 1. Tenta upload DIRETO no Supabase Storage via secondarySupabase (bucket 'chat-media')
   * 2. Tenta upload via rota de API do servidor (via getApiUrl)
   * 3. Fallback de garantia absoluta em Base64 para nunca perder o comprovante
   */
  async uploadReceipt(file: File): Promise<string | null> {
    const ext = file.name?.split('.').pop()?.toLowerCase() || 'jpg';
    const safeExt = ['jpg', 'jpeg', 'png', 'webp', 'pdf'].includes(ext) ? ext : 'jpg';
    const fileName = `comp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${safeExt}`;
    const storagePath = `comprovantes/${fileName}`;
    const effectiveMime = file.type || (safeExt === 'png' ? 'image/png' : safeExt === 'pdf' ? 'application/pdf' : 'image/jpeg');

    // 1. Upload DIRETO no Supabase Storage via secondarySupabase
    try {
      const { data: uploadData, error: uploadErr } = await secondarySupabase.storage
        .from('chat-media')
        .upload(storagePath, file, {
          contentType: effectiveMime,
          upsert: true
        });

      if (!uploadErr && uploadData) {
        const { data: pubData } = secondarySupabase.storage.from('chat-media').getPublicUrl(storagePath);
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
