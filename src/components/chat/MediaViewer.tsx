import React, { useState, useEffect } from 'react';

export const MediaViewer = ({ url, alt, className }: { url: string, alt: string, className?: string }) => {
  const [mediaData, setMediaData] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (url.startsWith('data:') || url.startsWith('blob:')) {
      setMediaData(url);
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

  return (
    <a href={mediaData} target="_blank" rel="noopener noreferrer">
      <img src={mediaData} alt={alt} className={className} />
    </a>
  );
};

export const AudioViewer = ({ url, className }: { url: string, className?: string }) => {
  const [mediaData, setMediaData] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (url.startsWith('data:') || url.startsWith('blob:')) {
      setMediaData(url);
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
