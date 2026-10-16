#!/usr/bin/env node
/**
 * AC-6 de US-036 (design.md D6): evalúa la protección de `main` a partir del JSON que arma check-branch-protection.sh:
 * `{ "protection": <branches/main/protection | null>, "rules": <rules/branches/main>, "rulesets": [<detalle de cada ruleset>] }`.
 * Exige PR obligatorio, el check requerido `ci-ok`, rama al día y sin bypass para administradores.
 * Lee el JSON de la entrada estándar; sale con 1 si falta alguna condición.
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const CHECK_REQUERIDO = 'ci-ok';

const reglaDe = (reglas, tipo) => (reglas ?? []).find((regla) => regla.type === tipo);

/** Contextos de checks requeridos por la protección clásica y por los rulesets. */
function checksRequeridos({ protection, rules }) {
  const clasica = protection?.required_status_checks;
  const delRuleset = reglaDe(rules, 'required_status_checks')?.parameters?.required_status_checks ?? [];
  return [...(clasica?.contexts ?? []), ...(clasica?.checks ?? []).map((check) => check.context), ...delRuleset.map((check) => check.context)];
}

/**
 * Las condiciones de AC-6 y si se cumplen.
 * @returns {{ condicion: string, cumple: boolean }[]}
 */
export function evaluarProteccion(respuesta) {
  const { protection, rules } = respuesta;
  const reglaCheck = reglaDe(rules, 'required_status_checks');
  return [
    {
      condicion: 'PR obligatorio antes de mergear',
      cumple: Boolean(protection?.required_pull_request_reviews) || Boolean(reglaDe(rules, 'pull_request')),
    },
    { condicion: `check requerido ${CHECK_REQUERIDO}`, cumple: checksRequeridos(respuesta).includes(CHECK_REQUERIDO) },
    {
      condicion: 'rama actualizada antes de mergear',
      cumple: protection?.required_status_checks?.strict === true || reglaCheck?.parameters?.strict_required_status_checks_policy === true,
    },
    {
      condicion: 'sin bypass para administradores',
      cumple: protection?.enforce_admins?.enabled === true || rulesetsActivosSinBypass(respuesta.rulesets),
    },
  ];
}

/** ¿Hay rulesets y todos están activos y sin actores con bypass? Sin rulesets no se puede afirmar nada. */
function rulesetsActivosSinBypass(rulesets) {
  return (rulesets ?? []).length > 0 && rulesets.every((ruleset) => ruleset.enforcement === 'active' && (ruleset.bypass_actors ?? []).length === 0);
}

function main() {
  const resultados = evaluarProteccion(JSON.parse(readFileSync(0, 'utf8')));
  resultados.forEach(({ condicion, cumple }) => console.log(`${cumple ? 'OK   ' : 'FALTA'} ${condicion}`));
  return resultados.every(({ cumple }) => cumple) ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
