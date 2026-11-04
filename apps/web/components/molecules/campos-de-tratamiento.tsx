import { zPriorTreatmentManualCreate } from '../../../../packages/api-contracts/src/zod/clinical-api/zod.gen';
import { mensajes } from '../../lib/mensajes';
import { Label } from '../ui/label';
import { CampoDeTexto } from './campo-de-texto';
import { CampoDeSeleccion } from './campo-de-seleccion';

const CONTEXTOS = zPriorTreatmentManualCreate.shape.setting.options;

export interface CamposDeTratamientoProps {
  errorDe: (campo: string) => string | undefined;
  enCurso: boolean;
  alCambiarEnCurso: (enCurso: boolean) => void;
}

/** Línea, contexto, esquema, inicio y «En curso» de un tratamiento previo; el fin lo pone `CamposDeFinDeTratamiento`. */
export function CamposDeTratamiento({
  errorDe,
  enCurso,
  alCambiarEnCurso,
}: CamposDeTratamientoProps) {
  const { tratamiento: t } = mensajes().caso.registro;
  const { contextos } = mensajes().caso;
  return (
    <>
      <CampoDeTexto
        id="tp-linea"
        name="lineNumber"
        type="number"
        min={1}
        etiqueta={t.linea}
        error={errorDe('lineNumber')}
      />
      <CampoDeSeleccion
        id="tp-contexto"
        name="setting"
        defaultValue="desconocido"
        etiqueta={t.contexto}
        error={errorDe('setting')}
      >
        {CONTEXTOS.map((c) => (
          <option key={c} value={c}>
            {contextos[c]}
          </option>
        ))}
      </CampoDeSeleccion>
      <CampoDeTexto
        id="tp-esquema"
        name="regimenName"
        etiqueta={t.esquema}
        error={errorDe('regimenName')}
      />
      <CampoDeTexto
        id="tp-inicio"
        name="startedAt"
        type="date"
        etiqueta={t.inicio}
        error={errorDe('startedAt')}
      />
      <div className="flex min-h-11 items-center gap-2">
        <input
          id="tp-en-curso"
          name="ongoing"
          type="checkbox"
          checked={enCurso}
          onChange={(e) => alCambiarEnCurso(e.target.checked)}
        />
        <Label htmlFor="tp-en-curso">{t.enCurso}</Label>
      </div>
    </>
  );
}
