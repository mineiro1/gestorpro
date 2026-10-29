import React, { useState, useEffect } from 'react';

export const MediaViewer = ({ url, alt, className, onLoad }: { url: string, alt: string, className?: string, onLoad?: () => void }) => {
  const [mediaData, setMediaData] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let processUrl = url;
    if (url.startsWith('data:image/jpeg;base64,data:image/jpeg;base64,')) {
       processUrl = url.replace('data:image/jpeg;base64,data:image/jpeg;base64,', 'data:image/jpeg;base64,');
    } else if (url.includes('{"messageId"')) {
       try {
           const jsonStr = url.substring(url.indexOf('{'));
           const parsed = JSON.parse(jsonStr);
           if (parsed.base64 && parsed.mimetype) {
               processUrl = `data:${parsed.mimetype};base64,${parsed.base64}`;
           }
       } catch (e) {}
    }

    if (processUrl.startsWith('data:') || processUrl.startsWith('blob:')) {
      setMediaData(processUrl);
      return;
    }

    if (url.includes('api-wa.me') || url.includes('wame')) {
      setLoading(true);
      fetch(url)
        .then(res => res.json())
        .then(data => {
          if (data && data.base64 && data.mimetype) {
            setMediaData(`data:${data.mimetype};base64,${data.base64}`);
          } else {
            setError(true);
          }
          setLoading(false);
        })
        .catch(err => {
          console.error("Failed to load media", err);
          setError(true);
          setLoading(false);
        });
    } else {
      setMediaData(url);
    }
  }, [url]);

  if (loading) {
    return <div className={`flex items-center justify-center bg-gray-100 animate-pulse ${className}`} style={{ minHeight: '100px' }}>Carregando...</div>;
  }

  if (error || !mediaData) {
    return <div className={`flex items-center justify-center bg-red-50 text-red-400 text-sm p-4 ${className}`}>Mídia indisponível</div>;
  }

  const isVideo = mediaData.startsWith('data:video') || mediaData.endsWith('.mp4') || mediaData.endsWith('.mov') || mediaData.endsWith('.webm') || url.includes('video') || mediaData.includes('.mp4');
  const isDocument = mediaData.endsWith('.pdf') || mediaData.endsWith('.doc') || mediaData.endsWith('.docx') || mediaData.endsWith('.xls') || mediaData.endsWith('.xlsx') || url.includes('document') || url.includes('.pdf') || url.includes('inbound_document');

  if (isVideo) {
    return (
      <video
        src={mediaData}
        controls
        playsInline
        preload="metadata"
        className={className}
        onLoadedData={onLoad}
      />
    );
  }

  if (isDocument) {
    return (
      <a 
        href={mediaData} 
        target="_blank" 
        rel="noopener noreferrer" 
        className="flex items-center gap-3 p-3 bg-slate-50 hover:bg-slate-100 text-slate-800 rounded-xl transition-all border border-slate-200/80 shadow-xs max-w-full md:max-w-[280px]"
      >
        <span className="text-2xl shrink-0">📄</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold truncate text-slate-800">{alt && !alt.startsWith('data:') ? alt : 'Documento Anexo'}</p>
          <p className="text-[10px] text-slate-500 font-medium">Toque para abrir / baixar</p>
        </div>
      </a>
    );
  }

  return (
    <a href={mediaData} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-lg">
      <img 
        src={mediaData} 
        alt={alt && !alt.startsWith('data:') ? alt : 'Mídia recebida'} 
        className={className} 
        onLoad={onLoad} 
      />
    </a>
  );
};

export const AudioViewer = ({ url, className }: { url: string, className?: string }) => {
  const [mediaData, setMediaData] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let processUrl = url;
    if (url.startsWith('data:audio/ogg; codecs=opus;base64,data:audio/ogg; codecs=opus;base64,')) {
       processUrl = url.replace('data:audio/ogg; codecs=opus;base64,data:audio/ogg; codecs=opus;base64,', 'data:audio/ogg; codecs=opus;base64,');
    } else if (url.includes('{"messageId"')) {
       try {
           const jsonStr = url.substring(url.indexOf('{'));
           const parsed = JSON.parse(jsonStr);
           if (parsed.base64 && parsed.mimetype) {
               processUrl = `data:${parsed.mimetype};base64,${parsed.base64}`;
           }
       } catch (e) {}
    }

    if (processUrl.startsWith('data:') || processUrl.startsWith('blob:')) {
      setMediaData(processUrl);
      return;
    }

    if (url.includes('api-wa.me') || url.includes('wame')) {
      setLoading(true);
      fetch(url)
        .then(res => res.json())
        .then(data => {
          if (data && data.base64 && data.mimetype) {
            setMediaData(`data:${data.mimetype};base64,${data.base64}`);
          }
          setLoading(false);
        })
        .catch(() => setLoading(false));
    } else {
      setMediaData(url);
    }
  }, [url]);

  if (loading) {
    return <div className="text-sm text-gray-400 italic mb-2">Baixando áudio...</div>;
  }

  if (!mediaData) {
    return <div className="text-sm text-red-400 italic mb-2">Áudio indisponível</div>;
  }

  return <audio controls src={mediaData} className={className} />;
};
