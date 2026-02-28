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
        # Session update with client_commit
        await ws.send(json.dumps({
            "event_id": str(uuid.uuid4()),
            "type": "session.update",
            "session": {
                "mode": "client_commit",
                "voice": "Seren",
                "response_format": "pcm",
                "sample_rate": 24000
            }
        }))

        sentences = [
            "第一段：闭上你的双眼，深呼吸，感受空气在你的鼻腔流动。",
            "第二段：现在，想象自己在一片森林中，阳光洒在身上。"
        ]

        for i, text in enumerate(sentences):
            print(f"Sending section {i}: {text}")
            await ws.send(json.dumps({
                "event_id": str(uuid.uuid4()),
                "type": "input_text_buffer.append",
                "text": text
            }))
            
            # Commit the text buffer
            print("Sending client_commit...")
            await ws.send(json.dumps({
                "event_id": str(uuid.uuid4()),
                "type": "input_text_buffer.client_commit"
            }))
            
            # Read until response.done
            while True:
                msg = await ws.recv()
                data = json.loads(msg)
                print("Received event:", data["type"])
                if data["type"] == "response.audio.delta":
                    pass
                elif data["type"] == "response.done":
                    print(f"Done with section {i}")
                    break
                elif data["type"] == "error":
                    print("Error:", data)
                    return
        
        await ws.send(json.dumps({
            "event_id": str(uuid.uuid4()),
            "type": "session.finish"
        }))
        
        while True:
            try:
                msg = await ws.recv()
                data = json.loads(msg)
                print("Final event:", data["type"])
                if data["type"] == "session.finished":
                    break
            except Exception as e:
                break
                
        print("Passed!")

asyncio.run(test_realtime_consistency())
