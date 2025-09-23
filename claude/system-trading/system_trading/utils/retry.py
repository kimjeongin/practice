"""Retry utilities for handling transient failures."""

import asyncio
import logging
import time
from functools import wraps
from typing import Any, Callable, List, Type, TypeVar, Union

logger = logging.getLogger(__name__)

F = TypeVar('F', bound=Callable[..., Any])


class RetryError(Exception):
    """Raised when all retry attempts are exhausted."""
    pass


class CircuitBreaker:
    """Circuit breaker pattern implementation."""

    def __init__(
        self,
        failure_threshold: int = 5,
        reset_timeout: int = 60,
        expected_exceptions: tuple = (Exception,)
    ) -> None:
        """Initialize circuit breaker.

        Args:
            failure_threshold: Number of failures before opening circuit
            reset_timeout: Time in seconds to wait before attempting reset
            expected_exceptions: Exceptions that count as failures
        """
        self.failure_threshold = failure_threshold
        self.reset_timeout = reset_timeout
        self.expected_exceptions = expected_exceptions

        self.failure_count = 0
        self.last_failure_time = 0
        self.state = "CLOSED"  # CLOSED, OPEN, HALF_OPEN

    def __call__(self, func: F) -> F:
        """Decorator for circuit breaker."""
        @wraps(func)
        async def wrapper(*args: Any, **kwargs: Any) -> Any:
            if self.state == "OPEN":
                if time.time() - self.last_failure_time > self.reset_timeout:
                    self.state = "HALF_OPEN"
                    logger.info("Circuit breaker entering HALF_OPEN state")
                else:
                    raise RetryError("Circuit breaker is OPEN")

            try:
                result = await func(*args, **kwargs)
                if self.state == "HALF_OPEN":
                    self.reset()
                return result

            except self.expected_exceptions as e:
                self.record_failure()
                raise e

        return wrapper  # type: ignore

    def record_failure(self) -> None:
        """Record a failure."""
        self.failure_count += 1
        self.last_failure_time = time.time()

        if self.failure_count >= self.failure_threshold:
            self.state = "OPEN"
            logger.warning(
                "Circuit breaker opened after %d failures",
                self.failure_count
            )

    def reset(self) -> None:
        """Reset circuit breaker."""
        self.failure_count = 0
        self.state = "CLOSED"
        logger.info("Circuit breaker reset to CLOSED state")


def retry_async(
    max_attempts: int = 3,
    delay: float = 1.0,
    backoff: float = 2.0,
    max_delay: float = 60.0,
    exceptions: Union[Type[Exception], tuple] = Exception,
    jitter: bool = True,
) -> Callable[[F], F]:
    """Async retry decorator with exponential backoff.

    Args:
        max_attempts: Maximum number of retry attempts
        delay: Initial delay between retries in seconds
        backoff: Backoff multiplier for exponential backoff
        max_delay: Maximum delay between retries
        exceptions: Exception types to catch and retry
        jitter: Whether to add random jitter to delay

    Returns:
        Decorated function with retry logic
    """
    if not isinstance(exceptions, tuple):
        exceptions = (exceptions,)

    def decorator(func: F) -> F:
        @wraps(func)
        async def wrapper(*args: Any, **kwargs: Any) -> Any:
            attempt = 0
            current_delay = delay

            while attempt < max_attempts:
                try:
                    return await func(*args, **kwargs)

                except exceptions as e:
                    attempt += 1

                    if attempt >= max_attempts:
                        logger.error(
                            "Function %s failed after %d attempts: %s",
                            func.__name__,
                            max_attempts,
                            e
                        )
                        raise

                    # Calculate delay with exponential backoff
                    if jitter:
                        import random
                        jitter_delay = current_delay * (0.5 + random.random() * 0.5)
                    else:
                        jitter_delay = current_delay

                    sleep_time = min(jitter_delay, max_delay)

                    logger.warning(
                        "Function %s failed (attempt %d/%d), retrying in %.2fs: %s",
                        func.__name__,
                        attempt,
                        max_attempts,
                        sleep_time,
                        e
                    )

                    await asyncio.sleep(sleep_time)
                    current_delay *= backoff

            return None  # Should never reach here

        return wrapper  # type: ignore

    return decorator


