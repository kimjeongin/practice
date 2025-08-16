/**
 * 웹 기반 모니터링 대시보드
 * 에러 통계, 시스템 헬스, 서킷 브레이커 상태를 실시간으로 확인
 */

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { errorMonitor } from '@/shared/monitoring/errorMonitor';
import { logger } from '@/shared/logger/index';
import { CircuitBreakerManager } from '@/shared/utils/resilience';

export class MonitoringDashboard {
  private server: any;
  private port: number;

  constructor(port: number = 3001) {
    this.port = port;
  }

  start(): void {
    this.server = createServer((req: IncomingMessage, res: ServerResponse) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      const url = req.url || '';

      if (url === '/' || url === '/dashboard') {
        this.serveDashboard(res);
      } else if (url === '/api/health') {
        this.serveHealthData(res);
      } else if (url === '/api/errors') {
        this.serveErrorData(res);
      } else if (url === '/api/circuit-breakers') {
        this.serveCircuitBreakerData(res);
      } else if (url === '/api/logs') {
        this.serveLogData(res);
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });

    this.server.listen(this.port, () => {
      logger.info(`Monitoring dashboard started`, { 
        port: this.port,
        url: `http://localhost:${this.port}` 
      });
    });
  }

  stop(): void {
    if (this.server) {
      this.server.close();
      logger.info('Monitoring dashboard stopped');
    }
  }

  private serveDashboard(res: ServerResponse): void {
    const html = `
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>RAG Server Monitoring Dashboard</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f5f7fa;
            color: #2d3748;
            line-height: 1.6;
        }
        .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; margin-bottom: 30px; }
        .header h1 { color: #2b6cb0; font-size: 2.5rem; margin-bottom: 10px; }
        .header p { color: #718096; font-size: 1.1rem; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
        .card { 
            background: white; 
            border-radius: 12px; 
            padding: 24px; 
            box-shadow: 0 4px 6px rgba(0,0,0,0.05);
            border: 1px solid #e2e8f0;
        }
        .card h2 { 
            color: #2d3748; 
            margin-bottom: 16px; 
            font-size: 1.25rem;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .status-healthy { color: #38a169; }
        .status-degraded { color: #d69e2e; }
        .status-unhealthy { color: #e53e3e; }
        .metric { 
            display: flex; 
            justify-content: space-between; 
            margin: 12px 0; 
            padding: 8px 0;
            border-bottom: 1px solid #f7fafc;
        }
        .metric:last-child { border-bottom: none; }
        .metric-value { font-weight: 600; }
        .error-list { max-height: 200px; overflow-y: auto; }
        .error-item { 
            padding: 8px 12px; 
            margin: 4px 0; 
            background: #fed7d7; 
            border-radius: 6px; 
            font-size: 0.9rem;
        }
        .circuit-breaker { margin: 8px 0; padding: 12px; border-radius: 6px; }
        .cb-closed { background: #c6f6d5; }
        .cb-open { background: #fed7d7; }
        .cb-half-open { background: #feebc8; }
        .refresh-btn {
            background: #4299e1;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 1rem;
            margin: 10px 5px;
        }
        .refresh-btn:hover { background: #3182ce; }
        .auto-refresh { margin: 20px 0; text-align: center; }
        .logs-container { max-height: 300px; overflow-y: auto; background: #1a202c; color: #e2e8f0; padding: 16px; border-radius: 8px; font-family: 'Monaco', 'Consolas', monospace; font-size: 0.85rem; }
        .log-line { margin: 2px 0; }
        .log-info { color: #68d391; }
        .log-warn { color: #f6e05e; }
        .log-error { color: #fc8181; }
        .log-debug { color: #90cdf4; }
        .timestamp { font-size: 0.75rem; color: #a0aec0; margin-right: 8px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚀 RAG Server Monitoring</h1>
            <p>실시간 에러 모니터링 및 시스템 헬스 대시보드</p>
        </div>

        <div class="auto-refresh">
            <button class="refresh-btn" onclick="refreshAll()">🔄 새로고침</button>
            <button class="refresh-btn" onclick="toggleAutoRefresh()" id="autoRefreshBtn">▶️ 자동 새로고침 시작</button>
        </div>

        <div class="grid">
            <!-- 시스템 헬스 -->
            <div class="card">
                <h2>💚 시스템 헬스</h2>
                <div id="systemHealth">Loading...</div>
            </div>

            <!-- 에러 통계 -->
            <div class="card">
                <h2>📊 에러 통계</h2>
                <div id="errorStats">Loading...</div>
            </div>

            <!-- 서킷 브레이커 상태 -->
            <div class="card">
                <h2>⚡ 서킷 브레이커</h2>
                <div id="circuitBreakers">Loading...</div>
            </div>

            <!-- 최근 에러 로그 -->
            <div class="card">
                <h2>🔥 최근 에러</h2>
                <div id="recentErrors" class="error-list">Loading...</div>
            </div>
        </div>

        <!-- 로그 뷰어 -->
        <div class="card" style="margin-top: 20px;">
            <h2>📝 실시간 로그</h2>
            <div id="logViewer" class="logs-container">Loading logs...</div>
        </div>
    </div>

    <script>
        let autoRefreshInterval = null;

        async function fetchData(endpoint) {
            try {
                const response = await fetch(\`/api/\${endpoint}\`);
                return await response.json();
            } catch (error) {
                console.error(\`Error fetching \${endpoint}:\`, error);
                return null;
            }
        }

        function formatTimestamp(date) {
            return new Date(date).toLocaleTimeString('ko-KR');
        }

        async function updateSystemHealth() {
            const health = await fetchData('health');
            if (!health) return;

            const statusClass = \`status-\${health.status}\`;
            document.getElementById('systemHealth').innerHTML = \`
                <div class="metric">
                    <span>상태</span>
                    <span class="metric-value \${statusClass}">\${health.status.toUpperCase()}</span>
                </div>
                <div class="metric">
                    <span>에러율</span>
                    <span class="metric-value">\${health.errorRate}/분</span>
                </div>
                <div class="metric">
                    <span>총 에러</span>
                    <span class="metric-value">\${health.totalErrors}</span>
                </div>
                <div class="metric">
                    <span>가동시간</span>
                    <span class="metric-value">\${Math.round(health.uptime / 1000)}초</span>
                </div>
            \`;
        }

        async function updateErrorStats() {
            const stats = await fetchData('errors');
            if (!stats) return;

            let html = '';
            if (stats.byCode && stats.byCode.length > 0) {
                html = stats.byCode.map(([code, count]) => \`
                    <div class="metric">
                        <span>\${code}</span>
                        <span class="metric-value">\${count}</span>
                    </div>
                \`).join('');
            } else {
                html = '<div class="metric"><span>에러 없음</span><span class="metric-value">✅</span></div>';
            }
            
            document.getElementById('errorStats').innerHTML = html;
        }

        async function updateCircuitBreakers() {
            const breakers = await fetchData('circuit-breakers');
            if (!breakers) return;

            let html = '';
            if (breakers.length > 0) {
                html = breakers.map(breaker => \`
                    <div class="circuit-breaker cb-\${breaker.state}">
                        <strong>\${breaker.name}</strong>: \${breaker.state}
                        <br><small>성공: \${breaker.stats.successes}, 실패: \${breaker.stats.failures}</small>
                    </div>
                \`).join('');
            } else {
                html = '<div>서킷 브레이커 없음</div>';
            }
            
            document.getElementById('circuitBreakers').innerHTML = html;
        }

        async function updateRecentErrors() {
            const logs = await fetchData('logs');
            if (!logs || !logs.errors) return;

            let html = '';
            if (logs.errors.length > 0) {
                html = logs.errors.slice(0, 10).map(error => \`
                    <div class="error-item">
                        <strong>\${error.code}</strong>: \${error.message}
                        <br><small>\${formatTimestamp(error.timestamp)} | \${error.context?.component || 'Unknown'}</small>
                    </div>
                \`).join('');
            } else {
                html = '<div>최근 에러 없음 ✅</div>';
            }
            
            document.getElementById('recentErrors').innerHTML = html;
        }

        async function updateLogs() {
            const logs = await fetchData('logs');
            if (!logs || !logs.recent) return;

            const logViewer = document.getElementById('logViewer');
            const html = logs.recent.slice(-50).map(log => {
                const levelClass = \`log-\${log.level}\`;
                return \`
                    <div class="log-line">
                        <span class="timestamp">\${formatTimestamp(log.time)}</span>
                        <span class="\${levelClass}">[UE\${log.level.toUpperCase()}]</span>
                        \${log.msg}
                    </div>
                \`;
            }).join('');
            
            logViewer.innerHTML = html;
            logViewer.scrollTop = logViewer.scrollHeight;
        }

        async function refreshAll() {
            await Promise.all([
                updateSystemHealth(),
                updateErrorStats(),
                updateCircuitBreakers(),
                updateRecentErrors(),
                updateLogs()
            ]);
        }

        function toggleAutoRefresh() {
            const btn = document.getElementById('autoRefreshBtn');
            if (autoRefreshInterval) {
                clearInterval(autoRefreshInterval);
                autoRefreshInterval = null;
                btn.textContent = '▶️ 자동 새로고침 시작';
            } else {
                autoRefreshInterval = setInterval(refreshAll, 5000); // 5초마다
                btn.textContent = '⏸️ 자동 새로고침 중지';
            }
        }

        // 초기 로드
        refreshAll();
    </script>
</body>
</html>
    `;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.writeHead(200);
    res.end(html);
  }

