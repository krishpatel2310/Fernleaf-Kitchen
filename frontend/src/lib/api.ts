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
  accessToken: string;
  access_token?: string;
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
    // Only redirect if unauthorized on a protected route, never on login itself
    if (!path.includes('/auth/login')) {
      setStoredToken(null);
      setStoredUser(null);
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
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
    const data = await request<any>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    const token = data.accessToken || data.access_token;
    if (!token) {
      throw new ApiError(500, 'Authentication token missing in server response');
    }
    setStoredToken(token);
    setStoredUser(data.user);
    return {
      accessToken: token,
      access_token: token,
      user: data.user,
    };
  },

  getProfile: async (): Promise<UserProfile> => {
    const user = await request<UserProfile>('/auth/me');
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
  getOrders: async (params: { page?: number; limit?: number; status?: string; companyId?: string; date?: string } = {}) => {
    const sp = new URLSearchParams();
    if (params.page) sp.append('page', String(params.page));
    if (params.limit) sp.append('limit', String(params.limit));
    if (params.status) sp.append('status', params.status);
    if (params.companyId) sp.append('companyId', params.companyId);
    if (params.date) sp.append('deliveryDate', params.date);
    const qs = sp.toString();
    const res = await request<any>(`/orders${qs ? `?${qs}` : ''}`);
    const list = Array.isArray(res) ? res : res?.orders || res?.items || res?.data || [];
    return {
      orders: list,
      items: list,
      total: res?.total ?? list.length,
      page: res?.page ?? 1,
      limit: res?.limit ?? 15,
      totalPages: res?.totalPages ?? 1,
    };
  },

  getOrderDetail: (id: string) =>
    request<any>(`/orders/${id}`),

  getOrderTimeline: (id: string) =>
    request<any[]>(`/orders/${id}/timeline`),

  createOrder: (dto: any) =>
    request<any>('/orders', {
      method: 'POST',
      body: JSON.stringify(dto),
    }),

  updateOrder: (id: string, dto: any) =>
    request<any>(`/orders/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(dto),
    }),

  placeOrder: (id: string) =>
    request<any>(`/orders/${id}/place`, {
      method: 'POST',
    }),

  cancelOrder: (id: string, reason?: string) =>
    request<any>(`/orders/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason: reason || 'Cancelled from admin panel' }),
    }),

  adminOverrideOrder: (id: string, dto: { deliveryAddressId?: string; companyAddressId?: string; deliveryTimeMinutes?: number; packagingTypeId?: string; note: string }) =>
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
  getInvoices: async () => {
    const res = await request<any>('/billing/invoices');
    const list = Array.isArray(res) ? res : res?.data || res?.invoices || [];
    return {
      invoices: list,
      data: list,
      meta: res?.meta,
    };
  },

  getInvoiceDetail: (id: string) =>
    request<any>(`/billing/invoices/${id}`),

  getUninvoicedOrders: async (companyId?: string) => {
    const res = await request<any>(`/billing/uninvoiced-orders${companyId ? `?companyId=${companyId}` : ''}`);
    return Array.isArray(res) ? res : res?.data || [];
  },

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
  getDishes: async (query?: { isActive?: boolean; stationId?: string; search?: string; limit?: number }): Promise<any[]> => {
    const params = new URLSearchParams();
    if (query?.isActive !== undefined) params.append('isActive', String(query.isActive));
    if (query?.stationId) params.append('stationId', query.stationId);
    if (query?.search) params.append('search', query.search);
    params.append('limit', String(query?.limit || 100));
    const qs = params.toString();
    const res = await request<any>(`/catalogue/dishes${qs ? `?${qs}` : ''}`);
    return Array.isArray(res) ? res : res?.data || [];
  },

  getDishDetail: (id: string) =>
    request<any>(`/catalogue/dishes/${id}`),

  createDish: (dto: any) =>
    request<any>('/catalogue/dishes', {
      method: 'POST',
      body: JSON.stringify(dto),
    }),

  updateDish: (id: string, dto: any) =>
    request<any>(`/catalogue/dishes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(dto),
    }),

  activateDish: (id: string) =>
    request<any>(`/catalogue/dishes/${id}/activate`, { method: 'POST' }),

  deactivateDish: (id: string) =>
    request<any>(`/catalogue/dishes/${id}/deactivate`, { method: 'POST' }),

  getOptionGroups: async (): Promise<any[]> => {
    const res = await request<any>('/catalogue/option-groups');
    return Array.isArray(res) ? res : res?.data || [];
  },

  createOptionGroup: (dto: any) =>
    request<any>('/catalogue/option-groups', {
      method: 'POST',
      body: JSON.stringify(dto),
    }),

  updateOptionGroup: (id: string, dto: any) =>
    request<any>(`/catalogue/option-groups/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(dto),
    }),

  activateOptionGroup: (id: string) =>
    request<any>(`/catalogue/option-groups/${id}/activate`, { method: 'POST' }),

  deactivateOptionGroup: (id: string) =>
    request<any>(`/catalogue/option-groups/${id}/deactivate`, { method: 'POST' }),

  getOptions: async (): Promise<any[]> => {
    const res = await request<any>('/catalogue/options');
    return Array.isArray(res) ? res : res?.data || [];
  },

  createOption: (dto: any) =>
    request<any>('/catalogue/options', {
      method: 'POST',
      body: JSON.stringify(dto),
    }),

  updateOption: (id: string, dto: any) =>
    request<any>(`/catalogue/options/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(dto),
    }),

  activateOption: (id: string) =>
    request<any>(`/catalogue/options/${id}/activate`, { method: 'POST' }),

  deactivateOption: (id: string) =>
    request<any>(`/catalogue/options/${id}/deactivate`, { method: 'POST' }),

  getKitchenStations: () =>
    request<any[]>('/catalogue/stations'),

  getAllergens: () =>
    request<any[]>('/catalogue/allergens'),

  getDietaryTags: () =>
    request<any[]>('/catalogue/dietary-tags'),

  getPackagingTypes: () =>
    request<any[]>('/catalogue/packaging-types'),

  getMenuCategories: (includeSecret: boolean = true) =>
    request<any[]>(`/menu/categories?includeSecret=${includeSecret}`),

  createCategory: (dto: any) =>
    request<any>('/menu/categories', {
      method: 'POST',
      body: JSON.stringify(dto),
    }),

  updateCategory: (id: string, dto: any) =>
    request<any>(`/menu/categories/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(dto),
    }),

  addDishToCategory: (categoryId: string, dto: { dishId: string; displayOrder?: number }) =>
    request<any>(`/menu/categories/${categoryId}/dishes`, {
      method: 'POST',
      body: JSON.stringify(dto),
    }),

  removeDishFromCategory: (categoryId: string, dishId: string) =>
    request<any>(`/menu/categories/${categoryId}/dishes/${dishId}`, {
      method: 'DELETE',
    }),

  toggleMenuItemActive: (categoryId: string, dishId: string, isActive: boolean) =>
    request<any>(`/menu/categories/${categoryId}/dishes/${dishId}/toggle`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive }),
    }),

  getCompanyVisibility: (companyId: string) =>
    request<any>(`/menu/company-visibility/${companyId}`),

  setCompanyHiddenCategory: (companyId: string, categoryId: string, hide: boolean) =>
    request<any>(`/menu/company-visibility/${companyId}/category/${categoryId}`, {
      method: 'POST',
      body: JSON.stringify({ hide }),
    }),

  setCompanyHiddenDish: (companyId: string, dishId: string, hide: boolean) =>
    request<any>(`/menu/company-visibility/${companyId}/dish/${dishId}`, {
      method: 'POST',
      body: JSON.stringify({ hide }),
    }),

  getMenuPreview: (employeeId: string, date?: string) =>
    request<any>(`/menu/preview?employeeId=${employeeId}${date ? `&date=${date}` : ''}`),

  // ---------------------------------------------------------------------------
  // PRICING
  // ---------------------------------------------------------------------------
  getPriceTiers: async (): Promise<any[]> => {
    const res = await request<any>('/pricing/tiers');
    return Array.isArray(res) ? res : res?.data || [];
  },

  getPriceTierMatrix: (id: string) =>
    request<any>(`/pricing/tiers/${id}/matrix`),

  getMissingPricesForTier: (id: string) =>
    request<any>(`/pricing/tiers/${id}/missing-prices`),

  createPriceTier: (dto: any) =>
    request<any>('/pricing/tiers', {
      method: 'POST',
      body: JSON.stringify(dto),
    }),

  updatePriceTier: (id: string, dto: any) =>
    request<any>(`/pricing/tiers/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(dto),
    }),

  setDefaultPriceTier: (id: string) =>
    request<any>(`/pricing/tiers/${id}/set-default`, { method: 'POST' }),

  bulkUpdateDishPrices: (tierId: string, prices: { dishId: string; priceCents: number }[]) =>
    request<any>(`/pricing/tiers/${tierId}/dishes`, {
      method: 'PUT',
      body: JSON.stringify({ prices }),
    }),

  bulkUpdateOptionPrices: (tierId: string, prices: { optionId: string; priceCents: number }[]) =>
    request<any>(`/pricing/tiers/${tierId}/options`, {
      method: 'PUT',
      body: JSON.stringify({ prices }),
    }),

  // ---------------------------------------------------------------------------
  // COMPANIES & EMPLOYEES
  // ---------------------------------------------------------------------------
  getCompanies: async (): Promise<any[]> => {
    const res = await request<any>('/companies');
    const list = Array.isArray(res) ? res : res?.data || [];
    if (!Array.isArray(res) && res?.meta) {
      (list as any).meta = res.meta;
    }
    return list;
  },

  getCompanyDetail: (id: string) =>
    request<any>(`/companies/${id}`),

  createCompany: (dto: any) =>
    request<any>('/companies', {
      method: 'POST',
      body: JSON.stringify(dto),
    }),

  updateCompany: (id: string, dto: any) =>
    request<any>(`/companies/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(dto),
    }),

  addCompanyDomain: (companyId: string, domain: string) =>
    request<any>(`/companies/${companyId}/domains`, {
      method: 'POST',
      body: JSON.stringify({ domain }),
    }),

  removeCompanyDomain: (companyId: string, domainId: string) =>
    request<any>(`/companies/${companyId}/domains/${domainId}`, {
      method: 'DELETE',
    }),

  addCompanyAddress: (companyId: string, dto: any) =>
    request<any>(`/companies/${companyId}/addresses`, {
      method: 'POST',
      body: JSON.stringify(dto),
    }),

  updateCompanyAddress: (companyId: string, addressId: string, dto: any) =>
    request<any>(`/companies/${companyId}/addresses/${addressId}`, {
      method: 'PATCH',
      body: JSON.stringify(dto),
    }),

  removeCompanyAddress: (companyId: string, addressId: string) =>
    request<any>(`/companies/${companyId}/addresses/${addressId}`, {
      method: 'DELETE',
    }),

  updateCompanyWorkingDay: (companyId: string, dto: { dayOfWeek: string; isDeliveryDay: boolean }) =>
    request<any>(`/companies/${companyId}/working-days`, {
      method: 'PUT',
      body: JSON.stringify(dto),
    }),

  addCompanyHoliday: (companyId: string, dto: { name: string; date: string }) =>
    request<any>(`/companies/${companyId}/holidays`, {
      method: 'POST',
      body: JSON.stringify(dto),
    }),

  removeCompanyHoliday: (companyId: string, holidayId: string) =>
    request<any>(`/companies/${companyId}/holidays/${holidayId}`, {
      method: 'DELETE',
    }),

  getEmployees: async (companyId?: string): Promise<any[]> => {
    const res = await request<any>(`/employees${companyId ? `?companyId=${companyId}` : ''}`);
    const list = Array.isArray(res) ? res : res?.data || [];
    if (!Array.isArray(res) && res?.meta) {
      (list as any).meta = res.meta;
    }
    return list;
  },

  createEmployee: (dto: any) =>
    request<any>('/employees', {
      method: 'POST',
      body: JSON.stringify(dto),
    }),

  updateEmployee: (id: string, dto: any) =>
    request<any>(`/employees/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(dto),
    }),

  transferEmployee: (id: string, dto: { targetCompanyId: string; preservePreferences?: boolean }) =>
    request<any>(`/employees/${id}/transfer`, {
      method: 'POST',
      body: JSON.stringify(dto),
    }),

  activateEmployee: (id: string) =>
    request<any>(`/employees/${id}/activate`, { method: 'POST' }),

  deactivateEmployee: (id: string) =>
    request<any>(`/employees/${id}/deactivate`, { method: 'POST' }),

  bulkImportEmployees: (dto: { companyId: string; rows?: any[]; csvText?: string }) =>
    request<any>('/employees/bulk-import', {
      method: 'POST',
      body: JSON.stringify(dto),
    }),

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
