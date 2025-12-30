#!/usr/bin/env node

/**
 * 初始化拼图游戏图片库
 * 
 * 功能：
 * 1. 通过 Google 图片搜索获取「古风美景」图片
 * 2. 选择接近 16:9 比例的图片，转换为 1600x900
 * 3. 上传到 R2 存储桶
 * 
 * 使用方法：
 * 1. 安装依赖：npm install sharp
 * 2. 确保已安装 wrangler（全局或本地）：npm install -g wrangler 或 npm install wrangler
 * 3. 登录 wrangler：wrangler login
 * 4. 配置环境变量（见 scripts/README.md）
 * 5. 运行：node scripts/init-puzzler-images.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { execSync } = require('child_process');

// 检查依赖
let sharp;
try {
	sharp = require('sharp');
} catch (e) {
	console.error('[错误] 请先安装 sharp: npm install sharp');
	process.exit(1);
}

// 配置
const CONFIG = {
	// Google Custom Search API 配置
	// 获取方式：https://developers.google.com/custom-search/v1/overview
	// 1. 创建 API Key: https://console.cloud.google.com/apis/credentials
	// 2. 创建 Custom Search Engine: https://programmablesearchengine.google.com/controlpanel/create
	//    在 CSE 设置中启用"图片搜索"
	GOOGLE_API_KEY: process.env.GOOGLE_API_KEY || 'AIzaSyA4BMEiByjUTNN-XwJs7LHQON5rNoWp1kA',
	GOOGLE_CSE_ID: process.env.GOOGLE_CSE_ID || '62760f4c3efee4556', // Custom Search Engine ID (从 CSE 控制台获取)
	
	// Cloudflare R2 配置
	// 使用 wrangler 命令行上传，需要在 api 目录下执行
	// 确保已登录 wrangler: wrangler login
	R2_BUCKET_NAME: 'joel-assets',
	API_DIR: path.join(__dirname, '../api'), // wrangler.jsonc 所在的目录
	
	// 图片配置
	TARGET_WIDTH: 1600,
	TARGET_HEIGHT: 900,
	TARGET_ASPECT_RATIO: 16 / 9, // 1.777...
	ASPECT_TOLERANCE: 0.1, // 允许的宽高比误差（10%）
	SEARCH_KEYWORD: '古风美景',
	NUM_IMAGES: 10,
	
	// 临时目录
	TEMP_DIR: path.join(__dirname, '../temp-images'),
};

/**
 * 创建临时目录
 */
function ensureTempDir() {
	if (!fs.existsSync(CONFIG.TEMP_DIR)) {
		fs.mkdirSync(CONFIG.TEMP_DIR, { recursive: true });
		console.log(`[初始化] 创建临时目录: ${CONFIG.TEMP_DIR}`);
	}
}

/**
 * 检查临时目录中已有的处理好的图片
 */
function getExistingProcessedImages() {
	if (!fs.existsSync(CONFIG.TEMP_DIR)) {
		return [];
	}
	
	const files = fs.readdirSync(CONFIG.TEMP_DIR);
	const processedImages = [];
	
	for (const file of files) {
		if (file.startsWith('processed-') && file.endsWith('.jpg')) {
			const match = file.match(/processed-(\d+)\.jpg/);
			if (match) {
				const index = parseInt(match[1], 10);
				const filePath = path.join(CONFIG.TEMP_DIR, file);
				const stats = fs.statSync(filePath);
				processedImages.push({
					index: index,
					localPath: filePath,
					size: stats.size,
					modified: stats.mtime,
				});
			}
		}
	}
	
	// 按 index 排序
	processedImages.sort((a, b) => a.index - b.index);
	
	return processedImages;
}

/**
 * 下载图片
 */
function downloadImage(url, outputPath) {
	return new Promise((resolve, reject) => {
		const protocol = url.startsWith('https') ? https : http;
		
		protocol.get(url, (response) => {
			if (response.statusCode !== 200) {
				reject(new Error(`下载失败: HTTP ${response.statusCode}`));
				return;
			}
			
			const fileStream = fs.createWriteStream(outputPath);
			response.pipe(fileStream);
			
			fileStream.on('finish', () => {
				fileStream.close();
				resolve();
			});
			
			fileStream.on('error', (err) => {
				fs.unlinkSync(outputPath);
				reject(err);
			});
		}).on('error', reject);
	});
}

/**
 * 获取图片尺寸
 */
async function getImageDimensions(imagePath) {
	const metadata = await sharp(imagePath).metadata();
	return {
		width: metadata.width,
		height: metadata.height,
		aspectRatio: metadata.width / metadata.height,
	};
}

