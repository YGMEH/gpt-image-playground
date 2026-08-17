import { describe, expect, it, vi } from 'vitest'
import {
  buildCorsHeaders,
  buildUpstreamUrl,
  handleApiProxyRequest,
  matchProxyPath,
  normalizeUpstreamBaseUrl,
  parseAllowedOrigins,
  resolveAllowedOrigin,
} from './apiProxyWorker'

const PAGES_ORIGIN = 'https://ygmeh.github.io'

describe('normalizeUpstreamBaseUrl', () => {
  it('keeps the version prefix and drops trailing slashes', () => {
    expect(normalizeUpstreamBaseUrl('https://ai.example.com/v1/')).toBe('https://ai.example.com/v1')
  })

  it('adds https when the scheme is missing', () => {
    expect(normalizeUpstreamBaseUrl('ai.example.com/v1')).toBe('https://ai.example.com/v1')
  })

  it('rejects empty and non-http schemes', () => {
    expect(normalizeUpstreamBaseUrl(undefined)).toBe('')
    expect(normalizeUpstreamBaseUrl('  ')).toBe('')
    expect(normalizeUpstreamBaseUrl('ftp://ai.example.com/v1')).toBe('')
  })
})

describe('matchProxyPath', () => {
  it('strips the same-origin proxy prefix', () => {
    expect(matchProxyPath('/api-proxy/models')).toBe('models')
    expect(matchProxyPath('/api-proxy/chat/completions')).toBe('chat/completions')
  })

  it('also accepts a bare /v1 base url so profiles can point straight at the proxy', () => {
    expect(matchProxyPath('/v1/models')).toBe('models')
  })

  it('returns null for static asset requests', () => {
    expect(matchProxyPath('/index.html')).toBeNull()
    expect(matchProxyPath('/assets/index-abc.js')).toBeNull()
  })
})

describe('buildUpstreamUrl', () => {
  it('joins the endpoint path onto the configured upstream', () => {
    expect(buildUpstreamUrl('https://ai.example.com/v1', 'models')).toBe('https://ai.example.com/v1/models')
    expect(buildUpstreamUrl('https://ai.example.com/v1', 'chat/completions')).toBe(
      'https://ai.example.com/v1/chat/completions',
    )
  })

  it('keeps the query string', () => {
    expect(buildUpstreamUrl('https://ai.example.com/v1', 'models', '?limit=10')).toBe(
      'https://ai.example.com/v1/models?limit=10',
    )
  })

  it('refuses path traversal that would escape the upstream base path', () => {
    expect(buildUpstreamUrl('https://ai.example.com/v1', '../admin/keys')).toBeNull()
    expect(buildUpstreamUrl('https://ai.example.com/v1', '')).toBeNull()
  })

  it('refuses an unconfigured upstream', () => {
    expect(buildUpstreamUrl('', 'models')).toBeNull()
  })
})

describe('CORS allow list', () => {
  it('parses comma and space separated origins', () => {
    expect(parseAllowedOrigins('https://a.example.com, https://b.example.com')).toEqual([
      'https://a.example.com',
      'https://b.example.com',
    ])
  })

  it('only echoes an allowed origin', () => {
    const allowed = parseAllowedOrigins(PAGES_ORIGIN)
    expect(resolveAllowedOrigin(PAGES_ORIGIN, allowed)).toBe(PAGES_ORIGIN)
    expect(resolveAllowedOrigin('https://evil.example.com', allowed)).toBeNull()
  })

  it('emits no CORS headers when nothing is allowed', () => {
    expect(buildCorsHeaders(PAGES_ORIGIN, [])).toEqual({})
  })

  it('mirrors the requested headers for the preflight', () => {
    const headers = buildCorsHeaders(PAGES_ORIGIN, [PAGES_ORIGIN], 'authorization, content-type')
    expect(headers['Access-Control-Allow-Origin']).toBe(PAGES_ORIGIN)
    expect(headers['Access-Control-Allow-Headers']).toBe('authorization, content-type')
    expect(headers['Access-Control-Allow-Methods']).toContain('POST')
  })
})

