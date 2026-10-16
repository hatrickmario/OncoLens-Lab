import { readFileSync } from 'node:fs';
import { createApp } from './app.js';
import { readServiceJwtConfig } from './config.js';
import { loadServicePrivateKey } from './infrastructure/service-jwt.js';
import { arrancar } from './startup.js';

/**
 * Raíz de composición: conecta el proceso real (entorno, sistema de archivos, consola) con `arrancar`.
 * `arrancar` comprueba primero que los secretos existan (US-035 AC-5); aquí, ya antes de escuchar, se
 * valida que la clave privada del JWT de servicio sea legible y utilizable (fallo cerrado, US-054).
 */
arrancar({
  env: process.env,
  readFile: (ruta) => readFileSync(ruta, 'utf8'),
  log: (linea) => console.error(linea),
  exit: (codigo) => process.exit(codigo),
  listen: (puerto) => {
    const { privateKeyFile } = readServiceJwtConfig(process.env);
    loadServicePrivateKey(privateKeyFile)
      .then(() => {
        createApp({}).listen(puerto, () => {
          console.info(`clinical-api escuchando en el puerto ${puerto}`);
        });
      })
      .catch(() => {
        // Sin eco del error: puede traer la ruta o parte de la clave (RN-10).
        console.error(JSON.stringify({ level: 'error', event: 'clave_servicio_invalida' }));
        process.exit(1);
      });
  },
});
