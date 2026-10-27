"""Un chunk recuperado en esta consulta con la ficha de su documento: lo único que puede citarse (RN-01, RN-04)."""

from dataclasses import dataclass

from app.domain.citations import FichaDeFuente
from app.domain.relevance import ChunkPuntuado


@dataclass(frozen=True)
class ChunkCitable:
    chunk: ChunkPuntuado
    ficha: FichaDeFuente
