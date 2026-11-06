// Sin `server-only`: lo importa `proxy.ts`, que corre en el runtime del proxy. Sin E/S ni secretos.

export type ModoCsp = 'aplicar' | 'solo_informe';

export interface OpcionesCsp {
  nonce: string;
  modo: ModoCsp;
  desarrollo: boolean;
}

export interface CabeceraCsp {
  nombre: 'Content-Security-Policy' | 'Content-Security-Policy-Report-Only';
  valor: string;
}

export function construirCsp(_opciones: OpcionesCsp): CabeceraCsp {
  throw new Error('no implementado');
}

export function generarNonce(): string {
  throw new Error('no implementado');
}

export function leerModoCsp(_entorno: Record<string, string | undefined>): ModoCsp {
  throw new Error('no implementado');
}
