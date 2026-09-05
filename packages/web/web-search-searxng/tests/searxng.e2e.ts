import { describe, expect, it } from 'vitest'
import { SearxngSearchProvider } from '@deepseek-ai/dsh-web-search-searxng'

/** Construct the provider over a fixed options value; production passes a live thunk. */
import type { SearxngSearchProviderOptions } from '@deepseek-ai/dsh-web-search-searxng'

const searchProvider = (options: SearxngSearchProviderOptions): SearxngSearchProvider =>
  new SearxngSearchProvider(() => options)

/**
 * Real-API probe for the SearXNG search provider. It runs only when
 * `SEARXNG_E2E_URL` points at a live instance with the json format enabled,
 * because a CI runner has no such instance by default.
 */
const instanceUrl = process.env.SEARXNG_E2E_URL
const maybe = instanceUrl !== undefined && instanceUrl.length > 0 ? describe : describe.skip

maybe('SearxngSearchProvider real API', () => {
  it('returns citeable sources for a live query via the json API', async () => {
    const provider = searchProvider({ baseURL: instanceUrl! })
    const result = await provider.search({ query: 'SearXNG metasearch engine', maxResults: 5 })
    expect(result.sources.length).toBeGreaterThan(0)
    for (const source of result.sources) expect(source.url).toMatch(/^https?:\/\//)
  }, 60_000)
})
