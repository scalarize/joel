#!/bin/bash
# 从 RSA 私钥生成 JWKS 格式的公钥
# 用法: ./scripts/generate-jwks-from-key.sh [私钥文件路径]

PRIVATE_KEY_FILE="${1:-.secrets/jwt_private_key.pem}"

if [ ! -f "$PRIVATE_KEY_FILE" ]; then
    echo "错误: 私钥文件不存在: $PRIVATE_KEY_FILE" >&2
    exit 1
fi

echo "从私钥生成 JWKS..." >&2
echo "私钥文件: $PRIVATE_KEY_FILE" >&2

# 提取 modulus (移除开头的 00:)
MODULUS_HEX=$(openssl rsa -in "$PRIVATE_KEY_FILE" -pubout -text -noout 2>/dev/null | \
    grep -A 20 "Modulus:" | \
    grep -v "Modulus:" | \
    tr -d ':\n ' | \
    sed 's/^00//')

if [ -z "$MODULUS_HEX" ]; then
    echo "错误: 无法提取 modulus" >&2
    exit 1
fi

# 转换为 base64url
MODULUS_B64URL=$(echo -n "$MODULUS_HEX" | xxd -r -p | base64 | tr -d '=' | tr '+/' '-_')

# Exponent 固定为 65537 (0x10001)
EXPONENT_B64URL="AQAB"

# 生成 JWKS
cat << EOF
{
  "keys": [
    {
      "kty": "RSA",
      "use": "sig",
      "kid": "key-1",
      "alg": "RS256",
      "n": "$MODULUS_B64URL",
      "e": "$EXPONENT_B64URL"
    }
  ]
}
EOF

