import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://class26lasu.onrender.com/api/v1';

// Public client — no auth headers, used for endpoints that should work for everyone
const publicClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Authenticated client — attaches JWT token
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add JWT token
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor: if a 401 is returned, clear stale token and retry once without auth
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      localStorage.removeItem('auth_token');
      delete originalRequest.headers.Authorization;
      return axios(originalRequest);
    }
    return Promise.reject(error);
  }
);

export const authService = {
  async login(credentials: any) {
    const response = await apiClient.post('/auth/login', credentials);
    return response.data;
  },
  async register(userData: any) {
    const response = await apiClient.post('/auth/register', userData);
    return response.data;
  },
  async getProfile() {
    const response = await apiClient.get('/users/profile');
    return response.data;
  },
  async getGoogleAuthUrl() {
    const response = await apiClient.get('/auth/google/url');
    return response.data;
  }
};

export const memoryService = {
  async getMemories(params?: { faculty?: string; limit?: number; skip?: number }) {
    // Public endpoint — no auth required, use public client so stale tokens can't break viewing
    const response = await publicClient.get('/memories', { params });
    return response.data;
  },

  async uploadMemory(formData: FormData, onUploadProgress?: (progressEvent: any) => void) {
    const response = await apiClient.post('/memories/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress,
    });
    return response.data;
  },

  async getMemoryById(id: string) {
    // Public endpoint — viewable without auth
    const response = await publicClient.get(`/memories/${id}`);
    return response.data;
  },

  async getComments(id: string) {
    // Public endpoint — comments viewable without auth
    const response = await publicClient.get(`/memories/${id}/comments`);
    return response.data;
  },

  async getStats() {
    // Public endpoint
    const response = await publicClient.get('/stats');
    return response.data;
  },

  async likeMemory(id: string) {
    // Allow anonymous likes — use public client
    const response = await publicClient.post(`/memories/${id}/like`);
    return response.data;
  },

  async addComment(id: string, content: string) {
    const response = await apiClient.post(`/memories/${id}/comments`, { content });
    return response.data;
  },
  async requestDeletion(data: { memoryId: string; reason: string; memoryUrl?: string; memoryCaption?: string; authorName?: string; userId?: string }) {
    const response = await apiClient.post('/deletion-requests', data);
    return response.data;
  }
};

export const eventService = {
  async getEvents() {
    const response = await apiClient.get('/events');
    return response.data;
  },
  async rsvp(eventId: number, rsvpData: any) {
    const response = await apiClient.post(`/events/${eventId}/rsvp`, rsvpData);
    return response.data;
  }
};

export const messageService = {
  async getMessages() {
    const response = await apiClient.get('/messages');
    return response.data;
  },
  async postMessage(messageData: { text: string; authorName?: string }) {
    const response = await apiClient.post('/messages', messageData);
    return response.data;
  }
};

export const adminService = {
  async getPendingMemories() {
    const response = await apiClient.get('/admin/memories/pending');
    return response.data;
  },
  async approveMemory(id: number) {
    const response = await apiClient.post(`/admin/memories/${id}/approve`);
    return response.data;
  },
  async deleteMemory(id: number) {
    const response = await apiClient.delete(`/admin/memories/${id}`);
    return response.data;
  },
  async getDeletionRequests() {
    const response = await apiClient.get('/admin/deletion-requests');
    return response.data;
  },
  async processDeletionRequest(requestId: string, action: 'delete' | 'dismiss') {
    const response = await apiClient.post(`/admin/deletion-requests/${requestId}/process`, { action });
    return response.data;
  },
  async getDashboardData() {
    const response = await apiClient.get('/admin/dashboard');
    return response.data;
  },
  async getAdminUsers() {
    const response = await apiClient.get('/admin/users');
    return response.data;
  },
  async getAdminPhotos() {
    const response = await apiClient.get('/admin/photos');
    return response.data;
  },
  async deleteAdminPhoto(id: number) {
    const response = await apiClient.delete(`/admin/photos/${id}`);
    return response.data;
  }
};

export default apiClient;
