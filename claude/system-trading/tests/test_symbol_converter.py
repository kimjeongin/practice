"""Tests for symbol converter utility."""

import pytest

from system_trading.data.models import Exchange
from system_trading.utils.symbol_converter import SymbolConverter


class TestSymbolConverter:
    """Test cases for SymbolConverter."""

    def setup_method(self) -> None:
        """Set up test fixtures."""
        self.converter = SymbolConverter()

    def test_binance_symbol_conversion(self) -> None:
        """Test Binance symbol conversion."""
        # Standard to Binance
        assert self.converter.from_standard_format("BTC/USDT", Exchange.BINANCE) == "BTCUSDT"
        assert self.converter.from_standard_format("ETH/BTC", Exchange.BINANCE) == "ETHBTC"

        # Binance to standard
        assert self.converter.to_standard_format("BTCUSDT", Exchange.BINANCE) == "BTC/USDT"
        assert self.converter.to_standard_format("ETHBTC", Exchange.BINANCE) == "ETH/BTC"

    def test_upbit_symbol_conversion(self) -> None:
        """Test Upbit symbol conversion."""
        # Standard to Upbit
        assert self.converter.from_standard_format("BTC/KRW", Exchange.UPBIT) == "KRW-BTC"
        assert self.converter.from_standard_format("ETH/KRW", Exchange.UPBIT) == "KRW-ETH"

        # Upbit to standard
        assert self.converter.to_standard_format("KRW-BTC", Exchange.UPBIT) == "BTC/KRW"
        assert self.converter.to_standard_format("KRW-ETH", Exchange.UPBIT) == "ETH/KRW"

    def test_parse_standard_symbol(self) -> None:
        """Test parsing standard symbol format."""
        base, quote = self.converter._parse_standard_symbol("BTC/USDT")
        assert base == "BTC"
        assert quote == "USDT"

        # Test error handling
        with pytest.raises(ValueError):
            self.converter._parse_standard_symbol("BTCUSDT")  # No separator

        with pytest.raises(ValueError):
            self.converter._parse_standard_symbol("BTC/USDT/ETH")  # Too many parts

    def test_split_binance_symbol(self) -> None:
        """Test splitting Binance symbol."""
        base, quote = self.converter._split_binance_symbol("BTCUSDT")
        assert base == "BTC"
        assert quote == "USDT"

        base, quote = self.converter._split_binance_symbol("ETHBTC")
        assert base == "ETH"
        assert quote == "BTC"

        # Test with longer symbols
        base, quote = self.converter._split_binance_symbol("ADAUSDT")
        assert base == "ADA"
        assert quote == "USDT"

    def test_symbol_validation(self) -> None:
        """Test symbol validation for exchanges."""
        # Valid Binance symbols
        assert self.converter.is_valid_symbol("BTC/USDT", Exchange.BINANCE)
        assert self.converter.is_valid_symbol("BTCUSDT", Exchange.BINANCE)
        assert self.converter.is_valid_symbol("ETH/BTC", Exchange.BINANCE)

        # Valid Upbit symbols
        assert self.converter.is_valid_symbol("BTC/KRW", Exchange.UPBIT)
        assert self.converter.is_valid_symbol("KRW-BTC", Exchange.UPBIT)

        # Invalid symbols
        assert not self.converter.is_valid_symbol("BTC/EUR", Exchange.UPBIT)  # EUR not supported on Upbit
        assert not self.converter.is_valid_symbol("INVALID", Exchange.BINANCE)

    def test_get_quote_currency(self) -> None:
        """Test extracting quote currency."""
        assert self.converter.get_quote_currency("BTC/USDT", Exchange.BINANCE) == "USDT"
        assert self.converter.get_quote_currency("BTCUSDT", Exchange.BINANCE) == "USDT"
        assert self.converter.get_quote_currency("KRW-BTC", Exchange.UPBIT) == "KRW"

    def test_get_base_currency(self) -> None:
        """Test extracting base currency."""
        assert self.converter.get_base_currency("BTC/USDT", Exchange.BINANCE) == "BTC"
        assert self.converter.get_base_currency("BTCUSDT", Exchange.BINANCE) == "BTC"
        assert self.converter.get_base_currency("KRW-BTC", Exchange.UPBIT) == "BTC"

    def test_normalize_symbol(self) -> None:
        """Test symbol normalization."""
        assert self.converter.normalize_symbol("btc/usdt") == "BTC/USDT"
        assert self.converter.normalize_symbol("BTC_USDT") == "BTC/USDT"
        assert self.converter.normalize_symbol("btc-usdt") == "BTC/USDT"
        assert self.converter.normalize_symbol(" BTC/USDT ") == "BTC/USDT"

    def test_get_supported_symbols(self) -> None:
        """Test getting supported symbols mapping."""
        binance_symbols = self.converter.get_supported_symbols(Exchange.BINANCE)
        assert "BTC/USDT" in binance_symbols
        assert binance_symbols["BTC/USDT"] == "BTCUSDT"

        upbit_symbols = self.converter.get_supported_symbols(Exchange.UPBIT)
        assert "BTC/KRW" in upbit_symbols
        assert upbit_symbols["BTC/KRW"] == "KRW-BTC"

    def test_error_handling(self) -> None:
        """Test error handling in symbol conversion."""
        # Should not raise exception but return original symbol
        result = self.converter.to_standard_format("INVALID", Exchange.BINANCE)
        assert result == "INVALID"

        result = self.converter.from_standard_format("INVALID", Exchange.BINANCE)
        assert result == "INVALID"

    def test_already_standard_format(self) -> None:
        """Test conversion when symbol is already in standard format."""
        # Should pass through unchanged
        assert self.converter.to_standard_format("BTC/USDT", Exchange.BINANCE) == "BTC/USDT"

    def test_case_insensitive_handling(self) -> None:
        """Test case insensitive symbol handling."""
        assert self.converter.from_standard_format("btc/usdt", Exchange.BINANCE) == "BTCUSDT"
        assert self.converter.to_standard_format("btcusdt", Exchange.BINANCE) == "BTC/USDT"