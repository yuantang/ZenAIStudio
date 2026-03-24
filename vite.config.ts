import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { WebSocketServer, WebSocket } from 'ws';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: {
          '/api/dashscope': {
            target: 'https://dashscope.aliyuncs.com',
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/api\/dashscope/, '')
          }
        }
      },
      plugins: [
        react(),
        // 自定义 WebSocket 中转插件：解决浏览器 WS 无法设置 Authorization Header 的限制
        {
          name: 'dashscope-ws-bridge',
          configureServer(server) {
            const wss = new WebSocketServer({ noServer: true });

            server.httpServer?.on('upgrade', (req, socket, head) => {
              const url = new URL(req.url || '', 'http://localhost');
              if (!url.pathname.startsWith('/ws/dashscope')) return;

              wss.handleUpgrade(req, socket, head, (clientWs) => {
                const model = url.searchParams.get('model') || '';
                const apiKey = url.searchParams.get('api_key') || env.VITE_DASHSCOPE_API_KEY;

                if (!apiKey) {
                  clientWs.close(4001, 'Missing API key');
                  return;
                }

                // 建立到 DashScope 的上游连接（使用 Header 鉴权）
                const upstreamUrl = `wss://dashscope.aliyuncs.com/api-ws/v1/realtime?model=${model}`;
                const upstream = new WebSocket(upstreamUrl, {
                  headers: { 'Authorization': `Bearer ${apiKey}` }
                });

                // 消息缓冲队列：在上游 OPEN 之前暂存客户端消息
                const pendingMessages: any[] = [];
                let upstreamReady = false;

                upstream.on('open', () => {
                  console.log(`[WS Bridge] ✅ 已桥接到 DashScope (model=${model})`);
                  upstreamReady = true;
                  // flush 缓冲区
                  for (const msg of pendingMessages) {
                    upstream.send(msg);
                  }
                  pendingMessages.length = 0;
                });

                // 双向桥接：客户端 → DashScope（带缓冲）
                clientWs.on('message', (data) => {
                  if (upstreamReady && upstream.readyState === WebSocket.OPEN) {
                    upstream.send(data);
                  } else {
                    pendingMessages.push(data);
                  }
                });

                // DashScope → 客户端
                upstream.on('message', (data) => {
                  if (clientWs.readyState === WebSocket.OPEN) {
                    clientWs.send(data);
                  }
                });

                // 错误与关闭处理
                upstream.on('error', (err) => {
                  console.error(`[WS Bridge] 上游错误:`, err.message);
                  if (clientWs.readyState === WebSocket.OPEN) clientWs.close(4002, 'Upstream error');
                });

                clientWs.on('error', (err) => {
                  console.error(`[WS Bridge] 客户端错误:`, err.message);
                  if (upstream.readyState === WebSocket.OPEN) upstream.close();
                });

                upstream.on('close', () => {
                  if (clientWs.readyState === WebSocket.OPEN) clientWs.close();
                });

                clientWs.on('close', () => {
                  if (upstream.readyState === WebSocket.OPEN) upstream.close();
                });
              });
            });
          }
        }
      ],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
