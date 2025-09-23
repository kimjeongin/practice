"""Data management for backtesting."""

import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import pandas as pd

from system_trading.data.models import Exchange
from system_trading.exchanges.unified_client import UnifiedExchangeClient

logger = logging.getLogger(__name__)


class BacktestDataManager:
    """Manages historical data for backtesting."""

    def __init__(self, data_dir: str = "data") -> None:
        """Initialize data manager.

        Args:
            data_dir: Directory to store historical data.
        """
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(exist_ok=True)
        self.client = UnifiedExchangeClient()

    def get_historical_data(
        self,
        symbol: str,
        exchange: Exchange,
        timeframe: str = "1h",
        start_date: datetime | None = None,
        end_date: datetime | None = None,
        limit: int = 1000,
        use_cache: bool = True,
    ) -> pd.DataFrame:
        """Get historical OHLCV data.

        Args:
            symbol: Trading symbol.
            exchange: Exchange name.
            timeframe: Data timeframe.
            start_date: Start date for data.
            end_date: End date for data.
            limit: Maximum number of candles.
            use_cache: Whether to use cached data.

        Returns:
            OHLCV DataFrame with datetime index.
        """
        try:
            # Generate cache filename
            cache_file = self._get_cache_filename(symbol, exchange, timeframe)

            # Try to load from cache first
            if use_cache and cache_file.exists():
                cached_data = self._load_cached_data(cache_file)
                if self._is_cache_valid(cached_data, start_date, end_date):
                    logger.info(
                        "Using cached data for %s %s %s", symbol, exchange, timeframe
                    )
                    return self._filter_data_by_date(cached_data, start_date, end_date)

            # Fetch fresh data
            logger.info("Fetching fresh data for %s %s %s", symbol, exchange, timeframe)
            data = self.client.get_ohlcv_dataframe(symbol, exchange, timeframe, limit)

            # Cache the data
            if use_cache:
                self._save_cached_data(data, cache_file)

            # Filter by date range
            if start_date or end_date:
                data = self._filter_data_by_date(data, start_date, end_date)

            return data

        except Exception as e:
            logger.error("Failed to get historical data for %s: %s", symbol, e)
            raise

    def download_bulk_data(
        self,
        symbols: list[str],
        exchange: Exchange,
        timeframes: list[str] = None,
        days_back: int = 365,
    ) -> dict[str, dict[str, pd.DataFrame]]:
        """Download bulk historical data.

        Args:
            symbols: List of trading symbols.
            exchange: Exchange name.
            timeframes: List of timeframes to download.
            days_back: Number of days to go back.

        Returns:
            Nested dictionary: {symbol: {timeframe: DataFrame}}.
        """
        if timeframes is None:
            timeframes = ["1h", "4h", "1d"]
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days_back)

        results = {}

        for symbol in symbols:
            results[symbol] = {}
            for timeframe in timeframes:
                try:
                    logger.info("Downloading %s %s %s", symbol, exchange, timeframe)
                    data = self.get_historical_data(
                        symbol=symbol,
                        exchange=exchange,
                        timeframe=timeframe,
                        start_date=start_date,
                        end_date=end_date,
                    )
                    results[symbol][timeframe] = data
                    logger.info(
                        "Downloaded %d candles for %s %s", len(data), symbol, timeframe
                    )

                except Exception as e:
                    logger.error(
                        "Failed to download %s %s %s: %s",
                        symbol,
                        exchange,
                        timeframe,
                        e,
                    )
                    results[symbol][timeframe] = pd.DataFrame()

        return results

    def update_cached_data(
        self,
        symbol: str,
        exchange: Exchange,
        timeframe: str = "1h",
    ) -> pd.DataFrame:
        """Update cached data with latest candles.

        Args:
            symbol: Trading symbol.
            exchange: Exchange name.
            timeframe: Data timeframe.

        Returns:
            Updated OHLCV DataFrame.
        """
        try:
            cache_file = self._get_cache_filename(symbol, exchange, timeframe)

            # Load existing data
            if cache_file.exists():
                existing_data = self._load_cached_data(cache_file)
                existing_data.index[-1]

                # Get latest data
                new_data = self.client.get_ohlcv_dataframe(
                    symbol, exchange, timeframe, limit=100
                )

                # Merge data
                combined_data = pd.concat([existing_data, new_data])
                combined_data = combined_data[
                    ~combined_data.index.duplicated(keep="last")
                ]
                combined_data = combined_data.sort_index()

            else:
                # Get fresh data
                combined_data = self.client.get_ohlcv_dataframe(
                    symbol, exchange, timeframe, limit=1000
                )

            # Save updated data
            self._save_cached_data(combined_data, cache_file)

            logger.info("Updated cached data for %s %s %s", symbol, exchange, timeframe)
            return combined_data

        except Exception as e:
            logger.error("Failed to update cached data for %s: %s", symbol, e)
            raise

    def _get_cache_filename(
        self, symbol: str, exchange: Exchange, timeframe: str
    ) -> Path:
        """Generate cache filename."""
        safe_symbol = symbol.replace("/", "_").replace("-", "_")
        filename = f"{exchange.value}_{safe_symbol}_{timeframe}.parquet"
        return self.data_dir / filename

    def _load_cached_data(self, cache_file: Path) -> pd.DataFrame:
        """Load data from cache file."""
        try:
            data = pd.read_parquet(cache_file)
            data.index = pd.to_datetime(data.index)
            return data
        except Exception as e:
            logger.warning("Failed to load cached data from %s: %s", cache_file, e)
            return pd.DataFrame()

    def _save_cached_data(self, data: pd.DataFrame, cache_file: Path) -> None:
        """Save data to cache file."""
        try:
            data.to_parquet(cache_file)
            logger.debug("Saved cached data to %s", cache_file)
        except Exception as e:
            logger.warning("Failed to save cached data to %s: %s", cache_file, e)

    def _is_cache_valid(
        self,
        cached_data: pd.DataFrame,
        start_date: datetime | None,
        end_date: datetime | None,
    ) -> bool:
        """Check if cached data is valid for the requested date range."""
        if cached_data.empty:
            return False

        cache_start = cached_data.index[0]
        cache_end = cached_data.index[-1]

        # Check if cache covers requested range
        if start_date and cache_start > start_date:
            return False

        if end_date and cache_end < end_date:
            return False

        # Check if cache is recent (within last hour)
        now = datetime.now()
        if (now - cache_end.to_pydatetime()).total_seconds() > 3600:
            return False

        return True

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

    def prepare_backtest_data(
        self,
        symbol: str,
        exchange: Exchange,
        timeframe: str = "1h",
        start_date: datetime | None = None,
        end_date: datetime | None = None,
        validate: bool = True,
    ) -> pd.DataFrame:
        """Prepare and validate data for backtesting.

        Args:
            symbol: Trading symbol.
            exchange: Exchange name.
            timeframe: Data timeframe.
            start_date: Start date for backtest.
            end_date: End date for backtest.
            validate: Whether to validate data quality.

        Returns:
            Clean OHLCV DataFrame ready for backtesting.
        """
        try:
            # Get historical data
            data = self.get_historical_data(
                symbol=symbol,
                exchange=exchange,
                timeframe=timeframe,
                start_date=start_date,
                end_date=end_date,
            )

            if validate:
                data = self._validate_and_clean_data(data)

            logger.info("Prepared %d candles for backtesting %s", len(data), symbol)
            return data

        except Exception as e:
            logger.error("Failed to prepare backtest data for %s: %s", symbol, e)
            raise

    def _validate_and_clean_data(self, data: pd.DataFrame) -> pd.DataFrame:
        """Validate and clean OHLCV data."""
        try:
            original_length = len(data)

            # Remove rows with missing values
            data = data.dropna()

            # Remove rows with zero or negative prices
            price_columns = ["open", "high", "low", "close"]
            for col in price_columns:
                if col in data.columns:
                    data = data[data[col] > 0]

            # Remove rows with zero volume
            if "volume" in data.columns:
                data = data[data["volume"] >= 0]

            # Validate OHLC relationships
            data = data[
                (data["low"] <= data["high"])
                & (data["low"] <= data["open"])
                & (data["low"] <= data["close"])
                & (data["high"] >= data["open"])
                & (data["high"] >= data["close"])
            ]

            # Remove extreme outliers (more than 10x price change)
            if "close" in data.columns:
                price_change = data["close"].pct_change().abs()
                data = data[price_change < 10.0]

            cleaned_length = len(data)
            if cleaned_length < original_length:
                logger.warning(
                    "Removed %d invalid candles (%d -> %d)",
                    original_length - cleaned_length,
                    original_length,
                    cleaned_length,
                )

            return data

        except Exception as e:
            logger.error("Data validation failed: %s", e)
            raise

    def get_data_info(
        self, symbol: str, exchange: Exchange, timeframe: str
    ) -> dict[str, Any]:
        """Get information about cached data.

        Args:
            symbol: Trading symbol.
            exchange: Exchange name.
            timeframe: Data timeframe.

        Returns:
            Data information dictionary.
        """
        try:
            cache_file = self._get_cache_filename(symbol, exchange, timeframe)

            if not cache_file.exists():
                return {"cached": False}

            data = self._load_cached_data(cache_file)

            if data.empty:
                return {"cached": False}

            return {
                "cached": True,
                "start_date": data.index[0].isoformat(),
                "end_date": data.index[-1].isoformat(),
                "total_candles": len(data),
                "file_size": cache_file.stat().st_size,
                "last_modified": datetime.fromtimestamp(
                    cache_file.stat().st_mtime
                ).isoformat(),
            }

        except Exception as e:
            logger.error("Failed to get data info for %s: %s", symbol, e)
            return {"cached": False, "error": str(e)}
