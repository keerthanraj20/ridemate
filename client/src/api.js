export const getToken = () => localStorage.getItem('rm_token')

export async function api(path, { method = 'GET', body, signal } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  const t = getToken()
  if (t) headers.Authorization = `Bearer ${t}`
  const res = await fetch(`/api${path}`, {
    method,
    headers,
    signal,
    body: body ? JSON.stringify(body) : undefined,
  })
  let data = {}
  try {
    data = await res.json()
  } catch {
    /* no body */
  }

  if (res.status === 401) {
    localStorage.removeItem('rm_token')
    localStorage.removeItem('rm_user')
    window.location.href = '/auth'
    throw new Error(data.error || 'Session expired')
  }

  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
  return data
}
