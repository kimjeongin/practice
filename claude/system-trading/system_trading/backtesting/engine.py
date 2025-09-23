"""Vectorbt-based backtesting engine."""

import logging
from datetime import datetime
from typing import Any

import numpy as np
import pandas as pd
import vectorbt as vbt

from system_trading.strategies.base_strategy import BaseStrategy

logger = logging.getLogger(__name__)


class BacktestResult:
    """Backtesting result container."""

    def __init__(
        self,
        portfolio: Any,
        trades: pd.DataFrame,
        stats: dict[str, Any],
        strategy_name: str,
        symbol: str,
        start_date: datetime,
        end_date: datetime,
    ) -> None:
        """Initialize backtest result.

        Args:
            portfolio: VectorBT portfolio object.
            trades: Trade records DataFrame.
            stats: Performance statistics.
            strategy_name: Name of the strategy.
            symbol: Trading symbol.
            start_date: Backtest start date.
            end_date: Backtest end date.
        """
        self.portfolio = portfolio
        self.trades = trades
        self.stats = stats
        self.strategy_name = strategy_name
        self.symbol = symbol
        self.start_date = start_date
        self.end_date = end_date

    def get_summary(self) -> dict[str, Any]:
        """Get backtest summary."""
        return {
            "strategy": self.strategy_name,
            "symbol": self.symbol,
            "period": f"{self.start_date.date()} to {self.end_date.date()}",
            "total_trades": len(self.trades),
            "win_rate": self.stats.get("win_rate", 0.0),
            "total_return": self.stats.get("total_return", 0.0),
            "sharpe_ratio": self.stats.get("sharpe_ratio", 0.0),
            "max_drawdown": self.stats.get("max_drawdown", 0.0),
            "profit_factor": self.stats.get("profit_factor", 0.0),
        }

    def plot_results(self) -> Any:
        """Plot backtest results."""
        if hasattr(self.portfolio, "plot"):
            return self.portfolio.plot()
        return None


