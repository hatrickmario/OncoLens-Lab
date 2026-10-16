"""Configuración de rag-orchestrator (RN-22): todo valor a calibrar viene del entorno."""

from pathlib import Path
from typing import Literal, Self

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

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
    fake_responses_path: Path = Path("/contracts/examples")

    @model_validator(mode="after")
    def _rechazar_fake_con_datos_reales(self) -> Self:
        reject_fake_provider_with_real_data(
            self.llm_provider, self.real_anonymized_enabled, self.real_identified_enabled
        )
        return self
