import { z } from 'zod';
import { normalizarCorreo } from '../auth/correo.js';

/** Correo normalizado igual que en el login (misma regla, una sola función) y con forma de correo. */
export const correoSchema = z.string().transform(normalizarCorreo).pipe(z.email());

const rolSchema = z.string().min(1);

export const altaDeUsuarioSchema = z.object({
  email: correoSchema,
  rol: rolSchema,
  password: z.string().min(1),
});

export const cambioDeRolSchema = z.object({ email: correoSchema, rol: rolSchema });

export const bajaDeUsuarioSchema = z.object({ email: correoSchema });
