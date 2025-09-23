# System Trading

A comprehensive cryptocurrency trading system supporting multiple exchanges with advanced algorithmic trading strategies, risk management, and backtesting capabilities.

## Features

### Core Trading Features
- **Multi-Exchange Support**: Unified API for Binance and Upbit exchanges
- **Advanced Trading Strategies**: Enhanced moving average, RSI, MACD with signal confidence
- **Risk Management**: Dynamic position sizing, portfolio tracking, and stop-loss mechanisms
- **Real-time Trading Engine**: Async signal processing with concurrent strategy execution
- **Portfolio Management**: Real-time balance tracking and performance monitoring

### Technical Features
- **High-Performance Backtesting**: vectorbt-based engine with parameter optimization
- **Type Safety**: Full MyPy type checking with strict configuration
- **Code Quality**: Ruff linting and formatting with pre-commit hooks
- **API Documentation**: Auto-generated OpenAPI/Swagger documentation
- **Containerization**: Docker support for easy deployment

### Data & Analytics
- **Real-time Market Data**: Live price feeds and technical indicators
- **Historical Data**: OHLCV data collection and storage
- **Performance Analytics**: Comprehensive trading statistics and metrics
- **Strategy Comparison**: Multi-strategy backtesting and performance comparison

## Tech Stack

- **Python 3.12**: Modern async/await patterns and type hints
- **uv**: Ultra-fast package management and dependency resolution
- **FastAPI**: High-performance async web framework with auto documentation
- **Pydantic v2**: Data validation and settings management
- **CCXT**: Unified cryptocurrency exchange API library
- **vectorbt**: High-performance backtesting and analytics
- **Pandas**: Data manipulation and time series analysis
- **PostgreSQL**: Primary database for trading data
- **Redis**: Caching and real-time data storage
- **Docker**: Containerization for production deployment

## Project Structure

```
system-trading/
├── system_trading/           # Main Python package
│   ├── api/                 # FastAPI web server and routers
│   │   ├── main.py         # FastAPI application setup
│   │   └── routers/        # API route handlers
│   ├── backtesting/        # Backtesting engine and utilities
│   │   ├── engine.py       # vectorbt-based backtesting
│   │   └── data_manager.py # Historical data management
│   ├── config/             # Configuration and settings
│   │   └── settings.py     # Pydantic settings with validation
│   ├── data/               # Data models and portfolio management
│   │   ├── models.py       # Unified data models
│   │   └── portfolio_manager.py # Risk management and portfolio tracking
│   ├── engine/             # Trading engine core
│   │   └── trading_engine.py # Main async trading orchestration
│   ├── exchanges/          # Exchange API clients
│   │   └── unified_client.py # CCXT-based unified client
│   ├── strategies/         # Trading strategies
│   │   ├── base_strategy.py # Strategy interface
│   │   ├── enhanced_ma_strategy.py # Advanced MA with MACD/RSI
│   │   └── rsi_strategy.py # RSI-based trading strategy
│   └── utils/              # Utility functions and helpers
├── tests/                   # Comprehensive test suite
│   ├── conftest.py         # Pytest fixtures and configuration
│   └── test_*/             # Test modules
├── docs/                   # Documentation
├── docker-compose.yml      # Docker services configuration
├── Dockerfile             # Application container
├── Makefile              # Development workflow automation
├── DEPLOYMENT.md         # Production deployment guide
└── pyproject.toml        # Project configuration and dependencies
```

## Getting Started

### Prerequisites

- Python 3.12+
- uv package manager (`curl -LsSf https://astral.sh/uv/install.sh | sh`)
- Docker (optional, for containerized deployment)

### Quick Setup

1. **Clone and Install**
```bash
git clone <repository-url>
cd system-trading
make dev-setup  # Installs dependencies and creates .env
```

2. **Configure Environment**
Edit `.env` file with your API credentials:
```bash
# Binance API (get from binance.com)
BINANCE_API_KEY=your_binance_api_key
BINANCE_SECRET_KEY=your_binance_secret_key
BINANCE_TESTNET=true  # Set to false for live trading

# Upbit API (get from upbit.com)
UPBIT_ACCESS_KEY=your_upbit_access_key
UPBIT_SECRET_KEY=your_upbit_secret_key

# Database (use defaults for Docker)
DATABASE_URL=postgresql://postgres:password@localhost:5432/trading_db
REDIS_URL=redis://localhost:6379/0
```

