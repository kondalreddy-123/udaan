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
      // If 401 Unauthorized, token may be revoked or expired
      if (res.status === 401 && authToken) {
        // Clear revoked token
        setToken(null);
      }
      throw new Error(_errorMessage(errData, res.status));
    }
    return await res.json();
  } catch (err) {
    throw err;
  }
}

function _errorMessage(errData, status) {
  const detail = errData?.detail;
  if (typeof detail === 'string') return detail;
  if (detail && typeof detail.message === 'string') return detail.message;
  // FastAPI validation errors arrive as a list of {loc, msg, type}.
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => (item && typeof item.msg === 'string' ? item.msg : null))
      .filter(Boolean);
    if (messages.length) return messages.join(' ');
  }
  if (errData?.message && typeof errData.message === 'string') return errData.message;
  return `HTTP ${status}`;
}

async function uploadRequest(endpoint, formData) {
  const headers = authToken ? { Authorization: `Bearer ${authToken}` } : {};
  const res = await fetch(`${API_BASE}${endpoint}`, { method: 'POST', body: formData, headers });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    if (res.status === 401 && authToken) setToken(null);
    throw new Error(_errorMessage(errData, res.status));
  }
  return res.json();
}

export const api = {
  // Auth & Roles
  registerStudent: (data) =>
    request('/auth/register/student', { method: 'POST', body: JSON.stringify(data) }),
  login: (email, password) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () =>
    request('/auth/logout', { method: 'POST' }),
  demoSwitch: (role) =>
    request('/auth/demo-switch', { method: 'POST', body: JSON.stringify({ role }) }),
  getMe: () =>
    request('/auth/me'),
  bootstrapAdmin: (data) =>
    request('/auth/bootstrap-admin', { method: 'POST', body: JSON.stringify(data) }),

  // Administrator Management
  getAdminTeachers: () =>
    request('/admin/teachers'),
  createTeacher: (data) =>
    request('/admin/teachers', { method: 'POST', body: JSON.stringify(data) }),
  updateTeacherStatus: (id, isActive) =>
    request(`/admin/teachers/${id}/status`, { method: 'PATCH', body: JSON.stringify({ is_active: isActive }) }),
  getAdminUsers: (role = null) =>
    request(`/admin/users${role ? `?role=${role}` : ''}`),

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
    request('/comparison/diagnostic-evaluation'),

  // --- Phase 3: Parent onboarding, invitations & guardian links ---
  validateParentInvitation: (code) =>
    request('/parent/invitations/validate', { method: 'POST', body: JSON.stringify({ code }) }),
  registerParentWithInvitation: (data) =>
    request('/parent/onboarding/register', { method: 'POST', body: JSON.stringify(data) }),
  getParentMe: () => request('/parent/me'),
  getParentLinks: () => request('/parent/links'),
  updateParentProfile: (data) =>
    request('/parent/profile', { method: 'PUT', body: JSON.stringify(data) }),
  getParentChildOverview: (studentId) => request(`/parent/children/${studentId}`),

  createParentInvitation: (data = {}) =>
    request('/student/parent-invitation', { method: 'POST', body: JSON.stringify(data) }),
  getParentInvitations: () => request('/student/parent-invitations'),
  revokeParentInvitation: (id) =>
    request(`/student/parent-invitations/${id}`, { method: 'DELETE' }),

  teacherAddParent: (studentId, data) =>
    request(`/teacher/students/${studentId}/parents`, { method: 'POST', body: JSON.stringify(data) }),
  getTeacherParentLinks: (status = null, className = null) => {
    const params = new URLSearchParams();
    if (status) params.set('status_filter', status);
    if (className) params.set('class_name', className);
    const q = params.toString();
    return request(`/teacher/parent-links${q ? `?${q}` : ''}`);
  },
  getTeacherPendingParents: () => request('/teacher/parents/pending'),
  verifyParentLink: (linkId, notes = '') =>
    request(`/teacher/parents/${linkId}/verify`, { method: 'POST', body: JSON.stringify({ notes }) }),
  rejectParentLink: (linkId, notes = '') =>
    request(`/teacher/parents/${linkId}/reject`, { method: 'POST', body: JSON.stringify({ notes }) }),
  revokeParentLink: (linkId, notes = '') =>
    request(`/teacher/parents/${linkId}/revoke`, { method: 'POST', body: JSON.stringify({ notes }) }),
  reissueParentInvitation: (linkId) =>
    request(`/teacher/parents/${linkId}/reissue-invitation`, { method: 'POST' }),

  // --- Phase 4: Parent notifications ---
  getParentNotifications: (unreadOnly = false) =>
    request(`/parent/notifications${unreadOnly ? '?unread_only=true' : ''}`),
  markParentNotificationRead: (id) =>
    request(`/parent/notifications/${id}/read`, { method: 'POST' }),
  markAllParentNotificationsRead: () =>
    request('/parent/notifications/read-all', { method: 'POST' }),
  getParentNotificationPreferences: () => request('/parent/notification-preferences'),
  updateParentNotificationPreferences: (data) =>
    request('/parent/notification-preferences', { method: 'PUT', body: JSON.stringify(data) }),

  // --- Phase 4: Parent <-> teacher messaging ---
  getParentMessages: () => request('/parent/messages'),
  getParentMessage: (id) => request(`/parent/messages/${id}`),
  createParentMessage: (data) =>
    request('/parent/messages', { method: 'POST', body: JSON.stringify(data) }),
  replyParentMessage: (id, data) =>
    request(`/parent/messages/${id}/reply`, { method: 'POST', body: JSON.stringify(data) }),
  getTeacherMessages: (status = null, unreadOnly = false, studentId = null) => {
    const params = new URLSearchParams();
    if (status) params.set('status_filter', status);
    if (unreadOnly) params.set('unread_only', 'true');
    if (studentId) params.set('student_id', String(studentId));
    const q = params.toString();
    return request(`/teacher/messages${q ? `?${q}` : ''}`);
  },
  getTeacherMessage: (id) => request(`/teacher/messages/${id}`),
  startTeacherMessage: (data) =>
    request('/teacher/messages', { method: 'POST', body: JSON.stringify(data) }),
  getTeacherUnreadCount: (studentId = null) =>
    request(`/teacher/messages/unread-count${studentId ? `?student_id=${studentId}` : ''}`),
  getChildAssignedTeacher: (studentId) => request(`/parent/children/${studentId}/teacher`),
  replyTeacherMessage: (id, data) =>
    request(`/teacher/messages/${id}/reply`, { method: 'POST', body: JSON.stringify(data) }),
  resolveTeacherMessage: (id, data = {}) =>
    request(`/teacher/messages/${id}/resolve`, { method: 'POST', body: JSON.stringify(data) }),

  // --- Phase 5: ParentConnect verified contacts & weekly reports ---
  getParentConnectContact: () => request('/parent-connect/contact'),
  registerParentConnectContact: (data) =>
    request('/parent-connect/contact', { method: 'POST', body: JSON.stringify(data) }),
  resendParentConnectOtp: () =>
    request('/parent-connect/contact/resend', { method: 'POST' }),
  verifyParentConnectContact: (otp) =>
    request('/parent-connect/contact/verify', { method: 'POST', body: JSON.stringify({ otp }) }),
  getParentConnectPreferences: () => request('/parent-connect/preferences'),
  updateParentConnectPreferences: (data) =>
    request('/parent-connect/preferences', { method: 'PUT', body: JSON.stringify(data) }),
  getParentConnectStatus: () => request('/parent-connect/status'),
  // Phase 5 student bridge: manage a verified parent link's weekly reports.
  getStudentParentConnectOverview: () => request('/parent-connect/student/overview'),
  registerStudentParentConnectContact: (data) =>
    request('/parent-connect/student/contact', { method: 'POST', body: JSON.stringify(data) }),
  resendStudentParentConnectOtp: (parentId) =>
    request('/parent-connect/student/contact/resend', {
      method: 'POST',
      body: JSON.stringify({ parent_id: parentId })
    }),
  verifyStudentParentConnectContact: (parentId, otp) =>
    request('/parent-connect/student/contact/verify', {
      method: 'POST',
      body: JSON.stringify({ parent_id: parentId, otp })
    }),
  updateStudentParentConnectPreferences: (data) =>
    request('/parent-connect/student/preferences', { method: 'PUT', body: JSON.stringify(data) }),
  getWeeklyReports: (studentId = null, limit = 20) => {
    const params = new URLSearchParams();
    if (studentId) params.set('student_id', String(studentId));
    if (limit) params.set('limit', String(limit));
    const q = params.toString();
    return request(`/parent-connect/reports${q ? `?${q}` : ''}`);
  },
  getWeeklyReport: (id) => request(`/parent-connect/reports/${id}`),
  generateWeeklyReport: (data) =>
    request('/parent-connect/reports/generate', { method: 'POST', body: JSON.stringify(data) }),
  resendWeeklyReport: (id) =>
    request(`/parent-connect/reports/${id}/resend`, { method: 'POST' }),
  revokeWeeklyReportLink: (id) =>
    request(`/parent-connect/reports/${id}/revoke-link`, { method: 'POST' }),
  rotateWeeklyReportLink: (id) =>
    request(`/parent-connect/reports/${id}/rotate-link`, { method: 'POST' }),
  getPublicWeeklyReport: (token) =>
    request(`/parent-connect/public/reports/${encodeURIComponent(token)}`),

  // --- Phase 5: Parent self-registration & OTP verification ---
  registerParent: (data) =>
    request('/auth/register/parent', { method: 'POST', body: JSON.stringify(data) }),
  verifyParentOtp: (data) =>
    request('/auth/parent/verify-otp', { method: 'POST', body: JSON.stringify(data) }),
  resendParentOtp: (email) =>
    request('/auth/parent/resend-otp', { method: 'POST', body: JSON.stringify({ email }) }),
  forgotParentPassword: (email) =>
    request('/auth/parent/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
  resetParentPassword: (data) =>
    request('/auth/parent/reset-password', { method: 'POST', body: JSON.stringify(data) }),

  // --- Phase 5: Parent-student connection (self-service code flow) ---
  connectStudentByCode: (code, relationship_type = 'parent') =>
    request('/parent/connect-student', {
      method: 'POST',
      body: JSON.stringify({ invitation_code: code, relationship_type })
    }),
  disconnectStudent: (student_id) =>
    request(`/parent/children/${student_id}/disconnect`, { method: 'POST' }),

  // --- Phase 5: Student-side parent connection management ---
  getStudentParentConnections: () =>
    request('/student/parent-connections'),
  approveParentConnection: (link_id) =>
    request(`/student/parent-connections/${link_id}/approve`, { method: 'POST' }),
  rejectParentConnection: (link_id) =>
    request(`/student/parent-connections/${link_id}/reject`, { method: 'POST' }),
  revokeParentConnection: (link_id) =>
    request(`/student/parent-connections/${link_id}/revoke`, { method: 'POST' }),

  // --- Phase 5: Manual test report delivery ---
  sendTestReport: (student_id) =>
    request(
      `/parent-connect/reports/send-test${student_id ? `?student_id=${encodeURIComponent(student_id)}` : ''}`,
      { method: 'POST' }
    ),

  // --- Phase 5: Secure email change with OTP ---
  requestParentEmailChange: (new_email) =>
    request('/parent-connect/email/request-change', { method: 'POST', body: JSON.stringify({ new_email }) }),
  verifyParentEmailChange: (otp) =>
    request('/parent-connect/email/verify-change', { method: 'POST', body: JSON.stringify({ otp }) }),

  // -----------------------------------------------------------------------
  // OTP-based parent access revocation (Part 3)
  // -----------------------------------------------------------------------
  requestParentRevocation: (link_id) =>
    request(`/student/parent-connections/${link_id}/request-revocation`, { method: 'POST' }),
  getRevocationStatus: (link_id) =>
    request(`/student/parent-connections/${link_id}/revocation-status`),
  confirmParentRevocation: (link_id, otp) =>
    request('/parent/revoke-confirm', { method: 'POST', body: JSON.stringify({ link_id, otp }) }),

  // -----------------------------------------------------------------------
  // Parent: connected child overview (Part 5)
  // -----------------------------------------------------------------------
  getParentMyChild: () => request('/parent/my-child'),

  // -----------------------------------------------------------------------
  // Teacher student search (Part 4)
  // -----------------------------------------------------------------------
  searchTeacherStudents: (params = {}) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v !== null && v !== undefined && v !== '') q.set(k, String(v)); });
    return request(`/teacher/students/search${q.toString() ? `?${q}` : ''}`);
  },

  // -----------------------------------------------------------------------
  // Student teacher search (Part 6)
  // -----------------------------------------------------------------------
  searchStudentTeachers: (q = '') =>
    request(`/student/teachers/search${q ? `?q=${encodeURIComponent(q)}` : ''}`),

  // -----------------------------------------------------------------------
  // AI Course & Engagement Orchestrator (teacher)
  // -----------------------------------------------------------------------
  uploadCourseMaterial: (formData) => uploadRequest('/course/materials/upload', formData),
  getCourseMaterials: (className = null) =>
    request(`/course/materials${className ? `?class_name=${encodeURIComponent(className)}` : ''}`),
  getCoursePlans: (className = null, status = null) => {
    const params = new URLSearchParams();
    if (className) params.set('class_name', className);
    if (status) params.set('status_filter', status);
    const q = params.toString();
    return request(`/course/plans${q ? `?${q}` : ''}`);
  },
  getCoursePlan: (id) => request(`/course/plans/${id}`),
  updateCoursePlan: (id, data) =>
    request(`/course/plans/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  updateCourseLesson: (planId, lessonId, data) =>
    request(`/course/plans/${planId}/lessons/${lessonId}`, { method: 'PUT', body: JSON.stringify(data) }),
  reorderCourseLessons: (planId, lessonIds) =>
    request(`/course/plans/${planId}/lessons/reorder`, { method: 'POST', body: JSON.stringify({ lesson_ids: lessonIds }) }),
  approveCoursePlan: (id) => request(`/course/plans/${id}/approve`, { method: 'POST' }),
  publishCoursePlan: (id) => request(`/course/plans/${id}/publish`, { method: 'POST' }),
  searchCourseRag: (query, className = null) => {
    const params = new URLSearchParams({ query });
    if (className) params.set('class_name', className);
    return request(`/course/rag/search?${params.toString()}`);
  },
  getCourseEngagementOverview: (className = null) =>
    request(`/course/engagement/overview${className ? `?class_name=${encodeURIComponent(className)}` : ''}`),
  scanCourseEngagement: (className = null) => {
    const params = new URLSearchParams({ enforce_quiet_hours: 'true' });
    if (className) params.set('class_name', className);
    return request(`/course/engagement/scan?${params.toString()}`, { method: 'POST' });
  },
  resolveEngagementAlert: (id, note = '') =>
    request(`/course/engagement/alerts/${id}/resolve`, { method: 'POST', body: JSON.stringify({ note }) }),
  getCourseInterventions: (className = null, status = null) => {
    const params = new URLSearchParams();
    if (className) params.set('class_name', className);
    if (status) params.set('status_filter', status);
    const q = params.toString();
    return request(`/course/interventions${q ? `?${q}` : ''}`);
  },
  scanCourseInterventions: (className = null) =>
    request(`/course/interventions/scan${className ? `?class_name=${encodeURIComponent(className)}` : ''}`, { method: 'POST' }),
  approveCourseIntervention: (id) => request(`/course/interventions/${id}/approve`, { method: 'POST' }),
  dismissCourseIntervention: (id) => request(`/course/interventions/${id}/dismiss`, { method: 'POST' }),
  getCourseWeeklyReport: (className = null) =>
    request(`/course/reports/weekly${className ? `?class_name=${encodeURIComponent(className)}` : ''}`),
  getCourseWorksheet: (misconception = 'num_den_separate', className = null) => {
    const params = new URLSearchParams({ misconception });
    if (className) params.set('class_name', className);
    return request(`/course/reports/worksheet?${params.toString()}`);
  },

  // -----------------------------------------------------------------------
  // AI Course & Engagement Orchestrator (student)
  // -----------------------------------------------------------------------
  getStudentLearningPlan: () => request('/student/learning-plan'),
  recordLearningEvent: (assignmentId, data) =>
    request(`/student/learning-plan/assignments/${assignmentId}/event`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getLearningAssistantNotifications: () => request('/student/notifications'),
  markLearningNotificationRead: (id) =>
    request(`/student/notifications/${id}/read`, { method: 'POST' }),
  snoozeLearningNotification: (id, hours = 24) =>
    request(`/student/notifications/${id}/snooze`, { method: 'POST', body: JSON.stringify({ hours }) }),
  completeStudentIntervention: (id, score = null) =>
    request(`/student/interventions/${id}/complete`, {
      method: 'POST',
      body: JSON.stringify(score === null ? {} : { score }),
    }),
};
