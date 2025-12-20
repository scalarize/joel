/**
 * 管理员后台 - Cloudflare 用量仪表盘子模块
 */

import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import './Admin.css';

/**
 * 获取 API 基础 URL
 * 根据当前域名判断使用 .org 还是 .cn
 */
function getApiBaseUrl(): string {
	const hostname = window.location.hostname;
	if (hostname === 'joel.scalarize.cn' || hostname.includes('.scalarize.cn')) {
		return 'https://api.joel.scalarize.cn';
	}
	return 'https://api.joel.scalarize.org';
}

/**
 * 构建完整的 API URL
 */
function getApiUrl(path: string): string {
	const baseUrl = getApiBaseUrl();
	// 确保 path 以 / 开头
	const normalizedPath = path.startsWith('/') ? path : `/${path}`;
	return `${baseUrl}${normalizedPath}`;
}

interface DateDataPoint {
	date: string;
	value: number;
}

interface UsageMetrics {
	d1: {
		rowsRead: DateDataPoint[];
		rowsWritten: DateDataPoint[];
		queryDurationMs: DateDataPoint[];
	};
	r2: {
		requests: DateDataPoint[];
		responseBytes: DateDataPoint[];
		objectCount: DateDataPoint[];
		payloadSize: DateDataPoint[];
	};
	workers: {
		requests: DateDataPoint[];
		subrequests: DateDataPoint[];
	};
}

