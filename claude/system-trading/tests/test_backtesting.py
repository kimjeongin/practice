"""Tests for backtesting engine."""

from datetime import datetime

import numpy as np
import pandas as pd
import pytest

from system_trading.backtesting.engine import BacktestEngine
from system_trading.strategies.enhanced_ma_strategy import EnhancedMAStrategy


class TestBacktestEngine:
    """Test cases for BacktestEngine."""

    def test_engine_initialization(self) -> None:
        """Test backtest engine initialization."""
        engine = BacktestEngine(
            initial_cash=10000.0,
            commission=0.001,
            slippage=0.001,
        )

        assert engine.initial_cash == 10000.0
        assert engine.commission == 0.001
        assert engine.slippage == 0.001

    def test_run_backtest(self) -> None:
        """Test running a basic backtest."""
        engine = BacktestEngine(initial_cash=10000.0)
        strategy = EnhancedMAStrategy(fast_ema=5, slow_ema=10)

        # Create test data
        data = self._create_test_data(50)

        result = engine.run_backtest(
            strategy=strategy,
            data=data,
            symbol="BTC/USDT",
        )

        assert result.strategy_name == "EnhancedMAStrategy"
        assert result.symbol == "BTC/USDT"
        assert isinstance(result.stats, dict)
        assert "total_return" in result.stats
        assert "sharpe_ratio" in result.stats
        assert "max_drawdown" in result.stats

    def test_run_optimization(self) -> None:
        """Test parameter optimization."""
        engine = BacktestEngine(initial_cash=10000.0)

        # Create test data
        data = self._create_test_data(100)

        param_ranges = {
            "fast_ema": [5, 10, 15],
            "slow_ema": [20, 25, 30],
        }

        result = engine.run_optimization(
            strategy_class=EnhancedMAStrategy,
            data=data,
            param_ranges=param_ranges,
            symbol="BTC/USDT",
            metric="sharpe_ratio",
        )

        assert "best_params" in result
        assert "best_score" in result
        assert "all_results" in result
        assert result["total_combinations"] == 9  # 3 * 3 combinations

    def test_compare_strategies(self) -> None:
        """Test strategy comparison."""
        engine = BacktestEngine(initial_cash=10000.0)

        # Create strategies
        strategy1 = EnhancedMAStrategy(fast_ema=5, slow_ema=20)
        strategy2 = EnhancedMAStrategy(fast_ema=10, slow_ema=30)

        # Create test data
        data = self._create_test_data(100)

        comparison = engine.compare_strategies(
            strategies=[strategy1, strategy2],
            data=data,
            symbol="BTC/USDT",
        )

        assert len(comparison) == 2
        assert "strategy" in comparison.columns
        assert "total_return" in comparison.columns
        assert "sharpe_ratio" in comparison.columns

    def test_filter_data_by_date(self) -> None:
        """Test data filtering by date."""
        engine = BacktestEngine()

        # Create test data with timestamps
        data = self._create_test_data_with_dates(30)

        start_date = data.index[10]
        end_date = data.index[20]

        filtered_data = engine._filter_data_by_date(data, start_date, end_date)

        assert len(filtered_data) == 11  # Inclusive range
        assert filtered_data.index[0] >= start_date
        assert filtered_data.index[-1] <= end_date

    def test_generate_signals(self) -> None:
        """Test signal generation."""
        engine = BacktestEngine()
        strategy = EnhancedMAStrategy(fast_ema=5, slow_ema=10)

        # Create test data
        data = self._create_test_data(50)

        signals = engine._generate_signals(strategy, data)

        assert "entries" in signals.columns
        assert "exits" in signals.columns
        assert len(signals) == len(data)
        assert signals["entries"].dtype == bool
        assert signals["exits"].dtype == bool

    def test_calculate_statistics(self) -> None:
        """Test statistics calculation."""
        engine = BacktestEngine()

        # Create mock portfolio with basic stats
        class MockPortfolio:
            def stats(self):
                return {
                    "Total Return [%]": 15.5,
                    "Max Drawdown [%]": 8.2,
                    "Start Value": 10000,
                    "End Value": 11550,
                    "Duration": "30 days",
                }

            def returns(self):
                # Return some mock daily returns
                dates = pd.date_range("2024-01-01", periods=30, freq="D")
                returns = np.random.normal(0.001, 0.02, 30)
                return pd.Series(returns, index=dates)

            @property
            def trades(self):
                class MockTrades:
                    records_readable = pd.DataFrame(
                        {
                            "PnL": [100, -50, 150, -25, 75],
                            "Entry Timestamp": pd.date_range(
                                "2024-01-01", periods=5, freq="D"
                            ),
                            "Exit Timestamp": pd.date_range(
                                "2024-01-02", periods=5, freq="D"
                            ),
                        }
                    )

                return MockTrades()

        portfolio = MockPortfolio()
        data = self._create_test_data(30)

        stats = engine._calculate_statistics(portfolio, data)

        assert "total_return" in stats
        assert "sharpe_ratio" in stats
        assert "max_drawdown" in stats
        assert "win_rate" in stats
        assert "profit_factor" in stats
        assert stats["total_trades"] == 5

    def _create_test_data(self, length: int) -> pd.DataFrame:
        """Create test OHLCV data."""
        np.random.seed(42)

        # Generate realistic price data
        base_price = 50000
        price_changes = np.random.normal(0, 0.02, length)
        prices = [base_price]

        for change in price_changes:
            new_price = prices[-1] * (1 + change)
            prices.append(max(new_price, 1))  # Ensure positive prices

        prices = prices[1:]

        # Create OHLCV data
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

    def _create_test_data_with_dates(self, length: int) -> pd.DataFrame:
        """Create test data with specific date range."""
        data = self._create_test_data(length)
        start_date = datetime(2024, 1, 1)
        data.index = pd.date_range(start_date, periods=length, freq="H")
        return data


