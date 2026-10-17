// Reposição da demonstração (cap. 15.5 e 14.4): desactivada por omissão; exige token,
// confirmação escrita ("REPOR") e acesso a partir da própria máquina.
import crypto from 'node:crypto';
import { AccessDeniedError, NotFoundError, ValidationError } from '../../../domain/errors.js';
import { bodyOf } from '../request.js';

const CONFIRMATION = 'REPOR';
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

export function createAdminController({ demoResetService }, { demoResetToken }) {
  return {
    resetDemo(req, res) {
      if (!demoResetToken) throw new NotFoundError('A reposição da demonstração está desactivada (defina DEMO_RESET_TOKEN).');
      if (!LOOPBACK.has(req.socket.remoteAddress)) {
        throw new AccessDeniedError('LOCAL_ACCESS_ONLY', 'A reposição só é aceite a partir da própria máquina.');
      }
      if (!sameSecret(req.get('x-demo-token') ?? '', demoResetToken)) {
        throw new AccessDeniedError('INVALID_TOKEN', 'Token de reposição inválido.');
      }
      if (bodyOf(req).confirm !== CONFIRMATION) {
        throw new ValidationError(`Confirme escrevendo "${CONFIRMATION}" ("confirm").`, { field: 'confirm' });
      }
      demoResetService.reset();
      res.json({ status: 'reset', message: 'Dados de demonstração repostos.' });
    },
  };
}

function sameSecret(given, expected) {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
