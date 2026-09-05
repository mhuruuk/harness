/**
 * Provider-private wire types for the SearXNG JSON search API. The response
 * envelope carries result, answer, and suggestion arrays; the provider consumes
 * only `results[]` and maps each entry to the seam's portable source shape.
 * @module @deepseek-ai/dsh-web-search-searxng/types
 */

/** One entry of SearXNG's `results[]` array; only the portable fields are typed. */
export interface SearxngResult {
  url?: string | null
  title?: string | null
  /** Result excerpt or description; the seam's `snippet` source. */
  content?: string | null
  /** ISO-8601 publication date, or null when the engine supplies none. */
  publishedDate?: string | null
  /** Engine that produced the result (not portable to the seam). */
  engine?: string | null
  /** Search category (not portable to the seam). */
  category?: string | null
  /** Relevance score (not portable to the seam). */
  score?: number | null
}

/** SearXNG's `GET /search?format=json` response envelope. */
export interface SearxngResponse {
  query?: string
  results?: SearxngResult[]
  answers?: unknown[]
  corrections?: string[]
  infoboxes?: unknown[]
  suggestions?: string[]
  unresponsive_engines?: string[]
}
