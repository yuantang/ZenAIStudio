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
            rewrite: (path) => {
              let newPath = path.replace(/^\/ws\/dashscope/, '/api-ws/v1/realtime');
              // 关键修复：清理 URL 中的 api_key 以免引发阿里云网关的双重鉴权报错 (Invalid frame header)
              newPath = newPath.replace(/[?&]api_key=[^&]*/, '');
              // 如果只剩下一个问号，也清理掉
              if (newPath.endsWith('?')) newPath = newPath.slice(0, -1);
              return newPath;
            },
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
