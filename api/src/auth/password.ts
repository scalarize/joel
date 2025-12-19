/**
 * 密码哈希和验证工具函数
 * 使用 Web Crypto API 进行密码哈希（bcrypt 在 Cloudflare Workers 中不可用）
 */

/**
 * 生成密码哈希
 * 使用 PBKDF2 算法，这是 Web Crypto API 中可用的安全密码哈希方法
 */
export async function hashPassword(password: string): Promise<string> {
	console.log('[密码] 开始生成密码哈希');

	// 生成随机盐值
	const salt = crypto.getRandomValues(new Uint8Array(16));
	
	// 将密码转换为 ArrayBuffer
	const encoder = new TextEncoder();
	const passwordData = encoder.encode(password);

	// 使用 PBKDF2 进行哈希
	// 参数：算法、密钥、盐值、迭代次数、输出长度、哈希算法
	const keyMaterial = await crypto.subtle.importKey(
		'raw',
		passwordData,
		'PBKDF2',
		false,
		['deriveBits']
	);

	const hashBuffer = await crypto.subtle.deriveBits(
		{
			name: 'PBKDF2',
			salt: salt,
			iterations: 100000, // 迭代次数，提高安全性
			hash: 'SHA-256',
		},
		keyMaterial,
		256 // 输出 256 位（32 字节）
	);

	// 将盐值和哈希值组合并编码为 base64
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	const saltArray = Array.from(salt);
	
	// 格式：salt:hash（都使用 base64 编码）
	const saltBase64 = btoa(String.fromCharCode(...saltArray));
	const hashBase64 = btoa(String.fromCharCode(...hashArray));
	const combined = `${saltBase64}:${hashBase64}`;

	console.log('[密码] 密码哈希生成成功');
	return combined;
}

/**
 * 验证密码
 * 将输入的密码与存储的哈希值进行比较
 */
export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
	console.log('[密码] 开始验证密码');

	try {
		// 解析存储的哈希值（格式：salt:hash）
		const [saltBase64, hashBase64] = passwordHash.split(':');
		if (!saltBase64 || !hashBase64) {
			console.error('[密码] 密码哈希格式无效');
			return false;
		}

		// 解码盐值和哈希值
		const salt = Uint8Array.from(atob(saltBase64), (c) => c.charCodeAt(0));
		const storedHash = Uint8Array.from(atob(hashBase64), (c) => c.charCodeAt(0));

		// 将输入的密码转换为 ArrayBuffer
		const encoder = new TextEncoder();
		const passwordData = encoder.encode(password);

		// 使用相同的参数计算输入密码的哈希值
		const keyMaterial = await crypto.subtle.importKey(
			'raw',
			passwordData,
			'PBKDF2',
			false,
			['deriveBits']
		);

		const hashBuffer = await crypto.subtle.deriveBits(
			{
				name: 'PBKDF2',
				salt: salt,
				iterations: 100000,
				hash: 'SHA-256',
			},
			keyMaterial,
			256
		);

		const computedHash = new Uint8Array(hashBuffer);

		// 比较计算出的哈希值与存储的哈希值
		if (computedHash.length !== storedHash.length) {
			console.log('[密码] 密码验证失败：长度不匹配');
			return false;
		}

		// 使用常量时间比较，防止时序攻击
		let isEqual = true;
		for (let i = 0; i < computedHash.length; i++) {
			if (computedHash[i] !== storedHash[i]) {
				isEqual = false;
			}
		}

		if (isEqual) {
			console.log('[密码] 密码验证成功');
		} else {
			console.log('[密码] 密码验证失败：哈希值不匹配');
		}

		return isEqual;
	} catch (error) {
		console.error('[密码] 密码验证过程出错:', error);
		return false;
	}
}

/**
 * 验证密码强度
 * 返回错误消息，如果密码符合要求则返回 null
 */
export function validatePasswordStrength(password: string): string | null {
	if (password.length < 8) {
		return '密码长度至少需要 8 个字符';
	}

	if (password.length > 128) {
		return '密码长度不能超过 128 个字符';
	}

	// 检查是否包含至少一个字母和一个数字
	const hasLetter = /[a-zA-Z]/.test(password);
	const hasNumber = /[0-9]/.test(password);

	if (!hasLetter) {
		return '密码必须包含至少一个字母';
	}

	if (!hasNumber) {
		return '密码必须包含至少一个数字';
	}

	return null;
}

/**
 * 生成随机密码
 * 生成一个安全的随机密码，包含大小写字母、数字和特殊字符
 * 长度：16 个字符
 */
export function generateRandomPassword(): string {
	console.log('[密码] 生成随机密码');

	// 定义字符集
	const lowercase = 'abcdefghijklmnopqrstuvwxyz';
	const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
	const numbers = '0123456789';
	const special = '!@#$%^&*';
	const allChars = lowercase + uppercase + numbers + special;

	// 确保密码包含至少一个每种类型的字符
	let password = '';
	password += lowercase[Math.floor(Math.random() * lowercase.length)];
	password += uppercase[Math.floor(Math.random() * uppercase.length)];
	password += numbers[Math.floor(Math.random() * numbers.length)];
	password += special[Math.floor(Math.random() * special.length)];

	// 填充剩余字符
	const remainingLength = 16 - password.length;
	for (let i = 0; i < remainingLength; i++) {
		password += allChars[Math.floor(Math.random() * allChars.length)];
	}

	// 打乱字符顺序
	const passwordArray = password.split('');
	for (let i = passwordArray.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[passwordArray[i], passwordArray[j]] = [passwordArray[j], passwordArray[i]];
	}

	const finalPassword = passwordArray.join('');
	console.log('[密码] 随机密码生成成功');
	return finalPassword;
}

