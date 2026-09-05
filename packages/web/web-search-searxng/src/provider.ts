/**
 * SearXNG search through the instance's JSON API (`GET /search?format=json`). Each search is
 * one plain HTTP request — no model turn — and returns the instance's merged result list.
 * The wire format and native `fetch` client are provider-private and do not use `ctx.llm`.
 * @module @deepseek-ai/dsh-web-search-searxng/provider
 */

import { WebError } from '@deepseek-ai/dsh-web'
import type {
  WebSearchProvider,
  WebSearchRequest,
  WebSearchResult,
  WebSearchSource,
} from '@deepseek-ai/dsh-web'
import type { SearxngResponse, SearxngResult } from './types.ts'

/** Stable id this provider registers under. */
export const SEARXNG_PROVIDER_ID = 'searxng'

/** Default endpoint: a local Docker instance on the deployment's port series. */
export const SEARXNG_DEFAULT_BASE_URL = 'http://127.0.0.1:10000'

/** Attribution header sent on every request. Bump with the package version. */
const USER_AGENT = 'deepseek-harness/0.0.1'

/** Resolved provider options (the plugin's `apply` supplies env-var and constant defaults). */
export interface SearxngSearchProviderOptions {
  /** Optional instance API token; sent as `Authorization: Bearer` when non-empty. */
  apiToken?: string
  /** Endpoint base; `/search` is appended. */
  baseURL: string
  /** Optional SearXNG `language` parameter (e.g. `en`, `ru`, `all`). */
  language?: string
  /** Optional SearXNG `categories` parameter (e.g. `general`, `news`). */
  categories?: string
}

function nonEmptyString(value: string | null | undefined): string | undefined {
  return value !== undefined && value !== null && value.length > 0 ? value : undefined
}

/**
 * Map one SearXNG result to a normalized source, or `undefined` when it carries
 * no URL (some result types are URL-less; the seam's sources always have one).
 *
 * @param result - one entry of SearXNG's `results[]`.
 * @returns the normalized source, or `undefined` for a URL-less entry.
 */
export function mapSearxngResult(result: SearxngResult): WebSearchSource | undefined {
  if (result.url === undefined || result.url === null || result.url.length === 0) return undefined
  const title = nonEmptyString(result.title)
  const snippet = nonEmptyString(result.content)
  const publishedAt = nonEmptyString(result.publishedDate)
  return {
    url: result.url,
    ...(title === undefined ? {} : { title }),
    ...(snippet === undefined ? {} : { snippet }),
    ...(publishedAt === undefined ? {} : { publishedAt }),
  }
}

/**
 * Map a SearXNG response envelope to a normalized search result. URL-less entries
 * are dropped and the merged list is deduplicated by URL (first wins). The web
 * service owns the final `maxResults` truncation, so `truncated` is always
 * `false` here.
 *
 * @param response - the parsed `format=json` response body.
 * @returns the normalized result with deduped sources.
 */
export function mapSearxngResponse(response: SearxngResponse): WebSearchResult {
  const seen = new Set<string>()
  const sources: WebSearchSource[] = []
  for (const result of response.results ?? []) {
    const source = mapSearxngResult(result)
    if (source === undefined || seen.has(source.url)) continue
    seen.add(source.url)
    sources.push(source)
  }
  // SearXNG's `answers` and `infoboxes` have no home in the seam's result shape
  // (`content` is reserved for generated answers), so this version maps results only.
  return { sources, truncated: false }
}

/**
 * Build the instance's search endpoint for one query. `format=json` is always
 * sent; optional `language` and `categories` parameters ride along when set.
 *
 * @param options - the operation's options snapshot.
 * @param query - the model's search query.
 * @returns the absolute URL to GET.
 */
export function buildSearchUrl(options: SearxngSearchProviderOptions, query: string): string {
  const params = new URLSearchParams()
  params.set('q', query)
  params.set('format', 'json')
  if (options.language !== undefined && options.language.length > 0) params.set('language', options.language)
  if (options.categories !== undefined && options.categories.length > 0) params.set('categories', options.categories)
  return `${options.baseURL}/search?${params.toString()}`
}

