export async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => undefined) as
      | { error?: { message?: string } }
      | undefined;
    throw new Error(body?.error?.message ?? `${response.status} ${response.statusText}`);
  }

  return response.status === 204 ? (undefined as T) : response.json() as Promise<T>;
}
