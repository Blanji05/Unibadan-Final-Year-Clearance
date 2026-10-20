import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 30000,
  headers: {
    'Bypass-Tunnel-Reminder': 'true',
  },
});

// Attach the JWT to every request.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  config.headers['Bypass-Tunnel-Reminder'] = 'true';
  return config;
});

// Normalise errors so components can just read `error.message`.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && localStorage.getItem('token')) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }

    let message =
      error.response?.data?.message ||
      error.response?.data?.errors?.[0]?.message;

    if (!message) {
      if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        message = 'Request timed out. The server is connecting, please retry in a moment.';
      } else if (!error.response) {
        message = 'Cannot reach the clearance server. Please check your internet connection and try again.';
      } else {
        message = error.message || 'Something went wrong.';
      }
    }

    return Promise.reject(new Error(message));
  }
);

export default api;

// --- System ---
export const systemApi = {
  health: () => api.get('/health').then((r) => r.data.data),
  academicStructure: () => api.get('/system/academic-structure').then((r) => r.data.data.faculties),
};

// --- Auth ---
export const authApi = {
  login: (email, password) => api.post('/auth/login', { email, password }).then((r) => r.data.data),
  me: () => api.get('/auth/me').then((r) => r.data.data),
  forgotPassword: (email) => api.post('/auth/forgot-password', { email }).then((r) => r.data.data),
  resetPassword: (token, password) =>
    api.post('/auth/reset-password', { token, password }).then((r) => r.data.data),
  changeInitialPassword: (password, token = null) => {
    const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};
    return api.post('/auth/change-initial-password', { password }, config).then((r) => r.data.data);
  },
};

// --- Student ---
export const studentApi = {
  clearanceStatus: () => api.get('/student/clearance-status').then((r) => r.data.data),
  documents: () => api.get('/student/documents').then((r) => r.data.data.documents),
  documentsByStage: () => api.get('/student/documents/by-stage').then((r) => r.data.data.stages),
  documentTypes: () => api.get('/student/document-types').then((r) => r.data.data.document_types),
  // What the section officers currently ask for, de-duplicated across stages.
  requirements: () => api.get('/student/requirements').then((r) => r.data.data.requirements),
  upload: (formData) =>
    api.post('/student/documents', formData).then((r) => r.data.data.document),
  replaceDocument: (id, formData) =>
    api.put(`/student/documents/${id}`, formData).then((r) => r.data.data.document),
  deleteDocument: (id) => api.delete(`/student/documents/${id}`).then((r) => r.data.data),
  submitStage: (stageId, documentIds, remarks, formResponses = null) =>
    api
      .post(`/student/submit/${stageId}`, {
        document_ids: documentIds,
        remarks,
        form_responses: formResponses,
      })
      .then((r) => r.data.data),
  pay: (stageId) => api.post(`/student/pay/${stageId}`).then((r) => r.data.data),
  payments: () => api.get('/student/payments').then((r) => r.data.data.payments),
  cancelPayment: (paymentId) => api.delete(`/student/payments/${paymentId}`).then((r) => r.data.data),
  // PDF receipt as a Blob (auth header required, so it cannot be a plain link).
  receipt: (paymentId) =>
    api.get(`/student/payments/${paymentId}/receipt`, { responseType: 'blob' }).then((r) => r.data),
  timeline: () => api.get('/student/timeline').then((r) => r.data.data),
  certificate: () => api.get('/student/certificate').then((r) => r.data.data),
  profile: () => api.get('/student/profile').then((r) => r.data.data),
  updateProfile: (payload) => api.put('/student/profile', payload).then((r) => r.data.data),
  uploadPassport: (formData) => api.post('/student/profile/passport', formData).then((r) => r.data.data),
  clearanceSlip: (stageId) =>
    api.get(`/student/stages/${stageId}/slip`, { responseType: 'blob' }).then((r) => r.data),
  stageForm: (stageId) => api.get(`/student/stages/${stageId}/form`).then((r) => r.data.data.fields),
  saveStageForm: (stageId, responses) =>
    api.post(`/student/stages/${stageId}/form`, { responses }).then((r) => r.data.data),
};

// --- Payment ---
export const paymentApi = {
  verify: (reference) => api.get(`/payment/verify/${reference}`).then((r) => r.data.data),
};

// --- Notifications ---
// The inbox is channel "in_app"; pass "email"/"sms" to inspect delivery rows.
export const notificationsApi = {
  list: (channel) =>
    api.get('/notifications', { params: channel ? { channel } : {} }).then((r) => r.data.data),
  markRead: (id) => api.patch(`/notifications/${id}/read`).then((r) => r.data.data),
  markAllRead: () => api.patch('/notifications/read-all').then((r) => r.data.data),
};

