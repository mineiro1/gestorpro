export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { phone, message } = req.body;
    if (!phone) return res.status(400).json({ error: "Telefone obrigatório" });

    const cleanDigits = String(phone).replace(/\D/g, '');
    let baseNum = cleanDigits;
    if (!baseNum.startsWith('55')) {
      if (baseNum.length === 10 || baseNum.length === 11) baseNum = '55' + baseNum;
      else if (baseNum.length === 8 || baseNum.length === 9) baseNum = '5567' + baseNum;
    }

    let twelveDigit = '';
    let thirteenDigit = '';
    if (baseNum.startsWith('55') && baseNum.length >= 12) {
      const ddd = baseNum.substring(2, 4);
      const rest = baseNum.substring(4);
      if (baseNum.length === 13 && rest.startsWith('9')) {
        thirteenDigit = baseNum;
        twelveDigit = `55${ddd}${rest.substring(1)}`;
      } else if (baseNum.length === 12) {
        twelveDigit = baseNum;
        thirteenDigit = `55${ddd}9${rest}`;
      }
    }

    const numbersToTry = [];
    if (twelveDigit) numbersToTry.push(twelveDigit);
    if (thirteenDigit) numbersToTry.push(thirteenDigit);
    if (!twelveDigit && !thirteenDigit) numbersToTry.push(baseNum);

    const astracallsUrl = 'https://calls.rspiscinas.app.br';
    const astracallsApiKey = 'rs_piscinas_segredo_2026';
    let sessionId = '8090cca3add0b8eb3e41efb9eec363e4';

    try {
      const sRes = await fetch(`${astracallsUrl}/api/sessions`, {
        headers: { 'X-Api-Key': astracallsApiKey }
      });
      if (sRes.ok) {
        const sData = await sRes.json();
        const active = sData?.sessions?.find(s => s.state === 'open' || s.paired) || sData?.sessions?.[0];
        if (active?.id) sessionId = active.id;
      }
    } catch (e) {}

    let lastError = null;
    let successData = null;

    for (const targetNum of numbersToTry) {
      const endpoint = `${astracallsUrl}/api/sessions/${sessionId}/messages/text`;
      try {
        const resp = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Api-Key': astracallsApiKey
          },
          body: JSON.stringify({
            to: targetNum,
            recipient: targetNum,
            phone: targetNum,
            text: message || '🏊 Olá! Mensagem de teste oficial do servidor AstraCalls da RS Piscinas.',
            message: message || '🏊 Olá! Mensagem de teste oficial do servidor AstraCalls da RS Piscinas.'
          })
        });

        const respText = await resp.text().catch(() => '');
        let parsed = null;
        try { parsed = JSON.parse(respText); } catch (e) { parsed = { text: respText }; }

        if (resp.ok) {
          successData = { ...parsed, deliveredTo: targetNum };
          break;
        } else {
          lastError = parsed?.error || respText;
        }
      } catch (err) {
        lastError = err.message;
      }
    }

    if (successData) {
      return res.json({ success: true, data: successData });
    } else {
      return res.status(500).json({ error: lastError || "Falha ao enviar mensagem de teste pelo AstraCalls" });
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
