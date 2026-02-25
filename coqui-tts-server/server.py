"""
Coqui TTS HTTP Server for ZenAI Studio
使用 XTTS v2 多语言模型提供 REST API
"""

import io
import sys
import functools
import torch

# PyTorch 2.6+ 默认 weights_only=True，与 Coqui TTS 不兼容
# Monkey-patch torch.load 使其默认 weights_only=False
_original_torch_load = torch.load
@functools.wraps(_original_torch_load)
def _patched_torch_load(*args, **kwargs):
    if 'weights_only' not in kwargs:
        kwargs['weights_only'] = False
    return _original_torch_load(*args, **kwargs)
torch.load = _patched_torch_load
from flask import Flask, request, send_file, jsonify
from TTS.api import TTS

app = Flask(__name__)
tts = None

def load_model():
    global tts
    print("🐸 加载 XTTS v2 模型中...")
    tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2")
    # 在 Mac 上使用 CPU（MPS 支持有限）
    print("✅ 模型加载完成！")

@app.route("/", methods=["GET"])
def index():
    return jsonify({"status": "ok", "model": "xtts_v2", "languages": ["zh-cn", "en", "ja", "ko", "fr", "de", "es", "pt"]})

@app.route("/api/tts", methods=["GET"])
def synthesize():
    text = request.args.get("text", "")
    language = request.args.get("language_id", "zh-cn")
    speaker_id = request.args.get("speaker_id", "")

    if not text:
        return jsonify({"error": "text parameter is required"}), 400

    try:
        # XTTS v2 合成
        wav = tts.tts(text=text, language=language)

        # 将 numpy array 转为 WAV bytes
        import numpy as np
        import struct

        # 归一化
        wav_np = np.array(wav, dtype=np.float32)
        wav_np = wav_np / max(abs(wav_np.max()), abs(wav_np.min()), 1e-8)

        # 转 int16 PCM
        pcm = (wav_np * 32767).astype(np.int16)

        # 写 WAV 文件
        buf = io.BytesIO()
        sample_rate = 24000  # XTTS v2 默认采样率
        num_samples = len(pcm)
        data_size = num_samples * 2  # int16 = 2 bytes

        # WAV header
        buf.write(b'RIFF')
        buf.write(struct.pack('<I', 36 + data_size))
        buf.write(b'WAVE')
        buf.write(b'fmt ')
        buf.write(struct.pack('<IHHIIHH', 16, 1, 1, sample_rate, sample_rate * 2, 2, 16))
        buf.write(b'data')
        buf.write(struct.pack('<I', data_size))
        buf.write(pcm.tobytes())

        buf.seek(0)
        return send_file(buf, mimetype="audio/wav")

    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    load_model()
    print(f"🐸 Coqui TTS HTTP 服务已启动: http://localhost:5002")
    app.run(host="0.0.0.0", port=5002, debug=False)
