import { describe, expect, it } from 'vitest';
import { normalizeText } from '../lib/text.mjs';
import { RULES } from '../rules/index.mjs';
import { patchedContracts, readCases, realContracts } from './helpers/parches.mjs';

const real = await realContracts();
const byName = Object.fromEntries(RULES.map((rule) => [rule.name, rule]));
const cases = readCases();

const title = (caso) => `${caso.esperado.sinHallazgos ? 'no reporta hallazgos' : 'reporta el hallazgo'} cuando ${caso.escenario} [US-033 ${caso.ac}]`;

/** ¿Algún hallazgo de la regla nombra el archivo, la ruta y el AC/RN esperados? */
function matches(findings, caso) {
  const expected = caso.esperado;
  return findings.some(
    (item) =>
      item.rule === caso.regla &&
      item.ref.includes(expected.ref ?? caso.ac) &&
      (!expected.archivo || item.file === expected.archivo) &&
      (!expected.rutaContiene || item.path.includes(expected.rutaContiene)) &&
      (!expected.mensajeContiene || normalizeText(item.message).includes(normalizeText(expected.mensajeContiene))),
  );
}

describe('reglas de contratos sobre los contratos reales', () => {
  it.each(RULES.map((rule) => [rule.name, rule]))('no reporta hallazgos cuando se revisan los contratos reales: %s [US-033]', (_name, rule) => {
    expect(rule(real.specs, real.examples, real.docs)).toEqual([]);
  });
});

describe('reglas de contratos con parches de mutación', () => {
  it.each(cases.map((caso) => [title(caso), caso]))('%s', (_title, caso) => {
    expect(byName[caso.regla], `la regla ${caso.regla} no existe`).toBeTypeOf('function');
    const mutated = patchedContracts(real, caso.parches);
    const findings = byName[caso.regla](mutated.specs, mutated.examples, mutated.docs);
    if (caso.esperado.sinHallazgos) expect(findings).toEqual([]);
    else expect(matches(findings, caso), JSON.stringify(findings.slice(0, 4), null, 1)).toBe(true);
  });
});
