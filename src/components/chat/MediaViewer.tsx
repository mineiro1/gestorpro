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

  const isVideo = mediaData.startsWith('data:video') || mediaData.endsWith('.mp4') || mediaData.endsWith('.mov') || mediaData.endsWith('.webm') || url.includes('video');

  if (isVideo) {
    return (
      <video
        src={mediaData}
        controls
        playsInline
        className={className}
        onLoadedData={onLoad}
      />
    );
  }

  return (
    <a href={mediaData} target="_blank" rel="noopener noreferrer">
      <img src={mediaData} alt={alt} className={className} onLoad={onLoad} />
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
