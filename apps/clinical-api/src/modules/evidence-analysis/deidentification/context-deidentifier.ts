import type { ClinicalContext } from '../../../../../../packages/api-contracts/src/client/rag-orchestrator/index.js';
import type { Registrar } from '../../../infrastructure/logger.js';
import type {
  ContextDeidentifier,
  ContextoPermitido,
  PatientIdentityReader,
  PiiDetector,
  PiiDetectorFactory,
  PseudonymGenerator,
} from '../ports.js';
import { exigirEntornoSintetico } from './entorno-sintetico.guard.js';

/** La desidentificación no pudo garantizarse: no sale nada hacia la IA (falla cerrada, RN-11). Sin detalle interno. */
export class DesidentificacionNoDisponible extends Error {
  constructor() {
    super('Desidentificación no disponible');
    this.name = 'DesidentificacionNoDisponible';
  }
}

export interface DependenciasDelDesidentificador {
  identidades: PatientIdentityReader;
  detectores: PiiDetectorFactory;
  pseudonimos: PseudonymGenerator;
  /** `APP_ENV`: la guarda de entorno sintético solo admite `local` y `test`. */
  appEnv: string | undefined;
  registrar: Registrar;
}

const FECHA_ABSOLUTA = /\d{4}-\d{2}-\d{2}/;

type Enmascarable =
  string | number | boolean | null | Enmascarable[] | { [clave: string]: Enmascarable };

/** Recorre el valor sustituyendo cada cadena por su versión enmascarada; los números y `null` se conservan. */
function enmascararValor(
  valor: Enmascarable,
  detector: PiiDetector,
  acumulado: { tipos: Set<string>; hallazgos: number },
): Enmascarable {
  if (typeof valor === 'string') {
    const resultado = detector.enmascarar(valor);
    resultado.findingTypes.forEach((tipo) => acumulado.tipos.add(tipo));
    acumulado.hallazgos += resultado.hallazgos;
    return resultado.texto;
  }
  if (Array.isArray(valor)) return valor.map((item) => enmascararValor(item, detector, acumulado));
  if (valor !== null && typeof valor === 'object') {
    return Object.fromEntries(
      Object.entries(valor).map(([clave, contenido]) => [
        clave,
        enmascararValor(contenido, detector, acumulado),
      ]),
    );
  }
  return valor;
}

/** Enmascara todo el texto libre del contexto (`TextoEnmascarado`/`TextoEnmascaradoNulo`); `null` se conserva. */
export function enmascararTextoLibre(
  contexto: ContextoPermitido,
  detector: PiiDetector,
): { contexto: ContextoPermitido; findingTypes: string[]; hallazgos: number } {
  const acumulado = { tipos: new Set<string>(), hallazgos: 0 };
  const enmascarado = enmascararValor(contexto as unknown as Enmascarable, detector, acumulado);
  return {
    contexto: enmascarado as unknown as ContextoPermitido,
    findingTypes: [...acumulado.tipos],
    hallazgos: acumulado.hallazgos,
  };
}

/**
 * Única verificación de RN-11 sobre lo que sale hacia la IA: ninguna fecha absoluta `AAAA-MM-DD` (en el contexto ni en la
 * pregunta) y ninguna nota clínica (minimización del S1). Lanza si algo no se cumple; el llamador falla cerrado.
 */
export function verificarDesidentificado(clinicalContext: ClinicalContext, query: string): void {
  if (FECHA_ABSOLUTA.test(JSON.stringify(clinicalContext)) || FECHA_ABSOLUTA.test(query)) {
    throw new Error('fecha absoluta en lo que sale hacia la IA');
  }
  if (clinicalContext.clinicalNotes.length > 0) {
    throw new Error('notas clínicas en lo que sale hacia la IA');
  }
}

/**
 * Adaptador definitivo de `ContextDeidentifier` (RN-10, RN-11): seudónimo aleatorio por consulta, texto libre y pregunta
 * enmascarados, notas fuera del contexto y fallo cerrado. La guarda de entorno sintético corta primero y su error se
 * propaga sin envolver; cualquier otro fallo es `DesidentificacionNoDisponible`. La identidad vive solo en esta pila.
 */
export function crearContextDeidentifier(
  dependencias: DependenciasDelDesidentificador,
): ContextDeidentifier {
  const { identidades, detectores, pseudonimos, appEnv, registrar } = dependencias;
  return {
    async desidentificar({ traceId, patientId, contexto, query, dataOrigin }) {
      exigirEntornoSintetico(dataOrigin, appEnv);
      try {
        const detector = detectores.para(await identidades.leer(patientId));
        const consulta = detector.enmascarar(query);
        const textoLibre = enmascararTextoLibre(contexto, detector);
        const clinicalContext: ClinicalContext = {
          ...textoLibre.contexto,
          clinicalNotes: [],
          pseudoPatientId: pseudonimos.nuevo(),
        };
        verificarDesidentificado(clinicalContext, consulta.texto);
        registrar({
          event: 'desidentificacion.enmascarado',
          traceId,
          patientId,
          findingTypes: [...new Set([...consulta.findingTypes, ...textoLibre.findingTypes])].sort(),
          hallazgos: consulta.hallazgos + textoLibre.hallazgos,
        });
        return { clinicalContext, query: consulta.texto };
      } catch {
        // Sin eco del error: puede traer identidad o texto de la pregunta (RN-10).
        registrar({ event: 'desidentificacion.fallo', traceId, patientId });
        throw new DesidentificacionNoDisponible();
      }
    },
  };
}
