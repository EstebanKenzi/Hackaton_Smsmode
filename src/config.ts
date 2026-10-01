import dotenv from 'dotenv';

dotenv.config();
dotenv.config({ path: './env/.env.keys' });

function readEnv(name: string): string | undefined {
  const value = process.env[name];
  return value ? value.trim() : undefined;
}

function getEnv(name: string, fallback?: string): string {
  return readEnv(name) ?? fallback ?? '';
}

export const config = {
  apiKey: getEnv('API_KEY') || getEnv('SMSMODE_API_KEY'),
  phoneNumber: getEnv('PHONE_NUMBER'),
  companyName: getEnv('COMPANY_NAME', 'Cabinet Médical'),
  companyAddress: getEnv('COMPANY_ADDRESS', '12 rue Exemple, Paris'),
  rcsCallbackUrl: getEnv('RCS_CALLBACK_URL') || getEnv('WEBHOOK_URL'),
};

export function requireRcsConfig(): { apiKey: string; callbackUrl: string } {
  const apiKey = config.apiKey;
  const callbackUrl = config.rcsCallbackUrl;

  if (!apiKey) {
    throw new Error('API_KEY manquante: configurez la clé SMSMode dans env/.env.keys ou .env');
  }

  if (!callbackUrl) {
    throw new Error('RCS_CALLBACK_URL manquante: configurez l’URL publique du webhook ngrok');
  }

  return { apiKey, callbackUrl };
}

export function getRcsCallbackUrl(): string | undefined {
  return config.rcsCallbackUrl;
}
