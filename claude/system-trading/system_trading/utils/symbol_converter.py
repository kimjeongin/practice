"""Symbol conversion utilities for multi-exchange compatibility."""

import logging
import re
from typing import Dict, Optional, Tuple

from system_trading.data.models import Exchange

logger = logging.getLogger(__name__)


class SymbolConverter:
    """Convert symbols between different exchange formats."""

    def __init__(self) -> None:
        """Initialize symbol converter."""
        # Standard symbol format: "BASE/QUOTE" (e.g., "BTC/USDT")
        self.standard_format = "{base}/{quote}"

        # Exchange-specific symbol patterns
        self.exchange_patterns = {
            Exchange.BINANCE: {
                "pattern": r"^([A-Z]+)\/([A-Z]+)$",  # BTC/USDT
                "format": "{base}{quote}",  # BTCUSDT
                "separator": "",
            },
            Exchange.UPBIT: {
                "pattern": r"^([A-Z]+)-([A-Z]+)$",  # KRW-BTC
                "format": "{quote}-{base}",  # KRW-BTC
                "separator": "-",
            },
        }

        # Common symbol mappings
        self.symbol_aliases = {
            "BTC": ["BITCOIN", "XBT"],
            "ETH": ["ETHEREUM"],
            "USDT": ["TETHER"],
            "BNB": ["BINANCECOIN"],
            "ADA": ["CARDANO"],
            "DOT": ["POLKADOT"],
            "LINK": ["CHAINLINK"],
            "UNI": ["UNISWAP"],
        }

        # Quote currency mappings for each exchange
        self.quote_currencies = {
            Exchange.BINANCE: ["USDT", "BTC", "ETH", "BNB", "USDC"],
            Exchange.UPBIT: ["KRW", "BTC", "USDT"],
        }

    def to_standard_format(self, symbol: str, exchange: Exchange) -> str:
        """Convert exchange-specific symbol to standard format.

        Args:
            symbol: Exchange-specific symbol (e.g., "BTCUSDT", "KRW-BTC")
            exchange: Source exchange

        Returns:
            Standard format symbol (e.g., "BTC/USDT")
        """
        try:
            if exchange == Exchange.BINANCE:
                return self._from_binance_format(symbol)
            elif exchange == Exchange.UPBIT:
                return self._from_upbit_format(symbol)
            else:
                # Assume already in standard format
                return symbol

        except Exception as e:
            logger.error("Failed to convert symbol %s from %s: %s", symbol, exchange, e)
            return symbol

    def from_standard_format(self, symbol: str, exchange: Exchange) -> str:
        """Convert standard format symbol to exchange-specific format.

        Args:
            symbol: Standard format symbol (e.g., "BTC/USDT")
            exchange: Target exchange

        Returns:
            Exchange-specific symbol (e.g., "BTCUSDT", "KRW-BTC")
        """
        try:
            base, quote = self._parse_standard_symbol(symbol)

            if exchange == Exchange.BINANCE:
                return self._to_binance_format(base, quote)
            elif exchange == Exchange.UPBIT:
                return self._to_upbit_format(base, quote)
            else:
                return symbol

        except Exception as e:
            logger.error("Failed to convert symbol %s to %s: %s", symbol, exchange, e)
            return symbol

    def _parse_standard_symbol(self, symbol: str) -> Tuple[str, str]:
        """Parse standard format symbol into base and quote."""
        if "/" not in symbol:
            raise ValueError(f"Invalid standard symbol format: {symbol}")

        parts = symbol.split("/")
        if len(parts) != 2:
            raise ValueError(f"Invalid standard symbol format: {symbol}")

        return parts[0].upper(), parts[1].upper()

    def _from_binance_format(self, symbol: str) -> str:
        """Convert Binance format to standard format."""
        # Remove any "/" if present (already standard)
        if "/" in symbol:
            return symbol.upper()

        # Try to split symbol into base and quote
        base, quote = self._split_binance_symbol(symbol)
        return f"{base}/{quote}"

    def _split_binance_symbol(self, symbol: str) -> Tuple[str, str]:
        """Split Binance symbol into base and quote currencies."""
        symbol = symbol.upper()

        # Check against known quote currencies
        for quote in self.quote_currencies[Exchange.BINANCE]:
            if symbol.endswith(quote):
                base = symbol[:-len(quote)]
                if base:  # Ensure base is not empty
                    return base, quote

        # Fallback: assume last 4 characters are quote (for USDT)
        if len(symbol) > 4:
            base = symbol[:-4]
            quote = symbol[-4:]
            return base, quote

        raise ValueError(f"Cannot split Binance symbol: {symbol}")

    def _to_binance_format(self, base: str, quote: str) -> str:
        """Convert to Binance format."""
        return f"{base.upper()}{quote.upper()}"

    def _from_upbit_format(self, symbol: str) -> str:
        """Convert Upbit format to standard format."""
        if "-" not in symbol:
            raise ValueError(f"Invalid Upbit symbol format: {symbol}")

        parts = symbol.split("-")
        if len(parts) != 2:
            raise ValueError(f"Invalid Upbit symbol format: {symbol}")

        quote, base = parts  # Upbit format is QUOTE-BASE
        return f"{base.upper()}/{quote.upper()}"

    def _to_upbit_format(self, base: str, quote: str) -> str:
        """Convert to Upbit format."""
        return f"{quote.upper()}-{base.upper()}"

    def get_supported_symbols(self, exchange: Exchange) -> Dict[str, str]:
        """Get mapping of standard symbols to exchange-specific symbols.

        Args:
            exchange: Target exchange

        Returns:
            Dictionary mapping standard symbols to exchange symbols
        """
        # This would typically be fetched from exchange API
        # For now, return common trading pairs
        common_pairs = {
            Exchange.BINANCE: [
                "BTC/USDT", "ETH/USDT", "BNB/USDT", "ADA/USDT",
                "DOT/USDT", "LINK/USDT", "UNI/USDT", "SOL/USDT",
                "ETH/BTC", "ADA/BTC", "DOT/BTC"
            ],
            Exchange.UPBIT: [
                "BTC/KRW", "ETH/KRW", "ADA/KRW", "DOT/KRW",
                "LINK/KRW", "SOL/KRW", "XRP/KRW", "DOGE/KRW"
            ]
        }

        result = {}
        for standard_symbol in common_pairs.get(exchange, []):
            exchange_symbol = self.from_standard_format(standard_symbol, exchange)
            result[standard_symbol] = exchange_symbol

        return result

    def is_valid_symbol(self, symbol: str, exchange: Exchange) -> bool:
        """Check if symbol is valid for the given exchange.

        Args:
            symbol: Symbol to validate
            exchange: Target exchange

        Returns:
            True if symbol is valid for the exchange
        """
        try:
            if exchange == Exchange.BINANCE:
                # Binance accepts concatenated format (BTCUSDT) or standard (BTC/USDT)
                if "/" in symbol:
                    base, quote = self._parse_standard_symbol(symbol)
                    return quote in self.quote_currencies[Exchange.BINANCE]
                else:
                    # Try to split and validate
                    base, quote = self._split_binance_symbol(symbol)
                    return quote in self.quote_currencies[Exchange.BINANCE]

            elif exchange == Exchange.UPBIT:
                # Upbit uses KRW-BTC format
                if "-" in symbol:
                    parts = symbol.split("-")
                    if len(parts) == 2:
                        quote, base = parts
                        return quote in self.quote_currencies[Exchange.UPBIT]
                elif "/" in symbol:
                    # Convert from standard and check
                    upbit_symbol = self.from_standard_format(symbol, exchange)
                    return self.is_valid_symbol(upbit_symbol, exchange)

            return False

        except Exception as e:
            logger.error("Error validating symbol %s for %s: %s", symbol, exchange, e)
            return False

    def normalize_symbol(self, symbol: str) -> str:
        """Normalize symbol to consistent case and format.

        Args:
            symbol: Symbol to normalize

        Returns:
            Normalized symbol
        """
        # Convert to uppercase and handle common formats
        symbol = symbol.upper().strip()

        # Handle different separators
        symbol = symbol.replace("_", "/").replace("-", "/")

        # Ensure single separator
        if symbol.count("/") > 1:
            parts = symbol.split("/")
            symbol = f"{parts[0]}/{parts[-1]}"  # Take first and last part

        return symbol

    def get_quote_currency(self, symbol: str, exchange: Exchange) -> Optional[str]:
        """Extract quote currency from symbol.

        Args:
            symbol: Symbol to analyze
            exchange: Exchange context

        Returns:
            Quote currency or None if not found
        """
        try:
            standard_symbol = self.to_standard_format(symbol, exchange)
            base, quote = self._parse_standard_symbol(standard_symbol)
            return quote

        except Exception as e:
            logger.error("Error extracting quote currency from %s: %s", symbol, e)
            return None

    def get_base_currency(self, symbol: str, exchange: Exchange) -> Optional[str]:
        """Extract base currency from symbol.

        Args:
            symbol: Symbol to analyze
            exchange: Exchange context

        Returns:
            Base currency or None if not found
        """
        try:
            standard_symbol = self.to_standard_format(symbol, exchange)
            base, quote = self._parse_standard_symbol(standard_symbol)
            return base

        except Exception as e:
            logger.error("Error extracting base currency from %s: %s", symbol, e)
            return None


# Global symbol converter instance
symbol_converter = SymbolConverter()