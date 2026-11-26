"""Constructores del texto que se embebe por variante de ``CORPUS_CHUNK_CONTEXT`` (US-279, L1D-337, D3).

``ninguno`` y ``determinista`` no llaman a ningún modelo; la variante ``llm`` vive en ``contexto_llm.py``. El servicio de ingesta y la
reindexación reciben el constructor ya resuelto y no ramifican por variante. Ninguno guarda el prefijo: devuelven solo la entrada de
los codificadores (RN-04).
"""

from __future__ import annotations

from collections.abc import Sequence

from app.application.corpus_ingestion.contexto_llm import ConstructorConLlm
from app.application.corpus_ingestion.ports import (
    ConstructorDeContexto,
    GeneradorDeContextoDeChunk,
    ResultadoDeContexto,
)
from app.domain.corpus_seed.contexto_del_chunk import (
    MetadatosDelContexto,
    VarianteDeContexto,
    contexto_determinista,
    indices_pedidos,
    seccion_del_chunk,
    texto_a_embeber,
)


class ConstructorNinguno:
    """Variante ``ninguno``: el texto que se embebe es el original, tal cual."""

    def textos_a_embeber(
        self,
        metadatos: MetadatosDelContexto | None,
        fragmentos: Sequence[str],
        *,
        secciones: Sequence[str] | None = None,
        pendientes: Sequence[int] | None = None,
    ) -> ResultadoDeContexto:
        return ResultadoDeContexto(
            tuple(fragmentos[i] for i in indices_pedidos(fragmentos, pendientes))
        )


class ConstructorDeterminista:
    """Variante ``determinista``: prefijo con metadatos del catálogo y la sección, sin LLM."""

    def __init__(self, *, max_chars: int) -> None:
        self._max_chars = max_chars

    def textos_a_embeber(
        self,
        metadatos: MetadatosDelContexto | None,
        fragmentos: Sequence[str],
        *,
        secciones: Sequence[str] | None = None,
        pendientes: Sequence[int] | None = None,
    ) -> ResultadoDeContexto:
        return ResultadoDeContexto(
            tuple(
                texto_a_embeber(
                    contexto_determinista(
                        metadatos, seccion_del_chunk(secciones, i), self._max_chars
                    ),
                    fragmentos[i],
                )
                for i in indices_pedidos(fragmentos, pendientes)
            )
        )


def constructor_de_contexto(
    variante: VarianteDeContexto,
    *,
    max_chars: int,
    generador: GeneradorDeContextoDeChunk | None = None,
    doc_max_chars: int = 0,
    concurrencia: int = 1,
) -> ConstructorDeContexto:
    """El constructor de la variante: la única bifurcación por variante, en la raíz de composición (D3).

    ``generador``, ``doc_max_chars`` y ``concurrencia`` solo los usa ``llm``; sin generador esa variante no se puede construir."""
    if variante is VarianteDeContexto.NINGUNO:
        return ConstructorNinguno()
    if variante is VarianteDeContexto.DETERMINISTA:
        return ConstructorDeterminista(max_chars=max_chars)
    if generador is None:
        raise ValueError("la variante llm necesita un generador de contexto")
    return ConstructorConLlm(
        generador=generador,
        max_chars=max_chars,
        doc_max_chars=doc_max_chars,
        concurrencia=concurrencia,
    )
