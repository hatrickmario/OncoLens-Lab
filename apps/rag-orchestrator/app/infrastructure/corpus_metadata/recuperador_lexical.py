"""Adapter de ``RecuperadorDeFragmentos`` sobre los fragmentos del propio documento (US-242, D2, D3).

El paso de metadatos corre antes de indexar, así que no hay Milvus que consultar: se puntúan en memoria los fragmentos que
la ingesta acaba de producir (mismos ``chunk_id`` que se indexarán). Nunca devuelve fragmentos de otro documento.
"""

from __future__ import annotations

from app.application.corpus_metadata.poblacion_puertos import DocumentoParaExtraer, Fragmento
from app.domain.corpus_metadata.poblacion_recuperacion import (
    indices_mas_relevantes,
    terminos_de_consulta,
)
from app.domain.criterios_aplicabilidad import CriterioDeAplicabilidad


class RecuperadorLexicalDeFragmentos:
    def todos(self, documento: DocumentoParaExtraer) -> tuple[Fragmento, ...]:
        return documento.fragmentos

    def relevantes(
        self, documento: DocumentoParaExtraer, criterio: CriterioDeAplicabilidad, k: int
    ) -> tuple[Fragmento, ...]:
        terminos = terminos_de_consulta(
            criterio.etiqueta_es,
            criterio.etiqueta_en,
            criterio.clave.replace("_", " "),
            criterio.clave_de_estudio.replace(".", " ").replace("_", " "),
        )
        indices = indices_mas_relevantes([f.texto for f in documento.fragmentos], terminos, k)
        return tuple(documento.fragmentos[i] for i in indices)
