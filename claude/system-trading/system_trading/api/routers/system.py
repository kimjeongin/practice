"""System status and monitoring API endpoints."""

import logging
from typing import Any, Dict

from fastapi import APIRouter, HTTPException

from system_trading.utils.retry import error_aggregator

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/system", tags=["system"])


@router.get("/health")
async def health_check() -> Dict[str, str]:
    """Health check endpoint."""
    return {"status": "healthy", "service": "system-trading"}


@router.get("/errors")
async def get_error_summary(hours: int = 24) -> Dict[str, Any]:
    """Get error summary for monitoring.

    Args:
        hours: Number of hours to look back for errors

    Returns:
        Error summary including counts and recent errors
    """
    try:
        summary = error_aggregator.get_error_summary(hours)
        return {
            "status": "success",
            "data": summary,
            "timeframe_hours": hours
        }

    except Exception as e:
        logger.error("Failed to get error summary: %s", e)
        raise HTTPException(
            status_code=500,
            detail="Failed to retrieve error summary"
        )


@router.get("/errors/types")
async def get_error_types() -> Dict[str, Any]:
    """Get list of error types and their counts."""
    try:
        return {
            "status": "success",
            "data": {
                "error_counts": error_aggregator.error_counts,
                "total_errors": len(error_aggregator.errors)
            }
        }

    except Exception as e:
        logger.error("Failed to get error types: %s", e)
        raise HTTPException(
            status_code=500,
            detail="Failed to retrieve error types"
        )


@router.post("/errors/clear")
async def clear_errors() -> Dict[str, str]:
    """Clear error history (admin function)."""
    try:
        error_aggregator.errors.clear()
        error_aggregator.error_counts.clear()
        logger.info("Error history cleared")

        return {
            "status": "success",
            "message": "Error history cleared"
        }

    except Exception as e:
        logger.error("Failed to clear errors: %s", e)
        raise HTTPException(
            status_code=500,
            detail="Failed to clear error history"
        )