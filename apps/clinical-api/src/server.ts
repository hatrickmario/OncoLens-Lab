import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { componerAplicacion } from './composition.js';
import {
  ConfiguracionInvalidaError,
  exigirAppEnv,
  readAuthConfig,
  readDatabaseConfig,
  readServiceJwtConfig,
} from './config.js';
import { crearPool } from './infrastructure/database.js';
import { nuevoTraceId } from './infrastructure/ids.js';
import { registrarEnConsola } from './infrastructure/logger.js';
import { loadServicePrivateKey } from './infrastructure/service-jwt.js';
import { crearGeneradorDeToken } from './infrastructure/token.js';
import { arrancar, registrarConfiguracionInvalida } from './startup.js';

const leerArchivo = (ruta: string): string => readFileSync(ruta, 'utf8');

/**
 * Raíz de composición: conecta el proceso real (entorno, sistema de archivos, consola) con `arrancar`.
 * `arrancar` comprueba primero que los secretos existan (US-035 AC-5); aquí, ya antes de escuchar, se
 * valida la configuración de sesión y de PostgreSQL (el error nombra la variable, nunca su valor) y que la
 * clave privada del JWT de servicio sea legible y utilizable (fallo cerrado, US-054).
 */
arrancar({
  env: process.env,
  readFile: leerArchivo,
  log: (linea) => console.error(linea),
  exit: (codigo) => process.exit(codigo),
  listen: (puerto) => {
    let configuracion;
    try {
      exigirAppEnv(process.env);
      configuracion = {
        auth: readAuthConfig(process.env),
        database: readDatabaseConfig(process.env, leerArchivo),
        jwt: readServiceJwtConfig(process.env),
      };
    } catch (error) {
      if (!(error instanceof ConfiguracionInvalidaError)) throw error;
      registrarConfiguracionInvalida((linea) => console.error(linea), error);
      process.exit(1);
    }

    const pool = crearPool(configuracion.database, registrarEnConsola);
    loadServicePrivateKey(configuracion.jwt.privateKeyFile)
      .then(() => {
        const app = componerAplicacion({
          db: pool,
          auth: configuracion.auth,
          reloj: { now: () => new Date() },
          tokens: crearGeneradorDeToken(),
          ids: randomUUID,
          nuevoTraceId,
          registrar: registrarEnConsola,
        });
        const servidor = app.listen(puerto, () => {
          console.info(`clinical-api escuchando en el puerto ${puerto}`);
        });
        process.once('SIGTERM', () => {
          servidor.close(() => {
            void pool.end().finally(() => process.exit(0));
          });
        });
      })
      .catch(() => {
        // Sin eco del error: puede traer la ruta o parte de la clave (RN-10).
        console.error(JSON.stringify({ level: 'error', event: 'clave_servicio_invalida' }));
        process.exit(1);
      });
  },
});
