#!/bin/bash
# 从 RSA 私钥生成 JWKS 格式的公钥
# 用法: ./scripts/generate-jwks.sh [私钥文件路径]

PRIVATE_KEY_FILE="${1:-.secrets/jwt_private_key.pem}"

if [ ! -f "$PRIVATE_KEY_FILE" ]; then
    echo "错误: 私钥文件不存在: $PRIVATE_KEY_FILE"
    exit 1
fi

echo "从私钥生成 JWKS..."
echo "私钥文件: $PRIVATE_KEY_FILE"
echo ""

# 使用 Python 生成 JWKS
python3 << 'PYTHON_SCRIPT'
import base64
import json
import subprocess
import sys
import os

private_key_file = os.environ.get('PRIVATE_KEY_FILE', '.secrets/jwt_private_key.pem')

# 使用 openssl 提取 modulus 和 exponent
try:
    # 获取 modulus (十六进制)
    result = subprocess.run(
        ['openssl', 'rsa', '-in', private_key_file, '-pubout', '-text', '-noout'],
        capture_output=True,
        text=True,
        check=True
    )
    
    output = result.stdout
    lines = output.split('\n')
    
    # 提取 modulus
    modulus_hex = ''
    in_modulus = False
    for line in lines:
        if 'modulus:' in line.lower():
            in_modulus = True
            continue
        if in_modulus:
            if line.strip() == '':
                break
            # 移除冒号和空格
            modulus_hex += line.replace(':', '').replace(' ', '').strip()
    
    # 移除开头的 00（如果有）
    if modulus_hex.startswith('00:'):
        modulus_hex = modulus_hex[3:]
    modulus_hex = modulus_hex.replace(':', '').replace(' ', '')
    
    # 转换为字节
    modulus_bytes = bytes.fromhex(modulus_hex)
    
    # Base64URL 编码
    modulus_b64url = base64.urlsafe_b64encode(modulus_bytes).decode('utf-8').rstrip('=')
    
    # Exponent 通常是 65537 (0x10001)
    exponent_bytes = bytes.fromhex('010001')
    exponent_b64url = base64.urlsafe_b64encode(exponent_bytes).decode('utf-8').rstrip('=')
    
    # 生成 JWKS
    jwks = {
        "keys": [
            {
                "kty": "RSA",
                "use": "sig",
                "kid": "key-1",
                "alg": "RS256",
                "n": modulus_b64url,
                "e": exponent_b64url
            }
        ]
    }
    
    print(json.dumps(jwks, indent=2))
    
except subprocess.CalledProcessError as e:
    print(f"错误: openssl 命令执行失败: {e}", file=sys.stderr)
    sys.exit(1)
except Exception as e:
    print(f"错误: {e}", file=sys.stderr)
    sys.exit(1)
PYTHON_SCRIPT

