import 'server-only';

/** Línea de log del BFF: nunca lleva cuerpo, pregunta, cookie, respuesta ni el Origin recibido (design D6). */
export interface LineaDeRegistro {
  event: string;
  status: number;
  traceId?: string;
  duracionMs?: number;
  /**
   * Trace id de clinical-api, cuando hubo respuesta (el `traceId` es el propio del BFF). En el login sale del
   * campo `traceId` del cuerpo de error del contrato; en evidence-analyses sigue siendo la cabecera X-Trace-Id
   * hasta la decisión del usuario.
   */
  traceIdClinicalApi?: string;
  motivo?:
    | 'origen'
    | 'cuerpo_excesivo'
    | 'clinical_api_inalcanzable'
    | 'cuerpo_cortado'
    | 'error_no_json'
    // Status que el contrato no declara para la operación, o cuerpo que no cumple el schema de su status.
    | 'cuerpo_no_conforme'
    | 'content_type'
    | 'sin_cookie_de_sesion';
}

export type Registrar = (linea: LineaDeRegistro) => void;

export const registrarEnConsola: Registrar = (linea) => {
  console.info(JSON.stringify(linea));
};
