import type { AuthSession, AuthUser } from "./types";

export const TOKEN_KEY = "alpacto_token";

export const API_URL = (typeof process !== "undefined" && process.env.NEXT_PUBLIC_API_URL) || "http://127.0.0.1:4000";

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  token?: string | null;
  auth?: boolean;
};

export async function apiFetch<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, token, auth = true } = options;
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const bearer = token === undefined ? (auth ? getStoredToken() : null) : token;
  if (bearer) headers.Authorization = `Bearer ${bearer}`;

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body, (_k, v) => (typeof v === "bigint" ? v.toString() : v)) : undefined,
  });

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const msg =
      data && typeof data === "object" && data !== null && "error" in data
        ? String((data as { error: unknown }).error)
        : data && typeof data === "object" && data !== null && "message" in data
          ? String((data as { message: unknown }).message)
          : `Request failed (${res.status})`;
    throw new ApiError(res.status, msg, data);
  }

  return data as T;
}

export async function demoLogin(email: string): Promise<AuthSession> {
  return apiFetch<AuthSession>("/auth/demo-login", {
    method: "POST",
    body: { email },
    auth: false,
  });
}

export async function producerSession(input: {
  email: string;
  name: string;
  smartAccountAddress: string;
  authMethod: "google" | "email_otp" | "passkey";
}): Promise<AuthSession & { authMethod: string }> {
  return apiFetch("/auth/producer/session", {
    method: "POST",
    body: input,
    auth: false,
  });
}

export async function fetchMe(token?: string): Promise<{ user: AuthUser }> {
  return apiFetch("/auth/me", { token });
}

export function roleHomePath(role: AuthUser["role"]): string {
  switch (role) {
    case "producer":
      return "/producer";
    case "inspector":
      return "/inspector";
    case "buyer":
      return "/buyer/orders";
    case "association":
      return "/association";
    case "admin":
      return "/admin";
    default:
      return "/";
  }
}
