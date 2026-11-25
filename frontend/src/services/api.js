const API_ROOT = '/api';

export async function apiRequest(path, { token, ...options } = {}) {
  let response;
  try {
    response = await fetch(`${API_ROOT}${path}`, {
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new Error('Cannot reach the API. Start the backend with npm run dev -w backend.');
  }

  const payload = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.error || 'Request failed. Please try again.');
    error.status = response.status;
    error.details = payload?.details;
    throw error;
  }
  return payload;
}
