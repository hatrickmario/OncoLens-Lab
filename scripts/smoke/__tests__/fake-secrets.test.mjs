import { execFileSync } from 'node:child_process';
import { createPrivateKey, createPublicKey, createSign, createVerify } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const RAIZ = path.resolve(import.meta.dirname, '../../..');
const SCRIPT = path.join(RAIZ, 'scripts/smoke/lib/fake-secrets.sh');
const temporal = mkdtempSync(path.join(os.tmpdir(), 'oncolens-fake-secrets-'));

afterAll(() => rmSync(temporal, { recursive: true, force: true }));

describe('fake-secrets.sh', () => {
  it('genera un par EC P-256 cuya clave pública corresponde a la privada y firma y verifica un ES256 de prueba cuando se ejecuta sobre un directorio temporal', () => {
    const destino = path.join(temporal, 'secretos');
    const salida = execFileSync(SCRIPT, [destino], { encoding: 'utf8' });

    const privadaPem = readFileSync(path.join(destino, 'jwt_service_private.pem'), 'utf8');
    const publicaPem = readFileSync(path.join(destino, 'jwt_service_public.pem'), 'utf8');

    const curva = execFileSync('openssl', ['ec', '-noout', '-text'], { input: privadaPem, encoding: 'utf8' });
    expect(curva).toMatch(/prime256v1|P-256/);

    const derivada = createPublicKey(createPrivateKey(privadaPem)).export({ type: 'spki', format: 'pem' });
    expect(derivada).toBe(publicaPem);

    const mensaje = 'cabecera.carga-sintetica';
    const firma = createSign('SHA256').update(mensaje).sign({ key: privadaPem, dsaEncoding: 'ieee-p1363' });
    expect(firma).toHaveLength(64);
    expect(createVerify('SHA256').update(mensaje).verify({ key: publicaPem, dsaEncoding: 'ieee-p1363' }, firma)).toBe(true);

    expect(salida).not.toContain('BEGIN');
  });

  it('genera un valor aleatorio no vacío para cada secreto declarado en el Compose y no lo imprime', () => {
    const destino = path.join(temporal, 'otros');
    const salida = execFileSync(SCRIPT, [destino], { encoding: 'utf8' });

    const archivos = readdirSync(destino);
    expect(archivos).toHaveLength(10);
    const aleatorios = archivos.filter((nombre) => !nombre.endsWith('.pem'));
    for (const nombre of aleatorios) {
      const valor = readFileSync(path.join(destino, nombre), 'utf8').trim();
      expect(valor).toMatch(/^[0-9a-f]{64}$/);
      expect(salida).not.toContain(valor);
    }
  });
});
