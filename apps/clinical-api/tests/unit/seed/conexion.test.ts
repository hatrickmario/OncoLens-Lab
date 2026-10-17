import { describe, expect, it } from 'vitest';
import { conectarConTlsVerificado } from '../../../prisma/seed/conexion.js';

const ENTORNO_COMPLETO = {
  CLINICAL_DATABASE_URL: 'postgresql://clinical_api@127.0.0.1:1/oncolens',
  PG_CLINICAL_API_PASSWORD_FILE: '/run/secrets/pg_clinical_api_password',
  CLINICAL_DATABASE_CA_FILE: '/run/secrets/pg_ca.crt',
};

describe('conectarConTlsVerificado', () => {
  it('falla nombrando PG_CLINICAL_API_PASSWORD_FILE cuando falta la variable de la contraseña', async () => {
    const sinContrasena = { ...ENTORNO_COMPLETO, PG_CLINICAL_API_PASSWORD_FILE: undefined };

    await expect(
      conectarConTlsVerificado(
        sinContrasena,
        () => 'contenido',
        () => undefined,
      ),
    ).rejects.toThrow(/PG_CLINICAL_API_PASSWORD_FILE/);
  });

  it('falla nombrando CLINICAL_DATABASE_URL cuando la URL lleva contraseña', async () => {
    const env = { ...ENTORNO_COMPLETO, CLINICAL_DATABASE_URL: 'postgresql://clinical_api:x@h/db' };

    await expect(
      conectarConTlsVerificado(
        env,
        () => 'contenido',
        () => undefined,
      ),
    ).rejects.toThrow(/CLINICAL_DATABASE_URL/);
  });
});
