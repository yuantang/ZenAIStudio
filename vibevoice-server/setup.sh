#!/bin/bash
# ============================================================
# VibeVoice-Realtime 0.5B 一键安装脚本
# 适用于 macOS (Apple Silicon) 和 Linux (NVIDIA GPU)
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VENV_DIR="$SCRIPT_DIR/.venv"
REPO_DIR="$SCRIPT_DIR/VibeVoice"

echo "🎙️  VibeVoice-Realtime 0.5B 安装脚本"
echo "========================================"

# 1. 检查 Python 版本
echo ""
echo "📦 [1/5] 检查 Python 环境..."
if ! command -v python3 &> /dev/null; then
    echo "❌ 未找到 python3，请先安装 Python 3.10+"
    exit 1
fi

PYTHON_VERSION=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
echo "   Python 版本: $PYTHON_VERSION"

# 2. 克隆 VibeVoice 仓库
echo ""
echo "📥 [2/5] 克隆 VibeVoice 仓库..."
if [ -d "$REPO_DIR" ]; then
    echo "   仓库已存在，跳过克隆。如需重新安装请删除 $REPO_DIR"
else
    git clone https://github.com/microsoft/VibeVoice.git "$REPO_DIR"
fi

# 3. 创建虚拟环境
echo ""
echo "🐍 [3/5] 创建 Python 虚拟环境..."
if [ -d "$VENV_DIR" ]; then
    echo "   虚拟环境已存在，跳过创建"
else
    python3 -m venv "$VENV_DIR"
fi
source "$VENV_DIR/bin/activate"

# 4. 安装依赖
echo ""
echo "📦 [4/5] 安装 VibeVoice 依赖 (streamingtts)..."
cd "$REPO_DIR"
pip install --upgrade pip
pip install -e ".[streamingtts]"

# 5. 下载实验性多语言语音包（含中文）
echo ""
echo "🌐 [5/5] 下载实验性多语言语音包..."
if [ -f "demo/download_experimental_voices.sh" ]; then
    bash demo/download_experimental_voices.sh
else
    echo "   ⚠️  未找到多语言语音下载脚本，跳过"
fi

echo ""
echo "============================================"
echo "✅ VibeVoice-Realtime 0.5B 安装完成！"
echo ""
echo "使用方法："
echo "  bash $SCRIPT_DIR/start.sh"
echo ""
echo "模型将在首次启动时自动从 HuggingFace 下载 (~1GB)"
echo "============================================"
