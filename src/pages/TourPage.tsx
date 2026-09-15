import React, { useState } from 'react';
import { 
  Home, Users, Package, Contact, Bell, MessageSquare, 
  UserCircle, Map, History, Briefcase, Settings, Store, 
  Wrench, ChevronDown, ChevronUp 
} from 'lucide-react';

export default function TourPage() {
  const [openSection, setOpenSection] = useState<number | null>(0);

  const sections = [
    {
      title: 'Dashboard (Painel Inicial)',
      icon: Home,
      content: 'A tela principal onde você tem uma visão geral da sua empresa. Mostra estatísticas vitais como total de clientes, valores a receber no mês, clientes em atraso e alertas de clientes que ainda não receberam visitas.'
    },
    {
      title: 'Clientes',
      icon: Users,
      content: 'Local para cadastrar todos os seus clientes de manutenção (piscinas). Você pode definir o valor da mensalidade, dia de vencimento, endereço e até ver o histórico individual de visitas de cada um.'
    },
    {
      title: 'Produtos (Estoque)',
      icon: Package,
      content: 'Cadastre os produtos químicos (Cloro, Barrilha, Algicida) que sua empresa utiliza. Durante a visita, o técnico informa quanto gastou, e o sistema controla isso para você evitar desperdícios.'
    },
    {
      title: 'Agenda',
      icon: Contact,
      content: 'Um calendário visual completo. Mostra as rotas de manutenção fixas e os serviços avulsos programados para cada dia. Facilita a visualização do mês da sua equipe.'
    },
    {
      title: 'Cobranças (Financeiro)',
      icon: Bell,
      content: 'Seu painel financeiro. Aqui você vê quem pagou, quem está devendo e pode enviar mensagens de cobrança diretamente para o WhatsApp do cliente com um clique.'
    },
    {
      title: 'Mensagens Automáticas',
      icon: MessageSquare,
      content: 'Configure mensagens prontas para enviar relatórios, avisos de agendamento ou cobranças para seus clientes via WhatsApp, economizando muito tempo de digitação.'
    },
    {
      title: 'Colaboradores (Técnicos)',
      icon: UserCircle,
      content: 'Cadastre os técnicos que trabalham para você. Eles terão um login próprio para acessar o App no celular, ver as rotas deles e registrar as visitas.'
    },
    {
      title: 'Rotas',
      icon: Map,
      content: 'O coração do sistema logístico. Crie rotas mensais ou semanais agrupando os clientes por região. Associe um técnico a uma rota para que ele saiba exatamente onde ir.'
    },
    {
      title: 'Visitas (Histórico)',
      icon: History,
      content: 'Onde ficam armazenados todos os relatórios preenchidos pelos técnicos. Veja o horário, os produtos gastos, as anotações e as fotos de cada piscina limpa.'
    },
    {
      title: 'Serviços Avulsos',
      icon: Briefcase,
      content: 'Para serviços que não são a limpeza mensal (como consertos, troca de areia ou limpeza pós-obra). Crie, agende, cobre separadamente e designe a um técnico.'
    },
    {
      title: 'Lojas Parceiras',
      icon: Store,
      content: 'Cadastre as lojas de piscinas da sua confiança. Elas aparecerão no Portal do Cliente, indicando onde seu cliente pode comprar produtos, fortalecendo parcerias comerciais.'
    },
    {
      title: 'Técnicos Parceiros',
      icon: Wrench,
      content: 'Cadastre técnicos terceirizados para quando sua equipe estiver cheia. Você pode repassar serviços avulsos para eles e expandir sua rede de atendimento.'
    },
    {
      title: 'Configurações',
      icon: Settings,
      content: 'Ajuste os dados da sua empresa (Nome, Logo), configure a mensagem do PIX e ajuste preferências gerais do funcionamento do aplicativo.'
    }
  ];

  const toggleSection = (index: number) => {
    setOpenSection(openSection === index ? null : index);
  };

  return (
    <div className="max-w-4xl mx-auto p-4 lg:p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Tour do Sistema</h1>
        <p className="text-gray-600 mt-2">
          Entenda como cada módulo do GestãoPro funciona para tirar o máximo proveito da ferramenta.
        </p>
      </div>

      <div className="space-y-4">
        {sections.map((section, index) => {
          const Icon = section.icon;
          const isOpen = openSection === index;
          
          return (
            <div 
              key={index} 
              className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm transition-all duration-200"
            >
              <button
                onClick={() => toggleSection(index)}
                className="w-full flex items-center justify-between p-5 focus:outline-none hover:bg-gray-50"
              >
                <div className="flex items-center space-x-4">
                  <div className="p-3 bg-blue-100 text-blue-600 rounded-lg">
                    <Icon size={24} />
                  </div>
                  <h3 className="text-lg font-bold text-gray-800 text-left">{section.title}</h3>
                </div>
                <div className="text-gray-400">
                  {isOpen ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
                </div>
              </button>
              
              {isOpen && (
                <div className="px-5 pb-6 pt-2 border-t border-gray-100 bg-gray-50">
                  <p className="text-gray-700 leading-relaxed ml-16">
                    {section.content}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
