import { presentCustomer, presentVehicle, presentVehicleWithOwner } from '../presenters.js';
import { actorOf, bodyOf, optionalQuery, parseId } from '../request.js';

export function createCustomerController({ customerService }) {
  return {
    /** Com ?phone= procura um cliente; sem filtro lista todos. */
    list(req, res) {
      const phone = optionalQuery(req, 'phone');
      if (phone !== undefined) {
        res.json({ customer: presentCustomer(customerService.findByPhone(phone)) });
        return;
      }
      res.json({ customers: customerService.list().map(presentCustomer) });
    },

    get(req, res) {
      res.json({ customer: presentCustomer(customerService.get(parseId(req.params.id))) });
    },

    register(req, res) {
      res.status(201).json({ customer: presentCustomer(customerService.register(bodyOf(req))) });
    },

    addVehicle(req, res) {
      const { vehicle, created } = customerService.addVehicle(parseId(req.params.id), bodyOf(req));
      res.status(created ? 201 : 200).json({ vehicle: presentVehicle(vehicle), created });
    },

    listVehicles(req, res) {
      const vehicles = customerService.listVehicles({ classRef: optionalQuery(req, 'classId') });
      res.json({ vehicles: vehicles.map(presentVehicleWithOwner) });
    },

    getVehicle(req, res) {
      res.json({ vehicle: presentVehicle(customerService.getVehicle(parseId(req.params.id))) });
    },

    reclassifyVehicle(req, res) {
      const { classId } = bodyOf(req);
      const vehicle = customerService.reclassifyVehicle(parseId(req.params.id), classId, actorOf(req, 'gestor'));
      res.json({ vehicle: presentVehicle(vehicle) });
    },
  };
}
