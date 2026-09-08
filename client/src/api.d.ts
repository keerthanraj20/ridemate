export declare function getToken(): string | null

export declare function api(
  path: string,
  opts?: { method?: string; body?: unknown; signal?: AbortSignal }
): Promise<any>