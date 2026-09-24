// Client-side idempotency cache to prevent duplicate dispatches within 30 seconds
const clientRecentSends = new Map<string, { timestamp: number; result: any }>();

export const getWhatsAppNumbersToTry = (phone: string): string[] => {
  if (!phone) return [];
  const cleanPhone = phone.replace(/\D/g, '');
  if (!cleanPhone) return [];

  let rawNumber = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
  return [rawNumber];
};

export const formatWhatsAppNumber = (phone: string): string => {
  if (!phone) return '';
  const cleanPhone = phone.replace(/\D/g, '');
  if (!cleanPhone) return '';
  return cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
};

export const openWhatsApp = (phone: string, text: string = "") => {
  if (!phone) return;
  const targetNumber = formatWhatsAppNumber(phone);
  const encodedMessage = encodeURIComponent(text);
  
  if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
    const mobileUrl = `whatsapp://send?phone=${targetNumber}&text=${encodedMessage}`;
    window.location.href = mobileUrl;
    setTimeout(() => {
      const webUrl = `https://wa.me/${targetNumber}?text=${encodedMessage}`;
      window.open(webUrl, '_blank');
    }, 500);
  } else {
    const webUrl = `https://wa.me/${targetNumber}?text=${encodedMessage}`;
    window.open(webUrl, '_blank');
  }
};

export const sendEvolutionMessage = async (
  phone: string,
  text: string,
  waSettings: any,
  message_client_id?: string,
  mediaBase64?: string,
  mimeType?: string
) => {
  if (!waSettings.evolutionApiUrl || !waSettings.evolutionApiKey || !waSettings.evolutionInstanceName) {
    throw new Error("Credenciais da Evolution API incompletas nas configurações.");
  }
  
  const targetNumber = formatWhatsAppNumber(phone);
  if (!targetNumber) {
    throw new Error("Número de telefone inválido.");
  }

  // Idempotency check: key based on message_client_id or target + text
  const idempotencyKey = message_client_id || `evo_${targetNumber}_${(text || '').trim()}_${mediaBase64 ? 'media' : 'txt'}`;
  const now = Date.now();
  if (clientRecentSends.has(idempotencyKey)) {
    const cached = clientRecentSends.get(idempotencyKey)!;
    if (now - cached.timestamp < 30000) {
      console.warn(`[Idempotência WhatsApp] Ignorando envio repetido para ${targetNumber} nos últimos 30s.`);
      return cached.result;
    }
  }

  let baseUrl = waSettings.evolutionApiUrl.trim().replace(/\/$/, '');
  if (baseUrl && !baseUrl.startsWith('http')) {
    baseUrl = 'https://' + baseUrl;
  }
  
  let url = `${baseUrl}/message/sendText/${waSettings.evolutionInstanceName}`;
  let bodyObj: any = {
    number: targetNumber,
    text: text,
    options: { delay: 1000, presence: "composing", linkPreview: false }
  };

  if (mediaBase64 && mimeType) {
    const dataUri = mediaBase64.startsWith('data:') ? mediaBase64 : `data:${mimeType};base64,${mediaBase64}`;
    const rawBase64 = mediaBase64.includes('base64,') ? mediaBase64.split('base64,')[1] : mediaBase64;
    
    if (mimeType.startsWith('audio/')) {
      url = `${baseUrl}/message/sendWhatsAppAudio/${waSettings.evolutionInstanceName}`;
      bodyObj = {
        number: targetNumber,
        audio: dataUri,
        base64: rawBase64,
        options: { delay: 1000, presence: "recording", encoding: true }
      };
    } else {
      url = `${baseUrl}/message/sendMedia/${waSettings.evolutionInstanceName}`;
      const mediatype = mimeType.startsWith('video/') ? 'video' : (mimeType.startsWith('image/') ? 'image' : 'document');
      bodyObj = {
        number: targetNumber,
        media: dataUri,
        base64: rawBase64,
        mediatype: mediatype,
        caption: text || ''
      };
    }
  }
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': waSettings.evolutionApiKey
      },
      body: JSON.stringify(bodyObj)
    });

    if (response.ok) {
      const result = await response.json().catch(() => ({ success: true }));
      clientRecentSends.set(idempotencyKey, { timestamp: Date.now(), result });
      return result;
    } else {
      let errDesc = 'Desconhecido';
      try {
        const errData = await response.json();
        errDesc = JSON.stringify(errData);
      } catch(e) {}
      throw new Error(`Erro na Evolution API (${response.status}): ${errDesc}`);
    }
  } catch (e: any) {
    if (e.message === 'Failed to fetch') {
      throw new Error(`Falha de conexão. Verifique se o seu servidor Evolution API (${baseUrl}) possui o CORS habilitado. O navegador bloqueou a requisição (Failed to fetch).`);
    }
    throw e;
  }
};

