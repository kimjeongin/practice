"""Main entry point for the system trading application."""

import asyncio
import logging
import signal
import sys
from typing import Any

from system_trading.config.settings import settings
from system_trading.data.models import Exchange
from system_trading.data.database import init_database, close_database
from system_trading.engine.trading_engine import TradingEngine
from system_trading.strategies.enhanced_ma_strategy import EnhancedMAStrategy
from system_trading.strategies.rsi_strategy import RSIStrategy

logger = logging.getLogger(__name__)


class TradingApplication:
    """Main trading application."""

    def __init__(self) -> None:
        """Initialize trading application."""
        self.engine = TradingEngine()
        self.is_running = False

    async def setup_strategies(self) -> None:
        """Setup trading strategies."""
        logger.info("Setting up trading strategies")

        # Define trading symbols
        binance_symbols = ["BTC/USDT", "ETH/USDT", "BNB/USDT"]
        upbit_symbols = ["KRW-BTC", "KRW-ETH", "KRW-ADA"]

        # Add Enhanced MA Strategy
        enhanced_ma = EnhancedMAStrategy(
            fast_ema=12,
            slow_ema=26,
            signal_ema=9,
            rsi_period=14,
            min_confidence=0.6,
        )

        self.engine.add_strategy(
            name="enhanced_ma_binance",
            strategy=enhanced_ma,
            symbols=binance_symbols,
            exchanges=[Exchange.BINANCE],
        )

        self.engine.add_strategy(
            name="enhanced_ma_upbit",
            strategy=enhanced_ma,
            symbols=upbit_symbols,
            exchanges=[Exchange.UPBIT],
        )

        # Add RSI Strategy
        rsi_strategy = RSIStrategy(
            rsi_period=14,
            oversold_level=30,
            overbought_level=70,
            volume_confirmation=True,
        )

        self.engine.add_strategy(
            name="rsi_binance",
            strategy=rsi_strategy,
            symbols=binance_symbols,
            exchanges=[Exchange.BINANCE],
        )

        self.engine.add_strategy(
            name="rsi_upbit",
            strategy=rsi_strategy,
            symbols=upbit_symbols,
            exchanges=[Exchange.UPBIT],
        )

        logger.info("Strategies configured successfully")

    async def start(self) -> None:
        """Start the trading application."""
        logger.info("Starting System Trading Application")

        try:
            # Initialize database
            await init_database()
            logger.info("Database initialized successfully")

            # Setup strategies
            await self.setup_strategies()

            # Start trading engine
            self.is_running = True
            await self.engine.start()

        except Exception as e:
            logger.error("Failed to start trading application: %s", e)
            await self.stop()

    async def stop(self) -> None:
        """Stop the trading application."""
        if not self.is_running:
            return

        logger.info("Stopping trading application")
        self.is_running = False

        try:
            await self.engine.stop()
            await close_database()
            logger.info("Trading application stopped successfully")

        except Exception as e:
            logger.error("Error stopping trading application: %s", e)

    def setup_signal_handlers(self) -> None:
        """Setup signal handlers for graceful shutdown."""

        def signal_handler(signum: int, frame: Any) -> None:
            logger.info("Received signal %d, shutting down gracefully", signum)
            asyncio.create_task(self.stop())

        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)


async def run_api_server() -> None:
    """Run the FastAPI server."""
    import uvicorn

    config = uvicorn.Config(
        "system_trading.api.main:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=settings.api_debug,
        log_level=settings.log_level.lower(),
    )

    server = uvicorn.Server(config)
    await server.serve()


async def run_trading_engine() -> None:
    """Run the trading engine."""
    app = TradingApplication()
    app.setup_signal_handlers()
    await app.start()


async def main() -> None:
    """Main entry point."""
    logger.info("System Trading Application v0.1.0")
    logger.info(
        "Configuration: %s",
        {
            "api_host": settings.api_host,
            "api_port": settings.api_port,
            "log_level": settings.log_level,
            "binance_testnet": settings.binance_testnet,
        },
    )

    # Check command line arguments
    if len(sys.argv) > 1:
        mode = sys.argv[1]

        if mode == "api":
            logger.info("Starting API server only")
            await run_api_server()

        elif mode == "engine":
            logger.info("Starting trading engine only")
            await run_trading_engine()

        elif mode == "help":
            print("Usage: python main.py [mode]")
            print("Modes:")
            print("  api     - Run API server only")
            print("  engine  - Run trading engine only")
            print("  (none)  - Run both API server and trading engine")
            return

        else:
            logger.error("Unknown mode: %s", mode)
            return

    else:
        # Run both API server and trading engine
        logger.info("Starting both API server and trading engine")

        tasks = [
            asyncio.create_task(run_api_server()),
            asyncio.create_task(run_trading_engine()),
        ]

        try:
            await asyncio.gather(*tasks)
        except KeyboardInterrupt:
            logger.info("Received keyboard interrupt, shutting down")
            for task in tasks:
                task.cancel()


def cli_main() -> None:
    """CLI entry point."""
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Application terminated by user")
    except Exception as e:
        logger.error("Application failed: %s", e)
        sys.exit(1)


if __name__ == "__main__":
    cli_main()
