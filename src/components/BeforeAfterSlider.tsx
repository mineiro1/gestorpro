import React, { useState, useRef, useCallback, useEffect } from 'react';
import { 
  Sparkles, 
  AlertTriangle, 
  CheckCircle2, 
  MoveHorizontal, 
  MessageCircle
} from 'lucide-react';

interface BeforeAfterProps {
  whatsappUrl: string;
}

export default function BeforeAfterSlider({ whatsappUrl }: BeforeAfterProps) {
  const [sliderPosition, setSliderPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const [activeTab, setActiveTab] = useState<'slider' | 'before' | 'after'>('slider');
  const containerRef = useRef<HTMLDivElement>(null);

  // Raw GitHub Image URLs
  const beforeImage = 'https://raw.githubusercontent.com/mineiro1/fotos/main/WhatsApp%20Image%202026-10-04%20at%2018.13.35.jpeg';
  const afterImage = 'https://raw.githubusercontent.com/mineiro1/fotos/main/WhatsApp%20Image%202026-10-04%20at%2018.09.21.jpeg';

  const handleMove = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const position = (x / rect.width) * 100;
    setSliderPosition(Math.max(0, Math.min(100, position)));
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isDragging) return;
    handleMove(e.touches[0].clientX);
  }, [isDragging, handleMove]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    handleMove(e.clientX);
  }, [isDragging, handleMove]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchmove', handleTouchMove);
      window.addEventListener('touchend', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp, handleTouchMove]);

  const quoteUrl = `${whatsappUrl}&text=${encodeURIComponent('Olá RS Piscinas! Vi o Antes e Depois no site e quero deixar a minha piscina cristalina assim também!')}`;

  return (
    <section id="antes-depois" className="py-16 sm:py-24 bg-gradient-to-b from-slate-900 via-slate-950 to-slate-900 border-t border-slate-800/80 relative overflow-hidden">
      {/* Decorative Glow */}
      <div className="absolute top-1/2 left-1/4 -translate-y-1/2 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-10 sm:mb-14 space-y-3 sm:space-y-4">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-cyan-950/80 border border-cyan-500/40 text-cyan-300 text-xs sm:text-sm font-semibold uppercase tracking-wider shadow-sm">
            <Sparkles className="w-4 h-4 text-cyan-400" />
            <span>Transformação Real · Resultados RS Piscinas</span>
          </div>

          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight leading-tight">
            Veja a Diferença do Nosso <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-400 via-cyan-300 to-emerald-400">Tratamento</span>
          </h2>

          <p className="text-slate-300 text-sm sm:text-base lg:text-lg leading-relaxed">
            Arraste a barra para comparar a piscina antes e depois do nosso trabalho especializado de decantação, aspiração e correção química.
          </p>

          {/* Mode Switcher on mobile/desktop */}
          <div className="inline-flex items-center p-1 bg-slate-900/90 border border-slate-800 rounded-2xl shadow-inner gap-1">
            <button
              type="button"
              onClick={() => { setActiveTab('slider'); setSliderPosition(50); }}
              className={`px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                activeTab === 'slider' 
                  ? 'bg-sky-500 text-slate-950 shadow-md shadow-sky-500/20' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Interativo (Deslizar)
            </button>
            <button
              type="button"
              onClick={() => { setActiveTab('before'); setSliderPosition(100); }}
              className={`px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                activeTab === 'before' 
                  ? 'bg-red-500/90 text-white shadow-md' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Ver Antes
            </button>
            <button
              type="button"
              onClick={() => { setActiveTab('after'); setSliderPosition(0); }}
              className={`px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                activeTab === 'after' 
                  ? 'bg-emerald-500 text-slate-950 shadow-md' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Ver Depois
            </button>
          </div>
        </div>

        {/* Comparison Showcase Container */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          
          {/* Main Interactive Visual Slider (8 cols on desktop) */}
          <div className="lg:col-span-8">
            <div 
              ref={containerRef}
              className="relative w-full aspect-[4/3] sm:aspect-[16/10] md:aspect-[16/9] rounded-3xl overflow-hidden border-2 border-slate-700/80 shadow-2xl bg-slate-950 select-none touch-none cursor-ew-resize group"
              onMouseDown={() => { setIsDragging(true); setActiveTab('slider'); }}
              onTouchStart={() => { setIsDragging(true); setActiveTab('slider'); }}
            >
              {/* After Image (Background / Base Image) */}
              <img 
                src={afterImage} 
                alt="Piscina Depois do Tratamento RS Piscinas" 
                className="absolute inset-0 w-full h-full object-cover select-none pointer-events-none"
                loading="eager"
                onError={(e) => {
                  e.currentTarget.src = 'https://github.com/mineiro1/fotos/raw/main/WhatsApp%20Image%202026-10-04%20at%2018.09.21.jpeg';
                }}
              />

              {/* Before Image (Clipped / Foreground Image) */}
              <div 
                className="absolute inset-0 overflow-hidden select-none pointer-events-none"
                style={{ width: `${sliderPosition}%` }}
              >
                <img 
                  src={beforeImage} 
                  alt="Piscina Antes do Tratamento RS Piscinas" 
                  className="absolute inset-0 w-full h-full object-cover max-w-none select-none pointer-events-none"
                  style={{ 
                    width: containerRef.current ? `${containerRef.current.clientWidth}px` : '100%',
                    height: '100%' 
                  }}
                  onError={(e) => {
                    e.currentTarget.src = 'https://github.com/mineiro1/fotos/raw/main/WhatsApp%20Image%202026-10-04%20at%2018.13.35.jpeg';
                  }}
                />
                <div className="absolute inset-0 bg-black/10 pointer-events-none" />
              </div>

              {/* Badges Over Image */}
              <div className="absolute top-4 left-4 z-20 pointer-events-none">
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-950/90 text-red-300 border border-red-500/50 font-bold text-xs sm:text-sm backdrop-blur-md shadow-lg">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                  <span>ANTES</span>
                </span>
              </div>

              <div className="absolute top-4 right-4 z-20 pointer-events-none">
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-950/90 text-emerald-300 border border-emerald-500/50 font-bold text-xs sm:text-sm backdrop-blur-md shadow-lg">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>DEPOIS (RS Piscinas)</span>
                </span>
              </div>

              {/* Drag Line & Divider Handle */}
              <div 
                className="absolute top-0 bottom-0 z-30 pointer-events-none"
                style={{ left: `${sliderPosition}%` }}
              >
                {/* Vertical Divider Line */}
                <div className="w-1 bg-white h-full shadow-[0_0_12px_rgba(255,255,255,0.8)] -ml-0.5" />

                {/* Circular Draggable Button */}
                <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-sky-500 border-2 border-white shadow-2xl flex items-center justify-center text-slate-950 group-hover:scale-110 transition-transform">
                  <MoveHorizontal className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.5]" />
                </div>
              </div>

              {/* Bottom Instruction Helper */}
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 pointer-events-none bg-slate-950/80 backdrop-blur-md px-3.5 py-1 rounded-full border border-slate-700/80 text-[11px] sm:text-xs text-slate-300 flex items-center gap-1.5 opacity-90 group-hover:opacity-100 transition-opacity">
                <MoveHorizontal className="w-3.5 h-3.5 text-sky-400" />
                <span>Arraste para os lados para comparar</span>
              </div>
            </div>
          </div>

          {/* Side Info & Comparison Details (4 cols on desktop) */}
          <div className="lg:col-span-4 space-y-4">
            
            {/* Before Box */}
            <div className="p-4 sm:p-5 rounded-2xl bg-red-950/20 border border-red-900/40 space-y-2">
              <div className="flex items-center gap-2 text-red-400 font-bold text-sm">
                <AlertTriangle className="w-4 h-4" />
                <span>Situação Inicial (Antes)</span>
              </div>
              <ul className="text-xs sm:text-sm text-slate-300 space-y-1.5 leading-relaxed">
                <li className="flex items-start gap-2">
                  <span className="text-red-400 font-bold">•</span>
                  <span>Água turva e esverdeada com proliferação de algas.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-400 font-bold">•</span>
                  <span>Parâmetros químicos desregulados e risco de bactérias.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-400 font-bold">•</span>
                  <span>Fundo e paredes com acúmulo de impurezas e lodo.</span>
                </li>
              </ul>
            </div>

            {/* After Box */}
            <div className="p-4 sm:p-5 rounded-2xl bg-emerald-950/30 border border-emerald-800/40 space-y-2">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                <CheckCircle2 className="w-4 h-4" />
                <span>Resultado Padrão RS Piscinas (Depois)</span>
              </div>
              <ul className="text-xs sm:text-sm text-slate-300 space-y-1.5 leading-relaxed">
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 font-bold">✓</span>
                  <span>Água 100% cristalina, translúcida e sem cheiro forte.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 font-bold">✓</span>
                  <span>pH e Cloro Livre ajustados com precisão cirúrgica.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 font-bold">✓</span>
                  <span>Segurança total e saúde garantida para toda a família.</span>
                </li>
              </ul>
            </div>

            {/* Direct WhatsApp Call to Action */}
            <div className="pt-2">
              <a
                href={quoteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full inline-flex items-center justify-center gap-2.5 py-3.5 sm:py-4 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-sm sm:text-base transition-all shadow-xl shadow-emerald-600/25 hover:shadow-emerald-500/40 transform hover:-translate-y-0.5 cursor-pointer"
              >
                <MessageCircle className="w-5 h-5 fill-white shrink-0" />
                <span>Quero Minha Piscina Assim!</span>
              </a>
              <p className="text-center text-[11px] sm:text-xs text-slate-400 mt-2">
                Atendimento rápido para Campo Grande e região.
              </p>
            </div>

          </div>

        </div>

      </div>
    </section>
  );
}
