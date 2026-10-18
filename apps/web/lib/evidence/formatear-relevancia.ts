import { mensajes } from '../mensajes';

const formato = new Intl.NumberFormat('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** RN-03: coma decimal y dos decimales; `null` ≠ `0` (RN-02): sin valor se dice "no aplica". */
export function formatearRelevancia(valor: number | null): string {
  return valor === null ? mensajes().evidence.resultado.noAplica : formato.format(valor);
}
