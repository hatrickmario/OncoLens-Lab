import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { describe, expect, it } from 'vitest';
import { enmascararNombre } from '../../../src/modules/patients/patients.reglas.js';

/** El `pattern` que declara el contrato (fuente única), con las mismas banderas Unicode que usa el validador (Ajv2020). */
function patronDeFullNameMasked(): RegExp {
  const ruta = fileURLToPath(new URL('../../../openapi.yaml', import.meta.url));
  const spec = YAML.parse(readFileSync(ruta, 'utf8'));
  return new RegExp(spec.components.schemas.PatientListItem.properties.fullNameMasked.pattern, 'u');
}

describe('enmascararNombre frente al pattern de fullNameMasked', () => {
  it('cumple el pattern cuando el nombre es el sintético con número [US-213 AC-12]', () => {
    expect(enmascararNombre('Prueba Sintética 2')).toMatch(patronDeFullNameMasked());
  });

  it('cumple el pattern cuando el nombre tiene cuatro palabras', () => {
    expect(enmascararNombre('Lucía Fernanda Rondón Peña')).toMatch(patronDeFullNameMasked());
  });

  it('cumple el pattern cuando la inicial es un carácter fuera del plano básico', () => {
    const mascara = enmascararNombre('\u{1D4D0}na');

    expect(mascara).toBe('\u{1D4D0}.');
    expect(mascara).toMatch(patronDeFullNameMasked());
  });

  it('conserva la inicial original cuando su mayúscula ocupa más de un carácter (ß → SS)', () => {
    const mascara = enmascararNombre('ßeta Gamma');

    expect(mascara).toBe('ß. G.');
    expect(mascara).toMatch(patronDeFullNameMasked());
  });

  // Resultado observado (se reporta al orquestador, [S3 resp. 16]): sin palabras no hay iniciales y '' no cumple el
  // pattern. Latente: `exigirIdentidad` solo rechaza un nombre `undefined`, no uno vacío; hoy el alta no lo impide.
  // Deuda para la historia de altas (S6): `minLength` y `pattern` de `fullName` en el contrato.
  it('no cumple el pattern cuando el nombre está vacío, y es un caso latente del listado', () => {
    expect(enmascararNombre('   ')).toBe('');
    expect(enmascararNombre('   ')).not.toMatch(patronDeFullNameMasked());
  });
});
