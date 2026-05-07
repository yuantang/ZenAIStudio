#!/usr/bin/env node
/**
 * DashScope WebSocket 透明代理 (独立进程，端口 3001)
 * 
 * 解决的核问题：
 *   - 浏览器 WebSocket API 无法设置 Authorization Header
 *   - DashScope /realtime 端点强制要求 Header 鉴权（URL api_key 返回 401）
 * 
 * 解决方案：
 *   独立进程（与 Vite 完全隔离），监听 ws://localhost:3001/ws/dashscope
 *   接收浏览器消息，以 Authorization Header 的方式转发到 DashScope
 */

import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { config } from 'dotenv';

config(); // 加载 .env 文件

const PORT = 3001;
const DASHSCOPE_WS_URL = 'wss://dashscope.aliyuncs.com/api-ws/v1/realtime';
const ENV_API_KEY = process.env.VITE_DASHSCOPE_API_KEY || '';

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('DashScope WS Proxy is running\n');
});

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);
  
  if (!url.pathname.startsWith('/ws/dashscope')) {
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (clientWs) => {
    const model = url.searchParams.get('model') || 'qwen3-tts-instruct-flash-realtime';
    const apiKey = url.searchParams.get('api_key') || ENV_API_KEY;

    if (!apiKey) {
      console.error('[WS Proxy] ❌ 缺少 API Key');
      clientWs.close(4001, 'Missing API key');
      return;
    }

    const upstreamUrl = `${DASHSCOPE_WS_URL}?model=${model}`;
    console.log(`[WS Proxy] 正在连接 DashScope... model=${model}`);

    const upstream = new WebSocket(upstreamUrl, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
      perMessageDeflate: false,  // 禁用压缩，避免帧格式协商问题
      maxPayload: 0              // 禁用最大帧大小限制（防止 ws@8.x 无法解析 DashScope 超长 CLOSE 帧）
    });

    // 缓冲：在上游 OPEN 前暂存客户端消息
    const pending = [];
    let isOpen = false;

    upstream.on('open', () => {
      isOpen = true;
      console.log(`[WS Proxy] ✅ 已连接到 DashScope (${model})`);
      while (pending.length > 0) {
        const { data, isBinary } = pending.shift();
        upstream.send(data, { binary: isBinary, fin: true });
      }
    });

    // 客户端 → 上游
    clientWs.on('message', (data, isBinary) => {
      if (isOpen && upstream.readyState === WebSocket.OPEN) {
        upstream.send(data, { binary: isBinary, fin: true });
      } else {
        pending.push({ data, isBinary });
      }
    });

    // 上游 → 客户端
    upstream.on('message', (data, isBinary) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(data, { binary: isBinary, fin: true });
      }
    });

    // 错误处理
    upstream.on('error', (err) => {
      console.error('[WS Proxy] 上游错误:', err.message);
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.close(4002, 'Upstream error: ' + err.message);
      }
    });

    clientWs.on('error', (err) => {
      console.error('[WS Proxy] 客户端错误:', err.message);
    });

    // 关闭处理
    upstream.on('close', (code, reason) => {
      console.log(`[WS Proxy] 上游关闭 code=${code}`);
      if (clientWs.readyState === WebSocket.OPEN) clientWs.close(code);
    });

    clientWs.on('close', () => {
      if (upstream.readyState !== WebSocket.CLOSED) upstream.terminate();
    });
  });
});

server.listen(PORT, () => {
  console.log(`[WS Proxy] 🚀 DashScope WebSocket 代理已启动: ws://localhost:${PORT}/ws/dashscope`);
  console.log(`[WS Proxy] API Key: ${ENV_API_KEY ? '已从 .env 加载' : '⚠️  未设置（需通过 URL 参数传入）'}`);
});
