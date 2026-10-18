"""``NliClassifier`` falso mínimo (US-231b AC-3): cumple el contrato del real; L1D-180 lo completa con FX-06a-b.

Resuelve los pares de FX-06a-c por tabla; un par desconocido es ``neutral`` con ``p_entailment`` baja, nunca ``None``.
"""

from __future__ import annotations

from app.application.ports import FalloDeInferencia, ParNli, ResultadoNli
from app.domain.nli import EtiquetaNli
from tests.support.inferencia_falsa import PARES_NLI_FX06AC

_P_ENTAILMENT: dict[EtiquetaNli, float] = {
    "entailment": 0.97,
    "neutral": 0.02,
    "contradiction": 0.01,
}


class NliFalso:
    version = "nli-test@1"

    def __init__(self, error: Exception | None = None) -> None:
        self.error = error
        self.lotes: list[list[ParNli]] = []
        self._tabla: dict[tuple[str, str], EtiquetaNli] = {
            (premisa, hipotesis): clase
            for premisa, hipotesis, clase in PARES_NLI_FX06AC  # type: ignore[misc]
        }

    @property
    def invocaciones(self) -> int:
        return len(self.lotes)

    def clasificar(self, pares: list[ParNli]) -> list[ResultadoNli]:
        if not pares:
            return []
        self.lotes.append(list(pares))
        if self.error is not None:
            raise FalloDeInferencia("nli falso: fallo del modelo")
        return [self._resultado_de(par) for par in pares]

    def _resultado_de(self, par: ParNli) -> ResultadoNli:
        clase = self._tabla.get((par.premisa, par.hipotesis), "neutral")
        return ResultadoNli(label=clase, p_entailment=_P_ENTAILMENT[clase])
