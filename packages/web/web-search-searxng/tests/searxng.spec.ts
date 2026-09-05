import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import WebRuntime from '@deepseek-ai/dsh-web'
import {
  SearxngSearchProvider,
  SEARXNG_PROVIDER_ID,
} from '@deepseek-ai/dsh-web-search-searxng'
import * as searxngPlugin from '@deepseek-ai/dsh-web-search-searxng'
import { buildSearchUrl, mapSearxngResponse, mapSearxngResult } from '../src/provider.ts'
import type { SearxngResponse } from '@deepseek-ai/dsh-web-search-searxng/src/types.ts'

/** Construct the provider over a fixed options value; production passes a live thunk. */
import type { SearxngSearchProviderOptions } from '@deepseek-ai/dsh-web-search-searxng'

const searchProvider = (options: SearxngSearchProviderOptions): SearxngSearchProvider =>
  new SearxngSearchProvider(() => options)

const options: SearxngSearchProviderOptions = {
  baseURL: 'http://searxng.test:10000',
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init })
}

/** A response with a full result, a URL-less result, and a duplicate URL. */
function searchResponse(): SearxngResponse {
  return {
    query: 'hello',
    results: [
      { url: 'https://a.test', title: 'A', content: 'excerpt for A', publishedDate: '2026-02-02T00:00:00', engine: 'duckduckgo', category: 'general', score: 1 },
      { url: 'https://b.test', title: 'B' },
      { title: 'no url' },
      { url: 'https://a.test', title: 'A duplicate' },
    ],
    answers: ['an answer'],
    suggestions: ['hello world'],
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('mapSearxngResult', () => {
  it('maps url, title, content to snippet, and publishedDate to publishedAt', () => {
    expect(mapSearxngResult({ url: 'https://a.test', title: 'A', content: 'excerpt', publishedDate: '2026-02-02T00:00:00' }))
      .toEqual({ url: 'https://a.test', title: 'A', snippet: 'excerpt', publishedAt: '2026-02-02T00:00:00' })
  })

  it('returns undefined for a missing or empty url', () => {
    expect(mapSearxngResult({ title: 'no url' })).toBeUndefined()
    expect(mapSearxngResult({ url: '' })).toBeUndefined()
    expect(mapSearxngResult({ url: null })).toBeUndefined()
  })

  it('omits optional fields when absent, null, or empty', () => {
    expect(mapSearxngResult({ url: 'https://a.test', title: '', content: null, publishedDate: null }))
      .toEqual({ url: 'https://a.test' })
  })
})

describe('mapSearxngResponse', () => {
  it('maps results, drops URL-less entries, and dedupes by url (first wins)', () => {
    expect(mapSearxngResponse(searchResponse())).toEqual({
      sources: [
        { url: 'https://a.test', title: 'A', snippet: 'excerpt for A', publishedAt: '2026-02-02T00:00:00' },
        { url: 'https://b.test', title: 'B' },
      ],
      truncated: false,
    })
  })

  it('tolerates an absent results array', () => {
    expect(mapSearxngResponse({})).toEqual({ sources: [], truncated: false })
  })
})

describe('buildSearchUrl', () => {
  it('sends q and format=json', () => {
    expect(buildSearchUrl(options, 'hello world')).toBe('http://searxng.test:10000/search?q=hello+world&format=json')
  })

  it('appends language and categories when set', () => {
    expect(buildSearchUrl({ ...options, language: 'ru', categories: 'news' }, 'q')).toBe(
      'http://searxng.test:10000/search?q=q&format=json&language=ru&categories=news',
    )
  })

  it('omits empty language and categories', () => {
    expect(buildSearchUrl({ ...options, language: '', categories: '' }, 'q')).toBe(
      'http://searxng.test:10000/search?q=q&format=json',
    )
  })
})

describe('SearxngSearchProvider availability', () => {
  it('is available with a parseable base URL', () => {
    expect(searchProvider(options).available()).toBe(true)
  })

  it('is unavailable when the base URL is unparseable', () => {
    expect(searchProvider({ baseURL: 'not a url' }).available()).toBe(false)
  })
})

describe('SearxngSearchProvider request dispatch', () => {
  it('GETs the json endpoint with the attribution headers and no credentials', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(searchResponse()))
    vi.stubGlobal('fetch', fetchMock)
    await searchProvider(options).search({ query: 'hello' })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://searxng.test:10000/search?q=hello&format=json')
    expect(init).toMatchObject({ method: 'GET', redirect: 'error' })
    const headers = init.headers as Record<string, string>
    expect(headers['accept']).toBe('application/json')
    expect(headers['user-agent']).toBe('deepseek-harness/0.0.1')
    expect(headers['authorization']).toBeUndefined()
  })

  it('sends the api token as a Bearer header when set', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(searchResponse()))
    vi.stubGlobal('fetch', fetchMock)
    await searchProvider({ ...options, apiToken: 'sx-token' }).search({ query: 'hello' })
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const headers = init.headers as Record<string, string>
    expect(headers['authorization']).toBe('Bearer sx-token')
  })

  it('forwards the abort signal', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(searchResponse()))
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()
    await searchProvider(options).search({ query: 'hello' }, controller.signal)
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(init).toMatchObject({ signal: controller.signal })
  })

  it('throws WEB_ABORTED when the caller already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(searchProvider(options).search({ query: 'hello' }, controller.signal))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_ABORTED' }))
  })

  it('throws WEB_ABORTED on a fetch abort', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new DOMException('aborted', 'AbortError'))))
    await expect(searchProvider(options).search({ query: 'hello' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_ABORTED' }))
  })

  it('throws WEB_PROVIDER_ERROR with the endpoint hint when the instance is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('fetch failed'))))
    await expect(searchProvider(options).search({ query: 'hello' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_ERROR' }))
    await expect(searchProvider(options).search({ query: 'hello' }))
      .rejects.toThrow(/is the instance running at http:\/\/searxng\.test:10000\?/)
  })

  it('throws WEB_PROVIDER_ERROR for a 403 with the formats hint', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('forbidden', { status: 403 })))
    await expect(searchProvider(options).search({ query: 'hello' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_ERROR' }))
    await expect(searchProvider(options).search({ query: 'hello' }))
      .rejects.toThrow(/search\.formats/)
  })

  it('throws WEB_PROVIDER_ERROR for a non-JSON success body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>nope</html>', { status: 200, headers: { 'content-type': 'text/html' } })))
    await expect(searchProvider(options).search({ query: 'hello' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_ERROR' }))
  })

  it('maps the response to normalized sources', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(searchResponse())))
    await expect(searchProvider(options).search({ query: 'hello' }))
      .resolves.toEqual({
        sources: [
          { url: 'https://a.test', title: 'A', snippet: 'excerpt for A', publishedAt: '2026-02-02T00:00:00' },
          { url: 'https://b.test', title: 'B' },
        ],
        truncated: false,
      })
  })
})

