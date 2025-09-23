"""Enhanced moving average strategy with multiple technical indicators."""

import logging
from typing import Any

import pandas as pd
import pandas_ta as ta

from system_trading.data.models import OrderSide, TradingSignal
from system_trading.strategies.base_strategy import BaseStrategy

logger = logging.getLogger(__name__)


class EnhancedMAStrategy(BaseStrategy):
    """Enhanced moving average strategy with EMA, RSI, MACD, and volume confirmation."""

    def __init__(
        self,
        fast_ema: int = 12,
        slow_ema: int = 26,
        signal_ema: int = 9,
        rsi_period: int = 14,
        rsi_oversold: float = 30.0,
        rsi_overbought: float = 70.0,
        volume_threshold: float = 1.5,
        atr_period: int = 14,
        min_confidence: float = 0.6,
        **kwargs: Any,
    ) -> None:
        """Initialize enhanced moving average strategy.

        Args:
            fast_ema: Fast EMA period for MACD calculation.
            slow_ema: Slow EMA period for MACD calculation.
            signal_ema: Signal EMA period for MACD calculation.
            rsi_period: RSI calculation period.
            rsi_oversold: RSI oversold threshold.
            rsi_overbought: RSI overbought threshold.
            volume_threshold: Volume spike threshold multiplier.
            atr_period: ATR calculation period.
            min_confidence: Minimum confidence threshold for signals.
            **kwargs: Additional strategy parameters.
        """
        parameters = {
            "fast_ema": fast_ema,
            "slow_ema": slow_ema,
            "signal_ema": signal_ema,
            "rsi_period": rsi_period,
            "rsi_oversold": rsi_oversold,
            "rsi_overbought": rsi_overbought,
            "volume_threshold": volume_threshold,
            "atr_period": atr_period,
            "min_confidence": min_confidence,
            **kwargs,
        }
        super().__init__("EnhancedMAStrategy", parameters)

    def analyze(self, data: pd.DataFrame) -> dict[str, Any]:
        """Analyze price data using multiple technical indicators.

        Args:
            data: OHLCV data with columns: open, high, low, close, volume.

        Returns:
            Analysis result with indicators and signals.
        """
        required_periods = max(
            self.parameters["slow_ema"],
            self.parameters["rsi_period"],
            self.parameters["atr_period"],
        )

        if len(data) < required_periods + 10:
            return {
                "error": "Insufficient data for analysis",
                "required_periods": required_periods + 10,
                "available_periods": len(data),
            }

        try:
            # Calculate technical indicators
            indicators = self._calculate_indicators(data)

            # Generate trading signals
            buy_signal = self.should_buy(data)
            sell_signal = self.should_sell(data)

            # Calculate signal strength and confidence
            signal_analysis = self._analyze_signals(data, indicators)

            return {
                **indicators,
                "buy_signal": buy_signal,
                "sell_signal": sell_signal,
                "current_price": float(data["close"].iloc[-1]),
                **signal_analysis,
            }

        except Exception as e:
            logger.error("Error in strategy analysis: %s", e)
            return {"error": f"Analysis failed: {e}"}

    def _calculate_indicators(self, data: pd.DataFrame) -> dict[str, Any]:
        """Calculate all technical indicators."""
        # EMA calculations
        fast_ema = ta.ema(data["close"], length=self.parameters["fast_ema"])
        slow_ema = ta.ema(data["close"], length=self.parameters["slow_ema"])

        # MACD calculation
        macd = ta.macd(
            data["close"],
            fast=self.parameters["fast_ema"],
            slow=self.parameters["slow_ema"],
            signal=self.parameters["signal_ema"],
        )

        # RSI calculation
        rsi = ta.rsi(data["close"], length=self.parameters["rsi_period"])

        # ATR for volatility
        atr = ta.atr(
            data["high"],
            data["low"],
            data["close"],
            length=self.parameters["atr_period"],
        )

        # Volume indicators
        volume_sma = ta.sma(data["volume"], length=20)
        volume_ratio = data["volume"] / volume_sma

        # Bollinger Bands
        bb = ta.bbands(data["close"], length=20, std=2)

        # Support and Resistance levels
        support, resistance = self._calculate_support_resistance(data)

        return {
            "fast_ema": float(fast_ema.iloc[-1]),
            "slow_ema": float(slow_ema.iloc[-1]),
            "macd": float(macd["MACD_12_26_9"].iloc[-1]),
            "macd_signal": float(macd["MACDs_12_26_9"].iloc[-1]),
            "macd_histogram": float(macd["MACDh_12_26_9"].iloc[-1]),
            "rsi": float(rsi.iloc[-1]),
            "atr": float(atr.iloc[-1]),
            "volume_ratio": float(volume_ratio.iloc[-1]),
            "bb_upper": float(bb["BBU_20_2.0"].iloc[-1]),
            "bb_middle": float(bb["BBM_20_2.0"].iloc[-1]),
            "bb_lower": float(bb["BBL_20_2.0"].iloc[-1]),
            "support": support,
            "resistance": resistance,
        }

    def _calculate_support_resistance(
        self, data: pd.DataFrame, window: int = 20
    ) -> tuple[float, float]:
        """Calculate support and resistance levels."""
        recent_data = data.tail(window)

        # Simple implementation using rolling min/max
        support = float(recent_data["low"].min())
        resistance = float(recent_data["high"].max())

        return support, resistance

    def _analyze_signals(
        self, data: pd.DataFrame, indicators: dict[str, Any]
    ) -> dict[str, Any]:
        """Analyze signal strength and confidence."""

        # MACD signals
        macd_bullish = (
            indicators["macd"] > indicators["macd_signal"]
            and indicators["macd_histogram"] > 0
        )
        macd_bearish = (
            indicators["macd"] < indicators["macd_signal"]
            and indicators["macd_histogram"] < 0
        )

        # EMA trend
        ema_bullish = indicators["fast_ema"] > indicators["slow_ema"]
        ema_bearish = indicators["fast_ema"] < indicators["slow_ema"]

        # RSI conditions
        rsi_oversold = indicators["rsi"] < self.parameters["rsi_oversold"]
        rsi_overbought = indicators["rsi"] > self.parameters["rsi_overbought"]
        rsi_neutral = 40 <= indicators["rsi"] <= 60

        # Volume confirmation
        volume_spike = indicators["volume_ratio"] > self.parameters["volume_threshold"]

        # Bollinger Bands
        current_price = data["close"].iloc[-1]
        bb_squeeze = (indicators["bb_upper"] - indicators["bb_lower"]) / indicators[
            "bb_middle"
        ] < 0.1
        bb_expansion = (indicators["bb_upper"] - indicators["bb_lower"]) / indicators[
            "bb_middle"
        ] > 0.2

        # Calculate bullish signals
        bullish_score = 0
        if macd_bullish:
            bullish_score += 0.25
        if ema_bullish:
            bullish_score += 0.25
        if rsi_oversold or (rsi_neutral and ema_bullish):
            bullish_score += 0.20
        if volume_spike:
            bullish_score += 0.15
        if current_price > indicators["support"]:
            bullish_score += 0.15

        # Calculate bearish signals
        bearish_score = 0
        if macd_bearish:
            bearish_score += 0.25
        if ema_bearish:
            bearish_score += 0.25
        if rsi_overbought or (rsi_neutral and ema_bearish):
            bearish_score += 0.20
        if volume_spike:
            bearish_score += 0.15
        if current_price < indicators["resistance"]:
            bearish_score += 0.15

        # Determine primary signal
        if (
            bullish_score > bearish_score
            and bullish_score > self.parameters["min_confidence"]
        ):
            primary_signal = "bullish"
            signal_strength = bullish_score
        elif (
            bearish_score > bullish_score
            and bearish_score > self.parameters["min_confidence"]
        ):
            primary_signal = "bearish"
            signal_strength = bearish_score
        else:
            primary_signal = "neutral"
            signal_strength = max(bullish_score, bearish_score)

        return {
            "signal": primary_signal,
            "signal_strength": signal_strength,
            "bullish_score": bullish_score,
            "bearish_score": bearish_score,
            "macd_bullish": macd_bullish,
            "macd_bearish": macd_bearish,
            "ema_trend": "bullish" if ema_bullish else "bearish",
            "rsi_condition": (
                "oversold"
                if rsi_oversold
                else "overbought"
                if rsi_overbought
                else "neutral"
            ),
            "volume_spike": volume_spike,
            "bb_squeeze": bb_squeeze,
            "bb_expansion": bb_expansion,
        }

    def should_buy(self, data: pd.DataFrame) -> bool:
        """Determine if strategy should generate buy signal."""
        try:
            indicators = self._calculate_indicators(data)
            signal_analysis = self._analyze_signals(data, indicators)

            # Multiple confirmation criteria
            conditions = [
                # MACD bullish crossover
                indicators["macd"] > indicators["macd_signal"],
                indicators["macd_histogram"] > 0,
                # EMA trend confirmation
                indicators["fast_ema"] > indicators["slow_ema"],
                # RSI not overbought
                indicators["rsi"] < self.parameters["rsi_overbought"],
                # Above support
                data["close"].iloc[-1] > indicators["support"],
                # Overall bullish signal
                signal_analysis["signal"] == "bullish",
                signal_analysis["signal_strength"] > self.parameters["min_confidence"],
            ]

            # Require majority of conditions to be true
            return sum(conditions) >= len(conditions) * 0.6

        except Exception as e:
            logger.error("Error in buy signal calculation: %s", e)
            return False

    def should_sell(self, data: pd.DataFrame) -> bool:
        """Determine if strategy should generate sell signal."""
        try:
            indicators = self._calculate_indicators(data)
            signal_analysis = self._analyze_signals(data, indicators)

            # Multiple confirmation criteria
            conditions = [
                # MACD bearish crossover
                indicators["macd"] < indicators["macd_signal"],
                indicators["macd_histogram"] < 0,
                # EMA trend confirmation
                indicators["fast_ema"] < indicators["slow_ema"],
                # RSI not oversold
                indicators["rsi"] > self.parameters["rsi_oversold"],
                # Below resistance
                data["close"].iloc[-1] < indicators["resistance"],
                # Overall bearish signal
                signal_analysis["signal"] == "bearish",
                signal_analysis["signal_strength"] > self.parameters["min_confidence"],
            ]

            # Require majority of conditions to be true
            return sum(conditions) >= len(conditions) * 0.6

        except Exception as e:
            logger.error("Error in sell signal calculation: %s", e)
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
                    confidence=analysis["bullish_score"],
                    strategy=self.name,
                    metadata={
                        "indicators": {
                            k: v
                            for k, v in analysis.items()
                            if k not in ["buy_signal", "sell_signal", "error"]
                        },
                        "conditions": analysis.get("conditions", {}),
                    },
                )
            elif analysis["sell_signal"]:
                return TradingSignal(
                    symbol=symbol,
                    side=OrderSide.SELL,
                    strength=analysis["signal_strength"],
                    confidence=analysis["bearish_score"],
                    strategy=self.name,
                    metadata={
                        "indicators": {
                            k: v
                            for k, v in analysis.items()
                            if k not in ["buy_signal", "sell_signal", "error"]
                        },
                        "conditions": analysis.get("conditions", {}),
                    },
                )

            return None

        except Exception as e:
            logger.error("Error generating signal: %s", e)
            return None

    def get_atr(self, data: pd.DataFrame) -> float:
        """Get Average True Range for risk management."""
        try:
            atr = ta.atr(
                data["high"],
                data["low"],
                data["close"],
                length=self.parameters["atr_period"],
            )
            return float(atr.iloc[-1])
        except Exception:
            return 0.02  # Default 2% ATR
