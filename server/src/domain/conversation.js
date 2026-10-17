// Conversas do simulador de WhatsApp (cap. 10.6 e 15.6).
import { ValidationError } from './errors.js';

export const MessageDirection = Object.freeze({ IN: 'in', OUT: 'out' });
export const MessageKind = Object.freeze({ TEXT: 'text', SYSTEM: 'system' });

/** Estados do assistente (cap. 15.6). CHOOSE_SLOT e OFFER_RESPONSE chegam com as marcações (I-8). */
export const BotState = Object.freeze({
  START: 'START',
  ASK_NAME: 'ASK_NAME',
  ASK_CONSENTS: 'ASK_CONSENTS',
  MENU: 'MENU',
  CHOOSE_VEHICLE: 'CHOOSE_VEHICLE',
  ASK_PLATE: 'ASK_PLATE',
  ASK_CLASS: 'ASK_CLASS',
  CHOOSE_PLAN: 'CHOOSE_PLAN',
  CONFIRM_BENEFIT: 'CONFIRM_BENEFIT',
  CHOOSE_PAY: 'CHOOSE_PAY',
  CONFIRM_PAY: 'CONFIRM_PAY',
});

export const ConsentType = Object.freeze({ LOYALTY: 'loyalty', MARKETING: 'marketing' });

const MESSAGE_MAX = 1000;

export function parseIncomingText(input) {
  const text = typeof input === 'string' ? input.trim() : '';
  if (!text || text.length > MESSAGE_MAX) {
    throw new ValidationError(`A mensagem deve ter entre 1 e ${MESSAGE_MAX} caracteres.`, { field: 'text' });
  }
  return text;
}

/** Comandos que valem em qualquer ponto da conversa. */
export function globalCommandOf(text) {
  const normalized = text.trim().toUpperCase();
  if (normalized === 'MENU') return 'MENU';
  if (normalized === 'PARAR') return 'STOP_MARKETING';
  return null;
}

const GREETINGS = /^(ol[aá]|oi|bom dia|boa tarde|boa noite|hello|hi)(?=$|[\s!,.?])/i;

export function isGreeting(text) {
  return GREETINGS.test(text.trim());
}

/** "2" -> 2; devolve null se não for uma opção entre 1 e max. */
export function optionNumber(text, max) {
  if (!/^\d{1,2}$/.test(text.trim())) return null;
  const option = Number(text.trim());
  return option >= 1 && option <= max ? option : null;
}

/** Respostas sim/não: "1"/"sim"/"s" e "2"/"não"/"nao"/"n". */
export function yesNo(text) {
  const normalized = text.trim().toLowerCase();
  if (['1', 'sim', 's', 'yes'].includes(normalized)) return true;
  if (['2', 'não', 'nao', 'n', 'no'].includes(normalized)) return false;
  return null;
}
