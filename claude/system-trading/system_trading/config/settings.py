"""Application configuration settings."""

from pydantic import Field
from pydantic_settings import BaseSettings


class TradingSettings(BaseSettings):
    """Trading configuration settings."""

    # Binance Configuration
    binance_api_key: str = Field(..., description="Binance API key")
    binance_secret_key: str = Field(..., description="Binance secret key")
    binance_testnet: bool = Field(default=True, description="Use Binance testnet")

    # Upbit Configuration
    upbit_access_key: str = Field(..., description="Upbit access key")
    upbit_secret_key: str = Field(..., description="Upbit secret key")

    # Database Configuration
    database_url: str = Field(..., description="PostgreSQL database URL")
    redis_url: str = Field(default="redis://localhost:6379/0", description="Redis URL")

    # Trading Parameters
    default_quote_asset: str = Field(default="USDT", description="Default quote asset")
    max_position_size: float = Field(
        default=1000.0, description="Maximum position size"
    )
    risk_percentage: float = Field(
        default=0.02, description="Risk percentage per trade"
    )

    # Logging Configuration
    log_level: str = Field(default="INFO", description="Logging level")
    log_file: str | None = Field(default=None, description="Log file path")

    # FastAPI Configuration
    api_host: str = Field(default="127.0.0.1", description="API host")
    api_port: int = Field(default=8000, description="API port")
    api_debug: bool = Field(default=True, description="Debug mode")

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "extra": "forbid",
        "validate_assignment": True,
    }


# Global settings instance
settings = TradingSettings()
