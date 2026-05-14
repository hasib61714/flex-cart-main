import api from './api';

const aiService = {
  processImage: (formData) => api.post('/ai/process', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  getSearchHistory: () => api.get('/ai/history')
};

export default aiService;