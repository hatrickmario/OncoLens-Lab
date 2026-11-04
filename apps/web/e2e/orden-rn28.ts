import es from '../messages/es.json' with { type: 'json' };

const { aplicabilidad } = es.evidence;

export interface OpcionVisible {
  coincide: number;
  noComparable: boolean;
}

/** El número que sigue al estado en el rótulo del grupo de conteos; un rótulo ilegible lanza (nunca un `NaN` silencioso). */
function conteoDelRotulo(rotulo: string, patronDelEstado: string): number {
  const encontrado = new RegExp(`${patronDelEstado} (\\d+)`).exec(rotulo)?.[1];
  if (encontrado === undefined)
    throw new Error(`rótulo de aplicabilidad ilegible: «${rotulo}» no trae «${patronDelEstado}»`);
  return Number(encontrado);
}

/** Convierte el rótulo accesible de una tarjeta («Coincide 2, Parcial 0, …») y su etiqueta de no comparable en una opción. */
export function opcionDelRotulo(rotulo: string, noComparable: boolean): OpcionVisible {
  return { coincide: conteoDelRotulo(rotulo, `(?<!No )${aplicabilidad.coincide}`), noComparable };
}

/**
 * Orden RN-28 recalculado solo desde lo que la UI muestra. Es a propósito una tercera implementación, independiente de
 * `applicability_order` (servidor) y de la de `l1d-246` (`evaluate`): un oráculo que no comparte código con lo que verifica.
 * «Población no comparable» (≥ 1 excluyente en No coincide) nunca precede a una comparable; entre dos comparables
 * (0 excluyentes en ambas) los Coincide no aumentan. Entre dos no comparables la UI no muestra cuántos excluyentes hay.
 */
export function violacionesDeOrdenRn28(opciones: OpcionVisible[]): string[] {
  const violaciones: string[] = [];
  opciones.slice(1).forEach((siguiente, i) => {
    const previa = opciones[i]!;
    if (previa.noComparable && !siguiente.noComparable)
      violaciones.push(`la opción ${i + 1} no comparable precede a una comparable`);
    if (!previa.noComparable && !siguiente.noComparable && previa.coincide < siguiente.coincide)
      violaciones.push(`la opción ${i + 1} tiene menos Coincide que la ${i + 2}`);
  });
  return violaciones;
}

/** Con menos de 2 opciones el orden no se puede comprobar: el paso no es `ok`, es `no_verificable` (el gate no lo da por superado). */
export function estadoDelOrden(opciones: OpcionVisible[]): 'ok' | 'no_verificable' | 'fallo' {
  if (opciones.length < 2) return 'no_verificable';
  return violacionesDeOrdenRn28(opciones).length === 0 ? 'ok' : 'fallo';
}
