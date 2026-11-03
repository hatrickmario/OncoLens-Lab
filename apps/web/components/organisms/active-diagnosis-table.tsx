import type { Diagnosis } from '../../../../packages/api-contracts/src/types/clinical-api';
import { describirGradacion, textoDeOrigen } from '../../lib/ficha/presentacion';
import { mensajes } from '../../lib/mensajes';
import { FechaRelativa } from '../atoms/fecha-relativa';
import { FilaDeFicha, SeccionDeFicha } from '../molecules/fila-de-ficha';

/** Gradaciones con su espécimen y alcance; el texto canónico `grade` encabeza la lista. */
function Gradacion({ diagnostico }: { diagnostico: Diagnosis }) {
  const { noRegistrado } = mensajes().ficha;
  if (diagnostico.grade === null && diagnostico.gradings.length === 0) return <>{noRegistrado}</>;
  return (
    <>
      <p className="m-0 font-semibold">{diagnostico.grade ?? noRegistrado}</p>
      <ul className="m-0 list-none p-0">
        {diagnostico.gradings
          .filter((g) => describirGradacion(g) !== diagnostico.grade)
          .map((g) => (
            <li key={g.id}>{describirGradacion(g)}</li>
          ))}
      </ul>
    </>
  );
}

function filasDelDiagnostico(d: Diagnosis, hoy: string) {
  const { diagnostico, noRegistrado } = mensajes().ficha;
  const estadoFuncional =
    d.performanceScale && d.performanceValue !== null
      ? `${d.performanceScale} ${d.performanceValue}`
      : noRegistrado;
  return [
    [diagnostico.tipo, [d.cancerType, d.icd10Code].filter(Boolean).join(' · ')],
    [
      diagnostico.histologia,
      [d.histology ?? noRegistrado, d.histologyCode].filter(Boolean).join(' · '),
    ],
    [diagnostico.gradacion, <Gradacion key="g" diagnostico={d} />],
    [diagnostico.estadio, `${d.stagingSystem} ${d.stageValue}`],
    [diagnostico.estadoFuncional, estadoFuncional],
    [diagnostico.diagnosticado, <FechaRelativa key="f" fecha={d.diagnosedAt} hoy={hoy} />],
    [diagnostico.origen, textoDeOrigen(d.provenance)],
  ] as const;
}

/** Diagnóstico vigente (S2-04): una fila por dato; un campo ausente se muestra "No registrado" (dato del paciente). */
export function ActiveDiagnosisTable({
  diagnostico,
  hoy,
}: {
  diagnostico: Diagnosis | null;
  hoy: string;
}) {
  const { diagnostico: textos, noRegistrado } = mensajes().ficha;
  return (
    <SeccionDeFicha id="diagnostico" titulo={textos.titulo}>
      {diagnostico === null ? (
        <p className="m-0">{noRegistrado}</p>
      ) : (
        <table className="w-full border-collapse">
          <tbody>
            {filasDelDiagnostico(diagnostico, hoy).map(([titulo, valor]) => (
              <FilaDeFicha key={titulo} titulo={titulo}>
                {valor}
              </FilaDeFicha>
            ))}
          </tbody>
        </table>
      )}
    </SeccionDeFicha>
  );
}
