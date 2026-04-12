// orion-api-client.js
// Drop-in API client for Orion frontend.
// Replace direct Anthropic calls with these — keeps API keys server-side.
//
// USAGE in orion-v4.jsx:
//   import api from './orion-api-client';
//   const quote = await api.ai.getQuote();

const BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:4000/api';

// ── Token storage ────────────────────────────────────────────────
const storage = {
  getToken:   ()    => localStorage.getItem('orion_access_token'),
  setToken:   (tok) => localStorage.setItem('orion_access_token', tok),
  clearToken: ()    => localStorage.removeItem('orion_access_token'),
};

// ── Base fetch with auth + auto-refresh ─────────────────────────
async function apiFetch(path, options = {}) {
  const token = storage.getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  let res = await fetch(`${BASE_URL}${path}`, {
    credentials: 'include', // sends refresh-token cookie
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  // Auto-refresh on 401 TOKEN_EXPIRED
  if (res.status === 401) {
    const err = await res.clone().json().catch(() => ({}));
    if (err.code === 'TOKEN_EXPIRED') {
      const refreshRes = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      if (refreshRes.ok) {
        const { accessToken } = await refreshRes.json();
        storage.setToken(accessToken);
        // Retry original request
        res = await fetch(`${BASE_URL}${path}`, {
          credentials: 'include',
          ...options,
          headers: { ...headers, Authorization: `Bearer ${accessToken}` },
          body: options.body ? JSON.stringify(options.body) : undefined,
        });
      } else {
        storage.clearToken();
        window.location.href = '/';
        return;
      }
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Request failed' }));
    throw Object.assign(new Error(body.error || 'Request failed'), { status: res.status, body });
  }

  return res.json();
}

// ── AUTH ─────────────────────────────────────────────────────────
const auth = {
  register: (name, email, password) =>
    apiFetch('/auth/register', { method: 'POST', body: { name, email, password } }),

  login: async (email, password) => {
    const data = await apiFetch('/auth/login', { method: 'POST', body: { email, password } });
    if (data.accessToken) storage.setToken(data.accessToken);
    return data;
  },

  logout: async () => {
    await apiFetch('/auth/logout', { method: 'POST' }).catch(() => {});
    storage.clearToken();
  },

  me: () => apiFetch('/auth/me'),

  saveOnboarding: (answers) =>
    apiFetch('/auth/onboarding', { method: 'POST', body: answers }),

  forgotPassword: (email) =>
    apiFetch('/auth/forgot-password', { method: 'POST', body: { email } }),

  resetPassword: (token, password) =>
    apiFetch('/auth/reset-password', { method: 'POST', body: { token, password } }),

  verifyEmail: (token) =>
    apiFetch(`/auth/verify-email?token=${encodeURIComponent(token)}`),
};

// ── FOCUS ────────────────────────────────────────────────────────
const focus = {
  logSession: (duration_mins, mode = 'Deep Work', notes = '') =>
    apiFetch('/focus/sessions', { method: 'POST', body: { duration_mins, mode, notes } }),

  getToday: () => apiFetch('/focus/today'),
  getWeek:  () => apiFetch('/focus/week'),
  getAnalytics: () => apiFetch('/focus/analytics'),

  logEmotionalState: (state, weekTargetMins = null) =>
    apiFetch('/focus/emotional-state', { method: 'POST', body: { state, weekTargetMins } }),

  getWeeklyTarget: (state) =>
    apiFetch(`/focus/weekly-target?state=${encodeURIComponent(state)}`),
};

// ── PODCASTS ─────────────────────────────────────────────────────
const podcasts = {
  getLibrary: (theme = null) =>
    apiFetch(`/podcasts${theme ? `?theme=${encodeURIComponent(theme)}` : ''}`),

  getDaily: () => apiFetch('/podcasts/daily'),

  getOne: (id) => apiFetch(`/podcasts/${id}`),

  saveProgress: (id, position_secs, char_index, total_chars, completed = false) =>
    apiFetch(`/podcasts/${id}/progress`, {
      method: 'PUT',
      body: { position_secs, char_index, total_chars, completed },
    }),

  clearProgress: (id) =>
    apiFetch(`/podcasts/${id}/progress`, { method: 'DELETE' }),
};

// ── AI ───────────────────────────────────────────────────────────
const ai = {
  getQuote:   () => apiFetch('/ai/quote').then(d => d.quote),
  getInsight: () => apiFetch('/ai/insight').then(d => d.insight),
  getReading: () => apiFetch('/ai/reading').then(d => d.reading),

  strategistChat: (message, history = []) =>
    apiFetch('/ai/strategist', { method: 'POST', body: { message, history } })
      .then(d => d.reply),

  summarizeNote: (noteId) =>
    apiFetch(`/ai/summarize/${noteId}`, { method: 'POST' }).then(d => d.summary),

  getWeeklyTarget: (state, currentWeekMins) =>
    apiFetch('/focus/weekly-target', {
      method: 'GET',
      params: { state },
    }).then(d => d.target),
};

// ── VAULT + REFLECTIONS ──────────────────────────────────────────
const vault = {
  getNotes: (search, tag) => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (tag)    params.set('tag', tag);
    const qs = params.toString();
    return apiFetch(`/content/notes${qs ? `?${qs}` : ''}`).then(d => d.notes);
  },
  createNote: (title, content, tags = []) =>
    apiFetch('/content/notes', { method: 'POST', body: { title, content, tags } })
      .then(d => d.note),
  updateNote: (id, data) =>
    apiFetch(`/content/notes/${id}`, { method: 'PATCH', body: data }).then(d => d.note),
  deleteNote: (id) =>
    apiFetch(`/content/notes/${id}`, { method: 'DELETE' }),
};

const reflections = {
  get: () => apiFetch('/content/reflections').then(d => d.reflections),
  create: (content) =>
    apiFetch('/content/reflections', { method: 'POST', body: { content } }).then(d => d.entry),
};

// ── Exported client ──────────────────────────────────────────────
const api = { auth, focus, podcasts, ai, vault, reflections, storage };

export default api;
