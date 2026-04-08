import { QueryClient, QueryFunction } from "@tanstack/react-query";

// --- In-memory token store (never persisted to localStorage) ---
let _accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  _accessToken = token;
}

export function getAccessToken(): string | null {
  return _accessToken;
}

// --- Token refresh (deduplicated across concurrent calls) ---
let _refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (_refreshPromise) return _refreshPromise;
  _refreshPromise = fetch("/api/auth/refresh", {
    method: "GET",
    credentials: "include",
  })
    .then(async (res) => {
      if (!res.ok) {
        setAccessToken(null);
        return null;
      }
      const data = await res.json();
      setAccessToken(data.access_token);
      return data.access_token as string;
    })
    .finally(() => {
      _refreshPromise = null;
    });
  return _refreshPromise;
}

// --- Helpers ---
function buildHeaders(data?: unknown): Record<string, string> {
  const headers: Record<string, string> = {};
  if (data) headers["Content-Type"] = "application/json";
  if (_accessToken) headers["Authorization"] = `Bearer ${_accessToken}`;
  return headers;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

// --- Core request function ---
export async function apiRequest(
  method: string,
  url: string,
  data?: unknown,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: buildHeaders(data),
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  if (res.status === 401) {
    const newToken = await refreshAccessToken();
    if (!newToken) {
      await throwIfResNotOk(res);
      return res;
    }
    const retry = await fetch(url, {
      method,
      headers: buildHeaders(data),
      body: data ? JSON.stringify(data) : undefined,
      credentials: "include",
    });
    await throwIfResNotOk(retry);
    return retry;
  }

  await throwIfResNotOk(res);
  return res;
}

// --- React Query default query function ---
type UnauthorizedBehavior = "returnNull" | "throw";

export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const url = queryKey[0] as string;

    const doFetch = (token: string | null) =>
      fetch(url, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

    let res = await doFetch(_accessToken);

    if (res.status === 401) {
      if (unauthorizedBehavior === "returnNull") return null;
      const newToken = await refreshAccessToken();
      if (!newToken) {
        await throwIfResNotOk(res);
        return null;
      }
      res = await doFetch(newToken);
    }

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
