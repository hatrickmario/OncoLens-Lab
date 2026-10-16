import type { ServiceTokenSigner } from './service-jwt.js';

/**
 * Única lista de cabeceras que sobreviven del request del llamador: las de la operación del SDK.
 * Todo lo demás (Cookie, Origin, X-Forwarded-*, Authorization entrante) se descarta: la sesión del doctor
 * termina en clinical-api y nunca llega a rag-orchestrator.
 */
const CABECERAS_DE_LA_OPERACION = ['content-type', 'accept', 'x-request-deadline', 'x-trace-id'] as const;

export interface RagOrchestratorFetchOptions {
  baseUrl: string;
  signer: ServiceTokenSigner;
  fetch?: typeof globalThis.fetch;
}

/** Construye las cabeceras salientes desde cero: sin cabeceras entrantes, sin `Cookie`, con el Bearer de servicio. */
export function construirCabecerasSalientes(entrantes: Headers, token: string): Headers {
  const salientes = new Headers();
  for (const nombre of CABECERAS_DE_LA_OPERACION) {
    const valor = entrantes.get(nombre);
    if (valor !== null) salientes.set(nombre, valor);
  }
  salientes.set('authorization', `Bearer ${token}`);
  return salientes;
}

/**
 * `fetch` del cliente hacia rag-orchestrator: firma un JWT nuevo por request y reconstruye las cabeceras.
 * Se niega a enviar el token a un origen distinto de `baseUrl`.
 */
export function createRagOrchestratorFetch(options: RagOrchestratorFetchOptions): typeof globalThis.fetch {
  const { baseUrl, signer } = options;
  const origenPermitido = new URL(baseUrl).origin;
  return async (input, init) => {
    const peticion = new Request(input, init);
    if (new URL(peticion.url).origin !== origenPermitido) {
      throw new Error('El token de servicio solo se envía a rag-orchestrator');
    }
    const cabeceras = construirCabecerasSalientes(peticion.headers, await signer.sign());
    const enviar = options.fetch ?? globalThis.fetch;
    return enviar(new Request(peticion, { headers: cabeceras }));
  };
}
