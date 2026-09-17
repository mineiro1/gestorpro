export const openWhatsApp = (phone: string, text: string = "") => {
  if (!phone) return;
  const cleanPhone = phone.replace(/\D/g, '');
  const encodedMessage = encodeURIComponent(text);
  
  if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
    const mobileUrl = `whatsapp://send?phone=55${cleanPhone}&text=${encodedMessage}`;
    window.location.href = mobileUrl;
    setTimeout(() => {
      const webUrl = `https://wa.me/55${cleanPhone}?text=${encodedMessage}`;
      window.open(webUrl, '_blank');
    }, 500);
  } else {
    const webUrl = `https://wa.me/55${cleanPhone}?text=${encodedMessage}`;
    window.open(webUrl, '_blank');
  }
};

export const sendEvolutionMessage = async (phone: string, text: string, waSettings: any) => {
  if (!waSettings.evolutionApiUrl || !waSettings.evolutionApiKey || !waSettings.evolutionInstanceName) {
    throw new Error("Credenciais da Evolution API incompletas nas configurações.");
  }
  
  const cleanPhone = phone.replace(/\D/g, '');
  let originalNumber = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
  
  let numbersToTry = [originalNumber];
  if (originalNumber.length >= 12 && originalNumber.startsWith('55')) {
    const ddd = parseInt(originalNumber.substring(2, 4), 10);
    if (ddd <= 28) {
      // DDD <= 28: WhatsApp exige o 9º dígito obrigatoriamente.
      // Se tiver 12 caracteres (falta o 9), nós injetamos o 9 automaticamente.
      if (originalNumber.length === 12) {
        originalNumber = originalNumber.substring(0, 4) + '9' + originalNumber.substring(4);
        numbersToTry = [originalNumber]; // Tenta apenas com o 9
      }
    } else {
      // DDD > 28: Fazemos o duplo disparo
      if (originalNumber.length === 13 && originalNumber[4] === '9') {
        numbersToTry.push(originalNumber.substring(0, 4) + originalNumber.substring(5));
      } else if (originalNumber.length === 12) {
        numbersToTry.push(originalNumber.substring(0, 4) + '9' + originalNumber.substring(4));
      }
    }
  }

  let baseUrl = waSettings.evolutionApiUrl.trim().replace(/\/$/, '');
  if (baseUrl && !baseUrl.startsWith('http')) {
    baseUrl = 'https://' + baseUrl;
  }
  const url = `${baseUrl}/message/sendText/${waSettings.evolutionInstanceName}`;
  
  let lastResponse;
  for (const num of numbersToTry) {
      try {
        lastResponse = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': waSettings.evolutionApiKey
          },
          body: JSON.stringify({
            number: num,
            text: text,
            textMessage: { text: text },
            options: { delay: 1000, presence: "composing" }
          })
        });
      } catch (e: any) {
        if (e.message === 'Failed to fetch') {
          throw new Error(`Falha de conexão. Verifique se o seu servidor Evolution API (${baseUrl}) possui o CORS habilitado. O navegador bloqueou a requisição (Failed to fetch).`);
        }
        throw e;
      }
  }
  
  if (!lastResponse || !lastResponse.ok) {
    let errDesc = 'Desconhecido';
    try {
      if (lastResponse) {
          const errData = await lastResponse.json();
          errDesc = JSON.stringify(errData);
      }
    } catch(e) {}
    throw new Error(`Erro na Evolution API (${lastResponse ? lastResponse.status : 'Network'}): ${errDesc}`);
  }
  return await lastResponse.json();
};

export const sendMetaMessage = async (phone: string, text: string, waSettings: any) => {
  if (!waSettings.metaToken) {
    throw new Error("O Token/Key da API Oficial (Meta) é obrigatório.");
  }
  
  const cleanPhone = phone.replace(/\D/g, '');
  let originalNumber = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
  
  let baseUrl = (waSettings.metaServerUrl || 'https://graph.facebook.com/v19.0').trim().replace(/\/$/, '');
  if (baseUrl && !baseUrl.startsWith('http')) {
    baseUrl = 'https://' + baseUrl;
  }
  const isWame = baseUrl && !baseUrl.includes('graph.facebook.com');

  let numbersToTry = [originalNumber];
  if (isWame && originalNumber.length >= 12 && originalNumber.startsWith('55')) {
    const ddd = parseInt(originalNumber.substring(2, 4), 10);
    if (ddd > 28) {
      if (originalNumber.length === 13 && originalNumber[4] === '9') {
        numbersToTry.push(originalNumber.substring(0, 4) + originalNumber.substring(5));
      } else if (originalNumber.length === 12) {
        numbersToTry.push(originalNumber.substring(0, 4) + '9' + originalNumber.substring(4));
      }
    }
  }

  if (isWame) {
     const url = `${baseUrl}/${waSettings.metaToken}/message/text`;
     const headers = { 'Content-Type': 'application/json' };
     
     let lastResponse;
     for (const num of numbersToTry) {
        try {
           lastResponse = await fetch(url, {
              method: 'POST',
              headers,
              body: JSON.stringify({ to: num, text: text })
           });
        } catch (e: any) {
           if (e.message === 'Failed to fetch') {
             throw new Error('Falha de conexão com a API WAME. (Failed to fetch)');
           }
           throw e;
        }
     }
     
     if (!lastResponse || !lastResponse.ok) {
        let errDesc = 'Desconhecido';
        try {
          if (lastResponse) {
             const errData = await lastResponse.json();
             errDesc = errData.message || errData.error?.message || JSON.stringify(errData);
          }
        } catch(e) {}
        throw new Error(`Erro na API WAME (${lastResponse ? lastResponse.status : 'Network'}): ${errDesc}`);
     }
     return await lastResponse.json();
  } else {
     const number = originalNumber; // Meta usa o que foi digitado? Ou tira o 9? Para Meta é melhor usar original
     const phoneId = waSettings.metaPhoneNumberId ? `/${waSettings.metaPhoneNumberId}` : '';
     const url = `${baseUrl}${phoneId}/messages`;
     const headers = {
        'Authorization': `Bearer ${waSettings.metaToken}`,
        'Content-Type': 'application/json'
     };
     const body = JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: number,
        type: "text",
        text: { preview_url: false, body: text }
     });
     
     let response;
     try {
       response = await fetch(url, { method: 'POST', headers, body });
     } catch (e: any) {
       if (e.message === 'Failed to fetch') {
         throw new Error('Falha de conexão com a API da Meta. (Failed to fetch)');
       }
       throw e;
     }
     
     if (!response.ok) {
       let errDesc = 'Desconhecido';
       try {
         const errData = await response.json();
         errDesc = errData.message || errData.error?.message || JSON.stringify(errData);
       } catch(e) {}
       
       if (response.status === 409 || errDesc.includes('24h') || errDesc.includes('Janela')) {
           throw new Error("Janela de 24h fechada. A Meta (WhatsApp) bloqueou esta mensagem. Para iniciar a conversa, o cliente deve te enviar uma mensagem primeiro ou você deve usar Templates aprovados.");
       }
       throw new Error(`Erro na API Meta (${response.status}): ${errDesc}`);
     }
     return await response.json();
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
