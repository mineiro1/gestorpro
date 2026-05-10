export const openWhatsApp = (phone: string, message: string = '') => {
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const cleanPhone = phone.replace(/\D/g, '');
  const encodedMessage = encodeURIComponent(message);
  
  if (isMobile) {
    // Usar o esquema URI nativo força o Android/iOS a abrir o app ou exibir o seletor (caso tenha app normal e business)
    // O Android nativamente pergunta com qual app abrir caso ambos estejam instalados.
    const schemeUrl = `whatsapp://send?phone=${cleanPhone}&text=${encodedMessage}`;
    window.location.href = schemeUrl;
    
    // Fallback caso falhe (embora o esquema whatsapp:// seja muito robusto no mobile)
    setTimeout(() => {
      // Se não conseguiu abrir, tenta o link universal
      // window.open(`https://wa.me/${cleanPhone}?text=${encodedMessage}`, '_blank');
    }, 300);
  } else {
    const webUrl = `https://wa.me/${cleanPhone}?text=${encodedMessage}`;
    window.open(webUrl, '_blank');
  }
};
