export const openMap = (query: string | { lat: number, lng: number }) => {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/.test(navigator.userAgent);

  let url = '';
  if (typeof query === 'string') {
    url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  } else {
    url = `https://www.google.com/maps/search/?api=1&query=${query.lat},${query.lng}`;
  }

  if (isAndroid) {
    if (typeof query === 'string') {
      window.location.href = `intent://maps.google.com/maps?q=${encodeURIComponent(query)}#Intent;package=com.google.android.apps.maps;scheme=https;end`;
    } else {
      window.location.href = `intent://maps.google.com/maps?q=${query.lat},${query.lng}#Intent;package=com.google.android.apps.maps;scheme=https;end`;
    }
  } else if (isIOS) {
    if (typeof query === 'string') {
       window.location.href = `comgooglemaps://?q=${encodeURIComponent(query)}`;
    } else {
       window.location.href = `comgooglemaps://?q=${query.lat},${query.lng}`;
    }
    setTimeout(() => {
       window.location.href = url;
    }, 500);
  } else {
    window.open(url, '_blank');
  }
};

export const openWaze = (query: string | { lat: number, lng: number }) => {
  const isAndroid = /Android/.test(navigator.userAgent);
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  let url = '';
  if (typeof query === 'string') {
    url = `https://waze.com/ul?q=${encodeURIComponent(query)}&navigate=yes`;
  } else {
    url = `https://waze.com/ul?ll=${query.lat},${query.lng}&navigate=yes`;
  }

  if (isAndroid) {
    if (typeof query === 'string') {
      window.location.href = `intent://waze.com/ul?q=${encodeURIComponent(query)}&navigate=yes#Intent;package=com.waze;scheme=https;end`;
    } else {
      window.location.href = `intent://waze.com/ul?ll=${query.lat},${query.lng}&navigate=yes#Intent;package=com.waze;scheme=https;end`;
    }
  } else if (isIOS) {
    if (typeof query === 'string') {
       window.location.href = `waze://?q=${encodeURIComponent(query)}&navigate=yes`;
    } else {
       window.location.href = `waze://?ll=${query.lat},${query.lng}&navigate=yes`;
    }
    setTimeout(() => {
       window.location.href = url;
    }, 500);
  } else {
    window.open(url, '_blank');
  }
};

export const openRouteMap = (addresses: string[]) => {
  const isAndroid = /Android/.test(navigator.userAgent);
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  
  const waypoints = addresses.map(encodeURIComponent).join('/');
  const url = `https://www.google.com/maps/dir/${waypoints}`;

  if (isAndroid) {
     window.location.href = `intent://www.google.com/maps/dir/${waypoints}#Intent;package=com.google.android.apps.maps;scheme=https;end`;
  } else if (isIOS) {
     // Google maps on iOS
     window.location.href = `comgooglemaps://?saddr=&daddr=${waypoints}&directionsmode=driving`;
     setTimeout(() => {
       window.location.href = url;
     }, 500);
  } else {
    window.open(url, '_blank');
  }
};
