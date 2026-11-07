import { mensajes } from '../../lib/mensajes';

export interface GuidedQuestionsProps {
  /** De 0 a 4 textos ya compuestos en servidor; el botón envía exactamente su texto como pregunta (sin marca de origen). */
  preguntas: readonly string[];
  deshabilitadas: boolean;
  onElegir: (pregunta: string) => void;
}

/** «Preguntas de partida sobre este caso»: botones nativos dentro de un grupo con nombre accesible (RN-23: sin «sugeridas»). */
export function GuidedQuestions({ preguntas, deshabilitadas, onElegir }: GuidedQuestionsProps) {
  if (preguntas.length === 0) return null;
  const { guiadasTitulo } = mensajes().conversacion;
  return (
    <div role="group" aria-labelledby="titulo-preguntas-guiadas" className="mt-3">
      <p id="titulo-preguntas-guiadas" className="m-0 font-semibold">
        {guiadasTitulo}
      </p>
      <ul className="m-0 mt-2 flex list-none flex-wrap gap-2 p-0">
        {preguntas.map((pregunta) => (
          <li key={pregunta}>
            <button
              type="button"
              disabled={deshabilitadas}
              onClick={() => onElegir(pregunta)}
              className="border-control-border rounded-control bg-surface min-h-11 cursor-pointer border px-3 text-left disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pregunta}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
