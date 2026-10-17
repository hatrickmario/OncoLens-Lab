import { zLoginBody } from '../../../../../packages/api-contracts/src/zod/clinical-api/zod.gen.js';

/**
 * Cuerpo del login: el schema se genera del spec (variante *Writable*, la que lleva `password` por ser `writeOnly`).
 * El spec no expresa más validaciones de dominio para el login.
 */
export const loginSchema = zLoginBody;

export const NOMBRE_COOKIE_DE_SESION = 'oncolens_session';