3. **Start Trading System**
```bash
# Option 1: Run all components
make run-all

# Option 2: Run API server only
make run-api

# Option 3: Run trading engine only
make run-engine

# Option 4: Docker deployment
make docker-up
```

### Development Workflow

```bash
# Install development dependencies
make dev

# Code quality checks
make format      # Format code with ruff
make lint        # Check code quality
make typecheck   # Run MyPy type checking
make test        # Run test suite
make check       # Run all quality checks

# Development server with auto-reload
make run-dev

# View logs
make logs
```

## API Documentation

Once running, access the interactive API documentation:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc
- **API Info**: http://localhost:8000/info

### Key Endpoints

- **Market Data**: `/api/market/*`
  - Get real-time prices, tickers, and market data
  - Historical OHLCV data retrieval
  - Technical indicator calculations

- **Trading**: `/api/trading/*`
  - Portfolio management and balance inquiry
  - Order creation and management
  - Position tracking and risk metrics

- **Backtesting**: `/api/backtest/*`
  - Strategy backtesting with historical data
  - Parameter optimization and strategy comparison
  - Performance analytics and reporting

## Trading Strategies

### Available Strategies

1. **Enhanced Moving Average Strategy**
   - EMA crossover with MACD and RSI confirmation
   - Volume-based signal validation
   - Dynamic stop-loss and take-profit levels

2. **RSI Strategy**
   - Oversold/overbought detection
   - Trend confirmation with moving averages
   - Risk-adjusted position sizing

### Strategy Development

Create custom strategies by extending `BaseStrategy`:

```python
from system_trading.strategies.base_strategy import BaseStrategy

class MyStrategy(BaseStrategy):
    def __init__(self, param1: float = 1.0):
        super().__init__(name="my_strategy")
        self.parameters = {"param1": param1}

    def should_buy(self, data: pd.DataFrame) -> bool:
        # Implement buy logic
        return False

    def should_sell(self, data: pd.DataFrame) -> bool:
        # Implement sell logic
        return False
```

## Backtesting

### Quick Backtest

```python
from system_trading.backtesting.engine import BacktestEngine
from system_trading.strategies.enhanced_ma_strategy import EnhancedMAStrategy

# Initialize components
engine = BacktestEngine(initial_cash=10000, commission=0.001)
strategy = EnhancedMAStrategy(short_window=10, long_window=30)

# Run backtest
result = engine.run_backtest(
    strategy=strategy,
    data=your_ohlcv_data,
    symbol="BTC/USDT"
)

# View results
print(result.get_summary())
result.plot_results()
```

### Parameter Optimization

```python
# Define parameter ranges
param_ranges = {
    "short_window": [5, 10, 15, 20],
    "long_window": [20, 30, 40, 50],
    "rsi_period": [14, 21, 28]
}

# Run optimization
optimization_result = engine.run_optimization(
    strategy_class=EnhancedMAStrategy,
    data=your_data,
    param_ranges=param_ranges,
    symbol="BTC/USDT",
    metric="sharpe_ratio"
)

print(f"Best parameters: {optimization_result['best_params']}")
print(f"Best Sharpe ratio: {optimization_result['best_score']}")
```

## Risk Management

### Position Sizing

The system uses dynamic position sizing based on:
- Account balance and risk percentage
- Signal confidence level
- Maximum position limits
- Volatility adjustments

### Risk Controls

- **Stop Loss**: Automatic position exit on adverse moves
- **Take Profit**: Profit-taking at predefined levels
- **Max Drawdown**: Portfolio protection mechanisms
- **Correlation Limits**: Diversification enforcement

## Production Deployment

For production deployment, see [DEPLOYMENT.md](DEPLOYMENT.md) for comprehensive setup instructions including:

- Docker containerization
- SSL/HTTPS configuration
- Database optimization
- Monitoring and logging
- Security best practices
- Backup and recovery

### Quick Production Start

```bash
# Clone and setup
git clone <repository-url>
cd system-trading
cp .env.example .env
# Edit .env with production settings

# Deploy with Docker
docker-compose up -d

# Check status
docker-compose ps
docker-compose logs -f
```

