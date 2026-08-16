import { describe, expect, it } from 'vitest'
import { buildApiUrl } from './devProxy'

describe('buildApiUrl', () => {
  it('uses the same-origin proxy prefix when API proxy is enabled', () => {
    expect(buildApiUrl('http://api.example.com/v1', 'images/edits', null, true)).toBe(
      '/api-proxy/images/edits',
    )
  })

  it('leaves API versioning to the proxy target when proxying', () => {
    expect(buildApiUrl('http://api.example.com', 'images/generations', null, true)).toBe(
      '/api-proxy/images/generations',
    )
  })

  it('uses a configured proxy prefix when one is available', () => {
    expect(
      buildApiUrl(
        'http://api.example.com/v1',
        'responses',
        {
          enabled: true,
          prefix: '/openai-proxy',
          target: 'http://api.example.com/v1',
          changeOrigin: true,
          secure: false,
        },
        true,
      ),
    ).toBe('/openai-proxy/responses')
  })

  it('uses the configured API URL directly when API proxy is disabled', () => {
    expect(buildApiUrl('http://api.example.com/v1', 'responses', null, false)).toBe(
      'http://api.example.com/v1/responses',
    )
  })

  it('only routes DeepSeek official endpoints through the local reverse proxy when dev config exists', () => {
    expect(buildApiUrl('https://api.deepseek.com', 'chat/completions', null, false)).toBe(
      'https://api.deepseek.com/v1/chat/completions',
    )
    expect(buildApiUrl('https://api.deepseek.com/v1', 'chat/completions', {
      enabled: true,
      prefix: '/api-proxy',
      target: 'http://api.example.com/v1',
      changeOrigin: true,
      secure: false,
    }, false)).toBe('/deepseek-proxy/chat/completions')
  })

  it('keeps a self-hosted DeepSeek-compatible reverse proxy URL direct in static deployments', () => {
    expect(buildApiUrl('https://proxy.example.com/deepseek/v1', 'chat/completions', null, false)).toBe(
      'https://proxy.example.com/deepseek/v1/chat/completions',
    )
  })
})
