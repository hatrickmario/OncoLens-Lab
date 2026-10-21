import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { componerAplicacion } from './composition.js';
import { observarEntorno } from './config/index.js';
import { crearPool } from './infrastructure/database.js';
import { nuevoSeudonimo, nuevoTraceId } from './infrastructure/ids.js';
import { crearRegistrador } from './infrastructure/logger.js';
import { createRagOrchestratorClient } from './infrastructure/rag-orchestrator.client.js';
import { createServiceTokenSigner, loadServicePrivateKey } from './infrastructure/service-jwt.js';
import { crearGeneradorDeToken } from './infrastructure/token.js';
import { versionDelServicio } from './infrastructure/version-servicio.js';
import { crearServicioDeIdentidad } from './modules/patients/identity.module.js';
import { crearContextDeidentifier } from './modules/evidence-analysis/deidentification/context-deidentifier.js';
import { crearLectorDeIdentidad } from './modules/evidence-analysis/deidentification/patient-identity.reader.js';
import { crearDetectorOpcionA } from './modules/evidence-analysis/deidentification/pii-detector.opcion-a.js';
import { componerGatewayDeAnalisis } from './modules/evidence-analysis/evidence-analysis.module.js';
import { crearRagQueryClient } from './modules/evidence-analysis/rag-query.adapter.js';
import { arrancar, cargarEtapaDeServicios, registrarEventoDeArranque } from './startup.js';

const leerArchivo = (ruta: string): string => readFileSync(ruta, 'utf8');

const entorno = observarEntorno(process.env);

/**
 * Raíz de composición: conecta el proceso real (entorno, sistema de archivos, consola) con `arrancar`.
 * `arrancar` comprueba primero los secretos (US-035 AC-5), la configuración de arranque y la guarda de datos reales
 * (US-037, RN-13), y el entorno se lee una sola vez, aquí, para pasárselo al módulo de configuración. Ya antes de
 * escuchar, aquí se valida la configuración de PostgreSQL, del JWT de servicio, del gateway de análisis y de PII (el
 * error nombra la variable, nunca su valor), que el catálogo tenga `manifest.json` y que la clave privada del JWT de servicio sea legible y utilizable
 * (fallo cerrado, US-054).
 */
arrancar({
  env: entorno.env,
  readFile: leerArchivo,
  log: (linea) => console.error(linea),
  exit: (codigo) => process.exit(codigo),
  cargarServicios: cargarEtapaDeServicios,
  listen: (puerto, arranque, servicios) => {
    const { configuracion, catalogo, clavesDeIdentidad } = servicios;
    // La lista de campos redactados es la base cerrada del logger más los extra de configuración (RN-10, RN-22).
    const registrar = crearRegistrador((linea) => console.info(linea), {
      camposSensiblesExtra: arranque.logs.camposSensiblesExtra,
    });
    const pool = crearPool(configuracion.database, registrar);
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
            analysisMaxOptions: configuracion.analisis.analysisMaxOptions,
            evidenceDefaultYears: configuracion.analisis.evidenceDefaultYears,
            ragTimeoutMs: configuracion.analisis.ragTimeoutMs,
            aiDisclaimerText: configuracion.analisis.aiDisclaimerText,
            analysisBasisAssumptionText: configuracion.analisis.analysisBasisAssumptionText,
          },
          reloj,
          traceIds: { traceId: nuevoTraceId },
          idsDeAnalisis: randomUUID,
          // Cableado explícito (RN-11): el desidentificador definitivo, no un valor por defecto del módulo.
          desidentificador: crearContextDeidentifier({
            identidades: crearLectorDeIdentidad(
              crearServicioDeIdentidad({ claves: clavesDeIdentidad, db: pool }),
            ),
            detectores: { para: (identidad) => crearDetectorOpcionA(identidad, configuracion.pii) },
            pseudonimos: { nuevo: nuevoSeudonimo },
            appEnv: configuracion.appEnv,
            registrar,
            expresionesDeFecha: configuracion.pii.fechas.expresiones,
          }),
          registrar,
        });
        const app = componerAplicacion({
          db: pool,
          auth: arranque.auth,
          reloj,
          tokens: crearGeneradorDeToken(),
          ids: randomUUID,
          nuevoTraceId,
          registrar,
          rutasProtegidas: [gateway],
          // Solo nombres de claves y versión: nunca valores (RN-14). Va después de leer toda la configuración.
          salud: { configKeys: entorno.clavesCargadas(), serviceVersion: versionDelServicio() },
        });
        const servidor = app.listen(puerto, () => {
          registrarEventoDeArranque((linea) => console.info(linea), 'info', 'servidor_escuchando', {
            puerto,
          });
        });
        process.once('SIGTERM', () => {
          servidor.close(() => {
            void pool.end().finally(() => process.exit(0));
          });
        });
      })
      .catch(() => {
        // Sin eco del error: puede traer la ruta o parte de la clave (RN-10).
        registrarEventoDeArranque(
          (linea) => console.error(linea),
          'error',
          'clave_servicio_invalida',
        );
        process.exit(1);
      });
  },
});