describe('handleApiProxyRequest', () => {
  const env = {
    UPSTREAM_BASE_URL: 'https://ai.example.com/v1',
    ALLOWED_ORIGINS: PAGES_ORIGIN,
  }

  it('passes non-proxy requests through to static assets', async () => {
    const fetchImpl = vi.fn()
    const result = await handleApiProxyRequest(
      new Request('https://proxy.example.workers.dev/index.html'),
      env,
      fetchImpl as unknown as typeof fetch,
    )
    expect(result).toBeNull()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('answers the preflight that the upstream blocks', async () => {
    const response = await handleApiProxyRequest(
      new Request('https://proxy.example.workers.dev/v1/models', {
        method: 'OPTIONS',
        headers: { Origin: PAGES_ORIGIN, 'Access-Control-Request-Headers': 'authorization' },
      }),
      env,
      vi.fn() as unknown as typeof fetch,
    )
    expect(response?.status).toBe(204)
    expect(response?.headers.get('Access-Control-Allow-Origin')).toBe(PAGES_ORIGIN)
  })

  it('forwards the models request and adds CORS headers to the response', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ data: [{ id: 'gpt-4o' }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': 'https://other.example.com' },
    }))
    const response = await handleApiProxyRequest(
      new Request('https://proxy.example.workers.dev/v1/models', {
        headers: { Origin: PAGES_ORIGIN, Authorization: 'Bearer test-key' },
      }),
      env,
      fetchImpl as unknown as typeof fetch,
    )
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://ai.example.com/v1/models')
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer test-key')
    expect(response?.status).toBe(200)
    // 上游自己的 CORS 头会被代理覆盖，避免出现两个不一致的 allow-origin。
    expect(response?.headers.get('Access-Control-Allow-Origin')).toBe(PAGES_ORIGIN)
    expect(await response?.json()).toEqual({ data: [{ id: 'gpt-4o' }] })
  })

  it('forwards chat completions with the request body', async () => {
    const fetchImpl = vi.fn(async () => new Response('ok', { status: 200 }))
    const response = await handleApiProxyRequest(
      new Request('https://proxy.example.workers.dev/api-proxy/chat/completions', {
        method: 'POST',
        headers: { Origin: PAGES_ORIGIN, 'Content-Type': 'application/json', Authorization: 'Bearer test-key' },
        body: JSON.stringify({ model: 'gpt-4o', messages: [] }),
      }),
      env,
      fetchImpl as unknown as typeof fetch,
    )
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://ai.example.com/v1/chat/completions')
    expect(init.method).toBe('POST')
    expect(new Headers(init.headers).get('content-type')).toBe('application/json')
    expect(response?.status).toBe(200)
  })

  it('injects a deployment-side key when the browser sends none', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }))
    await handleApiProxyRequest(
      new Request('https://proxy.example.workers.dev/v1/models', { headers: { Origin: PAGES_ORIGIN } }),
      { ...env, UPSTREAM_API_KEY: 'server-side-key' },
      fetchImpl as unknown as typeof fetch,
    )
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer server-side-key')
  })

  it('does not forward cookies or unrelated headers', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }))
    await handleApiProxyRequest(
      new Request('https://proxy.example.workers.dev/v1/models', {
        headers: { Origin: PAGES_ORIGIN, Cookie: 'session=secret', 'X-Custom-Trace': 'abc' },
      }),
      env,
      fetchImpl as unknown as typeof fetch,
    )
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    const headers = new Headers(init.headers)
    expect(headers.get('cookie')).toBeNull()
    expect(headers.get('x-custom-trace')).toBeNull()
  })

  it('rejects origins outside the allow list', async () => {
    const fetchImpl = vi.fn()
    const response = await handleApiProxyRequest(
      new Request('https://proxy.example.workers.dev/v1/models', {
        headers: { Origin: 'https://evil.example.com' },
      }),
      env,
      fetchImpl as unknown as typeof fetch,
    )
    expect(response?.status).toBe(403)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects methods that the proxy does not need', async () => {
    const response = await handleApiProxyRequest(
      new Request('https://proxy.example.workers.dev/v1/models', {
        method: 'DELETE',
        headers: { Origin: PAGES_ORIGIN },
      }),
      env,
      vi.fn() as unknown as typeof fetch,
    )
    expect(response?.status).toBe(405)
  })

  it('explains a missing upstream configuration', async () => {
    const response = await handleApiProxyRequest(
      new Request('https://proxy.example.workers.dev/v1/models', { headers: { Origin: PAGES_ORIGIN } }),
      { ALLOWED_ORIGINS: PAGES_ORIGIN },
      vi.fn() as unknown as typeof fetch,
    )
    expect(response?.status).toBe(503)
    await expect(response?.text()).resolves.toContain('UPSTREAM_BASE_URL')
  })

  it('reports upstream network failures as 502 instead of throwing', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('connect ETIMEDOUT')
    })
    const response = await handleApiProxyRequest(
      new Request('https://proxy.example.workers.dev/v1/models', { headers: { Origin: PAGES_ORIGIN } }),
      env,
      fetchImpl as unknown as typeof fetch,
    )
    expect(response?.status).toBe(502)
    await expect(response?.text()).resolves.toContain('connect ETIMEDOUT')
  })
})