import type { ManualEntryOptions } from '../../../../packages/api-contracts/src/types/clinical-api';
import type { FormularioDeDiagnostico } from '../../lib/registro-manual/diagnostico';
import { ID_DE_CAMPO } from '../../lib/registro-manual/foco';
import { mensajes } from '../../lib/mensajes';
import { CampoDeSeleccion } from './campo-de-seleccion';
import { CampoDeTexto } from './campo-de-texto';

export interface CamposDelDiagnosticoProps {
  formulario: FormularioDeDiagnostico;
  alCambiar: (campo: keyof Omit<FormularioDeDiagnostico, 'gradacion'>, valor: string) => void;
  opciones: ManualEntryOptions;
  /** Mensaje de error por propiedad del cuerpo (`field` del servidor o validación local). */
  errores: Record<string, string>;
}

/** La opción vigente se conserva aunque el catálogo ya no la ofrezca: no se pierde al abrir el formulario. */
const conActual = (lista: readonly string[], actual: string): string[] =>
  actual === '' || lista.includes(actual) ? [...lista] : [actual, ...lista];

/** Campos comunes del diagnóstico (S5-03 b): tipo, histología, estadio, escala y valor funcional y fecha. */
export function CamposDelDiagnostico({
  formulario: f,
  alCambiar,
  opciones,
  errores,
}: CamposDelDiagnosticoProps) {
  const t = mensajes().registroManual.diagnostico;
  const { elegir } = mensajes().registroManual;
  const de = (campo: keyof Omit<FormularioDeDiagnostico, 'gradacion'>) => ({
    value: f[campo],
    onChange: (e: { target: { value: string } }) => alCambiar(campo, e.target.value),
    error: errores[campo],
  });
  const escala = opciones.performanceScales.find((e) => e.code === f.performanceScale);
  const lista = (valores: readonly string[], actual: string) =>
    conActual(valores, actual).map((v) => (
      <option key={v} value={v}>
        {v}
      </option>
    ));
  return (
    <>
      <CampoDeSeleccion id="rm-diagnostico-tipo" etiqueta={t.tipoDeCancer} {...de('cancerType')}>
        <option value="">{elegir}</option>
        {lista(opciones.enabledCancerTypes, f.cancerType)}
      </CampoDeSeleccion>
      <CampoDeTexto id={ID_DE_CAMPO.histologia} etiqueta={t.histologia} {...de('histology')} />
      <CampoDeSeleccion
        id="rm-diagnostico-sistema-estadio"
        etiqueta={t.sistemaDeEstadio}
        {...de('stagingSystem')}
      >
        <option value="">{elegir}</option>
        {lista(opciones.stagingSystems, f.stagingSystem)}
      </CampoDeSeleccion>
      <CampoDeTexto
        id={ID_DE_CAMPO.valorDeEstadio}
        etiqueta={t.valorDeEstadio}
        {...de('stageValue')}
      />
      <CampoDeSeleccion
        id="rm-diagnostico-escala"
        etiqueta={t.escalaFuncional}
        {...de('performanceScale')}
      >
        <option value="">{elegir}</option>
        {lista(
          opciones.performanceScales.map((e) => e.code),
          f.performanceScale,
        )}
      </CampoDeSeleccion>
      <CampoDeTexto
        id={ID_DE_CAMPO.valorFuncional}
        type="number"
        min={escala?.minimum}
        max={escala?.maximum}
        etiqueta={t.valorFuncional}
        {...de('performanceValue')}
      />
      <CampoDeTexto
        id="rm-diagnostico-fecha"
        type="date"
        etiqueta={t.fecha}
        {...de('diagnosedAt')}
      />
    </>
  );
}
