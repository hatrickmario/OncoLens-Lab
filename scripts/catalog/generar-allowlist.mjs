#!/usr/bin/env node
/**
 * Genera `packages/clinical-catalogs/validator/modelo.allowlist.json` desde el DMMF de Prisma (L1D-93 D3, RN-29): la
 * lista de entidades, campos y relaciones a las que un catálogo puede apuntar. No se escribe a mano: un cambio del
 * modelo cambia el archivo regenerado y `--check` (CI) falla hasta que se commitee.
 *
 *   node scripts/catalog/generar-allowlist.mjs            escribe el archivo
 *   node scripts/catalog/generar-allowlist.mjs --check    falla si el commiteado difiere del regenerado
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import internals from '@prisma/internals';

const RAIZ = path.resolve(import.meta.dirname, '../..');
export const RUTA_MODELO = path.join(RAIZ, 'apps/clinical-api/prisma/schema.prisma');
export const RUTA_ALLOWLIST = path.join(
  RAIZ,
  'packages/clinical-catalogs/validator/modelo.allowlist.json',
);

/**
 * Entidades clínicas a las que un catálogo puede apuntar (`[S3 resp. 16]`). Lista cerrada: identidad, cuentas,
 * auditoría y texto libre (`PatientIdentity`, `User`, `Session`, `AuditLog`, `ClinicalNote`) nunca entran (RN-10).
 */
export const ENTIDADES_CLINICAS = [
  'Diagnosis',
  'Exam',
  'Biomarker',
  'PriorTreatment',
  'ClinicalAttribute',
  'ClinicalEvent',
];

/**
 * Columnas que nunca son destino de un dato crítico (decisión conservadora de privacidad, `[S3 resp. 16]`): claves
 * foráneas (`*_id`), trazas de origen y de revisión, y texto libre que puede contener identidad. Lista cerrada.
 */
const COLUMNAS_DE_CONTROL = ['source_span', 'reviewed_by', 'recorded_by'];
const COLUMNAS_DE_TEXTO_LIBRE = { ClinicalEvent: ['description'] };
const esClaveForanea = (columna) => columna.endsWith('_id');

function esDestinoPermitido(entidad, columna) {
  return (
    !esClaveForanea(columna) &&
    !COLUMNAS_DE_CONTROL.includes(columna) &&
    !(COLUMNAS_DE_TEXTO_LIBRE[entidad] ?? []).includes(columna)
  );
}

const porNombre = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** Entidad permitida del DMMF: sus campos de columna (`dbName ?? name`) y sus relaciones hacia otra entidad permitida. */
function describirEntidad(modelo) {
  const campos = modelo.fields
    .filter((campo) => campo.kind !== 'object')
    .map((campo) => campo.dbName ?? campo.name)
    .filter((columna) => esDestinoPermitido(modelo.name, columna));
  const relaciones = modelo.fields
    .filter((campo) => campo.kind === 'object' && ENTIDADES_CLINICAS.includes(campo.type))
    .map((campo) => [campo.name, campo.type]);
  return {
    campos: campos.sort(porNombre),
    relaciones: Object.fromEntries(relaciones.sort(([a], [b]) => porNombre(a, b))),
  };
}

/** Allowlist del modelo Prisma `schemaPrisma` (texto). Una entidad de la lista que no está en el modelo rompe la generación. */
export async function generarAllowlist(schemaPrisma) {
  const { datamodel } = await internals.getDMMF({ datamodel: schemaPrisma });
  const entidades = {};
  for (const nombre of [...ENTIDADES_CLINICAS].sort(porNombre)) {
    const modelo = datamodel.models.find((candidato) => candidato.name === nombre);
    if (modelo === undefined) throw new Error(`la entidad ${nombre} ya no está en el modelo`);
    entidades[nombre] = describirEntidad(modelo);
  }
  return { entidades };
}

export const serializar = (allowlist) => `${JSON.stringify(allowlist, null, 2)}\n`;

async function main(argumentos) {
  const regenerada = serializar(await generarAllowlist(readFileSync(RUTA_MODELO, 'utf8')));
  if (argumentos.includes('--check')) {
    if (readFileSync(RUTA_ALLOWLIST, 'utf8') === regenerada) {
      console.log('catalog:allowlist:check — la allowlist commiteada coincide con el modelo');
      return 0;
    }
    console.error(
      'catalog:allowlist:check — la allowlist difiere del modelo: ejecuta node scripts/catalog/generar-allowlist.mjs',
    );
    return 1;
  }
  writeFileSync(RUTA_ALLOWLIST, regenerada);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