def retry_sync(
    max_attempts: int = 3,
    delay: float = 1.0,
    backoff: float = 2.0,
    max_delay: float = 60.0,
    exceptions: Union[Type[Exception], tuple] = Exception,
    jitter: bool = True,
) -> Callable[[F], F]:
    """Sync retry decorator with exponential backoff.

    Args:
        max_attempts: Maximum number of retry attempts
        delay: Initial delay between retries in seconds
        backoff: Backoff multiplier for exponential backoff
        max_delay: Maximum delay between retries
        exceptions: Exception types to catch and retry
        jitter: Whether to add random jitter to delay

    Returns:
        Decorated function with retry logic
    """
    if not isinstance(exceptions, tuple):
        exceptions = (exceptions,)

    def decorator(func: F) -> F:
        @wraps(func)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            attempt = 0
            current_delay = delay

            while attempt < max_attempts:
                try:
                    return func(*args, **kwargs)

                except exceptions as e:
                    attempt += 1

                    if attempt >= max_attempts:
                        logger.error(
                            "Function %s failed after %d attempts: %s",
                            func.__name__,
                            max_attempts,
                            e
                        )
                        raise

                    # Calculate delay with exponential backoff
                    if jitter:
                        import random
                        jitter_delay = current_delay * (0.5 + random.random() * 0.5)
                    else:
                        jitter_delay = current_delay

                    sleep_time = min(jitter_delay, max_delay)

                    logger.warning(
                        "Function %s failed (attempt %d/%d), retrying in %.2fs: %s",
                        func.__name__,
                        attempt,
                        max_attempts,
                        sleep_time,
                        e
                    )

                    time.sleep(sleep_time)
                    current_delay *= backoff

            return None  # Should never reach here

        return wrapper  # type: ignore

    return decorator


class RateLimiter:
    """Rate limiter using token bucket algorithm."""

    def __init__(self, rate: float, capacity: int) -> None:
        """Initialize rate limiter.

        Args:
            rate: Tokens per second
            capacity: Maximum number of tokens
        """
        self.rate = rate
        self.capacity = capacity
        self.tokens = capacity
        self.last_refill = time.time()

    async def acquire(self, tokens: int = 1) -> None:
        """Acquire tokens from bucket."""
        await self._refill()

        if self.tokens >= tokens:
            self.tokens -= tokens
        else:
            # Wait for tokens to be available
            wait_time = (tokens - self.tokens) / self.rate
            await asyncio.sleep(wait_time)
            await self._refill()
            self.tokens -= tokens

    async def _refill(self) -> None:
        """Refill token bucket."""
        now = time.time()
        elapsed = now - self.last_refill
        new_tokens = elapsed * self.rate
        self.tokens = min(self.capacity, self.tokens + new_tokens)
        self.last_refill = now


class ErrorAggregator:
    """Aggregate and categorize errors for monitoring."""

    def __init__(self) -> None:
        """Initialize error aggregator."""
        self.errors: List[dict] = []
        self.error_counts: dict[str, int] = {}

    def record_error(
        self,
        error: Exception,
        context: dict[str, Any] | None = None
    ) -> None:
        """Record an error with context."""
        error_type = type(error).__name__
        error_record = {
            "timestamp": time.time(),
            "error_type": error_type,
            "message": str(error),
            "context": context or {}
        }

        self.errors.append(error_record)
        self.error_counts[error_type] = self.error_counts.get(error_type, 0) + 1

        # Keep only last 1000 errors
        if len(self.errors) > 1000:
            self.errors = self.errors[-1000:]

        logger.error(
            "Error recorded: %s - %s (context: %s)",
            error_type,
            str(error),
            context
        )

    def get_error_summary(self, hours: int = 24) -> dict[str, Any]:
        """Get error summary for the last N hours."""
        cutoff_time = time.time() - (hours * 3600)
        recent_errors = [
            error for error in self.errors
            if error["timestamp"] > cutoff_time
        ]

        summary = {
            "total_errors": len(recent_errors),
            "error_types": {},
            "recent_errors": recent_errors[-10:]  # Last 10 errors
        }

        for error in recent_errors:
            error_type = error["error_type"]
            if error_type not in summary["error_types"]:
                summary["error_types"][error_type] = 0
            summary["error_types"][error_type] += 1

        return summary


# Global error aggregator instance
error_aggregator = ErrorAggregator()


def handle_exchange_errors(func: F) -> F:
    """Decorator for handling common exchange API errors."""
    # Import here to avoid circular imports
    from system_trading.utils.exceptions import (
        NetworkError, RateLimitError, AuthenticationError,
        InsufficientBalanceError, InvalidOrderError
    )

    # Retryable exceptions
    retryable_exceptions = (
        NetworkError,
        RateLimitError,
        ConnectionError,
        TimeoutError,
    )

    # Non-retryable exceptions (fail fast)
    non_retryable_exceptions = (
        AuthenticationError,
        InsufficientBalanceError,
        InvalidOrderError,
    )

    @retry_async(
        max_attempts=3,
        delay=1.0,
        exceptions=retryable_exceptions
    )
    @wraps(func)
    async def wrapper(*args: Any, **kwargs: Any) -> Any:
        try:
            return await func(*args, **kwargs)
        except non_retryable_exceptions as e:
            # Don't retry these errors
            error_aggregator.record_error(
                e,
                {
                    "function": func.__name__,
                    "args": str(args)[:100],
                    "retry": False,
                }
            )
            raise
        except Exception as e:
            error_aggregator.record_error(
                e,
                {
                    "function": func.__name__,
                    "args": str(args)[:100],
                    "retry": True,
                }
            )
            raise

    return wrapper  # type: ignore