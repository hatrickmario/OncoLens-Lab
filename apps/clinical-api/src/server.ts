import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { componerAplicacion } from './composition.js';
import {
  ConfiguracionInvalidaError,
  exigirAppEnv,
  readAuthConfig,
  readDatabaseConfig,
  readDeidentificationConfig,
  readEvidenceAnalysisConfig,
  readServiceJwtConfig,
} from './config.js';
import { crearPool } from './infrastructure/database.js';
import { nuevoSeudonimo, nuevoTraceId } from './infrastructure/ids.js';
import { registrarEnConsola } from './infrastructure/logger.js';
import { createRagOrchestratorClient } from './infrastructure/rag-orchestrator.client.js';
import { createServiceTokenSigner, loadServicePrivateKey } from './infrastructure/service-jwt.js';
import { crearGeneradorDeToken } from './infrastructure/token.js';
import { crearProveedorDeVersionDeCatalogo } from './modules/evidence-analysis/catalog-version.provider.js';
import { cargarConfiguracionDePii } from './modules/evidence-analysis/deidentification/pii-formats.config.js';
import { componerGatewayDeAnalisis } from './modules/evidence-analysis/evidence-analysis.module.js';
import { crearRagQueryClient } from './modules/evidence-analysis/rag-query.adapter.js';
import { arrancar, registrarConfiguracionInvalida } from './startup.js';

const leerArchivo = (ruta: string): string => readFileSync(ruta, 'utf8');

/**
 * Raíz de composición: conecta el proceso real (entorno, sistema de archivos, consola) con `arrancar`.
 * `arrancar` comprueba primero que los secretos existan (US-035 AC-5); aquí, ya antes de escuchar, se
 * valida la configuración de sesión, de PostgreSQL y del gateway de análisis (el error nombra la variable, nunca su
 * valor), que el catálogo tenga `manifest.json` y que la clave privada del JWT de servicio sea legible y utilizable
 * (fallo cerrado, US-054).
 */
arrancar({
  env: process.env,
  readFile: leerArchivo,
  log: (linea) => console.error(linea),
  exit: (codigo) => process.exit(codigo),
  listen: (puerto) => {
    let configuracion;
    let catalogo;
    try {
      const appEnv = exigirAppEnv(process.env);
      configuracion = {
        appEnv,
        auth: readAuthConfig(process.env),
        database: readDatabaseConfig(process.env, leerArchivo),
        jwt: readServiceJwtConfig(process.env),
        analisis: readEvidenceAnalysisConfig(process.env),
        // Formatos de PII (L1D-166) y reglas de reemplazo: inválidos o ausentes, no se arranca (RN-11, fallo cerrado).
        pii: cargarConfiguracionDePii(readDeidentificationConfig(process.env), leerArchivo),
      };
      catalogo = crearProveedorDeVersionDeCatalogo(configuracion.analisis.catalogPath, leerArchivo);
    } catch (error) {
      if (!(error instanceof ConfiguracionInvalidaError)) throw error;
      registrarConfiguracionInvalida((linea) => console.error(linea), error);
      process.exit(1);
    }

    const pool = crearPool(configuracion.database, registrarEnConsola);
    loadServicePrivateKey(configuracion.jwt.privateKeyFile)
      .then((privateKey) => {
        const reloj = { now: () => new Date() };
        const signer = createServiceTokenSigner({
          privateKey,
          clock: reloj,
          ttlSeconds: configuracion.jwt.ttlSeconds,
        });
        const gateway = componerGatewayDeAnalisis({
          db: pool,
          rag: crearRagQueryClient(
            createRagOrchestratorClient({
              baseUrl: configuracion.analisis.ragOrchestratorUrl,
              signer,
            }),
          ),
          catalogo,
          config: {
            appEnv: configuracion.appEnv,
            analysisMaxOptions: configuracion.analisis.analysisMaxOptions,
            evidenceDefaultYears: configuracion.analisis.evidenceDefaultYears,
            ragTimeoutMs: configuracion.analisis.ragTimeoutMs,
            aiDisclaimerText: configuracion.analisis.aiDisclaimerText,
            analysisBasisAssumptionText: configuracion.analisis.analysisBasisAssumptionText,
          },
          reloj,
          traceIds: { traceId: nuevoTraceId },
          idsDeAnalisis: randomUUID,
          pseudonimos: { nuevo: nuevoSeudonimo },
          registrar: registrarEnConsola,
        });
        const app = componerAplicacion({
          db: pool,
          auth: configuracion.auth,
          reloj,
          tokens: crearGeneradorDeToken(),
          ids: randomUUID,
          nuevoTraceId,
          registrar: registrarEnConsola,
          rutasProtegidas: [gateway],
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