/**
 * 检查图片宽高比是否接近 16:9
 */
function isAspectRatioClose(aspectRatio) {
	const diff = Math.abs(aspectRatio - CONFIG.TARGET_ASPECT_RATIO);
	return diff <= CONFIG.ASPECT_TOLERANCE;
}

/**
 * 处理图片：裁剪并调整到 1600x900
 */
async function processImage(inputPath, outputPath) {
	try {
		const metadata = await sharp(inputPath).metadata();
		const { width, height } = metadata;
		const aspectRatio = width / height;
		const targetAspectRatio = CONFIG.TARGET_ASPECT_RATIO;
		
		// 使用 sharp 的 resize with cover 模式，自动处理裁剪
		// cover 模式会保持宽高比，裁剪多余部分，确保输出尺寸
		await sharp(inputPath)
			.resize(CONFIG.TARGET_WIDTH, CONFIG.TARGET_HEIGHT, {
				fit: 'cover', // 保持宽高比，裁剪多余部分
				position: 'center', // 从中心裁剪
			})
			.jpeg({ quality: 85 })
			.toFile(outputPath);
		
		console.log(`[处理] 图片已处理: ${width}x${height} (${aspectRatio.toFixed(2)}) -> ${CONFIG.TARGET_WIDTH}x${CONFIG.TARGET_HEIGHT}`);
		return true;
	} catch (error) {
		console.error(`[处理] 图片处理失败: ${error.message}`);
		return false;
	}
}

/**
 * 使用 Google Custom Search API 搜索图片
 */
async function searchImages(keyword, num = 10) {
	if (!CONFIG.GOOGLE_API_KEY || !CONFIG.GOOGLE_CSE_ID) {
		throw new Error('请配置 GOOGLE_API_KEY 和 GOOGLE_CSE_ID 环境变量');
	}
	
	const searchUrl = new URL('https://www.googleapis.com/customsearch/v1');
	searchUrl.searchParams.set('key', CONFIG.GOOGLE_API_KEY);
	searchUrl.searchParams.set('cx', CONFIG.GOOGLE_CSE_ID);
	searchUrl.searchParams.set('q', keyword);
	searchUrl.searchParams.set('searchType', 'image');
	searchUrl.searchParams.set('num', Math.min(num * 2, 10)); // 一次最多 10 个，多搜索几次
	searchUrl.searchParams.set('imgSize', 'large');
	searchUrl.searchParams.set('imgType', 'photo');
	searchUrl.searchParams.set('safe', 'active');
	
	const results = [];
	let startIndex = 1;
	
	while (results.length < num * 2 && startIndex <= 100) {
		searchUrl.searchParams.set('start', startIndex.toString());
		
		try {
			// 使用 Node.js 原生 https 模块
			const response = await new Promise((resolve, reject) => {
				https.get(searchUrl.toString(), (res) => {
					let data = '';
					res.on('data', (chunk) => {
						data += chunk;
					});
					res.on('end', () => {
						resolve({
							ok: res.statusCode === 200,
							status: res.statusCode,
							json: () => Promise.resolve(JSON.parse(data)),
						});
					});
				}).on('error', reject);
			});
			
			if (!response.ok) {
				throw new Error(`Google API 请求失败: ${response.status}`);
			}
			
			const data = await response.json();
			
			if (!data.items || data.items.length === 0) {
				console.log('[搜索] 没有更多结果');
				break;
			}
			
			for (const item of data.items) {
				if (item.link && item.image) {
					results.push({
						url: item.link,
						width: item.image.width,
						height: item.image.height,
						aspectRatio: item.image.width / item.image.height,
					});
				}
			}
			
			console.log(`[搜索] 已获取 ${results.length} 个结果`);
			startIndex += 10;
			
			// 避免请求过快
			await new Promise(resolve => setTimeout(resolve, 1000));
		} catch (error) {
			console.error(`[搜索] 搜索失败: ${error.message}`);
			break;
		}
	}
	
	return results;
}

/**
 * 执行命令（静默模式，返回输出）
 */
function execSilent(cmd) {
	try {
		return execSync(cmd, { 
			encoding: 'utf-8', 
			stdio: ['pipe', 'pipe', 'pipe'],
			maxBuffer: 10 * 1024 * 1024 // 10MB buffer for large files
		});
	} catch (err) {
		return null;
	}
}

/**
 * 执行命令（显示输出）
 */
