import 'server-only';

/** Línea de log del BFF: nunca lleva cuerpo, pregunta, cookie, respuesta ni el Origin recibido (design D6). */
export interface LineaDeRegistro {
  event: string;
  status: number;
  traceId?: string;
  duracionMs?: number;
  motivo?: 'origen' | 'clinical_api_inalcanzable' | 'cuerpo_excesivo';
}

export type Registrar = (linea: LineaDeRegistro) => void;

export const registrarEnConsola: Registrar = (linea) => {
  console.info(JSON.stringify(linea));
};
