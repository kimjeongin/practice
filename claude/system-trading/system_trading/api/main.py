"""FastAPI main application."""

import logging
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from system_trading.api.routers import backtesting, market_data, trading, system
from system_trading.config.settings import settings

# Configure logging
log_format = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"

if settings.log_file:
    # Create log directory if it doesn't exist
    log_path = Path(settings.log_file)
    log_path.parent.mkdir(parents=True, exist_ok=True)

    logging.basicConfig(
        level=getattr(logging, settings.log_level),
        format=log_format,
        handlers=[
            logging.FileHandler(settings.log_file),
            logging.StreamHandler(),
        ],
    )
else:
    logging.basicConfig(
        level=getattr(logging, settings.log_level),
        format=log_format,
    )

logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title="System Trading API",
    description="Cryptocurrency trading system API with multi-exchange support",
    version="0.1.0",
    debug=settings.api_debug,
    docs_url="/docs",
    redoc_url="/redoc",
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(market_data.router)
app.include_router(trading.router)
app.include_router(backtesting.router)
app.include_router(system.router)

# Mount static files (for charts, exports, etc.)
static_dir = Path("static")
if static_dir.exists():
    app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/")
async def root() -> dict[str, str]:
    """Root endpoint."""
    return {
        "message": "System Trading API is running",
        "version": "0.1.0",
        "docs": "/docs",
        "health": "/health",
    }


@app.get("/health")
async def health_check() -> dict[str, str]:
    """Health check endpoint."""
    try:
        # Basic health checks
        from system_trading.exchanges.unified_client import UnifiedExchangeClient

        client = UnifiedExchangeClient()
        exchanges_status = {}

        for exchange_name, exchange_client in client.exchanges.items():
            try:
                # Simple connectivity check
                markets = exchange_client.load_markets()
                exchanges_status[exchange_name.value] = {
                    "status": "healthy",
                    "markets": len(markets),
                }
            except Exception as e:
                exchanges_status[exchange_name.value] = {
                    "status": "error",
                    "error": str(e),
                }

        return {
            "status": "healthy",
            "timestamp": datetime.now().isoformat(),
            "exchanges": exchanges_status,
        }

    except Exception as e:
        logger.error("Health check failed: %s", e)
        return {
            "status": "unhealthy",
            "error": str(e),
        }


@app.get("/info")
async def get_api_info() -> dict[str, Any]:
    """Get API information and available endpoints."""
    return {
        "title": "System Trading API",
        "version": "0.1.0",
        "description": "Cryptocurrency trading system with multi-exchange support",
        "features": [
            "Multi-exchange trading (Binance, Upbit)",
            "Real-time market data",
            "Portfolio management",
            "Advanced trading strategies",
            "Backtesting engine",
            "Risk management",
        ],
        "endpoints": {
            "market_data": "/api/market/*",
            "trading": "/api/trading/*",
            "backtesting": "/api/backtest/*",
        },
        "supported_exchanges": ["binance", "upbit"],
        "supported_strategies": ["moving_average", "enhanced_ma", "rsi"],
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "system_trading.api.main:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=settings.api_debug,
    )
