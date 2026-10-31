import type {
  CitedSource,
  EvidenceAnalysis,
} from '../../../../packages/api-contracts/src/types/clinical-api';
import { etiquetaDePosicion, textoOpcionesNoMostradas } from '../../lib/evidence/lista-de-opciones';
import { EvidenceOptionCard } from './evidence-option-card';

export const ID_ENCABEZADO_OPCIONES = 'encabezado-opciones';

export interface EvidenceOptionsListProps {
  analisis: EvidenceAnalysis;
  patientId: string;
  onVerFragmento: (cita: CitedSource, idChip: string) => void;
}

/**
 * Las opciones descritas como lista ordenada, en el orden recibido (RN-28): la numeración es posición,
 * nunca jerarquía (RN-23). Bajo la última tarjeta declara, solo con texto, las opciones que el límite no muestra.
 */
export function EvidenceOptionsList({
  analisis,
  patientId,
  onVerFragmento,
}: EvidenceOptionsListProps) {
  const opciones = analisis.evidenceOptions;
  const noMostradas = textoOpcionesNoMostradas(analisis.analysisBasis);
  return (
    <>
      <ol aria-labelledby={ID_ENCABEZADO_OPCIONES} style={{ listStyle: 'none', padding: 0 }}>
        {opciones.map((opcion, indice) => (
          <li key={opcion.option}>
            <EvidenceOptionCard
              opcion={opcion}
              indice={indice}
              posicion={etiquetaDePosicion(indice + 1, opciones.length)}
              fuentes={analisis.applicability}
              patientId={patientId}
              onVerFragmento={onVerFragmento}
            />
          </li>
        ))}
      </ol>
      {noMostradas && <p>{noMostradas}</p>}
    </>
  );
}
