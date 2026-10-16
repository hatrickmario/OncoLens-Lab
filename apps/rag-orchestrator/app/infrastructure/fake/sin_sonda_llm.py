"""Sonda del LLM para `LLM_PROVIDER=fake`: no hay LLM que consultar, así que no lo consulta."""


class SinSondaLlm:
    async def esta_disponible(self) -> bool:
        return True
