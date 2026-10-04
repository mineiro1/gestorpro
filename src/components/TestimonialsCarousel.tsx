import React, { useState, useEffect, useRef } from 'react';
import { 
  Star, 
  ChevronLeft, 
  ChevronRight, 
  Quote, 
  CheckCircle2, 
  MessageCircle, 
  Sparkles,
  MapPin
} from 'lucide-react';

interface Testimonial {
  id: string;
  name: string;
  role: string;
  location: string;
  image: string;
  serviceType: string;
  rating: number;
  text: string;
  highlight: string;
}

const testimonials: Testimonial[] = [
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

export default function TestimonialsCarousel({ whatsappUrl }: TestimonialsCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);
  const touchStartX = useRef<number | null>(null);

  const nextSlide = () => {
    setCurrentIndex((prev) => (prev + 1) % testimonials.length);
  };

  const prevSlide = () => {
    setCurrentIndex((prev) => (prev - 1 + testimonials.length) % testimonials.length);
  };

  // Autoplay
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

  const current = testimonials[currentIndex];

  return (
    <section id="depoimentos" className="py-16 sm:py-24 bg-slate-900 border-t border-slate-800/80 relative overflow-hidden">
      {/* Decorative Blur Backgrounds */}
      <div className="absolute top-1/3 left-10 w-80 h-80 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        {/* Section Header */}
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

        {/* Carousel Container */}
        <div 
          className="max-w-5xl mx-auto"
          onMouseEnter={() => setIsAutoPlaying(false)}
          onMouseLeave={() => setIsAutoPlaying(true)}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <div className="relative bg-slate-950/90 border border-slate-800 rounded-3xl p-6 sm:p-10 shadow-2xl overflow-hidden backdrop-blur-sm">
            
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              
              {/* Left Column: Real Service Photo Card */}
              <div className="lg:col-span-5 relative">
                <div className="relative aspect-[4/3] sm:aspect-square rounded-2xl overflow-hidden border border-slate-700/80 shadow-xl bg-slate-900 group">
                  <img 
                    src={current.image} 
                    alt={`Piscina de ${current.name}`}
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                    onError={(e) => {
                      e.currentTarget.src = 'https://raw.githubusercontent.com/mineiro1/fotos/main/WhatsApp%20Image%202026-10-04%20at%2018.09.21.jpeg';
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent pointer-events-none" />
                  
                  {/* Service Badge over photo */}
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

              {/* Right Column: Feedback Details */}
              <div className="lg:col-span-7 flex flex-col justify-between space-y-6">
                <div>
                  
                  {/* Star Rating & Quote Icon */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-1">
                      {[...Array(current.rating)].map((_, i) => (
                        <Star key={i} className="w-5 h-5 fill-amber-400 text-amber-400" />
                      ))}
                      <span className="ml-2 text-xs font-bold text-amber-300">5.0 / 5.0</span>
                    </div>
                    <Quote className="w-8 h-8 text-sky-500/30" />
                  </div>

                  {/* Highlight sentence */}
                  <div className="inline-block px-3 py-1 rounded-lg bg-sky-950/70 border border-sky-500/30 text-sky-300 text-xs sm:text-sm font-semibold mb-4">
                    "{current.highlight}"
                  </div>

                  {/* Testimonial Text */}
                  <p className="text-slate-200 text-sm sm:text-base leading-relaxed italic">
                    "{current.text}"
                  </p>
                </div>

                {/* Author Info & Location */}
                <div className="pt-4 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h4 className="font-bold text-white text-base sm:text-lg">{current.name}</h4>
                    {current.role ? <p className="text-xs text-slate-400">{current.role}</p> : null}
                    <div className="flex items-center gap-1 text-xs text-emerald-400 mt-1">
                      <MapPin className="w-3.5 h-3.5 shrink-0" />
                      <span>{current.location}</span>
                    </div>
                  </div>

                  {/* Small Action */}
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

            {/* Navigation Arrows */}
            <div className="mt-8 pt-6 border-t border-slate-800/60 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {testimonials.map((_, idx) => (
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

        {/* Bottom Trust Indicators */}
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
