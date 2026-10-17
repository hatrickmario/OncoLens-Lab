// Punto de entrada de `npx prisma db seed` (config → guarda → conexión → siembra): la lógica vive en ./seed/.
import { ejecutarSeedDelProceso } from './seed/principal.js';

await ejecutarSeedDelProceso();
