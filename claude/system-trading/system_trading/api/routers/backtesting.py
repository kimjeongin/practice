"""Backtesting API endpoints."""

import logging
from datetime import datetime
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from system_trading.backtesting.data_manager import BacktestDataManager
from system_trading.backtesting.engine import BacktestEngine
from system_trading.data.models import Exchange
from system_trading.strategies.enhanced_ma_strategy import EnhancedMAStrategy
from system_trading.strategies.rsi_strategy import RSIStrategy

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/backtest", tags=["backtesting"])

# Global instances
backtest_engine = BacktestEngine()
data_manager = BacktestDataManager()

# Available strategies
AVAILABLE_STRATEGIES = {
    "enhanced_ma": EnhancedMAStrategy,
    "rsi": RSIStrategy,
}


class BacktestRequest(BaseModel):
    """Backtest request model."""

    strategy: str = Field(..., description="Strategy name")
    symbol: str = Field(..., description="Trading symbol")
    exchange: Exchange = Field(..., description="Exchange")
    timeframe: str = Field(default="1h", description="Data timeframe")
    start_date: datetime | None = Field(None, description="Start date")
    end_date: datetime | None = Field(None, description="End date")
    parameters: dict[str, Any] = Field(
        default_factory=dict, description="Strategy parameters"
    )
    initial_cash: float = Field(default=10000.0, description="Initial cash")
    commission: float = Field(default=0.001, description="Commission rate")


class OptimizationRequest(BaseModel):
    """Optimization request model."""

    strategy: str = Field(..., description="Strategy name")
    symbol: str = Field(..., description="Trading symbol")
    exchange: Exchange = Field(..., description="Exchange")
    timeframe: str = Field(default="1h", description="Data timeframe")
    param_ranges: dict[str, list[Any]] = Field(..., description="Parameter ranges")
    metric: str = Field(default="sharpe_ratio", description="Optimization metric")
    initial_cash: float = Field(default=10000.0, description="Initial cash")


@router.get("/strategies")
async def get_available_strategies() -> list[str]:
    """Get list of available strategies.

    Returns:
        List of strategy names.
    """
    return list(AVAILABLE_STRATEGIES.keys())


