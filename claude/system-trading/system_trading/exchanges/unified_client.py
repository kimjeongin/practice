"""Unified exchange client using CCXT."""

import logging
from datetime import datetime
from decimal import Decimal

import ccxt
import pandas as pd

from system_trading.config.settings import settings
from system_trading.data.models import (
    OHLCV,
    Balance,
    Exchange,
    MarketData,
    Order,
    OrderSide,
    OrderStatus,
    OrderType,
    Ticker,
    Trade,
)
from system_trading.utils.symbol_converter import symbol_converter
from system_trading.utils.retry import handle_exchange_errors, retry_async, error_aggregator
from system_trading.utils.exceptions import map_ccxt_exception

logger = logging.getLogger(__name__)


class UnifiedExchangeClient:
    """Unified client for multiple exchanges using CCXT."""

    def __init__(self) -> None:
        """Initialize unified exchange client."""
        self.exchanges: dict[Exchange, ccxt.Exchange] = {}
        self._initialize_exchanges()

    def _initialize_exchanges(self) -> None:
        """Initialize exchange connections."""
        # Initialize Binance
        try:
            self.exchanges[Exchange.BINANCE] = ccxt.binance(
                {
                    "apiKey": settings.binance_api_key,
                    "secret": settings.binance_secret_key,
                    "sandbox": settings.binance_testnet,
                    "enableRateLimit": True,
                    "options": {
                        "defaultType": "spot",
                    },
                }
            )
            logger.info(
                "Binance client initialized (testnet=%s)", settings.binance_testnet
            )
        except Exception as e:
            logger.error("Failed to initialize Binance client: %s", e)

        # Initialize Upbit using CCXT
        try:
            self.exchanges[Exchange.UPBIT] = ccxt.upbit(
                {
                    "apiKey": settings.upbit_access_key,
                    "secret": settings.upbit_secret_key,
                    "enableRateLimit": True,
                }
            )
            logger.info("Upbit client initialized")
        except Exception as e:
            logger.error("Failed to initialize Upbit client: %s", e)

    def get_exchange(self, exchange: Exchange) -> ccxt.Exchange:
        """Get exchange instance."""
        if exchange not in self.exchanges:
            raise ValueError(f"Exchange {exchange} not initialized")
        return self.exchanges[exchange]

    @handle_exchange_errors
    async def get_ticker(self, symbol: str, exchange: Exchange) -> Ticker:
        """Get ticker data."""
        try:
            ex = self.get_exchange(exchange)
            # Convert symbol to exchange-specific format
            exchange_symbol = symbol_converter.from_standard_format(symbol, exchange)
            ticker_data = ex.fetch_ticker(exchange_symbol)

            return Ticker(
                symbol=symbol,  # Return in standard format
                timestamp=datetime.fromtimestamp(ticker_data["timestamp"] / 1000),
                bid=Decimal(str(ticker_data["bid"] or 0)),
                ask=Decimal(str(ticker_data["ask"] or 0)),
                last=Decimal(str(ticker_data["last"] or 0)),
                volume=Decimal(str(ticker_data["baseVolume"] or 0)),
                change=Decimal(str(ticker_data["change"] or 0)),
                percentage=Decimal(str(ticker_data["percentage"] or 0)),
            )
        except Exception as e:
            # Map CCXT exceptions to custom exceptions
            custom_exception = map_ccxt_exception(e, exchange.value)
            logger.error("Failed to get ticker for %s on %s: %s", symbol, exchange, custom_exception)
            raise custom_exception

    @handle_exchange_errors
    async def get_ohlcv(
        self,
        symbol: str,
        exchange: Exchange,
        timeframe: str = "1h",
        limit: int = 100,
    ) -> list[OHLCV]:
        """Get OHLCV data."""
        try:
            ex = self.get_exchange(exchange)
            # Convert symbol to exchange-specific format
            exchange_symbol = symbol_converter.from_standard_format(symbol, exchange)
            ohlcv_data = ex.fetch_ohlcv(exchange_symbol, timeframe, limit=limit)

            ohlcv_list = []
            for candle in ohlcv_data:
                ohlcv_list.append(
                    OHLCV(
                        timestamp=datetime.fromtimestamp(candle[0] / 1000),
                        open=Decimal(str(candle[1])),
                        high=Decimal(str(candle[2])),
                        low=Decimal(str(candle[3])),
                        close=Decimal(str(candle[4])),
                        volume=Decimal(str(candle[5])),
                    )
                )

            return ohlcv_list
        except Exception as e:
            logger.error("Failed to get OHLCV for %s on %s: %s", symbol, exchange, e)
            raise

    async def get_market_data(
        self,
        symbol: str,
        exchange: Exchange,
        timeframe: str = "1h",
        limit: int = 100,
    ) -> MarketData:
        """Get complete market data."""
        ohlcv = await self.get_ohlcv(symbol, exchange, timeframe, limit)
        ticker = await self.get_ticker(symbol, exchange)

        return MarketData(
            symbol=symbol,
            ohlcv=ohlcv,
            ticker=ticker,
        )

    @handle_exchange_errors
    async def get_balance(self, exchange: Exchange) -> list[Balance]:
        """Get account balance."""
        try:
            ex = self.get_exchange(exchange)
            balance_data = ex.fetch_balance()

            balances = []
            for asset, balance_info in balance_data.items():
                if (
                    asset not in ["info", "free", "used", "total"]
                    and balance_info["total"] > 0
                ):
                    balances.append(
                        Balance(
                            asset=asset,
                            free=Decimal(str(balance_info["free"] or 0)),
                            locked=Decimal(str(balance_info["used"] or 0)),
                            total=Decimal(str(balance_info["total"] or 0)),
                            exchange=exchange,
                            timestamp=datetime.now(),
                        )
                    )

            return balances
        except Exception as e:
            logger.error("Failed to get balance for %s: %s", exchange, e)
            raise

    @handle_exchange_errors
    async def create_order(
        self,
        symbol: str,
        exchange: Exchange,
        side: OrderSide,
        order_type: OrderType,
        amount: Decimal,
        price: Decimal | None = None,
    ) -> Order:
        """Create order."""
        try:
            ex = self.get_exchange(exchange)

            # Convert symbol to exchange-specific format
            exchange_symbol = symbol_converter.from_standard_format(symbol, exchange)

            # Prepare order parameters
            order_params = {
                "symbol": exchange_symbol,
                "type": order_type.value,
                "side": side.value,
                "amount": float(amount),
            }

            if order_type == OrderType.LIMIT and price is not None:
                order_params["price"] = float(price)

            # Create order
            order_result = ex.create_order(**order_params)

            return Order(
                id=order_result["id"],
                symbol=symbol,
                side=side,
                type=order_type,
                amount=amount,
                price=price,
                filled=Decimal(str(order_result.get("filled", 0))),
                remaining=Decimal(str(order_result.get("remaining", amount))),
                status=self._map_order_status(order_result.get("status", "open")),
                timestamp=datetime.fromtimestamp(order_result["timestamp"] / 1000),
                exchange=exchange,
            )
        except Exception as e:
            logger.error("Failed to create order for %s on %s: %s", symbol, exchange, e)
            raise

    async def cancel_order(
        self, order_id: str, symbol: str, exchange: Exchange
    ) -> Order:
        """Cancel order."""
        try:
            ex = self.get_exchange(exchange)
            order_result = ex.cancel_order(order_id, symbol)

            return Order(
                id=order_result["id"],
                symbol=symbol,
                side=OrderSide(order_result["side"]),
                type=OrderType(order_result["type"]),
                amount=Decimal(str(order_result["amount"])),
                price=Decimal(str(order_result.get("price", 0)))
                if order_result.get("price")
                else None,
                filled=Decimal(str(order_result.get("filled", 0))),
                remaining=Decimal(str(order_result.get("remaining", 0))),
                status=self._map_order_status(order_result.get("status", "canceled")),
                timestamp=datetime.fromtimestamp(order_result["timestamp"] / 1000),
                exchange=exchange,
            )
        except Exception as e:
            logger.error(
                "Failed to cancel order %s for %s on %s: %s",
                order_id,
                symbol,
                exchange,
                e,
            )
            raise

    async def get_order(self, order_id: str, symbol: str, exchange: Exchange) -> Order:
        """Get order status."""
        try:
            ex = self.get_exchange(exchange)
            order_result = ex.fetch_order(order_id, symbol)

            return Order(
                id=order_result["id"],
                symbol=symbol,
                side=OrderSide(order_result["side"]),
                type=OrderType(order_result["type"]),
                amount=Decimal(str(order_result["amount"])),
                price=Decimal(str(order_result.get("price", 0)))
                if order_result.get("price")
                else None,
                filled=Decimal(str(order_result.get("filled", 0))),
                remaining=Decimal(str(order_result.get("remaining", 0))),
                status=self._map_order_status(order_result.get("status", "open")),
                timestamp=datetime.fromtimestamp(order_result["timestamp"] / 1000),
                exchange=exchange,
            )
        except Exception as e:
            logger.error(
                "Failed to get order %s for %s on %s: %s", order_id, symbol, exchange, e
            )
            raise

    async def get_open_orders(
        self, symbol: str | None = None, exchange: Exchange | None = None
    ) -> list[Order]:
        """Get open orders."""
        orders = []

        exchanges_to_check = [exchange] if exchange else list(self.exchanges.keys())

        for ex_name in exchanges_to_check:
            try:
                ex = self.get_exchange(ex_name)
                open_orders = ex.fetch_open_orders(symbol)

                for order_data in open_orders:
                    orders.append(
                        Order(
                            id=order_data["id"],
                            symbol=order_data["symbol"],
                            side=OrderSide(order_data["side"]),
                            type=OrderType(order_data["type"]),
                            amount=Decimal(str(order_data["amount"])),
                            price=Decimal(str(order_data.get("price", 0)))
                            if order_data.get("price")
                            else None,
                            filled=Decimal(str(order_data.get("filled", 0))),
                            remaining=Decimal(str(order_data.get("remaining", 0))),
                            status=self._map_order_status(
                                order_data.get("status", "open")
                            ),
                            timestamp=datetime.fromtimestamp(
                                order_data["timestamp"] / 1000
                            ),
                            exchange=ex_name,
                        )
                    )
            except Exception as e:
                logger.error("Failed to get open orders for %s: %s", ex_name, e)

        return orders

    async def get_trades(
        self,
        symbol: str | None = None,
        exchange: Exchange | None = None,
        limit: int = 100,
    ) -> list[Trade]:
        """Get trade history."""
        trades = []

        exchanges_to_check = [exchange] if exchange else list(self.exchanges.keys())

        for ex_name in exchanges_to_check:
            try:
                ex = self.get_exchange(ex_name)
                trade_data = ex.fetch_my_trades(symbol, limit=limit)

                for trade_info in trade_data:
                    trades.append(
                        Trade(
                            id=trade_info["id"],
                            order_id=trade_info.get("order", ""),
                            symbol=trade_info["symbol"],
                            side=OrderSide(trade_info["side"]),
                            amount=Decimal(str(trade_info["amount"])),
                            price=Decimal(str(trade_info["price"])),
                            fee=Decimal(str(trade_info.get("fee", {}).get("cost", 0))),
                            fee_currency=trade_info.get("fee", {}).get("currency", ""),
                            timestamp=datetime.fromtimestamp(
                                trade_info["timestamp"] / 1000
                            ),
                            exchange=ex_name,
                        )
                    )
            except Exception as e:
                logger.error("Failed to get trades for %s: %s", ex_name, e)

        return trades

    def get_ohlcv_dataframe(
        self,
        symbol: str,
        exchange: Exchange,
        timeframe: str = "1h",
        limit: int = 100,
    ) -> pd.DataFrame:
        """Get OHLCV data as pandas DataFrame."""
        try:
            ex = self.get_exchange(exchange)
            ohlcv_data = ex.fetch_ohlcv(symbol, timeframe, limit=limit)

            df = pd.DataFrame(
                ohlcv_data,
                columns=["timestamp", "open", "high", "low", "close", "volume"],
            )
            df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms")
            df.set_index("timestamp", inplace=True)

            return df
        except Exception as e:
            logger.error(
                "Failed to get OHLCV DataFrame for %s on %s: %s", symbol, exchange, e
            )
            raise

    def _map_order_status(self, status: str) -> OrderStatus:
        """Map exchange order status to internal status."""
        status_mapping = {
            "open": OrderStatus.OPEN,
            "closed": OrderStatus.CLOSED,
            "canceled": OrderStatus.CANCELED,
            "cancelled": OrderStatus.CANCELED,
            "rejected": OrderStatus.REJECTED,
            "pending": OrderStatus.PENDING,
        }
        return status_mapping.get(status.lower(), OrderStatus.OPEN)
