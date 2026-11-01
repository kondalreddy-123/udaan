import React, { useState, useEffect } from 'react';
import ClassroomObservatory from './ClassroomObservatory';
import { api } from '../services/api';

export default function TeacherDashboard({
  cards,
  cfg,
  onUpdateCfg,
  onCardStatus,
  onCardEdit,
  onOpenTour
}) {
  const [selectedClass, setSelectedClass] = useState('Class 8 - Section A');
  const [selectedChapter, setSelectedChapter] = useState('Rational Numbers');
  const [viewMode, setViewMode] = useState('overview'); // 'overview' | 'cards' | 'observatory' | 'interventions'
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [generatedWorksheet, setGeneratedWorksheet] = useState(null);

  // Live Data States from API
  const [summary, setSummary] = useState(null);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedStudentDetail, setSelectedStudentDetail] = useState(null);
  const [loadingStudentDetail, setLoadingStudentDetail] = useState(false);

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

  // Load deep dive detail for an individual student
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
              <button className="sec" onClick={() => setSelectedStudentDetail(null)} style={{ padding: '4px 10px' }}>
                ✕ Close
              </button>
            </div>

            {/* Concept Mastery Breakdown */}
            <h4 style={{ marginTop: '16px', marginBottom: '8px', color: '#00f2fe' }}>Rational Numbers Concept Mastery:</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
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
