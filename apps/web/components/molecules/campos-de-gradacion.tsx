import type { FormularioDeGradacion } from '../../lib/registro-manual/diagnostico';
import { ID_DE_CAMPO } from '../../lib/registro-manual/foco';
import { mensajes } from '../../lib/mensajes';
import { CampoDeSeleccion } from './campo-de-seleccion';

export interface CamposDeGradacionProps {
  valor: FormularioDeGradacion;
  alCambiar: (valor: FormularioDeGradacion) => void;
  /** Sistemas de gradación del catálogo para el tipo de cáncer: con uno solo no se pregunta cuál. */
  sistemas: readonly string[];
  /** Error de la gradación completa (`field = grading`), junto al grupo. */
  error: string | undefined;
}

const PATRONES = ['3', '4', '5'];
const GRADOS_NOTTINGHAM = ['1', '2', '3'];

/** Lista de opciones de un valor del contrato con su rótulo de `messages`; `rotulos` vacío usa el valor mismo. */
function Opciones({
  valores,
  rotulos = {},
}: {
  valores: readonly string[];
  rotulos?: Record<string, string>;
}) {
  const { elegir } = mensajes().registroManual;
  return (
    <>
      <option value="">{elegir}</option>
      {valores.map((v) => (
        <option key={v} value={v}>
          {rotulos[v] ?? v}
        </option>
      ))}
    </>
  );
}

/**
 * Gradación estructurada (S5-03 b, D5): Nottingham en mama; Gleason con patrones, espécimen y alcance en próstata.
 * Nunca hay un campo para `grade`, score ni grupo ISUP: los deriva `clinical-api`.
 */
export function CamposDeGradacion({ valor, alCambiar, sistemas, error }: CamposDeGradacionProps) {
  const g = mensajes().registroManual.diagnostico.gradacion;
  const cambiar = (campo: keyof FormularioDeGradacion) => (e: { target: { value: string } }) =>
    alCambiar({ ...valor, [campo]: e.target.value });
  const preguntaElSistema = sistemas.length > 1;
  return (
    <fieldset
      aria-describedby={error ? 'rm-diagnostico-grading-error' : undefined}
      className="border-border rounded-control m-0 flex flex-col gap-3 border p-3"
    >
      <legend className="px-1 font-semibold">{g.titulo}</legend>
      {preguntaElSistema && (
        <CampoDeSeleccion
          id={ID_DE_CAMPO.sistemaDeGradacion}
          value={valor.sistema}
          onChange={cambiar('sistema')}
          etiqueta={g.sistema}
          error={undefined}
        >
          <option value="">{g.sinGradacion}</option>
          {sistemas.map((s) => (
            <option key={s} value={s}>
              {g.sistemas[s as keyof typeof g.sistemas] ?? s}
            </option>
          ))}
        </CampoDeSeleccion>
      )}
      {valor.sistema === 'nottingham' && (
        <CampoDeSeleccion
          id={ID_DE_CAMPO.nottingham}
          value={valor.nottingham}
          onChange={cambiar('nottingham')}
          etiqueta={g.nottingham}
          error={undefined}
        >
          <Opciones valores={GRADOS_NOTTINGHAM} />
        </CampoDeSeleccion>
      )}
      {valor.sistema === 'gleason_isup' && (
        <>
          <CampoDeSeleccion
            id={ID_DE_CAMPO.patronPrimario}
            value={valor.patronPrimario}
            onChange={cambiar('patronPrimario')}
            etiqueta={g.patronPrimario}
            error={undefined}
          >
            <Opciones valores={PATRONES} />
          </CampoDeSeleccion>
          <CampoDeSeleccion
            id="rm-diagnostico-patron-secundario"
            value={valor.patronSecundario}
            onChange={cambiar('patronSecundario')}
            etiqueta={g.patronSecundario}
            error={undefined}
          >
            <Opciones valores={PATRONES} />
          </CampoDeSeleccion>
          <CampoDeSeleccion
            id="rm-diagnostico-especimen"
            value={valor.especimen}
            onChange={cambiar('especimen')}
            etiqueta={g.especimen}
            error={undefined}
          >
            <Opciones valores={['biopsia', 'prostatectomia']} rotulos={g.especimenes} />
          </CampoDeSeleccion>
          <CampoDeSeleccion
            id="rm-diagnostico-alcance"
            value={valor.alcance}
            onChange={cambiar('alcance')}
            etiqueta={g.alcance}
            error={undefined}
          >
            <Opciones valores={['nucleo_sitio', 'peor', 'global']} rotulos={g.alcances} />
          </CampoDeSeleccion>
        </>
      )}
      <p id="rm-diagnostico-grading-error" aria-live="assertive" className="text-error m-0">
        {error}
      </p>
    </fieldset>
  );
}