/** The SearXNG-backed search provider; HTTP redirects fail as `WEB_PROVIDER_ERROR`. */
export class SearxngSearchProvider implements WebSearchProvider {
  readonly id = SEARXNG_PROVIDER_ID

  /**
   * @param resolveOptions - the options for the NEXT operation, snapshotted
   * once at each operation's entry so one search never mixes two sections. A
   * thunk rather than a value because the plugin's settings section can change
   * between searches, and re-registering the provider to carry a new endpoint
   * would make the seam's selection observable to the user as a flicker.
   */
  constructor(private readonly resolveOptions: () => SearxngSearchProviderOptions) {}

  available(): boolean {
    // A cheap local config check only: the seam forbids network calls here. A
    // down instance therefore reads as available and fails the search instead.
    const options = this.resolveOptions()
    return URL.canParse(options.baseURL)
  }

  async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult> {
    // One snapshot for the whole operation: a settings write landing inside the
    // request must not mix the old section's token with the new section's endpoint.
    const options = this.resolveOptions()
    throwIfSearchAborted(signal)
    const endpoint = buildSearchUrl(options, request.query)
    const headers: Record<string, string> = {
      'accept': 'application/json',
      'user-agent': USER_AGENT,
    }
    if (options.apiToken !== undefined && options.apiToken.length > 0) {
      headers['authorization'] = `Bearer ${options.apiToken}`
    }
    let response: Response
    try {
      response = await fetch(endpoint, {
        method: 'GET',
        redirect: 'error',
        headers,
        ...signal !== undefined ? { signal } : {},
      })
    } catch (error: unknown) {
      if (signal?.aborted === true || isAbortError(error)) throw searchAborted(signal, error)
      throw new WebError(
        `SearXNG search request failed: ${String(error)} (is the instance running at ${options.baseURL}?)`,
        'WEB_PROVIDER_ERROR',
        { cause: error },
      )
    }

    if (!response.ok) {
      const status = response.status
      let message = `SearXNG API error (HTTP ${status})`
      if (status === 403) {
        message += '; the instance may not allow the json format (set search.formats to include json)'
      }
      try {
        const body = await response.text()
        if (body.length > 0 && body.length <= 512) message += `: ${body}`
      } catch (error: unknown) {
        // An abort fired mid-body must surface as WEB_ABORTED, not be swallowed
        // into a generic HTTP-error message — cancellation is not a provider
        // error (the seam's cancellation contract).
        if (signal?.aborted === true || isAbortError(error)) throw searchAborted(signal, error)
        // Otherwise: the HTTP status is already captured in `message` above; a
        // non-text error body can only cost a richer provider message, never
        // the real error.
      }
      throw new WebError(message, 'WEB_PROVIDER_ERROR')
    }

    try {
      const payload = await response.json() as SearxngResponse
      return mapSearxngResponse(payload)
    } catch (error: unknown) {
      if (signal?.aborted === true || isAbortError(error)) throw searchAborted(signal, error)
      if (error instanceof WebError) throw error
      throw new WebError(`SearXNG returned an unprocessable response body: ${String(error)}`, 'WEB_PROVIDER_ERROR', { cause: error })
    }
  }
}

/** Throw the provider's stable cancellation error when the caller already aborted. */
function throwIfSearchAborted(signal?: AbortSignal): void {
  if (signal?.aborted === true) throw searchAborted(signal)
}

/** Build the provider's stable cancellation error while retaining the caller's reason. */
function searchAborted(signal?: AbortSignal, fallback?: unknown): WebError {
  return new WebError('SearXNG search aborted', 'WEB_ABORTED', {
    cause: signal?.aborted === true ? signal.reason : fallback,
  })
}

/** True for a fetch/`AbortSignal` abort, surfaced as `WEB_ABORTED`. */
function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}