class TestBacktestResult:
    """Test cases for BacktestResult."""

    def test_result_initialization(self) -> None:
        """Test backtest result initialization."""
        from system_trading.backtesting.engine import BacktestResult

        # Mock portfolio
        class MockPortfolio:
            pass

        portfolio = MockPortfolio()
        trades = pd.DataFrame()
        stats = {"total_return": 0.15, "sharpe_ratio": 1.2}

        result = BacktestResult(
            portfolio=portfolio,
            trades=trades,
            stats=stats,
            strategy_name="TestStrategy",
            symbol="BTC/USDT",
            start_date=datetime(2024, 1, 1),
            end_date=datetime(2024, 1, 31),
        )

        assert result.strategy_name == "TestStrategy"
        assert result.symbol == "BTC/USDT"
        assert result.stats == stats

    def test_get_summary(self) -> None:
        """Test summary generation."""
        from system_trading.backtesting.engine import BacktestResult

        class MockPortfolio:
            pass

        portfolio = MockPortfolio()
        trades = pd.DataFrame(
            {
                "trade_id": [1, 2, 3],
                "pnl": [100, -50, 75],
            }
        )
        stats = {
            "total_return": 0.15,
            "sharpe_ratio": 1.2,
            "max_drawdown": 0.08,
            "win_rate": 0.67,
            "profit_factor": 1.8,
        }

        result = BacktestResult(
            portfolio=portfolio,
            trades=trades,
            stats=stats,
            strategy_name="TestStrategy",
            symbol="BTC/USDT",
            start_date=datetime(2024, 1, 1),
            end_date=datetime(2024, 1, 31),
        )

        summary = result.get_summary()

        assert summary["strategy"] == "TestStrategy"
        assert summary["symbol"] == "BTC/USDT"
        assert summary["total_trades"] == 3
        assert summary["total_return"] == 0.15
        assert summary["sharpe_ratio"] == 1.2


if __name__ == "__main__":
    pytest.main([__file__])
