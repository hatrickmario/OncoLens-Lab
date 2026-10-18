"""``NliClassifier`` falso (FX-06a-b): cumple el contrato del real y lo completa L1D-180.

Resuelve cada par así: primero por la hipótesis (``resultados``), después por la tabla de FX-06a-c y, si el par es
desconocido, ``por_defecto`` (``neutral`` con ``p_entailment`` baja, nunca ``None``). Registra los pares recibidos y
puede lanzar el error del puerto. Como el real, una hipótesis más larga que ``max_length`` falla cerrado (en palabras);
una premisa larga no falla: el real la divide en ventanas.
"""

from __future__ import annotations

from collections.abc import Mapping

from app.application.ports import FalloDeInferencia, ParNli, ResultadoNli
from app.domain.nli import EtiquetaNli
from tests.support.inferencia_falsa import PARES_NLI_FX06AC

_P_ENTAILMENT: dict[EtiquetaNli, float] = {
    "entailment": 0.97,
    "neutral": 0.02,
    "contradiction": 0.01,
}

IMPLICA = ResultadoNli(label="entailment", p_entailment=_P_ENTAILMENT["entailment"])
NEUTRAL = ResultadoNli(label="neutral", p_entailment=_P_ENTAILMENT["neutral"])
CONTRADICE = ResultadoNli(label="contradiction", p_entailment=_P_ENTAILMENT["contradiction"])


class NliFalso:
    version = "nli-test@1"

    def __init__(
        self,
        error: Exception | None = None,
        *,
        resultados: Mapping[str, ResultadoNli] | None = None,
        por_defecto: ResultadoNli | None = None,
        max_length: int = 512,
    ) -> None:
        self.error = error
        self.max_length = max_length
        self.lotes: list[list[ParNli]] = []
        self._resultados = dict(resultados or {})
        self._por_defecto = por_defecto
        self._tabla: dict[tuple[str, str], EtiquetaNli] = {
            (premisa, hipotesis): clase
            for premisa, hipotesis, clase in PARES_NLI_FX06AC  # type: ignore[misc]
        }

    @property
    def invocaciones(self) -> int:
        return len(self.lotes)

    @property
    def pares_recibidos(self) -> list[ParNli]:
        return [par for lote in self.lotes for par in lote]

    def clasificar(self, pares: list[ParNli]) -> list[ResultadoNli]:
        if not pares:
            return []
        self.lotes.append(list(pares))
        if self.error is not None:
            raise FalloDeInferencia("nli falso: fallo del modelo")
        if any(len(par.hipotesis.split()) > self.max_length for par in pares):
            raise FalloDeInferencia("nli falso: una hipótesis supera NLI_MAX_LENGTH")
        return [self._resultado_de(par) for par in pares]

    def _resultado_de(self, par: ParNli) -> ResultadoNli:
        if par.hipotesis in self._resultados:
            return self._resultados[par.hipotesis]
        clase = self._tabla.get((par.premisa, par.hipotesis))
        if clase is not None:
            return ResultadoNli(label=clase, p_entailment=_P_ENTAILMENT[clase])
        return self._por_defecto or NEUTRAL
