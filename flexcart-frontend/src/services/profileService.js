import api from './api';

const profileService = {
  getProfile: () => api.get('/profile'),
  updateProfile: (formData) => api.put('/profile', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  uploadProfileImage: (formData) => api.post('/profile/upload-image', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
};

export default profileService;