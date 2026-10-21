import { describe, expect, it } from 'vitest';
import {
  aadDeCampo,
  crearCifradorAesGcm,
  type ContextoDeCampo,
} from '../../../src/infrastructure/crypto/cifrador-aes-gcm.js';
import { IdentityIntegrityError } from '../../../src/infrastructure/crypto/identity-integrity-error.js';
import { anilloDeTest, nonceSecuencial } from '../../support/identidad.js';

const PACIENTE = '00000001-0000-4000-8000-000000000001';
const CONTEXTO: ContextoDeCampo = { patientId: PACIENTE, campo: 'national_id' };
const NONCE_FIJO = Buffer.alloc(12, 7);

describe('aadDeCampo', () => {
  it('liga paciente, campo y versión de clave', () => {
    expect(aadDeCampo(CONTEXTO, 2).toString('utf8')).toBe(`${PACIENTE}|national_id|2`);
  });
});

describe('CifradorDeCampos', () => {
  it('descifra al texto original cuando el contexto y la versión coinciden', () => {
    const cifrador = crearCifradorAesGcm({
      anillo: anilloDeTest(),
      generarNonce: nonceSecuencial(),
    });

    const { blob, keyVersion } = cifrador.cifrar('Lucía Rondón', CONTEXTO);

    expect(cifrador.descifrar(blob, CONTEXTO, keyVersion)).toBe('Lucía Rondón');
  });

  it('guarda nonce, texto cifrado y etiqueta en ese orden y usa la versión activa', () => {
    const cifrador = crearCifradorAesGcm({
      anillo: anilloDeTest(2, [1, 2]),
      generarNonce: () => NONCE_FIJO,
    });

    const { blob, keyVersion } = cifrador.cifrar('abc', CONTEXTO);

    expect(keyVersion).toBe(2);
    expect(blob.subarray(0, 12).equals(NONCE_FIJO)).toBe(true);
    expect(blob).toHaveLength(12 + Buffer.byteLength('abc') + 16);
  });

  it('produce textos cifrados distintos para el mismo valor cuando el nonce cambia', () => {
    const cifrador = crearCifradorAesGcm({
      anillo: anilloDeTest(),
      generarNonce: nonceSecuencial(),
    });

    const primero = cifrador.cifrar('igual', CONTEXTO).blob;
    const segundo = cifrador.cifrar('igual', CONTEXTO).blob;

    expect(primero.equals(segundo)).toBe(false);
  });

  describe.each([
    ['en el nonce', 0],
    ['en el texto cifrado', 12],
    ['en la etiqueta', -1],
  ])('con un byte alterado %s', (_donde, posicion) => {
    it('lanza IdentityIntegrityError sin texto del paciente', () => {
      const cifrador = crearCifradorAesGcm({
        anillo: anilloDeTest(),
        generarNonce: nonceSecuencial(),
      });
      const { blob, keyVersion } = cifrador.cifrar('Lucía Rondón', CONTEXTO);
      const alterado = Buffer.from(blob);
      const indice = posicion < 0 ? alterado.length + posicion : posicion;
      alterado[indice] = (alterado[indice] ?? 0) ^ 1;

      const descifrar = () => cifrador.descifrar(alterado, CONTEXTO, keyVersion);

      expect(descifrar).toThrow(IdentityIntegrityError);
      expect(descifrar).toThrow('IDENTITY_INTEGRITY_ERROR');
    });
  });

  it.each([
    ['otro paciente', { patientId: '00000001-0000-4000-8000-000000000002', campo: 'national_id' }],
    ['otro campo', { patientId: PACIENTE, campo: 'full_name' }],
  ] as const)(
    'lanza IdentityIntegrityError cuando el texto cifrado se traslada a %s',
    (_caso, otroContexto) => {
      const cifrador = crearCifradorAesGcm({
        anillo: anilloDeTest(),
        generarNonce: nonceSecuencial(),
      });
      const { blob, keyVersion } = cifrador.cifrar('valor', CONTEXTO);

      expect(() => cifrador.descifrar(blob, otroContexto, keyVersion)).toThrow(
        IdentityIntegrityError,
      );
    },
  );

  it('lanza IdentityIntegrityError cuando la versión de clave no está configurada', () => {
    const cifrador = crearCifradorAesGcm({
      anillo: anilloDeTest(),
      generarNonce: nonceSecuencial(),
    });
    const { blob } = cifrador.cifrar('valor', CONTEXTO);

    expect(() => cifrador.descifrar(blob, CONTEXTO, 7)).toThrow(IdentityIntegrityError);
  });

  it('lanza IdentityIntegrityError cuando el blob es más corto que nonce y etiqueta', () => {
    const cifrador = crearCifradorAesGcm({
      anillo: anilloDeTest(),
      generarNonce: nonceSecuencial(),
    });

    expect(() => cifrador.descifrar(Buffer.alloc(10), CONTEXTO, 1)).toThrow(IdentityIntegrityError);
  });

  it('descifra con la clave de la versión anterior cuando la activa es otra', () => {
    const v1 = crearCifradorAesGcm({ anillo: anilloDeTest(1), generarNonce: nonceSecuencial() });
    const v2 = crearCifradorAesGcm({
      anillo: anilloDeTest(2, [1, 2]),
      generarNonce: nonceSecuencial(),
    });
    const antiguo = v1.cifrar('v1', CONTEXTO);

    expect(v2.descifrar(antiguo.blob, CONTEXTO, antiguo.keyVersion)).toBe('v1');
  });
});
