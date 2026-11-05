import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';

function formatWhen(value, lang) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(lang === 'te' ? 'te-IN' : 'en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const STATUS_TAG = {
  assigned: 'purple',
  in_progress: 'warn',
  completed: 'good',
  pending: 'purple',
  active: 'warn',
};

/**
 * "My Learning Plan" and the UDAAN Learning Assistant.
 *
 * Renders only content the backend has already published to the student's
 * class, so a draft course plan can never appear here. Every interaction
 * (opening a lesson, recording progress, completing practice, reading or
 * snoozing a reminder) goes through the authenticated student endpoints.
 */
export default function MyLearningPlan({ lang = 'en', t }) {
  const tr = (key, fallback) => {
    if (t) {
      const value = t(key);
      if (value && value !== key) return value;
    }
    return fallback;
  };
  const L = (en, te) => (lang === 'te' ? te : en);

  const [plan, setPlan] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [snoozeFor, setSnoozeFor] = useState(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [planData, notificationData] = await Promise.all([
        api.getStudentLearningPlan(),
        api.getLearningAssistantNotifications().catch(() => []),
      ]);
      setPlan(planData || null);
      setNotifications(Array.isArray(notificationData) ? notificationData : []);
    } catch (err) {
      setError(err.message || tr('mlpLoadError', 'Could not load your learning plan.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const recordEvent = async (assignment, eventType, progressPct = null) => {
    setBusy(`assignment-${assignment.assignment_id}-${eventType}`);
    setError('');
    setNotice('');
    try {
      await api.recordLearningEvent(assignment.assignment_id, {
        event_type: eventType,
        progress_pct: progressPct,
        metadata: { source: 'student_dashboard', lesson_id: assignment.lesson_id },
      });
      if (eventType === 'completed') {
        setNotice(L('Lesson marked complete. Well done!', 'పాఠం పూర్తయినట్లు గుర్తించబడింది. బాగా చేసారు!'));
      } else {
        setNotice(L('Your progress was saved.', 'మీ పురోగతి సేవ్ చేయబడింది.'));
      }
      await load();
    } catch (err) {
      setError(err.message || L('Could not save your progress.', 'మీ పురోగతిని సేవ్ చేయలేకపోయాం.'));
    } finally {
      setBusy('');
    }
  };

  const completeIntervention = async (intervention) => {
    setBusy(`intervention-${intervention.intervention_id}`);
    setError('');
    setNotice('');
    try {
      await api.completeStudentIntervention(intervention.intervention_id);
      setNotice(L('Practice submitted. Keep going!', 'సాధన సమర్పించబడింది. కొనసాగించండి!'));
      await load();
    } catch (err) {
      setError(err.message || L('Could not submit the practice.', 'సాధనను సమర్పించలేకపోయాం.'));
    } finally {
      setBusy('');
    }
  };

  const markRead = async (id) => {
    try {
      await api.markLearningNotificationRead(id);
      setNotifications((rows) => rows.map((row) => (row.id === id ? { ...row, is_read: true } : row)));
    } catch (err) {
      setError(err.message || L('Could not update the reminder.', 'రిమైండర్‌ను నవీకరించలేకపోయాం.'));
    }
  };

  const snooze = async (id, hours) => {
    try {
      await api.snoozeLearningNotification(id, hours);
      setSnoozeFor(null);
      setNotifications((rows) => rows.filter((row) => row.id !== id));
      setNotice(L('Reminder snoozed.', 'రిమైండర్ వాయిదా వేయబడింది.'));
    } catch (err) {
      setError(err.message || L('Could not snooze the reminder.', 'రిమైండర్‌ను వాయిదా వేయలేకపోయాం.'));
    }
  };

  const openAction = (notification) => {
    markRead(notification.id);
    const payload = (() => {
      try {
        return notification.action_payload_json ? JSON.parse(notification.action_payload_json) : {};
      } catch {
        return {};
      }
    })();
    const target = notification.action_url || payload.lesson_id;
    if (target) {
      const el = document.querySelector('[data-learning-plan="assignments"]');
      if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const assignments = useMemo(() => plan?.assignments || [], [plan]);
  const interventions = plan?.active_interventions || [];
  const unreadCount = notifications.filter((row) => !row.is_read).length;
  const today = plan?.today_recommendation;

  return (
    <section
      className="card"
      style={{
        marginTop: '20px',
        border: '1px solid rgba(0, 242, 254, 0.32)',
        background: 'linear-gradient(135deg, rgba(8, 14, 26, 0.96), rgba(24, 20, 48, 0.9))',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      }}
      aria-labelledby="mlp-title"
    >
      <div className="tm-head" style={{ gap: '12px', marginBottom: '14px' }}>
        <div>
          <span className="tag purple" style={{ letterSpacing: '0.08em' }}>
            {tr('mlpTag', 'UDAAN LEARNING ASSISTANT')}
          </span>
          <h3 id="mlp-title" style={{ margin: '8px 0 4px', fontSize: '1.25rem', fontWeight: 800 }}>
            🎒 {tr('mlpTitle', 'My Learning Plan')}
          </h3>
          <p className="mu" style={{ margin: 0, fontSize: '0.86rem' }}>
            {tr(
              'mlpIntro',
              'Your published lessons, progress and supportive reminders — all in one place.'
            )}
          </p>
        </div>
        <div className="row" style={{ gap: '8px', flexWrap: 'wrap' }}>
          {unreadCount > 0 && (
            <span className="tag warn">{unreadCount} {tr('mlpUnread', 'new')}</span>
          )}
          <button type="button" className="sec tm-btn" onClick={load} disabled={loading}>
            ↻ {tr('mlpRefresh', 'Refresh')}
          </button>
        </div>
      </div>

      {notice && (
        <div className="po-banner" role="status" style={{ marginBottom: '12px' }}>✓ {notice}</div>
      )}
      {error && (
        <div
          className="po-banner"
          role="alert"
          style={{ marginBottom: '12px', borderColor: '#f87171', color: '#fecdd3' }}
        >
          ⚠️ {error}
        </div>
      )}

      {loading && !plan ? (
        <p className="mu">{tr('mlpLoading', 'Loading your learning plan…')}</p>
      ) : (
        <>
          <div
            className="acc-grid"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}
          >
            {[
              {
                label: tr('mlpCourses', 'Courses'),
                value: plan?.total_courses ?? 0,
                icon: '📚',
              },
              {
                label: tr('mlpLessons', 'Lessons'),
                value: `${plan?.completed_assignments ?? 0}/${plan?.total_assignments ?? 0}`,
                icon: '✅',
              },
              {
                label: tr('mlpProgress', 'Overall progress'),
                value: `${plan?.overall_progress_pct ?? 0}%`,
                icon: '📈',
              },
              {
                label: tr('mlpPractice', 'Active practice'),
                value: interventions.length,
                icon: '🧩',
              },
            ].map((metric) => (
              <div key={metric.label} className="card" style={{ padding: '12px' }}>
                <div className="mu" style={{ fontSize: '0.76rem' }}>{metric.icon} {metric.label}</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{metric.value}</div>
              </div>
            ))}
          </div>

          {plan && (
            <div
              style={{
                margin: '14px 0 4px',
                height: '10px',
                borderRadius: '999px',
                background: 'rgba(148,163,184,0.2)',
                overflow: 'hidden',
              }}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={plan.overall_progress_pct || 0}
            >
              <div
                style={{
                  width: `${Math.min(100, Math.max(0, plan.overall_progress_pct || 0))}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #8b5cf6, #06b6d4)',
                }}
              />
            </div>
          )}

          {today && (
            <div
              style={{
                marginTop: '14px',
                padding: '14px 16px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, rgba(139,92,246,0.14), rgba(6,182,212,0.08))',
                border: '1px solid rgba(139,92,246,0.35)',
              }}
            >
              <div className="tag purple">{tr('mlpToday', "TODAY'S RECOMMENDATION")}</div>
              <div className="row spaced" style={{ gap: '10px', flexWrap: 'wrap', marginTop: '6px' }}>
                <div>
                  <b style={{ fontSize: '1rem' }}>
                    {lang === 'te' && today.lesson_title_te ? today.lesson_title_te : today.lesson_title_en}
                  </b>
                  <div className="po-small" style={{ marginTop: '2px' }}>
                    ⏱ {today.estimated_minutes} {tr('mlpMinutes', 'min')}
                    {today.topic_name ? ` · ${today.topic_name}` : ''}
                    {today.due_date ? ` · ${tr('mlpDue', 'Due')} ${formatWhen(today.due_date, lang)}` : ''}
                  </div>
                </div>
                <button
                  type="button"
                  className="pri"
                  onClick={() =>
                    recordEvent(today, today.status === 'completed' ? 'session_heartbeat' : 'lesson_opened', today.progress_pct)
                  }
                  disabled={Boolean(busy)}
                >
                  ▶ {today.status === 'completed' ? tr('mlpRevisit', 'Revisit lesson') : tr('mlpStartLesson', 'Start lesson')}
                </button>
              </div>
            </div>
          )}

          <div data-learning-plan="assignments" style={{ marginTop: '18px' }}>
            <h4 style={{ margin: '0 0 8px', fontSize: '1rem' }}>
              📖 {tr('mlpAssignments', 'Assignments')}
            </h4>
            {assignments.length === 0 ? (
              <p className="mu">
                {tr(
                  'mlpNoAssignments',
                  'No lessons have been published yet. Your teacher will add them soon.'
                )}
              </p>
            ) : (
              <ul className="tm-list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {assignments.map((assignment) => {
                  const isCompleted = assignment.status === 'completed';
                  return (
                    <li
                      key={assignment.assignment_id}
                      className="tm-thread"
                      style={{ marginBottom: '10px', padding: '12px' }}
                    >
                      <div className="row spaced" style={{ gap: '8px', flexWrap: 'wrap' }}>
                        <b>
                          {lang === 'te' && assignment.lesson_title_te
                            ? assignment.lesson_title_te
                            : assignment.lesson_title_en}
                        </b>
                        <span className={`tag ${STATUS_TAG[assignment.status] || ''}`}>
                          {isCompleted ? tr('mlpCompleted', 'Completed') : assignment.status === 'in_progress' ? tr('mlpInProgress', 'In progress') : tr('mlpAssigned', 'Assigned')}
                        </span>
                      </div>
                      <div className="po-small" style={{ margin: '4px 0 6px' }}>
                        {assignment.topic_name ? `${assignment.topic_name} · ` : ''}
                        {assignment.progress_pct}% ·{' '}
                        {assignment.due_date
                          ? `${tr('mlpDue', 'Due')} ${formatWhen(assignment.due_date, lang)}`
                          : tr('mlpNoDueDate', 'No due date')}
                      </div>
                      <div
                        style={{
                          height: '6px',
                          borderRadius: '999px',
                          background: 'rgba(148,163,184,0.2)',
                          overflow: 'hidden',
                          marginBottom: '8px',
                        }}
                      >
                        <div
                          style={{
                            width: `${Math.min(100, Math.max(0, assignment.progress_pct || 0))}%`,
                            height: '100%',
                            background: isCompleted ? '#10b981' : 'linear-gradient(90deg, #8b5cf6, #06b6d4)',
                          }}
                        />
                      </div>
                      {!isCompleted && (
                        <div className="row" style={{ gap: '6px', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className="sec tm-btn"
                            onClick={() => recordEvent(assignment, 'lesson_opened', assignment.progress_pct)}
                            disabled={Boolean(busy)}
                          >
                            ▶ {tr('mlpOpen', 'Open')}
                          </button>
                          <button
                            type="button"
                            className="sec tm-btn"
                            onClick={() =>
                              recordEvent(
                                assignment,
                                'progress',
                                Math.min(90, Math.max(assignment.progress_pct + 25, 25))
                              )
                            }
                            disabled={Boolean(busy)}
                          >
                            📈 {tr('mlpSaveProgress', 'Save progress')}
                          </button>
                          <button
                            type="button"
                            className="pri"
                            onClick={() => recordEvent(assignment, 'completed', 100)}
                            disabled={Boolean(busy)}
                          >
                            ✓ {tr('mlpMarkDone', 'Mark complete')}
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {interventions.length > 0 && (
            <div style={{ marginTop: '18px' }}>
              <h4 style={{ margin: '0 0 8px', fontSize: '1rem' }}>
                🧩 {tr('mlpPracticeTitle', 'Targeted practice')}
              </h4>
              <ul className="tm-list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {interventions.map((item) => (
                  <li
                    key={item.intervention_id}
                    className="tm-thread"
                    style={{ marginBottom: '10px', padding: '12px' }}
                  >
                    <div className="row spaced" style={{ gap: '8px', flexWrap: 'wrap' }}>
                      <b>
                        {lang === 'te' && item.title_te ? item.title_te : item.title_en}
                      </b>
                      <span className="tag warn">{tr('mlpActive', 'Active')}</span>
                    </div>
                    {item.recommended_action && (
                      <div className="po-small" style={{ margin: '4px 0 8px' }}>🎯 {item.recommended_action}</div>
                    )}
                    <button
                      type="button"
                      className="pri"
                      onClick={() => completeIntervention(item)}
                      disabled={busy === `intervention-${item.intervention_id}`}
                    >
                      ✓ {tr('mlpFinishPractice', 'Finish practice')}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div style={{ marginTop: '18px' }}>
            <h4 style={{ margin: '0 0 8px', fontSize: '1rem' }}>
              🔔 {tr('mlpAssistantTitle', 'UDAAN Learning Assistant')}
            </h4>
            {notifications.length === 0 ? (
              <p className="mu">
                {tr('mlpNoNotifications', 'No reminders right now. Keep up the great work!')}
              </p>
            ) : (
              <ul className="tm-list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {notifications.map((notification) => (
                  <li
                    key={notification.id}
                    className="tm-thread"
                    style={{
                      marginBottom: '10px',
                      padding: '12px',
                      borderLeft: notification.is_read ? '2px solid rgba(148,163,184,0.25)' : '3px solid #8b5cf6',
                    }}
                  >
                    <div className="row spaced" style={{ gap: '8px', flexWrap: 'wrap' }}>
                      <b>
                        {lang === 'te' && notification.title_te
                          ? notification.title_te
                          : notification.title_en}
                      </b>
                      <span className={`tag ${notification.is_read ? '' : 'warn'}`}>
                        {notification.is_read ? tr('mlpRead', 'Read') : tr('mlpNew', 'New')}
                      </span>
                    </div>
                    <div className="po-small" style={{ margin: '4px 0 8px' }}>
                      {lang === 'te' && notification.body_te ? notification.body_te : notification.body_en}
                    </div>
                    <div className="po-small" style={{ marginBottom: '8px' }}>
                      {notification.category} · {formatWhen(notification.created_at, lang)}
                    </div>
                    <div className="row" style={{ gap: '6px', flexWrap: 'wrap' }}>
                      {!notification.is_read && (
                        <button type="button" className="sec tm-btn" onClick={() => markRead(notification.id)}>
                          ✓ {tr('mlpMarkRead', 'Mark read')}
                        </button>
                      )}
                      {notification.action_url && (
                        <button type="button" className="sec tm-btn" onClick={() => openAction(notification)}>
                          ➜ {tr('mlpOpenAction', 'Open')}
                        </button>
                      )}
                      {snoozeFor === notification.id ? (
                        <>
                          <button type="button" className="sec tm-btn" onClick={() => snooze(notification.id, 4)}>
                            {tr('mlpSnooze4', '4 hours')}
                          </button>
                          <button type="button" className="sec tm-btn" onClick={() => snooze(notification.id, 24)}>
                            {tr('mlpSnooze24', '1 day')}
                          </button>
                          <button type="button" className="sec tm-btn" onClick={() => setSnoozeFor(null)}>
                            ✕
                          </button>
                        </>
                      ) : (
                        <button type="button" className="sec tm-btn" onClick={() => setSnoozeFor(notification.id)}>
                          ⏰ {tr('mlpSnooze', 'Snooze')}
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {(plan?.total_assignments ?? 0) === 0 && notifications.length === 0 && (
            <p className="po-small" style={{ marginTop: '12px' }}>
              {tr(
                'mlpEmptyHelp',
                'When your teacher publishes a course, your lessons and reminders will appear here.'
              )}
            </p>
          )}
        </>
      )}
    </section>
  );
}
