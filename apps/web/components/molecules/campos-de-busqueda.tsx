import { zIdType } from '../../../../packages/api-contracts/src/zod/clinical-api/zod.gen';
import type { TextosDePacientes } from '../../lib/pacientes/consulta';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { ID_PANEL_DE_BUSQUEDA, type ModoDeBusqueda } from './pestanas-de-busqueda';

export interface CamposDeBusquedaProps {
  modo: ModoDeBusqueda;
  textos: TextosDePacientes;
  invalido: boolean;
}

const ID_AYUDA_NOMBRE = 'ayuda-nombre';

/** Campos del panel vigente: tipo y número para el documento; nombre completo (con su ayuda) para el nombre. */
export function CamposDeBusqueda({ modo, textos, invalido }: CamposDeBusquedaProps) {
  const { busqueda, tiposDeDocumento } = textos;
  const error = {
    'aria-invalid': invalido,
    'aria-describedby': invalido ? 'busqueda-invalida' : undefined,
  };
  return (
    <div
      role="tabpanel"
      id={ID_PANEL_DE_BUSQUEDA}
      aria-labelledby={`pestana-${modo}`}
      className="flex flex-wrap items-end gap-3"
    >
      {modo === 'documento' ? (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="busqueda-tipo">{busqueda.tipoDocumento}</Label>
            <select
              id="busqueda-tipo"
              name="idType"
              className="rounded-control border-control-border bg-surface text-text min-h-11 border px-3"
            >
              {zIdType.options.map((tipo) => (
                <option key={tipo} value={tipo}>
                  {tiposDeDocumento[tipo]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex min-w-56 flex-col gap-1.5">
            <Label htmlFor="busqueda-numero">{busqueda.numero}</Label>
            <Input id="busqueda-numero" name="nationalId" autoComplete="off" {...error} />
          </div>
        </>
      ) : (
        <div className="flex min-w-72 flex-col gap-1.5">
          <Label htmlFor="busqueda-nombre">{busqueda.nombre}</Label>
          <Input
            id="busqueda-nombre"
            name="name"
            autoComplete="off"
            {...error}
            aria-describedby={[ID_AYUDA_NOMBRE, error['aria-describedby']]
              .filter(Boolean)
              .join(' ')}
          />
          <p id={ID_AYUDA_NOMBRE} className="text-text-muted m-0 text-sm">
            {busqueda.ayudaNombre}
          </p>
        </div>
      )}
    </div>
  );
}
