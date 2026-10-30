import { zGetCompletenessPath } from '../../../../../packages/api-contracts/src/zod/clinical-api/zod.gen.js';

/** `patientId` de la ruta: un UUID; cualquier otra cosa es un 404 sin consultar la BD (como la ficha, D4). */
export const idDePacienteSchema = zGetCompletenessPath.shape.patientId;
