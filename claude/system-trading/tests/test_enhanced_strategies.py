"""Tests for enhanced trading strategies."""

import numpy as np
import pandas as pd
import pytest

from system_trading.data.models import OrderSide
from system_trading.strategies.enhanced_ma_strategy import EnhancedMAStrategy
from system_trading.strategies.rsi_strategy import RSIStrategy


class TestEnhancedMAStrategy:
    """Test cases for EnhancedMAStrategy."""

    def test_strategy_initialization(self) -> None:
        """Test strategy initialization."""
        strategy = EnhancedMAStrategy(
            fast_ema=12,
            slow_ema=26,
            min_confidence=0.7,
        )

        assert strategy.name == "EnhancedMAStrategy"
        assert strategy.parameters["fast_ema"] == 12
        assert strategy.parameters["slow_ema"] == 26
        assert strategy.parameters["min_confidence"] == 0.7

    def test_insufficient_data(self) -> None:
        """Test strategy behavior with insufficient data."""
        strategy = EnhancedMAStrategy()

        # Create small dataset
        data = pd.DataFrame(
            {
                "open": [100] * 10,
                "high": [102] * 10,
                "low": [98] * 10,
                "close": [101] * 10,
                "volume": [1000] * 10,
            }
        )

        result = strategy.analyze(data)
        assert "error" in result

    def test_strategy_analysis(self) -> None:
        """Test strategy analysis with sufficient data."""
        strategy = EnhancedMAStrategy(fast_ema=5, slow_ema=10)

        # Create test data
        data = self._create_test_data(50)

        result = strategy.analyze(data)

        assert "fast_ema" in result
        assert "slow_ema" in result
        assert "macd" in result
        assert "rsi" in result
        assert "signal" in result
        assert "signal_strength" in result

    def test_buy_signal_generation(self) -> None:
        """Test buy signal generation."""
        strategy = EnhancedMAStrategy(min_confidence=0.3)

        # Create bullish test data
        data = self._create_bullish_data()

        buy_signal = strategy.should_buy(data)
        assert isinstance(buy_signal, bool)

    def test_sell_signal_generation(self) -> None:
        """Test sell signal generation."""
        strategy = EnhancedMAStrategy(min_confidence=0.3)

        # Create bearish test data
        data = self._create_bearish_data()

        sell_signal = strategy.should_sell(data)
        assert isinstance(sell_signal, bool)

    def test_signal_generation(self) -> None:
        """Test trading signal generation."""
        strategy = EnhancedMAStrategy(min_confidence=0.3)
        data = self._create_test_data(100)

        signal = strategy.generate_signal(data)

        if signal:
            assert signal.side in [OrderSide.BUY, OrderSide.SELL]
            assert 0 <= signal.strength <= 1
            assert 0 <= signal.confidence <= 1
            assert signal.strategy == "EnhancedMAStrategy"

    def _create_test_data(self, length: int) -> pd.DataFrame:
        """Create test OHLCV data."""
        np.random.seed(42)

        # Generate price data with some trend
        base_price = 100
        price_changes = np.random.normal(0, 0.02, length)
        prices = [base_price]

        for change in price_changes:
            new_price = prices[-1] * (1 + change)
            prices.append(new_price)

        prices = prices[1:]  # Remove the base price

        # Create OHLCV data
        data = []
        for i, close in enumerate(prices):
            high = close * (1 + abs(np.random.normal(0, 0.01)))
            low = close * (1 - abs(np.random.normal(0, 0.01)))
            open_price = prices[i - 1] if i > 0 else close
            volume = np.random.uniform(1000, 10000)

            data.append(
                {
                    "open": open_price,
                    "high": max(open_price, high, close),
                    "low": min(open_price, low, close),
                    "close": close,
                    "volume": volume,
                }
            )

        return pd.DataFrame(data)

    def _create_bullish_data(self) -> pd.DataFrame:
        """Create bullish trending data."""
        length = 50
        base_price = 100
        trend = 0.001  # 0.1% upward trend per period

        prices = []
        for i in range(length):
            price = base_price * (1 + trend) ** i
            noise = np.random.normal(0, 0.005)
            prices.append(price * (1 + noise))

        data = []
        for i, close in enumerate(prices):
            open_price = prices[i - 1] if i > 0 else close
            high = close * 1.01
            low = close * 0.99
            volume = np.random.uniform(1000, 10000)

            data.append(
                {
                    "open": open_price,
                    "high": high,
                    "low": low,
                    "close": close,
                    "volume": volume,
                }
            )

        return pd.DataFrame(data)

    def _create_bearish_data(self) -> pd.DataFrame:
        """Create bearish trending data."""
        length = 50
        base_price = 100
        trend = -0.001  # 0.1% downward trend per period

        prices = []
        for i in range(length):
            price = base_price * (1 + trend) ** i
            noise = np.random.normal(0, 0.005)
            prices.append(price * (1 + noise))

        data = []
        for i, close in enumerate(prices):
            open_price = prices[i - 1] if i > 0 else close
            high = close * 1.01
            low = close * 0.99
            volume = np.random.uniform(1000, 10000)

            data.append(
                {
                    "open": open_price,
                    "high": high,
                    "low": low,
                    "close": close,
                    "volume": volume,
                }
            )

        return pd.DataFrame(data)


