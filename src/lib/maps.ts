export const openMap = (query: string | { lat: number, lng: number }) => {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isAndroid = /Android/.test(navigator.userAgent);

  if (typeof query === 'string') {
    // Address query
    if (isAndroid) {
      window.location.href = `geo:0,0?q=${encodeURIComponent(query)}`;
    } else if (isIOS) {
       window.location.href = `maps://?q=${encodeURIComponent(query)}`;
    } else {
       window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`, '_blank');
    }
  } else {
    // Lat/Lng query
    if (isAndroid) {
       window.location.href = `geo:${query.lat},${query.lng}?q=${query.lat},${query.lng}`;
    } else if (isIOS) {
       window.location.href = `maps://?q=${query.lat},${query.lng}`;
    } else {
       window.open(`https://www.google.com/maps/search/?api=1&query=${query.lat},${query.lng}`, '_blank');
    }
  }
};

export const openRouteMap = (addresses: string[]) => {
  const url = `https://www.google.com/maps/dir/${addresses.map(encodeURIComponent).join('/')}`;
  window.open(url, '_blank');
};
