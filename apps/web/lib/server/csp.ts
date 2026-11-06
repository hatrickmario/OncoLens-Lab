// Sin `server-only`: lo importa `proxy.ts`, que corre en el runtime del proxy. Sin E/S ni secretos.

export type ModoCsp = 'aplicar' | 'solo_informe';

export interface OpcionesCsp {
  nonce: string;
  modo: ModoCsp;
  /** `next dev`: React Refresh necesita `eval`, y solo se permite en el modo `solo_informe`. */
  desarrollo: boolean;
}

export interface CabeceraCsp {
  nombre: 'Content-Security-Policy' | 'Content-Security-Policy-Report-Only';
  valor: string;
}

const BYTES_DEL_NONCE = 16;

/** CSP de US-216 (design D2). `style-src-attr 'unsafe-inline'` aceptado por el PO (P-1, S6 resp. 19); `script-src` nunca. */
export function construirCsp({ nonce, modo, desarrollo }: OpcionesCsp): CabeceraCsp {
  const evalDeDesarrollo = modo === 'solo_informe' && desarrollo ? " 'unsafe-eval'" : '';
  const directivas = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${evalDeDesarrollo}`,
    `style-src 'self' 'nonce-${nonce}'`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  return {
    nombre:
      modo === 'solo_informe' ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy',
    valor: directivas.join('; '),
  };
}

/** 16 bytes aleatorios en base64: uno nuevo por request. El proxy lo recibe inyectado para que los tests lo congelen. */
export function generarNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(BYTES_DEL_NONCE));
  return btoa(String.fromCharCode(...bytes));
}

/** `WEB_CSP_MODO` (RN-22): `aplicar` por defecto; `solo_informe` solo fuera de producción. Nunca imprime el valor recibido. */
export function leerModoCsp(entorno: Record<string, string | undefined>): ModoCsp {
  const valor = entorno['WEB_CSP_MODO'] ?? 'aplicar';
  if (valor !== 'aplicar' && valor !== 'solo_informe') {
    throw new Error('WEB_CSP_MODO debe ser "aplicar" o "solo_informe"');
  }
  if (valor === 'solo_informe' && entorno['NODE_ENV'] === 'production') {
    throw new Error('WEB_CSP_MODO=solo_informe no se admite en producción');
  }
  return valor;
}
