import { actorFrom, parseId, requireBody } from '../lib/validate.js';

export function createCustomersController({ customers }) {
  return {
    list(req, res) {
      if (req.query.phone !== undefined) {
        return res.json({ customer: customers.findByPhone(String(req.query.phone)) });
      }
      res.json({ customers: customers.list() });
    },

    get(req, res) {
      res.json({ customer: customers.get(parseId(req.params.id)) });
    },

    create(req, res) {
      res.status(201).json({ customer: customers.create(requireBody(req)) });
    },

    addVehicle(req, res) {
      const { vehicle, created } = customers.addVehicle(parseId(req.params.id), requireBody(req));
      res.status(created ? 201 : 200).json({ vehicle, created });
    },

    listVehicles(req, res) {
      const classRef = req.query.classId === undefined ? undefined : String(req.query.classId);
      res.json({ vehicles: customers.listVehicles({ classRef }) });
    },

    getVehicle(req, res) {
      res.json({ vehicle: customers.getVehicle(parseId(req.params.id)) });
    },

    updateVehicle(req, res) {
      const body = requireBody(req);
      const vehicle = customers.reclassifyVehicle(parseId(req.params.id), body.classId, actorFrom(req, 'gestor'));
      res.json({ vehicle });
    },
  };
}
