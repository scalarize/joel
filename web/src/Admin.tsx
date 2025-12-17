/**
 * 管理员后台 - Cloudflare 用量仪表盘
 */

import { useEffect, useState } from 'react';
import './Admin.css';

interface UsageMetrics {
	d1: {
		queries: number;
		rowsRead: number;
		rowsWritten: number;
		storageBytes: number;
	};
	r2: {
		storageBytes: number;
		classAOperations: number;
		classBOperations: number;
	};
	workers: {
		requests: number;
		cpuTimeMs: number;
	};
}

export default function Admin() {
	const [metrics, setMetrics] = useState<UsageMetrics | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [unauthorized, setUnauthorized] = useState(false);

	useEffect(() => {
		loadMetrics();
	}, []);

	const loadMetrics = async () => {
		try {
			setLoading(true);
			setError(null);
			setUnauthorized(false);

			const response = await fetch('/api/admin/analytics', {
				credentials: 'include',
			});

			if (response.status === 403) {
				setUnauthorized(true);
				return;
			}

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.message || `HTTP ${response.status}`);
			}

			const data: UsageMetrics = await response.json();
			setMetrics(data);
		} catch (err) {
			console.error('[Admin] 加载用量数据失败:', err);
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

	// 格式化 CPU 时间（毫秒转秒）
	const formatCpuTime = (ms: number): string => {
		if (ms < 1000) return `${ms.toFixed(0)} ms`;
		return `${(ms / 1000).toFixed(2)} s`;
	};

	if (unauthorized) {
		return (
			<div className="admin-container">
				<div className="admin-header">
					<h2>系统管理</h2>
				</div>
				<div className="admin-error">
					<p>⚠️ 无权限访问</p>
					<p className="admin-error-detail">您没有管理员权限，无法访问此页面。</p>
				</div>
			</div>
		);
	}

	if (loading) {
		return (
			<div className="admin-container">
				<div className="admin-header">
					<h2>系统管理</h2>
				</div>
				<div className="admin-loading">加载中...</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="admin-container">
				<div className="admin-header">
					<h2>系统管理</h2>
				</div>
				<div className="admin-error">
					<p>❌ 加载失败</p>
					<p className="admin-error-detail">{error}</p>
					<button onClick={loadMetrics} className="admin-retry-btn">
						重试
					</button>
				</div>
			</div>
		);
	}

	if (!metrics) {
		return null;
	}

	return (
		<div className="admin-container">
			<div className="admin-header">
				<h2>Cloudflare 用量仪表盘</h2>
				<button onClick={loadMetrics} className="admin-refresh-btn">
					刷新
				</button>
			</div>

			<div className="admin-metrics">
				{/* D1 数据库用量 */}
				<div className="admin-metric-card">
					<h3 className="admin-metric-title">📊 D1 数据库</h3>
					<div className="admin-metric-content">
						<div className="admin-metric-item">
							<span className="admin-metric-label">查询次数</span>
							<span className="admin-metric-value">{formatNumber(metrics.d1.queries)}</span>
						</div>
						<div className="admin-metric-item">
							<span className="admin-metric-label">读取行数</span>
							<span className="admin-metric-value">{formatNumber(metrics.d1.rowsRead)}</span>
						</div>
						<div className="admin-metric-item">
							<span className="admin-metric-label">写入行数</span>
							<span className="admin-metric-value">{formatNumber(metrics.d1.rowsWritten)}</span>
						</div>
						<div className="admin-metric-item">
							<span className="admin-metric-label">存储容量</span>
							<span className="admin-metric-value">{formatBytes(metrics.d1.storageBytes)}</span>
						</div>
					</div>
				</div>

				{/* R2 存储用量 */}
				<div className="admin-metric-card">
					<h3 className="admin-metric-title">💾 R2 存储</h3>
					<div className="admin-metric-content">
						<div className="admin-metric-item">
							<span className="admin-metric-label">存储容量</span>
							<span className="admin-metric-value">{formatBytes(metrics.r2.storageBytes)}</span>
						</div>
						<div className="admin-metric-item">
							<span className="admin-metric-label">A类操作（写入）</span>
							<span className="admin-metric-value">{formatNumber(metrics.r2.classAOperations)}</span>
						</div>
						<div className="admin-metric-item">
							<span className="admin-metric-label">B类操作（读取）</span>
							<span className="admin-metric-value">{formatNumber(metrics.r2.classBOperations)}</span>
						</div>
					</div>
				</div>

				{/* Workers 用量 */}
				<div className="admin-metric-card">
					<h3 className="admin-metric-title">⚡ Workers</h3>
					<div className="admin-metric-content">
						<div className="admin-metric-item">
							<span className="admin-metric-label">请求数量</span>
							<span className="admin-metric-value">{formatNumber(metrics.workers.requests)}</span>
						</div>
						<div className="admin-metric-item">
							<span className="admin-metric-label">CPU 执行时间</span>
							<span className="admin-metric-value">{formatCpuTime(metrics.workers.cpuTimeMs)}</span>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

