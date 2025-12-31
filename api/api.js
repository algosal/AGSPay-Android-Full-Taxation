import axios from 'axios';

const api = axios.create({
  baseURL: 'https://qbww95j856.execute-api.us-east-2.amazonaws.com/s1',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach JWT automatically
api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
