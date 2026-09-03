"use client";

import { supabaseBrowser } from "@/lib/supabaseBrowser";

export async function getAccessToken(): Promise<string | null> {
  const {
    data: { session },
  } = await supabaseBrowser.auth.getSession();
  return session?.access_token ?? null;
}

function withAuthHeaders(
  token: string | null,
  options: RequestInit
): Record<string, string> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  return headers;
}

/** fetch() with the current Supabase bearer token attached. */
export async function authedFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = await getAccessToken();
  return fetch(path, {
    ...options,
    headers: withAuthHeaders(token, options),
  });
}

/**
 * Like authedFetch, but on 401 refreshes the Supabase session and retries once.
 */
export async function authedFetchWithRetry(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  let res = await authedFetch(path, options);
  if (res.status !== 401) return res;

  await supabaseBrowser.auth.refreshSession();
  const token = await getAccessToken();
  if (!token) {
    throw new Error("Session expired — sign in again");
  }

  res = await fetch(path, {
    ...options,
    headers: withAuthHeaders(token, options),
  });
  if (res.status === 401) {
    throw new Error("Session expired — sign in again");
  }
  return res;
}

/** Extracts a useful error message from an API response. */
export async function apiError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return body?.error ?? `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}
