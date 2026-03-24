import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

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
          },
          // WebSocket 代理：支持从 querystring 或 env 动态注入 Authorization
          '/ws/dashscope': {
            target: 'wss://dashscope.aliyuncs.com',
            ws: true,
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/ws\/dashscope/, '/api-ws/v1/realtime'),
            configure: (proxy) => {
              proxy.on('proxyReqWs', (proxyReq, req) => {
                try {
                  const url = new URL(req.url || '', 'http://localhost');
                  const apiKey = url.searchParams.get('api_key') || env.VITE_DASHSCOPE_API_KEY;
                  if (apiKey) {
                    proxyReq.setHeader('Authorization', `Bearer ${apiKey}`);
                  }
                } catch (err) {
                  console.error('Ws proxy header error:', err);
                }
              });
            }
          }
        }
      },
      plugins: [react()],
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
