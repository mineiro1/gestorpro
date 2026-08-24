const fs = require('fs');
let code = fs.readFileSync('src/contexts/AuthContext.tsx', 'utf8');

const target = `  whatsappSettings?: {
    reminderDays: number;
    reminderMessage: string;
    delayedMessage: string;
    autoScheduleTime: string;
    useEvolutionApi?: boolean;
    evolutionApiUrl?: string;
    evolutionApiKey?: string;
    evolutionInstanceName?: string;
  };`;

const replacement = `  whatsappSettings?: {
    reminderDays: number;
    reminderMessage: string;
    delayedMessage: string;
    autoScheduleTime: string;
    useEvolutionApi?: boolean;
    evolutionApiUrl?: string;
    evolutionApiKey?: string;
    evolutionInstanceName?: string;
    useMetaApi?: boolean;
    metaToken?: string;
    metaPhoneNumberId?: string;
  };`;

code = code.replace(target, replacement);
fs.writeFileSync('src/contexts/AuthContext.tsx', code);
