/**
 * Utilitários para Normalização e Variações de Telefones Brasileiros
 * Suporta com precisão os 4 formatos exigidos pelo sistema e AstraCalls:
 * 1. Formato AstraCalls: DDI 55 + DDD (2 dígitos) + 8 dígitos (ex: 551187654321)
 * 2. Formato DDI + 9º Dígito: DDI 55 + DDD (2 dígitos) + 9 dígitos (ex: 5511987654321)
 * 3. Formato Nacional com 9: DDD (2 dígitos) + 9 dígitos (ex: 11987654321)
 * 4. Formato Nacional 8 dígitos: DDD (2 dígitos) + 8 dígitos (ex: 1187654321)
 */

export interface PhoneVariations {
  astracalls: string;     // ex: 551187654321
  with55With9: string;    // ex: 5511987654321
  no55With9: string;      // ex: 11987654321
  no55No9: string;        // ex: 1187654321
  ddd: string;            // ex: 11
  rest8: string;          // ex: 87654321
  rest9: string;          // ex: 987654321
  all: string[];          // Lista de todas as variações sem duplicatas
}

export function getBrazilianPhoneVariations(phone: string): PhoneVariations {
  if (!phone) {
    return {
      astracalls: '',
      with55With9: '',
      no55With9: '',
      no55No9: '',
      ddd: '',
      rest8: '',
      rest9: '',
      all: []
    };
  }

  const clean = String(phone).replace(/\D/g, '');
  if (!clean || clean.length < 8) {
    return {
      astracalls: clean,
      with55With9: clean,
      no55With9: clean,
      no55No9: clean,
      ddd: '',
      rest8: '',
      rest9: '',
      all: [clean].filter(Boolean)
    };
  }

  let ddd = '';
  let rest8 = '';
  let rest9 = '';

  // Caso A: Começa com 55 e tem pelo menos 12 dígitos (55 + DDD + 8 ou 9 dígitos)
  if (clean.startsWith('55') && clean.length >= 12) {
    ddd = clean.substring(2, 4);
    const rest = clean.substring(4);
    if (rest.length === 9 && rest.startsWith('9')) {
      rest9 = rest;
      rest8 = rest.substring(1);
    } else if (rest.length === 8) {
      rest8 = rest;
      rest9 = '9' + rest;
    } else {
      rest8 = rest.slice(-8);
      rest9 = '9' + rest8;
    }
  }
  // Caso B: Tem 10 ou 11 dígitos (DDD + 8 ou 9 dígitos, sem 55)
  else if (clean.length === 10 || clean.length === 11) {
    ddd = clean.substring(0, 2);
    const rest = clean.substring(2);
    if (rest.length === 9 && rest.startsWith('9')) {
      rest9 = rest;
      rest8 = rest.substring(1);
    } else if (rest.length === 8) {
      rest8 = rest;
      rest9 = '9' + rest;
    } else {
      rest8 = rest.slice(-8);
      rest9 = '9' + rest8;
    }
  }
  // Caso C: Tem 8 ou 9 dígitos (Número local sem DDD, padrão DDD 67 para Campo Grande)
  else if (clean.length === 8 || clean.length === 9) {
    ddd = '67';
    if (clean.length === 9 && clean.startsWith('9')) {
      rest9 = clean;
      rest8 = clean.substring(1);
    } else if (clean.length === 8) {
      rest8 = clean;
      rest9 = '9' + clean;
    }
  } else {
    // Número com tamanho atípico: pega os últimos 8 e 9 dígitos se possível
    rest8 = clean.slice(-8);
    rest9 = '9' + rest8;
    ddd = clean.length >= 10 ? clean.slice(-10, -8) : '67';
  }

  const astracalls = ddd && rest8 ? `55${ddd}${rest8}` : clean;
  const with55With9 = ddd && rest9 ? `55${ddd}${rest9}` : clean;
  const no55With9 = ddd && rest9 ? `${ddd}${rest9}` : clean;
  const no55No9 = ddd && rest8 ? `${ddd}${rest8}` : clean;

  const all = [...new Set([
    astracalls,
    with55With9,
    no55With9,
    no55No9,
    clean,
    rest9,
    rest8
  ].filter(Boolean))];

  return {
    astracalls,
    with55With9,
    no55With9,
    no55No9,
    ddd,
    rest8,
    rest9,
    all
  };
}
