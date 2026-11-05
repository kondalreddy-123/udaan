import React, { useState, useEffect } from 'react';
import ClassroomObservatory from './ClassroomObservatory';
import TeacherMessages from './TeacherMessages';
import AiCourseCenter from './AiCourseCenter';
import { api } from '../services/api';

export default function TeacherDashboard({
  cards,
  cfg,
  onUpdateCfg,
  onCardStatus,
  onCardEdit,
  onOpenTour,
  lang = 'en',
  t
}) {
  const tr = (key) => (typeof t === 'function' ? t(key) : key);
  const [selectedClass, setSelectedClass] = useState('Class 8 - Section A');
  const [selectedChapter, setSelectedChapter] = useState('Rational Numbers');
  const [viewMode, setViewMode] = useState('overview'); // 'overview' | 'cards' | 'observatory' | 'interventions' | 'parents' | 'messages' | 'ai'
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [generatedWorksheet, setGeneratedWorksheet] = useState(null);
  const [messagesUnread, setMessagesUnread] = useState(0);

  // Live Data States from API
  const [summary, setSummary] = useState(null);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedStudentDetail, setSelectedStudentDetail] = useState(null);
  const [loadingStudentDetail, setLoadingStudentDetail] = useState(false);

  // Student Search (Part 4)
  const [studentSearchQ, setStudentSearchQ] = useState('');
  const [studentSearchFilters, setStudentSearchFilters] = useState({
    class_name: '',
    needs_attention: null,
    is_active: null,
    sort_by: 'name'
  });
  const [studentSearchResults, setStudentSearchResults] = useState([]);
  const [studentSearchTotal, setStudentSearchTotal] = useState(0);
  const [studentSearchPage, setStudentSearchPage] = useState(1);
  const [studentSearchTotalPages, setStudentSearchTotalPages] = useState(1);
  const [studentSearchLoading, setStudentSearchLoading] = useState(false);

  // Phase 3: parent-student relationship management
  const [parentLinks, setParentLinks] = useState([]);
  const [parentLinksLoading, setParentLinksLoading] = useState(false);
  const [parentNotice, setParentNotice] = useState('');
  const [parentError, setParentError] = useState('');
  const [reissuedCode, setReissuedCode] = useState(null);
  const [parentSetupCode, setParentSetupCode] = useState(null);
  const [showParentForm, setShowParentForm] = useState(false);
  const [parentFormError, setParentFormError] = useState('');
  const [parentForm, setParentForm] = useState({
    parent_name: '',
    phone_number: '',
    email: '',
    password: '',
    preferred_language: 'te',
    relationship_type: 'parent',
    contact_method: 'school_record',
  });

  // Load summary and students from API
  const loadTeacherData = async () => {
    try {
      setLoading(true);
      const [sumData, studentList] = await Promise.all([
        api.getTeacherSummary(selectedClass, selectedChapter).catch(() => null),
        api.getTeacherStudents(selectedClass).catch(() => [])
      ]);
      if (sumData) setSummary(sumData);
      if (studentList && studentList.length > 0) setStudents(studentList);
    } catch (err) {
      // Offline fallback: keep current view
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTeacherData();
  }, [selectedClass, selectedChapter]);

  // Keep the dashboard's parent-message badge current even when the teacher
  // has not opened the Messages view yet.
  useEffect(() => {
    let cancelled = false;
    const refreshUnread = async () => {
      try {
        const data = await api.getTeacherUnreadCount();
        if (!cancelled) setMessagesUnread(Number(data?.unread_messages || 0) + Number(data?.unread_notifications || 0));
      } catch (_) {
        // non-fatal
      }
    };
    refreshUnread();
    const timer = window.setInterval(refreshUnread, 30000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  // Phase 3: load parent links for authorized students only (backend-scoped).
  const loadParentLinks = async () => {
    try {
      setParentLinksLoading(true);
      setParentError('');
      const links = await api.getTeacherParentLinks(null, selectedClass === 'All Classes' ? null : selectedClass);
      setParentLinks(Array.isArray(links) ? links : []);
    } catch (err) {
      setParentError(err.message || 'Could not load parent links.');
    } finally {
      setParentLinksLoading(false);
    }
  };

  useEffect(() => {
    if (viewMode === 'parents') loadParentLinks();
  }, [viewMode, selectedClass]);

  const runLinkAction = async (action, link, successMessage) => {
    setParentNotice('');
    setParentError('');
    try {
      setParentLinksLoading(true);
      await action(link.id);
      setParentNotice(successMessage);
      await loadParentLinks();
    } catch (err) {
      setParentError(err.message || 'The action could not be completed.');
    } finally {
      setParentLinksLoading(false);
    }
  };

  const handleReissueParentInvitation = async (link) => {
    setParentNotice('');
    setParentError('');
    setReissuedCode(null);
    try {
      setParentLinksLoading(true);
      const res = await api.reissueParentInvitation(link.id);
      setReissuedCode({ linkId: link.id, ...res });
      setParentNotice('A new single-use invitation code was created. Share it privately with the parent.');
      await loadParentLinks();
    } catch (err) {
      setParentError(err.message || 'Could not reissue an invitation.');
    } finally {
      setParentLinksLoading(false);
    }
  };

  const handleAddParent = async (event) => {
    event.preventDefault();
    if (!selectedStudentDetail) return;
    setParentFormError('');
    setParentNotice('');
    setParentSetupCode(null);
    try {
      setParentLinksLoading(true);
      const res = await api.teacherAddParent(selectedStudentDetail.student_id, {
        parent_name: parentForm.parent_name.trim(),
        email: parentForm.email.trim() || null,
        phone_number: parentForm.phone_number.trim() || null,
        password: parentForm.password.trim() || null,
        preferred_language: parentForm.preferred_language,
        relationship_type: parentForm.relationship_type,
        contact_method: parentForm.contact_method,
      });
      if (res && res.setup_code) {
        setParentSetupCode(res);
        setParentNotice('Parent registered and relationship verified in person. Give the setup code below to the parent so they can choose their own sign-in details.');
      } else {
        setParentNotice('Parent registered and relationship verified in person.');
      }
      setShowParentForm(false);
      setParentForm({ parent_name: '', phone_number: '', email: '', password: '', preferred_language: 'te', relationship_type: 'parent', contact_method: 'school_record' });
      await loadParentLinks();
    } catch (err) {
      setParentFormError(err.message || 'Could not register this parent.');
    } finally {
      setParentLinksLoading(false);
    }
  };

  // Load deep dive detail for an individual student
  const handleTeacherStudentSearch = async (overrideParams = {}) => {
    setStudentSearchLoading(true);
    try {
      const q = overrideParams.q !== undefined ? overrideParams.q : studentSearchQ;
      const filters = overrideParams.filters !== undefined ? overrideParams.filters : studentSearchFilters;
      const page = overrideParams.page !== undefined ? overrideParams.page : studentSearchPage;

      const params = {
        q: q || undefined,
        class_name: filters.class_name || undefined,
        needs_attention: filters.needs_attention !== null ? filters.needs_attention : undefined,
        is_active: filters.is_active !== null ? filters.is_active : undefined,
        sort_by: filters.sort_by || 'name',
        page: page,
        page_size: 12
      };
      const res = await api.searchTeacherStudents(params);
      setStudentSearchResults(res.results || []);
      setStudentSearchTotal(res.total || 0);
      setStudentSearchTotalPages(res.total_pages || 1);
      setStudentSearchPage(res.page || 1);
    } catch (_) {
      setStudentSearchResults([]);
      setStudentSearchTotal(0);
    } finally {
      setStudentSearchLoading(false);
    }
  };

  const handleSelectStudent = async (studentId) => {
    try {
      setLoadingStudentDetail(true);
      const detail = await api.getTeacherStudentDetail(studentId);
      setSelectedStudentDetail(detail);
    } catch (err) {
      // Offline fallback
    } finally {
      setLoadingStudentDetail(false);
    }
  };

  const handleGeneratePracticeWorksheet = (topicName) => {
    setGeneratedWorksheet({
      topic: topicName || 'Adding Unlike Fractions (LCM)',
      class: selectedClass,
      date: new Date().toLocaleDateString(),
      problems: [
        '1. Evaluate: (-3/4) + (1/2) = [       ]  (Hint: Find LCM of 4 and 2)',
        '2. Evaluate: (-5/6) + (1/3) = [       ]  (Hint: Convert 1/3 to 2/6)',
        '3. Evaluate: (2/5) + (-3/10) = [       ] (Hint: Convert 2/5 to 4/10)',
        '4. Evaluate: (-1/2) + (-1/4) = [       ] (Challenge: Both terms are negative)',
        '5. Reassessment Check: (-2/3) + (1/6) = [       ] (Verify recovery)'
      ]
    });
  };

  // Derive concepts and misconceptions from live summary or fallback
  const conceptsData = summary?.concepts ?? [
    { concept_id: 'c5', title_en: 'Adding rationals (unlike denominators)', average_mastery: 0.38, average_mastery_pct: 38, struggling_percent: 62, status_label: 'Needs Intervention' },
    { concept_id: 'c4', title_en: 'Comparing rational numbers', average_mastery: 0.53, average_mastery_pct: 53, struggling_percent: 47, status_label: 'Building' },
    { concept_id: 'c2', title_en: 'LCM & common denominators', average_mastery: 0.64, average_mastery_pct: 64, struggling_percent: 36, status_label: 'Building' },
    { concept_id: 'c3', title_en: 'Rational number meaning (p/q)', average_mastery: 0.74, average_mastery_pct: 74, struggling_percent: 26, status_label: 'Secure' }
  ];

  const recurringMisconceptions = summary?.recurring_misconceptions ?? [
    { tag: 'num_den_separate', name: 'Added numerators & denominators separately', prevalence_percent: 38, student_count: 5, sample_label: 'Class 8 cohort (n=15)' },
    { tag: 'ignored_negative', name: 'Ignored negative sign during LCM conversion', prevalence_percent: 18, student_count: 3, sample_label: 'Class 8 cohort (n=15)' },
    { tag: 'sign_slip', name: 'Sign slip in final integer addition', prevalence_percent: 12, student_count: 2, sample_label: 'Class 8 cohort (n=15)' }
  ];

  const supportPriorities = summary?.support_priorities ?? [
    { priority: 'HIGH', concept: 'Adding rationals with unlike denominators', issue: '62% of students struggling (avg mastery 38%)', recommended_action: 'Conduct a targeted 15-minute visual demonstration on Adding Rationals using tactile fraction strips and number lines.' },
    { priority: 'MEDIUM', concept: 'Comparing rational numbers', issue: '47% of students struggling (avg mastery 53%)', recommended_action: 'Provide directed signed number line practice.' }
  ];

  return (
    <div>
      {/* TEACHER ONBOARDING QUICKSTART BANNER */}
      {showOnboarding && (
        <div
          className="card"
          style={{
            background: 'linear-gradient(135deg, rgba(0, 242, 254, 0.08) 0%, rgba(138, 75, 255, 0.08) 100%)',
            border: '1.5px solid rgba(0, 242, 254, 0.35)',
            padding: '20px 24px',
            position: 'relative'
          }}
        >
          <div className="row spaced">
            <div className="row" style={{ gap: '14px' }}>
              <span style={{ fontSize: '2rem' }}>🎓</span>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#00f2fe' }}>
                  Teacher Intelligence Command Center · Active Pedagogical Navigator
                </h3>
                <p className="mu" style={{ margin: '4px 0 0', fontSize: '0.88rem' }}>
                  Real-time aggregation from genuine student attempts. UDAAN functions as a learning detective to identify recurring conceptual gaps and empower teacher intervention.
                </p>
              </div>
            </div>
            <button
              className="sec"
              onClick={() => setShowOnboarding(false)}
              style={{ fontSize: '0.8rem', padding: '4px 8px' }}
            >
              ✕ Dismiss
            </button>
          </div>
        </div>
      )}

      {/* CLASS & CHAPTER CONTROL BAR */}
      <div className="card" style={{ marginTop: '16px' }}>
        <div className="row spaced" style={{ flexWrap: 'wrap', gap: '14px' }}>
          <div>
            <span className="tag purple">CLASSROOM ANALYTICS</span>
            <h2 style={{ margin: '4px 0', fontSize: '1.45rem' }}>
              Class Performance & Root-Cause Misconception Observatory
            </h2>
            <div className="row" style={{ gap: '8px', marginTop: '4px' }}>
              <span className="tag good">{summary?.total_students || students.length || 15} Enrolled Students</span>
              <span className="tag">{summary?.active_students || 12} Active Recently</span>
              <span className="tag warn">{summary?.students_requiring_attention || 4} Need Attention</span>
              <span className="tag purple">Cohort Avg: {summary?.class_average_mastery_pct || 52}%</span>
            </div>
          </div>

          <div className="row" style={{ gap: '12px' }}>
            <div>
              <label className="mu" style={{ fontSize: '0.75rem', display: 'block', marginBottom: '2px' }}>
                Select Classroom:
              </label>
              <select
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
                style={{ padding: '8px 12px', background: '#0b0d13', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', borderRadius: '8px' }}
              >
                <option>Class 8 - Section A</option>
                <option>Class 8 - Section B</option>
                <option>All Classes</option>
              </select>
            </div>
            <div>
              <label className="mu" style={{ fontSize: '0.75rem', display: 'block', marginBottom: '2px' }}>
                Select Curriculum Chapter:
              </label>
              <select
                value={selectedChapter}
                onChange={(e) => setSelectedChapter(e.target.value)}
                style={{ padding: '8px 12px', background: '#0b0d13', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', borderRadius: '8px' }}
              >
                <option>Rational Numbers</option>
                <option>Linear Equations (Preview)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Cohort Overview Grid */}
        <div className="grid" style={{ marginTop: '20px' }}>
          {/* Concept Mastery Breakdown */}
          <div>
            <h3 style={{ fontSize: '1.15rem' }}>
              Cohort Concept Mastery (n={summary?.total_students || 15})
            </h3>
            {conceptsData.map((c) => {
              const val = c.average_mastery_pct;
              const color = val < 45 ? '#f43f5e' : (val < 70 ? '#fb923c' : '#10b981');
              return (
                <div key={c.concept_id} style={{ margin: '10px 0' }}>
                  <div className="row spaced" style={{ fontSize: '0.88rem' }}>
                    <span>{c.title_en}</span>
                    <span className="mu">
                      {val}% · <b style={{ color }}>{c.status_label}</b>
                    </span>
                  </div>
                  <div className="bar" style={{ height: '8px' }}>
                    <i style={{ width: `${val}%`, background: color }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Recurring Misconceptions Table */}
          <div>
            <h3 style={{ fontSize: '1.15rem' }}>
              Recurring Misconceptions (n={summary?.total_students || 15})
            </h3>
            <table>
              <thead>
                <tr>
                  <th>Misconception Pattern</th>
                  <th>Prevalence</th>
                  <th>Students Affected</th>
                </tr>
              </thead>
              <tbody>
                {recurringMisconceptions.map((m) => (
                  <tr key={m.tag}>
                    <td><b>{m.name}</b></td>
                    <td>
                      <span className={`tag ${m.prevalence_percent >= 30 ? 'danger' : (m.prevalence_percent >= 15 ? 'warn' : '')}`}>
                        {m.prevalence_percent}%
                      </span>
                    </td>
                    <td><b>{m.student_count} students</b></td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Top Intervention Priority Callout */}
            {supportPriorities.length > 0 && (
              <div
                style={{
                  background: 'rgba(0, 242, 254, 0.06)',
                  border: '1px solid rgba(0, 242, 254, 0.25)',
                  padding: '12px 14px',
                  borderRadius: '12px',
                  marginTop: '12px',
                  fontSize: '0.86rem',
                  lineHeight: '1.4'
                }}
              >
                <b style={{ color: '#00f2fe' }}>Intervention Priority:</b> {supportPriorities[0].recommended_action}
              </div>
            )}
          </div>
        </div>

        {/* Configurable Adaptive Pacing & Intervention Thresholds */}
        <h3 style={{ marginTop: '28px', fontSize: '1.2rem' }}>
          Configurable Adaptive Pacing & Intervention Thresholds
        </h3>
        <p className="mu" style={{ fontSize: '0.86rem', margin: '4px 0 16px' }}>
          Adjusting these parameters directly updates mastery tiers, difficulty stepping, and teacher alerts across all students in real time.
        </p>

        <div className="grid">
          <label>
            Foundational Tier Threshold (&lt; %): <b style={{ color: '#fb923c' }}>{cfg.pacingFoundation || 40}%</b>
            <input
              type="range"
              min="25"
              max="55"
              value={cfg.pacingFoundation || 40}
              onChange={(e) => onUpdateCfg({ ...cfg, pacingFoundation: +e.target.value })}
            />
          </label>

          <label>
            Guided Practice Tier Threshold (%): <b style={{ color: '#00f2fe' }}>{cfg.pacingGuided || 70}%</b>
            <input
              type="range"
              min="50"
              max="80"
              value={cfg.pacingGuided || 70}
              onChange={(e) => onUpdateCfg({ ...cfg, pacingGuided: +e.target.value })}
            />
          </label>

          <label>
            Independent Practice Threshold (%): <b style={{ color: '#a855f7' }}>{cfg.pacingIndependent || 85}%</b>
            <input
              type="range"
              min="75"
              max="95"
              value={cfg.pacingIndependent || 85}
              onChange={(e) => onUpdateCfg({ ...cfg, pacingIndependent: +e.target.value })}
            />
          </label>

          <label>
            Advance to harder questions after streak: <b style={{ color: '#10b981' }}>{cfg.up} correct</b>
            <input
              type="range"
              min="1"
              max="5"
              value={cfg.up}
              onChange={(e) => onUpdateCfg({ ...cfg, up: +e.target.value })}
            />
          </label>
        </div>
      </div>

      {/* SUB-TABS: STUDENT OVERVIEW | ACTION CARDS | OBSERVATORY | INTERVENTIONS */}
      <div className="row spaced" style={{ margin: '24px 0 16px', flexWrap: 'wrap', gap: '10px' }}>
        <div className="row" style={{ gap: '8px', flexWrap: 'wrap' }}>
          <button
            className={viewMode === 'overview' ? 'pri' : 'sec'}
            onClick={() => setViewMode('overview')}
          >
            👥 Student Overview ({students.length})
          </button>
          <button
            className={viewMode === 'search' ? 'pri' : 'sec'}
            onClick={() => {
              setViewMode('search');
              if (studentSearchResults.length === 0) handleTeacherStudentSearch();
            }}
          >
            🔍 Student Search & Recommendations
          </button>
          <button
            className={viewMode === 'cards' ? 'pri' : 'sec'}
            onClick={() => setViewMode('cards')}
          >
            📋 Action Cards ({cards.length})
          </button>
          <button
            className={viewMode === 'observatory' ? 'pri' : 'sec'}
            onClick={() => setViewMode('observatory')}
          >
            🔭 Classroom Observatory
          </button>
          <button
            className={viewMode === 'interventions' ? 'pri' : 'sec'}
            onClick={() => setViewMode('interventions')}
          >
            🚨 Priority Interventions ({students.filter(s => s.needs_attention).length})
          </button>
          <button
            className={viewMode === 'parents' ? 'pri' : 'sec'}
            onClick={() => setViewMode('parents')}
          >
            👨‍👩‍👧 Parent Links
          </button>
          <button
            className={viewMode === 'messages' ? 'pri' : 'sec'}
            onClick={() => setViewMode('messages')}
          >
            ✉️ {tr('messagesTitle')}{messagesUnread ? ` (${messagesUnread})` : ''}
          </button>
          <button
            className={viewMode === 'ai' ? 'pri' : 'sec'}
            onClick={() => setViewMode('ai')}
          >
            🤖 AI Course & Engagement
          </button>
        </div>

        <div className="row" style={{ gap: '8px' }}>
          <button
            className="sec"
            onClick={() => handleGeneratePracticeWorksheet('Adding Unlike Fractions (LCM)')}
          >
            📄 Generate Practice Worksheet
          </button>
          <button onClick={onOpenTour}>▶ Guided Tour</button>
        </div>
      </div>

      {/* PART 4: STUDENT SEARCH & MANAGEMENT VIEW */}
      {viewMode === 'search' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Search Header Card */}
          <div className="card" style={{ border: '1px solid rgba(139,92,246,0.35)', background: 'linear-gradient(135deg, rgba(15,23,42,0.95), rgba(30,27,75,0.75))' }}>
            <div style={{ marginBottom: '16px' }}>
              <span className="tag purple" style={{ letterSpacing: '0.08em' }}>TEACHER DASHBOARD · STUDENT SEARCH</span>
              <h3 style={{ margin: '8px 0 4px', fontSize: '1.25rem', color: '#f8fafc', fontWeight: 800 }}>
                🔍 Student Search & Academic Analytics
              </h3>
              <p className="mu" style={{ margin: 0, fontSize: '0.86rem', color: '#94a3b8' }}>
                Search enrolled students by name, ID, class, section, or learning status. View real-time mastery analytics and next recommended actions.
              </p>
            </div>

            {/* Search Input Bar with Icon and Clear Button */}
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '14px' }}>
              <div style={{ position: 'relative', flex: '1 1 320px' }}>
                <input
                  type="text"
                  value={studentSearchQ}
                  onChange={(e) => {
                    setStudentSearchQ(e.target.value);
                    handleTeacherStudentSearch({ q: e.target.value, page: 1 });
                  }}
                  placeholder="Search students by name, student ID, class or section..."
                  style={{
                    width: '100%', padding: '11px 16px 11px 40px', fontSize: '0.92rem',
                    background: 'rgba(15,23,42,0.9)', border: '1px solid rgba(139,92,246,0.4)',
                    borderRadius: '10px', color: '#f8fafc', outline: 'none', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.3)'
                  }}
                />
                <span style={{ position: 'absolute', left: '14px', top: '11px', color: '#a78bfa', fontSize: '1rem' }}>🔍</span>
                {studentSearchQ && (
                  <button
                    type="button"
                    onClick={() => {
                      setStudentSearchQ('');
                      handleTeacherStudentSearch({ q: '', page: 1 });
                    }}
                    style={{ position: 'absolute', right: '12px', top: '10px', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1rem' }}
                  >✕</button>
                )}
              </div>
              <button
                type="button"
                className="pri"
                onClick={() => handleTeacherStudentSearch({ page: 1 })}
                disabled={studentSearchLoading}
                style={{ padding: '10px 20px', fontSize: '0.9rem', fontWeight: 700 }}
              >
                {studentSearchLoading ? 'Searching…' : 'Search'}
              </button>
            </div>

            {/* Filter Dropdowns */}
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', padding: '12px 14px', borderRadius: '10px', background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(148,163,184,0.15)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 600 }}>Attention:</span>
                <select
                  value={studentSearchFilters.needs_attention === null ? '' : String(studentSearchFilters.needs_attention)}
                  onChange={(e) => {
                    const val = e.target.value === '' ? null : e.target.value === 'true';
                    const newF = { ...studentSearchFilters, needs_attention: val };
                    setStudentSearchFilters(newF);
                    handleTeacherStudentSearch({ filters: newF, page: 1 });
                  }}
                  style={{ padding: '6px 10px', fontSize: '0.8rem', background: '#1e293b', border: '1px solid #475569', borderRadius: '6px', color: '#f1f5f9' }}
                >
                  <option value="">All Students</option>
                  <option value="true">🚨 Needs Attention</option>
                  <option value="false">✓ On Track</option>
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 600 }}>Activity:</span>
                <select
                  value={studentSearchFilters.is_active === null ? '' : String(studentSearchFilters.is_active)}
                  onChange={(e) => {
                    const val = e.target.value === '' ? null : e.target.value === 'true';
                    const newF = { ...studentSearchFilters, is_active: val };
                    setStudentSearchFilters(newF);
                    handleTeacherStudentSearch({ filters: newF, page: 1 });
                  }}
                  style={{ padding: '6px 10px', fontSize: '0.8rem', background: '#1e293b', border: '1px solid #475569', borderRadius: '6px', color: '#f1f5f9' }}
                >
                  <option value="">All Statuses</option>
                  <option value="true">🟢 Active Recently (&lt;14d)</option>
                  <option value="false">⚪ Inactive (&gt;14d)</option>
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 600 }}>Sort By:</span>
                <select
                  value={studentSearchFilters.sort_by}
                  onChange={(e) => {
                    const newF = { ...studentSearchFilters, sort_by: e.target.value };
                    setStudentSearchFilters(newF);
                    handleTeacherStudentSearch({ filters: newF, page: 1 });
                  }}
                  style={{ padding: '6px 10px', fontSize: '0.8rem', background: '#1e293b', border: '1px solid #475569', borderRadius: '6px', color: '#f1f5f9' }}
                >
                  <option value="name">Student Name (A–Z)</option>
                  <option value="accuracy_desc">Highest Accuracy</option>
                  <option value="accuracy_asc">Lowest Accuracy</option>
                  <option value="mastery_desc">Highest Learning Progress</option>
                  <option value="mastery_asc">Lowest Learning Progress</option>
                  <option value="last_active">Recently Active</option>
                </select>
              </div>

              <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: '#a78bfa', fontWeight: 600 }}>
                {studentSearchTotal} student{studentSearchTotal === 1 ? '' : 's'} found
              </span>
            </div>
          </div>

          {/* Teacher Recommendations Section (Part 4.4) */}
          {studentSearchResults.some(s => s.needs_attention) && (
            <div className="card" style={{ border: '1px solid rgba(239,68,68,0.3)', background: 'linear-gradient(135deg, rgba(30,27,75,0.7), rgba(15,23,42,0.9))' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <span style={{ fontSize: '1.2rem' }}>💡</span>
                <h4 style={{ margin: 0, fontSize: '1rem', color: '#fca5a5', fontWeight: 700 }}>
                  Teacher Recommendations & Priority Interventions (Real Learning Data)
                </h4>
              </div>
              <p style={{ margin: '0 0 12px', fontSize: '0.84rem', color: '#94a3b8' }}>
                These students show data-grounded warning signals (low accuracy, repeated mistakes, low topic mastery, or inactivity). Recommended actions are customized per learner.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' }}>
                {studentSearchResults.filter(s => s.needs_attention).slice(0, 4).map(s => (
                  <div key={`rec-${s.id}`} style={{
                    padding: '12px 14px', borderRadius: '10px', background: 'rgba(239,68,68,0.08)',
                    border: '1px solid rgba(239,68,68,0.25)', display: 'flex', flexDirection: 'column', gap: '6px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ color: '#f8fafc', fontSize: '0.9rem' }}>{s.full_name}</strong>
                      <span className="tag warn" style={{ fontSize: '0.66rem' }}>NEEDS HELP</span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {s.attention_reasons.map((r, i) => (
                        <span key={i} style={{ fontSize: '0.7rem', padding: '1px 6px', borderRadius: '4px', background: 'rgba(239,68,68,0.2)', color: '#fca5a5' }}>
                          • {r}
                        </span>
                      ))}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#cbd5e1', marginTop: '4px' }}>
                      <strong>Action:</strong> {s.overall_mastery < 0.45 ? 'Assign tactile visual practice (fraction strips) on denominators.' : s.accuracy_pct < 40 ? 'Conduct a 10-minute 1-on-1 step-by-step sign review.' : 'Re-engage student with foundational refresher questions.'}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSelectStudent(s.id)}
                      style={{ marginTop: '4px', padding: '5px 10px', fontSize: '0.74rem', background: 'rgba(139,92,246,0.2)', border: '1px solid rgba(139,92,246,0.4)', borderRadius: '6px', color: '#c4b5fd', cursor: 'pointer' }}
                    >
                      Open Learning Deep Dive →
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Student Search Results Grid */}
          {studentSearchResults.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>🔍</div>
              <h4 style={{ margin: '0 0 6px', color: '#f1f5f9', fontSize: '1.1rem' }}>
                No students found. Try another name, student ID or class.
              </h4>
              <p className="mu" style={{ fontSize: '0.86rem', maxWidth: '420px', margin: '0 auto 16px' }}>
                Ensure spelling is correct, or clear active filters to view all students in your assigned class.
              </p>
              <button
                type="button"
                className="sec"
                onClick={() => {
                  setStudentSearchQ('');
                  const resetF = { class_name: '', needs_attention: null, is_active: null, sort_by: 'name' };
                  setStudentSearchFilters(resetF);
                  handleTeacherStudentSearch({ q: '', filters: resetF, page: 1 });
                }}
              >
                Clear All Filters
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '14px' }}>
              {studentSearchResults.map((s) => (
                <div
                  key={s.id}
                  className="card"
                  style={{
                    padding: '16px 18px', borderRadius: '14px', margin: 0,
                    border: s.needs_attention ? '1px solid rgba(239,68,68,0.35)' : '1px solid rgba(139,92,246,0.25)',
                    background: 'linear-gradient(135deg, rgba(15,23,42,0.95), rgba(30,41,59,0.7))',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '12px'
                  }}
                >
                  <div>
                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#f8fafc' }}>
                          {s.full_name}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '2px' }}>
                          ID: #{s.id} · {s.class_name || 'Class 8'}
                        </div>
                      </div>
                      <span className={s.needs_attention ? 'tag warn' : 'tag good'} style={{ fontSize: '0.68rem' }}>
                        {s.needs_attention ? 'NEEDS ATTENTION' : 'ON TRACK'}
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div style={{ marginTop: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', marginBottom: '4px' }}>
                        <span style={{ color: '#94a3b8' }}>Learning Progress</span>
                        <strong style={{ color: '#a78bfa' }}>{s.overall_mastery_pct}%</strong>
                      </div>
                      <div style={{ height: '6px', background: 'rgba(255,255,255,0.08)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', width: `${s.overall_mastery_pct}%`,
                          background: s.overall_mastery >= 0.7 ? '#10b981' : s.overall_mastery >= 0.4 ? '#f59e0b' : '#ef4444',
                          borderRadius: '3px'
                        }} />
                      </div>
                    </div>

                    {/* Stats Metrics */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', marginTop: '12px', textAlign: 'center' }}>
                      <div style={{ padding: '6px', borderRadius: '8px', background: 'rgba(15,23,42,0.7)', border: '1px solid rgba(148,163,184,0.1)' }}>
                        <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>Accuracy</div>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: s.accuracy_pct >= 60 ? '#10b981' : '#f87171' }}>
                          {s.accuracy_pct}%
                        </div>
                      </div>
                      <div style={{ padding: '6px', borderRadius: '8px', background: 'rgba(15,23,42,0.7)', border: '1px solid rgba(148,163,184,0.1)' }}>
                        <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>Mastery Band</div>
                        <div style={{ fontWeight: 700, fontSize: '0.74rem', color: '#cbd5e1', marginTop: '2px' }}>
                          {s.bkt_band}
                        </div>
                      </div>
                      <div style={{ padding: '6px', borderRadius: '8px', background: 'rgba(15,23,42,0.7)', border: '1px solid rgba(148,163,184,0.1)' }}>
                        <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>Last Active</div>
                        <div style={{ fontWeight: 700, fontSize: '0.72rem', color: s.is_active_recent ? '#10b981' : '#64748b', marginTop: '2px' }}>
                          {s.days_since_active !== null ? (s.days_since_active === 0 ? 'Today' : `${s.days_since_active}d ago`) : 'Never'}
                        </div>
                      </div>
                    </div>

                    {/* Warning flags if any */}
                    {s.attention_reasons && s.attention_reasons.length > 0 && (
                      <div style={{ marginTop: '10px', fontSize: '0.72rem', color: '#fca5a5' }}>
                        ⚠️ {s.attention_reasons.join(' · ')}
                      </div>
                    )}
                  </div>

                  {/* View Student Button */}
                  <button
                    type="button"
                    className="pri"
                    onClick={() => handleSelectStudent(s.id)}
                    style={{
                      width: '100%', padding: '9px 14px', fontSize: '0.84rem', fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                    }}
                  >
                    <span>View Student Performance</span> <span>→</span>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Pagination Controls */}
          {studentSearchTotalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', marginTop: '10px' }}>
              <button
                type="button"
                className="sec"
                disabled={studentSearchPage <= 1 || studentSearchLoading}
                onClick={() => handleTeacherStudentSearch({ page: studentSearchPage - 1 })}
                style={{ padding: '6px 14px', fontSize: '0.82rem' }}
              >
                ← Previous
              </button>
              <span style={{ fontSize: '0.84rem', color: '#94a3b8' }}>
                Page <strong>{studentSearchPage}</strong> of <strong>{studentSearchTotalPages}</strong> ({studentSearchTotal} students)
              </span>
              <button
                type="button"
                className="sec"
                disabled={studentSearchPage >= studentSearchTotalPages || studentSearchLoading}
                onClick={() => handleTeacherStudentSearch({ page: studentSearchPage + 1 })}
                style={{ padding: '6px 14px', fontSize: '0.82rem' }}
              >
                Next →
              </button>
            </div>
          )}
        </div>
      )}

      {/* VIEW 1: STUDENT OVERVIEW & INDIVIDUAL PORTFOLIOS */}
      {viewMode === 'overview' && (
        <div className="card">
          <div className="row spaced" style={{ marginBottom: 12 }}>
            <div>
              <h3>Class 8-A Student Mastery & Divergent Learning Paths</h3>
              <p className="mu" style={{ margin: 0, fontSize: '0.86rem' }}>
                Real-time tracking of individual students, mastery levels, active divergent paths, and pedagogical recommendations.
                Click on any student to open their comprehensive diagnostic portfolio.
              </p>
            </div>
            <span className="tag good">{students.length} Students Active</span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Student Name</th>
                  <th>Mastery & BKT Band</th>
                  <th>Active Tier</th>
                  <th>Recent Misconceptions</th>
                  <th>Status</th>
                  <th>Action Recommendation</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <b>{s.full_name}</b>
                      <div className="mu" style={{ fontSize: '0.75rem' }}>{s.email}</div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 800, color: s.overall_mastery < 0.45 ? '#fb923c' : (s.overall_mastery < 0.70 ? '#00f2fe' : '#10b981') }}>
                        {Math.round(s.overall_mastery * 100)}%
                      </div>
                      <div className="mu" style={{ fontSize: '0.74rem' }}>{s.bkt_band}</div>
                    </td>
                    <td>
                      <span className="tag purple">{s.active_tier}</span>
                    </td>
                    <td>
                      {s.recent_misconceptions && s.recent_misconceptions.length > 0 ? (
                        s.recent_misconceptions.map((m, idx) => (
                          <div key={idx} className="tag warn" style={{ margin: '2px 0', fontSize: '0.74rem' }}>
                            {m}
                          </div>
                        ))
                      ) : (
                        <span className="mu" style={{ fontSize: '0.78rem' }}>None observed</span>
                      )}
                    </td>
                    <td>
                      <span className={`tag ${s.needs_attention ? 'danger' : 'good'}`}>
                        {s.needs_attention ? 'Needs Help ⚠️' : 'On Track ✓'}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.82rem', color: '#cbd5e1', maxWidth: '240px' }}>
                      {s.recommended_action}
                    </td>
                    <td>
                      <button
                        className="sec"
                        onClick={() => handleSelectStudent(s.id)}
                        style={{ padding: '4px 8px', fontSize: '0.78rem', whiteSpace: 'nowrap' }}
                      >
                        🔍 View Profile
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* INDIVIDUAL STUDENT DETAIL MODAL / DRAWER */}
      {selectedStudentDetail && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.8)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: '800px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              background: '#0d1117',
              border: '1.5px solid #00f2fe',
              boxShadow: '0 0 35px rgba(0, 242, 254, 0.3)'
            }}
          >
            <div className="row spaced" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '12px' }}>
              <div>
                <span className="tag good">STUDENT LEARNING PORTFOLIO</span>
                <h2 style={{ margin: '4px 0', fontSize: '1.4rem' }}>{selectedStudentDetail.full_name}</h2>
                <span className="mu" style={{ fontSize: '0.84rem' }}>{selectedStudentDetail.email} · {selectedStudentDetail.class_name}</span>
              </div>
              <div className="row" style={{ gap: '8px' }}>
                <button
                  className="pri"
                  onClick={() => { setShowParentForm((prev) => !prev); setParentFormError(''); }}
                  style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                >
                  👨‍👩‍👧 Add Parent
                </button>
                <button className="sec" onClick={() => setSelectedStudentDetail(null)} style={{ padding: '4px 10px' }}>
                  ✕ Close
                </button>
              </div>
            </div>

            {showParentForm && (
              <form onSubmit={handleAddParent} style={{ marginTop: '14px', padding: '14px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.07)', border: '1px solid rgba(16, 185, 129, 0.4)' }}>
                <h4 style={{ margin: '0 0 4px', color: '#6ee7b7' }}>Teacher-assisted parent registration</h4>
                <p className="mu" style={{ margin: '0 0 10px', fontSize: '0.8rem' }}>
                  Use this when a parent is present at school. Only students in your assigned class are shown.
                  The relationship is marked verified in person. If you leave the password blank, a single-use
                  setup code is created for the parent to choose their own sign-in details. Passwords are never
                  returned or logged.
                </p>
                {parentFormError && (
                  <div role="alert" style={{ marginBottom: '10px', color: '#fecdd3', fontSize: '0.82rem' }}>⚠️ {parentFormError}</div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
                  <label>
                    Parent name *
                    <input required value={parentForm.parent_name} onChange={(e) => setParentForm((p) => ({ ...p, parent_name: e.target.value }))} />
                  </label>
                  <label>
                    Phone number
                    <input value={parentForm.phone_number} onChange={(e) => setParentForm((p) => ({ ...p, phone_number: e.target.value }))} inputMode="tel" />
                  </label>
                  <label>
                    Email (optional)
                    <input type="email" value={parentForm.email} onChange={(e) => setParentForm((p) => ({ ...p, email: e.target.value }))} />
                  </label>
                  <label>
                    Initial password (optional)
                    <input type="password" minLength={6} value={parentForm.password} onChange={(e) => setParentForm((p) => ({ ...p, password: e.target.value }))} placeholder="Leave blank to create a setup code" />
                  </label>
                  <label>
                    Relationship
                    <select value={parentForm.relationship_type} onChange={(e) => setParentForm((p) => ({ ...p, relationship_type: e.target.value }))}>
                      <option value="parent">Parent</option>
                      <option value="mother">Mother</option>
                      <option value="father">Father</option>
                      <option value="guardian">Guardian</option>
                    </select>
                  </label>
                  <label>
                    Preferred language
                    <select value={parentForm.preferred_language} onChange={(e) => setParentForm((p) => ({ ...p, preferred_language: e.target.value }))}>
                      <option value="te">తెలుగు (Telugu)</option>
                      <option value="en">English</option>
                      <option value="hi">हिंदी (Hindi)</option>
                    </select>
                  </label>
                  <label>
                    Contact method
                    <select value={parentForm.contact_method} onChange={(e) => setParentForm((p) => ({ ...p, contact_method: e.target.value }))}>
                      <option value="school_record">School records</option>
                      <option value="in_app">UDAAN app</option>
                      <option value="sms">SMS</option>
                      <option value="whatsapp">WhatsApp</option>
                    </select>
                  </label>
                </div>
                <div className="row" style={{ gap: '8px', marginTop: '12px' }}>
                  <button type="submit" className="pri" disabled={parentLinksLoading}>
                    {parentLinksLoading ? 'Saving…' : '✓ Register & verify parent'}
                  </button>
                  <button type="button" className="sec" onClick={() => setShowParentForm(false)}>Cancel</button>
                </div>
              </form>
            )}

            {/* Parent Messages: full two-way history for this student */}
            <div style={{ marginTop: '18px', paddingTop: '14px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              <h4 style={{ margin: '0 0 6px', color: '#8a4bff' }}>
                💬 Parent Messages
                {selectedStudentDetail.unread_parent_messages > 0 && (
                  <span className="tag warn" style={{ marginLeft: '8px' }}>
                    {selectedStudentDetail.unread_parent_messages} unread
                  </span>
                )}
              </h4>
              <p className="mu" style={{ margin: '0 0 10px', fontSize: '0.82rem' }}>
                Messages from this student's verified parent. Replies are delivered to the parent's UDAAN inbox.
              </p>
              <TeacherMessages
                lang={lang}
                t={t}
                studentId={selectedStudentDetail.student_id}
                embedded
              />
            </div>

            {/* Concept Mastery Breakdown */}
            <h4 style={{ marginTop: '16px', marginBottom: '8px', color: '#00f2fe' }}>Rational Numbers Concept Mastery:</h4>            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
              {selectedStudentDetail.concepts.map((c) => (
                <div key={c.concept_id} style={{ padding: '10px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.84rem' }}>{c.title_en}</div>
                  <div className="row spaced" style={{ marginTop: '6px' }}>
                    <span className="mu" style={{ fontSize: '0.78rem' }}>{c.bkt_band}</span>
                    <b style={{ color: c.mastery_pct < 45 ? '#fb923c' : '#10b981' }}>{c.mastery_pct}%</b>
                  </div>
                  <div className="bar" style={{ height: '4px', marginTop: '4px' }}>
                    <i style={{ width: `${c.mastery_pct}%`, background: c.mastery_pct < 45 ? '#fb923c' : '#10b981' }} />
                  </div>
                </div>
              ))}
            </div>

            {/* Diagnostic Records */}
            <h4 style={{ marginTop: '20px', marginBottom: '8px', color: '#fb923c' }}>Diagnostic Misconception History:</h4>
            {selectedStudentDetail.diagnostics && selectedStudentDetail.diagnostics.length > 0 ? (
              <table>
                <thead>
                  <tr>
                    <th>Original Question</th>
                    <th>Diagnosed Gap</th>
                    <th>Status</th>
                    <th>Outcome</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedStudentDetail.diagnostics.map((d) => (
                    <tr key={d.id}>
                      <td><code>{d.original_question}</code></td>
                      <td><span className="tag warn">{d.suspected_misconception}</span></td>
                      <td>{d.confirmation_status}</td>
                      <td>
                        <span className={`tag ${d.reassessment_result === 'recovered' ? 'good' : 'danger'}`}>
                          {d.reassessment_result}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="mu" style={{ fontStyle: 'italic', fontSize: '0.86rem' }}>No persistent misconceptions recorded for this student.</p>
            )}
          </div>
        </div>
      )}

      {/* VIEW: PARENT-STUDENT RELATIONSHIP VERIFICATION (PHASE 3) */}
      {viewMode === 'parents' && (
        <div className="card">
          <div className="row spaced" style={{ marginBottom: 12, flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <span className="tag purple">GUARDIAN LINKS</span>
              <h3 style={{ margin: '4px 0' }}>Parent & Guardian Verification</h3>
              <p className="mu" style={{ margin: 0, fontSize: '0.86rem', maxWidth: '680px' }}>
                Approve only relationships you have confirmed in person or against school records. Parents see no
                learning information until a link is verified. Revoking removes access immediately.
              </p>
            </div>
            <button className="sec" onClick={loadParentLinks} disabled={parentLinksLoading}>
              {parentLinksLoading ? 'Loading…' : '↻ Refresh'}
            </button>
          </div>

          {parentNotice && (
            <div role="status" style={{ marginBottom: '10px', padding: '9px 12px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid #10b981', color: '#a7f3d0', fontSize: '0.84rem' }}>
              ✓ {parentNotice}
            </div>
          )}
          {parentError && (
            <div role="alert" style={{ marginBottom: '10px', padding: '9px 12px', borderRadius: '8px', background: 'rgba(244, 63, 94, 0.1)', border: '1px solid #f43f5e', color: '#fecdd3', fontSize: '0.84rem' }}>
              ⚠️ {parentError}
            </div>
          )}

          {reissuedCode && (
            <div style={{ marginBottom: '12px', padding: '12px', borderRadius: '10px', background: 'rgba(0, 242, 254, 0.08)', border: '1px solid #00f2fe' }}>
              <div className="mu" style={{ fontSize: '0.8rem' }}>New single-use invitation code (share privately):</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 900, letterSpacing: '0.12em', color: '#67e8f9', margin: '4px 0' }}>
                {reissuedCode.invitation_code}
              </div>
              <div className="mu" style={{ fontSize: '0.76rem' }}>
                Expires {new Date(reissuedCode.expires_at).toLocaleDateString()} · Shown only once
              </div>
            </div>
          )}

          {parentSetupCode && (
            <div role="status" style={{ marginBottom: '12px', padding: '12px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid #10b981' }}>
              <div className="mu" style={{ fontSize: '0.8rem' }}>
                Single-use setup code for {parentSetupCode.parent_name} ({parentSetupCode.student_name}) — share privately:
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 900, letterSpacing: '0.12em', color: '#6ee7b7', margin: '4px 0' }}>
                {parentSetupCode.setup_code}
              </div>
              <div className="mu" style={{ fontSize: '0.76rem' }}>
                Shown only once · The parent uses it once to choose their own email and password. It expires automatically.
              </div>
            </div>
          )}

          {parentLinks.length === 0 ? (
            <p className="mu" style={{ fontSize: '0.9rem' }}>
              {parentLinksLoading ? 'Loading parent links…' : 'No parent links found for your assigned students.'}
            </p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Parent / Guardian</th>
                    <th>Student</th>
                    <th>Relationship</th>
                    <th>Status</th>
                    <th>Method</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {parentLinks.map((link) => {
                    const statusClass = link.status === 'verified' ? 'good' : link.status === 'pending' ? 'warn' : 'danger';
                    return (
                      <tr key={link.id}>
                        <td>
                          <b>{link.parent_name}</b>
                          <div className="mu" style={{ fontSize: '0.75rem' }}>{link.parent_email}</div>
                          {link.parent_phone && <div className="mu" style={{ fontSize: '0.75rem' }}>{link.parent_phone}</div>}
                          {link.parent_preferred_language && <span className="tag" style={{ fontSize: '0.68rem' }}>{link.parent_preferred_language}</span>}
                        </td>
                        <td>
                          <b>{link.student_name}</b>
                          <div className="mu" style={{ fontSize: '0.75rem' }}>{link.student_class}</div>
                        </td>
                        <td style={{ textTransform: 'capitalize' }}>{link.relationship_type}</td>
                        <td>
                          <span className={`tag ${statusClass}`} style={{ textTransform: 'capitalize' }}>{link.status}</span>
                          {link.verified_at && (
                            <div className="mu" style={{ fontSize: '0.72rem' }}>Verified {new Date(link.verified_at).toLocaleDateString()}</div>
                          )}
                        </td>
                        <td style={{ fontSize: '0.78rem', color: '#cbd5e1' }}>{(link.verification_method || '').replace(/_/g, ' ')}</td>
                        <td>
                          <div className="row" style={{ gap: '6px', flexWrap: 'wrap' }}>
                            {link.status === 'pending' && (
                              <>
                                <button
                                  className="pri"
                                  style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                                  onClick={() => runLinkAction((id) => api.verifyParentLink(id), link, `Verified ${link.parent_name} for ${link.student_name}.`)}
                                  disabled={parentLinksLoading}
                                >
                                  ✓ Verify
                                </button>
                                <button
                                  className="sec"
                                  style={{ padding: '4px 8px', fontSize: '0.75rem', color: '#fca5a5', borderColor: '#ef4444' }}
                                  onClick={() => {
                                    const notes = window.prompt('Reason for rejecting this request (optional):') || '';
                                    if (window.confirm(`Reject ${link.parent_name}'s request for ${link.student_name}?`)) {
                                      runLinkAction((id) => api.rejectParentLink(id, notes), link, 'Relationship request rejected.');
                                    }
                                  }}
                                  disabled={parentLinksLoading}
                                >
                                  ✕ Reject
                                </button>
                              </>
                            )}
                            {link.status === 'verified' && (
                              <button
                                className="sec"
                                style={{ padding: '4px 8px', fontSize: '0.75rem', color: '#fca5a5', borderColor: '#ef4444' }}
                                onClick={() => {
                                  const notes = window.prompt('Reason for revoking access (optional):') || '';
                                  if (window.confirm(`Revoke ${link.parent_name}'s access to ${link.student_name}? This takes effect immediately.`)) {
                                    runLinkAction((id) => api.revokeParentLink(id, notes), link, 'Access revoked. The parent can no longer see this student.');
                                  }
                                }}
                                disabled={parentLinksLoading}
                              >
                                ⛔ Revoke
                              </button>
                            )}
                            {link.status !== 'verified' && (
                              <button
                                className="sec"
                                style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                                onClick={() => handleReissueParentInvitation(link)}
                                disabled={parentLinksLoading}
                              >
                                🔁 Reissue code
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* VIEW: PARENT-TEACHER MESSAGES (PHASE 4) */}
      {viewMode === 'messages' && (
        <TeacherMessages lang={lang} t={t} onUnreadChange={setMessagesUnread} />
      )}

      {/* VIEW: AI COURSE & ENGAGEMENT ORCHESTRATOR */}
      {viewMode === 'ai' && (
        <AiCourseCenter lang={lang} className={selectedClass} embedded />
      )}

      {/* VIEW 2: TEACHER ACTION CARDS */}
      {viewMode === 'cards' && (
        <div className="card">
          <div className="row spaced" style={{ marginBottom: 12 }}>
            <div>
              <h3>Teacher Action Cards · Explainable Pedagogical Interventions</h3>
              <p className="mu" style={{ margin: 0, fontSize: '0.86rem' }}>
                Cards automatically generated when a student exhibits persistent difficulty across reassessments. Teachers retain full agency: Accept, Edit, Dismiss, or Complete.
              </p>
            </div>
            <span className="tag warn">{cards.filter(c => c.status === 'pending').length} Pending Review</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {cards.map((c) => (
              <div
                key={c.id}
                style={{
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1.5px solid rgba(251, 146, 60, 0.3)',
                  borderLeft: '5px solid #fb923c',
                  borderRadius: '12px',
                  padding: '16px 20px'
                }}
              >
                <div className="row spaced">
                  <div className="row" style={{ gap: '8px' }}>
                    <span className="tag warn">STUDENT: {c.student_name || c.student}</span>
                    <span className="tag purple">{c.concept_title || c.concept}</span>
                  </div>
                  <span className={`tag ${c.status === 'completed' ? 'good' : (c.status === 'accepted' ? 'tag' : 'warn')}`}>
                    STATUS: {c.status || 'PENDING'}
                  </span>
                </div>

                <div style={{ margin: '10px 0', fontSize: '0.92rem' }}>
                  <b>Observation:</b> {c.observation || c.obs}
                </div>

                <div style={{ fontSize: '0.88rem', color: '#00f2fe', marginBottom: '8px' }}>
                  <b>Suggested Pedagogical Action:</b> {c.suggested_action || c.act}
                </div>

                <div className="row spaced" style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="mu" style={{ fontSize: '0.78rem' }}>
                    Triggering Rule: {c.triggering_rule || c.rule}
                  </div>
                  <div className="row" style={{ gap: '6px' }}>
                    <button
                      className="pri"
                      onClick={() => onCardStatus(c.id, 'accepted')}
                      style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                    >
                      ✓ Accept
                    </button>
                    <button
                      className="sec"
                      onClick={() => {
                        const newAction = prompt('Edit suggested pedagogical action:', c.suggested_action || c.act);
                        if (newAction) onCardEdit(c.id, newAction);
                      }}
                      style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                    >
                      ✏️ Edit
                    </button>
                    <button
                      className="good"
                      onClick={() => onCardStatus(c.id, 'completed')}
                      style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                    >
                      ✓ Complete
                    </button>
                    <button
                      className="sec"
                      onClick={() => onCardStatus(c.id, 'dismissed')}
                      style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                    >
                      ✕ Dismiss
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* VIEW 3: CLASSROOM OBSERVATORY */}
      {viewMode === 'observatory' && (
        <ClassroomObservatory
          cohortData={summary?.concepts?.map(c => ({
            concept: c.title_en,
            mastery: c.average_mastery_pct,
            tier: c.status_label
          }))}
        />
      )}

      {/* VIEW 4: STUDENTS NEEDING INTERVENTION */}
      {viewMode === 'interventions' && (
        <div className="card">
          <div className="row spaced" style={{ marginBottom: 14 }}>
            <div>
              <h3 style={{ color: '#fb7185' }}>🚨 Priority Intervention Roster</h3>
              <p className="mu" style={{ margin: 0, fontSize: '0.86rem' }}>
                Students who have repeatedly exhibited conceptual gaps and require direct teacher scaffolding.
              </p>
            </div>
            <button
              className="pri"
              onClick={() => handleGeneratePracticeWorksheet('Targeted Remedial: Unlike Denominators')}
            >
              📄 Export Remedial Packet
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {students.filter(s => s.needs_attention).map((s) => (
              <div
                key={s.id}
                style={{
                  background: 'rgba(7, 8, 10, 0.75)',
                  borderLeft: '4px solid #f43f5e',
                  borderRadius: '12px',
                  padding: '14px 18px',
                  border: '1px solid rgba(255, 255, 255, 0.06)'
                }}
              >
                <div className="row spaced">
                  <div className="row" style={{ gap: '10px' }}>
                    <b style={{ fontSize: '1rem', color: '#ffffff' }}>{s.full_name}</b>
                    <span className="tag danger">Overall: {Math.round(s.overall_mastery * 100)}%</span>
                    <span className="tag purple">{s.active_tier}</span>
                  </div>
                  <button
                    className="sec"
                    onClick={() => handleSelectStudent(s.id)}
                    style={{ padding: '4px 8px', fontSize: '0.78rem' }}
                  >
                    🔍 Inspect Diagnosis
                  </button>
                </div>
                <div style={{ fontSize: '0.88rem', color: '#cbd5e1', marginTop: '8px' }}>
                  <b>Identified Conceptual Gap:</b> {s.recent_misconceptions?.join(', ') || 'Adding unlike denominators (c5)'}
                </div>
                <div style={{ fontSize: '0.84rem', color: '#00f2fe', marginTop: '4px' }}>
                  <b>Suggested Action:</b> {s.recommended_action}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* GENERATED WORKSHEET MODAL */}
      {generatedWorksheet && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.8)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: '650px',
              width: '100%',
              background: '#ffffff',
              color: '#07080a',
              padding: '28px',
              borderRadius: '12px'
            }}
          >
            <div className="row spaced" style={{ borderBottom: '2px solid #000', paddingBottom: '10px' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.4rem', color: '#000' }}>UDAAN NCERT CLASSROOM WORKSHEET</h2>
                <div style={{ fontSize: '0.88rem', color: '#444' }}>
                  {generatedWorksheet.topic} · {generatedWorksheet.class} · Date: {generatedWorksheet.date}
                </div>
              </div>
              <button
                onClick={() => setGeneratedWorksheet(null)}
                style={{ background: '#eee', color: '#000', border: 'none', padding: '6px 12px', borderRadius: '6px' }}
              >
                ✕ Close
              </button>
            </div>

            <div style={{ margin: '20px 0', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {generatedWorksheet.problems.map((p, idx) => (
                <div key={idx} style={{ fontSize: '1rem', fontFamily: 'monospace', padding: '8px', background: '#f8fafc', borderRadius: '6px' }}>
                  {p}
                </div>
              ))}
            </div>

            <div className="row spaced" style={{ marginTop: '20px' }}>
              <span style={{ fontSize: '0.82rem', color: '#666' }}>Generated dynamically by UDAAN Teacher Intelligence Engine</span>
              <button
                onClick={() => {
                  window.print();
                }}
                style={{ background: '#0284c7', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', fontWeight: 700 }}
              >
                🖨️ Print / Save PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
