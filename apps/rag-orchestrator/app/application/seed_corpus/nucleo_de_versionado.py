"""Núcleo común de versionado de la carga de la semilla y de la ingesta (US-117b, tarea 0).

``SeedCorpusLoader`` e ``IngestionPipelineService`` comparten cómo se apagan los chunks, cómo se retira la vigente de un grupo,
cómo se reconcilia un documento omitido y cómo se confirma la versión en el catálogo (RN-05: nada se borra). Cada servicio
conserva su política de errores por etapa; aquí solo viven los pasos idénticos. Las reglas puras están en
``domain/corpus_seed/versionado.py``.
"""

from __future__ import annotations

from collections.abc import Sequence

from app.application.ports import ChunkDelCorpus, Clock
from app.application.seed_corpus.ports import (
    ChunkStoreDeIngesta,
    CorpusCatalog,
    RegistroDeDocumento,
)
from app.application.seed_corpus.registros import registro_rechazado
from app.domain.corpus_seed.admisibilidad import Admision
from app.domain.corpus_seed.documento import DocumentoDeSemilla
from app.domain.corpus_seed.versionado import DecisionDeRetiro, DecisionDeVersion, decidir_retiro


class NucleoDeVersionado:
    def __init__(
        self, *, catalogo: CorpusCatalog, almacen_de_chunks: ChunkStoreDeIngesta, reloj: Clock
    ) -> None:
        self._catalogo = catalogo
        self._almacen_de_chunks = almacen_de_chunks
        self._reloj = reloj

    def planificar_retiro(self, documento: DocumentoDeSemilla) -> DecisionDeRetiro:
        """Qué retirar del grupo del documento rechazado (RN-21): la vigente y sus chunks, sin borrar nada."""
        return decidir_retiro(self._catalogo.versiones_del_grupo(documento.version_group_id))

    def apagar_chunks(self, document_ids: Sequence[str]) -> None:
        for document_id in document_ids:
            self._almacen_de_chunks.marcar_no_vigentes(document_id)

    def retirar_vigente_del_catalogo(self, retiro: DecisionDeRetiro) -> bool:
        """Marca no vigente la versión del grupo (después de apagar sus chunks); ``True`` si había una."""
        if retiro.vigente_id is None:
            return False
        self._catalogo.retirar_version(retiro.vigente_id, self._reloj.ahora())
        return True

    def registrar_rechazo(self, documento: DocumentoDeSemilla, admision: Admision) -> str | None:
        """Guarda la fila ``rechazado`` y devuelve el motivo para el reporte."""
        self._catalogo.guardar_documento(registro_rechazado(documento, self._reloj.ahora()))
        return admision.motivo.value if admision.motivo else None

    def reconciliar_omitido(self, decision: DecisionDeVersion) -> None:
        """Apaga los chunks que un fallo previo dejó vigentes y enciende los de la vigente del catálogo (RN-05)."""
        self.apagar_chunks(decision.a_apagar)
        if decision.a_encender is not None:
            self._almacen_de_chunks.marcar_vigentes(decision.a_encender)

    def escribir_y_apagar(
        self, chunks: Sequence[ChunkDelCorpus], decision: DecisionDeVersion
    ) -> None:
        """Chunks nuevos -> apagar los de ``decision.a_apagar``. Idempotente: escribe por ``chunk_id`` determinista."""
        self._almacen_de_chunks.upsert_chunks(chunks)
        self.apagar_chunks(decision.a_apagar)

    def confirmar_version(self, registro: RegistroDeDocumento, decision: DecisionDeVersion) -> bool:
        """Último paso: el catálogo es la verdad. ``True`` si reemplazó a una versión anterior (una sola transacción)."""
        if decision.anterior_id is None:
            self._catalogo.guardar_documento(registro)
            return False
        self._catalogo.reemplazar_version(registro, decision.anterior_id, self._reloj.ahora())
        return True
