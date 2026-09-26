export async function readApiJson<T = unknown>(response: Response): Promise<T> {
  const body = await response.text();
  let data: unknown = null;

  try {
    data = body ? JSON.parse(body) : null;
  } catch {
    throw new Error(`API request failed (${response.status}): ${body.slice(0, 180) || response.statusText}`);
  }

  if (!response.ok) {
    const message = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
      ? data.error
      : `API request failed (${response.status})`;
    throw new Error(message);
  }
  return data as T;
}
