import { createApp } from './app.js';
import { readPort, readServiceJwtConfig } from './config.js';
import { loadServicePrivateKey } from './infrastructure/service-jwt.js';

/** Raíz de composición: lee la configuración, arma las dependencias y escucha. */
const serviceJwt = readServiceJwtConfig(process.env);
// Fallo cerrado: sin clave privada legible el proceso no arranca (US-054). Los módulos que llamen a
// rag-orchestrator recibirán el firmador creado con esta clave (createRagOrchestratorClient).
await loadServicePrivateKey(serviceJwt.privateKeyFile);

const app = createApp({});
const port = readPort(process.env);

app.listen(port, () => {
  console.info(`clinical-api escuchando en el puerto ${port}`);
});
