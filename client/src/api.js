import { mockRequest } from './mockData.js';

const BASE      = import.meta.env.VITE_API_URL || '';
const MOCK_MODE = import.meta.env.VITE_MOCK_API === 'true';

async function request(path, opts = {}) {
  if (MOCK_MODE) {
    return mockRequest(path, opts);
  }
  return fetch(`${BASE}/api${path}`, {
    headers: {
      'Content-Type': 'application/json',
      'x-channel-id': localStorage.getItem('channelId') || 'demo',
      ...opts.headers,
    },
    ...opts,
  }).then(r => r.json());
}

export const visitorsApi = {
  list:        (params = {}) => request('/visitors?' + new URLSearchParams(params).toString()),
  stats:       ()            => request('/visitors/stats'),
  get:         (id)          => request(`/visitors/${id}`),
  getCarts:    (id)          => request(`/visitors/${id}/carts`),
  getActivity: (id, phone)   => request(`/visitors/${id || 0}/activity${phone ? `?phone=${encodeURIComponent(phone)}` : ''}`),
};

export const campaignsApi = {
  list:       ()             => request('/campaigns'),
  get:        (id)           => request(`/campaigns/${id}`),
  create:     (data)         => request('/campaigns',             { method:'POST',   body: JSON.stringify(data) }),
  update:     (id, data)     => request(`/campaigns/${id}`,      { method:'PUT',    body: JSON.stringify(data) }),
  delete:     (id)           => request(`/campaigns/${id}`,      { method:'DELETE' }),
  toggle:     (id)           => request(`/campaigns/${id}/status`,{ method:'POST',   body: JSON.stringify({}) }),
  send:       (id)           => request(`/campaigns/${id}/send`,      { method:'POST', body: JSON.stringify({}) }),
  sendTest:   (id, phone)   => request(`/campaigns/${id}/send-test`, { method:'POST', body: JSON.stringify({ phone }) }),
  executions: (id)           => request(`/campaigns/${id}/executions`),
};

export const templatesApi = {
  list:   (params = {}) => request('/templates?' + new URLSearchParams(params).toString()),
  get:    (id)          => request(`/templates/${id}`),
  create: (data)        => request('/templates',        { method:'POST',   body: JSON.stringify(data) }),
  update: (id, data)    => request(`/templates/${id}`, { method:'PUT',    body: JSON.stringify(data) }),
  delete: (id)          => request(`/templates/${id}`, { method:'DELETE' }),
};

export const cartApi = {
  list: (params = {}) => request('/cart-events?' + new URLSearchParams(params).toString()),
};

export const contactsApi = {
  list: (params = {}) => request('/contacts?' + new URLSearchParams(params).toString()),
};

export const analyticsApi = {
  overview:    (days = 7) => request(`/analytics?period=${days}`),
  dashboard:   ()         => request('/analytics/dashboard'),
  topLanguage: ()         => request('/analytics/top-language'),
  pages:       (days = 30)=> request(`/analytics/pages?days=${days}`),
  cities:      (days = 30)=> request(`/analytics/cities?days=${days}`),
  contacts:    (days = 30, limit = 50) => request(`/analytics/contacts?days=${days}&limit=${limit}`),
  devices:     (days = 30)=> request(`/analytics/devices?days=${days}`),
  engagement:      (days = 7)  => request(`/analytics/engagement?days=${days}`),
  brand:           (days = 30) => request(`/analytics/brand?days=${days}`),
  repeatVisitors:  ()          => request('/analytics/repeat-visitors'),
};

export const settingsApi = {
  get:          ()        => request('/settings'),
  save:         (data)    => request('/settings',               { method:'POST', body: JSON.stringify(data) }),
  testWhatsApp: (phone)   => request('/settings/test-whatsapp', { method:'POST', body: JSON.stringify({ phone }) }),
};

export const trackingApi = {
  visitor:  (data) => request('/tracking/visitor',  { method:'POST', body: JSON.stringify(data) }),
  identify: (data) => request('/tracking/identify', { method:'POST', body: JSON.stringify(data) }),
  cart:     (data) => request('/tracking/cart',     { method:'POST', body: JSON.stringify(data) }),
  checkout: (data) => request('/tracking/checkout', { method:'POST', body: JSON.stringify(data) }),
};