export const sendMetaMessage = async (
  phone: string,
  text: string,
  waSettings: any,
  message_client_id?: string,
  mediaBase64?: string,
  mimeType?: string
) => {
  if (!waSettings.metaToken) {
    throw new Error("O Token/Key da API Oficial (Meta) é obrigatório.");
  }
  
  const targetNumber = formatWhatsAppNumber(phone);
  if (!targetNumber) {
    throw new Error("Número de telefone inválido.");
  }

  // Idempotency check
  const idempotencyKey = message_client_id || `meta_${targetNumber}_${(text || '').trim()}_${mediaBase64 ? 'media' : 'txt'}`;
  const now = Date.now();
  if (clientRecentSends.has(idempotencyKey)) {
    const cached = clientRecentSends.get(idempotencyKey)!;
    if (now - cached.timestamp < 30000) {
      console.warn(`[Idempotência WhatsApp] Ignorando envio repetido para ${targetNumber} nos últimos 30s.`);
      return cached.result;
    }
  }
  
  let baseUrl = (waSettings.metaServerUrl || 'https://graph.facebook.com/v19.0').trim().replace(/\/$/, '');
  if (baseUrl && !baseUrl.startsWith('http')) {
    baseUrl = 'https://' + baseUrl;
  }
  const isWame = baseUrl && !baseUrl.includes('graph.facebook.com');

  if (isWame) {
    let url = `${baseUrl}/${waSettings.metaToken}/message/text`;
    const headers = { 'Content-Type': 'application/json' };
    let bodyObj: any = {
      to: targetNumber,
      text: text,
      linkPreview: false,
      preview_url: false,
      previewUrl: false,
      options: { linkPreview: false }
    };

    if (mediaBase64 && mimeType) {
      const isPublicUrl = mediaBase64.startsWith('http://') || mediaBase64.startsWith('https://');
      const mediaUrlToSend = isPublicUrl ? mediaBase64 : mediaBase64;
      
      if (mimeType.startsWith('audio/')) {
        url = `${baseUrl}/${waSettings.metaToken}/message/audio`;
        bodyObj = {
          to: targetNumber,
          url: mediaUrlToSend,
          ptt: true
        };
      } else if (mimeType.startsWith('image/')) {
        url = `${baseUrl}/${waSettings.metaToken}/message/image`;
        bodyObj = {
          to: targetNumber,
          url: mediaUrlToSend,
          caption: text || ''
        };
      } else if (mimeType.startsWith('video/')) {
        url = `${baseUrl}/${waSettings.metaToken}/message/video`;
        bodyObj = {
          to: targetNumber,
          url: mediaUrlToSend,
          caption: text || ''
        };
      } else {
        url = `${baseUrl}/${waSettings.metaToken}/message/document`;
        bodyObj = {
          to: targetNumber,
          url: mediaUrlToSend,
          caption: text || '',
          fileName: 'anexo'
        };
      }
    }
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(bodyObj)
      });

      if (response.ok) {
        const result = await response.json().catch(() => ({ success: true }));
        clientRecentSends.set(idempotencyKey, { timestamp: Date.now(), result });
        return result;
      }

      let errDesc = 'Desconhecido';
      try {
        const errData = await response.json();
        errDesc = errData.message || errData.error?.message || JSON.stringify(errData);
      } catch(e) {}
      throw new Error(`Erro na API WAME (${response.status}): ${errDesc}`);
    } catch (e: any) {
      if (e.message === 'Failed to fetch') {
        throw new Error('Falha de conexão com a API WAME. (Failed to fetch)');
      }
      throw e;
    }
  } else {
    const phoneId = waSettings.metaPhoneNumberId ? `/${waSettings.metaPhoneNumberId}` : '';
    const url = `${baseUrl}${phoneId}/messages`;
    const headers = {
      'Authorization': `Bearer ${waSettings.metaToken}`,
      'Content-Type': 'application/json'
    };
    let bodyObj: any = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: targetNumber,
      type: "text",
      text: { preview_url: false, body: text }
    };

    if (mediaBase64 && mimeType) {
      const isVideo = mimeType.startsWith('video/');
      const mediaType = isVideo ? 'video' : 'image';
      if (mediaBase64.startsWith('http')) {
        bodyObj = {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: targetNumber,
          type: mediaType,
          [mediaType]: {
            caption: text || '',
            link: mediaBase64
          }
        };
      }
    }
    
    try {
      const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(bodyObj) });

      if (response.ok) {
        const result = await response.json().catch(() => ({ success: true }));
        clientRecentSends.set(idempotencyKey, { timestamp: Date.now(), result });
        return result;
      }

      let errDesc = 'Desconhecido';
      try {
        const errData = await response.json();
        errDesc = errData.message || errData.error?.message || JSON.stringify(errData);
      } catch(e) {}
      
      if (response.status === 409 || errDesc.includes('24h') || errDesc.includes('Janela')) {
        throw new Error("Janela de 24h fechada. A Meta (WhatsApp) bloqueou esta mensagem. Para iniciar a conversa, o cliente deve te enviar uma mensagem primeiro ou você deve usar Templates aprovados.");
      }
      throw new Error(`Erro na API Meta (${response.status}): ${errDesc}`);
    } catch (e: any) {
      if (e.message === 'Failed to fetch') {
        throw new Error('Falha de conexão com a API da Meta. (Failed to fetch)');
      }
      throw e;
    }
  }
};

export const normalizePhoneNumber = (phone: string) => {
  if (!phone) return phone;
  const digits = phone.replace(/\D/g, '');
  if (digits.length >= 10 && digits.length <= 11) {
    if (digits.length === 11) {
      return `(${digits.substring(0,2)}) ${digits.substring(2,7)}-${digits.substring(7)}`;
    } else {
      return `(${digits.substring(0,2)}) ${digits.substring(2,6)}-${digits.substring(6)}`;
    }
  }
  return phone;
};
