import { mensajes, rellenar } from '../mensajes';
import { clasificarResultado } from './clasificar-resultado';
import type { FaseDelPanel } from './fase-del-panel';

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
    case 'error':
      return rellenar(estado.error, { traceId: fase.traceId ?? '' }).trim();
    case 'ok': {
      const clase = clasificarResultado(fase.analisis);
      if (clase === 'sin_evidencia') return estado.sinEvidencia;
      if (clase === 'tipo_no_habilitado') return ''; // el propio aviso de alcance es la región de estado
      const n = fase.analisis.evidenceOptions.length;
      return n === 1 ? estado.listoUna : rellenar(estado.listoVarias, { n });
    }
  }
}
