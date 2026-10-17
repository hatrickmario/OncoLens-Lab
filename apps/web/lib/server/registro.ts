import 'server-only';

/** Línea de log del BFF: nunca lleva cuerpo, pregunta, cookie, respuesta ni el Origin recibido (design D6). */
export interface LineaDeRegistro {
  event: string;
  status: number;
  traceId?: string;
  duracionMs?: number;
  /** X-Trace-Id que devolvió clinical-api, cuando hubo respuesta (el `traceId` es el propio del BFF). */
  traceIdClinicalApi?: string;
  motivo?:
    | 'origen'
    | 'cuerpo_excesivo'
    | 'clinical_api_inalcanzable'
    | 'cuerpo_cortado'
    | 'error_no_json'
    | 'cuerpo_no_conforme'
    | 'content_type'
    | 'sin_cookie_de_sesion';
}

export type Registrar = (linea: LineaDeRegistro) => void;

export const registrarEnConsola: Registrar = (linea) => {
  console.info(JSON.stringify(linea));
};
