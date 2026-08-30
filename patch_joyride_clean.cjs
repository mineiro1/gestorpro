const fs = require('fs');
let code = fs.readFileSync('src/components/OnboardingTour.tsx', 'utf-8');

// replace the Joyride component to be extremely basic
const cleanJoyride = `
  return (
    <Joyride
      onEvent={handleJoyrideCallback}
      continuous
      run={run}
      scrollToFirstStep
      steps={steps}
      locale={{
        back: 'Voltar',
        close: 'Fechar',
        last: 'Finalizar',
        next: 'Próximo',
        skip: 'Pular',
      }}
    />
  );
`;

const lines = code.split('\n');
const returnIdx = lines.findIndex(l => l.includes('return ('));
if (returnIdx !== -1) {
  code = lines.slice(0, returnIdx).join('\n') + cleanJoyride + '\n}\n';
}

fs.writeFileSync('src/components/OnboardingTour.tsx', code);
