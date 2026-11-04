import { mensajes } from '../../lib/mensajes';
import { Button } from '../ui/button';

export interface PieDeFormularioDeRegistroProps {
  enviando: boolean;
  /** Error que no es de un campo (permiso, egresado, genérico): se anuncia aquí con `aria-live`. */
  errorGeneral: string | undefined;
  alCancelar: () => void;
  /** Texto de «no hay nada que guardar»: deshabilita «Guardar» y lo explica (diagnóstico sin cambios). */
  avisoDeSinCambios?: string;
}

/** Error general, «Guardar» y «Cancelar» de los formularios de registro manual (S5-03). */
export function PieDeFormularioDeRegistro({
  enviando,
  errorGeneral,
  alCancelar,
  avisoDeSinCambios,
}: PieDeFormularioDeRegistroProps) {
  const { guardar, guardando, cancelar } = mensajes().caso.registro;
  return (
    <>
      <p aria-live="assertive" className="text-error m-0">
        {errorGeneral}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          disabled={enviando || avisoDeSinCambios !== undefined}
          aria-describedby={avisoDeSinCambios === undefined ? undefined : 'registro-sin-cambios'}
        >
          {enviando ? guardando : guardar}
        </Button>
        <Button variante="secundario" onClick={alCancelar}>
          {cancelar}
        </Button>
      </div>
      {avisoDeSinCambios !== undefined && (
        <p id="registro-sin-cambios" className="text-text-muted m-0">
          {avisoDeSinCambios}
        </p>
      )}
    </>
  );
}
