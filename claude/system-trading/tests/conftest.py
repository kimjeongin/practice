"""Pytest configuration and fixtures."""

from datetime import datetime
from decimal import Decimal

import numpy as np
import pandas as pd
import pytest

from system_trading.data.models import (
    Balance,
    Exchange,
    Order,
    OrderSide,
    OrderStatus,
    OrderType,
    Position,
    Trade,
)


@pytest.fixture
def sample_ohlcv_data() -> pd.DataFrame:
    """Create sample OHLCV data for testing."""
    np.random.seed(42)

    length = 100
    base_price = 50000
    price_changes = np.random.normal(0, 0.02, length)
    prices = [base_price]

    for change in price_changes:
        new_price = prices[-1] * (1 + change)
        prices.append(max(new_price, 1))

    prices = prices[1:]

    data = []
    for i, close in enumerate(prices):
        open_price = prices[i - 1] if i > 0 else close
        high = max(open_price, close) * (1 + abs(np.random.normal(0, 0.005)))
        low = min(open_price, close) * (1 - abs(np.random.normal(0, 0.005)))
        volume = np.random.uniform(100, 1000)

        data.append(
            {
                "open": open_price,
                "high": high,
                "low": low,
                "close": close,
                "volume": volume,
            }
        )

    df = pd.DataFrame(data)
    df.index = pd.date_range("2024-01-01", periods=length, freq="H")
    return df


@pytest.fixture
def sample_balance() -> Balance:
    """Create sample balance for testing."""
    return Balance(
        asset="USDT",
        free=Decimal("10000"),
        locked=Decimal("0"),
        total=Decimal("10000"),
        exchange=Exchange.BINANCE,
        timestamp=datetime.now(),
    )


@pytest.fixture
def sample_position() -> Position:
    """Create sample position for testing."""
    return Position(
        symbol="BTC/USDT",
        side=OrderSide.BUY,
        size=Decimal("0.1"),
        entry_price=Decimal("50000"),
        market_price=Decimal("51000"),
        unrealized_pnl=Decimal("100"),
        exchange=Exchange.BINANCE,
        timestamp=datetime.now(),
    )


@pytest.fixture
def sample_order() -> Order:
    """Create sample order for testing."""
    return Order(
        id="test_order_123",
        symbol="BTC/USDT",
        side=OrderSide.BUY,
        type=OrderType.MARKET,
        amount=Decimal("0.1"),
        price=Decimal("50000"),
        filled=Decimal("0"),
        remaining=Decimal("0.1"),
        status=OrderStatus.PENDING,
        timestamp=datetime.now(),
        exchange=Exchange.BINANCE,
    )


@pytest.fixture
def sample_trade() -> Trade:
    """Create sample trade for testing."""
    return Trade(
        id="trade_123",
        order_id="order_123",
        symbol="BTC/USDT",
        side=OrderSide.BUY,
        amount=Decimal("0.1"),
        price=Decimal("50000"),
        fee=Decimal("0.1"),
        fee_currency="USDT",
        timestamp=datetime.now(),
        exchange=Exchange.BINANCE,
    )


@pytest.fixture
def trending_up_data() -> pd.DataFrame:
    """Create upward trending test data."""
    length = 50
    base_price = 100
    trend = 0.002  # 0.2% upward trend per period

    prices = []
    for i in range(length):
        price = base_price * (1 + trend) ** i
        noise = np.random.normal(0, 0.01)
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

    df = pd.DataFrame(data)
    df.index = pd.date_range("2024-01-01", periods=length, freq="H")
    return df


@pytest.fixture
def trending_down_data() -> pd.DataFrame:
    """Create downward trending test data."""
    length = 50
    base_price = 100
    trend = -0.002  # 0.2% downward trend per period

    prices = []
    for i in range(length):
        price = base_price * (1 + trend) ** i
        noise = np.random.normal(0, 0.01)
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

    df = pd.DataFrame(data)
    df.index = pd.date_range("2024-01-01", periods=length, freq="H")
    return df


@pytest.fixture
def sideways_data() -> pd.DataFrame:
    """Create sideways/ranging test data."""
    length = 50
    base_price = 100

    prices = []
    for _ in range(length):
        # Add noise around base price
        noise = np.random.normal(0, 0.02)
        price = base_price * (1 + noise)
        prices.append(price)

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

    df = pd.DataFrame(data)
    df.index = pd.date_range("2024-01-01", periods=length, freq="H")
    return df


@pytest.fixture
def volatile_data() -> pd.DataFrame:
    """Create high volatility test data."""
    length = 50
    base_price = 100

    prices = []
    for i in range(length):
        # High volatility with larger price swings
        change = np.random.normal(0, 0.05)  # 5% volatility
        if i == 0:
            price = base_price
        else:
            price = prices[-1] * (1 + change)
        prices.append(max(price, 1))  # Ensure positive prices

    data = []
    for i, close in enumerate(prices):
        open_price = prices[i - 1] if i > 0 else close
        high = max(open_price, close) * 1.02
        low = min(open_price, close) * 0.98
        volume = np.random.uniform(5000, 50000)  # Higher volume

        data.append(
            {
                "open": open_price,
                "high": high,
                "low": low,
                "close": close,
                "volume": volume,
            }
        )

    df = pd.DataFrame(data)
    df.index = pd.date_range("2024-01-01", periods=length, freq="H")
    return df


@pytest.fixture(scope="session")
def test_config():
    """Test configuration settings."""
    return {
        "initial_cash": 10000.0,
        "commission": 0.001,
        "slippage": 0.001,
        "risk_percentage": 0.02,
        "max_position_size": 1000.0,
    }


class MockExchangeClient:
    """Mock exchange client for testing."""

    def __init__(self):
        self.balances = {}
        self.orders = {}
        self.trades = []

    async def get_balance(self, exchange):
        return self.balances.get(exchange, [])

    async def create_order(
        self, symbol, exchange, side, order_type, amount, price=None
    ):
        order_id = f"order_{len(self.orders)}"
        order = Order(
            id=order_id,
            symbol=symbol,
            side=side,
            type=order_type,
            amount=amount,
            price=price,
            filled=Decimal("0"),
            remaining=amount,
            status=OrderStatus.OPEN,
            timestamp=datetime.now(),
            exchange=exchange,
        )
        self.orders[order_id] = order
        return order

    async def get_ticker(self, symbol, exchange):
        from system_trading.data.models import Ticker

        return Ticker(
            symbol=symbol,
            timestamp=datetime.now(),
            bid=Decimal("49900"),
            ask=Decimal("50100"),
            last=Decimal("50000"),
            volume=Decimal("1000"),
            change=Decimal("100"),
            percentage=Decimal("0.2"),
        )


@pytest.fixture
def mock_exchange_client():
    """Mock exchange client fixture."""
    return MockExchangeClient()