function exec(cmd) {
	console.log(`   $ ${cmd}`);
	try {
		return execSync(cmd, { encoding: 'utf-8', stdio: 'inherit' });
	} catch (err) {
		throw new Error(`命令执行失败: ${cmd}`);
	}
}

/**
 * 上传图片到 R2（使用 wrangler 命令行）
 */
function uploadToR2(localPath, remotePath) {
	if (!fs.existsSync(localPath)) {
		throw new Error(`文件不存在: ${localPath}`);
	}
	
	// 检查 wrangler 是否可用
	const wranglerCheck = execSilent('which wrangler');
	if (!wranglerCheck) {
		// 尝试使用 npx
		const npxCheck = execSilent('npx --yes wrangler --version');
		if (!npxCheck) {
			throw new Error('wrangler 命令不可用，请先安装: npm install -g wrangler 或 npx wrangler');
		}
	}
	
	// 检查 api 目录是否存在
	if (!fs.existsSync(CONFIG.API_DIR)) {
		throw new Error(`API 目录不存在: ${CONFIG.API_DIR}`);
	}
	
	const fileSize = fs.statSync(localPath).size;
	console.log(`[上传] 文件大小: ${(fileSize / 1024).toFixed(2)} KB`);
	
	// 使用 wrangler r2 object put 命令上传
	// 格式：wrangler r2 object put "bucket-name/remote-path" --file="local-path" --remote
	const remoteKey = `${CONFIG.R2_BUCKET_NAME}/${remotePath}`;
	const localPathEscaped = localPath.replace(/"/g, '\\"'); // 转义引号
	const wranglerCmd = wranglerCheck ? 'wrangler' : 'npx --yes wrangler';
	const cmd = `cd "${CONFIG.API_DIR}" && ${wranglerCmd} r2 object put "${remoteKey}" --file="${localPathEscaped}" --remote`;
	
	try {
		exec(cmd);
		console.log(`[上传] ✅ 已上传: ${remotePath}`);
	} catch (error) {
		console.error(`[上传] ❌ 上传失败: ${error.message}`);
		console.error(`[上传] 检查:`);
		console.error(`  - 本地文件: ${localPath}`);
		console.error(`  - 远程路径: ${remotePath}`);
		console.error(`  - Bucket: ${CONFIG.R2_BUCKET_NAME}`);
		console.error(`[提示] 请确保已登录 wrangler: wrangler login`);
		console.error(`[提示] 请确保 wrangler.jsonc 中配置了 R2 bucket: ${CONFIG.R2_BUCKET_NAME}`);
		throw error;
	}
}

/**
 * 主函数
 */
async function main() {
	console.log('[初始化] 开始初始化拼图游戏图片库...');
	
	try {
		// 检查配置
		if (!CONFIG.GOOGLE_API_KEY || !CONFIG.GOOGLE_CSE_ID) {
			console.error('[错误] 请配置 GOOGLE_API_KEY 和 GOOGLE_CSE_ID 环境变量');
			console.error('[提示] 获取方式：https://developers.google.com/custom-search/v1/overview');
			process.exit(1);
		}
		
		// 检查 wrangler 是否可用
		const wranglerCheck = execSilent('which wrangler || npx --yes wrangler --version');
		if (!wranglerCheck) {
			console.error('[错误] wrangler 不可用');
			console.error('[提示] 请确保已安装 wrangler: npm install -g wrangler');
			console.error('[提示] 或使用 npx wrangler（需要先安装 wrangler 到项目）');
			process.exit(1);
		}
		
		// 检查 api 目录
		if (!fs.existsSync(CONFIG.API_DIR)) {
			console.error(`[错误] API 目录不存在: ${CONFIG.API_DIR}`);
			console.error('[提示] 请确保 api 目录存在，且包含 wrangler.jsonc 配置文件');
			process.exit(1);
		}
		
		ensureTempDir();
		
		// 1. 检查临时目录中已有的处理好的图片
		console.log('[检查] 检查临时目录中已有的图片...');
		const existingImages = getExistingProcessedImages();
		console.log(`[检查] 找到 ${existingImages.length} 张已处理的图片`);
		
		let processedImages = [];
		
		// 如果已有足够的图片，直接使用
		if (existingImages.length >= CONFIG.NUM_IMAGES) {
			console.log(`[检查] 已有足够的图片 (${existingImages.length} >= ${CONFIG.NUM_IMAGES})，跳过搜索和下载`);
			processedImages = existingImages.slice(0, CONFIG.NUM_IMAGES).map(img => ({
				index: img.index,
				localPath: img.localPath,
			}));
		} else {
			// 需要搜索和下载新图片
			const needCount = CONFIG.NUM_IMAGES - existingImages.length;
			console.log(`[搜索] 需要 ${needCount} 张新图片，正在搜索「${CONFIG.SEARCH_KEYWORD}」...`);
			
			// 1. 搜索图片
			const searchResults = await searchImages(CONFIG.SEARCH_KEYWORD, needCount * 3);
			
			// 2. 筛选接近 16:9 的图片
			const filteredResults = searchResults.filter(item => 
				isAspectRatioClose(item.aspectRatio)
			);
			
			console.log(`[筛选] 找到 ${filteredResults.length} 张接近 16:9 的图片`);
			
			if (filteredResults.length < needCount) {
				console.warn(`[警告] 只找到 ${filteredResults.length} 张符合条件的图片，需要 ${needCount} 张`);
			}
			
			// 3. 下载和处理图片
			const selectedImages = filteredResults.slice(0, needCount);
			const newProcessedImages = [];
			
			// 找到下一个可用的索引
			const nextIndex = existingImages.length > 0 
				? Math.max(...existingImages.map(img => img.index)) + 1 
				: 1;
			
			for (let i = 0; i < selectedImages.length; i++) {
				const image = selectedImages[i];
				const currentIndex = nextIndex + i;
				const tempPath = path.join(CONFIG.TEMP_DIR, `temp-${currentIndex}.jpg`);
				const processedPath = path.join(CONFIG.TEMP_DIR, `processed-${currentIndex}.jpg`);
				
				try {
					console.log(`[下载] (${i + 1}/${selectedImages.length}) ${image.url}`);
					await downloadImage(image.url, tempPath);
					
					// 验证图片
					const dimensions = await getImageDimensions(tempPath);
					if (!isAspectRatioClose(dimensions.aspectRatio)) {
						console.log(`[跳过] 图片宽高比不符合要求: ${dimensions.aspectRatio.toFixed(2)}`);
						if (fs.existsSync(tempPath)) {
							fs.unlinkSync(tempPath);
						}
						continue;
					}
					
					// 处理图片
					const success = await processImage(tempPath, processedPath);
					if (success) {
						newProcessedImages.push({
							index: currentIndex,
							localPath: processedPath,
						});
						// 删除临时文件，但保留处理好的图片
						if (fs.existsSync(tempPath)) {
							fs.unlinkSync(tempPath);
						}
					}
				} catch (error) {
					console.error(`[错误] 处理图片失败: ${error.message}`);
					if (fs.existsSync(tempPath)) {
						fs.unlinkSync(tempPath);
					}
				}
			}
			
			// 合并已有图片和新处理的图片
			processedImages = [
				...existingImages.slice(0, CONFIG.NUM_IMAGES - newProcessedImages.length).map(img => ({
					index: img.index,
					localPath: img.localPath,
				})),
				...newProcessedImages,
			].slice(0, CONFIG.NUM_IMAGES);
			
			if (processedImages.length < CONFIG.NUM_IMAGES) {
				console.warn(`[警告] 总共只有 ${processedImages.length} 张图片，需要 ${CONFIG.NUM_IMAGES} 张`);
			}
		}
		
		// 4. 上传到 R2（同步覆盖）
		// 将处理好的图片映射到 1.jpg ~ 10.jpg
		console.log(`[上传] 正在上传 ${processedImages.length} 张图片到 R2...`);
		let successCount = 0;
		let failCount = 0;
		
		for (let i = 0; i < processedImages.length && i < CONFIG.NUM_IMAGES; i++) {
			const image = processedImages[i];
			const remoteIndex = i + 1; // R2 中的文件名：1.jpg, 2.jpg, ..., 10.jpg
			const remotePath = `mini-games/puzzler/images/${remoteIndex}.jpg`;
			
			try {
				console.log(`[上传] (${i + 1}/${processedImages.length}) ${path.basename(image.localPath)} -> ${remotePath}`);
				uploadToR2(image.localPath, remotePath);
				successCount++;
			} catch (error) {
				console.error(`[上传] 上传失败 ${remotePath}: ${error.message}`);
				failCount++;
			}
		}
		
		console.log(`[完成] 上传完成: 成功 ${successCount} 张，失败 ${failCount} 张`);
		console.log(`[完成] 临时图片保存在: ${CONFIG.TEMP_DIR}`);
		console.log(`[提示] 下次运行时会自动使用已有的图片，避免重复搜索`);
		
	} catch (error) {
		console.error('[错误] 初始化失败:', error);
		process.exit(1);
	}
}

// 运行主函数
if (require.main === module) {
	main();
}

module.exports = { main };

