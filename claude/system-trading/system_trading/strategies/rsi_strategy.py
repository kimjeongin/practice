"""RSI-based trading strategy with divergence detection."""

import logging
from typing import Any

import pandas as pd
import pandas_ta as ta

from system_trading.data.models import OrderSide, TradingSignal
from system_trading.strategies.base_strategy import BaseStrategy

logger = logging.getLogger(__name__)


class RSIStrategy(BaseStrategy):
    """RSI strategy with divergence detection and trend confirmation."""

    def __init__(
        self,
        rsi_period: int = 14,
        oversold_level: float = 30.0,
        overbought_level: float = 70.0,
        trend_ema_period: int = 50,
        divergence_lookback: int = 10,
        min_divergence_bars: int = 5,
        volume_confirmation: bool = True,
        **kwargs: Any,
    ) -> None:
        """Initialize RSI strategy.

        Args:
            rsi_period: RSI calculation period.
            oversold_level: RSI oversold threshold.
            overbought_level: RSI overbought threshold.
            trend_ema_period: EMA period for trend confirmation.
            divergence_lookback: Bars to look back for divergence.
            min_divergence_bars: Minimum bars for valid divergence.
            volume_confirmation: Whether to require volume confirmation.
            **kwargs: Additional strategy parameters.
        """
        parameters = {
            "rsi_period": rsi_period,
            "oversold_level": oversold_level,
            "overbought_level": overbought_level,
            "trend_ema_period": trend_ema_period,
            "divergence_lookback": divergence_lookback,
            "min_divergence_bars": min_divergence_bars,
            "volume_confirmation": volume_confirmation,
            **kwargs,
        }
        super().__init__("RSIStrategy", parameters)

    def analyze(self, data: pd.DataFrame) -> dict[str, Any]:
        """Analyze price data using RSI and divergence detection.

        Args:
            data: OHLCV data with columns: open, high, low, close, volume.

        Returns:
            Analysis result with RSI indicators and signals.
        """
        required_periods = (
            max(
                self.parameters["rsi_period"],
                self.parameters["trend_ema_period"],
                self.parameters["divergence_lookback"],
            )
            + 10
        )

        if len(data) < required_periods:
            return {
                "error": "Insufficient data for analysis",
                "required_periods": required_periods,
                "available_periods": len(data),
            }

        try:
            # Calculate RSI
            rsi = ta.rsi(data["close"], length=self.parameters["rsi_period"])

            # Calculate trend EMA
            trend_ema = ta.ema(
                data["close"], length=self.parameters["trend_ema_period"]
            )

            # Detect divergences
            bullish_divergence = self._detect_bullish_divergence(data, rsi)
            bearish_divergence = self._detect_bearish_divergence(data, rsi)

            # Volume analysis
            volume_analysis = self._analyze_volume(data)

            # Current values
            current_rsi = float(rsi.iloc[-1])
            current_price = float(data["close"].iloc[-1])
            current_trend_ema = float(trend_ema.iloc[-1])

            # Determine trend
            trend = "bullish" if current_price > current_trend_ema else "bearish"

            # Generate signals
            buy_signal = self.should_buy(data)
            sell_signal = self.should_sell(data)

            # Calculate signal strength
            signal_strength = self._calculate_signal_strength(
                current_rsi,
                bullish_divergence,
                bearish_divergence,
                trend,
                volume_analysis,
            )

            return {
                "rsi": current_rsi,
                "trend_ema": current_trend_ema,
                "trend": trend,
                "bullish_divergence": bullish_divergence,
                "bearish_divergence": bearish_divergence,
                "volume_spike": volume_analysis["spike"],
                "volume_ratio": volume_analysis["ratio"],
                "buy_signal": buy_signal,
                "sell_signal": sell_signal,
                "signal_strength": signal_strength,
                "current_price": current_price,
                "oversold": current_rsi < self.parameters["oversold_level"],
                "overbought": current_rsi > self.parameters["overbought_level"],
            }

        except Exception as e:
            logger.error("Error in RSI strategy analysis: %s", e)
            return {"error": f"Analysis failed: {e}"}

    def _detect_bullish_divergence(self, data: pd.DataFrame, rsi: pd.Series) -> bool:
        """Detect bullish divergence between price and RSI."""
        try:
            lookback = self.parameters["divergence_lookback"]
            min_bars = self.parameters["min_divergence_bars"]

            if len(data) < lookback + min_bars:
                return False

            # Get recent data
            recent_prices = data["close"].tail(lookback)
            recent_rsi = rsi.tail(lookback)

            # Find local lows in price and RSI
            price_lows = []
            rsi_lows = []

            for i in range(2, len(recent_prices) - 2):
                if (
                    recent_prices.iloc[i] < recent_prices.iloc[i - 1]
                    and recent_prices.iloc[i] < recent_prices.iloc[i - 2]
                    and recent_prices.iloc[i] < recent_prices.iloc[i + 1]
                    and recent_prices.iloc[i] < recent_prices.iloc[i + 2]
                ):
                    price_lows.append((i, recent_prices.iloc[i]))

                if (
                    recent_rsi.iloc[i] < recent_rsi.iloc[i - 1]
                    and recent_rsi.iloc[i] < recent_rsi.iloc[i - 2]
                    and recent_rsi.iloc[i] < recent_rsi.iloc[i + 1]
                    and recent_rsi.iloc[i] < recent_rsi.iloc[i + 2]
                ):
                    rsi_lows.append((i, recent_rsi.iloc[i]))

            # Check for divergence (price making lower lows, RSI making higher lows)
            if len(price_lows) >= 2 and len(rsi_lows) >= 2:
                price_trend = (
                    price_lows[-1][1] < price_lows[-2][1]
                )  # Lower low in price
                rsi_trend = rsi_lows[-1][1] > rsi_lows[-2][1]  # Higher low in RSI

                return price_trend and rsi_trend

            return False

        except Exception as e:
            logger.error("Error detecting bullish divergence: %s", e)
            return False

    def _detect_bearish_divergence(self, data: pd.DataFrame, rsi: pd.Series) -> bool:
        """Detect bearish divergence between price and RSI."""
        try:
            lookback = self.parameters["divergence_lookback"]
            min_bars = self.parameters["min_divergence_bars"]

            if len(data) < lookback + min_bars:
                return False

            # Get recent data
            recent_prices = data["close"].tail(lookback)
            recent_rsi = rsi.tail(lookback)

            # Find local highs in price and RSI
            price_highs = []
            rsi_highs = []

            for i in range(2, len(recent_prices) - 2):
                if (
                    recent_prices.iloc[i] > recent_prices.iloc[i - 1]
                    and recent_prices.iloc[i] > recent_prices.iloc[i - 2]
                    and recent_prices.iloc[i] > recent_prices.iloc[i + 1]
                    and recent_prices.iloc[i] > recent_prices.iloc[i + 2]
                ):
                    price_highs.append((i, recent_prices.iloc[i]))

                if (
                    recent_rsi.iloc[i] > recent_rsi.iloc[i - 1]
                    and recent_rsi.iloc[i] > recent_rsi.iloc[i - 2]
                    and recent_rsi.iloc[i] > recent_rsi.iloc[i + 1]
                    and recent_rsi.iloc[i] > recent_rsi.iloc[i + 2]
                ):
                    rsi_highs.append((i, recent_rsi.iloc[i]))

            # Check for divergence (price making higher highs, RSI making lower highs)
            if len(price_highs) >= 2 and len(rsi_highs) >= 2:
                price_trend = (
                    price_highs[-1][1] > price_highs[-2][1]
                )  # Higher high in price
                rsi_trend = rsi_highs[-1][1] < rsi_highs[-2][1]  # Lower high in RSI

                return price_trend and rsi_trend

            return False

        except Exception as e:
            logger.error("Error detecting bearish divergence: %s", e)
            return False

    def _analyze_volume(self, data: pd.DataFrame) -> dict[str, Any]:
        """Analyze volume for confirmation."""
        try:
            # Calculate volume moving average
            volume_ma = ta.sma(data["volume"], length=20)
            current_volume = data["volume"].iloc[-1]
            avg_volume = volume_ma.iloc[-1]

            volume_ratio = current_volume / avg_volume if avg_volume > 0 else 1.0
            volume_spike = volume_ratio > 1.5

            return {
                "ratio": float(volume_ratio),
                "spike": volume_spike,
                "current": float(current_volume),
                "average": float(avg_volume),
            }

        except Exception as e:
            logger.error("Error analyzing volume: %s", e)
            return {"ratio": 1.0, "spike": False, "current": 0, "average": 0}

    def _calculate_signal_strength(
        self,
        rsi: float,
        bullish_div: bool,
        bearish_div: bool,
        trend: str,
        volume_analysis: dict[str, Any],
    ) -> float:
        """Calculate signal strength based on multiple factors."""
        strength = 0.0

        # RSI level contribution
        if rsi < self.parameters["oversold_level"]:
            strength += 0.3
        elif rsi > self.parameters["overbought_level"]:
            strength += 0.3

        # Divergence contribution
        if bullish_div or bearish_div:
            strength += 0.4

        # Trend alignment
        if (rsi < self.parameters["oversold_level"] and trend == "bullish") or (
            rsi > self.parameters["overbought_level"] and trend == "bearish"
        ):
            strength += 0.2

        # Volume confirmation
        if self.parameters["volume_confirmation"] and volume_analysis["spike"]:
            strength += 0.1

        return min(strength, 1.0)

    def should_buy(self, data: pd.DataFrame) -> bool:
        """Determine if strategy should generate buy signal."""
        try:
            analysis = self.analyze(data)

            if "error" in analysis:
                return False

            # Buy conditions
            rsi_oversold = analysis["rsi"] < self.parameters["oversold_level"]
            bullish_divergence = analysis["bullish_divergence"]
            trend_support = analysis["trend"] == "bullish"
            volume_confirm = (
                not self.parameters["volume_confirmation"] or analysis["volume_spike"]
            )

            # Require RSI oversold AND either divergence OR trend support
            return (
                rsi_oversold
                and (bullish_divergence or trend_support)
                and volume_confirm
            )

        except Exception as e:
            logger.error("Error in RSI buy signal: %s", e)
            return False

    def should_sell(self, data: pd.DataFrame) -> bool:
        """Determine if strategy should generate sell signal."""
        try:
            analysis = self.analyze(data)

            if "error" in analysis:
                return False

            # Sell conditions
            rsi_overbought = analysis["rsi"] > self.parameters["overbought_level"]
            bearish_divergence = analysis["bearish_divergence"]
            trend_resistance = analysis["trend"] == "bearish"
            volume_confirm = (
                not self.parameters["volume_confirmation"] or analysis["volume_spike"]
            )

            # Require RSI overbought AND either divergence OR trend resistance
            return (
                rsi_overbought
                and (bearish_divergence or trend_resistance)
                and volume_confirm
            )

        except Exception as e:
            logger.error("Error in RSI sell signal: %s", e)
            return False

    def generate_signal(self, data: pd.DataFrame) -> TradingSignal | None:
        """Generate trading signal with metadata."""
        try:
            analysis = self.analyze(data)

            if "error" in analysis:
                return None

            symbol = getattr(data, "symbol", "UNKNOWN")

            if analysis["buy_signal"]:
                return TradingSignal(
                    symbol=symbol,
                    side=OrderSide.BUY,
                    strength=analysis["signal_strength"],
                    confidence=min(analysis["signal_strength"] + 0.1, 1.0),
                    strategy=self.name,
                    metadata={
                        "rsi": analysis["rsi"],
                        "bullish_divergence": analysis["bullish_divergence"],
                        "trend": analysis["trend"],
                        "volume_ratio": analysis["volume_ratio"],
                        "oversold": analysis["oversold"],
                    },
                )
            elif analysis["sell_signal"]:
                return TradingSignal(
                    symbol=symbol,
                    side=OrderSide.SELL,
                    strength=analysis["signal_strength"],
                    confidence=min(analysis["signal_strength"] + 0.1, 1.0),
                    strategy=self.name,
                    metadata={
                        "rsi": analysis["rsi"],
                        "bearish_divergence": analysis["bearish_divergence"],
                        "trend": analysis["trend"],
                        "volume_ratio": analysis["volume_ratio"],
                        "overbought": analysis["overbought"],
                    },
                )

            return None

        except Exception as e:
            logger.error("Error generating RSI signal: %s", e)
            return None
