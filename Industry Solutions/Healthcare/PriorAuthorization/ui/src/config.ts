/**
 * Application configuration.
 * Reads environment variables injected by Vite at build time.
 */

/** Base URL for the PA Demo API. Falls back to `/api` for local dev proxy. */
export const API_BASE_URL: string =
  import.meta.env.VITE_API_URL ?? '/api';
