import React, { useState, useEffect } from 'react';
import { Joyride, CallBackProps, STATUS, Step } from 'react-joyride';
import { useAuth } from '../contexts/AuthContext';

export default function OnboardingTour() {
  const { userProfile, isAdmin } = useAuth();
  const [run, setRun] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);

  useEffect(() => {
    // Only run tour for admins and only if they haven't seen it yet
    if (isAdmin && userProfile) {
      const hasSeenTour = localStorage.getItem(`has_seen_tour_${userProfile.uid}`);
      
      if (!hasSeenTour) {
        setSteps([
          {
            target: 'body',
            content: (
              <div className="text-left">
                <h3 className="text-lg font-bold text-gray-900 mb-2">Bem-vindo(a) ao GestãoPro! 👋</h3>
                <p className="text-gray-600">
                  Estamos muito felizes em ter você conosco. Vamos fazer um tour rápido pelas nossas funcionalidades exclusivas para ajudar você a expandir sua rede de negócios.
                </p>
              </div>
            ),
            placement: 'center',
            disableBeacon: true,
          },
          {
            target: '#tour-partners',
            content: (
              <div className="text-left">
                <h3 className="text-lg font-bold text-gray-900 mb-2">Lojas Parceiras 🏪</h3>
                <p className="text-gray-600">
                  Aqui você pode cadastrar as lojas que você indica. Seus clientes verão essas lojas no aplicativo deles. Isso gera um grande valor para você poder firmar novas <b>parcerias estratégicas</b>!
                </p>
              </div>
            ),
            placement: 'right',
          },
          {
            target: '#tour-technicians',
            content: (
              <div className="text-left">
                <h3 className="text-lg font-bold text-gray-900 mb-2">Técnicos Parceiros 👷</h3>
                <p className="text-gray-600">
                  Cadastre técnicos terceirizados para expandir sua rede de atendimento. Você pode direcionar serviços avulsos que não consegue atender para essa rede de parceiros de confiança.
                </p>
              </div>
            ),
            placement: 'right',
          }
        ]);
        
        // Give a small delay so the DOM renders completely
        setTimeout(() => {
          setRun(true);
        }, 1000);
      }
    }
  }, [isAdmin, userProfile]);

  const handleJoyrideCallback = (data: CallBackProps) => {
    const { status } = data;
    const finishedStatuses: string[] = [STATUS.FINISHED, STATUS.SKIPPED];

    if (finishedStatuses.includes(status) && userProfile) {
      setRun(false);
      localStorage.setItem(`has_seen_tour_${userProfile.uid}`, 'true');
    }
  };

  if (!isAdmin) return null;

  return (
    <Joyride
      callback={handleJoyrideCallback}
      continuous
      hideCloseButton
      run={run}
      scrollToFirstStep
      showProgress
      showSkipButton
      steps={steps}
      styles={{
        options: {
          primaryColor: '#2563EB', // blue-600
          zIndex: 10000,
        },
        buttonNext: {
          backgroundColor: '#2563EB',
          borderRadius: '8px',
          padding: '8px 16px',
        },
        buttonBack: {
          color: '#4B5563',
        },
        buttonSkip: {
          color: '#6B7280',
        },
        tooltip: {
          borderRadius: '12px',
          padding: '16px',
        }
      }}
      locale={{
        back: 'Voltar',
        close: 'Fechar',
        last: 'Finalizar Tour',
        next: 'Próximo',
        skip: 'Pular',
      }}
    />
  );
}
