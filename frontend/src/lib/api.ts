/**
 * Fernleaf Kitchen Operations Admin Panel - Frontend API Client
 * Connects exclusively over HTTP to the NestJS backend API.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  roleName: 'ADMIN' | 'KITCHEN' | 'DISPATCH' | 'DRIVER' | string;
  permissions: string[];
}

export interface LoginResponse {
  access_token: string;
  user: UserProfile;
}

export function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('fernleaf_token');
}

export function setStoredToken(token: string | null) {
  if (typeof window === 'undefined') return;
  if (token) {
    localStorage.setItem('fernleaf_token', token);
  } else {
    localStorage.removeItem('fernleaf_token');
    localStorage.removeItem('fernleaf_user');
  }
}

export function getStoredUser(): UserProfile | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem('fernleaf_user');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setStoredUser(user: UserProfile | null) {
  if (typeof window === 'undefined') return;
  if (user) {
    localStorage.setItem('fernleaf_user', JSON.stringify(user));
  } else {
    localStorage.removeItem('fernleaf_user');
  }
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: any) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const url = `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    // If unauthorized, clear invalid token
    setStoredToken(null);
    setStoredUser(null);
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.location.href = '/login';
    }
  }

  if (!response.ok) {
    let errorMsg = `HTTP Error ${response.status}`;
    let details: any = null;
    try {
      const errorJson = await response.json();
      errorMsg = errorJson.message || errorJson.error || errorMsg;
      details = errorJson;
    } catch {
      // Fallback
    }
    throw new ApiError(response.status, Array.isArray(errorMsg) ? errorMsg.join(', ') : errorMsg, details);
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}

export const api = {
  // ---------------------------------------------------------------------------
  // AUTH
  // ---------------------------------------------------------------------------
  login: async (email: string, password: string): Promise<LoginResponse> => {
    const data = await request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setStoredToken(data.access_token);
    setStoredUser(data.user);
    return data;
  },

  getProfile: async (): Promise<UserProfile> => {
    const user = await request<UserProfile>('/auth/profile');
    setStoredUser(user);
    return user;
  },

  logout: () => {
    setStoredToken(null);
    setStoredUser(null);
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  },

  // ---------------------------------------------------------------------------
  // DASHBOARDS
  // ---------------------------------------------------------------------------
  getAdminDashboard: (date?: string) =>
    request<any>(`/dashboards/admin${date ? `?date=${date}` : ''}`),

  getKitchenDashboard: (date?: string) =>
    request<any>(`/dashboards/kitchen${date ? `?date=${date}` : ''}`),

  getDispatchDashboard: (date?: string) =>
    request<any>(`/dashboards/dispatch${date ? `?date=${date}` : ''}`),

  getDriverDashboard: () =>
    request<any>('/dashboards/driver'),

  // ---------------------------------------------------------------------------
  // KITCHEN
  // ---------------------------------------------------------------------------
  getKitchenBoard: (date?: string, stationId?: string) => {
    const params = new URLSearchParams();
    if (date) params.append('date', date);
    if (stationId) params.append('stationId', stationId);
    const qs = params.toString();
    return request<any>(`/kitchen/board${qs ? `?${qs}` : ''}`);
  },

  startKitchenUnit: (unitId: string) =>
    request<any>(`/kitchen/units/${unitId}/start`, { method: 'POST' }),

  completeKitchenUnit: (unitId: string) =>
    request<any>(`/kitchen/units/${unitId}/complete`, { method: 'POST' }),

  forceCompleteOrder: (orderId: string) =>
    request<any>(`/kitchen/orders/${orderId}/force-complete`, { method: 'POST' }),

  // ---------------------------------------------------------------------------
  // DISPATCH
  // ---------------------------------------------------------------------------
  getDrops: (date?: string) =>
    request<any>(`/dispatch/drops${date ? `?date=${date}` : ''}`),

  getDropDetail: (id: string) =>
    request<any>(`/dispatch/drops/${id}`),

  generateDrops: (date?: string) =>
    request<any>('/dispatch/drops/generate', {
      method: 'POST',
      body: JSON.stringify(date ? { date } : {}),
    }),

  assignDriver: (dropId: string, driverId: string) =>
    request<any>(`/dispatch/drops/${dropId}/assign-driver`, {
      method: 'POST',
      body: JSON.stringify({ driverId }),
    }),

  markDispatchReady: (dropId: string) =>
    request<any>(`/dispatch/drops/${dropId}/dispatch-ready`, { method: 'POST' }),

  markOutForDelivery: (dropId: string) =>
    request<any>(`/dispatch/drops/${dropId}/out-for-delivery`, { method: 'POST' }),

  markDropDelivered: (dropId: string, note?: string, photoUrl?: string) =>
    request<any>(`/dispatch/drops/${dropId}/delivered`, {
      method: 'POST',
      body: JSON.stringify({ note, photoUrl }),
    }),

  getMyDeliveries: (date?: string) =>
    request<any>(`/dispatch/my-deliveries${date ? `?date=${date}` : ''}`),

  getDrivers: () =>
    request<any[]>('/dispatch/drivers'),

  // ---------------------------------------------------------------------------
  // ORDERS
  // ---------------------------------------------------------------------------
  getOrders: (params: { page?: number; limit?: number; status?: string; companyId?: string; date?: string } = {}) => {
    const sp = new URLSearchParams();
    if (params.page) sp.append('page', String(params.page));
    if (params.limit) sp.append('limit', String(params.limit));
    if (params.status) sp.append('status', params.status);
    if (params.companyId) sp.append('companyId', params.companyId);
    if (params.date) sp.append('deliveryDate', params.date);
    const qs = sp.toString();
    return request<any>(`/orders${qs ? `?${qs}` : ''}`);
  },

  getOrderDetail: (id: string) =>
    request<any>(`/orders/${id}`),

  cancelOrder: (id: string, reason?: string) =>
    request<any>(`/orders/${id}/cancel`, {
      method: 'PUT',
      body: JSON.stringify({ reason: reason || 'Cancelled from admin panel' }),
    }),

  adminOverrideOrder: (id: string, dto: { deliveryAddressId?: string; deliveryTimeMinutes?: number; packagingTypeId?: string }) =>
    request<any>(`/orders/${id}/override`, {
      method: 'POST',
      body: JSON.stringify(dto),
    }),

  processCutoffs: (date?: string) =>
    request<any>('/orders/process-cutoffs', {
      method: 'POST',
      body: JSON.stringify(date ? { date } : {}),
    }),

  // ---------------------------------------------------------------------------
  // BILLING
  // ---------------------------------------------------------------------------
  getInvoices: () =>
    request<any>('/billing/invoices'),

  getInvoiceDetail: (id: string) =>
    request<any>(`/billing/invoices/${id}`),

  getUninvoicedOrders: (companyId?: string) =>
    request<any[]>(`/billing/uninvoiced-orders${companyId ? `?companyId=${companyId}` : ''}`),

  createInvoice: (companyId: string, orderIds: string[], notes?: string) =>
    request<any>('/billing/invoices', {
      method: 'POST',
      body: JSON.stringify({ companyId, orderIds, notes }),
    }),

  markInvoicePaid: (id: string) =>
    request<any>(`/billing/invoices/${id}/mark-paid`, { method: 'POST' }),

  // ---------------------------------------------------------------------------
  // CATALOGUE & MENU
  // ---------------------------------------------------------------------------
  getDishes: () =>
    request<any[]>('/catalogue/dishes'),

  getOptionGroups: () =>
    request<any[]>('/catalogue/option-groups'),

  getOptions: () =>
    request<any[]>('/catalogue/options'),

  getKitchenStations: () =>
    request<any[]>('/catalogue/stations'),

  getAllergens: () =>
    request<any[]>('/catalogue/allergens'),

  getDietaryTags: () =>
    request<any[]>('/catalogue/dietary-tags'),

  getPackagingTypes: () =>
    request<any[]>('/catalogue/packaging-types'),

  getMenuCategories: () =>
    request<any[]>('/menu/categories'),

  getMenuPreview: (employeeId: string, date?: string) =>
    request<any>(`/menu/preview?employeeId=${employeeId}${date ? `&date=${date}` : ''}`),

  // ---------------------------------------------------------------------------
  // PRICING
  // ---------------------------------------------------------------------------
  getPriceTiers: () =>
    request<any[]>('/pricing/tiers'),

  getPriceTierMatrix: (id: string) =>
    request<any>(`/pricing/tiers/${id}/matrix`),

  // ---------------------------------------------------------------------------
  // COMPANIES & EMPLOYEES
  // ---------------------------------------------------------------------------
  getCompanies: () =>
    request<any[]>('/companies'),

  getCompanyDetail: (id: string) =>
    request<any>(`/companies/${id}`),

  getEmployees: (companyId?: string) =>
    request<any[]>(`/employees${companyId ? `?companyId=${companyId}` : ''}`),

  // ---------------------------------------------------------------------------
  // SETTINGS
  // ---------------------------------------------------------------------------
  getKitchenSettings: () =>
    request<any>('/settings/kitchen'),

  updateKitchenSettings: (dto: { cutoffTime?: string; cutoffWorkingDaysCount?: number; dispatchBufferMinutes?: number }) =>
    request<any>('/settings/kitchen', {
      method: 'PATCH',
      body: JSON.stringify(dto),
    }),

  getKitchenWorkingDays: () =>
    request<any[]>('/settings/kitchen/working-days'),

  updateKitchenWorkingDays: (workingDays: { dayOfWeek: string; isWorking: boolean }[]) =>
    request<any>('/settings/kitchen/working-days', {
      method: 'PUT',
      body: JSON.stringify({ workingDays }),
    }),

  getKitchenHolidays: () =>
    request<any[]>('/settings/kitchen/holidays'),

  addKitchenHoliday: (name: string, date: string) =>
    request<any>('/settings/kitchen/holidays', {
      method: 'POST',
      body: JSON.stringify({ name, date }),
    }),

  deleteKitchenHoliday: (id: string) =>
    request<any>(`/settings/kitchen/holidays/${id}`, {
      method: 'DELETE',
    }),

  getCutoffPreview: (date?: string) =>
    request<any>(`/settings/kitchen/cutoff-preview${date ? `?date=${date}` : ''}`),
};
