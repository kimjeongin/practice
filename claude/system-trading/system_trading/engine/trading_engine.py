"""Main trading engine for automated trading."""

import asyncio
import logging
from datetime import datetime
from typing import Any

from system_trading.data.models import (
    Exchange,
    Order,
    OrderSide,
    OrderStatus,
    OrderType,
    Position,
    TradingSignal,
)
from system_trading.data.portfolio_manager import PortfolioManager
from system_trading.exchanges.unified_client import UnifiedExchangeClient
from system_trading.strategies.base_strategy import BaseStrategy

logger = logging.getLogger(__name__)


class TradingEngine:
    """Main trading engine for automated strategy execution."""

    def __init__(self) -> None:
        """Initialize trading engine."""
        self.client = UnifiedExchangeClient()
        self.portfolio_manager = PortfolioManager()
        self.strategies: dict[str, BaseStrategy] = {}
        self.active_symbols: dict[Exchange, list[str]] = {}
        self.is_running = False
        self.update_interval = 60  # seconds
        self.max_concurrent_orders = 5
        self.active_orders: dict[str, Order] = {}

    def add_strategy(
        self,
        name: str,
        strategy: BaseStrategy,
        symbols: list[str],
        exchanges: list[Exchange],
    ) -> None:
        """Add a trading strategy.

        Args:
            name: Strategy identifier.
            strategy: Strategy instance.
            symbols: List of symbols to trade.
            exchanges: List of exchanges to use.
        """
        self.strategies[name] = strategy

        # Add symbols to active list
        for exchange in exchanges:
            if exchange not in self.active_symbols:
                self.active_symbols[exchange] = []

            for symbol in symbols:
                if symbol not in self.active_symbols[exchange]:
                    self.active_symbols[exchange].append(symbol)

        logger.info(
            "Added strategy %s for %d symbols on %d exchanges",
            name,
            len(symbols),
            len(exchanges),
        )

    def remove_strategy(self, name: str) -> None:
        """Remove a trading strategy.

        Args:
            name: Strategy identifier.
        """
        if name in self.strategies:
            del self.strategies[name]
            logger.info("Removed strategy %s", name)

    async def start(self) -> None:
        """Start the trading engine."""
        if self.is_running:
            logger.warning("Trading engine is already running")
            return

        self.is_running = True
        logger.info("Starting trading engine")

        try:
            # Initialize portfolio state
            await self._initialize_portfolio()

            # Start main trading loop
            await self._trading_loop()

        except Exception as e:
            logger.error("Trading engine error: %s", e)
            self.is_running = False

    async def stop(self) -> None:
        """Stop the trading engine."""
        logger.info("Stopping trading engine")
        self.is_running = False

        # Cancel all open orders
        await self._cancel_all_orders()

    async def _initialize_portfolio(self) -> None:
        """Initialize portfolio state."""
        logger.info("Initializing portfolio state")

        # Update balances for all exchanges
        for exchange in self.active_symbols.keys():
            try:
                balances = await self.client.get_balance(exchange)
                for balance in balances:
                    self.portfolio_manager.update_balance(balance)

                logger.debug("Updated balances for %s", exchange)

            except Exception as e:
                logger.error("Failed to update balance for %s: %s", exchange, e)

        # Get current positions
        await self._update_positions()

    async def _trading_loop(self) -> None:
        """Main trading loop."""
        logger.info("Starting trading loop")

        while self.is_running:
            try:
                # Update market data and generate signals
                signals = await self._generate_signals()

                # Process signals and place orders
                await self._process_signals(signals)

                # Update open orders
                await self._update_orders()

                # Update portfolio
                await self._update_portfolio()

                # Wait for next iteration
                await asyncio.sleep(self.update_interval)

            except Exception as e:
                logger.error("Error in trading loop: %s", e)
                await asyncio.sleep(self.update_interval)

    async def _generate_signals(self) -> list[TradingSignal]:
        """Generate trading signals from all strategies."""
        signals = []

        for exchange, symbols in self.active_symbols.items():
            for symbol in symbols:
                try:
                    # Get market data
                    await self.client.get_market_data(
                        symbol=symbol,
                        exchange=exchange,
                        timeframe="1h",
                        limit=200,
                    )

                    # Convert to DataFrame
                    data = self.client.get_ohlcv_dataframe(
                        symbol=symbol,
                        exchange=exchange,
                        timeframe="1h",
                        limit=200,
                    )

                    if data.empty:
                        continue

                    # Generate signals from all strategies
                    for strategy_name, strategy in self.strategies.items():
                        try:
                            signal = strategy.generate_signal(data)
                            if signal:
                                signal.symbol = symbol  # Ensure symbol is set
                                signals.append(signal)
                                logger.debug(
                                    "Generated %s signal for %s from %s",
                                    signal.side,
                                    symbol,
                                    strategy_name,
                                )

                        except Exception as e:
                            logger.error(
                                "Error generating signal from %s for %s: %s",
                                strategy_name,
                                symbol,
                                e,
                            )

                except Exception as e:
                    logger.error(
                        "Error getting market data for %s on %s: %s",
                        symbol,
                        exchange,
                        e,
                    )

        logger.info("Generated %d signals", len(signals))
        return signals

    async def _process_signals(self, signals: list[TradingSignal]) -> None:
        """Process trading signals and place orders."""
        if not signals:
            return

        # Filter and prioritize signals
        filtered_signals = self._filter_signals(signals)

        # Process each signal
        for signal in filtered_signals:
            try:
                await self._execute_signal(signal)

            except Exception as e:
                logger.error("Error executing signal for %s: %s", signal.symbol, e)

    def _filter_signals(self, signals: list[TradingSignal]) -> list[TradingSignal]:
        """Filter and prioritize signals."""
        # Remove signals for symbols with existing orders
        symbols_with_orders = {order.symbol for order in self.active_orders.values()}
        filtered = [s for s in signals if s.symbol not in symbols_with_orders]

        # Sort by confidence and strength
        filtered.sort(key=lambda s: s.confidence * s.strength, reverse=True)

        # Limit concurrent orders
        remaining_slots = max(0, self.max_concurrent_orders - len(self.active_orders))
        return filtered[:remaining_slots]

    async def _execute_signal(self, signal: TradingSignal) -> None:
        """Execute a trading signal."""
        # Determine exchange (for now, use first available exchange for the symbol)
        exchange = next(
            ex
            for ex, symbols in self.active_symbols.items()
            if signal.symbol in symbols
        )

        # Get current market data
        ticker = await self.client.get_ticker(signal.symbol, exchange)
        current_price = ticker.last

        # Calculate position size
        position_size = self.portfolio_manager.calculate_position_size(
            symbol=signal.symbol,
            exchange=exchange,
            current_price=current_price,
            signal_strength=signal.strength,
        )

        if position_size <= 0:
            logger.warning("Position size is zero for %s", signal.symbol)
            return

        # Check if we already have a position
        existing_position = self.portfolio_manager.get_position(signal.symbol, exchange)

        # Determine order action
        if existing_position:
            # Handle position management
            await self._handle_existing_position(signal, existing_position, exchange)
        else:
            # Open new position
            await self._open_new_position(signal, position_size, exchange)

    async def _handle_existing_position(
        self,
        signal: TradingSignal,
        position: Position,
        exchange: Exchange,
    ) -> None:
        """Handle signals when we already have a position."""
        # If signal direction opposite to position, consider closing
        if (position.side == OrderSide.BUY and signal.side == OrderSide.SELL) or (
            position.side == OrderSide.SELL and signal.side == OrderSide.BUY
        ):
            # Close position if signal is strong enough
            if signal.confidence > 0.7:
                await self._close_position(position, exchange)

    async def _open_new_position(
        self,
        signal: TradingSignal,
        position_size: float,
        exchange: Exchange,
    ) -> None:
        """Open a new position based on signal."""
        try:
            # Place market order
            order = await self.client.create_order(
                symbol=signal.symbol,
                exchange=exchange,
                side=signal.side,
                order_type=OrderType.MARKET,
                amount=position_size,
            )

            # Track order
            self.active_orders[order.id] = order

            logger.info(
                "Opened position: %s %s %s @ market",
                signal.side,
                position_size,
                signal.symbol,
            )

        except Exception as e:
            logger.error("Failed to open position for %s: %s", signal.symbol, e)

    async def _close_position(self, position: Position, exchange: Exchange) -> None:
        """Close an existing position."""
        try:
            # Determine opposite side
            close_side = (
                OrderSide.SELL if position.side == OrderSide.BUY else OrderSide.BUY
            )

            # Place market order to close
            order = await self.client.create_order(
                symbol=position.symbol,
                exchange=exchange,
                side=close_side,
                order_type=OrderType.MARKET,
                amount=abs(position.size),
            )

            # Track order
            self.active_orders[order.id] = order

            logger.info("Closed position: %s %s", position.symbol, position.side)

        except Exception as e:
            logger.error("Failed to close position for %s: %s", position.symbol, e)

    async def _update_orders(self) -> None:
        """Update status of active orders."""
        completed_orders = []

        for order_id, order in self.active_orders.items():
            try:
                # Get updated order status
                updated_order = await self.client.get_order(
                    order_id=order_id,
                    symbol=order.symbol,
                    exchange=order.exchange,
                )

                # Update order in tracking
                self.active_orders[order_id] = updated_order

                # Check if order is completed
                if updated_order.status in [OrderStatus.CLOSED, OrderStatus.CANCELED]:
                    completed_orders.append(order_id)

                    if updated_order.status == OrderStatus.CLOSED:
                        logger.info("Order completed: %s", order_id)
                    else:
                        logger.info("Order canceled: %s", order_id)

            except Exception as e:
                logger.error("Failed to update order %s: %s", order_id, e)

        # Remove completed orders
        for order_id in completed_orders:
            del self.active_orders[order_id]

    async def _update_portfolio(self) -> None:
        """Update portfolio state."""
        try:
            # Update balances
            for exchange in self.active_symbols.keys():
                balances = await self.client.get_balance(exchange)
                for balance in balances:
                    self.portfolio_manager.update_balance(balance)

            # Update positions
            await self._update_positions()

            # Log portfolio summary periodically
            if datetime.now().minute == 0:  # Once per hour
                portfolio = self.portfolio_manager.get_portfolio_summary()
                logger.info(
                    "Portfolio: Value=%s, P&L=%s, Positions=%d",
                    portfolio.total_value,
                    portfolio.total_pnl,
                    len(portfolio.positions),
                )

        except Exception as e:
            logger.error("Failed to update portfolio: %s", e)

    async def _update_positions(self) -> None:
        """Update position information from filled orders and current market prices."""
        try:
            # Get all trades from exchanges to calculate positions
            for exchange in self.active_symbols.keys():
                try:
                    # Get recent trades (filled orders)
                    trades = await self.client.get_trades(exchange=exchange, limit=100)

                    # Process trades to update positions
                    for trade in trades:
                        await self._process_trade_for_position(trade)

                    # Update market prices for existing positions
                    await self._update_position_market_values(exchange)

                except Exception as e:
                    logger.error("Failed to update positions for %s: %s", exchange, e)

        except Exception as e:
            logger.error("Failed to update positions: %s", e)

    async def _process_trade_for_position(self, trade: Trade) -> None:
        """Process individual trade to update position."""
        try:
            existing_position = self.portfolio_manager.get_position(
                trade.symbol, trade.exchange
            )

            if existing_position:
                # Update existing position
                if trade.side == existing_position.side:
                    # Adding to position
                    total_size = existing_position.size + trade.amount
                    # Calculate weighted average entry price
                    total_value = (existing_position.size * existing_position.entry_price +
                                 trade.amount * trade.price)
                    avg_entry_price = total_value / total_size if total_size > 0 else trade.price

                    updated_position = Position(
                        symbol=trade.symbol,
                        side=existing_position.side,
                        size=total_size,
                        entry_price=avg_entry_price,
                        market_price=trade.price,  # Will be updated with current market price
                        unrealized_pnl=Decimal("0"),  # Will be calculated
                        exchange=trade.exchange,
                        timestamp=trade.timestamp,
                    )
                else:
                    # Reducing position (opposite side)
                    new_size = existing_position.size - trade.amount
                    if new_size <= 0:
                        # Position closed or reversed
                        if new_size < 0:
                            # Position reversed
                            updated_position = Position(
                                symbol=trade.symbol,
                                side=trade.side,
                                size=abs(new_size),
                                entry_price=trade.price,
                                market_price=trade.price,
                                unrealized_pnl=Decimal("0"),
                                exchange=trade.exchange,
                                timestamp=trade.timestamp,
                            )
                        else:
                            # Position closed - will be removed by update_position
                            updated_position = Position(
                                symbol=trade.symbol,
                                side=existing_position.side,
                                size=Decimal("0"),
                                entry_price=existing_position.entry_price,
                                market_price=trade.price,
                                unrealized_pnl=Decimal("0"),
                                exchange=trade.exchange,
                                timestamp=trade.timestamp,
                            )
                    else:
                        # Partial close
                        updated_position = Position(
                            symbol=trade.symbol,
                            side=existing_position.side,
                            size=new_size,
                            entry_price=existing_position.entry_price,
                            market_price=trade.price,
                            unrealized_pnl=Decimal("0"),  # Will be calculated
                            exchange=trade.exchange,
                            timestamp=trade.timestamp,
                        )

                self.portfolio_manager.update_position(updated_position)
            else:
                # Create new position
                new_position = Position(
                    symbol=trade.symbol,
                    side=trade.side,
                    size=trade.amount,
                    entry_price=trade.price,
                    market_price=trade.price,
                    unrealized_pnl=Decimal("0"),
                    exchange=trade.exchange,
                    timestamp=trade.timestamp,
                )
                self.portfolio_manager.update_position(new_position)

        except Exception as e:
            logger.error("Failed to process trade for position: %s", e)

    async def _update_position_market_values(self, exchange: Exchange) -> None:
        """Update market prices and unrealized P&L for positions."""
        try:
            for symbol in self.active_symbols.get(exchange, []):
                position = self.portfolio_manager.get_position(symbol, exchange)
                if position:
                    # Get current market price
                    ticker = await self.client.get_ticker(symbol, exchange)
                    current_price = ticker.last

                    # Calculate unrealized P&L
                    price_diff = current_price - position.entry_price
                    if position.side == OrderSide.SELL:
                        price_diff = -price_diff  # Short position

                    unrealized_pnl = price_diff * position.size

                    # Update position with current market data
                    updated_position = Position(
                        symbol=position.symbol,
                        side=position.side,
                        size=position.size,
                        entry_price=position.entry_price,
                        market_price=current_price,
                        unrealized_pnl=unrealized_pnl,
                        exchange=position.exchange,
                        timestamp=datetime.now(),
                    )

                    self.portfolio_manager.update_position(updated_position)

        except Exception as e:
            logger.error("Failed to update position market values: %s", e)

    async def _cancel_all_orders(self) -> None:
        """Cancel all open orders."""
        for order_id, order in self.active_orders.items():
            try:
                await self.client.cancel_order(
                    order_id=order_id,
                    symbol=order.symbol,
                    exchange=order.exchange,
                )
                logger.info("Canceled order: %s", order_id)

            except Exception as e:
                logger.error("Failed to cancel order %s: %s", order_id, e)

        self.active_orders.clear()

    def get_status(self) -> dict[str, Any]:
        """Get trading engine status."""
        return {
            "is_running": self.is_running,
            "strategies": list(self.strategies.keys()),
            "active_symbols": dict(self.active_symbols),
            "active_orders": len(self.active_orders),
            "update_interval": self.update_interval,
        }