  private serveHealthData(res: ServerResponse): void {
    try {
      const health = errorMonitor.getSystemHealth();
      res.setHeader('Content-Type', 'application/json');
      res.writeHead(200);
      res.end(JSON.stringify(health));
    } catch (error) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: 'Failed to get health data' }));
    }
  }

  private serveErrorData(res: ServerResponse): void {
    try {
      const stats = errorMonitor.getErrorStatistics();
      const response = {
        byCode: Array.from(stats.byCode.entries()),
        byComponent: Array.from(stats.byComponent.entries()),
        timeline: stats.timeline
      };
      res.setHeader('Content-Type', 'application/json');
      res.writeHead(200);
      res.end(JSON.stringify(response));
    } catch (error) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: 'Failed to get error data' }));
    }
  }

  private serveCircuitBreakerData(res: ServerResponse): void {
    try {
      const status = CircuitBreakerManager.getStatus();
      res.setHeader('Content-Type', 'application/json');
      res.writeHead(200);
      res.end(JSON.stringify(status));
    } catch (error) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: 'Failed to get circuit breaker data' }));
    }
  }

  private serveLogData(res: ServerResponse): void {
    try {
      // 실제 프로덕션에서는 로그 파일이나 로그 수집 서비스에서 데이터를 가져와야 함
      const errors = errorMonitor.getErrorHistory(20);
      const recent: any[] = []; // 실시간 로그는 향후 구현

      const response = {
        errors: errors.map(error => ({
          code: error.code,
          message: error.message,
          timestamp: error.timestamp,
          context: error.context
        })),
        recent
      };

      res.setHeader('Content-Type', 'application/json');
      res.writeHead(200);
      res.end(JSON.stringify(response));
    } catch (error) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: 'Failed to get log data' }));
    }
  }
}

export const monitoringDashboard = new MonitoringDashboard();