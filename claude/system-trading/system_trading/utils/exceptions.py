"""Custom exceptions for the trading system."""

from typing import Any, Dict, Optional


class TradingSystemError(Exception):
    """Base exception for trading system errors."""

    def __init__(
        self,
        message: str,
        error_code: Optional[str] = None,
        context: Optional[Dict[str, Any]] = None
    ) -> None:
        """Initialize trading system error.

        Args:
            message: Error message
            error_code: Optional error code for categorization
            context: Additional context information
        """
        super().__init__(message)
        self.message = message
        self.error_code = error_code
        self.context = context or {}


class ExchangeError(TradingSystemError):
    """Exchange-related errors."""

    def __init__(
        self,
        message: str,
        exchange: str,
        error_code: Optional[str] = None,
        context: Optional[Dict[str, Any]] = None
    ) -> None:
        """Initialize exchange error.

        Args:
            message: Error message
            exchange: Exchange name
            error_code: Optional error code
            context: Additional context information
        """
        super().__init__(message, error_code, context)
        self.exchange = exchange


class NetworkError(ExchangeError):
    """Network connectivity errors."""
    pass


class RateLimitError(ExchangeError):
    """Rate limiting errors."""

    def __init__(
        self,
        message: str,
        exchange: str,
        retry_after: Optional[int] = None,
        error_code: Optional[str] = None,
        context: Optional[Dict[str, Any]] = None
    ) -> None:
        """Initialize rate limit error.

        Args:
            message: Error message
            exchange: Exchange name
            retry_after: Seconds to wait before retry
            error_code: Optional error code
            context: Additional context information
        """
        super().__init__(message, exchange, error_code, context)
        self.retry_after = retry_after


class AuthenticationError(ExchangeError):
    """Authentication and authorization errors."""
    pass


class InsufficientBalanceError(ExchangeError):
    """Insufficient balance for order execution."""

    def __init__(
        self,
        message: str,
        exchange: str,
        required_balance: float,
        available_balance: float,
        error_code: Optional[str] = None,
        context: Optional[Dict[str, Any]] = None
    ) -> None:
        """Initialize insufficient balance error.

        Args:
            message: Error message
            exchange: Exchange name
            required_balance: Required balance amount
            available_balance: Available balance amount
            error_code: Optional error code
            context: Additional context information
        """
        super().__init__(message, exchange, error_code, context)
        self.required_balance = required_balance
        self.available_balance = available_balance


class InvalidOrderError(ExchangeError):
    """Invalid order parameters."""

    def __init__(
        self,
        message: str,
        exchange: str,
        order_details: Optional[Dict[str, Any]] = None,
        error_code: Optional[str] = None,
        context: Optional[Dict[str, Any]] = None
    ) -> None:
        """Initialize invalid order error.

        Args:
            message: Error message
            exchange: Exchange name
            order_details: Order parameters that caused the error
            error_code: Optional error code
            context: Additional context information
        """
        super().__init__(message, exchange, error_code, context)
        self.order_details = order_details or {}


class MarketClosedError(ExchangeError):
    """Market is closed for trading."""
    pass


class SymbolNotFoundError(ExchangeError):
    """Trading symbol not found on exchange."""

    def __init__(
        self,
        message: str,
        exchange: str,
        symbol: str,
        error_code: Optional[str] = None,
        context: Optional[Dict[str, Any]] = None
    ) -> None:
        """Initialize symbol not found error.

        Args:
            message: Error message
            exchange: Exchange name
            symbol: Symbol that was not found
            error_code: Optional error code
            context: Additional context information
        """
        super().__init__(message, exchange, error_code, context)
        self.symbol = symbol


class StrategyError(TradingSystemError):
    """Strategy-related errors."""

    def __init__(
        self,
        message: str,
        strategy_name: str,
        error_code: Optional[str] = None,
        context: Optional[Dict[str, Any]] = None
    ) -> None:
        """Initialize strategy error.

        Args:
            message: Error message
            strategy_name: Name of the strategy
            error_code: Optional error code
            context: Additional context information
        """
        super().__init__(message, error_code, context)
        self.strategy_name = strategy_name


