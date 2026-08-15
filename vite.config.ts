import { defineConfig, loadEnv, type ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'
import { normalizeDevProxyConfig } from './src/lib/devProxy'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

function loadDevProxyConfig() {
  try {
    return normalizeDevProxyConfig(
      JSON.parse(readFileSync('./dev-proxy.config.json', 'utf-8')) as unknown,
    )
  } catch (error) {
    const err = error as NodeJS.ErrnoException
    if (err.code === 'ENOENT') return null
    throw error
  }
}

function createDeepSeekProxy(apiKey: string): ProxyOptions {
  return {
    target: 'https://api.deepseek.com',
    changeOrigin: true,
    secure: true,
    rewrite: (path) => path.replace(/^\/deepseek-proxy/, '/v1'),
    configure(proxy) {
      proxy.on('proxyReq', (proxyReq) => {
        const existing = proxyReq.getHeader('authorization')
        const hasAuth = typeof existing === 'string' && existing.trim() && !/^Bearer\s*$/i.test(existing)
        if (!hasAuth && apiKey) {
          proxyReq.setHeader('Authorization', `Bearer ${apiKey}`)
        }
      })
    },
  }
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const deepseekApiKey = (env.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY || '').trim()
  const devProxyConfig = command === 'serve' ? loadDevProxyConfig() : null
  const proxy: Record<string, ProxyOptions> = {
    '/deepseek-proxy': createDeepSeekProxy(deepseekApiKey),
  }

  if (devProxyConfig?.enabled) {
    proxy[devProxyConfig.prefix] = {
      target: devProxyConfig.target,
      changeOrigin: devProxyConfig.changeOrigin,
      secure: devProxyConfig.secure,
      rewrite: (path) =>
        path.replace(
          new RegExp(`^${devProxyConfig.prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
          '',
        ),
    }
  }

  return {
    plugins: [react()],
    base: './',
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      __DEV_PROXY_CONFIG__: JSON.stringify(devProxyConfig),
    },
    server: {
      host: true,
      proxy,
    },
    preview: {
      host: true,
      proxy,
    },
  }
})
