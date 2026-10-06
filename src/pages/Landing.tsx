import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { RS_LOGO_BASE64 } from '../assets/logoBase64';
import { 
  Droplets, 
  ShieldCheck, 
  Sparkles, 
  Wrench, 
  HeartHandshake, 
  Phone, 
  MessageCircle, 
  CheckCircle2, 
  AlertTriangle, 
  Activity, 
  Gauge, 
  Zap, 
  ArrowRight, 
  Clock, 
  ChevronDown, 
  Check, 
  ShieldAlert, 
  UserCheck, 
  Coins, 
  LogIn,
  Instagram,
  MoveHorizontal,
  Star,
  ChevronLeft,
  ChevronRight,
  Quote,
  MapPin
} from 'lucide-react';

/* -------------------------------------------------------------------------- */
/* Before & After Interactive Comparison Slider Component                     */
/* -------------------------------------------------------------------------- */
interface BeforeAfterProps {
  whatsappUrl: string;
}

function BeforeAfterSlider({ whatsappUrl }: BeforeAfterProps) {
  const [sliderPosition, setSliderPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const [activeTab, setActiveTab] = useState<'slider' | 'before' | 'after'>('slider');
  const containerRef = useRef<HTMLDivElement>(null);

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
      <div className="absolute top-1/2 left-1/4 -translate-y-1/2 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
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

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-8">
            <div 
              ref={containerRef}
              className="relative w-full aspect-[4/3] sm:aspect-[16/10] md:aspect-[16/9] rounded-3xl overflow-hidden border-2 border-slate-700/80 shadow-2xl bg-slate-950 select-none touch-none cursor-ew-resize group"
              onMouseDown={() => { setIsDragging(true); setActiveTab('slider'); }}
              onTouchStart={() => { setIsDragging(true); setActiveTab('slider'); }}
            >
              <img 
                src={afterImage} 
                alt="Piscina Depois do Tratamento RS Piscinas" 
                className="absolute inset-0 w-full h-full object-cover select-none pointer-events-none"
                loading="eager"
              />

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
                />
                <div className="absolute inset-0 bg-black/10 pointer-events-none" />
              </div>

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

              <div 
                className="absolute top-0 bottom-0 z-30 pointer-events-none"
                style={{ left: `${sliderPosition}%` }}
              >
                <div className="w-1 bg-white h-full shadow-[0_0_12px_rgba(255,255,255,0.8)] -ml-0.5" />
                <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-sky-500 border-2 border-white shadow-2xl flex items-center justify-center text-slate-950 group-hover:scale-110 transition-transform">
                  <MoveHorizontal className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.5]" />
                </div>
              </div>

              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 pointer-events-none bg-slate-950/80 backdrop-blur-md px-3.5 py-1 rounded-full border border-slate-700/80 text-[11px] sm:text-xs text-slate-300 flex items-center gap-1.5 opacity-90 group-hover:opacity-100 transition-opacity">
                <MoveHorizontal className="w-3.5 h-3.5 text-sky-400" />
                <span>Arraste para os lados para comparar</span>
              </div>
            </div>
          </div>

          <div className="lg:col-span-4 space-y-4">
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

/* -------------------------------------------------------------------------- */
/* Testimonials Carousel Component                                            */
/* -------------------------------------------------------------------------- */
const testimonialsData = [
  {
    id: '1',
    name: 'Simone Martins',
    role: 'Residência Familiar',
    location: 'Damha - Campo Grande, MS',
    image: 'https://raw.githubusercontent.com/mineiro1/fotos/main/WhatsApp%20Image%202026-10-04%20at%2018.09.21.jpeg',
    serviceType: 'Contrato Mensal de Tratamento',
    rating: 5,
    text: 'Minha piscina estava com a água totalmente verde e turva após um período de chuvas. A equipe da RS Piscinas veio no mesmo dia, fez a decantação e no dia seguinte a água parecia um espelho de tão cristalina. Já fechei o contrato semanal e nunca mais tive dor de cabeça.',
    highlight: 'Água 100% cristalina em menos de 24h'
  },
  {
    id: '2',
    name: 'Isabella Zamboni',
    role: '',
    location: 'BR 262 - Campo Grande, MS',
    image: 'https://raw.githubusercontent.com/mineiro1/fotos/main/WhatsApp%20Image%202026-10-04%20at%2019.19.29.jpeg',
    serviceType: 'Correção Química & Limpeza',
    rating: 5,
    text: 'Tinha muita irritação nos olhos pois eu mesma fazia o tratamento da minha piscina e utilizava os produtos de maneira errada. Com o controle rigoroso de pH e cloro da RS Piscinas, utilizo a piscina o fim de semana todo sem qualquer ardência ou cheiro forte!',
    highlight: 'Zero ardência nos olhos e sem cheiro forte'
  },
  {
    id: '3',
    name: 'Roberto Siqueira',
    role: 'Proprietário Residencial',
    location: 'Residencial Rita Vieira - Campo Grande, MS',
    image: 'https://raw.githubusercontent.com/mineiro1/fotos/main/WhatsApp%20Image%202026-10-04%20at%2019.24.31.jpeg',
    serviceType: 'Troca de Areia & Reparo de Bomba',
    rating: 5,
    text: 'A bomba da piscina estava fazendo um barulho horrível e a água não limpava direito. O técnico identificou de imediato que a areia do filtro estava saturada e o rolamento do motor desgastado. Fizeram a troca e manutenção preventiva na casa de máquinas com total agilidade e preço justo.',
    highlight: 'Manutenção completa da casa de máquinas'
  },
  {
    id: '4',
    name: 'Patrícia Alencar',
    role: 'Residência Familiar',
    location: 'Carandá Bosque - Campo Grande, MS',
    image: 'https://raw.githubusercontent.com/mineiro1/fotos/main/WhatsApp%20Image%202026-10-04%20at%2019.20.46.jpeg',
    serviceType: 'Limpeza de Capa & Tratamento Semanal',
    rating: 5,
    text: 'Profissionalismo impecável. São pontuais, avisam sempre quando estão a caminho e enviam o relatório das medições. A capa térmica foi lavada e ficou como nova. Recomendo de olhos fechados para quem busca tranquilidade e piscina impecável.',
    highlight: 'Pontualidade e relatório de cada visita'
  }
];

interface TestimonialsCarouselProps {
  whatsappUrl: string;
}

function TestimonialsCarousel({ whatsappUrl }: TestimonialsCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);
  const touchStartX = useRef<number | null>(null);

  const nextSlide = () => {
    setCurrentIndex((prev) => (prev + 1) % testimonialsData.length);
  };

  const prevSlide = () => {
    setCurrentIndex((prev) => (prev - 1 + testimonialsData.length) % testimonialsData.length);
  };

  useEffect(() => {
    if (!isAutoPlaying) return;
    const interval = setInterval(() => {
      nextSlide();
    }, 6000);
    return () => clearInterval(interval);
  }, [isAutoPlaying]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX.current - touchEndX;

    if (diff > 50) {
      nextSlide();
    } else if (diff < -50) {
      prevSlide();
    }
    touchStartX.current = null;
  };

  const current = testimonialsData[currentIndex];

  return (
    <section id="depoimentos" className="py-16 sm:py-24 bg-slate-900 border-t border-slate-800/80 relative overflow-hidden">
      <div className="absolute top-1/3 left-10 w-80 h-80 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="text-center max-w-3xl mx-auto mb-12 sm:mb-16 space-y-3 sm:space-y-4">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 text-xs sm:text-sm font-semibold uppercase tracking-wider">
            <Sparkles className="w-4 h-4 text-emerald-400" />
            <span>Depoimentos & Casos Reais</span>
          </div>

          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight text-balance">
            Quem Contrata a <span className="text-sky-400">RS Piscinas</span> Recomenda
          </h2>

          <p className="text-slate-300 text-sm sm:text-base lg:text-lg">
            Confira a experiência de clientes em Campo Grande que confiam a saúde e a beleza de suas piscinas ao nosso time.
          </p>
        </div>

        <div 
          className="max-w-5xl mx-auto"
          onMouseEnter={() => setIsAutoPlaying(false)}
          onMouseLeave={() => setIsAutoPlaying(true)}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <div className="relative bg-slate-950/90 border border-slate-800 rounded-3xl p-6 sm:p-10 shadow-2xl overflow-hidden backdrop-blur-sm">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              <div className="lg:col-span-5 relative">
                <div className="relative aspect-[4/3] sm:aspect-square rounded-2xl overflow-hidden border border-slate-700/80 shadow-xl bg-slate-900 group">
                  <img 
                    src={current.image} 
                    alt={`Piscina de ${current.name}`}
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent pointer-events-none" />
                  
                  <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2">
                    <span className="px-2.5 py-1 rounded-lg bg-slate-900/90 border border-slate-700 text-sky-300 font-bold text-xs backdrop-blur-md shadow">
                      {current.serviceType}
                    </span>
                    <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-950/90 px-2 py-1 rounded-lg border border-emerald-800/60 backdrop-blur-md">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Verificado
                    </span>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-7 flex flex-col justify-between space-y-6">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-1">
                      {[...Array(current.rating)].map((_, i) => (
                        <Star key={i} className="w-5 h-5 fill-amber-400 text-amber-400" />
                      ))}
                      <span className="ml-2 text-xs font-bold text-amber-300">5.0 / 5.0</span>
                    </div>
                    <Quote className="w-8 h-8 text-sky-500/30" />
                  </div>

                  <div className="inline-block px-3 py-1 rounded-lg bg-sky-950/70 border border-sky-500/30 text-sky-300 text-xs sm:text-sm font-semibold mb-4">
                    "{current.highlight}"
                  </div>

                  <p className="text-slate-200 text-sm sm:text-base leading-relaxed italic">
                    "{current.text}"
                  </p>
                </div>

                <div className="pt-4 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h4 className="font-bold text-white text-base sm:text-lg">{current.name}</h4>
                    {current.role ? <p className="text-xs text-slate-400">{current.role}</p> : null}
                    <div className="flex items-center gap-1 text-xs text-emerald-400 mt-1">
                      <MapPin className="w-3.5 h-3.5 shrink-0" />
                      <span>{current.location}</span>
                    </div>
                  </div>

                  <a
                    href={`${whatsappUrl}&text=${encodeURIComponent(`Olá! Vi o depoimento de ${current.name} no site e gostaria de um orçamento para a minha piscina também.`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-emerald-600 text-slate-200 hover:text-white font-bold text-xs transition-all border border-slate-700 hover:border-emerald-500 self-start sm:self-auto"
                  >
                    <MessageCircle className="w-3.5 h-3.5 fill-current" />
                    <span>Quero um resultado assim</span>
                  </a>
                </div>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-slate-800/60 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {testimonialsData.map((_, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setCurrentIndex(idx)}
                    aria-label={`Ir para depoimento ${idx + 1}`}
                    className={`h-2.5 rounded-full transition-all duration-300 cursor-pointer ${
                      currentIndex === idx 
                        ? 'w-8 bg-sky-400 shadow-md shadow-sky-400/30' 
                        : 'w-2.5 bg-slate-700 hover:bg-slate-500'
                    }`}
                  />
                ))}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={prevSlide}
                  aria-label="Depoimento anterior"
                  className="p-2.5 rounded-xl bg-slate-900 border border-slate-700 hover:bg-slate-800 text-slate-200 hover:text-white transition-all cursor-pointer"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={nextSlide}
                  aria-label="Próximo depoimento"
                  className="p-2.5 rounded-xl bg-slate-900 border border-slate-700 hover:bg-slate-800 text-slate-200 hover:text-white transition-all cursor-pointer"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto text-center">
          <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800">
            <div className="text-2xl font-black text-sky-400">+1.500</div>
            <div className="text-xs text-slate-400 mt-0.5">Atendimentos Realizados</div>
          </div>
          <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800">
            <div className="text-2xl font-black text-emerald-400">100%</div>
            <div className="text-xs text-slate-400 mt-0.5">Água Limpa Garantida</div>
          </div>
          <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800">
            <div className="text-2xl font-black text-amber-400">5.0 ★</div>
            <div className="text-xs text-slate-400 mt-0.5">Avaliação Média dos Clientes</div>
          </div>
          <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800">
            <div className="text-2xl font-black text-purple-400">Campo Grande</div>
            <div className="text-xs text-slate-400 mt-0.5">Atendimento Rápido Local</div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function Landing() {
  const whatsappNumber = '5567992499469';
  const defaultWhatsAppText = encodeURIComponent('Olá! Gostaria de solicitar um orçamento para o tratamento e manutenção da minha piscina com a RS Piscinas.');
  const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${defaultWhatsAppText}`;
  const instagramUrl = 'https://www.instagram.com/rs_piscina_cg/';

  // Interactive Quote Simulator State
  const [poolType, setPoolType] = useState('Alvenaria / Azulejo');
  const [frequency, setFrequency] = useState('Semanal (Contrato Mensal)');
  const [selectedServices, setSelectedServices] = useState<string[]>([
    'Limpeza e Tratamento da Piscina',
    'Correção Química da Água'
  ]);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const toggleService = (srv: string) => {
    setSelectedServices(prev => 
      prev.includes(srv) ? prev.filter(s => s !== srv) : [...prev, srv]
    );
  };

  const getCustomizedQuoteUrl = () => {
    const text = `Olá, RS Piscinas! Gostaria de solicitar um orçamento com as seguintes informações:\n\n` +
      `🏊 *Tipo de Piscina:* ${poolType}\n` +
      `📅 *Frequência Desejada:* ${frequency}\n` +
      `🛠️ *Serviços de Interesse:*\n${selectedServices.map(s => ` • ${s}`).join('\n')}\n\n` +
      `Aguardo o retorno para agendarmos uma avaliação!`;
    return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(text)}`;
  };

  const servicesList = [
    {
      id: 'limpeza-tratamento',
      title: 'Limpeza e Tratamento Completo',
      badge: 'Essencial',
      desc: 'Aspiração cuidadosa de fundo, escovação de paredes, remoção de folhas, decantação e controle de algas para deixar a água 100% cristalina.',
      icon: Droplets,
      highlights: ['Aspiração e escovação', 'Peneiração de resíduos', 'Clarificação da água']
    },
    {
      id: 'correcao-quimica',
      title: 'Correção Química Rigorosa',
      badge: 'Saúde & Conforto',
      desc: 'Medição e ajuste balanceado dos parâmetros: pH, Cloro Livre, Alcalinidade Total e Ácido Cianúrico. Água pura que não irrita olhos e pele.',
      icon: Activity,
      highlights: ['Ajuste preciso de pH e Cloro', 'Controle de Alcalinidade', 'Eliminação de fungos e bactérias']
    },
    {
      id: 'limpeza-capa',
      title: 'Limpeza e Higienização de Capas',
      badge: 'Proteção & Durabilidade',
      desc: 'Lavagem técnica e remoção de limo, mofo, resíduos acumulados e sujeiras em capas térmicas e capas de proteção, preservando sua vida útil.',
      icon: Sparkles,
      highlights: ['Remoção de mofo e limo', 'Preservação do material', 'Higienização de capas térmicas']
    },
    {
      id: 'troca-areia',
      title: 'Troca de Areia do Filtro',
      badge: 'Eficiência Filtrante',
      desc: 'Substituição periódica da areia saturada do filtro por areia de alta retenção ou zeólita, restabelecendo a capacidade máxima de purificação.',
      icon: Gauge,
      highlights: ['Remoção de areia gasta', 'Limpeza interna do tanque', 'Elemento filtrante novo e eficiente']
    },
    {
      id: 'motores-bombas',
      title: 'Manutenção de Motores e Bombas',
      badge: 'Mecânica Especializada',
      desc: 'Conserto, substituição de rolamentos, selo mecânico, desobstrução de rotor e reparos elétricos no motor da piscina com total segurança.',
      icon: Wrench,
      highlights: ['Reparo e troca de rolamentos', 'Substituição de selo mecânico', 'Diagnóstico de barulhos e vazamentos']
    },
    {
      id: 'disjuntores-registros',
      title: 'Disjuntores, Registros e Casa de Máquinas',
      badge: 'Segurança Total',
      desc: 'Troca e adequação de disjuntores, substituição de registros emperrados, reparos hidráulicos em canos PVC e organização da casa de máquinas.',
      icon: Zap,
      highlights: ['Troca de registros com vazamento', 'Adequação elétrica e disjuntores', 'Reforma e reparos na tubulação']
    }
  ];

  const faqs = [
    {
      q: 'Com que frequência devo contratar a limpeza da piscina?',
      a: 'Para piscinas residenciais com uso regular, recomendamos o tratamento semanal. Isso evita o acúmulo de algas, impede a proliferação de bactérias e mantém os níveis químicos sempre equilibrados para o banho seguro da sua família.'
    },
    {
      q: 'Por que não devo deixar a água da piscina sem tratamento profissional?',
      a: 'Água sem tratamento ou tratada incorretamente acumula bactérias invisíveis a olho nu, como a Pseudomonas aeruginosa, além de fungos causadores de micoses e infecções de ouvido (otites). Além disso, produtos mal dosados podem queimar a pele, desbotar o revestimento e queimar a bomba.'
    },
    {
      q: 'De quanto em quanto tempo devo realizar a troca de areia do filtro?',
      a: 'Recomenda-se trocar a areia do filtro a cada 1 a 2 anos. Com o tempo, os grãos de areia ficam arredondados e perdem a capacidade de retenção, fazendo com que a sujeira retorne para a piscina e a água fique turva.'
    },
    {
      q: 'A RS Piscinas atende consertos e reparos na casa de máquinas?',
      a: 'Sim! Além do tratamento da água, somos especializados na manutenção completa da casa de máquinas: conserto de motores, troca de registros, troca de areia, vazamentos hidráulicos e adequação elétrica de disjuntores.'
    },
    {
      q: 'Como solicito um orçamento para a minha piscina?',
      a: 'Basta clicar no botão de WhatsApp do nosso site! Nós avaliamos o volume da sua piscina e suas necessidades para enviar uma proposta personalizada rapidamente.'
    }
  ];

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans selection:bg-blue-500 selection:text-white">
      {/* Top Banner Notice */}
      <div className="bg-gradient-to-r from-blue-950 via-slate-900 to-blue-950 border-b border-blue-900/40 text-[11px] sm:text-xs py-1.5 px-3 text-center text-blue-200/90 flex items-center justify-center gap-2 overflow-hidden">
        <span className="font-bold text-white">RS Piscinas</span>
        <span>·</span>
        <span className="font-mono">CNPJ: 37.666.108.0001/28</span>
        <span className="hidden sm:inline">·</span>
        <span className="hidden sm:inline text-sky-300">Tratamento & Manutenção Profissional</span>
      </div>

      {/* Top Bar Navigation - Responsive Mobile-First Design */}
      <header className="sticky top-0 z-50 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 transition-all">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between gap-2">
          
          {/* Zone 1: Company Logo + Name (Locked, never compressed or covered) */}
          <a href="#" className="flex items-center gap-2 sm:gap-3 group focus:outline-none shrink-0 min-w-0">
            <img 
              src={RS_LOGO_BASE64} 
              alt="RS Piscinas Logo" 
              className="h-9 w-9 sm:h-12 sm:w-12 object-contain transition-transform group-hover:scale-105 drop-shadow shrink-0" 
            />
            <span className="text-lg sm:text-2xl font-black text-white tracking-tight whitespace-nowrap">
              RS <span className="text-sky-400">Piscinas</span>
            </span>
          </a>

          {/* Zone 2: Navigation Links (Desktop) */}
          <nav className="hidden lg:flex items-center gap-4 xl:gap-6 text-sm font-medium text-slate-300">
            <a href="#antes-depois" className="hover:text-sky-400 text-sky-400/95 font-semibold transition-colors">Antes & Depois</a>
            <a href="#servicos" className="hover:text-sky-400 transition-colors">Serviços</a>
            <a href="#saude-familia" className="hover:text-sky-400 transition-colors">Saúde & Família</a>
            <a href="#por-que-profissional" className="hover:text-sky-400 transition-colors">Por Que Contratar</a>
            <a href="#depoimentos" className="hover:text-sky-400 transition-colors">Depoimentos</a>
            <a href="#simulador" className="hover:text-sky-400 transition-colors">Orçamento</a>
            <a href="#faq" className="hover:text-sky-400 transition-colors">Dúvidas</a>
          </nav>

          {/* Zone 3: Primary Actions (Instagram, WhatsApp, Entrar - perfectly spaced on mobile) */}
          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            {/* Instagram Button */}
            <a 
              href={instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Instagram da RS Piscinas"
              className="inline-flex items-center justify-center gap-1.5 p-2 sm:px-3.5 sm:py-2 rounded-xl text-xs sm:text-sm font-bold text-white bg-gradient-to-r from-purple-600 via-pink-600 to-amber-500 hover:opacity-95 transition-all shadow-md shadow-pink-600/20 hover:scale-105 shrink-0 cursor-pointer"
              title="Siga a RS Piscinas no Instagram"
            >
              <Instagram className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">Instagram</span>
            </a>

            {/* WhatsApp Button */}
            <a 
              href={whatsappUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              aria-label="Chamar no WhatsApp"
              className="inline-flex items-center justify-center gap-1.5 p-2 sm:px-4 sm:py-2 text-xs sm:text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition-all shadow-md shadow-emerald-600/20 hover:scale-105 shrink-0 cursor-pointer"
              title="Solicitar Orçamento no WhatsApp"
            >
              <MessageCircle className="w-4 h-4 fill-white shrink-0" />
              <span className="hidden md:inline">WhatsApp</span>
            </a>

            {/* Entrar Button */}
            <Link 
              to="/login" 
              className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 sm:px-3.5 sm:py-2 text-xs sm:text-sm font-semibold text-slate-200 hover:text-white bg-slate-800/95 hover:bg-slate-700 border border-slate-700 rounded-xl transition-all whitespace-nowrap shrink-0"
              title="Acesso ao Sistema"
            >
              <LogIn className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-sky-400 shrink-0" />
              <span>Entrar</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-10 pb-16 sm:pt-16 sm:pb-24 lg:pt-20 lg:pb-28 overflow-hidden bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950">
        {/* Background Ambient Glow */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-1/3 right-10 w-[400px] h-[400px] bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-8 items-center">
            
            {/* Left Content */}
            <div className="lg:col-span-7 space-y-5 sm:space-y-6 text-center lg:text-left">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-950/80 border border-sky-500/30 text-sky-300 text-xs sm:text-sm font-medium">
                <Sparkles className="w-4 h-4 text-sky-400 shrink-0" />
                <span>Tratamento Especializado & Manutenção Preventiva</span>
              </div>

              <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-[1.15] text-balance">
                Sua piscina <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-400 via-cyan-300 to-blue-400">100% cristalina</span> e a saúde da sua família protegida.
              </h1>

              <p className="text-sm sm:text-base lg:text-lg text-slate-300 leading-relaxed max-w-2xl mx-auto lg:mx-0">
                Cuidamos da sua piscina com rigor técnico: limpeza completa, correção química precisa, lavagem de capa e consertos elétricos e hidráulicos na casa de máquinas. Água pura, saudável e equipamentos sempre conservados.
              </p>

              {/* CTAs with WhatsApp & Instagram */}
              <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3 pt-2">
                <a 
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-6 sm:px-8 py-3.5 sm:py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-sm sm:text-base transition-all shadow-xl shadow-emerald-600/25 hover:shadow-emerald-500/40 transform hover:-translate-y-0.5 cursor-pointer"
                >
                  <MessageCircle className="w-5 h-5 fill-white" />
                  <span>Pedir Orçamento no WhatsApp</span>
                </a>

                <a 
                  href={instagramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-6 sm:px-7 py-3.5 sm:py-4 rounded-2xl bg-gradient-to-r from-purple-600 via-pink-600 to-amber-500 hover:opacity-90 text-white font-bold text-sm sm:text-base transition-all shadow-lg shadow-pink-600/20 transform hover:-translate-y-0.5 cursor-pointer"
                >
                  <Instagram className="w-5 h-5" />
                  <span>Seguir no Instagram</span>
                </a>
              </div>

              {/* Trust Badges */}
              <div className="pt-5 border-t border-slate-800/80 grid grid-cols-3 gap-2.5 sm:gap-3 text-left">
                <div className="p-2.5 sm:p-3 rounded-xl bg-slate-800/40 border border-slate-800">
                  <div className="text-sky-400 font-bold text-base sm:text-xl">100%</div>
                  <div className="text-[11px] sm:text-xs text-slate-400 mt-0.5">Água Cristalina</div>
                </div>
                <div className="p-2.5 sm:p-3 rounded-xl bg-slate-800/40 border border-slate-800">
                  <div className="text-emerald-400 font-bold text-base sm:text-xl">Zero</div>
                  <div className="text-[11px] sm:text-xs text-slate-400 mt-0.5">Irritação nos Olhos</div>
                </div>
                <div className="p-2.5 sm:p-3 rounded-xl bg-slate-800/40 border border-slate-800">
                  <div className="text-amber-400 font-bold text-base sm:text-xl">Completo</div>
                  <div className="text-[11px] sm:text-xs text-slate-400 mt-0.5">Água + Equipamentos</div>
                </div>
              </div>
            </div>

            {/* Right Card / Visual Showcase */}
            <div className="lg:col-span-5">
              <div className="relative mx-auto max-w-md bg-gradient-to-b from-slate-800 to-slate-900 border border-slate-700/80 rounded-3xl p-5 sm:p-7 shadow-2xl overflow-hidden">
                <div className="absolute -top-12 -right-12 w-40 h-40 bg-sky-500/20 rounded-full blur-2xl pointer-events-none" />
                
                <div className="flex items-center justify-between pb-4 sm:pb-5 border-b border-slate-700/60">
                  <div className="flex items-center gap-3">
                    <img 
                      src={RS_LOGO_BASE64} 
                      alt="RS Piscinas" 
                      className="w-10 h-10 object-contain" 
                    />
                    <div>
                      <h3 className="font-bold text-white text-sm sm:text-base">Padrão RS Piscinas</h3>
                      <p className="text-xs text-slate-400">Qualidade Técnica Garantida</p>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-emerald-950 border border-emerald-500/40 text-emerald-400">
                    Ativo
                  </span>
                </div>

                {/* Status Parameters */}
                <div className="mt-5 sm:mt-6 space-y-3">
                  <div className="bg-slate-950/70 p-3 sm:p-3.5 rounded-xl border border-slate-800/80 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-sky-500/20 flex items-center justify-center text-sky-400">
                        <Activity className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs text-slate-400">pH da Água</div>
                        <div className="text-xs sm:text-sm font-bold text-slate-200">7.2 - 7.6 (Ideal)</div>
                      </div>
                    </div>
                    <span className="text-xs font-semibold text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800/50">Equilibrado</span>
                  </div>

                  <div className="bg-slate-950/70 p-3 sm:p-3.5 rounded-xl border border-slate-800/80 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400">
                        <Droplets className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs text-slate-400">Cloro Livre Residual</div>
                        <div className="text-xs sm:text-sm font-bold text-slate-200">2.0 ppm (Perfeito)</div>
                      </div>
                    </div>
                    <span className="text-xs font-semibold text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800/50">Protegido</span>
                  </div>

                  <div className="bg-slate-950/70 p-3 sm:p-3.5 rounded-xl border border-slate-800/80 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center text-purple-400">
                        <Gauge className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs text-slate-400">Filtro & Areia</div>
                        <div className="text-xs sm:text-sm font-bold text-slate-200">Retenção Máxima</div>
                      </div>
                    </div>
                    <span className="text-xs font-semibold text-sky-400 bg-sky-950/80 px-2 py-0.5 rounded border border-sky-800/50">Revisado</span>
                  </div>

                  <div className="bg-slate-950/70 p-3 sm:p-3.5 rounded-xl border border-slate-800/80 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center text-amber-400">
                        <Wrench className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs text-slate-400">Casa de Máquinas</div>
                        <div className="text-xs sm:text-sm font-bold text-slate-200">Motores e Registros</div>
                      </div>
                    </div>
                    <span className="text-xs font-semibold text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800/50">100% Seguro</span>
                  </div>
                </div>

                <div className="mt-5 pt-4 sm:pt-5 border-t border-slate-700/60 flex items-center justify-between text-xs text-slate-400">
                  <span>Empresa Regularizada</span>
                  <span className="text-slate-200 font-mono font-medium">CNPJ: 37.666.108.0001/28</span>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* Interactive Before & After Showcase */}
      <BeforeAfterSlider whatsappUrl={whatsappUrl} />

      {/* Section: Serviços Realizados (Bento Grid) */}
      <section id="servicos" className="py-16 sm:py-24 lg:py-28 bg-slate-950 border-t border-slate-800/80 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="text-center max-w-3xl mx-auto mb-12 sm:mb-16 space-y-3 sm:space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-950/80 border border-sky-500/30 text-sky-400 text-xs font-semibold uppercase tracking-wider">
              Nossas Especialidades
            </div>
            <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight text-balance">
              Serviços Completos para sua Piscina e Casa de Máquinas
            </h2>
            <p className="text-slate-400 text-sm sm:text-base lg:text-lg">
              Soluções completas com atendimento de excelência. Cuidamos desde o equilíbrio físico-químico da água até reparos mecânicos e elétricos.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
            {servicesList.map((service) => {
              const IconComp = service.icon;
              return (
                <div 
                  key={service.id}
                  className="bg-slate-900/90 border border-slate-800 hover:border-sky-500/40 rounded-3xl p-6 sm:p-7 transition-all duration-300 hover:shadow-2xl hover:shadow-sky-500/10 flex flex-col justify-between group"
                >
                  <div>
                    <div className="flex items-center justify-between mb-4 sm:mb-5">
                      <div className="w-12 h-12 rounded-2xl bg-blue-950/80 border border-sky-500/30 flex items-center justify-center text-sky-400 group-hover:scale-110 group-hover:bg-sky-500 group-hover:text-slate-950 transition-all duration-300">
                        <IconComp className="w-6 h-6" />
                      </div>
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                        {service.badge}
                      </span>
                    </div>

                    <h3 className="text-lg sm:text-xl font-bold text-white mb-2 group-hover:text-sky-300 transition-colors">
                      {service.title}
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-400 leading-relaxed mb-5">
                      {service.desc}
                    </p>
                  </div>

                  <div>
                    <ul className="space-y-2 pt-4 border-t border-slate-800/80 text-xs text-slate-300">
                      {service.highlights.map((h, i) => (
                        <li key={i} className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                          <span>{h}</span>
                        </li>
                      ))}
                    </ul>

                    <a 
                      href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(`Olá! Gostaria de um orçamento para o serviço de: ${service.title}.`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-5 w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-emerald-600 text-slate-200 hover:text-white text-xs font-bold transition-all border border-slate-700 hover:border-emerald-500"
                    >
                      <span>Orçar este serviço</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>

        </div>
      </section>

      {/* Section: Saúde da sua Família & Por que contratar profissional */}
      <section id="saude-familia" className="py-16 sm:py-24 lg:py-28 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 border-t border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16 items-center">
            
            {/* Left Content */}
            <div className="lg:col-span-6 space-y-5 sm:space-y-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-950/80 border border-emerald-500/30 text-emerald-400 text-xs font-semibold uppercase tracking-wider">
                <ShieldCheck className="w-4 h-4" />
                <span>Saúde, Higiene & Bem-Estar</span>
              </div>

              <h2 className="text-2xl sm:text-4xl lg:text-5xl font-extrabold text-white tracking-tight leading-tight text-balance">
                Por que você não deve deixar a água da sua piscina nas mãos de amadores?
              </h2>

              <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
                Muitas pessoas acreditam que apenas adicionar cloro de vez em quando é suficiente. No entanto, uma piscina tratada sem conhecimentos técnicos representa riscos reais para quem você mais ama:
              </p>

              <div className="space-y-3.5 pt-2">
                <div className="p-4 rounded-2xl bg-red-950/30 border border-red-900/40 flex items-start gap-3.5 sm:gap-4">
                  <div className="p-2 rounded-xl bg-red-900/40 text-red-400 shrink-0 mt-0.5">
                    <ShieldAlert className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-red-200">Riscos de Água Desbalanceada</h4>
                    <p className="text-xs text-red-300/80 mt-1 leading-relaxed">
                      Otites (infecções de ouvido) frequentes em crianças, conjuntivites, dermatites e micoses provocadas por bactérias e fungos invisíveis.
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-amber-950/30 border border-amber-900/40 flex items-start gap-3.5 sm:gap-4">
                  <div className="p-2 rounded-xl bg-amber-900/40 text-amber-400 shrink-0 mt-0.5">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-amber-200">Queima de Olhos e Danos à Pele</h4>
                    <p className="text-xs text-amber-300/80 mt-1 leading-relaxed">
                      O pH desregulado provoca ressecamento severo dos cabelos, ardência nos olhos e formação de cloraminas que causam aquele forte cheiro sufocante.
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-900/40 flex items-start gap-3.5 sm:gap-4">
                  <div className="p-2 rounded-xl bg-emerald-900/40 text-emerald-400 shrink-0 mt-0.5">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-emerald-200">A Solução com a RS Piscinas</h4>
                    <p className="text-xs text-emerald-300/80 mt-1 leading-relaxed">
                      Equilíbrio milimétrico dos parâmetros químicos, esterilização eficiente da água e tranquilidade total para toda a família mergulhar sem medo.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Comparison Box */}
            <div className="lg:col-span-6" id="por-que-profissional">
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-8 shadow-2xl">
                <h3 className="text-xl sm:text-2xl font-bold text-white mb-5 flex items-center gap-2">
                  <UserCheck className="w-6 h-6 text-sky-400" />
                  <span>Os Benefícios de um Especialista</span>
                </h3>

                <div className="space-y-3.5">
                  {[
                    {
                      title: 'Economia Real em Produtos Químicos',
                      desc: 'Evite gastar dinheiro comprando produtos errados ou dosando em excesso. O técnico aplica apenas o necessário.'
                    },
                    {
                      title: 'Preservação dos Equipamentos',
                      desc: 'A água balanceada evita a corrosão precoce de motores, queima de resistências, incrustações nas tubulações e manchas no vinil ou azulejo.'
                    },
                    {
                      title: 'Casa de Máquinas Sempre Segura',
                      desc: 'Inspeção periódica de registros, pressões do filtro e instalações elétricas para evitar vazamentos ocultos e acidentes com eletricidade.'
                    },
                    {
                      title: 'Seu Fim de Semana É Para Descansar',
                      desc: 'Não perca horas esfregando bordas ou decantando sujeira. Chegue em casa e encontre a piscina 100% pronta para uso.'
                    }
                  ].map((item, idx) => (
                    <div key={idx} className="flex items-start gap-3 p-3 sm:p-3.5 rounded-xl bg-slate-950/60 border border-slate-800">
                      <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                        <Check className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <div className="text-xs sm:text-sm font-bold text-slate-100">{item.title}</div>
                        <div className="text-[11px] sm:text-xs text-slate-400 mt-0.5 leading-relaxed">{item.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 pt-5 border-t border-slate-800">
                  <a 
                    href={whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full inline-flex items-center justify-center gap-2 py-3.5 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm transition-all shadow-lg shadow-emerald-600/20"
                  >
                    <MessageCircle className="w-4 h-4 fill-white" />
                    <span>Fale Agora com o Especialista da RS Piscinas</span>
                  </a>
                </div>
              </div>
            </div>

          </div>

        </div>
      </section>

      {/* Customer Testimonials & Real Photos Carousel */}
      <TestimonialsCarousel whatsappUrl={whatsappUrl} />

      {/* Interactive WhatsApp Quote Simulator */}
      <section id="simulador" className="py-16 sm:py-24 lg:py-28 bg-slate-950 border-t border-slate-800/80">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="text-center mb-10 sm:mb-12 space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-950/80 border border-sky-500/30 text-sky-400 text-xs font-semibold uppercase tracking-wider">
              Simulador Rápido
            </div>
            <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
              Monte seu Orçamento Personalizado
            </h2>
            <p className="text-slate-400 text-xs sm:text-base">
              Selecione os dados da sua piscina para receber uma proposta rápida pelo WhatsApp.
            </p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-10 shadow-2xl space-y-6 sm:space-y-8">
            
            {/* Step 1: Tipo de Piscina */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2.5">
                1. Qual é o tipo da sua piscina?
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {['Alvenaria / Azulejo', 'Fibra de Vidro', 'Vinil'].map(type => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setPoolType(type)}
                    className={`py-3 px-4 rounded-xl text-xs sm:text-sm font-bold border transition-all text-center cursor-pointer ${
                      poolType === type 
                        ? 'bg-sky-500 text-slate-950 border-sky-400 shadow-md shadow-sky-500/20' 
                        : 'bg-slate-950/60 text-slate-300 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            {/* Step 2: Frequência */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2.5">
                2. Frequência desejada de atendimento:
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {[
                  'Semanal (Contrato Mensal)', 
                  'Quinzenal', 
                  'Atendimento Avulso / Único'
                ].map(freq => (
                  <button
                    key={freq}
                    type="button"
                    onClick={() => setFrequency(freq)}
                    className={`py-3 px-4 rounded-xl text-xs sm:text-sm font-bold border transition-all text-center cursor-pointer ${
                      frequency === freq 
                        ? 'bg-sky-500 text-slate-950 border-sky-400 shadow-md shadow-sky-500/20' 
                        : 'bg-slate-950/60 text-slate-300 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {freq}
                  </button>
                ))}
              </div>
            </div>

            {/* Step 3: Serviços Desejados */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2.5">
                3. Serviços que você precisa:
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {[
                  'Limpeza e Tratamento da Piscina',
                  'Correção Química da Água',
                  'Limpeza e Higienização da Capa',
                  'Troca de Areia do Filtro',
                  'Conserto / Revisão de Motor e Bomba',
                  'Reparos na Casa de Máquinas / Registros'
                ].map(srv => {
                  const active = selectedServices.includes(srv);
                  return (
                    <button
                      key={srv}
                      type="button"
                      onClick={() => toggleService(srv)}
                      className={`p-3 rounded-xl text-xs sm:text-sm font-medium border flex items-center justify-between text-left transition-all cursor-pointer ${
                        active 
                          ? 'bg-blue-950/70 text-sky-200 border-sky-500/60' 
                          : 'bg-slate-950/40 text-slate-400 border-slate-800/80 hover:border-slate-700'
                      }`}
                    >
                      <span>{srv}</span>
                      <div className={`w-5 h-5 rounded flex items-center justify-center ${active ? 'bg-sky-500 text-slate-950' : 'border border-slate-700'}`}>
                        {active && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Action CTA */}
            <div className="pt-4 border-t border-slate-800">
              <a 
                href={getCustomizedQuoteUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full inline-flex items-center justify-center gap-2.5 py-4 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-sm sm:text-base transition-all shadow-xl shadow-emerald-600/25 cursor-pointer transform hover:-translate-y-0.5"
              >
                <MessageCircle className="w-5 h-5 fill-white" />
                <span>Enviar Orçamento Selecionado no WhatsApp</span>
              </a>
              <p className="text-center text-xs text-slate-500 mt-2.5">
                Resposta rápida diretamente pela equipe da RS Piscinas.
              </p>
            </div>

          </div>

        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="py-16 sm:py-24 lg:py-28 bg-slate-900 border-t border-slate-800/80">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="text-center mb-10 sm:mb-14 space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-950/80 border border-sky-500/30 text-sky-400 text-xs font-semibold uppercase tracking-wider">
              Perguntas Frequentes
            </div>
            <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
              Tire suas Dúvidas sobre Nossos Serviços
            </h2>
          </div>

          <div className="space-y-3.5">
            {faqs.map((faq, index) => {
              const isOpen = openFaq === index;
              return (
                <div 
                  key={index}
                  className="bg-slate-950/70 border border-slate-800 rounded-2xl overflow-hidden transition-all"
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaq(isOpen ? null : index)}
                    className="w-full p-4 sm:p-6 text-left flex items-center justify-between gap-3 focus:outline-none cursor-pointer"
                  >
                    <span className="font-bold text-white text-sm sm:text-lg">{faq.q}</span>
                    <ChevronDown className={`w-5 h-5 text-sky-400 transition-transform duration-200 shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {isOpen && (
                    <div className="px-4 sm:px-6 pb-5 sm:pb-6 text-xs sm:text-base text-slate-300 leading-relaxed border-t border-slate-800/60 pt-3.5">
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

        </div>
      </section>

      {/* Pre-Footer Final CTA with WhatsApp & Instagram */}
      <section className="py-14 sm:py-16 bg-gradient-to-r from-blue-950 via-slate-900 to-blue-950 border-t border-slate-800">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-6">
          <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
            Pronto para ter uma piscina impecável o ano todo?
          </h2>
          <p className="text-slate-300 text-sm sm:text-lg max-w-2xl mx-auto">
            Deixe o trabalho pesado e técnico com a <strong>RS Piscinas</strong>. Entre em contato agora mesmo e receba um atendimento de primeira linha.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <a 
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-6 sm:px-8 py-3.5 sm:py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-sm sm:text-base transition-all shadow-xl shadow-emerald-600/30 transform hover:-translate-y-0.5 cursor-pointer"
            >
              <MessageCircle className="w-5 h-5 fill-white" />
              <span>Chamar no WhatsApp: (67) 99249-9469</span>
            </a>

            <a 
              href={instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-6 sm:px-7 py-3.5 sm:py-4 rounded-2xl bg-gradient-to-r from-purple-600 via-pink-600 to-amber-500 hover:opacity-90 text-white font-bold text-sm sm:text-base transition-all shadow-lg shadow-pink-600/20 transform hover:-translate-y-0.5 cursor-pointer"
            >
              <Instagram className="w-5 h-5" />
              <span>Instagram @rs_piscina_cg</span>
            </a>
          </div>
        </div>
      </section>

      {/* Institutional Footer */}
      <footer className="bg-slate-950 border-t border-slate-800 py-12 text-slate-400 text-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-10">
            
            {/* Col 1: Brand, CNPJ & Social */}
            <div className="space-y-3 md:col-span-2">
              <div className="flex items-center gap-3">
                <img 
                  src={RS_LOGO_BASE64} 
                  alt="RS Piscinas" 
                  className="h-10 w-auto object-contain" 
                />
                <span className="text-xl font-bold text-white">RS Piscinas</span>
              </div>
              <p className="text-slate-400 text-sm max-w-md leading-relaxed">
                Empresa especializada em limpeza e tratamento de piscinas, correção química balanceada da água, limpeza de capas e manutenção preventiva de equipamentos na casa de máquinas.
              </p>
              <div className="text-slate-300 font-mono text-xs pt-1">
                CNPJ: <span className="text-white font-semibold">37.666.108.0001/28</span>
              </div>

              {/* Social Link Badges */}
              <div className="flex items-center gap-3 pt-2">
                <a 
                  href={instagramUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-pink-950/60 text-pink-300 border border-pink-700/50 hover:bg-pink-600 hover:text-white transition-all text-xs font-semibold"
                >
                  <Instagram className="w-4 h-4" />
                  <span>Instagram</span>
                </a>
                <a 
                  href={whatsappUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-950/60 text-emerald-300 border border-emerald-700/50 hover:bg-emerald-600 hover:text-white transition-all text-xs font-semibold"
                >
                  <MessageCircle className="w-4 h-4 fill-current" />
                  <span>WhatsApp</span>
                </a>
              </div>
            </div>

            {/* Col 2: Serviços */}
            <div className="space-y-2">
              <div className="text-white font-bold text-sm mb-3">Serviços</div>
              <ul className="space-y-1.5 text-xs text-slate-400">
                <li>Limpeza e Tratamento da Água</li>
                <li>Correção Química (pH e Cloro)</li>
                <li>Limpeza e Higienização de Capas</li>
                <li>Troca de Areia do Filtro</li>
                <li>Manutenção de Motores e Bombas</li>
                <li>Troca de Disjuntores e Registros</li>
              </ul>
            </div>

            {/* Col 3: Atendimento e Acesso */}
            <div className="space-y-3">
              <div className="text-white font-bold text-sm mb-3">Contato & Atendimento</div>
              <div className="text-xs text-slate-300 space-y-1.5 leading-relaxed">
                <div><strong>WhatsApp:</strong> <a href={whatsappUrl} className="text-emerald-400 font-semibold hover:underline">(67) 99249-9469</a></div>
                <div><strong>Instagram:</strong> <a href={instagramUrl} target="_blank" rel="noopener noreferrer" className="text-pink-400 font-semibold hover:underline">@rs_piscina_cg</a></div>
                <div><strong>Localização:</strong> Campo Grande - MS</div>
                <div><strong>Horário:</strong> Seg a Sex: 07h30 às 18h00 · Sáb: 07h30 às 12h30</div>
              </div>
              <div className="pt-2">
                <Link 
                  to="/login"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs border border-slate-700 transition-all"
                >
                  <LogIn className="w-3.5 h-3.5 text-sky-400" />
                  <span>Portal do Cliente / Equipe</span>
                </Link>
              </div>
            </div>

          </div>

          {/* Bottom Copyright */}
          <div className="pt-8 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-4 text-slate-500">
            <div>
              © {new Date().getFullYear()} RS Piscinas · CNPJ 37.666.108.0001/28 · Todos os direitos reservados.
            </div>
            <div className="flex items-center gap-4 text-xs">
              <a href={instagramUrl} target="_blank" rel="noopener noreferrer" className="hover:text-pink-400 transition-colors">Instagram</a>
              <span>·</span>
              <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="hover:text-emerald-400 transition-colors">WhatsApp</a>
              <span>·</span>
              <Link to="/login" className="hover:text-slate-300 transition-colors">Acesso ao Sistema</Link>
            </div>
          </div>
        </div>
      </footer>

      {/* Floating Action Buttons (Instagram + WhatsApp) */}
      <div className="fixed bottom-5 right-4 sm:bottom-6 sm:right-6 z-50 flex flex-col gap-2.5 items-end">
        {/* Floating Instagram */}
        <a
          href={instagramUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Instagram da RS Piscinas"
          className="p-3 sm:p-3.5 rounded-full bg-gradient-to-tr from-purple-600 via-pink-600 to-amber-500 text-white shadow-xl shadow-pink-600/30 transition-all duration-300 hover:scale-110 flex items-center justify-center group cursor-pointer"
          title="Siga no Instagram"
        >
          <Instagram className="w-5 h-5 sm:w-6 sm:h-6" />
          <span className="max-w-0 overflow-hidden whitespace-nowrap group-hover:max-w-xs transition-all duration-300 ease-in-out px-0 group-hover:px-2 font-bold text-xs sm:text-sm text-white">
            Instagram
          </span>
        </a>

        {/* Floating WhatsApp */}
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Fale conosco no WhatsApp"
          className="p-3.5 sm:p-4 rounded-full bg-emerald-500 hover:bg-emerald-400 text-white shadow-2xl shadow-emerald-500/40 transition-all duration-300 hover:scale-110 flex items-center justify-center group cursor-pointer"
          title="Chamar no WhatsApp"
        >
          <MessageCircle className="w-6 h-6 sm:w-7 sm:h-7 fill-white" />
          <span className="max-w-0 overflow-hidden whitespace-nowrap group-hover:max-w-xs transition-all duration-300 ease-in-out px-0 group-hover:px-2 font-bold text-xs sm:text-sm text-white">
            Chamar no WhatsApp
          </span>
        </a>
      </div>
    </div>
  );
}
