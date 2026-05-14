import axios from 'axios';

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5000/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor — attach token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('flexcart_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Helper — redirect admin to login and clear stale tokens
const redirectToAdminLogin = () => {
  localStorage.removeItem('flexcart_token');
  localStorage.removeItem('flexcart_refresh_token');
  if (window.location.pathname.startsWith('/admin')) {
    window.location.replace('/admin/login');
  }
};

// Response interceptor — token refresh + global 401 handling
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const status = error.response?.status;
    const code   = error.response?.data?.code;

    // Attempt silent token refresh on TOKEN_EXPIRED
    if (status === 401 && code === 'TOKEN_EXPIRED' && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const refreshToken = localStorage.getItem('flexcart_refresh_token');
        if (refreshToken) {
          const response = await axios.post(
            `${process.env.REACT_APP_API_URL || 'http://localhost:5000/api'}/auth/refresh-token`,
            { refreshToken }
          );
          if (response.data.success) {
            const { accessToken, refreshToken: newRefreshToken } = response.data.data;
            localStorage.setItem('flexcart_token', accessToken);
            localStorage.setItem('flexcart_refresh_token', newRefreshToken);
            originalRequest.headers.Authorization = `Bearer ${accessToken}`;
            return api(originalRequest);
          }
        }
      } catch {
        redirectToAdminLogin();
        return Promise.reject(error);
      }
      // Refresh returned non-success
      redirectToAdminLogin();
      return Promise.reject(error);
    }

    // Any 401 on admin API calls means session is gone — go to login
    if (status === 401 && !originalRequest._retry) {
      const isAdminCall = originalRequest.url?.includes('/staff-admin') ||
                          originalRequest.url?.includes('/super-admin');
      if (isAdminCall) {
        redirectToAdminLogin();
      }
    }

    return Promise.reject(error);
  }
);

export default api;