"""Trading API endpoints."""

import logging
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from system_trading.data.models import (
    Balance,
    Exchange,
    Order,
    OrderSide,
    OrderType,
    Trade,
)
from system_trading.data.portfolio_manager import PortfolioManager
from system_trading.exchanges.unified_client import UnifiedExchangeClient

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/trading", tags=["trading"])

# Global instances
client = UnifiedExchangeClient()
portfolio_manager = PortfolioManager()


class OrderRequest(BaseModel):
    """Order request model."""

    symbol: str = Field(..., description="Trading symbol")
    exchange: Exchange = Field(..., description="Exchange")
    side: OrderSide = Field(..., description="Order side")
    order_type: OrderType = Field(..., description="Order type")
    amount: Decimal = Field(..., description="Order amount", gt=0)
    price: Decimal | None = Field(None, description="Order price (for limit orders)")


class OrderResponse(BaseModel):
    """Order response model."""

    success: bool
    order: Order | None = None
    error: str | None = None


@router.get("/balance/{exchange}")
async def get_account_balance(exchange: Exchange) -> list[Balance]:
    """Get account balance for an exchange.

    Args:
        exchange: Exchange name.

    Returns:
        List of account balances.
    """
    try:
        balances = await client.get_balance(exchange)

        # Update portfolio manager
        for balance in balances:
            portfolio_manager.update_balance(balance)

        return balances
    except Exception as e:
        logger.error("Failed to get balance for %s: %s", exchange, e)
        raise HTTPException(status_code=500, detail=f"Failed to get balance: {e}")


@router.get("/balance")
async def get_all_balances() -> dict[str, list[Balance]]:
    """Get account balances for all exchanges.

    Returns:
        Dictionary of exchange balances.
    """
    all_balances = {}

    for exchange in Exchange:
        try:
            balances = await client.get_balance(exchange)
            all_balances[exchange.value] = balances

            # Update portfolio manager
            for balance in balances:
                portfolio_manager.update_balance(balance)

        except Exception as e:
            logger.warning("Failed to get balance for %s: %s", exchange, e)
            all_balances[exchange.value] = []

    return all_balances


@router.post("/order")
async def place_order(order_request: OrderRequest) -> OrderResponse:
    """Place a trading order.

    Args:
        order_request: Order details.

    Returns:
        Order response with result.
    """
    try:
        # Validate order with portfolio manager
        temp_order = Order(
            id="temp",
            symbol=order_request.symbol,
            side=order_request.side,
            type=order_request.order_type,
            amount=order_request.amount,
            price=order_request.price,
            filled=Decimal("0"),
            remaining=order_request.amount,
            status="pending",
            timestamp=None,
            exchange=order_request.exchange,
        )

        if not portfolio_manager.check_risk_limits(temp_order):
            return OrderResponse(success=False, error="Order violates risk limits")

        # Place order
        order = await client.create_order(
            symbol=order_request.symbol,
            exchange=order_request.exchange,
            side=order_request.side,
            order_type=order_request.order_type,
            amount=order_request.amount,
            price=order_request.price,
        )

        logger.info("Order placed: %s", order.id)
        return OrderResponse(success=True, order=order)

    except Exception as e:
        logger.error("Failed to place order: %s", e)
        return OrderResponse(success=False, error=f"Failed to place order: {e}")


@router.delete("/order/{exchange}/{symbol}/{order_id}")
async def cancel_order(
    exchange: Exchange,
    symbol: str,
    order_id: str,
) -> OrderResponse:
    """Cancel an order.

    Args:
        exchange: Exchange name.
        symbol: Trading symbol.
        order_id: Order ID to cancel.

    Returns:
        Order response with result.
    """
    try:
        order = await client.cancel_order(order_id, symbol, exchange)

        logger.info("Order canceled: %s", order_id)
        return OrderResponse(success=True, order=order)

    except Exception as e:
        logger.error("Failed to cancel order %s: %s", order_id, e)
        return OrderResponse(success=False, error=f"Failed to cancel order: {e}")


