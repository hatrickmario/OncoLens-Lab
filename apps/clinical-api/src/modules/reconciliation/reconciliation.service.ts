import type { Registrar } from '../../infrastructure/logger.js';
import type {
  CatalogoTerminologico,
  DecisionDeNormalizacion,
  EstadoDeMapeo,
  Estandar,
  PropuestaDeNormalizacion,
  ReconciliationService,
} from './ports.js';
import { estandarDe, resolverCodigo } from './reconciliation.reglas.js';

export interface DependenciasDeReconciliation {
  readonly catalogo: CatalogoTerminologico;
  /** Opcional: solo emite `terminologia_ambigua` (entidad y estándar, nunca el texto clínico, RN-10). */
  readonly registrar?: Registrar;
}

/** Códigos de la decisión según el estándar que los originó; el resto de campos queda nulo o vacío. */
function codigosPorEstandar(estandar: Estandar | null, codigos: readonly string[]) {
  return {
    icd10Code: estandar === 'cie10' ? (codigos[0] ?? null) : null,
    loincCode: estandar === 'loinc' ? (codigos[0] ?? null) : null,
    cupsCode: estandar === 'cups' ? (codigos[0] ?? null) : null,
    atcCodes: estandar === 'atc' ? [...codigos] : [],
  };
}

/** Decisión con el término canónico (o el texto original si no hubo mapeo) y los códigos de su estándar. */
function construirDecision(
  catalogVersion: string,
  propuesta: PropuestaDeNormalizacion,
  mappingStatus: EstadoDeMapeo,
  estandar: Estandar | null,
  terminoCanonico: string | null,
  codigos: readonly string[],
): DecisionDeNormalizacion {
  return {
    entidad: propuesta.entidad,
    name: terminoCanonico ?? propuesta.textoOriginal,
    originalName: propuesta.textoOriginal,
    mappingStatus,
    catalogVersion,
    ...codigosPorEstandar(estandar, codigos),
  };
}

/**
 * ÚNICO dueño de RN-27 (ADR-33): decide término canónico, código y `mapping_status` de un dato manual contra el
 * catálogo montado. Sin E/S propia: devuelve la decisión y el service del consumidor la guarda en su transacción (D1).
 */
export function createReconciliationService({
  catalogo,
  registrar,
}: DependenciasDeReconciliation): ReconciliationService {
  function resolverContraElCatalogo(propuesta: PropuestaDeNormalizacion, estandar: Estandar) {
    const resolucion = resolverCodigo({
      entradas: catalogo.entradas(propuesta.tipoDeCancer, estandar),
      sinonimos: catalogo.sinonimos(propuesta.tipoDeCancer),
      textoOriginal: propuesta.textoOriginal,
      ...(propuesta.codigoPropuesto !== undefined && {
        codigoPropuesto: propuesta.codigoPropuesto,
      }),
    });
    if (resolucion.resultado === 'ambiguo') {
      registrar?.({ event: 'terminologia_ambigua', entidad: propuesta.entidad, estandar });
    }
    return resolucion;
  }

  return {
    decidir(propuesta) {
      const estandar = estandarDe(propuesta);
      if (estandar === null)
        return construirDecision(catalogo.version(), propuesta, 'n_a', null, null, []);
      const resolucion = resolverContraElCatalogo(propuesta, estandar);
      if (resolucion.resultado !== 'mapeado') {
        return construirDecision(catalogo.version(), propuesta, 'no_mapeado', null, null, []);
      }
      return construirDecision(
        catalogo.version(),
        propuesta,
        'mapeado',
        estandar,
        resolucion.terminoCanonico,
        resolucion.codigos,
      );
    },
  };
}