## Testing

### Test Suite

```bash
# Run all tests
make test

# Run with coverage
make test-cov

# Run specific test file
uv run pytest tests/test_strategies.py

# Run tests in watch mode
make test-watch
```

### Test Data

The test suite includes comprehensive fixtures:
- Sample OHLCV data with various market conditions
- Mock exchange clients for testing
- Portfolio and trading scenarios
- Strategy performance validation

## Configuration

### Trading Parameters

Key configuration options in `.env`:

```bash
# Risk Management
RISK_PERCENTAGE=0.02          # 2% risk per trade
MAX_POSITION_SIZE=1000.0      # Maximum position size
STOP_LOSS_PERCENTAGE=0.05     # 5% stop loss

# Trading Engine
TRADING_INTERVAL=60           # Signal check interval (seconds)
MAX_CONCURRENT_TRADES=5       # Maximum open positions

# API Settings
API_HOST=0.0.0.0
API_PORT=8000
API_DEBUG=false               # Set to true for development

# Logging
LOG_LEVEL=INFO
LOG_FILE=logs/trading.log
```

### Exchange Configuration

- **Binance**: Supports spot and futures trading
- **Upbit**: Korean exchange with KRW pairs
- **Testnet Support**: Available for safe testing

## Contributing

### Development Guidelines

1. **Code Style**: Follow PEP 8 and use type hints
2. **Testing**: Write tests for new features
3. **Documentation**: Update docstrings and README
4. **Quality**: Run `make check` before committing

### Pull Request Process

1. Fork the repository
2. Create a feature branch
3. Implement changes with tests
4. Run quality checks: `make check`
5. Submit pull request with description

## Performance

### Backtesting Performance

- **vectorbt**: Optimized for large datasets
- **Parallel Processing**: Multi-strategy optimization
- **Memory Efficient**: Streaming data processing

### Trading Engine

- **Async Processing**: Non-blocking operations
- **Real-time Data**: Low-latency market feeds
- **Scalable Architecture**: Microservice-ready design

## Security

### API Keys

- Store credentials securely in `.env`
- Use environment variables in production
- Enable API restrictions on exchange accounts
- Regular key rotation recommended

### Network Security

- HTTPS/SSL in production
- Firewall configuration
- VPN access for sensitive operations
- Rate limiting and DDoS protection

## Troubleshooting

### Common Issues

1. **Exchange Connection Errors**
   ```bash
   # Check API credentials and network
   curl -I https://api.binance.com/api/v3/ping
   ```

2. **Database Connection**
   ```bash
   # Verify PostgreSQL is running
   docker-compose ps postgres
   ```

3. **Permission Errors**
   ```bash
   # Check API key permissions on exchange
   # Ensure read/trade permissions are enabled
   ```

### Debug Mode

```bash
# Run with detailed logging
API_DEBUG=true LOG_LEVEL=DEBUG make run-dev

# Access container for debugging
docker-compose exec system-trading bash
```

## Roadmap

### Phase 1 (Current)
- ✅ Multi-exchange support (Binance, Upbit)
- ✅ Advanced trading strategies
- ✅ Risk management system
- ✅ Backtesting engine
- ✅ REST API with documentation

### Phase 2 (Next)
- 📋 WebSocket real-time data feeds
- 📋 Advanced order types (OCO, bracket orders)
- 📋 Machine learning strategy components
- 📋 Performance monitoring dashboard
- 📋 Alert and notification system

### Phase 3 (Future)
- 📋 Additional exchanges (KuCoin, Coinbase)
- 📋 Social trading features
- 📋 Mobile application
- 📋 Cloud deployment automation
- 📋 Advanced analytics and reporting

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

- 📧 **Issues**: Report bugs via GitHub Issues
- 📖 **Documentation**: Comprehensive guides in `/docs`
- 💬 **Community**: Join discussions on GitHub Discussions
- 🔧 **Professional Support**: Contact for enterprise solutions

---

**⚠️ Disclaimer**: This software is for educational and research purposes. Cryptocurrency trading involves substantial risk. Always test strategies thoroughly and never risk more than you can afford to lose.