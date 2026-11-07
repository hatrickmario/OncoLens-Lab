import type { FragmentoAbierto } from '../../lib/conversacion/fragmento-abierto';
import { rellenar, mensajes } from '../../lib/mensajes';
import { CitationDetails } from './citation-details';

/**
 * Fragmento citado en el panel lateral. El texto del corpus (`chunkTextSnapshot`) va como texto React, nunca como HTML
 * ni Markdown (RN-04, SEG-12). Los metadatos salen de la fuente del análisis del turno vía `CitationDetails` (una sola
 * fuente de «No disponible», RN-25); sin fuente, el panel lo dice.
 */
export function FragmentoCitadoEnPanel({ fuente }: { fuente: FragmentoAbierto }) {
  const { panel } = mensajes().conversacion;
  const { texto, titulo, ordinal } = fuente;
  return (
    <div>
      {ordinal && (
        <p className="text-text-muted m-0 text-sm">
          {rellenar(panel.fragmentoDe, { n: ordinal.numero, total: ordinal.total })}
        </p>
      )}
      <blockquote
        className="border-evidence m-0 my-2 border-l-4 pl-3 whitespace-pre-wrap"
        data-origen="corpus"
        data-campo="chunkTextSnapshot"
        lang={fuente.fuente?.language}
      >
        {texto}
      </blockquote>
      {fuente.fuente ? (
        <>
          <p className="m-0 font-semibold" data-origen="corpus" data-campo="sourceName">
            {fuente.fuente.sourceName}
          </p>
          <CitationDetails cita={fuente.fuente} id={`fragmento-${fuente.fuente.chunkId}`} />
        </>
      ) : (
        <>
          <p className="m-0 font-semibold">{titulo}</p>
          <p className="text-text-muted m-0">{panel.sinMetadatos}</p>
        </>
      )}
    </div>
  );
}
