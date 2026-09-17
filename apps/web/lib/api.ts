export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  detail: string;

  constructor(status: number, detail: string) {
    super(detail);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

export async function apiRequest(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(`${API_URL}${path}`, { credentials: "include", ...init });
  if (!response.ok) {
    const data = await response.json().catch(() => ({ detail: response.statusText }));
    throw new ApiError(response.status, data.detail ?? "请求失败");
  }
  return response;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiRequest(path, init);
  return response.json() as Promise<T>;
}

export function csrfHeaders(): HeadersInit {
  const csrf = typeof window === "undefined" ? "" : sessionStorage.getItem("csrf_token") ?? "";
  return { "Content-Type": "application/json", "X-CSRF-Token": csrf };
}
