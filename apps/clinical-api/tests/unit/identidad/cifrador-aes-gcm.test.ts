import { describe, expect, it } from 'vitest';
import {
  aadDeCampo,
  crearCifradorAesGcm,
  type ContextoDeCampo,
} from '../../../src/infrastructure/crypto/cifrador-aes-gcm.js';
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
    const cifrador = crearCifradorAesGcm({ anillo: anilloDeTest(), generarNonce: nonceSecuencial() });

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
    const cifrador = crearCifradorAesGcm({ anillo: anilloDeTest(), generarNonce: nonceSecuencial() });

    const primero = cifrador.cifrar('igual', CONTEXTO).blob;
    const segundo = cifrador.cifrar('igual', CONTEXTO).blob;

    expect(primero.equals(segundo)).toBe(false);
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
