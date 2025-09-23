"""Base trading strategy class."""

from abc import ABC, abstractmethod
from typing import Any

import pandas as pd


class BaseStrategy(ABC):
    """Abstract base class for trading strategies."""

    def __init__(self, name: str, parameters: dict[str, Any] | None = None) -> None:
        """Initialize strategy with name and parameters.

        Args:
            name: Strategy name for identification.
            parameters: Strategy-specific parameters.
        """
        self.name = name
        self.parameters = parameters or {}
        self.is_active = False

    @abstractmethod
    def analyze(self, data: pd.DataFrame) -> dict[str, Any]:
        """Analyze market data and generate trading signals.

        Args:
            data: OHLCV market data.

        Returns:
            Analysis result containing signals and metadata.
        """
        pass

    @abstractmethod
    def should_buy(self, data: pd.DataFrame) -> bool:
        """Determine if strategy should generate buy signal.

        Args:
            data: OHLCV market data.

        Returns:
            True if buy signal should be generated.
        """
        pass

    @abstractmethod
    def should_sell(self, data: pd.DataFrame) -> bool:
        """Determine if strategy should generate sell signal.

        Args:
            data: OHLCV market data.

        Returns:
            True if sell signal should be generated.
        """
        pass

    def get_position_size(self, balance: float, current_price: float) -> float:
        """Calculate position size based on risk management.

        Args:
            balance: Available balance.
            current_price: Current asset price.

        Returns:
            Calculated position size.
        """
        risk_amount = balance * self.parameters.get("risk_percentage", 0.02)
        return risk_amount / current_price

    def start(self) -> None:
        """Start the strategy."""
        self.is_active = True

    def stop(self) -> None:
        """Stop the strategy."""
        self.is_active = False

    def __str__(self) -> str:
        """String representation of the strategy."""
        return f"{self.name} (active: {self.is_active})"
