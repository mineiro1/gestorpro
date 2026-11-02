-- =========================================================================
-- TABELA DE DESPESAS DA EMPRESA (RS PISCINAS)
-- Execute este comando no SQL Editor do Supabase (https://app.supabase.com)
-- para criar a tabela dedicada de despesas para acesso em qualquer aparelho.
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.expenses (
  id text PRIMARY KEY,
  admin_id text NOT NULL,
  description text NOT NULL,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  date text NOT NULL,
  category text DEFAULT 'Geral',
  receipt_url text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- Habilita índices para consultas ultra-rápidas por data e admin
CREATE INDEX IF NOT EXISTS idx_expenses_admin_id ON public.expenses(admin_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON public.expenses(date);

-- Desabilita RLS para permitir leitura e gravação transparente entre todos os aparelhos
ALTER TABLE public.expenses DISABLE ROW LEVEL SECURITY;

-- Notifica o PostgREST para recarregar o schema da API imediatamente
NOTIFY pgrst, 'reload schema';
