/** AC-3 [ADR-26, RN-02]: todo ejemplo del índice existe y valida contra el schema que declara; los huérfanos y los pendientes sin dueño fallan. */
import { reporter } from '../lib/findings.mjs';
import { createExampleValidator } from '../lib/validator.mjs';
import { resolvePointer } from '../lib/pointer.mjs';

const report = reporter('assertExamplesValid', 'AC-3');

function checkIndexIntegrity(examples) {
  const indexFile = `${examples.dir}/index.json`;
  const listed = new Set((examples.index.examples ?? []).map((entry) => entry.file));
  const orphans = (examples.listing ?? [])
    .filter((name) => name !== 'index.json' && !listed.has(name))
    .map((name) => report(`${examples.dir}/${name}`, '#', `el ejemplo no está listado en ${indexFile}`));
  const withoutOwner = (examples.index.pendingExamples ?? [])
    .filter((pending) => !pending.owner)
    .map((pending) => report(indexFile, pending.target, 'un pendingExample debe nombrar la historia dueña (owner)'));
  return [...orphans, ...withoutOwner];
}

function checkEntry(entry, examples, validator) {
  const file = `${examples.dir}/${entry.file}`;
  if (examples.errors?.[entry.file]) return [report(file, '#', examples.errors[entry.file])];
  if (examples.files?.[entry.file] === undefined) return [report(`${examples.dir}/index.json`, entry.file, 'el ejemplo del índice no existe')];
  const missingRequest = entry.request && examples.files?.[entry.request] === undefined;
  const found = missingRequest ? [report(file, '#', `la petición ${entry.request} del ejemplo no existe`)] : [];
  const verdict = validator.validate(entry, examples.files[entry.file]);
  if (verdict.error) return [...found, report(file, '#', verdict.error)];
  return [...found, ...verdict.problems.map((problem) => report(file, problem.path, `no cumple ${entry.target} de ${entry.spec}: ${problem.message}`))];
}

function checkPendingTargets(examples, specs) {
  return (examples.index.pendingExamples ?? [])
    .filter((pending) => !resolvePointer(specs[pending.spec]?.bundled ?? {}, pending.target))
    .map((pending) => report(`${examples.dir}/index.json`, pending.target, `el pendingExample apunta a algo que no existe en ${pending.spec}`));
}

export function assertExamplesValid(specs, examples) {
  if (!examples.index) return [report(`${examples.dir}/index.json`, '#', examples.indexError ?? 'index.json ausente')];
  const validator = createExampleValidator(specs);
  return [
    ...checkIndexIntegrity(examples),
    ...(examples.index.examples ?? []).flatMap((entry) => checkEntry(entry, examples, validator)),
    ...checkPendingTargets(examples, specs),
  ];
}
