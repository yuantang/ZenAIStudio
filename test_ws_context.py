import asyncio
import websockets
import json
import uuid
import base64
import os

API_KEY = os.environ.get("VITE_DASHSCOPE_API_KEY")

async def test_realtime_consistency():
    if not API_KEY:
        print("Set VITE_DASHSCOPE_API_KEY")
        return

    url = f"wss://dashscope.aliyuncs.com/api-ws/v1/realtime?model=qwen3-tts-instruct-flash-realtime&api_key={API_KEY}"
    
    async with websockets.connect(url) as ws:
        # Session update
        await ws.send(json.dumps({
            "event_id": str(uuid.uuid4()),
            "type": "session.update",
            "session": {
                "mode": "server_commit",
                "voice": "Seren",
                "response_format": "pcm",
                "sample_rate": 24000,
                "instructions": "语速稍慢且节奏平稳，音调柔和自然，语气温暖亲切如好友倾诉，吐字清晰舒展，整体风格宁静治愈，适合冥想引导。"
            }
        }))

        sentences = [
            "闭上你的双眼，深呼吸。",
            "感受空气在你的鼻腔流动。",
            "现在，想象自己在一片森林中。"
        ]

        audio_chunks = []
        for i, text in enumerate(sentences):
            print(f"Sending: {text}")
            await ws.send(json.dumps({
                "event_id": str(uuid.uuid4()),
                "type": "input_text_buffer.append",
                "text": text
            }))
            
            # Read until response.done
            while True:
                msg = await ws.recv()
                data = json.loads(msg)
                if data["type"] == "response.audio.delta":
                    pass # ignore audio saving for test
                elif data["type"] == "response.done":
                    print(f"Done with sentence {i}")
                    break
        
        await ws.send(json.dumps({
            "event_id": str(uuid.uuid4()),
            "type": "session.finish"
        }))
        print("Passed!")

asyncio.run(test_realtime_consistency())
