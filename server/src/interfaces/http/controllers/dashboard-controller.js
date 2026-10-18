import { presentDashboard, presentHistoryEntry, presentToday, presentVehicle, presentVehicleWithStats } from '../presenters.js';
import { optionalQuery, parseId } from '../request.js';

export function createDashboardController({ dashboardService, vehicleHistoryService }) {
  return {
    /** ?days=30 (por omissão) */
    summary(req, res) {
      const days = optionalQuery(req, 'days');
      res.json(presentDashboard(dashboardService.summary({ days: days === undefined ? undefined : Number(days) })));
    },

    /** O dia de hoje no painel (M10). */
    today(req, res) {
      res.json({ today: presentToday(dashboardService.today()) });
    },

    weekly(req, res) {
      res.json({ weeklyReceipts: presentDashboard(dashboardService.summary()).weeklyReceipts });
    },

    /** Viaturas (por classe) com o número de serviços concluídos e o último (M12). */
    listVehicles(req, res) {
      const vehicles = vehicleHistoryService.listByClass({ classRef: optionalQuery(req, 'classId') });
      res.json({ vehicles: vehicles.map(presentVehicleWithStats) });
    },

    historySummary(req, res) {
      const summary = vehicleHistoryService.summary(parseId(req.params.id));
      res.json({ ...summary, vehicle: presentVehicle(summary.vehicle) });
    },

    history(req, res) {
      const { vehicle, washes } = vehicleHistoryService.history(parseId(req.params.id));
      res.json({
        vehicle: { ...presentVehicle(vehicle), customerName: vehicle.customerName },
        washes: washes.map(presentHistoryEntry),
      });
    },
  };
}
