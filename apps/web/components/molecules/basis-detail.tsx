import type { AnalysisBasis } from '../../../../packages/api-contracts/src/types/clinical-api';
import { nombrarFuentes } from '../../lib/evidence/describir-busqueda';
import { textoDeRevision } from '../../lib/evidence/texto-de-revision';
import { mensajes, rellenar } from '../../lib/mensajes';

export interface BasisDetailProps {
  base: AnalysisBasis;
}

interface ListaProps {
  titulo: string;
  items: string[];
}

function Lista({ titulo, items }: ListaProps) {
  if (items.length === 0) return null;
  return (
    <section>
      <h4>{titulo}</h4>
      <ul>
        {items.map((item, indice) => (
          <li key={`${indice}-${item}`}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

/** Detalle expandido de la Base: todo es texto de React, sin HTML crudo ni puntaje clínico (RN-03). */
export function BasisDetail({ base }: BasisDetailProps) {
  const textos = mensajes().evidence.base;
  const consultadas = base.sourcesConsulted;
  const rotular = (rotulo: string, texto: string) => rellenar(textos.rotulada, { rotulo, texto });
  return (
    <>
      <Lista
        titulo={textos.datosUsados}
        items={base.patientDataUsed.map((dato) =>
          rellenar(textos.etiquetaDato, { etiqueta: dato.label, revision: textoDeRevision(dato) }),
        )}
      />
      <Lista
        titulo={textos.fuentesConsultadas}
        items={[
          nombrarFuentes(consultadas.selected),
          rellenar(textos.fragmentos, {
            retrieved: consultadas.retrieved,
            above: consultadas.aboveThreshold,
          }),
        ]}
      />
      <Lista
        titulo={textos.fuentesNoIncluidas}
        items={base.sourcesNotIncluded.map((fuente) => rellenar(textos.sinLicencia, { fuente }))}
      />
      <Lista
        titulo={textos.supuestos}
        items={base.assumptions.map((s) => rotular(textos.origen[s.origin], s.text))}
      />
      <Lista
        titulo={textos.limitaciones}
        items={base.limitations.map((l) => rotular(textos.origen[l.origin], l.text))}
      />
    </>
  );
}
