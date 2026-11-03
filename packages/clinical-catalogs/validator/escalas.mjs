/**
 * Reglas de `escalas.json` (L1D-90, D6): sus valores deben caber en los enums de la base (`performance_scale`,
 * `diagnosis_grading.grading_system`) y sus rangos ser coherentes. Cada violación nombra el valor del catálogo (no es
 * dato clínico): `{ codigo, archivo: 'escalas', elemento }`.
 */

/** Enum `clinical.performance_scale` del esquema. */
export const ESCALAS_FUNCIONALES_DEL_ESQUEMA = ['ECOG', 'Karnofsky', 'Lansky'];
/** Sistemas que `diagnosis_grading.grading_system` y el contrato (`DiagnosisGradingInput`) admiten. */
export const SISTEMAS_DE_GRADACION_DEL_CONTRATO = ['nottingham', 'gleason_isup'];

const lista = (valor) =>
  Array.isArray(valor) ? valor.filter((e) => e && typeof e === 'object') : [];

/** @returns {{ codigo: string, archivo: string, elemento: string }[]} */
export function violacionesDeEscalas(escalas, tiposDelManifiesto = []) {
  const violacion = (codigo, elemento) => ({
    codigo,
    archivo: 'escalas',
    elemento: String(elemento),
  });
  const escalasFuncionales = lista(escalas?.escalasFuncionales).flatMap((escala) => [
    ...(ESCALAS_FUNCIONALES_DEL_ESQUEMA.includes(escala.codigo)
      ? []
      : [violacion('escala_desconocida', escala.codigo)]),
    ...(escala.minimo <= escala.maximo ? [] : [violacion('rango_invertido', escala.codigo)]),
  ]);
  const gradaciones = lista(escalas?.sistemasDeGradacion).flatMap((sistema) =>
    SISTEMAS_DE_GRADACION_DEL_CONTRATO.includes(sistema.codigo)
      ? []
      : [violacion('gradacion_desconocida', sistema.codigo)],
  );
  const tiposAjenos = [
    ...lista(escalas?.sistemasDeEstadificacion),
    ...lista(escalas?.sistemasDeGradacion),
  ].flatMap((sistema) =>
    (Array.isArray(sistema.tiposDeCancer) ? sistema.tiposDeCancer : [])
      .filter((tipo) => !tiposDelManifiesto.includes(tipo))
      .map(() => violacion('tipo_de_cancer_ajeno', sistema.codigo)),
  );
  return [...escalasFuncionales, ...gradaciones, ...tiposAjenos];
}
