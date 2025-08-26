let autoRefreshInterval = null;

async function fetchData(endpoint) {
    try {
        const response = await fetch(`/api/${endpoint}`);
        return await response.json();
    } catch (error) {
        console.error(`Error fetching ${endpoint}:`, error);
        return null;
    }
}

function formatTimestamp(date) {
    return new Date(date).toLocaleTimeString('ko-KR');
}

async function updateSystemHealth() {
    const health = await fetchData('health');
    if (!health) return;

    const statusClass = `status-${health.status}`;
    document.getElementById('systemHealth').innerHTML = `
        <div class="metric">
            <span>상태</span>
            <span class="metric-value ${statusClass}">${health.status.toUpperCase()}</span>
        </div>
        <div class="metric">
            <span>에러율</span>
            <span class="metric-value">${health.errorRate}/분</span>
        </div>
        <div class="metric">
            <span>총 에러</span>
            <span class="metric-value">${health.totalErrors}</span>
        </div>
        <div class="metric">
            <span>가동시간</span>
            <span class="metric-value">${Math.round(health.uptime / 1000)}초</span>
        </div>
    `;
}

async function updateErrorStats() {
    const stats = await fetchData('errors');
    if (!stats) return;

    let html = '';
    if (stats.byCode && stats.byCode.length > 0) {
        html = stats.byCode.map(([code, count]) => `
            <div class="metric">
                <span>${code}</span>
                <span class="metric-value">${count}</span>
            </div>
        `).join('');
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
        html = breakers.map(breaker => `
            <div class="circuit-breaker cb-${breaker.state}">
                <strong>${breaker.name}</strong>: ${breaker.state}
                <br><small>성공: ${breaker.stats.successes}, 실패: ${breaker.stats.failures}</small>
            </div>
        `).join('');
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
        html = logs.errors.slice(0, 10).map(error => `
            <div class="error-item">
                <strong>${error.code}</strong>: ${error.message}
                <br><small>${formatTimestamp(error.timestamp)} | ${error.context?.component || 'Unknown'}</small>
            </div>
        `).join('');
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
        const levelClass = `log-${log.level}`;
        return `
            <div class="log-line">
                <span class="timestamp">${formatTimestamp(log.time)}</span>
                <span class="${levelClass}">[${log.level.toUpperCase()}]</span>
                ${log.msg}
            </div>
        `;
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