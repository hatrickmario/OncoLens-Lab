import type { ManualEntryOptions } from '../../../../packages/api-contracts/src/types/clinical-api';
import { ID_DE_CAMPO } from '../../lib/registro-manual/foco';
import { mensajes } from '../../lib/mensajes';
import { CampoDeSeleccion } from './campo-de-seleccion';
import { CampoDeTexto } from './campo-de-texto';

export interface CamposDeBiomarcadorProps {
  /** Mensaje de error por propiedad del cuerpo (`field` del servidor o validación local). */
  errores: Record<string, string>;
  /** Términos del catálogo para el autocompletado; vacío si no cargaron (texto libre, RN-27). */
  terminos: ManualEntryOptions['biomarkerTerms'];
  terminoInicial: string | undefined;
}

/** Campos del biomarcador (S5-03 a): nombre con autocompletado nativo, valor, unidad, tipo de resultado y fecha. */
export function CamposDeBiomarcador({
  errores,
  terminos,
  terminoInicial,
}: CamposDeBiomarcadorProps) {
  const { biomarcador: t, elegir } = mensajes().registroManual;
  return (
    <>
      <CampoDeTexto
        id="rm-biomarcador-nombre"
        name="name"
        list="rm-biomarcador-terminos"
        defaultValue={terminoInicial ?? ''}
        etiqueta={t.nombre}
        error={errores.name}
        autoComplete="off"
      />
      <datalist id="rm-biomarcador-terminos">
        {terminos.map((termino) => (
          <option key={termino.term} value={termino.term} label={termino.label} />
        ))}
      </datalist>
      <CampoDeTexto
        id={ID_DE_CAMPO.biomarcadorValor}
        name="value"
        etiqueta={t.valor}
        error={errores.value}
        autoComplete="off"
      />
      <CampoDeTexto
        id="rm-biomarcador-unidad"
        name="unit"
        etiqueta={t.unidad}
        error={errores.unit}
      />
      <CampoDeSeleccion
        id="rm-biomarcador-tipo"
        name="resultType"
        defaultValue=""
        etiqueta={t.tipoDeResultado}
        error={errores.resultType}
      >
        <option value="">{elegir}</option>
        <option value="cuantitativo">{t.cuantitativo}</option>
        <option value="cualitativo">{t.cualitativo}</option>
      </CampoDeSeleccion>
      <CampoDeTexto
        id="rm-biomarcador-fecha"
        name="performedAt"
        type="date"
        etiqueta={t.fecha}
        error={errores.performedAt}
      />
    </>
  );
}
