import { registrarEnConsola } from '../../src/infrastructure/logger.js';
import { leerArchivoDeTexto } from './archivos.js';
import { conectarConTlsVerificado } from './conexion.js';
import {
  CLAVE_PACIENTES_POR_ORIGEN,
  contarFilasDelSeed,
  contarPacientesPorOrigen,
} from './contar.js';

/**
 * Punto de entrada de `node dist/apps/clinical-api/prisma/seed/contar-en-proceso.js` (L1D-297): imprime una línea JSON con los
 * conteos del seed y nada más. No lee ni imprime la cadena de conexión; un error imprime solo su clase.
 */
try {
  const conexion = await conectarConTlsVerificado(
    process.env,
    leerArchivoDeTexto,
    registrarEnConsola,
  );
  try {
    const conteos = await conexion.enTransaccion(async (sesion) => ({
      ...(await contarFilasDelSeed(sesion)),
      [CLAVE_PACIENTES_POR_ORIGEN]: await contarPacientesPorOrigen(sesion),
    }));
    process.stdout.write(`${JSON.stringify({ conteos })}\n`);
  } finally {
    await conexion.end();
  }
} catch (error) {
  console.error(`El conteo del seed falló (${(error as Error).name})`);
  process.exitCode = 1;
}
