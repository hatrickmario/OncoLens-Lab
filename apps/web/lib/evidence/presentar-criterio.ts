import { hrefDeFicha, type AnclaDeFicha } from '../ficha/anclas';
import { mensajes } from '../mensajes';

const ANCLA_POR_CRITERIO: Record<string, AnclaDeFicha> = {
  estado_her2: 'biomarcadores',
  receptores_hormonales: 'biomarcadores',
  estadio: 'diagnostico',
};

/** Nombre legible del criterio del catálogo; una clave sin literal se muestra sin guiones bajos, nunca vacía. */
export function rotuloDeCriterio(clave: string): string {
  const { criterios } = mensajes().evidence.aplicabilidad;
  return Object.hasOwn(criterios, clave)
    ? criterios[clave as keyof typeof criterios]
    : clave.replaceAll('_', ' ');
}

/** Enlace a la sección de la ficha donde se registra el dato; sin sección propia, al encabezado de la ficha (D7). */
export function enlaceDeFichaParaCriterio(patientId: string, clave: string): string {
  return hrefDeFicha(patientId, ANCLA_POR_CRITERIO[clave]);
}
