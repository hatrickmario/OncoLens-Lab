import { Fragment } from 'react';
import type { EvidenceOption } from '../../../../packages/api-contracts/src/types/clinical-api';
import { mensajes } from '../../lib/mensajes';
import estilos from '../evidence.module.css';

type Resumen = EvidenceOption['applicabilitySummary'];

/** Los cuatro estados con su símbolo: el estado se distingue por texto, nunca solo por color (WCAG 1.4.1). */
const ESTADOS = [
  { clave: 'coincide', simbolo: '✓' },
  { clave: 'parcial', simbolo: '◐' },
  { clave: 'noCoincide', simbolo: '✕' },
  { clave: 'desconocido', simbolo: '?' },
] as const;

/** Línea de conteos de aplicabilidad de la opción (RN-28): solo texto, sin puntaje, porcentaje ni barra. */
export function ApplicabilityCounts({ resumen }: { resumen: Resumen }) {
  const { aplicabilidad } = mensajes().evidence;
  const conteo = (clave: keyof Resumen) => `${aplicabilidad[clave]} ${resumen[clave]}`;
  return (
    <div className={estilos.conteos}>
      <p>{aplicabilidad.prefijo}</p>
      <div
        role="group"
        className={estilos.conteosEstados}
        aria-label={ESTADOS.map(({ clave }) => conteo(clave)).join(', ')}
      >
        {ESTADOS.map(({ clave, simbolo }, indice) => (
          <Fragment key={clave}>
            {indice > 0 && ' · '}
            <span className={estilos[clave]}>
              <span aria-hidden="true">{simbolo} </span>
              {conteo(clave)}
            </span>
          </Fragment>
        ))}
      </div>
    </div>
  );
}
