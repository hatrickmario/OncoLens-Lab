import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { componerAplicacion, componerRutasProtegidas } from './composition.js';
import { observarEntorno } from './config/index.js';
import { crearAlmacenMinio } from './infrastructure/almacen-documentos.minio.js';
import { crearEjecutorDeTransacciones, crearPool } from './infrastructure/database.js';
import { nuevoSeudonimo, nuevoTraceId } from './infrastructure/ids.js';
import { crearRegistrador } from './infrastructure/logger.js';
import { createRagOrchestratorClient } from './infrastructure/rag-orchestrator.client.js';
import { createServiceTokenSigner, loadServicePrivateKey } from './infrastructure/service-jwt.js';
import { componerInformacionDeSalud } from './routes/health.js';
import { crearGeneradorDeToken } from './infrastructure/token.js';
import { versionDelServicio } from './infrastructure/version-servicio.js';
import { caseViewController } from './modules/case-view/case-view.controller.js';
import { createCaseViewRepository } from './modules/case-view/case-view.repository.js';
import { createCaseViewService } from './modules/case-view/case-view.service.js';
import {
  cargarCatalogoDeDatosCriticos,
  componerCompletitud,
} from './modules/completeness/completeness.module.js';
import { completenessController } from './modules/completeness/completeness.controller.js';
import { createReconciliationService } from './modules/reconciliation/reconciliation.service.js';
import { componerModuloDeAtributos } from './modules/clinical-attributes/clinical-attributes.module.js';
import { componerModuloDeTratamientos } from './modules/prior-treatments/prior-treatments.module.js';
import { componerModuloDeCorrecciones } from './modules/corrections/corrections.module.js';
import { componerModuloDeRegistroManual } from './modules/manual-entry/manual-entry.module.js';
import { componerModuloDeDocumentos } from './modules/documents/documents.module.js';
import { componerModuloDePacientes } from './modules/patients/patients.module.js';
import { crearServicioDeIdentidad } from './modules/patients/identity.module.js';
import { crearContextDeidentifier } from './modules/evidence-analysis/deidentification/context-deidentifier.js';
import { crearLectorDeIdentidad } from './modules/evidence-analysis/deidentification/patient-identity.reader.js';
import { crearDetectorOpcionA } from './modules/evidence-analysis/deidentification/pii-detector.opcion-a.js';
import {
  componerGatewayDeAnalisis,
  crearChecklistDeFaltantes,
  crearChecklistDelChat,
} from './modules/evidence-analysis/evidence-analysis.module.js';
import { cargarEtiquetasDeDatosCriticos } from './modules/evidence-analysis/etiquetas-datos-criticos.js';
import {
  crearRagChatClient,
  crearRagFollowUpClient,
  crearRagQueryClient,
} from './modules/evidence-analysis/rag-query.adapter.js';
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
    const { configuracion, catalogo, clavesDeIdentidad, tiposHabilitados } = servicios;
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
        // Una sola instancia para el desidentificador y el listado: las mismas claves y la misma conexión.
        const identidad = crearServicioDeIdentidad({ claves: clavesDeIdentidad, db: pool });
        // Una sola instancia del checklist para el endpoint, el contador de la ficha y los faltantes del análisis (D2):
        // lee el MISMO catálogo montado (`CLINICAL_CATALOG_PATH`, design D5).
        const completitud = componerCompletitud({
          db: pool,
          rutaDelCatalogo: configuracion.analisis.catalogPath,
          leerArchivo,
          tiposHabilitados,
        });
        const clienteRag = createRagOrchestratorClient({
          baseUrl: configuracion.analisis.ragOrchestratorUrl,
          signer,
        });
        const gateway = componerGatewayDeAnalisis({
          db: pool,
          rag: crearRagQueryClient(clienteRag),
          ragFollowUp: crearRagFollowUpClient(clienteRag),
          ragChat: crearRagChatClient(clienteRag),
          // Conversación del chat (L1D-315): ids aleatorios; el hilo de Backend 2 nunca se deriva de un dato del paciente.
          idsDeConversaciones: randomUUID,
          idsDeTurnosDeChat: randomUUID,
          idsDeHilos: randomUUID,
          checklistDelChat: crearChecklistDelChat(completitud),
          enTransaccion: crearEjecutorDeTransacciones(pool),
          idsDeTurnos: randomUUID,
          catalogo,
          checklist: crearChecklistDeFaltantes(completitud),
          config: {
            analysisMaxOptions: configuracion.analisis.analysisMaxOptions,
            evidenceDefaultYears: configuracion.analisis.evidenceDefaultYears,
            ragTimeoutMs: configuracion.analisis.ragTimeoutMs,
            analysisFollowupMax: configuracion.analisis.analysisFollowupMax,
            aiDisclaimerText: configuracion.analisis.aiDisclaimerText,
            chatRehydrateTurns: configuracion.analisis.chatRehydrateTurns,
          },
          etiquetaDe: cargarEtiquetasDeDatosCriticos(
            configuracion.analisis.catalogPath,
            leerArchivo,
          ),
          tiposHabilitados,
          alcanceDelCorpus: configuracion.alcance,
          reloj,
          traceIds: { traceId: nuevoTraceId },
          idsDeAnalisis: randomUUID,
          // Cableado explícito (RN-11): el desidentificador definitivo, no un valor por defecto del módulo.
          desidentificador: crearContextDeidentifier({
            identidades: crearLectorDeIdentidad(identidad),
            detectores: { para: (identidad) => crearDetectorOpcionA(identidad, configuracion.pii) },
            pseudonimos: { nuevo: nuevoSeudonimo },
            appEnv: configuracion.appEnv,
            registrar,
            expresionesDeFecha: configuracion.pii.fechas.expresiones,
          }),
          registrar,
        });
        // clinical-api es el único dueño de clinical-minio. El bucket se asegura sin bloquear el arranque ni /health:
        // si MinIO no responde, la carga contesta 503 y el siguiente arranque lo reintenta.
        const almacen = crearAlmacenMinio(configuracion.documentos);
        almacen.asegurarBucket().catch(() => {
          registrar({ event: 'almacen_documentos.bucket', resultado: 'no_asegurado' });
        });
        const documents = componerModuloDeDocumentos({
          db: pool,
          almacen,
          reloj,
          ids: randomUUID,
          traceIds: { traceId: nuevoTraceId },
          registrar,
          config: { maxUploadMb: configuracion.documentos.maxUploadMb },
        });
        const patients = componerModuloDePacientes({
          db: pool,
          identidad,
          tiposHabilitados: servicios.tiposHabilitados,
          completitud,
          traceIds: { traceId: nuevoTraceId },
          registrar,
          config: { pageSize: configuracion.pacientes.pageSize },
        });
        // Registro manual (L1D-90): la normalización es de `ReconciliationService` (RN-27); su log lleva el `traceId` de
        // la petición (nunca el texto clínico) y el módulo toma una conexión del pool por transacción.
        const manualEntry = componerModuloDeRegistroManual({
          fuente: pool,
          reconciliacionPara: (traceId) =>
            createReconciliationService({
              catalogo: servicios.terminologia,
              registrar: (linea) => registrar({ ...linea, traceId }),
            }),
          escalas: servicios.escalas,
          terminologia: servicios.terminologia,
          // El MISMO lector de datos-criticos.json que el checklist (D10 de l1d-91): `criticalItems` = `destination`.
          datosCriticos: cargarCatalogoDeDatosCriticos(
            configuracion.analisis.catalogPath,
            leerArchivo,
          ),
          tiposDelCatalogo: catalogo.cancerTypes(),
          tiposHabilitados,
          reloj,
          generarId: randomUUID,
          traceIds: { traceId: nuevoTraceId },
          registrar,
        });
        // Corrección con histórico (L1D-309): misma normalización que el registro manual (RN-27) y límites de RN-22.
        const corrections = componerModuloDeCorrecciones({
          fuente: pool,
          reconciliacionPara: (traceId) =>
            createReconciliationService({
              catalogo: servicios.terminologia,
              registrar: (linea) => registrar({ ...linea, traceId }),
            }),
          catalogoDeAtributos: servicios.atributos,
          limites: {
            notaMaxChars: configuracion.correcciones.clinicalNoteMaxChars,
            historialMax: configuracion.correcciones.correctionHistoryMax,
          },
          reloj,
          generarId: randomUUID,
          traceIds: { traceId: nuevoTraceId },
          registrar,
        });
        // Tratamientos previos y atributos manuales (L1D-80): la normalización del esquema es de `ReconciliationService`
        // (RN-27) y la lista de atributos y valores es la del catálogo (RN-29).
        const priorTreatments = componerModuloDeTratamientos({
          fuente: pool,
          reconciliacionPara: (traceId) =>
            createReconciliationService({
              catalogo: servicios.terminologia,
              registrar: (linea) => registrar({ ...linea, traceId }),
            }),
          reloj,
          generarId: randomUUID,
          traceIds: { traceId: nuevoTraceId },
          registrar,
        });
        const clinicalAttributes = componerModuloDeAtributos({
          fuente: pool,
          catalogo: servicios.atributos,
          reloj,
          generarId: randomUUID,
          traceIds: { traceId: nuevoTraceId },
          registrar,
        });
        const completeness = completenessController({
          service: completitud,
          traceIds: { traceId: nuevoTraceId },
          registrar,
        });
        const caseView = caseViewController({
          service: createCaseViewService({
            repo: createCaseViewRepository(pool),
            completitud,
          }),
          traceIds: { traceId: nuevoTraceId },
          registrar,
        });
        const app = componerAplicacion({
          db: pool,
          auth: arranque.auth,
          sesion: arranque.sesion,
          reloj,
          tokens: crearGeneradorDeToken(),
          ids: randomUUID,
          nuevoTraceId,
          registrar,
          rutasProtegidas: componerRutasProtegidas({
            gateway,
            documents,
            patients,
            completeness,
            manualEntry,
            caseView,
            corrections,
            priorTreatments,
            clinicalAttributes,
          }),
          // Solo nombres de claves y versión: nunca valores (RN-14). Va después de leer toda la configuración.
          salud: componerInformacionDeSalud({
            configKeys: entorno.clavesCargadas(),
            serviceVersion: versionDelServicio(),
            catalogo,
          }),
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
