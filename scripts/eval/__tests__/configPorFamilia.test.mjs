/**
 * La configuración de la CI que el envoltorio `evaluate` elige por familia (US-072, US-132, US-140, US-271, US-276): sin
 * `--config`, la familia `opciones` usa `opciones-fake.yaml`, `diagnostico` `diagnostico-fake.yaml`, `contextual`
 * `contextual-fake.yaml`, `aplicabilidad` la suya y las demás `test-fake.yaml`.
 */
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { argumentosDePython } from '../evaluate.mjs';

const configDe = (argumentos) => {
  const python = argumentosDePython(argumentos, '/trabajo', {});
  return python[python.indexOf('--config') + 1];
};

describe('envoltorio evaluate', () => {
  it('usa opciones-fake.yaml cuando la familia es opciones y no se pasa --config [US-140 AC-6]', () => {
    expect(configDe(['--suite', 'opciones'])).toBe(path.join('eval', 'configs', 'opciones-fake.yaml'));
  });

  it('usa diagnostico-fake.yaml cuando la familia es diagnostico y no se pasa --config [US-276 AC-1]', () => {
    expect(configDe(['--suite', 'diagnostico'])).toBe(path.join('eval', 'configs', 'diagnostico-fake.yaml'));
  });

  it('usa contextual-fake.yaml cuando la familia es contextual y no se pasa --config [US-271 AC-9]', () => {
    expect(configDe(['--suite', 'contextual'])).toBe(path.join('eval', 'configs', 'contextual-fake.yaml'));
  });

  it('respeta --config cuando se pasa explícito, también con la familia contextual [US-271 AC-9]', () => {
    const python = argumentosDePython(['--suite', 'contextual', '--config', 'eval/configs/contextual-local.yaml'], '/trabajo', {});

    expect(python.filter((a) => a === '--config')).toHaveLength(1);
    expect(python).toContain(path.resolve('/trabajo', 'eval/configs/contextual-local.yaml'));
  });

  it('usa test-aplicabilidad.yaml cuando la familia es aplicabilidad [US-132]', () => {
    expect(configDe(['--suite', 'aplicabilidad'])).toBe(path.join('eval', 'configs', 'test-aplicabilidad.yaml'));
  });

  it('usa test-fake.yaml cuando la familia es all o no se indica [US-072]', () => {
    expect(configDe(['--suite', 'all'])).toBe(path.join('eval', 'configs', 'test-fake.yaml'));
    expect(configDe([])).toBe(path.join('eval', 'configs', 'test-fake.yaml'));
  });

  it('respeta --config cuando se pasa explícito, también con la familia diagnostico [US-276]', () => {
    const python = argumentosDePython(['--suite', 'diagnostico', '--config', 'eval/configs/diagnostico-local.yaml'], '/trabajo', {});

    expect(python.filter((a) => a === '--config')).toHaveLength(1);
    expect(python).toContain(path.resolve('/trabajo', 'eval/configs/diagnostico-local.yaml'));
  });

  it('respeta --config cuando se pasa explícito, también con la familia opciones [US-140]', () => {
    const python = argumentosDePython(['--suite', 'opciones', '--config', 'eval/configs/s5.yaml'], '/trabajo', {});

    expect(python.filter((a) => a === '--config')).toHaveLength(1);
    expect(python).toContain(path.resolve('/trabajo', 'eval/configs/s5.yaml'));
  });
});