class BacktestEngine:
    """Vectorbt-based backtesting engine."""

    def __init__(
        self,
        initial_cash: float = 10000.0,
        commission: float = 0.001,
        slippage: float = 0.001,
    ) -> None:
        """Initialize backtesting engine.

        Args:
            initial_cash: Initial portfolio cash.
            commission: Trading commission rate.
            slippage: Price slippage rate.
        """
        self.initial_cash = initial_cash
        self.commission = commission
        self.slippage = slippage

    def run_backtest(
        self,
        strategy: BaseStrategy,
        data: pd.DataFrame,
        symbol: str,
        start_date: datetime | None = None,
        end_date: datetime | None = None,
    ) -> BacktestResult:
        """Run backtest for a strategy.

        Args:
            strategy: Trading strategy to test.
            data: OHLCV price data.
            symbol: Trading symbol.
            start_date: Backtest start date.
            end_date: Backtest end date.

        Returns:
            Backtest results.
        """
        try:
            # Filter data by date range
            if start_date or end_date:
                data = self._filter_data_by_date(data, start_date, end_date)

            # Generate signals
            signals = self._generate_signals(strategy, data)

            # Run vectorbt backtest
            portfolio = self._run_vectorbt_backtest(data, signals)

            # Calculate statistics
            stats = self._calculate_statistics(portfolio, data)

            # Extract trades
            trades = self._extract_trades(portfolio)

            return BacktestResult(
                portfolio=portfolio,
                trades=trades,
                stats=stats,
                strategy_name=strategy.name,
                symbol=symbol,
                start_date=start_date or data.index[0],
                end_date=end_date or data.index[-1],
            )

        except Exception as e:
            logger.error("Backtest failed for %s: %s", strategy.name, e)
            raise

    def run_optimization(
        self,
        strategy_class: type[BaseStrategy],
        data: pd.DataFrame,
        param_ranges: dict[str, list[Any]],
        symbol: str,
        metric: str = "sharpe_ratio",
    ) -> dict[str, Any]:
        """Run parameter optimization.

        Args:
            strategy_class: Strategy class to optimize.
            data: OHLCV price data.
            param_ranges: Parameter ranges to test.
            symbol: Trading symbol.
            metric: Optimization metric.

        Returns:
            Optimization results.
        """
        try:
            best_params = {}
            best_score = float("-inf") if metric != "max_drawdown" else float("inf")
            all_results = []

            # Generate parameter combinations
            param_combinations = self._generate_param_combinations(param_ranges)

            logger.info(
                "Starting optimization with %d parameter combinations",
                len(param_combinations),
            )

            for i, params in enumerate(param_combinations):
                try:
                    # Create strategy instance
                    strategy = strategy_class(**params)

                    # Run backtest
                    result = self.run_backtest(strategy, data, symbol)

                    # Get metric score
                    score = result.stats.get(metric, 0.0)

                    # Track results
                    result_data = {"params": params, "score": score, **result.stats}
                    all_results.append(result_data)

                    # Update best parameters
                    is_better = (
                        score > best_score
                        if metric != "max_drawdown"
                        else score < best_score
                    )

                    if is_better:
                        best_score = score
                        best_params = params.copy()

                    if (i + 1) % 10 == 0:
                        logger.info(
                            "Completed %d/%d optimizations",
                            i + 1,
                            len(param_combinations),
                        )

                except Exception as e:
                    logger.warning("Optimization failed for params %s: %s", params, e)

            return {
                "best_params": best_params,
                "best_score": best_score,
                "metric": metric,
                "all_results": all_results,
                "total_combinations": len(param_combinations),
            }

        except Exception as e:
            logger.error("Optimization failed: %s", e)
            raise

    def _filter_data_by_date(
        self,
        data: pd.DataFrame,
        start_date: datetime | None,
        end_date: datetime | None,
    ) -> pd.DataFrame:
        """Filter data by date range."""
        if start_date:
            data = data[data.index >= start_date]
        if end_date:
            data = data[data.index <= end_date]
        return data

    def _generate_signals(
        self, strategy: BaseStrategy, data: pd.DataFrame
    ) -> pd.DataFrame:
        """Generate buy/sell signals from strategy."""
        try:
            signals = pd.DataFrame(index=data.index)
            signals["entries"] = False
            signals["exits"] = False

            # Generate signals for each time step
            for i in range(len(data)):
                if i < strategy.parameters.get(
                    "long_window", 30
                ):  # Skip insufficient data
                    continue

                # Get data up to current point
                current_data = data.iloc[: i + 1]

                # Generate buy/sell signals
                buy_signal = strategy.should_buy(current_data)
                sell_signal = strategy.should_sell(current_data)

                signals.iloc[i, signals.columns.get_loc("entries")] = buy_signal
                signals.iloc[i, signals.columns.get_loc("exits")] = sell_signal

            return signals

        except Exception as e:
            logger.error("Signal generation failed: %s", e)
            raise

    def _run_vectorbt_backtest(self, data: pd.DataFrame, signals: pd.DataFrame) -> Any:
        """Run vectorbt backtest."""
        try:
            # Create portfolio
            portfolio = vbt.Portfolio.from_signals(
                close=data["close"],
                entries=signals["entries"],
                exits=signals["exits"],
                init_cash=self.initial_cash,
                fees=self.commission,
                slippage=self.slippage,
                freq="1h",  # Adjust based on data frequency
            )

            return portfolio

        except Exception as e:
            logger.error("VectorBT backtest failed: %s", e)
            raise

    def _calculate_statistics(
        self, portfolio: Any, data: pd.DataFrame
    ) -> dict[str, Any]:
        """Calculate performance statistics."""
        try:
            # Get portfolio statistics
            stats = portfolio.stats()

            # Calculate additional metrics
            returns = portfolio.returns()

            # Risk-free rate (approximate)
            risk_free_rate = 0.02

            # Calculate metrics
            total_return = float(stats["Total Return [%]"]) / 100
            sharpe_ratio = self._calculate_sharpe_ratio(returns, risk_free_rate)
            max_drawdown = float(stats["Max Drawdown [%]"]) / 100

            # Win rate
            trades = portfolio.trades.records_readable
            if len(trades) > 0:
                winning_trades = len(trades[trades["PnL"] > 0])
                win_rate = winning_trades / len(trades)
            else:
                win_rate = 0.0

            # Profit factor
            profit_factor = (
                self._calculate_profit_factor(trades) if len(trades) > 0 else 0.0
            )

            # Calmar ratio
            calmar_ratio = (
                total_return / abs(max_drawdown) if max_drawdown != 0 else 0.0
            )

            return {
                "total_return": total_return,
                "sharpe_ratio": sharpe_ratio,
                "max_drawdown": max_drawdown,
                "win_rate": win_rate,
                "profit_factor": profit_factor,
                "calmar_ratio": calmar_ratio,
                "total_trades": len(trades),
                "start_value": float(stats["Start Value"]),
                "end_value": float(stats["End Value"]),
                "duration": str(stats["Duration"]),
            }

        except Exception as e:
            logger.error("Statistics calculation failed: %s", e)
            return {}

    def _calculate_sharpe_ratio(
        self, returns: pd.Series, risk_free_rate: float
    ) -> float:
        """Calculate Sharpe ratio."""
        try:
            if len(returns) == 0 or returns.std() == 0:
                return 0.0

            excess_returns = returns - risk_free_rate / 252  # Daily risk-free rate
            return float(excess_returns.mean() / returns.std() * np.sqrt(252))

        except Exception:
            return 0.0

    def _calculate_profit_factor(self, trades: pd.DataFrame) -> float:
        """Calculate profit factor."""
        try:
            if len(trades) == 0:
                return 0.0

            profitable_trades = trades[trades["PnL"] > 0]["PnL"].sum()
            losing_trades = abs(trades[trades["PnL"] < 0]["PnL"].sum())

            if losing_trades == 0:
                return float("inf") if profitable_trades > 0 else 0.0

            return profitable_trades / losing_trades

        except Exception:
            return 0.0

    def _extract_trades(self, portfolio: Any) -> pd.DataFrame:
        """Extract trade records."""
        try:
            trades = portfolio.trades.records_readable
            if len(trades) == 0:
                return pd.DataFrame()

            # Rename columns for consistency
            trades = trades.rename(
                columns={
                    "Entry Timestamp": "entry_time",
                    "Exit Timestamp": "exit_time",
                    "Size": "size",
                    "Entry Price": "entry_price",
                    "Exit Price": "exit_price",
                    "PnL": "pnl",
                    "Return": "return_pct",
                    "Duration": "duration",
                }
            )

            return trades

        except Exception as e:
            logger.error("Trade extraction failed: %s", e)
            return pd.DataFrame()

    def _generate_param_combinations(
        self, param_ranges: dict[str, list[Any]]
    ) -> list[dict[str, Any]]:
        """Generate all parameter combinations."""
        import itertools

        keys = list(param_ranges.keys())
        values = list(param_ranges.values())

        combinations = []
        for combination in itertools.product(*values):
            param_dict = dict(zip(keys, combination, strict=False))
            combinations.append(param_dict)

        return combinations

    def compare_strategies(
        self,
        strategies: list[BaseStrategy],
        data: pd.DataFrame,
        symbol: str,
    ) -> pd.DataFrame:
        """Compare multiple strategies."""
        try:
            results = []

            for strategy in strategies:
                result = self.run_backtest(strategy, data, symbol)
                summary = result.get_summary()
                results.append(summary)

            comparison_df = pd.DataFrame(results)
            comparison_df = comparison_df.sort_values("sharpe_ratio", ascending=False)

            return comparison_df

        except Exception as e:
            logger.error("Strategy comparison failed: %s", e)
            raise