@router.get("/order/{exchange}/{symbol}/{order_id}")
async def get_order_status(
    exchange: Exchange,
    symbol: str,
    order_id: str,
) -> Order:
    """Get order status.

    Args:
        exchange: Exchange name.
        symbol: Trading symbol.
        order_id: Order ID.

    Returns:
        Order details.
    """
    try:
        order = await client.get_order(order_id, symbol, exchange)
        return order
    except Exception as e:
        logger.error("Failed to get order %s: %s", order_id, e)
        raise HTTPException(status_code=500, detail=f"Failed to get order: {e}")


@router.get("/orders/open")
async def get_open_orders(
    exchange: Exchange | None = None,
    symbol: str | None = None,
) -> list[Order]:
    """Get open orders.

    Args:
        exchange: Optional exchange filter.
        symbol: Optional symbol filter.

    Returns:
        List of open orders.
    """
    try:
        orders = await client.get_open_orders(symbol, exchange)
        return orders
    except Exception as e:
        logger.error("Failed to get open orders: %s", e)
        raise HTTPException(status_code=500, detail=f"Failed to get open orders: {e}")


@router.get("/trades")
async def get_trade_history(
    exchange: Exchange | None = None,
    symbol: str | None = None,
    limit: int = 100,
) -> list[Trade]:
    """Get trade history.

    Args:
        exchange: Optional exchange filter.
        symbol: Optional symbol filter.
        limit: Maximum number of trades.

    Returns:
        List of trades.
    """
    try:
        trades = await client.get_trades(symbol, exchange, limit)

        # Update portfolio manager
        for trade in trades:
            portfolio_manager.add_trade(trade)

        return trades
    except Exception as e:
        logger.error("Failed to get trade history: %s", e)
        raise HTTPException(status_code=500, detail=f"Failed to get trades: {e}")


@router.get("/portfolio")
async def get_portfolio_summary() -> dict[str, Any]:
    """Get portfolio summary.

    Returns:
        Portfolio summary with performance metrics.
    """
    try:
        # Update balances first
        for exchange in Exchange:
            try:
                balances = await client.get_balance(exchange)
                for balance in balances:
                    portfolio_manager.update_balance(balance)
            except Exception as e:
                logger.warning("Failed to update balance for %s: %s", exchange, e)

        # Get portfolio summary
        portfolio = portfolio_manager.get_portfolio_summary()
        return portfolio.model_dump()

    except Exception as e:
        logger.error("Failed to get portfolio summary: %s", e)
        raise HTTPException(status_code=500, detail=f"Failed to get portfolio: {e}")


@router.get("/positions")
async def get_positions() -> list[dict[str, Any]]:
    """Get current positions.

    Returns:
        List of current positions.
    """
    try:
        portfolio = portfolio_manager.get_portfolio_summary()
        return [position.model_dump() for position in portfolio.positions]
    except Exception as e:
        logger.error("Failed to get positions: %s", e)
        raise HTTPException(status_code=500, detail=f"Failed to get positions: {e}")


@router.post("/position/close/{exchange}/{symbol}")
async def close_position(
    exchange: Exchange,
    symbol: str,
) -> OrderResponse:
    """Close a position.

    Args:
        exchange: Exchange name.
        symbol: Trading symbol.

    Returns:
        Order response with result.
    """
    try:
        # Get current position
        position = portfolio_manager.get_position(symbol, exchange)

        if not position:
            return OrderResponse(success=False, error="No position found for symbol")

        # Determine order side (opposite of position)
        order_side = OrderSide.SELL if position.side == OrderSide.BUY else OrderSide.BUY

        # Place market order to close position
        order = await client.create_order(
            symbol=symbol,
            exchange=exchange,
            side=order_side,
            order_type=OrderType.MARKET,
            amount=abs(position.size),
        )

        logger.info("Position closed: %s %s", symbol, exchange)
        return OrderResponse(success=True, order=order)

    except Exception as e:
        logger.error("Failed to close position %s on %s: %s", symbol, exchange, e)
        return OrderResponse(success=False, error=f"Failed to close position: {e}")
