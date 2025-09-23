"""Logging configuration and utilities."""

import logging
import logging.handlers
import sys
from pathlib import Path
from typing import Any

from system_trading.config.settings import settings


def setup_logging() -> None:
    """Setup application logging configuration."""
    # Create logs directory if it doesn't exist
    if settings.log_file:
        log_path = Path(settings.log_file)
        log_path.parent.mkdir(parents=True, exist_ok=True)

    # Configure root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, settings.log_level.upper()))

    # Clear existing handlers
    root_logger.handlers.clear()

    # Create formatter
    formatter = logging.Formatter(
        fmt="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    # Console handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(getattr(logging, settings.log_level.upper()))
    console_handler.setFormatter(formatter)
    root_logger.addHandler(console_handler)

    # File handler (if log file is specified)
    if settings.log_file:
        file_handler = logging.handlers.RotatingFileHandler(
            filename=settings.log_file,
            maxBytes=50 * 1024 * 1024,  # 50MB
            backupCount=5,
            encoding="utf-8",
        )
        file_handler.setLevel(getattr(logging, settings.log_level.upper()))
        file_handler.setFormatter(formatter)
        root_logger.addHandler(file_handler)

    # Set levels for third-party libraries
    logging.getLogger("uvicorn").setLevel(logging.INFO)
    logging.getLogger("fastapi").setLevel(logging.INFO)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    logging.getLogger("ccxt").setLevel(logging.WARNING)

    # Log the configuration
    logger = logging.getLogger(__name__)
    logger.info(
        "Logging configured - Level: %s, File: %s",
        settings.log_level,
        settings.log_file,
    )


class ContextFilter(logging.Filter):
    """Add context information to log records."""

    def __init__(self, context: dict[str, Any]) -> None:
        """Initialize context filter.

        Args:
            context: Context dictionary to add to log records.
        """
        super().__init__()
        self.context = context

    def filter(self, record: logging.LogRecord) -> bool:
        """Add context to log record."""
        for key, value in self.context.items():
            setattr(record, key, value)
        return True


def get_logger_with_context(
    name: str, context: dict[str, Any] | None = None
) -> logging.Logger:
    """Get logger with additional context.

    Args:
        name: Logger name.
        context: Additional context to include in logs.

    Returns:
        Configured logger.
    """
    logger = logging.getLogger(name)

    if context:
        logger.addFilter(ContextFilter(context))

    return logger


class TradingLogger:
    """Specialized logger for trading operations."""

    def __init__(self, name: str) -> None:
        """Initialize trading logger.

        Args:
            name: Logger name.
        """
        self.logger = logging.getLogger(name)

    def trade_executed(
        self,
        symbol: str,
        side: str,
        amount: float,
        price: float,
        exchange: str,
    ) -> None:
        """Log trade execution."""
        self.logger.info(
            "TRADE_EXECUTED: %s %s %s @ %s on %s",
            side,
            amount,
            symbol,
            price,
            exchange,
            extra={
                "event_type": "trade_executed",
                "symbol": symbol,
                "side": side,
                "amount": amount,
                "price": price,
                "exchange": exchange,
            },
        )

    def signal_generated(
        self,
        strategy: str,
        symbol: str,
        side: str,
        strength: float,
        confidence: float,
    ) -> None:
        """Log signal generation."""
        self.logger.info(
            "SIGNAL_GENERATED: %s - %s %s (strength=%.2f, confidence=%.2f)",
            strategy,
            side,
            symbol,
            strength,
            confidence,
            extra={
                "event_type": "signal_generated",
                "strategy": strategy,
                "symbol": symbol,
                "side": side,
                "strength": strength,
                "confidence": confidence,
            },
        )

    def portfolio_update(
        self,
        total_value: float,
        pnl: float,
        positions_count: int,
    ) -> None:
        """Log portfolio update."""
        self.logger.info(
            "PORTFOLIO_UPDATE: Value=%s, P&L=%s, Positions=%d",
            total_value,
            pnl,
            positions_count,
            extra={
                "event_type": "portfolio_update",
                "total_value": total_value,
                "pnl": pnl,
                "positions_count": positions_count,
            },
        )

    def error_occurred(
        self,
        error_type: str,
        error_message: str,
        context: dict[str, Any] | None = None,
    ) -> None:
        """Log error with context."""
        self.logger.error(
            "ERROR: %s - %s",
            error_type,
            error_message,
            extra={
                "event_type": "error",
                "error_type": error_type,
                "error_message": error_message,
                **(context or {}),
            },
        )

    def strategy_performance(
        self,
        strategy: str,
        symbol: str,
        win_rate: float,
        total_trades: int,
        profit_factor: float,
    ) -> None:
        """Log strategy performance."""
        self.logger.info(
            "STRATEGY_PERFORMANCE: %s on %s - WinRate=%.2f%%, Trades=%d, PF=%.2f",
            strategy,
            symbol,
            win_rate * 100,
            total_trades,
            profit_factor,
            extra={
                "event_type": "strategy_performance",
                "strategy": strategy,
                "symbol": symbol,
                "win_rate": win_rate,
                "total_trades": total_trades,
                "profit_factor": profit_factor,
            },
        )