// --- Officer ---
export const officerApi = {
  profile: () => api.get('/officer/profile').then((r) => r.data.data),
  updateProfile: (payload) => api.put('/officer/profile', payload).then((r) => r.data.data),
  uploadSignature: (formData) => api.post('/officer/signature', formData).then((r) => r.data.data),
  saveSignatureDrawing: (signature_data) => api.post('/officer/signature-drawing', { signature_data }).then((r) => r.data.data),
  studentSlip: (studentId, stageId) =>
    api.get(`/officer/students/${studentId}/stages/${stageId}/slip`, { responseType: 'blob' }).then((r) => r.data),
  pending: (params) => api.get('/officer/pending-requests', { params }).then((r) => r.data.data),
  history: (params) => api.get('/officer/history', { params }).then((r) => r.data.data),
  directory: (params) => api.get('/officer/directory', { params }).then((r) => r.data.data.officers),
  searchStudents: (params) => api.get('/officer/students/search', { params }).then((r) => r.data.data.students),
  studentClearance: (studentId) => api.get(`/officer/students/${studentId}/clearance`).then((r) => r.data.data),
  review: (studentId, stageId, decision, remarks) =>
    api.patch(`/officer/review/${studentId}/${stageId}`, { decision, remarks }).then((r) => r.data.data),
  revokeApproval: (studentId, stageId, remarks) =>
    api.post(`/officer/students/${studentId}/stages/${stageId}/revoke`, { remarks }).then((r) => r.data.data),
  sendMessage: (studentId, payload) =>
    api.post(`/officer/students/${studentId}/message`, payload).then((r) => r.data.data),
  reviewBulk: (studentIds, decision, remarks) =>
    api.post('/officer/review-bulk', { student_ids: studentIds, decision, remarks }).then((r) => r.data.data),
  // Document checklist for the officer's own section.
  requirements: () => api.get('/officer/requirements').then((r) => r.data.data),
  addRequirement: (documentTypeId, isMandatory) =>
    api
      .post('/officer/requirements', { document_type_id: documentTypeId, is_mandatory: isMandatory })
      .then((r) => r.data.data),
  removeRequirement: (documentTypeId) =>
    api.delete(`/officer/requirements/${documentTypeId}`).then((r) => r.data.data),
  createDocumentType: (payload) =>
    api.post('/officer/document-types', payload).then((r) => r.data.data),
  // Section custom clearance form builder
  formFields: () => api.get('/officer/form-fields').then((r) => r.data.data),
  addFormField: (payload) => api.post('/officer/form-fields', payload).then((r) => r.data.data),
  updateFormField: (fieldId, payload) => api.put(`/officer/form-fields/${fieldId}`, payload).then((r) => r.data.data),
  deleteFormField: (fieldId) => api.delete(`/officer/form-fields/${fieldId}`).then((r) => r.data.data),
};

// --- Admin ---
export const adminApi = {
  students: (params) => api.get('/admin/students', { params }).then((r) => r.data.data.students),
  users: (params) => api.get('/admin/users', { params }).then((r) => r.data.data.users),
  analytics: () => api.get('/admin/analytics').then((r) => r.data.data),
  stages: () => api.get('/admin/stages').then((r) => r.data.data.stages),
  activity: (limit = 20) =>
    api.get('/admin/activity', { params: { limit } }).then((r) => r.data.data.activity),

  // Sections (clearance stages)
  sections: () => api.get('/admin/sections').then((r) => r.data.data.sections),
  createSection: (payload) => api.post('/admin/sections', payload).then((r) => r.data.data),
  updateSection: (stageId, payload) =>
    api.patch(`/admin/sections/${stageId}`, payload).then((r) => r.data.data),
  setSectionStatus: (stageId, isActive) =>
    api.patch(`/admin/sections/${stageId}/status`, { is_active: isActive }).then((r) => r.data.data),
  deleteSection: (stageId) => api.delete(`/admin/sections/${stageId}`).then((r) => r.data.data),
  reorderSections: (order) => api.patch('/admin/sections/reorder', { order }).then((r) => r.data.data),
  setPrerequisites: (stageId, prerequisiteIds) =>
    api
      .put(`/admin/sections/${stageId}/prerequisites`, { prerequisite_ids: prerequisiteIds })
      .then((r) => r.data.data),

  // Students
  student: (studentId) => api.get(`/admin/students/${studentId}`).then((r) => r.data.data.student),
  createStudent: (payload) => api.post('/admin/students', payload).then((r) => r.data.data),
  importStudents: (csv) => api.post('/admin/students/import', { csv }).then((r) => r.data.data),
  updateStudent: (studentId, payload) =>
    api.patch(`/admin/students/${studentId}`, payload).then((r) => r.data.data),
  deleteStudent: (studentId) => api.delete(`/admin/students/${studentId}`).then((r) => r.data.data),
  deleteAllStudents: () => api.delete('/admin/students').then((r) => r.data.data),

  // Accounts
  createOfficer: (payload) => api.post('/admin/officers', payload).then((r) => r.data.data),
  setUserStatus: (userId, isActive) =>
    api.patch(`/admin/users/${userId}/status`, { is_active: isActive }).then((r) => r.data.data),
  setOfficerSection: (userId, payload) =>
    api.patch(`/admin/users/${userId}/section`, typeof payload === 'string' ? { section_code: payload } : payload).then((r) => r.data.data),
  resetPassword: (userId, password) =>
    api.post(`/admin/users/${userId}/reset-password`, { password }).then((r) => r.data.data),
  studentClearance: (studentId) =>
    api.get(`/admin/students/${studentId}/clearance`).then((r) => r.data.data.stages),
  resetPassword: (userId, password) =>
    api.post(`/admin/users/${userId}/reset-password`, { password }).then((r) => r.data.data),
  studentClearance: (studentId) =>
    api.get(`/admin/students/${studentId}/clearance`).then((r) => r.data.data.stages),
  override: (studentId, stageId, status, remarks) =>
    api.patch(`/admin/override/${studentId}/${stageId}`, { status, remarks }).then((r) => r.data.data),
  generateCertificate: (studentId) =>
    api.post(`/admin/generate-certificate/${studentId}`).then((r) => r.data.data.certificate),

  // Reports, deadline and reminders
  exportCsv: (kind) => api.get(`/admin/export/${kind}.csv`, { responseType: 'blob' }).then((r) => r.data),
  settings: () => api.get('/admin/settings').then((r) => r.data.data),
  setDeadline: (deadline) => api.put('/admin/settings/deadline', { deadline }).then((r) => r.data.data),
  sendReminders: () => api.post('/admin/send-reminders').then((r) => r.data.data),
};
