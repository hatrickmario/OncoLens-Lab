import { useId } from 'react';
import type {
  ApplicabilityCriterion,
  CitedSource,
  EvidenceOption,
} from '../../../../packages/api-contracts/src/types/clinical-api';
import { mensajes } from '../../lib/mensajes';
import estilos from '../evidence.module.css';
import { ApplicabilityCounts } from './applicability-counts';
import { ApplicabilityCriterionRow } from './applicability-criterion-row';

type FuenteDeLaOpcion = EvidenceOption['perSource'][number];

export interface ApplicabilitySourceProps {
  fuente: FuenteDeLaOpcion;
  /** Criterios de esta fuente (`applicability[]` del análisis); vacío en análisis sin detalle por criterio. */
  criterios: readonly ApplicabilityCriterion[];
  citas: readonly CitedSource[];
  patientId: string;
}

/** Tabla de una fuente: su título, su resumen por conteos, la etiqueta de población no comparable y sus criterios. */
export function ApplicabilitySource({
  fuente,
  criterios,
  citas,
  patientId,
}: ApplicabilitySourceProps) {
  const { columnas, etiquetaNoComparable, leyendaExcluyente } = mensajes().evidence.aplicabilidad;
  const idTitulo = useId();
  const titulo = citas.find((c) => c.externalId === fuente.externalId)?.title ?? fuente.externalId;
  return (
    <section aria-labelledby={idTitulo} className={estilos.fuenteDeAplicabilidad}>
      <h4 id={idTitulo}>
        <span data-origen="corpus" data-campo="title">
          {titulo}
        </span>
      </h4>
      {fuente.populationNotComparable && (
        <p className={estilos.etiquetaNoComparable}>{etiquetaNoComparable}</p>
      )}
      <ApplicabilityCounts resumen={fuente.summary} />
      {criterios.length > 0 && (
        <table className={estilos.tablaDeAplicabilidad}>
          <thead>
            <tr>
              {(['criterio', 'paciente', 'estudio', 'estado'] as const).map((columna) => (
                <th key={columna} scope="col">
                  {columnas[columna]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {criterios.map((criterio) => (
              <ApplicabilityCriterionRow
                key={criterio.criterion}
                criterio={criterio}
                citas={citas}
                patientId={patientId}
              />
            ))}
          </tbody>
        </table>
      )}
      {criterios.some((c) => c.isExclusionary) && <p>{leyendaExcluyente}</p>}
    </section>
  );
}
