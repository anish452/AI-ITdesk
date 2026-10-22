export type Role = 'EMPLOYEE' | 'TECHNICIAN' | 'MANAGER' | 'ADMIN';

export type User = {
  id: string;
  email: string;
  name: string;
  role: Role;
  department: string;
  plant: string;
  active?: boolean;
};

const TOKEN_KEY = 'northline-token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body) headers.set('Content-Type', 'application/json');
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(path, { ...options, headers });
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  if (response.status === 401 && !path.endsWith('/auth/login')) setToken(null);
  if (!response.ok) throw new ApiError(body.error || 'The request could not be completed.');
  return body as T;
}
