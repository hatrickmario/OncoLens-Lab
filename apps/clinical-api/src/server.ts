import { createApp } from './app.js';
import { readPort } from './config.js';

/** Raíz de composición: lee la configuración, arma las dependencias y escucha. */
const app = createApp({});
const port = readPort(process.env);

app.listen(port, () => {
  console.info(`clinical-api escuchando en el puerto ${port}`);
});
