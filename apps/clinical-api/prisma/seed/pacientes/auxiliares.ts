import type {
  AtributoSemilla,
  BiomarcadorSemilla,
  ExamenSemilla,
  GradacionSemilla,
} from './tipos.js';

/** Constructores de los pacientes semilla de US-254 (g)–(m): solo reducen la repetición, sin lógica clínica. */

/** Biomarcador cualitativo `relevante`; los cuantitativos (Ki-67, PSA) llevan su tipo, unidad y significado. */
export function biomarcador(
  clave: string,
  nombre: string,
  valor: string,
  resto: Partial<BiomarcadorSemilla> = {},
): BiomarcadorSemilla {
  return {
    clave,
    nombre,
    valor,
    unidad: null,
    tipoResultado: 'cualitativo',
    significadoClinico: 'relevante',
    ...resto,
  };
}

export function ki67(valor: string): BiomarcadorSemilla {
  return biomarcador('ki67', 'Ki-67', valor, { tipoResultado: 'cuantitativo' });
}

export function psa(clave: string, valor: string): BiomarcadorSemilla {
  return biomarcador(clave, 'PSA', valor, {
    unidad: 'ng/mL',
    tipoResultado: 'cuantitativo',
    significadoClinico: 'alterado',
  });
}

export function examen(
  clave: string,
  tipo: string,
  diasAntes: number,
  biomarcadores: readonly BiomarcadorSemilla[],
): ExamenSemilla {
  return { clave, tipo, diasAntes, biomarcadores };
}

export function nottingham(grado: number): GradacionSemilla {
  return { sistema: 'nottingham', grado };
}

export function gleasonEnBiopsia(
  patronPrimario: number,
  patronSecundario: number,
): GradacionSemilla {
  return {
    sistema: 'gleason_isup',
    patronPrimario,
    patronSecundario,
    muestra: { specimenType: 'biopsia', gradeScope: 'peor' },
  };
}

/** Atributo `estado_menopausico` (valores del catálogo de atributos) observado `diasAntes` de la fecha de referencia. */
export function estadoMenopausico(
  valor: 'premenopausica' | 'posmenopausica',
  diasAntes: number,
): AtributoSemilla {
  return { clave: 'estado-menopausico', atributo: 'estado_menopausico', valor, diasAntes };
}
