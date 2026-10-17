"""Errores de la capa de aplicación que `app/api/errors.py` traduce a respuestas HTTP sin eco de la petición."""


class RecuperacionNoDisponibleError(Exception):
    """Milvus, el catálogo del corpus o el adapter de embeddings fallaron o no respondieron (`503 RETRIEVAL_UNAVAILABLE`).

    Sin reintento silencioso ni respuesta parcial. El mensaje nunca lleva el texto de la pregunta, un host ni un
    detalle del motor: solo el nombre de la etapa.
    """

    def __init__(self, etapa: str) -> None:
        self.etapa = etapa
        super().__init__(f"recuperación no disponible en la etapa {etapa}")


class TipoCancerNoRegistradoError(Exception):
    """El contexto clínico no trae un tipo de cáncer utilizable (`422 TIPO_CANCER_NO_REGISTRADO`, OL-02)."""


class LlmLocalNoDisponibleError(Exception):
    """El LLM local no está disponible o su salida no es válida (`503 LOCAL_LLM_UNAVAILABLE`)."""
