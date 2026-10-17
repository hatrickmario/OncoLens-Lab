/** Nivel de la lista de RN-23: A (salida generada y textos propios) o B (solo textos propios). */
export type Nivel = 'A' | 'B';

export type Idioma = 'es' | 'en';

export interface TerminoProhibido {
  id: string;
  idioma: Idioma;
  texto: string;
  formas?: string[];
  excepciones?: string[];
}

export interface PrefijoProhibido {
  id: string;
  idioma: Idioma;
  prefijo: string;
}

export interface ListaTerminos {
  version: string;
  normalizacion: string;
  nivelA: { aplicaA: string[]; terminos: TerminoProhibido[] };
  nivelB: { aplicaA: string[]; prefijos: PrefijoProhibido[]; terminos: TerminoProhibido[] };
  frasesPermitidas: { aplicaA: string[]; frases: string[] };
}

export interface Coincidencia {
  id: string;
  termino: string;
  nivel: Nivel;
}

export interface OpcionesDeVerificacion {
  niveles?: readonly Nivel[];
  permitirFrases?: boolean;
}
