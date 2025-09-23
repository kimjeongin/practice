"""Market data API endpoints."""

import logging
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from system_trading.data.models import Exchange, MarketData, Ticker
from system_trading.exchanges.unified_client import UnifiedExchangeClient

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/market", tags=["market_data"])

# Global client instance
client = UnifiedExchangeClient()


@router.get("/ticker/{exchange}/{symbol}")
async def get_ticker(
    exchange: Exchange,
    symbol: str,
) -> Ticker:
    """Get ticker data for a symbol.

    Args:
        exchange: Exchange name.
        symbol: Trading symbol.

    Returns:
        Ticker data.
    """
    try:
        ticker = await client.get_ticker(symbol, exchange)
        return ticker
    except Exception as e:
        logger.error("Failed to get ticker for %s on %s: %s", symbol, exchange, e)
        raise HTTPException(status_code=500, detail=f"Failed to get ticker: {e}")


@router.get("/ohlcv/{exchange}/{symbol}")
async def get_ohlcv(
    exchange: Exchange,
    symbol: str,
    timeframe: str = Query("1h", description="Timeframe (1h, 4h, 1d, etc.)"),
    limit: int = Query(100, description="Number of candles", ge=1, le=1000),
) -> list[dict[str, Any]]:
    """Get OHLCV data for a symbol.

    Args:
        exchange: Exchange name.
        symbol: Trading symbol.
        timeframe: Data timeframe.
        limit: Number of candles.

    Returns:
        OHLCV data.
    """
    try:
        ohlcv = await client.get_ohlcv(symbol, exchange, timeframe, limit)
        return [candle.model_dump() for candle in ohlcv]
    except Exception as e:
        logger.error("Failed to get OHLCV for %s on %s: %s", symbol, exchange, e)
        raise HTTPException(status_code=500, detail=f"Failed to get OHLCV: {e}")


@router.get("/market_data/{exchange}/{symbol}")
async def get_market_data(
    exchange: Exchange,
    symbol: str,
    timeframe: str = Query("1h", description="Timeframe"),
    limit: int = Query(100, description="Number of candles", ge=1, le=1000),
) -> MarketData:
    """Get complete market data for a symbol.

    Args:
        exchange: Exchange name.
        symbol: Trading symbol.
        timeframe: Data timeframe.
        limit: Number of candles.

    Returns:
        Complete market data.
    """
    try:
        market_data = await client.get_market_data(symbol, exchange, timeframe, limit)
        return market_data
    except Exception as e:
        logger.error("Failed to get market data for %s on %s: %s", symbol, exchange, e)
        raise HTTPException(status_code=500, detail=f"Failed to get market data: {e}")


@router.get("/symbols/{exchange}")
async def get_available_symbols(exchange: Exchange) -> list[str]:
    """Get available trading symbols for an exchange.

    Args:
        exchange: Exchange name.

    Returns:
        List of available symbols.
    """
    try:
        ex = client.get_exchange(exchange)
        markets = ex.load_markets()
        symbols = list(markets.keys())
        return symbols
    except Exception as e:
        logger.error("Failed to get symbols for %s: %s", exchange, e)
        raise HTTPException(status_code=500, detail=f"Failed to get symbols: {e}")


@router.get("/exchanges")
async def get_supported_exchanges() -> list[str]:
    """Get list of supported exchanges.

    Returns:
        List of supported exchange names.
    """
    return [exchange.value for exchange in Exchange]


@router.get("/status/{exchange}")
async def get_exchange_status(exchange: Exchange) -> dict[str, Any]:
    """Get exchange status.

    Args:
        exchange: Exchange name.

    Returns:
        Exchange status information.
    """
    try:
        ex = client.get_exchange(exchange)
        status = ex.fetch_status()

        return {
            "exchange": exchange.value,
            "status": status.get("status", "unknown"),
            "updated": status.get("updated", None),
            "eta": status.get("eta", None),
            "url": status.get("url", None),
        }
    except Exception as e:
        logger.error("Failed to get status for %s: %s", exchange, e)
        raise HTTPException(
            status_code=500, detail=f"Failed to get exchange status: {e}"
        )


@router.get("/prices")
async def get_multiple_prices(
    symbols: str = Query(..., description="Comma-separated symbols"),
    exchange: Exchange = Query(..., description="Exchange name"),
) -> dict[str, float]:
    """Get prices for multiple symbols.

    Args:
        symbols: Comma-separated trading symbols.
        exchange: Exchange name.

    Returns:
        Dictionary of symbol prices.
    """
    try:
        symbol_list = [s.strip() for s in symbols.split(",")]
        prices = {}

        for symbol in symbol_list:
            try:
                ticker = await client.get_ticker(symbol, exchange)
                prices[symbol] = float(ticker.last)
            except Exception as e:
                logger.warning("Failed to get price for %s: %s", symbol, e)
                prices[symbol] = None

        return prices
    except Exception as e:
        logger.error("Failed to get multiple prices: %s", e)
        raise HTTPException(status_code=500, detail=f"Failed to get prices: {e}")


@router.get("/timeframes/{exchange}")
async def get_supported_timeframes(exchange: Exchange) -> list[str]:
    """Get supported timeframes for an exchange.

    Args:
        exchange: Exchange name.

    Returns:
        List of supported timeframes.
    """
    try:
        ex = client.get_exchange(exchange)
        timeframes = list(ex.timeframes.keys()) if hasattr(ex, "timeframes") else []
        return timeframes or ["1m", "5m", "15m", "1h", "4h", "1d"]
    except Exception as e:
        logger.error("Failed to get timeframes for %s: %s", exchange, e)
        raise HTTPException(status_code=500, detail=f"Failed to get timeframes: {e}")
