#!/bin/bash
# ============================================================
# 启动 Coqui TTS HTTP 服务
# 默认监听 http://localhost:5002
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VENV_DIR="$SCRIPT_DIR/.venv"

if [ ! -d "$VENV_DIR" ]; then
    echo "❌ 虚拟环境未找到，请先运行 setup.sh"
    exit 1
fi
source "$VENV_DIR/bin/activate"

echo "🐸 启动 Coqui TTS HTTP 服务..."
echo "   模型: XTTS v2 (多语言，含中文)"
echo "   地址: http://localhost:5002"
echo ""

# 使用 XTTS v2 多语言模型启动 HTTP 服务
tts-server \
    --model_name tts_models/multilingual/multi-dataset/xtts_v2 \
    --port 5002 \
    "$@"
