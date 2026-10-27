import type { EvidenceAnalysis } from '../../../../packages/api-contracts/src/types/clinical-api';
import { mensajes, rellenar } from '../mensajes';
import { clasificarResultado, type ClaseDeResultado } from './clasificar-resultado';
import type { FaseDelPanel } from './fase-del-panel';

function anunciarOpcionesListas(analisis: EvidenceAnalysis): string {
  const { estado } = mensajes().evidence;
  const n = analisis.evidenceOptions.length;
  return n === 1 ? estado.listoUna : rellenar(estado.listoVarias, { n });
}

/** Anuncio por clase de resultado; exhaustivo: añadir una clase obliga a decidir qué se anuncia. */
const ANUNCIO_POR_CLASE: Record<ClaseDeResultado, (analisis: EvidenceAnalysis) => string> = {
  con_opciones: anunciarOpcionesListas,
  solo_descartadas: anunciarOpcionesListas,
  sin_opciones: anunciarOpcionesListas,
  sin_evidencia: () => mensajes().evidence.estado.sinEvidencia,
  // el propio aviso de alcance (`role="status"`) es la región de estado
  tipo_no_habilitado: () => '',
  no_soportado: anunciarOpcionesListas,
};

/** Texto breve de la región `role="status"` (design D7); vacío mientras no ocurre nada. */
export function anunciarEstado(fase: FaseDelPanel): string {
  const { estado } = mensajes().evidence;
  switch (fase.tipo) {
    case 'inactivo':
      return '';
    case 'enviando':
      return estado.analizando;
    case 'no_realizado':
      return estado.noRealizado;
    case 'limite':
    case 'red':
      // el propio aviso (`role="status"` del límite, `role="alert"` de la red) es la región que se anuncia
      return '';
    case 'error':
      return rellenar(estado.error, { traceId: fase.traceId ?? '' }).trim();
    case 'ok':
      return ANUNCIO_POR_CLASE[clasificarResultado(fase.analisis)](fase.analisis);
  }
}
