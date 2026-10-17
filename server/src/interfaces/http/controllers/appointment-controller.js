import { presentAppointment, presentCapacity, presentOffer } from '../presenters.js';
import { actorOf, bodyOf, optionalBoolean, optionalQuery, parseId } from '../request.js';

export function createAppointmentController({ appointmentService }) {
  return {
    /** ?date=AAAA-MM-DD&planId=&classId= */
    availability(req, res) {
      const slots = appointmentService.availability({
        date: optionalQuery(req, 'date') ?? appointmentService.today(),
        planId: parseId(optionalQuery(req, 'planId'), 'planId'),
        classRef: optionalQuery(req, 'classId'),
      });
      res.json({ slots });
    },

    list(req, res) {
      const appointments = appointmentService.listForDay(optionalQuery(req, 'date'));
      res.json({ appointments: appointments.map(presentAppointment) });
    },

    get(req, res) {
      const id = parseId(req.params.id);
      res.json({ appointment: presentAppointment(appointmentService.get(id)), events: appointmentService.history(id) });
    },

    book(req, res) {
      const body = bodyOf(req);
      const appointment = appointmentService.book({
        vehicleId: parseId(body.vehicleId, 'vehicleId'),
        planId: parseId(body.planId, 'planId'),
        startsAt: body.startsAt,
        source: body.source,
        actor: actorOf(req, 'gestor'),
      });
      res.status(201).json({ appointment: presentAppointment(appointment) });
    },

    transition(req, res) {
      const body = bodyOf(req);
      const { appointment, changed } = appointmentService.transition(parseId(req.params.id), {
        to: body.to,
        reason: body.reason,
        actor: actorOf(req, 'operador'),
      });
      res.json({ appointment: presentAppointment(appointment), changed });
    },

    /** A lavadora propõe um horário mais cedo; só muda se o cliente aceitar. */
    propose(req, res) {
      const offer = appointmentService.propose(parseId(req.params.id), {
        proposedStartsAt: bodyOf(req).proposedStartsAt,
        actor: actorOf(req, 'gestor'),
      });
      res.status(201).json({ offer: presentOffer(offer) });
    },

    respond(req, res) {
      const appointment = appointmentService.respondToOffer(parseId(req.params.id), {
        accept: optionalBoolean(bodyOf(req).accept, 'accept'),
        actor: actorOf(req, 'cliente'),
      });
      res.json({ appointment: presentAppointment(appointment) });
    },

    capacity(req, res) {
      res.json(presentCapacity(appointmentService.capacity(optionalQuery(req, 'date'))));
    },
  };
}