class PortfolioError(TradingSystemError):
    """Portfolio management errors."""
    pass


class RiskManagementError(TradingSystemError):
    """Risk management rule violations."""

    def __init__(
        self,
        message: str,
        rule_violated: str,
        current_value: float,
        threshold: float,
        error_code: Optional[str] = None,
        context: Optional[Dict[str, Any]] = None
    ) -> None:
        """Initialize risk management error.

        Args:
            message: Error message
            rule_violated: Name of the risk rule that was violated
            current_value: Current value that violated the rule
            threshold: Threshold that was exceeded
            error_code: Optional error code
            context: Additional context information
        """
        super().__init__(message, error_code, context)
        self.rule_violated = rule_violated
        self.current_value = current_value
        self.threshold = threshold


class DataError(TradingSystemError):
    """Data-related errors (missing, invalid, corrupted)."""

    def __init__(
        self,
        message: str,
        data_type: str,
        error_code: Optional[str] = None,
        context: Optional[Dict[str, Any]] = None
    ) -> None:
        """Initialize data error.

        Args:
            message: Error message
            data_type: Type of data that had an error
            error_code: Optional error code
            context: Additional context information
        """
        super().__init__(message, error_code, context)
        self.data_type = data_type


class ConfigurationError(TradingSystemError):
    """Configuration and settings errors."""
    pass


class BacktestError(TradingSystemError):
    """Backtesting-related errors."""

    def __init__(
        self,
        message: str,
        backtest_id: Optional[str] = None,
        error_code: Optional[str] = None,
        context: Optional[Dict[str, Any]] = None
    ) -> None:
        """Initialize backtest error.

        Args:
            message: Error message
            backtest_id: ID of the backtest that failed
            error_code: Optional error code
            context: Additional context information
        """
        super().__init__(message, error_code, context)
        self.backtest_id = backtest_id


def map_ccxt_exception(exc: Exception, exchange: str) -> ExchangeError:
    """Map CCXT exceptions to custom exceptions.

    Args:
        exc: CCXT exception
        exchange: Exchange name

    Returns:
        Mapped custom exception
    """
    exc_message = str(exc)
    exc_type = type(exc).__name__

    # Map based on exception type and message content
    if "rate limit" in exc_message.lower() or "too many requests" in exc_message.lower():
        return RateLimitError(
            message=exc_message,
            exchange=exchange,
            error_code=exc_type
        )

    elif "insufficient" in exc_message.lower() and "balance" in exc_message.lower():
        return InsufficientBalanceError(
            message=exc_message,
            exchange=exchange,
            required_balance=0.0,  # Would need to parse from message
            available_balance=0.0,  # Would need to parse from message
            error_code=exc_type
        )

    elif "invalid" in exc_message.lower() and ("order" in exc_message.lower() or "amount" in exc_message.lower()):
        return InvalidOrderError(
            message=exc_message,
            exchange=exchange,
            error_code=exc_type
        )

    elif "symbol" in exc_message.lower() and ("not found" in exc_message.lower() or "does not exist" in exc_message.lower()):
        return SymbolNotFoundError(
            message=exc_message,
            exchange=exchange,
            symbol="",  # Would need to parse from message
            error_code=exc_type
        )

    elif "authentication" in exc_message.lower() or "unauthorized" in exc_message.lower() or "api key" in exc_message.lower():
        return AuthenticationError(
            message=exc_message,
            exchange=exchange,
            error_code=exc_type
        )

    elif "network" in exc_message.lower() or "connection" in exc_message.lower() or "timeout" in exc_message.lower():
        return NetworkError(
            message=exc_message,
            exchange=exchange,
            error_code=exc_type
        )

    elif "market" in exc_message.lower() and "closed" in exc_message.lower():
        return MarketClosedError(
            message=exc_message,
            exchange=exchange,
            error_code=exc_type
        )

    else:
        # Generic exchange error
        return ExchangeError(
            message=exc_message,
            exchange=exchange,
            error_code=exc_type
        )