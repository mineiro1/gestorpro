/**
 * Universal WhatsApp message template processor for GestãoPro
 * Replaces all placeholder variations with actual client/route data
 * Handles braced ({...}), bracketed ([...]), parenthesized ((...)),
 * and raw unbraced phrases (e.g. "Primeiro nome do cliente", "telefone do cliente")
 */

export interface TemplateClientData {
  name?: string;
  client_name?: string;
  phone?: string;
  local_phone?: string;
  monthlyFee?: number | string;
  monthly_fee?: number | string;
  monthly_price?: number | string;
  extraAmount?: number | string;
  extra_amount?: number | string;
  extraReason?: string;
  extra_reason?: string;
  dueDate?: string;
  due_date?: string;
  address?: string;
  paymentDate?: string;
  paid_date?: string;
  referenceMonth?: string | number;
  ref_month?: string | number;
  nextDueDate?: string;
  pixKey?: string;
  pix_key?: string;
  pixReceiverName?: string;
  [key: string]: any;
}

export function formatClientMessageTemplate(
  template: string,
  client: TemplateClientData,
  options?: {
    techName?: string;
    companyName?: string;
    portalUrl?: string;
    pixKey?: string;
    pixReceiverName?: string;
    referenceMonth?: string;
    paymentDate?: string;
    nextDueDate?: string;
  }
): string {
  if (!template) return '';

  const rawName = (client.name || client.client_name || 'Cliente').trim();
  const nameParts = rawName.split(/\s+/).filter(Boolean);
  const rawFirstName = nameParts[0] || 'Cliente';
  const firstName = rawFirstName.charAt(0).toUpperCase() + rawFirstName.slice(1);
  const fullName = rawName || 'Cliente';

  const rawPhone = client.phone || client.local_phone || '';
  const cleanPhone = String(rawPhone).replace(/\D/g, '');
  const formattedPhone = cleanPhone.length === 11 
    ? `(${cleanPhone.slice(0, 2)}) ${cleanPhone.slice(2, 7)}-${cleanPhone.slice(7)}`
    : cleanPhone.length === 10
    ? `(${cleanPhone.slice(0, 2)}) ${cleanPhone.slice(2, 6)}-${cleanPhone.slice(6)}`
    : cleanPhone;

  // Determina o telefone real de login do usuário salvo na tabela users (sem 55 e com 9º dígito)
  let rawUserPhone = client.user_phone || client.login_phone || client.userPhone || client.portal_phone || '';
  let portalLoginPhone = String(rawUserPhone).replace(/\D/g, '');

  if (!portalLoginPhone) {
    // Fallback inteligente: se o telefone do cliente estiver no formato Astracalls (55 + DDD + 8 dígitos)
    // remove o 55 e insere o nono dígito (ex: 556791843875 -> 67991843875 ou 556781629494 -> 67981629494)
    if (cleanPhone.startsWith('55') && cleanPhone.length === 12) {
      portalLoginPhone = `${cleanPhone.slice(2, 4)}9${cleanPhone.slice(4)}`;
    } else if (cleanPhone.startsWith('55') && cleanPhone.length === 13) {
      portalLoginPhone = cleanPhone.slice(2);
    } else if (cleanPhone.length === 10) {
      portalLoginPhone = `${cleanPhone.slice(0, 2)}9${cleanPhone.slice(2)}`;
    } else {
      portalLoginPhone = cleanPhone;
    }
  } else {
    // Se o telefone veio da tabela users, garante que não tenha 55 na frente se for número nacional
    if (portalLoginPhone.startsWith('55') && portalLoginPhone.length === 12) {
      portalLoginPhone = `${portalLoginPhone.slice(2, 4)}9${portalLoginPhone.slice(4)}`;
    } else if (portalLoginPhone.startsWith('55') && portalLoginPhone.length === 13) {
      portalLoginPhone = portalLoginPhone.slice(2);
    } else if (portalLoginPhone.length === 10) {
      portalLoginPhone = `${portalLoginPhone.slice(0, 2)}9${portalLoginPhone.slice(2)}`;
    }
  }

  const portalUrl = options?.portalUrl || 'www.rspiscinas.app.br/client-panel';
  const companyName = options?.companyName || 'GestãoPro';
  const techName = options?.techName || 'Técnico';

  let msg = template
    .replace(/https?:\/\/www\.rspiscinas\.app\.br\/client-panel/gi, portalUrl)
    .replace(/https?:\/\/calls\.rspiscinas\.app\.br\/client-panel/gi, portalUrl);

  // 1. First name replacements (braced, bracketed, raw)
  msg = msg
    .replace(/\{\s*primeiro[\s_-]*nome(\s*do\s*cliente)?\s*\}/gi, firstName)
    .replace(/\[\s*primeiro[\s_-]*nome(\s*do\s*cliente)?\s*\]/gi, firstName)
    .replace(/\(\s*primeiro[\s_-]*nome(\s*do\s*cliente)?\s*\)/gi, firstName)
    .replace(/\{\s*first[\s_-]*name\s*\}/gi, firstName)
    .replace(/\[\s*first[\s_-]*name\s*\]/gi, firstName)
    .replace(/\{\s*primeiro\s*\}/gi, firstName)
    .replace(/\[\s*primeiro\s*\]/gi, firstName);

  // 2. Full name / Client replacements
  msg = msg
    .replace(/\{\s*nome[\s_-]*completo(\s*do\s*cliente)?\s*\}/gi, fullName)
    .replace(/\[\s*nome[\s_-]*completo(\s*do\s*cliente)?\s*\]/gi, fullName)
    .replace(/\{\s*nome(\s*do\s*cliente)?\s*\}/gi, firstName)
    .replace(/\[\s*nome(\s*do\s*cliente)?\s*\]/gi, firstName)
    .replace(/\{\s*cliente\s*\}/gi, firstName)
    .replace(/\[\s*cliente\s*\]/gi, firstName);

  // 3. Phone / Login / Password replacements (usa portalLoginPhone conforme cadastrado em users)
  msg = msg
    .replace(/\{\s*telefone(\s*de\s*cadastro)?(\s*do\s*cliente)?\s*\}/gi, portalLoginPhone)
    .replace(/\[\s*telefone(\s*de\s*cadastro)?(\s*do\s*cliente)?\s*\]/gi, portalLoginPhone)
    .replace(/\{\s*telefone[\s_-]*cadastrado\s*\}/gi, portalLoginPhone)
    .replace(/\[\s*telefone[\s_-]*cadastrado\s*\]/gi, portalLoginPhone)
    .replace(/\{\s*celular(\s*do\s*cliente)?\s*\}/gi, portalLoginPhone)
    .replace(/\[\s*celular(\s*do\s*cliente)?\s*\]/gi, portalLoginPhone)
    .replace(/\{\s*login(\s*do\s*cliente)?\s*\}/gi, portalLoginPhone)
    .replace(/\[\s*login(\s*do\s*cliente)?\s*\]/gi, portalLoginPhone)
    .replace(/\{\s*senha(\s*do\s*cliente)?\s*\}/gi, portalLoginPhone)
    .replace(/\[\s*senha(\s*do\s*cliente)?\s*\]/gi, portalLoginPhone);

  // 4. Tech / Company / Portal replacements
  msg = msg
    .replace(/\{\s*tecnico\s*\}/gi, techName)
    .replace(/\[\s*tecnico\s*\]/gi, techName)
    .replace(/\{\s*empresa\s*\}/gi, companyName)
    .replace(/\[\s*empresa\s*\]/gi, companyName)
    .replace(/\{\s*portal\s*\}/gi, portalUrl)
    .replace(/\[\s*portal\s*\]/gi, portalUrl);

  // 5. Due date replacements
  const dueDateVal = client.dueDate || client.due_date;
  if (dueDateVal) {
    try {
      const dueStr = String(dueDateVal).includes('T') ? String(dueDateVal).split('T')[0] : String(dueDateVal);
      const [y, m, d] = dueStr.split('-');
      if (y && m && d) {
        msg = msg
          .replace(/\{\s*vencimento\s*\}/gi, `${d}/${m}/${y}`)
          .replace(/\[\s*vencimento\s*\]/gi, `${d}/${m}/${y}`);
      }
    } catch (e) {}
  }

  // 6. Monetary amounts
  const monthlyFee = client.monthlyFee ?? client.monthly_fee ?? client.monthly_price;
  const extraAmount = client.extraAmount ?? client.extra_amount ?? 0;
  if (monthlyFee !== undefined) {
    const total = Number(monthlyFee || 0) + Number(extraAmount || 0);
    const formattedVal = total.toFixed(2).replace('.', ',');
    msg = msg
      .replace(/\{\s*valor\s*\}/gi, formattedVal)
      .replace(/\[\s*valor\s*\]/gi, formattedVal);
  }

  // 6.1 PIX Key and Receiver
  const effectivePixKey = options?.pixKey || client.pixKey || client.pix_key || '';
  const effectivePixReceiver = options?.pixReceiverName || client.pixReceiverName || '';
  if (effectivePixKey) {
    msg = msg
      .replace(/\{\s*(chave[\s_-]*pix|pix[\s_-]*key|pix)\s*\}/gi, effectivePixKey)
      .replace(/\[\s*(chave[\s_-]*pix|pix[\s_-]*key|pix)\s*\]/gi, effectivePixKey);
  }
  if (effectivePixReceiver) {
    msg = msg
      .replace(/\{\s*(titular[\s_-]*pix|beneficiario[\s_-]*pix|pix[\s_-]*titular)\s*\}/gi, effectivePixReceiver)
      .replace(/\[\s*(titular[\s_-]*pix|beneficiario[\s_-]*pix|pix[\s_-]*titular)\s*\]/gi, effectivePixReceiver);
  }

  // 6.2 Reference Month (ex: "Outubro/2026" ou "Outubro")
  const rawMonth = options?.referenceMonth || client.referenceMonth || client.ref_month;
  let formattedMonthName = '';
  if (rawMonth) {
    const monthNum = parseInt(String(rawMonth).split('/')[0], 10);
    const monthNames = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    if (monthNum >= 1 && monthNum <= 12) {
      formattedMonthName = monthNames[monthNum - 1];
    } else {
      formattedMonthName = String(rawMonth);
    }
    msg = msg
      .replace(/\{\s*(mes[\s_-]*referencia|mes[\s_-]*referente|mes|mês|referencia)\s*\}/gi, formattedMonthName)
      .replace(/\[\s*(mes[\s_-]*referencia|mes[\s_-]*referente|mes|mês|referencia)\s*\]/gi, formattedMonthName);
  }

  // 6.3 Payment Date (ex: "15/10/2026")
  const payDateVal = options?.paymentDate || client.paymentDate || client.paid_date;
  if (payDateVal) {
    try {
      const pStr = String(payDateVal).includes('T') ? String(payDateVal).split('T')[0] : String(payDateVal);
      const [y, m, d] = pStr.split('-');
      if (y && m && d) {
        const fPayDate = `${d}/${m}/${y}`;
        msg = msg
          .replace(/\{\s*(data[\s_-]*pagamento|data[\s_-]*pago|data_pagamento)\s*\}/gi, fPayDate)
          .replace(/\[\s*(data[\s_-]*pagamento|data[\s_-]*pago|data_pagamento)\s*\]/gi, fPayDate);
      }
    } catch (e) {}
  }

  // 6.4 Next Due Date (ex: "15/11/2026")
  const nextDueVal = options?.nextDueDate || client.nextDueDate;
  if (nextDueVal) {
    try {
      const ndStr = String(nextDueVal).includes('T') ? String(nextDueVal).split('T')[0] : String(nextDueVal);
      const [y, m, d] = ndStr.split('-');
      if (y && m && d) {
        const fNextDue = `${d}/${m}/${y}`;
        msg = msg
          .replace(/\{\s*(proximo[\s_-]*vencimento|proxima[\s_-]*data|proximo_vencimento)\s*\}/gi, fNextDue)
          .replace(/\[\s*(proximo[\s_-]*vencimento|proxima[\s_-]*data|proximo_vencimento)\s*\]/gi, fNextDue);
      }
    } catch (e) {}
  }

  // 7. Critical fallback for RAW phrases typed without braces by users
  // (e.g., "Olá, Primeiro nome do cliente!", "Login: telefone do cliente", "Senha: telefone de cadastro do cliente")
  msg = msg
    .replace(/Login:\s*\{?telefone(\s*de\s*cadastro)?(\s*do\s*cliente)?\}?/gi, `Login: ${portalLoginPhone}`)
    .replace(/Senha:\s*\{?telefone(\s*de\s*cadastro)?(\s*do\s*cliente)?\}?/gi, `Senha: ${portalLoginPhone}`)
    .replace(/Login:\s*\{?celular(\s*do\s*cliente)?\}?/gi, `Login: ${portalLoginPhone}`)
    .replace(/Senha:\s*\{?celular(\s*do\s*cliente)?\}?/gi, `Senha: ${portalLoginPhone}`)
    .replace(/Login:\s*\{?login(\s*do\s*cliente)?\}?/gi, `Login: ${portalLoginPhone}`)
    .replace(/Senha:\s*\{?senha(\s*do\s*cliente)?\}?/gi, `Senha: ${portalLoginPhone}`)
    .replace(/Olá,\s*\{?Primeiro\s*nome\s*do\s*cliente\}?/gi, `Olá, ${firstName}`)
    .replace(/Olá\s*\{?Primeiro\s*nome\s*do\s*cliente\}?/gi, `Olá ${firstName}`)
    .replace(/Olá,\s*\{?Primeiro\s*nome\}?/gi, `Olá, ${firstName}`)
    .replace(/Olá\s*\{?Primeiro\s*nome\}?/gi, `Olá ${firstName}`)
    .replace(/\{?Primeiro\s*nome\s*do\s*cliente\}?/gi, firstName)
    .replace(/\{?telefone\s*de\s*cadastro\s*do\s*cliente\}?/gi, portalLoginPhone)
    .replace(/\{?telefone\s*de\s*cadastro\}?/gi, portalLoginPhone)
    .replace(/\{?telefone\s*do\s*cliente\}?/gi, portalLoginPhone);

  // 8. Final cleanup: remove any leftover unmatched single template tags
  msg = msg.replace(/\{[a-zA-Z0-9_\s]{2,40}\}/g, (match) => {
    const lower = match.toLowerCase();
    if (lower.includes('nome')) return firstName;
    if (lower.includes('telefone') || lower.includes('login') || lower.includes('senha') || lower.includes('celular')) return portalLoginPhone;
    if (lower.includes('empresa')) return companyName;
    if (lower.includes('portal')) return portalUrl;
    return '';
  });

  return msg;
}
