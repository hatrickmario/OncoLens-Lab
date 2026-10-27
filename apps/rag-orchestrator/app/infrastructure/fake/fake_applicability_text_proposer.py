"""``ApplicabilityTextProposer`` del perfil ``LLM_PROVIDER=fake`` y de la suite ``evaluate``: nunca propone nada.

Cumple el contrato del adapter real (``tuple`` de propuestas, posiblemente vacía): todo criterio sin valor estructurado
queda ``desconocido`` con ``no_reportado_por_fuente`` (US-123 AC-4). La calidad del prompt real se mide en US-233.
"""

from collections.abc import Sequence

from app.domain.applicability_text import FuenteParaProponer, PropuestaDePoblacion


class ProponenteSilencioso:
    async def proponer(
        self, fuentes: Sequence[FuenteParaProponer]
    ) -> tuple[PropuestaDePoblacion, ...]:
        return ()
