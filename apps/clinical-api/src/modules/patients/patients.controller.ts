import { Router } from 'express';
import { authorize } from '../../middleware/authorize.js';
import type { PatientsService } from './patients.service.js';

export function patientsController({ service }: { service: PatientsService }): Router {
  const router = Router();
  router.get('/patients', authorize('patients:lookup'), async (_request, response) => {
    response.json(await service.listar({ filtros: { page: 1 }, vista: 'admin' }));
  });
  return router;
}
