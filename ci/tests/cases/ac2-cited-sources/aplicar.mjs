// Elimina EvidenceOption.citedSources (propiedad y requerida) del schema compartido que empaqueta rag-orchestrator.
import { readFileSync, writeFileSync } from 'node:fs';
import YAML from 'yaml';

const archivo = 'contracts/schemas/evidence.yaml';
const documento = YAML.parse(readFileSync(archivo, 'utf8'));
const opcion = documento.components.schemas.EvidenceOption;
delete opcion.properties.citedSources;
opcion.required = opcion.required.filter((nombre) => nombre !== 'citedSources');
writeFileSync(archivo, YAML.stringify(documento, { lineWidth: 0 }));
