#!/bin/bash
# ============================================================
# 启动 VibeVoice-Realtime WebSocket 推理服务
# 默认监听 ws://localhost:8765
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VENV_DIR="$SCRIPT_DIR/.venv"
REPO_DIR="$SCRIPT_DIR/VibeVoice"

# 激活虚拟环境
if [ ! -d "$VENV_DIR" ]; then
    echo "❌ 虚拟环境未找到，请先运行 setup.sh"
    exit 1
fi
source "$VENV_DIR/bin/activate"

cd "$REPO_DIR"

echo "🎙️  启动 VibeVoice-Realtime WebSocket 推理服务..."
echo "   模型: microsoft/VibeVoice-Realtime-0.5B"
echo "   端口: ws://localhost:8765"
echo "   首次启动会自动下载模型权重 (~1GB)"
echo ""

python demo/vibevoice_realtime_demo.py \
    --model_path microsoft/VibeVoice-Realtime-0.5B \
    "$@"
