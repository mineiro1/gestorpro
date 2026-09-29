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
  [key: string]: any;
}

export function formatClientMessageTemplate(
  template: string,
  client: TemplateClientData,
  options?: {
    techName?: string;
    companyName?: string;
    portalUrl?: string;
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

  // 3. Phone / Login / Password replacements
  msg = msg
    .replace(/\{\s*telefone(\s*de\s*cadastro)?(\s*do\s*cliente)?\s*\}/gi, cleanPhone)
    .replace(/\[\s*telefone(\s*de\s*cadastro)?(\s*do\s*cliente)?\s*\]/gi, cleanPhone)
    .replace(/\{\s*telefone[\s_-]*cadastrado\s*\}/gi, cleanPhone)
    .replace(/\[\s*telefone[\s_-]*cadastrado\s*\]/gi, cleanPhone)
    .replace(/\{\s*celular(\s*do\s*cliente)?\s*\}/gi, cleanPhone)
    .replace(/\[\s*celular(\s*do\s*cliente)?\s*\]/gi, cleanPhone)
    .replace(/\{\s*login(\s*do\s*cliente)?\s*\}/gi, cleanPhone)
    .replace(/\[\s*login(\s*do\s*cliente)?\s*\]/gi, cleanPhone)
    .replace(/\{\s*senha(\s*do\s*cliente)?\s*\}/gi, cleanPhone)
    .replace(/\[\s*senha(\s*do\s*cliente)?\s*\]/gi, cleanPhone);

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

  // 7. Critical fallback for RAW phrases typed without braces by users
  // (e.g., "Olá, Primeiro nome do cliente!", "Login: telefone do cliente", "Senha: telefone de cadastro do cliente")
  msg = msg
    .replace(/Login:\s*\{?telefone(\s*de\s*cadastro)?(\s*do\s*cliente)?\}?/gi, `Login: ${cleanPhone}`)
    .replace(/Senha:\s*\{?telefone(\s*de\s*cadastro)?(\s*do\s*cliente)?\}?/gi, `Senha: ${cleanPhone}`)
    .replace(/Login:\s*\{?celular(\s*do\s*cliente)?\}?/gi, `Login: ${cleanPhone}`)
    .replace(/Senha:\s*\{?celular(\s*do\s*cliente)?\}?/gi, `Senha: ${cleanPhone}`)
    .replace(/Olá,\s*\{?Primeiro\s*nome\s*do\s*cliente\}?/gi, `Olá, ${firstName}`)
    .replace(/Olá\s*\{?Primeiro\s*nome\s*do\s*cliente\}?/gi, `Olá ${firstName}`)
    .replace(/Olá,\s*\{?Primeiro\s*nome\}?/gi, `Olá, ${firstName}`)
    .replace(/Olá\s*\{?Primeiro\s*nome\}?/gi, `Olá ${firstName}`)
    .replace(/\{?Primeiro\s*nome\s*do\s*cliente\}?/gi, firstName)
    .replace(/\{?telefone\s*de\s*cadastro\s*do\s*cliente\}?/gi, cleanPhone)
    .replace(/\{?telefone\s*de\s*cadastro\}?/gi, cleanPhone)
    .replace(/\{?telefone\s*do\s*cliente\}?/gi, cleanPhone);

  // 8. Final cleanup: remove any leftover unmatched single template tags
  msg = msg.replace(/\{[a-zA-Z0-9_\s]{2,40}\}/g, (match) => {
    const lower = match.toLowerCase();
    if (lower.includes('nome')) return firstName;
    if (lower.includes('telefone') || lower.includes('login') || lower.includes('senha') || lower.includes('celular')) return cleanPhone;
    if (lower.includes('empresa')) return companyName;
    if (lower.includes('portal')) return portalUrl;
    return '';
  });

  return msg;
}
