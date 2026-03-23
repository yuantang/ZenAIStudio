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
          // WebSocket 代理：解决浏览器无法发送 Authorization Header 导致的 1006 握手失败
          '/ws/dashscope': {
            target: 'wss://dashscope.aliyuncs.com/api-ws/v1/realtime',
            ws: true,
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/ws\/dashscope/, ''),
            headers: {
              'Authorization': `Bearer ${env.VITE_DASHSCOPE_API_KEY}`
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
