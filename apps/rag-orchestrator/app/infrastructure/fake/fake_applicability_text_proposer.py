"""``PoblacionTask`` del perfil ``LLM_PROVIDER=fake`` y de la suite ``evaluate``: nunca propone nada.

Cumple el contrato del adapter real (``tuple`` de propuestas, posiblemente vacía): todo criterio ``pendiente`` queda
``desconocido`` con ``no_reportado_por_fuente``. La calidad del prompt real se mide en US-233b.
"""

from app.domain.applicability_text import FuenteParaProponer, PropuestaDePoblacion


class ProponenteSilencioso:
    async def proponer(self, fuente: FuenteParaProponer) -> tuple[PropuestaDePoblacion, ...]:
        return ()
