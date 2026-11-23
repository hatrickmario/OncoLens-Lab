import {
  ARCHIVOS_DE_RAIZ,
  ARCHIVOS_DE_RAIZ_DECLARADOS_POR_EL_MANIFIESTO,
  ARCHIVOS_DECLARADOS_POR_EL_MANIFIESTO,
  ARCHIVOS_DEL_CATALOGO,
  ARCHIVOS_POR_TIPO_DECLARADOS_POR_LISTA,
} from './archivos.mjs';

/** Versión del catálogo: `1.9.0`, con el prefijo opcional de los fixtures (`test-1.0.0`, `test-apl-1.0.0`). */
const FORMA_DE_VERSION = /^(?:test-(?:[a-z]+-)?)?(\d+)\.(\d+)\.(\d+)$/;

/** `[mayor, menor, parche]`, o `null` si la versión no tiene forma de semver (el prefijo `test-…` se ignora). */
export const partesDeVersion = (version) => {
  const partes = FORMA_DE_VERSION.exec(typeof version === 'string' ? version : '');
  return partes === null ? null : partes.slice(1).map(Number);
};

/** -1, 0 o 1; `null` si alguna versión no tiene forma de semver. Una sola regla para el validador y el guardián. */
export function compararVersiones(actual, base) {
  const a = partesDeVersion(actual);
  const b = partesDeVersion(base);
  if (a === null || b === null) return null;
  const diferencia = a.map((parte, i) => parte - b[i]).find((resta) => resta !== 0) ?? 0;
  return Math.sign(diferencia);
}

/** Los archivos de `lenguaje/` llevan versión propia (RN-23, marcos), no la del manifiesto: no se comparan. */
const llevaVersionPropia = (nombre) =>
  nombre === 'terminos-prohibidos' || nombre.startsWith('lenguaje/');

/**
 * Archivos que cada nivel del registro puede traer, sin lista fija: salen de los registros de `archivos.mjs`.
 * `tipo` = por tipo de cáncer; el resto, de la raíz.
 */
const nombresDeRaiz = () => [
  ...Object.keys(ARCHIVOS_DE_RAIZ),
  ...Object.keys(ARCHIVOS_DE_RAIZ_DECLARADOS_POR_EL_MANIFIESTO),
];
const nombresPorTipo = () => [
  ...Object.keys(ARCHIVOS_DEL_CATALOGO),
  ...Object.keys(ARCHIVOS_DECLARADOS_POR_EL_MANIFIESTO),
  ...Object.keys(ARCHIVOS_POR_TIPO_DECLARADOS_POR_LISTA),
];

const superaAlManifiesto = (archivo, versionDelManifiesto) =>
  compararVersiones(archivo?.version, versionDelManifiesto) === 1;

/**
 * G2.6 (L1D-126, design D15): la `version` propia de cada archivo leído no puede ser mayor que `manifest.version`
 * (menor o igual, sí: un archivo que no cambió conserva la suya). Un archivo cuya versión no es comparable lo señala su
 * esquema, no esta regla.
 * @returns {{ codigo: 'version_mayor_que_manifiesto', tipoDeCancer?: string, archivo: string }[]}
 */
export function violacionesDeVersionPropia(archivos) {
  const delManifiesto = archivos.manifest?.version;
  const deLaRaiz = nombresDeRaiz()
    .filter(
      (nombre) =>
        !llevaVersionPropia(nombre) && superaAlManifiesto(archivos[nombre], delManifiesto),
    )
    .map((archivo) => ({ codigo: 'version_mayor_que_manifiesto', archivo }));
  const porTipo = Object.entries(archivos.tipos ?? {}).flatMap(([tipoDeCancer, delTipo]) =>
    nombresPorTipo()
      .filter((nombre) => superaAlManifiesto(delTipo[nombre], delManifiesto))
      .map((archivo) => ({ codigo: 'version_mayor_que_manifiesto', tipoDeCancer, archivo })),
  );
  return [...deLaRaiz, ...porTipo];
}
