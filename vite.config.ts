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
          // WebSocket 代理：浏览器无法设置 Authorization Header，由代理自动注入
          '/ws/dashscope': {
            target: 'wss://dashscope.aliyuncs.com',
            ws: true,
            changeOrigin: true,
            // /ws/dashscope?model=xxx → /api-ws/v1/realtime?model=xxx（查询参数自动透传）
            rewrite: (path) => path.replace(/^\/ws\/dashscope/, '/api-ws/v1/realtime'),
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