class TestRSIStrategy:
    """Test cases for RSIStrategy."""

    def test_strategy_initialization(self) -> None:
        """Test strategy initialization."""
        strategy = RSIStrategy(
            rsi_period=14,
            oversold_level=30,
            overbought_level=70,
        )

        assert strategy.name == "RSIStrategy"
        assert strategy.parameters["rsi_period"] == 14
        assert strategy.parameters["oversold_level"] == 30
        assert strategy.parameters["overbought_level"] == 70

    def test_insufficient_data(self) -> None:
        """Test strategy behavior with insufficient data."""
        strategy = RSIStrategy()

        # Create small dataset
        data = pd.DataFrame(
            {
                "open": [100] * 5,
                "high": [102] * 5,
                "low": [98] * 5,
                "close": [101] * 5,
                "volume": [1000] * 5,
            }
        )

        result = strategy.analyze(data)
        assert "error" in result

    def test_rsi_calculation(self) -> None:
        """Test RSI calculation."""
        strategy = RSIStrategy(rsi_period=14)

        # Create test data with known RSI pattern
        data = self._create_rsi_test_data()

        result = strategy.analyze(data)

        assert "rsi" in result
        assert 0 <= result["rsi"] <= 100

    def test_oversold_detection(self) -> None:
        """Test oversold condition detection."""
        strategy = RSIStrategy(oversold_level=30)

        # Create oversold data
        data = self._create_oversold_data()

        result = strategy.analyze(data)

        assert "oversold" in result
        if result["rsi"] < 30:
            assert result["oversold"] is True

    def test_overbought_detection(self) -> None:
        """Test overbought condition detection."""
        strategy = RSIStrategy(overbought_level=70)

        # Create overbought data
        data = self._create_overbought_data()

        result = strategy.analyze(data)

        assert "overbought" in result
        if result["rsi"] > 70:
            assert result["overbought"] is True

    def test_divergence_detection(self) -> None:
        """Test divergence detection functionality."""
        strategy = RSIStrategy(divergence_lookback=10)

        # Create data with potential divergence
        data = self._create_divergence_data()

        result = strategy.analyze(data)

        assert "bullish_divergence" in result
        assert "bearish_divergence" in result
        assert isinstance(result["bullish_divergence"], bool)
        assert isinstance(result["bearish_divergence"], bool)

    def _create_rsi_test_data(self) -> pd.DataFrame:
        """Create test data for RSI calculation."""
        # Create data that should produce known RSI values
        prices = [
            44,
            44.34,
            44.09,
            44.15,
            43.61,
            44.33,
            44.83,
            45.85,
            46.08,
            45.89,
            46.03,
            46.83,
            47.69,
            46.49,
            46.26,
            47.09,
            46.66,
            46.80,
            46.23,
            46.38,
            46.57,
            45.41,
            46.28,
            46.28,
            46.00,
            46.03,
            46.41,
            46.22,
            45.64,
            46.21,
        ]

        data = []
        for i, close in enumerate(prices):
            open_price = prices[i - 1] if i > 0 else close
            high = close * 1.002
            low = close * 0.998
            volume = 1000

            data.append(
                {
                    "open": open_price,
                    "high": high,
                    "low": low,
                    "close": close,
                    "volume": volume,
                }
            )

        return pd.DataFrame(data)

    def _create_oversold_data(self) -> pd.DataFrame:
        """Create data that should result in oversold RSI."""
        # Create declining prices to generate low RSI
        base_price = 100
        prices = []

        for i in range(30):
            decline = 0.98**i  # Gradual decline
            price = base_price * decline
            prices.append(price)

        data = []
        for i, close in enumerate(prices):
            open_price = prices[i - 1] if i > 0 else close
            high = close * 1.001
            low = close * 0.999
            volume = 1000

            data.append(
                {
                    "open": open_price,
                    "high": high,
                    "low": low,
                    "close": close,
                    "volume": volume,
                }
            )

        return pd.DataFrame(data)

    def _create_overbought_data(self) -> pd.DataFrame:
        """Create data that should result in overbought RSI."""
        # Create rising prices to generate high RSI
        base_price = 100
        prices = []

        for i in range(30):
            rise = 1.02**i  # Gradual rise
            price = base_price * rise
            prices.append(price)

        data = []
        for i, close in enumerate(prices):
            open_price = prices[i - 1] if i > 0 else close
            high = close * 1.001
            low = close * 0.999
            volume = 1000

            data.append(
                {
                    "open": open_price,
                    "high": high,
                    "low": low,
                    "close": close,
                    "volume": volume,
                }
            )

        return pd.DataFrame(data)

    def _create_divergence_data(self) -> pd.DataFrame:
        """Create data with potential divergence patterns."""
        # Create price pattern with divergence potential
        prices = []
        base_price = 100

        # First phase: decline
        for i in range(10):
            price = base_price - i * 2
            prices.append(price)

        # Small recovery
        for i in range(5):
            price = prices[-1] + i * 0.5
            prices.append(price)

        # Second decline (less severe - potential bullish divergence)
        for i in range(10):
            price = prices[-1] - i * 1
            prices.append(price)

        data = []
        for i, close in enumerate(prices):
            open_price = prices[i - 1] if i > 0 else close
            high = close * 1.01
            low = close * 0.99
            volume = 1000

            data.append(
                {
                    "open": open_price,
                    "high": high,
                    "low": low,
                    "close": close,
                    "volume": volume,
                }
            )

        return pd.DataFrame(data)


if __name__ == "__main__":
    pytest.main([__file__])
