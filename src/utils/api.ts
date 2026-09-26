export async function readApiJson<T = any>(response: Response): Promise<T> {
  const body = await response.text();
  let data: any = null;

  try {
    data = body ? JSON.parse(body) : null;
  } catch {
    throw new Error(`API request failed (${response.status}): ${body.slice(0, 180) || response.statusText}`);
  }

  if (!response.ok) {
    throw new Error(data?.error || `API request failed (${response.status})`);
  }
  return data as T;
}
