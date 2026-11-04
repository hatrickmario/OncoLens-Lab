import type { FormularioDeGradacion } from '../../lib/registro-manual/diagnostico';
import { ID_DE_CAMPO } from '../../lib/registro-manual/foco';
import { mensajes } from '../../lib/mensajes';
import { CampoDeSeleccion } from './campo-de-seleccion';
import { Opciones } from './opciones-de-seleccion';

const PATRONES = ['3', '4', '5'];

export interface CamposDeGleasonProps {
  valor: FormularioDeGradacion;
  cambiar: (campo: keyof FormularioDeGradacion) => (e: { target: { value: string } }) => void;
}

/** Gleason de próstata: patrones primario y secundario (3–5), tipo de espécimen y alcance; score e ISUP los deriva el servidor. */
export function CamposDeGleason({ valor, cambiar }: CamposDeGleasonProps) {
  const g = mensajes().registroManual.diagnostico.gradacion;
  return (
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
  );
}
