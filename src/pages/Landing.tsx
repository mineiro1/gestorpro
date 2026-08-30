import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { CheckCircle, Smartphone, Globe, Droplet, Users, Calendar, Shield, Map as MapIcon, Play, DollarSign, Store } from 'lucide-react';

export default function Landing() {
  const [monthlyPrice, setMonthlyPrice] = useState('97,00');

  useEffect(() => {
    // SEO Dynamic Tags for Landing Page
    document.title = "GestãoPro - O Aplicativo Definitivo para Piscineiros";
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute("content", "O aplicativo definitivo para piscineiros e empresas de manutenção de piscinas. Organize rotas de limpeza, relatórios automáticos no WhatsApp, agenda e cobranças.");
    }
    
    const fetchPrice = async () => {
      const { data, error } = await supabase.from('settings').select('monthlyprice').eq('id', 'platform').single();
      if (data && data.monthlyprice) {
        setMonthlyPrice(data.monthlyprice.toString().replace('.', ','));
      }
    };
    fetchPrice();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
      {/* Navbar */}
      <nav className="w-full bg-white shadow-sm fixed top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Droplet className="w-8 h-8 text-blue-600" />
            <span className="text-2xl font-extrabold text-blue-900 tracking-tight">Gestão<span className="text-blue-500">Pro</span></span>
          </div>
          <div className="flex items-center space-x-4">
            <Link to="/login" className="text-gray-600 hover:text-blue-600 font-medium transition-colors">Entrar</Link>
            <Link to="/register" className="bg-blue-600 text-white px-5 py-2 rounded-full font-semibold hover:bg-blue-700 transition-colors shadow-md hover:shadow-lg">Criar Conta</Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 mix-blend-overlay"></div>
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-center relative z-10">
          <div className="w-full lg:w-1/2 text-center lg:text-left space-y-8">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-tight">
              O controle total da sua empresa de <span className="text-blue-400">Piscinas</span> na palma da mão.
            </h1>
            <p className="text-xl text-blue-100 max-w-2xl mx-auto lg:mx-0 leading-relaxed">
              Organize rotas inteligentes, gerencie o financeiro, faça parcerias com lojas e ofereça um portal exclusivo para seus clientes.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start space-y-4 sm:space-y-0 sm:space-x-4">
              <Link to="/register" className="w-full sm:w-auto bg-green-500 text-white px-8 py-4 rounded-full font-bold text-lg hover:bg-green-400 transition-all shadow-lg hover:shadow-green-500/30 transform hover:-translate-y-1">
                Começar Agora
              </Link>
              <a href="#funcionalidades" className="w-full sm:w-auto bg-white/10 border border-white/20 text-white px-8 py-4 rounded-full font-bold text-lg hover:bg-white/20 transition-all flex items-center justify-center">
                Ver Funcionalidades
              </a>
            </div>
            <div className="flex items-center justify-center lg:justify-start space-x-6 text-sm text-blue-200 mt-6">
              <span className="flex items-center"><Smartphone className="w-5 h-5 mr-2" /> App Android</span>
              <span className="flex items-center"><Globe className="w-5 h-5 mr-2" /> Web/Navegador</span>
            </div>
          </div>
          <div className="w-full lg:w-1/2 mt-16 lg:mt-0 relative">
            <div className="relative mx-auto w-full max-w-md aspect-[9/19] bg-gray-900 rounded-[3rem] border-[14px] border-gray-900 shadow-2xl overflow-hidden">
              <img src="https://images.unsplash.com/photo-1576014131795-d440191a8e8b?auto=format&fit=crop&q=80&w=800" alt="App em uso" className="w-full h-full object-cover opacity-80" />
              <div className="absolute inset-0 bg-gradient-to-t from-gray-900/90 to-transparent flex items-end p-8">
                <div className="w-full bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-4 text-white">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold">Visita Concluída</span>
                    <CheckCircle className="w-5 h-5 text-green-400" />
                  </div>
                  <p className="text-sm text-gray-200">Fotos e produtos registrados no portal do cliente.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Funcionalidades */}
      <section id="funcionalidades" className="py-24 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl font-extrabold text-gray-900 sm:text-4xl">Por que você precisa do GestãoPro?</h2>
            <p className="mt-4 text-xl text-gray-500">Esqueça a prancheta e o caderninho. O GestãoPro automatiza a parte chata para você focar em crescer.</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
            {[
              { icon: MapIcon, title: 'Gestão de Rotas Inteligente', desc: 'Monte a rota do dia para cada técnico, calcule distâncias e otimize o tempo de deslocamento da equipe.' },
              { icon: DollarSign, title: 'Gestão Financeira e Cobranças', desc: 'Controle os pagamentos, envie faturas para os clientes, acompanhe recebimentos e tenha previsibilidade do faturamento.' },
              { icon: Calendar, title: 'Agenda e Serviços Avulsos', desc: 'Controle as rotas fixas mensais e gerencie serviços pontuais (como troca de areia e consertos) sem perder os prazos.' },
              { icon: Store, title: 'Lojas e Técnicos Parceiros', desc: 'Cadastre técnicos terceirizados e lojas parceiras. As lojas ganham destaque no Portal do Cliente, gerando parcerias estratégicas.' },
              { icon: Shield, title: 'Portal Exclusivo do Cliente', desc: 'Seus clientes têm acesso a um painel próprio para ver o histórico de limpezas, fotos do serviço, faturas e lojas indicadas.' },
              { icon: Users, title: 'Painel do Colaborador', desc: 'Seus técnicos usam o app no celular para visualizar rotas, registrar serviços com fotos e receber alertas em tempo real.' },
            ].map((feature, idx) => (
              <div key={idx} className="bg-gray-50 rounded-2xl p-8 border border-gray-100 hover:shadow-xl transition-shadow duration-300">
                <div className="w-14 h-14 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600 mb-6">
                  <feature.icon className="w-7 h-7" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">{feature.title}</h3>
                <p className="text-gray-600 leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Cross-Platform Section */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 bg-blue-50">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-center">
          <div className="w-full lg:w-1/2 mb-12 lg:mb-0">
             <div className="relative w-full max-w-lg mx-auto flex justify-center items-center">
                <div className="w-64 h-auto shadow-2xl rounded-3xl overflow-hidden z-20 border-8 border-gray-900 bg-gray-900">
                   <img src="https://images.unsplash.com/photo-1614064009386-3023e10fa658?auto=format&fit=crop&q=80&w=400" alt="Mobile App" className="w-full h-full object-cover" />
                </div>
                <div className="w-80 h-auto shadow-2xl rounded-xl overflow-hidden absolute -right-10 top-10 z-10 border-4 border-gray-300 hidden md:block">
                   <img src="https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&q=80&w=600" alt="Desktop Web" className="w-full h-full object-cover" />
                </div>
             </div>
          </div>
          <div className="w-full lg:w-1/2 lg:pl-16">
            <h2 className="text-3xl font-extrabold text-gray-900 mb-6">Funciona no Celular e no Computador</h2>
            <p className="text-xl text-gray-600 mb-8 leading-relaxed">
              Na rua, os técnicos usam o <strong>Aplicativo Android</strong> para preencher relatórios, tirar fotos e seguir rotas. No escritório, você usa o <strong>Painel Web</strong> no computador para gestão completa, relatórios gerenciais e faturamento.
            </p>
            <ul className="space-y-4">
              <li className="flex items-center text-gray-700 font-medium"><CheckCircle className="w-6 h-6 text-green-500 mr-3" /> Instalável via Android (APK) e PWA</li>
              <li className="flex items-center text-gray-700 font-medium"><CheckCircle className="w-6 h-6 text-green-500 mr-3" /> Sincronização em Tempo Real</li>
              <li className="flex items-center text-gray-700 font-medium"><CheckCircle className="w-6 h-6 text-green-500 mr-3" /> Notificações Push nativas</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 bg-gray-900 text-white">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-extrabold sm:text-4xl mb-4">Invista no profissionalismo do seu negócio</h2>
          <p className="text-xl text-gray-400 mb-12">Um sistema completo e acessível, desenhado exclusivamente para manutenção de piscinas.</p>
          
          <div className="bg-white rounded-3xl shadow-2xl overflow-hidden max-w-lg mx-auto transform hover:scale-105 transition-transform duration-300">
            <div className="p-10">
              <h3 className="text-2xl font-bold text-gray-900 text-center mb-2">Plano Profissional</h3>
              <div className="flex justify-center items-baseline my-8">
                <span className="text-5xl font-extrabold text-blue-600">R$ {monthlyPrice}</span>
                <span className="text-xl text-gray-500 ml-2">/mês</span>
              </div>
              <ul className="space-y-4 mb-8 text-left">
                <li className="flex items-center text-gray-600"><CheckCircle className="w-5 h-5 text-green-500 mr-3 shrink-0" /> Clientes Ilimitados</li>
                <li className="flex items-center text-gray-600"><CheckCircle className="w-5 h-5 text-green-500 mr-3 shrink-0" /> Técnicos e Agendas Ilimitadas</li>
                <li className="flex items-center text-gray-600"><CheckCircle className="w-5 h-5 text-green-500 mr-3 shrink-0" /> Portal do Cliente Gratuito</li>
                <li className="flex items-center text-gray-600"><CheckCircle className="w-5 h-5 text-green-500 mr-3 shrink-0" /> Integração de Mensagens (WhatsApp)</li>
                <li className="flex items-center text-gray-600"><CheckCircle className="w-5 h-5 text-green-500 mr-3 shrink-0" /> Notificações Push em Tempo Real</li>
              </ul>
              <Link to="/register" className="block w-full bg-blue-600 text-white text-center py-4 rounded-xl font-bold text-lg hover:bg-blue-700 transition-colors shadow-lg">
                Criar Minha Conta Agora
              </Link>
              <p className="text-center text-sm text-gray-500 mt-4">7 dias de teste grátis. Cancele quando quiser.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-50 py-12 border-t border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between">
          <div className="flex items-center space-x-2 mb-4 md:mb-0">
            <Droplet className="w-6 h-6 text-blue-600" />
            <span className="text-xl font-extrabold text-blue-900 tracking-tight">Gestão<span className="text-blue-500">Pro</span></span>
          </div>
          <p className="text-gray-500 text-sm text-center md:text-left">
            &copy; {new Date().getFullYear()} GestãoPro. Todos os direitos reservados.
          </p>
        </div>
      </footer>
    </div>
  );
}
