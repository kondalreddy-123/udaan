const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

let authToken = localStorage.getItem('udaan_token') || null;

export function setToken(token) {
  authToken = token;
  if (token) localStorage.setItem('udaan_token', token);
  else localStorage.removeItem('udaan_token');
}

export function getToken() {
  return authToken;
}

async function request(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    ...(options.headers || {})
  };

  try {
    const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.detail?.message || errData.detail || `HTTP ${res.status}`);
    }
    return await res.json();
  } catch (err) {
    // Graceful error propagation
    throw err;
  }
}

export const api = {
  // Auth
  login: (email, password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  demoSwitch: (role) => request('/auth/demo-switch', { method: 'POST', body: JSON.stringify({ role }) }),
  getMe: () => request('/auth/me'),

  // Concepts
  getConcepts: (grade = 8) => request(`/concepts?grade=${grade}`),
  getMastery: () => request('/concepts/mastery'),

  // Questions
  getQuestions: (conceptId = null) => request(`/questions${conceptId ? `?concept_id=${conceptId}` : ''}`),
  createQuestion: (q) => request('/questions', { method: 'POST', body: JSON.stringify(q) }),
  updateQuestion: (id, updates) => request(`/questions/${id}`, { method: 'PUT', body: JSON.stringify(updates) }),
  duplicateQuestion: (id) => request(`/questions/${id}/duplicate`, { method: 'POST' }),
  reportQuestion: (id, report) => request(`/questions/${id}/reports`, { method: 'POST', body: JSON.stringify(report) }),

  // Detective
  startDetective: (caseId = 'case_rational_add') => request(`/detective/start?case_id=${caseId}`, { method: 'POST' }),
  submitPrimary: (optionIndex) => request('/detective/primary', { method: 'POST', body: JSON.stringify({ option_index: optionIndex }) }),
  submitFollowup: (isCorrect) => request('/detective/followup', { method: 'POST', body: JSON.stringify({ is_correct: isCorrect }) }),
  submitReassessment: (optionIndex) => request('/detective/reassessment', { method: 'POST', body: JSON.stringify({ option_index: optionIndex }) }),

  // Attempts & Sync
  syncAttempts: (attempts) => request('/attempts/sync', { method: 'POST', body: JSON.stringify({ attempts }) }),

  // Student Dashboard & Self-Service
  getStudentProfile: () => request('/student/me'),
  getStudentStreak: () => request('/student/streak'),
  getStudentMastery: () => request('/student/mastery'),

  // Teacher Dashboard & Real Student Reports
  getTeacherSummary: (className = 'Class 8 - Section A', chapter = 'Rational Numbers') =>
    request(`/teacher/summary?class_name=${encodeURIComponent(className)}&chapter=${encodeURIComponent(chapter)}`),
  getTeacherStudents: (className = 'Class 8 - Section A') =>
    request(`/teacher/students?class_name=${encodeURIComponent(className)}`),
  getTeacherStudentDetail: (studentId) =>
    request(`/teacher/students/${studentId}`),
  getActionCards: () => request('/teacher/cards'),
  updateActionCard: (id, updates) => request(`/teacher/cards/${id}`, { method: 'PUT', body: JSON.stringify(updates) }),
  getTeacherConfig: () => request('/teacher/config'),
  updateTeacherConfig: (cfg) => request('/teacher/config', { method: 'PUT', body: JSON.stringify(cfg) }),

  // Detective Records & History
  getDiagnosticRecords: (conceptId = null) =>
    request(`/detective/records${conceptId ? `?concept_id=${conceptId}` : ''}`),

  // AI Pedagogical Assistant & Fallback
  getAIExplanation: (payload) =>
    request('/ai/explain', { method: 'POST', body: JSON.stringify(payload) }),

  // Scientific Evaluation
  getEvaluation: (params) => {
    const q = new URLSearchParams(params).toString();
    return request(`/comparison/evaluate?${q}`);
  },
  getDiagnosticEvaluation: () =>
    request('/comparison/diagnostic-evaluation')
};
