// Autorizações de partilha (M15): dadas e revogadas pela lavadora, com acessos visíveis.
import { NotFoundError } from '../domain/errors.js';
import { authorizationStatus, newAuthorization, parseAuthorizationRequest, planRevoke } from '../domain/sharing.js';

export class SharingService {
  #sharing;
  #unitOfWork;
  #clock;

  constructor({ sharingRepository, unitOfWork, clock }) {
    this.#sharing = sharingRepository;
    this.#unitOfWork = unitOfWork;
    this.#clock = clock;
  }

  listInstitutions() {
    return this.#sharing.listInstitutions();
  }

  getInstitution(id) {
    const institution = this.#sharing.findInstitution(id);
    if (!institution) throw new NotFoundError('Instituição não encontrada.');
    return institution;
  }

  listAuthorizations() {
    return this.#sharing.listAuthorizations().map((authorization) => this.#withStatus(authorization));
  }

  getAuthorization(id) {
    const authorization = this.#sharing.findAuthorization(id);
    if (!authorization) throw new NotFoundError('Autorização não encontrada.');
    return this.#withStatus(authorization);
  }

  /** A lavadora autoriza uma instituição, com finalidade, âmbito, período de dados e validade. */
  grant({ institutionId, purpose, sections, dataMonths, validDays, confirmed }, actor) {
    return this.#unitOfWork.run(() => {
      const request = parseAuthorizationRequest({ purpose, sections, dataMonths, validDays, confirmed });
      const institution = this.getInstitution(institutionId);
      const authorization = newAuthorization(request, {
        institution,
        sequence: this.#sharing.nextAuthorizationSequence(),
        actor,
        now: this.#clock.nowIso(),
      });
      return this.getAuthorization(this.#sharing.insertAuthorization(authorization));
    });
  }

  /** A partir da revogação não há novas consultas; repetir não tem efeitos. */
  revoke(id, { reason, actor }) {
    return this.#unitOfWork.run(() => {
      const decision = planRevoke(this.getAuthorization(id), { reason, actor, now: this.#clock.nowIso() });
      if (decision.changed) this.#sharing.revokeAuthorization(id, decision.changes);
      return { authorization: this.getAuthorization(id), changed: decision.changed };
    });
  }

  accessLogs({ authorizationId } = {}) {
    return this.#sharing.listAccessLogs({ authorizationId });
  }

  countActive() {
    return this.#sharing.countActive(this.#clock.nowIso());
  }

  #withStatus(authorization) {
    return { ...authorization, status: authorizationStatus(authorization, this.#clock.nowIso()) };
  }
}