@router.post("/run")
async def run_backtest(request: BacktestRequest) -> dict[str, Any]:
    """Run a backtest.

    Args:
        request: Backtest configuration.

    Returns:
        Backtest results.
    """
    try:
        # Validate strategy
        if request.strategy not in AVAILABLE_STRATEGIES:
            raise HTTPException(
                status_code=400, detail=f"Unknown strategy: {request.strategy}"
            )

        # Get historical data
        logger.info(
            "Fetching data for backtest: %s %s", request.symbol, request.exchange
        )
        data = data_manager.prepare_backtest_data(
            symbol=request.symbol,
            exchange=request.exchange,
            timeframe=request.timeframe,
            start_date=request.start_date,
            end_date=request.end_date,
        )

        if data.empty:
            raise HTTPException(
                status_code=400, detail="No data available for the specified parameters"
            )

        # Create strategy instance
        strategy_class = AVAILABLE_STRATEGIES[request.strategy]
        strategy = strategy_class(**request.parameters)

        # Configure backtest engine
        engine = BacktestEngine(
            initial_cash=request.initial_cash,
            commission=request.commission,
        )

        # Run backtest
        logger.info("Running backtest for %s", strategy.name)
        result = engine.run_backtest(
            strategy=strategy,
            data=data,
            symbol=request.symbol,
            start_date=request.start_date,
            end_date=request.end_date,
        )

        # Return results
        return {
            "success": True,
            "summary": result.get_summary(),
            "statistics": result.stats,
            "trades": result.trades.to_dict("records")
            if not result.trades.empty
            else [],
            "data_points": len(data),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Backtest failed: %s", e)
        raise HTTPException(status_code=500, detail=f"Backtest failed: {e}")


@router.post("/optimize")
async def run_optimization(request: OptimizationRequest) -> dict[str, Any]:
    """Run parameter optimization.

    Args:
        request: Optimization configuration.

    Returns:
        Optimization results.
    """
    try:
        # Validate strategy
        if request.strategy not in AVAILABLE_STRATEGIES:
            raise HTTPException(
                status_code=400, detail=f"Unknown strategy: {request.strategy}"
            )

        # Get historical data
        logger.info(
            "Fetching data for optimization: %s %s", request.symbol, request.exchange
        )
        data = data_manager.prepare_backtest_data(
            symbol=request.symbol,
            exchange=request.exchange,
            timeframe=request.timeframe,
        )

        if data.empty:
            raise HTTPException(
                status_code=400, detail="No data available for optimization"
            )

        # Configure backtest engine
        engine = BacktestEngine(initial_cash=request.initial_cash)

        # Run optimization
        strategy_class = AVAILABLE_STRATEGIES[request.strategy]
        logger.info("Starting optimization for %s", request.strategy)

        result = engine.run_optimization(
            strategy_class=strategy_class,
            data=data,
            param_ranges=request.param_ranges,
            symbol=request.symbol,
            metric=request.metric,
        )

        return {
            "success": True,
            "best_parameters": result["best_params"],
            "best_score": result["best_score"],
            "optimization_metric": result["metric"],
            "total_combinations": result["total_combinations"],
            "top_results": sorted(
                result["all_results"],
                key=lambda x: x["score"],
                reverse=request.metric != "max_drawdown",
            )[:10],  # Top 10 results
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Optimization failed: %s", e)
        raise HTTPException(status_code=500, detail=f"Optimization failed: {e}")


@router.post("/compare")
async def compare_strategies(
    symbols: list[str] = Query(..., description="Trading symbols"),
    exchange: Exchange = Query(..., description="Exchange"),
    timeframe: str = Query("1h", description="Data timeframe"),
    strategies: list[str] = Query(..., description="Strategy names"),
) -> dict[str, Any]:
    """Compare multiple strategies.

    Args:
        symbols: List of trading symbols.
        exchange: Exchange name.
        timeframe: Data timeframe.
        strategies: List of strategy names.

    Returns:
        Strategy comparison results.
    """
    try:
        results = {}

        for symbol in symbols:
            # Get data
            data = data_manager.prepare_backtest_data(
                symbol=symbol,
                exchange=exchange,
                timeframe=timeframe,
            )

            if data.empty:
                logger.warning("No data for %s", symbol)
                continue

            # Create strategy instances
            strategy_instances = []
            for strategy_name in strategies:
                if strategy_name in AVAILABLE_STRATEGIES:
                    strategy_class = AVAILABLE_STRATEGIES[strategy_name]
                    strategy_instances.append(strategy_class())

            if not strategy_instances:
                raise HTTPException(
                    status_code=400, detail="No valid strategies provided"
                )

            # Compare strategies
            comparison = backtest_engine.compare_strategies(
                strategies=strategy_instances,
                data=data,
                symbol=symbol,
            )

            results[symbol] = comparison.to_dict("records")

        return {
            "success": True,
            "comparison_results": results,
            "strategies_compared": strategies,
            "symbols_analyzed": list(results.keys()),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Strategy comparison failed: %s", e)
        raise HTTPException(status_code=500, detail=f"Comparison failed: {e}")


@router.get("/data/info/{exchange}/{symbol}")
async def get_data_info(
    exchange: Exchange,
    symbol: str,
    timeframe: str = Query("1h", description="Data timeframe"),
) -> dict[str, Any]:
    """Get information about available data.

    Args:
        exchange: Exchange name.
        symbol: Trading symbol.
        timeframe: Data timeframe.

    Returns:
        Data information.
    """
    try:
        info = data_manager.get_data_info(symbol, exchange, timeframe)
        return info
    except Exception as e:
        logger.error("Failed to get data info: %s", e)
        raise HTTPException(status_code=500, detail=f"Failed to get data info: {e}")


@router.post("/data/download")
async def download_data(
    symbols: list[str] = Query(..., description="Trading symbols"),
    exchange: Exchange = Query(..., description="Exchange"),
    timeframes: list[str] = Query(["1h"], description="Data timeframes"),
    days_back: int = Query(365, description="Days to download", ge=1, le=1095),
) -> dict[str, Any]:
    """Download historical data.

    Args:
        symbols: List of trading symbols.
        exchange: Exchange name.
        timeframes: List of timeframes.
        days_back: Number of days to download.

    Returns:
        Download results.
    """
    try:
        logger.info("Starting bulk data download for %d symbols", len(symbols))

        results = data_manager.download_bulk_data(
            symbols=symbols,
            exchange=exchange,
            timeframes=timeframes,
            days_back=days_back,
        )

        # Summary statistics
        summary = {
            "total_symbols": len(symbols),
            "total_timeframes": len(timeframes),
            "successful_downloads": 0,
            "failed_downloads": 0,
            "details": {},
        }

        for symbol, timeframe_data in results.items():
            symbol_summary = {}
            for timeframe, data in timeframe_data.items():
                if not data.empty:
                    summary["successful_downloads"] += 1
                    symbol_summary[timeframe] = {
                        "success": True,
                        "candles": len(data),
                        "start_date": data.index[0].isoformat()
                        if len(data) > 0
                        else None,
                        "end_date": data.index[-1].isoformat()
                        if len(data) > 0
                        else None,
                    }
                else:
                    summary["failed_downloads"] += 1
                    symbol_summary[timeframe] = {"success": False}

            summary["details"][symbol] = symbol_summary

        return {
            "success": True,
            "summary": summary,
        }

    except Exception as e:
        logger.error("Data download failed: %s", e)
        raise HTTPException(status_code=500, detail=f"Data download failed: {e}")


@router.get("/metrics")
async def get_backtest_metrics() -> list[str]:
    """Get available backtest metrics for optimization.

    Returns:
        List of available metrics.
    """
    return [
        "total_return",
        "sharpe_ratio",
        "max_drawdown",
        "win_rate",
        "profit_factor",
        "calmar_ratio",
    ]