export default function AdminDashboard() {
	const [metrics, setMetrics] = useState<UsageMetrics | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	// 日期范围状态（默认最近30天）
	const today = new Date().toISOString().split('T')[0];
	const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
	const [startDate, setStartDate] = useState(thirtyDaysAgo);
	const [endDate, setEndDate] = useState(today);

	useEffect(() => {
		loadMetrics();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const loadMetrics = async () => {
		try {
			setLoading(true);
			setError(null);

			const params = new URLSearchParams({
				startDate,
				endDate,
			});

			const response = await fetch(getApiUrl(`/api/admin/analytics?${params}`), {
				credentials: 'include',
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.message || `HTTP ${response.status}`);
			}

			const data: UsageMetrics = await response.json();
			setMetrics(data);
		} catch (err) {
			console.error('[AdminDashboard] 加载用量数据失败:', err);
			setError(err instanceof Error ? err.message : '加载失败');
		} finally {
			setLoading(false);
		}
	};

	// 格式化字节数
	const formatBytes = (bytes: number): string => {
		if (bytes === 0) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
	};

	// 格式化数字（添加千分位）
	const formatNumber = (num: number): string => {
		return num.toLocaleString('zh-CN');
	};

	// 格式化毫秒
	const formatMs = (ms: number): string => {
		if (ms < 1000) return `${ms.toFixed(0)} ms`;
		return `${(ms / 1000).toFixed(2)} s`;
	};

	// 计算总和
	const sumValues = (data: DateDataPoint[]): number => {
		return data.reduce((acc, item) => acc + item.value, 0);
	};

	// 获取最大值
	const maxValue = (data: DateDataPoint[]): number => {
		if (data.length === 0) return 0;
		return Math.max(...data.map((item) => item.value));
	};

	if (loading) {
		return <div className="admin-loading">加载中...</div>;
	}

	if (error) {
		return (
			<div className="admin-error">
				<p>❌ 加载失败</p>
				<p className="admin-error-detail">{error}</p>
				<button onClick={loadMetrics} className="admin-retry-btn">
					重试
				</button>
			</div>
		);
	}

	if (!metrics) {
		return null;
	}

	return (
		<div>
			<div className="admin-header">
				<h2>Cloudflare 用量仪表盘</h2>
				<div className="admin-controls">
					<div className="date-picker">
						<label>
							开始日期：
							<input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
						</label>
						<label>
							结束日期：
							<input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
						</label>
					</div>
					<button onClick={loadMetrics} className="admin-refresh-btn">
						查询
					</button>
				</div>
			</div>

			<div className="admin-charts">
				{/* D1 数据库 */}
				<div className="admin-chart-section">
					<h3>📊 D1 数据库</h3>
					<div className="admin-chart-summary">
						<span>读取行数: {formatNumber(sumValues(metrics.d1.rowsRead))}</span>
						<span>写入行数: {formatNumber(sumValues(metrics.d1.rowsWritten))}</span>
						<span>查询耗时: {formatMs(sumValues(metrics.d1.queryDurationMs))}</span>
					</div>
					<div className="admin-chart-grid">
						<div className="admin-chart-card">
							<h4>行读写统计</h4>
							<ResponsiveContainer width="100%" height={250}>
								<LineChart
									data={metrics.d1.rowsRead.map((item, index) => ({
										date: item.date,
										读取: item.value,
										写入: metrics.d1.rowsWritten[index]?.value || 0,
									}))}
									margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
								>
									<CartesianGrid strokeDasharray="3 3" />
									<XAxis dataKey="date" tick={{ fontSize: 12 }} />
									<YAxis tick={{ fontSize: 12 }} />
									<Tooltip formatter={(value) => formatNumber(Number(value) || 0)} />
									<Legend />
									<Line type="monotone" dataKey="读取" stroke="#8884d8" dot={false} />
									<Line type="monotone" dataKey="写入" stroke="#82ca9d" dot={false} />
								</LineChart>
							</ResponsiveContainer>
						</div>
						<div className="admin-chart-card">
							<h4>查询耗时 (ms)</h4>
							<ResponsiveContainer width="100%" height={250}>
								<LineChart
									data={metrics.d1.queryDurationMs.map((item) => ({
										date: item.date,
										耗时: item.value,
									}))}
									margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
								>
									<CartesianGrid strokeDasharray="3 3" />
									<XAxis dataKey="date" tick={{ fontSize: 12 }} />
									<YAxis tick={{ fontSize: 12 }} />
									<Tooltip formatter={(value) => formatMs(Number(value) || 0)} />
									<Legend />
									<Line type="monotone" dataKey="耗时" stroke="#ff7300" dot={false} />
								</LineChart>
							</ResponsiveContainer>
						</div>
					</div>
				</div>

				{/* R2 存储 */}
				<div className="admin-chart-section">
					<h3>💾 R2 存储</h3>
					<div className="admin-chart-summary">
						<span>总请求数: {formatNumber(sumValues(metrics.r2.requests))}</span>
						<span>响应流量: {formatBytes(sumValues(metrics.r2.responseBytes))}</span>
						<span>最大对象数: {formatNumber(maxValue(metrics.r2.objectCount))}</span>
						<span>最大存储: {formatBytes(maxValue(metrics.r2.payloadSize))}</span>
					</div>
					<div className="admin-chart-grid">
						<div className="admin-chart-card">
							<h4>请求数 & 响应流量</h4>
							<ResponsiveContainer width="100%" height={250}>
								<LineChart
									data={metrics.r2.requests.map((item) => ({
										date: item.date,
										请求数: item.value,
									}))}
									margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
								>
									<CartesianGrid strokeDasharray="3 3" />
									<XAxis dataKey="date" tick={{ fontSize: 12 }} />
									<YAxis tick={{ fontSize: 12 }} />
									<Tooltip formatter={(value) => formatNumber(Number(value) || 0)} />
									<Legend />
									<Line type="monotone" dataKey="请求数" stroke="#8884d8" dot={false} />
								</LineChart>
							</ResponsiveContainer>
						</div>
						<div className="admin-chart-card">
							<h4>存储容量趋势</h4>
							<ResponsiveContainer width="100%" height={250}>
								<LineChart
									data={metrics.r2.payloadSize.map((item, index) => ({
										date: item.date,
										存储大小: item.value,
										对象数: metrics.r2.objectCount[index]?.value || 0,
									}))}
									margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
								>
									<CartesianGrid strokeDasharray="3 3" />
									<XAxis dataKey="date" tick={{ fontSize: 12 }} />
									<YAxis yAxisId="left" tick={{ fontSize: 12 }} />
									<YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} />
									<Tooltip
										formatter={(value, name) => (name === '存储大小' ? formatBytes(Number(value) || 0) : formatNumber(Number(value) || 0))}
									/>
									<Legend />
									<Line yAxisId="left" type="monotone" dataKey="存储大小" stroke="#82ca9d" dot={false} />
									<Line yAxisId="right" type="monotone" dataKey="对象数" stroke="#ff7300" dot={false} />
								</LineChart>
							</ResponsiveContainer>
						</div>
					</div>
				</div>

				{/* Workers */}
				<div className="admin-chart-section">
					<h3>⚡ Workers</h3>
					<div className="admin-chart-summary">
						<span>总请求数: {formatNumber(sumValues(metrics.workers.requests))}</span>
						<span>总子请求数: {formatNumber(sumValues(metrics.workers.subrequests))}</span>
					</div>
					<div className="admin-chart-grid">
						<div className="admin-chart-card admin-chart-full">
							<h4>请求统计</h4>
							<ResponsiveContainer width="100%" height={250}>
								<LineChart
									data={metrics.workers.requests.map((item, index) => ({
										date: item.date,
										请求: item.value,
										子请求: metrics.workers.subrequests[index]?.value || 0,
									}))}
									margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
								>
									<CartesianGrid strokeDasharray="3 3" />
									<XAxis dataKey="date" tick={{ fontSize: 12 }} />
									<YAxis tick={{ fontSize: 12 }} />
									<Tooltip formatter={(value) => formatNumber(Number(value) || 0)} />
									<Legend />
									<Line type="monotone" dataKey="请求" stroke="#8884d8" dot={false} />
									<Line type="monotone" dataKey="子请求" stroke="#82ca9d" dot={false} />
								</LineChart>
							</ResponsiveContainer>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
