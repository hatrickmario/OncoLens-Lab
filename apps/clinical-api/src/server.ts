import { readFileSync } from 'node:fs';
import { createApp } from './app.js';
import { arrancar } from './startup.js';

/** Raíz de composición: conecta el proceso real (entorno, sistema de archivos, consola) con `arrancar`. */
arrancar({
  env: process.env,
  readFile: (ruta) => readFileSync(ruta, 'utf8'),
  log: (linea) => console.error(linea),
  exit: (codigo) => process.exit(codigo),
  listen: (puerto) => {
    createApp({}).listen(puerto, () => {
      console.info(`clinical-api escuchando en el puerto ${puerto}`);
    });
  },
});
