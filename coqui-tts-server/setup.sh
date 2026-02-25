#!/bin/bash
# ============================================================
# Coqui TTS 一键安装脚本
# 安装 🐸TTS 并下载中文多语言模型 (XTTS v2)
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VENV_DIR="$SCRIPT_DIR/.venv"

echo "🐸 Coqui TTS 安装脚本"
echo "========================================"

# 1. 检查 Python 版本
echo ""
echo "📦 [1/3] 检查 Python 环境..."
if ! command -v python3 &> /dev/null; then
    echo "❌ 未找到 python3，请先安装 Python 3.9+"
    exit 1
fi

PYTHON_VERSION=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
PYTHON_MAJOR=$(python3 -c "import sys; print(sys.version_info.major)")
PYTHON_MINOR=$(python3 -c "import sys; print(sys.version_info.minor)")
echo "   Python 版本: $PYTHON_VERSION"

if [ "$PYTHON_MAJOR" -lt 3 ] || { [ "$PYTHON_MAJOR" -eq 3 ] && [ "$PYTHON_MINOR" -lt 9 ]; }; then
    echo "❌ Coqui TTS 需要 Python >= 3.9，当前版本 $PYTHON_VERSION"
    echo "   请安装 Python 3.9+ 后重试: brew install python@3.11"
    exit 1
fi

# 2. 创建虚拟环境 + 安装 TTS
echo ""
echo "🐍 [2/3] 创建虚拟环境并安装 Coqui TTS..."
if [ -d "$VENV_DIR" ]; then
    echo "   虚拟环境已存在，跳过创建"
else
    python3 -m venv "$VENV_DIR"
fi
source "$VENV_DIR/bin/activate"

pip install --upgrade pip
pip install TTS

# 3. 预下载中文多语言模型
echo ""
echo "🌐 [3/3] 预下载 XTTS v2 多语言模型（支持中文）..."
python3 -c "
from TTS.api import TTS
print('正在下载 XTTS v2 模型，首次约需 1.8GB...')
tts = TTS('tts_models/multilingual/multi-dataset/xtts_v2')
print('✅ 模型下载完成！')
"

echo ""
echo "============================================"
echo "✅ Coqui TTS 安装完成！"
echo ""
echo "使用方法："
echo "  bash $SCRIPT_DIR/start.sh"
echo ""
echo "支持的功能："
echo "  - XTTS v2 多语言（含中文）"
echo "  - HTTP API: http://localhost:5002"
echo "  - 1100+ 语言 (Fairseq VITS)"
echo "============================================"
