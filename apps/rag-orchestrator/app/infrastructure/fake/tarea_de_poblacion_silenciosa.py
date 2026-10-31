"""``PoblacionTask`` del perfil ``LLM_PROVIDER=fake`` y de la suite ``evaluate``: nunca propone nada.

Cumple el contrato del adapter real (``tuple`` de propuestas, posiblemente vacía; una fuente y un único criterio por
llamada): todo criterio ``pendiente`` queda ``desconocido`` con ``no_reportado_por_fuente``. La calidad del prompt real
se mide en US-233b.
"""

from app.domain.applicability_text import (
    FuenteParaProponer,
    PropuestaDePoblacion,
    exigir_un_criterio,
)


class TareaDePoblacionSilenciosa:
    async def proponer(self, fuente: FuenteParaProponer) -> tuple[PropuestaDePoblacion, ...]:
        exigir_un_criterio(fuente)
        return ()
