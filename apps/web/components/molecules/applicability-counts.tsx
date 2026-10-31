import { Fragment } from 'react';
import type { EvidenceOption } from '../../../../packages/api-contracts/src/types/clinical-api';
import { ESTADOS_DE_APLICABILIDAD } from '../../lib/evidence/estados-de-aplicabilidad';
import { mensajes } from '../../lib/mensajes';
import estilos from '../evidence.module.css';

type Resumen = EvidenceOption['applicabilitySummary'];

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
        aria-label={ESTADOS_DE_APLICABILIDAD.map(({ clave }) => conteo(clave)).join(', ')}
      >
        {ESTADOS_DE_APLICABILIDAD.map(({ clave, simbolo }, indice) => (
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
