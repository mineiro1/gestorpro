import { SupabaseClient } from '@supabase/supabase-js';

export const CHAT_WINDOW_MS = 30 * 60 * 1000; // 30 minutos

/**
 * Converte qualquer timestamp do Supabase/Postgres (UTC) de forma segura para milissegundos UTC.
 */
export function parseUtcMs(timestamp?: string | null): number {
  if (!timestamp) return 0;
  const str = timestamp.trim();
  const normalized = str.endsWith('Z') || str.includes('+')
    ? str
    : `${str}Z`;
  const ms = Date.parse(normalized);
  return isNaN(ms) ? 0 : ms;
}

/**
 * Obtém o início e o fim do dia civil local atual (00:00:00.000 até 23:59:59.999),
 * convertidos para strings ISO em UTC para consultas no Supabase.
 * Isso garante que fusos horários locais (ex: UTC-4 Mato Grosso do Sul, UTC-3 Brasília)
 * determinem a virada da meia-noite (00:00) perfeitamente.
 */
export function getLocalDayUtcRange(targetDate: Date = new Date()) {
  const startOfLocalDay = new Date(
    targetDate.getFullYear(),
    targetDate.getMonth(),
    targetDate.getDate(),
    0, 0, 0, 0
  );
  const endOfLocalDay = new Date(
    targetDate.getFullYear(),
    targetDate.getMonth(),
    targetDate.getDate(),
    23, 59, 59, 999
  );

  // String YYYY-MM-DD local
  const year = targetDate.getFullYear();
  const month = String(targetDate.getMonth() + 1).padStart(2, '0');
  const day = String(targetDate.getDate()).padStart(2, '0');
  const localDateStr = `${year}-${month}-${day}`;

  return {
    startUtcIso: startOfLocalDay.toISOString(),
    endUtcIso: endOfLocalDay.toISOString(),
    localDateStr
  };
}

export interface SessionExpiryEvaluation {
  isExpired: boolean;
  timeLeftMs: number;
  secondsRemaining: number;
}

/**
 * Avalia se uma sessão expirou a janela de 30 minutos a partir do created_at.
 */
export function evaluateSessionExpiry(
  session: { created_at?: string; closed_at?: string | null; status?: string } | null | undefined,
  currentUtcMs: number = Date.now()
): SessionExpiryEvaluation {
  if (!session) {
    return { isExpired: true, timeLeftMs: 0, secondsRemaining: 0 };
  }

  if (session.status === 'closed') {
    return { isExpired: true, timeLeftMs: 0, secondsRemaining: 0 };
  }

  const createdMs = parseUtcMs(session.created_at);
  if (createdMs === 0) {
    return { isExpired: true, timeLeftMs: 0, secondsRemaining: 0 };
  }

  const elapsedMs = Math.max(0, currentUtcMs - createdMs);
  const remainingMs = Math.max(0, CHAT_WINDOW_MS - elapsedMs);

  return {
    isExpired: remainingMs <= 0,
    timeLeftMs: remainingMs,
    secondsRemaining: Math.ceil(remainingMs / 1000)
  };
}

export interface DailyChatCheckResult {
  canStartNewSession: boolean;
  activeSession: any | null;
  lastSession: any | null;
  dailyLimitReached: boolean;
  message?: string;
}

/**
 * Verifica a disponibilidade do chat segundo a regra de LIMITE DIÁRIO ESTRITO:
 * - Apenas 1 atendimento de 30 minutos por dia civil local para cada cliente.
 * - Se a sessão de hoje ainda estiver dentro dos 30 minutos, permite continuar conversando.
 * - Se os 30 minutos expiraram ou a sessão foi encerrada, bloqueia novas sessões até as 00:00 do dia seguinte,
 *   mas permite visualizar o histórico de mensagens já enviadas.
 */
export async function checkDailyChatAvailability(
  clientId: string,
  supabase: SupabaseClient
): Promise<DailyChatCheckResult> {
  const { startUtcIso, endUtcIso } = getLocalDayUtcRange();

  // Busca qualquer sessão criada no dia civil local de hoje
  const { data: todaySessions, error } = await supabase
    .from('chat_sessions')
    .select('*')
    .eq('client_id', clientId)
    .gte('created_at', startUtcIso)
    .lte('created_at', endUtcIso)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[chatSessionUtils] Erro ao buscar sessões do dia:', error);
  }

  const nowMs = Date.now();

  // Fechar também sessões órfãs anteriores a hoje que por ventura ficaram com status 'open'
  try {
    await supabase
      .from('chat_sessions')
      .update({ status: 'closed', closed_at: new Date().toISOString() })
      .eq('client_id', clientId)
      .eq('status', 'open')
      .lt('created_at', startUtcIso);
  } catch (e) {
    // Silently ignore cleanup error
  }

  if (!todaySessions || todaySessions.length === 0) {
    // Nenhuma sessão foi iniciada hoje ainda: liberado para iniciar 1 atendimento de 30 minutos
    return {
      canStartNewSession: true,
      activeSession: null,
      lastSession: null,
      dailyLimitReached: false
    };
  }

  const mostRecentSession = todaySessions[0];

  // Existe sessão hoje: verificar se alguma ainda está ativa dentro dos 30 minutos
  for (const sess of todaySessions) {
    if (sess.status === 'open') {
      const evaluation = evaluateSessionExpiry(sess, nowMs);
      if (!evaluation.isExpired) {
        // Sessão ainda está ativa e dentro dos 30 minutos!
        return {
          canStartNewSession: false,
          activeSession: sess,
          lastSession: sess,
          dailyLimitReached: false
        };
      } else {
        // Sessão passou dos 30 minutos: fechar no banco
        await supabase
          .from('chat_sessions')
          .update({
            status: 'closed',
            closed_at: sess.closed_at || new Date().toISOString()
          })
          .eq('id', sess.id);
        sess.status = 'closed';
      }
    }
  }

  // Se chegou aqui, já existiu sessão hoje e ela foi concluída ou expirou (Limite Diário Estrito)
  return {
    canStartNewSession: false,
    activeSession: null,
    lastSession: mostRecentSession,
    dailyLimitReached: true,
    message: 'A sessão de chat de hoje (30 minutos) já foi finalizada ou expirou. Por política de limite diário estrito, um novo chat poderá ser iniciado amanhã a partir das 00:00.'
  };
}

/**
 * Verifica de forma síncrona/rápida a partir das sessões carregadas se um cliente tem chat ativo.
 * Retorna true se houver sessão 'open' criada hoje com menos de 30 minutos decorridos.
 */
export function isClientChatActive(
  sessionsForClient?: Array<{ created_at?: string; closed_at?: string | null; status?: string }> | null
): boolean {
  if (!sessionsForClient || sessionsForClient.length === 0) return false;
  const nowMs = Date.now();
  for (const sess of sessionsForClient) {
    if (sess.status === 'open') {
      const evaluation = evaluateSessionExpiry(sess, nowMs);
      if (!evaluation.isExpired) {
        return true;
      }
    }
  }
  return false;
}
