"""Configuración de rag-orchestrator (RN-22): todo valor a calibrar viene del entorno."""

import os
from pathlib import Path
from typing import Any, Literal, Self

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.config.modelos import CLAVES_ADR39, ConfigModelos, cargar_config_modelos
from app.domain.reglas_proveedor import reject_fake_provider_with_real_data


class Settings(BaseSettings):
    model_config = SettingsConfigDict(extra="ignore", hide_input_in_errors=True)

    app_env: str = "local"
    llm_provider: Literal["local", "fake"] = "local"
    llm_base_url: str = "http://host.docker.internal:11434/v1"
    llm_model: str = ""
    llm_health_timeout_ms: int = Field(default=2000, gt=0)
    llm_cloud_enabled: bool = False
    real_anonymized_enabled: bool = False
    real_identified_enabled: bool = False
    # RN-21: CC BY-NC solo en el MVP académico; sin esta clave el cargador de datasets la rechaza.
    allow_cc_by_nc: bool = False
    fake_responses_path: Path = Path("/contracts/examples")
    # JWT de servicio (US-054): la vida máxima y la tolerancia de reloj se calibran; la clave pública es de L1D-165.
    service_jwt_ttl_seconds: int = Field(default=60, gt=0)
    service_jwt_clock_skew_seconds: int = Field(default=5, ge=0)
    service_jwt_public_key_file: Path | None = None
    # Modelos de recuperación y verificación (ADR-39): opcional; en producción no se exigen las claves de medición.
    modelos: ConfigModelos | None = None

    @model_validator(mode="before")
    @classmethod
    def _componer_modelos_desde_el_entorno(cls, datos: Any) -> Any:
        """Si el entorno trae alguna clave de ADR-39 se validan todas juntas; si no trae ninguna, ``modelos`` es None."""
        if (
            isinstance(datos, dict)
            and "modelos" not in datos
            and any(k in os.environ for k in CLAVES_ADR39)
        ):
            return {**datos, "modelos": cargar_config_modelos(os.environ)}
        return datos

    @model_validator(mode="after")
    def _rechazar_fake_con_datos_reales(self) -> Self:
        reject_fake_provider_with_real_data(
            self.llm_provider, self.real_anonymized_enabled, self.real_identified_enabled
        )
        return self