describe('web-search-searxng plugin registration', () => {
  it('registers the provider into ctx.web (HMR-safe)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(searchResponse())))
    const ctx = new Context()
    await ctx.plugin(WebRuntime, { searchProvider: SEARXNG_PROVIDER_ID })
    const fiber = await ctx.plugin(searxngPlugin, { baseURL: 'http://searxng.test:10000' })
    await expect(ctx.web.search({ query: 'q' })).resolves.toMatchObject({ truncated: false })
    await fiber.dispose()
    await expect(ctx.web.search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_CONFIGURED_MISSING' }))
  })

  it('has no default export (namespace plugin export shape)', () => {
    expect('default' in searxngPlugin).toBe(false)
  })

  it('survives the real Loader unwrapExports path keeping name/inject/Config', () => {
    // A default export would make `unwrapExports` collapse the namespace and drop `inject: ['web']`.
    // Drive the real Loader path because hand-built namespace mounting cannot expose that failure.
    const loader = Object.create(Loader.prototype) as Loader
    const unwrapped = loader.unwrapExports(searxngPlugin) as Record<string, unknown>
    expect(unwrapped).toBe(searxngPlugin)
    expect(unwrapped.name).toBe('web-search-searxng')
    expect(unwrapped.inject).toEqual(['web'])
    expect(typeof unwrapped.apply).toBe('function')
  })

  it('boots over ctx.web through the unwrapped module without an inject error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(searchResponse())))
    const ctx = new Context()
    await ctx.plugin(WebRuntime, { searchProvider: SEARXNG_PROVIDER_ID })
    const loader = Object.create(Loader.prototype) as Loader
    const unwrapped = loader.unwrapExports(searxngPlugin) as Parameters<Context['plugin']>[0]
    // A collapsed export shape (dropped inject) would throw "without inject" here.
    const fiber = await ctx.plugin(unwrapped, { baseURL: 'http://searxng.test:10000' })
    await expect(ctx.web.search({ query: 'q' })).resolves.toMatchObject({ truncated: false })
    await fiber.dispose()
  })
})
