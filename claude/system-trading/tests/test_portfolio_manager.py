"""Tests for portfolio manager."""

from datetime import datetime
from decimal import Decimal

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
from system_trading.data.portfolio_manager import PortfolioManager


class TestPortfolioManager:
    """Test cases for PortfolioManager."""

    def test_initialization(self) -> None:
        """Test portfolio manager initialization."""
        pm = PortfolioManager()

        assert len(pm.positions) == 0
        assert len(pm.balances) == 0
        assert len(pm.trades) == 0
        assert pm.risk_percentage == 0.02
        assert pm.max_position_size == 1000.0

    def test_update_balance(self) -> None:
        """Test balance update functionality."""
        pm = PortfolioManager()

        balance = Balance(
            asset="BTC",
            free=Decimal("1.5"),
            locked=Decimal("0.5"),
            total=Decimal("2.0"),
            exchange=Exchange.BINANCE,
            timestamp=datetime.now(),
        )

        pm.update_balance(balance)

        key = f"{Exchange.BINANCE}:BTC"
        assert key in pm.balances
        assert pm.balances[key] == balance

    def test_update_position(self) -> None:
        """Test position update functionality."""
        pm = PortfolioManager()

        position = Position(
            symbol="BTC/USDT",
            side=OrderSide.BUY,
            size=Decimal("0.1"),
            entry_price=Decimal("50000"),
            market_price=Decimal("51000"),
            unrealized_pnl=Decimal("100"),
            exchange=Exchange.BINANCE,
            timestamp=datetime.now(),
        )

        pm.update_position(position)

        key = f"{Exchange.BINANCE}:BTC/USDT"
        assert key in pm.positions
        assert pm.positions[key] == position

    def test_remove_position(self) -> None:
        """Test position removal when size is zero."""
        pm = PortfolioManager()

        # Add position
        position = Position(
            symbol="BTC/USDT",
            side=OrderSide.BUY,
            size=Decimal("0.1"),
            entry_price=Decimal("50000"),
            market_price=Decimal("51000"),
            unrealized_pnl=Decimal("100"),
            exchange=Exchange.BINANCE,
            timestamp=datetime.now(),
        )
        pm.update_position(position)

        # Remove position by setting size to zero
        position.size = Decimal("0")
        pm.update_position(position)

        key = f"{Exchange.BINANCE}:BTC/USDT"
        assert key not in pm.positions

    def test_add_trade(self) -> None:
        """Test trade addition."""
        pm = PortfolioManager()

        trade = Trade(
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

        pm.add_trade(trade)

        assert len(pm.trades) == 1
        assert pm.trades[0] == trade

    def test_get_position(self) -> None:
        """Test position retrieval."""
        pm = PortfolioManager()

        position = Position(
            symbol="BTC/USDT",
            side=OrderSide.BUY,
            size=Decimal("0.1"),
            entry_price=Decimal("50000"),
            market_price=Decimal("51000"),
            unrealized_pnl=Decimal("100"),
            exchange=Exchange.BINANCE,
            timestamp=datetime.now(),
        )
        pm.update_position(position)

        retrieved = pm.get_position("BTC/USDT", Exchange.BINANCE)
        assert retrieved == position

        # Test non-existent position
        assert pm.get_position("ETH/USDT", Exchange.BINANCE) is None

    def test_get_balance(self) -> None:
        """Test balance retrieval."""
        pm = PortfolioManager()

        balance = Balance(
            asset="USDT",
            free=Decimal("10000"),
            locked=Decimal("0"),
            total=Decimal("10000"),
            exchange=Exchange.BINANCE,
            timestamp=datetime.now(),
        )
        pm.update_balance(balance)

        retrieved = pm.get_balance("USDT", Exchange.BINANCE)
        assert retrieved == balance

        # Test non-existent balance
        assert pm.get_balance("BTC", Exchange.BINANCE) is None

    def test_calculate_position_size(self) -> None:
        """Test position size calculation."""
        pm = PortfolioManager()

        # Add USDT balance
        balance = Balance(
            asset="USDT",
            free=Decimal("10000"),
            locked=Decimal("0"),
            total=Decimal("10000"),
            exchange=Exchange.BINANCE,
            timestamp=datetime.now(),
        )
        pm.update_balance(balance)

        # Calculate position size
        position_size = pm.calculate_position_size(
            symbol="BTC/USDT",
            exchange=Exchange.BINANCE,
            current_price=Decimal("50000"),
            signal_strength=1.0,
        )

        # With 2% risk and signal strength 1.0
        expected_risk_amount = Decimal("10000") * Decimal("0.02")  # 200 USDT
        expected_position_size = expected_risk_amount / Decimal("50000")  # 0.004 BTC

        assert position_size == expected_position_size

    def test_calculate_position_size_no_balance(self) -> None:
        """Test position size calculation with no balance."""
        pm = PortfolioManager()

        position_size = pm.calculate_position_size(
            symbol="BTC/USDT",
            exchange=Exchange.BINANCE,
            current_price=Decimal("50000"),
        )

        assert position_size == Decimal("0")

    def test_calculate_stop_loss(self) -> None:
        """Test stop loss calculation."""
        pm = PortfolioManager()

        # Test buy position stop loss
        stop_loss = pm.calculate_stop_loss(
            entry_price=Decimal("50000"),
            side=OrderSide.BUY,
        )

        # Default 2% stop loss for buy
        expected_stop = Decimal("50000") * Decimal("0.98")
        assert stop_loss == expected_stop

        # Test sell position stop loss
        stop_loss = pm.calculate_stop_loss(
            entry_price=Decimal("50000"),
            side=OrderSide.SELL,
        )

        # Default 2% stop loss for sell
        expected_stop = Decimal("50000") * Decimal("1.02")
        assert stop_loss == expected_stop

    def test_calculate_stop_loss_with_atr(self) -> None:
        """Test stop loss calculation with ATR."""
        pm = PortfolioManager()

        atr = Decimal("1000")  # 1000 USDT ATR
        stop_multiplier = 2.0

        stop_loss = pm.calculate_stop_loss(
            entry_price=Decimal("50000"),
            side=OrderSide.BUY,
            atr=atr,
            stop_multiplier=stop_multiplier,
        )

        # ATR-based stop: entry_price - (atr * multiplier)
        # But calculated as percentage: (atr * multiplier) / entry_price
        atr_percentage = (atr * Decimal(str(stop_multiplier))) / Decimal("50000")
        expected_stop = Decimal("50000") * (Decimal("1") - atr_percentage)

        assert stop_loss == expected_stop

    def test_calculate_take_profit(self) -> None:
        """Test take profit calculation."""
        pm = PortfolioManager()

        take_profit = pm.calculate_take_profit(
            entry_price=Decimal("50000"),
            side=OrderSide.BUY,
            risk_reward_ratio=2.0,
        )

        # Default 2% stop loss distance
        stop_distance = Decimal("50000") * Decimal("0.02")
        profit_distance = stop_distance * Decimal("2.0")
        expected_take_profit = Decimal("50000") + profit_distance

        assert take_profit == expected_take_profit

    def test_check_risk_limits_valid_order(self) -> None:
        """Test risk limit checking for valid order."""
        pm = PortfolioManager()

        # Add sufficient balance
        balance = Balance(
            asset="USDT",
            free=Decimal("10000"),
            locked=Decimal("0"),
            total=Decimal("10000"),
            exchange=Exchange.BINANCE,
            timestamp=datetime.now(),
        )
        pm.update_balance(balance)

        order = Order(
            id="test_order",
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

        assert pm.check_risk_limits(order) is True

    def test_check_risk_limits_insufficient_balance(self) -> None:
        """Test risk limit checking with insufficient balance."""
        pm = PortfolioManager()

        # Add insufficient balance
        balance = Balance(
            asset="USDT",
            free=Decimal("1000"),  # Only 1000 USDT
            locked=Decimal("0"),
            total=Decimal("1000"),
            exchange=Exchange.BINANCE,
            timestamp=datetime.now(),
        )
        pm.update_balance(balance)

        order = Order(
            id="test_order",
            symbol="BTC/USDT",
            side=OrderSide.BUY,
            type=OrderType.MARKET,
            amount=Decimal("1.0"),  # 1 BTC * 50000 = 50000 USDT (more than balance)
            price=Decimal("50000"),
            filled=Decimal("0"),
            remaining=Decimal("1.0"),
            status=OrderStatus.PENDING,
            timestamp=datetime.now(),
            exchange=Exchange.BINANCE,
        )

        assert pm.check_risk_limits(order) is False

    def test_portfolio_summary(self) -> None:
        """Test portfolio summary generation."""
        pm = PortfolioManager()

        # Add balance
        balance = Balance(
            asset="USDT",
            free=Decimal("5000"),
            locked=Decimal("0"),
            total=Decimal("5000"),
            exchange=Exchange.BINANCE,
            timestamp=datetime.now(),
        )
        pm.update_balance(balance)

        # Add position
        position = Position(
            symbol="BTC/USDT",
            side=OrderSide.BUY,
            size=Decimal("0.1"),
            entry_price=Decimal("50000"),
            market_price=Decimal("51000"),
            unrealized_pnl=Decimal("100"),
            exchange=Exchange.BINANCE,
            timestamp=datetime.now(),
        )
        pm.update_position(position)

        portfolio = pm.get_portfolio_summary()

        assert portfolio.total_value >= Decimal("5000")  # At least the cash balance
        assert portfolio.available_balance == Decimal("5000")
        assert len(portfolio.positions) == 1
        assert portfolio.total_pnl == Decimal("100")


if __name__ == "__main__":
    pytest.main([__file__])
