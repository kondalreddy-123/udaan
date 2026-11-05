import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';

const CATEGORY_TABS = [
  { id: 'courses', icon: '📚', en: 'Course Planning', te: 'కోర్సు ప్రణాళిక' },
  { id: 'engagement', icon: '📡', en: 'Student Engagement', te: 'విద్యార్థి ఎంగేజ్‌మెంట్' },
  { id: 'interventions', icon: '🧩', en: 'AI Interventions', te: 'AI జోక్యాలు' },
  { id: 'reports', icon: '📊', en: 'Reports', te: 'నివేదికలు' },
];

const STATUS_COLORS = {
  draft: 'warn',
  approved: 'purple',
  published: 'good',
  processing: 'warn',
  parsing: 'warn',
  failed: 'danger',
  proposed: 'warn',
  active: 'good',
  resolved: 'good',
  dismissed: 'danger',
};

function formatDate(value, lang = 'en') {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(lang === 'te' ? 'te-IN' : 'en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function parseList(jsonText) {
  if (!jsonText) return [];
  try {
    const value = JSON.parse(jsonText);
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export default function AiCourseCenter({ lang = 'en', className = null, embedded = false }) {
  const L = (en, te) => (lang === 'te' ? te : en);
  const [tab, setTab] = useState('courses');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  return (
    <section className={embedded ? '' : 'card'} aria-labelledby="acc-title">
      <div className="tm-head" style={{ marginBottom: '14px' }}>
        <div>
          <span className="tag purple" style={{ letterSpacing: '0.08em' }}>
            {L('AUTONOMOUS LEARNING WORKFLOW', 'స్వయంప్రతిపత్తి అభ్యాస ప్రక్రియ')}
          </span>
          <h2 id="acc-title" style={{ margin: '8px 0 4px' }}>
            🤖 {L('AI Course & Engagement Center', 'AI కోర్సు & ఎంగేజ్‌మెంట్ సెంటర్')}
          </h2>
          <p className="mu" style={{ margin: 0, fontSize: '0.88rem' }}>
            {L(
              'Turn uploaded material into a reviewed course plan, monitor real learning activity, and act on evidence-based interventions.',
              'అప్‌లోడ్ చేసిన మెటీరియల్‌ను సమీక్షించిన కోర్సు ప్రణాళికగా మార్చండి, నిజమైన అభ్యాస కార్యకలాపాన్ని గమనించండి మరియు ఆధారాలతో కూడిన జోక్యాలపై చర్య తీసుకోండి.'
            )}
          </p>
        </div>
      </div>

      <div className="row" style={{ gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
        {CATEGORY_TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={tab === item.id ? 'pri' : 'sec'}
            onClick={() => setTab(item.id)}
          >
            {item.icon} {L(item.en, item.te)}
          </button>
        ))}
      </div>

      {notice && (
        <div className="po-banner" role="status" style={{ marginBottom: '12px' }}>{notice}</div>
      )}
      {error && (
        <div className="po-banner" role="alert" style={{ borderColor: '#f87171', color: '#fecdd3', marginBottom: '12px' }}>
          ⚠️ {error}
        </div>
      )}

      {tab === 'courses' && (
        <CoursePlanningTab
          lang={lang}
          className={className}
          L={L}
          setError={setError}
          setNotice={setNotice}
        />
      )}
      {tab === 'engagement' && (
        <EngagementTab lang={lang} className={className} L={L} setError={setError} setNotice={setNotice} />
      )}
      {tab === 'interventions' && (
        <InterventionsTab lang={lang} className={className} L={L} setError={setError} setNotice={setNotice} />
      )}
      {tab === 'reports' && (
        <ReportsTab lang={lang} className={className} L={L} setError={setError} />
      )}
    </section>
  );
}

function CoursePlanningTab({ lang, className, L, setError, setNotice }) {
  const [materials, setMaterials] = useState([]);
  const [plans, setPlans] = useState([]);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    title: '',
    subject: 'Mathematics',
    sessions_count: '5',
    preferred_language: lang === 'te' ? 'te' : 'en',
    learning_objectives: '',
    start_date: '',
    end_date: '',
    file: null,
  });

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [materialRows, planRows] = await Promise.all([
        api.getCourseMaterials(className).catch(() => []),
        api.getCoursePlans(className).catch(() => []),
      ]);
      setMaterials(Array.isArray(materialRows) ? materialRows : []);
      setPlans(Array.isArray(planRows) ? planRows : []);
      if (selectedPlan) {
        const refreshed = (planRows || []).find((plan) => plan.id === selectedPlan.id);
        if (refreshed) {
          const detail = await api.getCoursePlan(refreshed.id).catch(() => null);
          if (detail) setSelectedPlan(detail);
        }
      }
    } catch (err) {
      setError(err.message || 'Could not load course data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [className]);

  const upload = async (event) => {
    event.preventDefault();
    if (!form.file || !form.title.trim()) {
      setError(L('Choose a file and add a course title.', 'ఫైల్ ఎంచుకుని కోర్సు శీర్షిక రాయండి.'));
      return;
    }
    const data = new FormData();
    data.append('file', form.file);
    data.append('class_name', className || 'Class 8 - Section A');
    data.append('subject', form.subject || 'Mathematics');
    data.append('title', form.title.trim());
    data.append('sessions_count', form.sessions_count || '5');
    data.append('preferred_language', form.preferred_language || 'en');
    if (form.learning_objectives.trim()) data.append('learning_objectives', form.learning_objectives.trim());
    if (form.start_date) data.append('start_date', form.start_date);
    if (form.end_date) data.append('end_date', form.end_date);

    setUploading(true);
    setError('');
    setNotice('');
    try {
      const plan = await api.uploadCourseMaterial(data);
      setNotice(
        L(
          'Material processed. A draft course plan is ready for your review — it is not visible to students yet.',
          'మెటీరియల్ ప్రాసెస్ అయింది. సమీక్ష కోసం డ్రాఫ్ట్ కోర్సు ప్రణాళిక సిద్ధంగా ఉంది — ఇది ఇంకా విద్యార్థులకు కనిపించదు.'
        )
      );
      setForm((current) => ({ ...current, file: null, title: '', learning_objectives: '' }));
      await load();
      if (plan && plan.id) {
        const detail = await api.getCoursePlan(plan.id);
        setSelectedPlan(detail);
      }
    } catch (err) {
      setError(err.message || L('Course generation failed.', 'కోర్సు రూపకల్పన విఫలమైంది.'));
    } finally {
      setUploading(false);
    }
  };

  const openPlan = async (id) => {
    setBusy(`open-${id}`);
    setError('');
    try {
      const detail = await api.getCoursePlan(id);
      setSelectedPlan(detail);
    } catch (err) {
      setError(err.message || 'Could not open the course plan.');
    } finally {
      setBusy('');
    }
  };

  const refreshSelected = async () => {
    if (!selectedPlan) return;
    const detail = await api.getCoursePlan(selectedPlan.id);
    setSelectedPlan(detail);
    await load();
  };

  const approve = async () => {
    if (!selectedPlan) return;
    setBusy('approve');
    setError('');
    try {
      await api.approveCoursePlan(selectedPlan.id);
      setNotice(L('Course approved. Publish it when you are ready.', 'కోర్సు ఆమోదించబడింది. సిద్ధమైనప్పుడు ప్రచురించండి.'));
      await refreshSelected();
    } catch (err) {
      setError(err.message || 'Could not approve the course.');
    } finally {
      setBusy('');
    }
  };

  const publish = async () => {
    if (!selectedPlan) return;
    setBusy('publish');
    setError('');
    try {
      const result = await api.publishCoursePlan(selectedPlan.id);
      setNotice(
        L(
          `Published to ${result.students_enrolled} students with ${result.assignments_created} lesson assignments and course notifications.`,
          `${result.students_enrolled} విద్యార్థులకు ${result.assignments_created} పాఠ్య అసైన్‌మెంట్లు మరియు కోర్సు నోటిఫికేషన్లతో ప్రచురించబడింది.`
        )
      );
      await refreshSelected();
    } catch (err) {
      setError(err.message || 'Could not publish the course.');
    } finally {
      setBusy('');
    }
  };

  const moveLesson = async (index, direction) => {
    if (!selectedPlan) return;
    const lessons = [...selectedPlan.lessons].sort((a, b) => a.sequence_order - b.sequence_order);
    const target = index + direction;
    if (target < 0 || target >= lessons.length) return;
    const swapped = [...lessons];
    [swapped[index], swapped[target]] = [swapped[target], swapped[index]];
    const ids = swapped.map((lesson) => lesson.id);
    setBusy(`reorder-${index}`);
    setError('');
    try {
      await api.reorderCourseLessons(selectedPlan.id, ids);
      await refreshSelected();
    } catch (err) {
      setError(err.message || 'Could not reorder lessons.');
    } finally {
      setBusy('');
    }
  };

  const editLesson = async (lesson, field, value) => {
    if (!selectedPlan) return;
    setBusy(`lesson-${lesson.id}`);
    setError('');
    try {
      await api.updateCourseLesson(selectedPlan.id, lesson.id, { [field]: value });
      setNotice(L('Lesson updated.', 'పాఠం నవీకరించబడింది.'));
      await refreshSelected();
    } catch (err) {
      setError(err.message || 'Could not update the lesson.');
    } finally {
      setBusy('');
    }
  };

  const sortedLessons = useMemo(() => {
    if (!selectedPlan) return [];
    return [...(selectedPlan.lessons || [])].sort((a, b) => a.sequence_order - b.sequence_order);
  }, [selectedPlan]);

  return (
    <div>
      <form className="tm-compose" onSubmit={upload}>
        <div className="tm-compose-head">
          <h3 style={{ margin: 0, fontSize: '1.02rem' }}>
            ⬆️ {L('Upload course material', 'కోర్సు మెటీరియల్ అప్‌లోడ్ చేయండి')}
          </h3>
          <p className="mu" style={{ margin: '4px 0 0', fontSize: '0.84rem' }}>
            {L(
              'PDF, DOCX, PPTX, TXT or MD. The material is extracted, indexed for RAG and turned into a draft plan only.',
              'PDF, DOCX, PPTX, TXT లేదా MD. మెటీరియల్ సారాంశం తీసి, RAG కోసం ఇండెక్స్ చేసి, డ్రాఫ్ట్ ప్రణాళికగా మాత్రమే మారుస్తారు.'
            )}
          </p>
        </div>
        <div className="tm-compose-grid">
          <label className="po-field">
            <span>{L('File', 'ఫైల్')}</span>
            <input
              type="file"
              accept=".pdf,.docx,.pptx,.txt,.md"
              onChange={(event) => setForm((value) => ({ ...value, file: event.target.files?.[0] || null }))}
            />
          </label>
          <label className="po-field">
            <span>{L('Course title', 'కోర్సు శీర్షిక')}</span>
            <input
              type="text"
              maxLength={150}
              value={form.title}
              onChange={(event) => setForm((value) => ({ ...value, title: event.target.value }))}
              placeholder={L('e.g. Rational Numbers Mastery', 'ఉదా. హేతుబద్ధ సంఖ్యల నైపుణ్యం')}
            />
          </label>
          <label className="po-field">
            <span>{L('Subject', 'విషయం')}</span>
            <input
              type="text"
              value={form.subject}
              onChange={(event) => setForm((value) => ({ ...value, subject: event.target.value }))}
            />
          </label>
          <label className="po-field">
            <span>{L('Teaching sessions', 'బోధన సెషన్లు')}</span>
            <input
              type="number"
              min="1"
              max="20"
              value={form.sessions_count}
              onChange={(event) => setForm((value) => ({ ...value, sessions_count: event.target.value }))}
            />
          </label>
          <label className="po-field">
            <span>{L('Preferred language', 'ఇష్టమైన భాష')}</span>
            <select
              value={form.preferred_language}
              onChange={(event) => setForm((value) => ({ ...value, preferred_language: event.target.value }))}
            >
              <option value="en">English</option>
              <option value="te">తెలుగు</option>
            </select>
          </label>
          <label className="po-field">
            <span>{L('Start date', 'ప్రారంభ తేదీ')}</span>
            <input
              type="date"
              value={form.start_date}
              onChange={(event) => setForm((value) => ({ ...value, start_date: event.target.value }))}
            />
          </label>
          <label className="po-field">
            <span>{L('End date', 'ముగింపు తేదీ')}</span>
            <input
              type="date"
              value={form.end_date}
              onChange={(event) => setForm((value) => ({ ...value, end_date: event.target.value }))}
            />
          </label>
        </div>
        <label className="po-field">
          <span>{L('Learning objectives (optional)', 'అభ్యాస లక్ష్యాలు (ఐచ్ఛికం)')}</span>
          <textarea
            rows={2}
            value={form.learning_objectives}
            onChange={(event) => setForm((value) => ({ ...value, learning_objectives: event.target.value }))}
          />
        </label>
        <div className="tm-form-actions">
          <button type="submit" className="pri" disabled={uploading}>
            {uploading ? L('Processing…', 'ప్రాసెస్ అవుతోంది…') : `⚙️ ${L('Generate draft course', 'డ్రాఫ్ట్ కోర్సు రూపొందించండి')}`}
          </button>
          <button type="button" className="sec tm-btn" onClick={load} disabled={loading}>
            ↻ {L('Refresh', 'రిఫ్రెష్')}
          </button>
        </div>
      </form>

      <div className="acc-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.4fr)', gap: '16px', marginTop: '18px' }}>
        <div>
          <h3 style={{ margin: '0 0 8px', fontSize: '1rem' }}>📂 {L('Uploaded materials', 'అప్‌లోడ్ చేసిన మెటీరియల్స్')}</h3>
          {loading ? (
            <p className="mu">{L('Loading…', 'లోడ్ అవుతోంది…')}</p>
          ) : materials.length === 0 ? (
            <p className="mu">{L('No materials uploaded for this class yet.', 'ఈ తరగతికి ఇంకా మెటీరియల్ అప్‌లోడ్ చేయలేదు.')}</p>
          ) : (
            <ul className="tm-list">
              {materials.map((material) => (
                <li key={material.id} style={{ padding: '10px 0', borderBottom: '1px solid rgba(148,163,184,0.15)' }}>
                  <div className="row spaced" style={{ gap: '8px', flexWrap: 'wrap' }}>
                    <b>{material.title}</b>
                    <span className={`tag ${STATUS_COLORS[material.status] || ''}`}>{material.status}</span>
                  </div>
                  <div className="mu" style={{ fontSize: '0.8rem', marginTop: '4px' }}>
                    {material.file_name} · {(material.file_size / 1024).toFixed(1)} KB · {formatDate(material.created_at, lang)}
                  </div>
                  {material.error_message && (
                    <div className="po-small" style={{ color: '#fca5a5' }}>{material.error_message}</div>
                  )}
                </li>
              ))}
            </ul>
          )}

          <h3 style={{ margin: '18px 0 8px', fontSize: '1rem' }}>🗂️ {L('Course plans', 'కోర్సు ప్రణాళికలు')}</h3>
          {plans.length === 0 ? (
            <p className="mu">{L('No course plans generated yet.', 'ఇంకా కోర్సు ప్రణాళికలు రూపొందించలేదు.')}</p>
          ) : (
            <ul className="tm-list">
              {plans.map((plan) => (
                <li key={plan.id} style={{ marginBottom: '8px' }}>
                  <button
                    type="button"
                    className={`tm-thread-btn ${selectedPlan?.id === plan.id ? 'on' : ''}`}
                    onClick={() => openPlan(plan.id)}
                    disabled={busy === `open-${plan.id}`}
                  >
                    <span className="tm-thread-top">
                      <b>{plan.title_en}</b>
                      <span className={`tag ${STATUS_COLORS[plan.status] || ''}`}>{plan.status}</span>
                    </span>
                    <span className="tm-thread-meta">
                      {plan.subject} · {plan.total_sessions} {L('sessions', 'సెషన్లు')} · {plan.estimated_hours}h
                    </span>
                    <span className="tm-thread-meta">
                      {formatDate(plan.start_date, lang)} → {formatDate(plan.end_date, lang)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          {!selectedPlan ? (
            <div className="pn-empty" role="status">
              <div className="pn-empty-icon" aria-hidden="true">🗺️</div>
              <p>{L('Choose a course plan to review its lessons.', 'పాఠాలను సమీక్షించడానికి ఒక కోర్సు ప్రణాళికను ఎంచుకోండి.')}</p>
            </div>
          ) : (
            <article className="tm-thread">
              <header className="tm-thread-head">
                <h3 style={{ margin: 0 }}>{selectedPlan.title_en}</h3>
                <div className="tm-thread-badges">
                  <span className={`tag ${STATUS_COLORS[selectedPlan.status] || ''}`}>{selectedPlan.status}</span>
                  <span className="tag purple">{selectedPlan.subject}</span>
                </div>
                <p className="po-small" style={{ margin: '6px 0 0' }}>
                  {selectedPlan.description_en || L('AI-generated draft course plan.', 'AI రూపొందించిన డ్రాఫ్ట్ కోర్సు ప్రణాళిక.')}
                </p>
              </header>

              <div className="tm-form-actions" style={{ margin: '12px 0' }}>
                <button type="button" className="sec" onClick={approve} disabled={busy === 'approve' || selectedPlan.status === 'published'}>
                  ✓ {L('Approve plan', 'ప్రణాళిక ఆమోదించండి')}
                </button>
                <button
                  type="button"
                  className="pri"
                  onClick={publish}
                  disabled={busy === 'publish' || selectedPlan.status === 'published' || selectedPlan.status === 'draft'}
                  title={selectedPlan.status === 'draft' ? L('Approve the plan before publishing.', 'ప్రచురించే ముందు ప్రణాళికను ఆమోదించండి.') : ''}
                >
                  🚀 {L('Publish to students', 'విద్యార్థులకు ప్రచురించండి')}
                </button>
              </div>

              {selectedPlan.status === 'draft' && (
                <div className="po-banner" role="note">
                  {L(
                    'Draft only. Students are not notified until you approve and publish.',
                    'డ్రాఫ్ట్ మాత్రమే. మీరు ఆమోదించి ప్రచురించే వరకు విద్యార్థులకు నోటిఫికేషన్ పంపబడదు.'
                  )}
                </div>
              )}

              <h4 style={{ margin: '14px 0 8px' }}>{L('Lessons', 'పాఠాలు')}</h4>
              <ol className="acc-lessons" style={{ paddingLeft: '18px', margin: 0 }}>
                {sortedLessons.map((lesson, index) => (
                  <li key={lesson.id} style={{ marginBottom: '12px' }}>
                    <div className="row spaced" style={{ gap: '8px', flexWrap: 'wrap' }}>
                      <b>{lesson.sequence_order}. {lesson.title_en}</b>
                      <span className="tag">{lesson.estimated_minutes} {L('min', 'నిమి')}</span>
                    </div>
                    <div className="mu" style={{ fontSize: '0.8rem', margin: '2px 0 4px' }}>
                      {lesson.topic_name} {lesson.source_reference ? `· ${lesson.source_reference}` : ''}
                    </div>
                    <div className="row" style={{ gap: '6px', flexWrap: 'wrap' }}>
                      <button type="button" className="sec tm-btn" onClick={() => moveLesson(index, -1)} disabled={index === 0 || Boolean(busy)}>
                        ↑
                      </button>
                      <button type="button" className="sec tm-btn" onClick={() => moveLesson(index, 1)} disabled={index === sortedLessons.length - 1 || Boolean(busy)}>
                        ↓
                      </button>
                      <button
                        type="button"
                        className="sec tm-btn"
                        onClick={() => {
                          const next = window.prompt(L('Lesson title', 'పాఠం శీర్షిక'), lesson.title_en);
                          if (next && next.trim() && next.trim() !== lesson.title_en) editLesson(lesson, 'title_en', next.trim());
                        }}
                        disabled={Boolean(busy)}
                      >
                        ✎ {L('Rename', 'పేరు మార్చండి')}
                      </button>
                      <button
                        type="button"
                        className="sec tm-btn"
                        onClick={() => {
                          const next = window.prompt(L('Estimated minutes', 'అంచనా నిమిషాలు'), String(lesson.estimated_minutes));
                          const minutes = Number(next);
                          if (Number.isFinite(minutes) && minutes > 0 && minutes !== lesson.estimated_minutes) {
                            editLesson(lesson, 'estimated_minutes', Math.round(minutes));
                          }
                        }}
                        disabled={Boolean(busy)}
                      >
                        ⏱ {L('Duration', 'వ్యవధి')}
                      </button>
                    </div>
                    {parseList(lesson.objectives_json).length > 0 && (
                      <div className="po-small" style={{ marginTop: '4px' }}>
                        🎯 {parseList(lesson.objectives_json).join(' · ')}
                      </div>
                    )}
                  </li>
                ))}
              </ol>

              {selectedPlan.pedagogical_notes && (
                <div className="po-small" style={{ marginTop: '12px', color: '#c4b5fd' }}>
                  {selectedPlan.pedagogical_notes}
                </div>
              )}
            </article>
          )}
        </div>
      </div>
    </div>
  );
}

function EngagementTab({ lang, className, L, setError, setNotice }) {
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [busyAlert, setBusyAlert] = useState(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.getCourseEngagementOverview(className);
      setOverview(data);
    } catch (err) {
      setError(err.message || 'Could not load engagement data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [className]);

  const scan = async () => {
    setScanning(true);
    setError('');
    setNotice('');
    try {
      const result = await api.scanCourseEngagement(className);
      const engagement = result.engagement || {};
      setNotice(
        L(
          `Engagement scan complete: ${engagement.notifications_sent ?? 0} reminders sent, ${engagement.new_alerts_created ?? 0} new alerts.`,
          `ఎంగేజ్‌మెంట్ స్కాన్ పూర్తయింది: ${engagement.notifications_sent ?? 0} రిమైండర్లు పంపబడ్డాయి, ${engagement.new_alerts_created ?? 0} కొత్త హెచ్చరికలు.`
        )
      );
      await load();
    } catch (err) {
      setError(err.message || 'Engagement scan failed.');
    } finally {
      setScanning(false);
    }
  };

  const resolve = async (id) => {
    setBusyAlert(id);
    setError('');
    try {
      await api.resolveEngagementAlert(id, 'Resolved from AI Course Center');
      await load();
    } catch (err) {
      setError(err.message || 'Could not resolve the alert.');
    } finally {
      setBusyAlert(null);
    }
  };

  if (loading && !overview) return <p className="mu">{L('Loading engagement data…', 'ఎంగేజ్‌మెంట్ డేటా లోడ్ అవుతోంది…')}</p>;

  const invariant = overview || { total_students: 0, active_students: 0, inactive_students: 0, open_alerts_count: 0, alerts: [] };

  return (
    <div>
      <div className="row" style={{ gap: '10px', flexWrap: 'wrap', marginBottom: '14px' }}>
        <button type="button" className="pri" onClick={scan} disabled={scanning}>
          {scanning ? L('Scanning…', 'స్కాన్ అవుతోంది…') : `📡 ${L('Run engagement scan', 'ఎంగేజ్‌మెంట్ స్కాన్ నడపండి')}`}
        </button>
        <button type="button" className="sec" onClick={load}>↻ {L('Refresh', 'రిఫ్రెష్')}</button>
      </div>

      <div className="acc-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
        {[
          { label: L('Students', 'విద్యార్థులు'), value: invariant.total_students, icon: '👥' },
          { label: L('Active in 3 days', '3 రోజుల్లో యాక్టివ్'), value: invariant.active_students, icon: '🟢' },
          { label: L('Needs a nudge', 'ప్రోత్సాహం కావాలి'), value: invariant.inactive_students, icon: '🌙' },
          { label: L('Open alerts', 'తెరిచిన హెచ్చరికలు'), value: invariant.open_alerts_count, icon: '🔔' },
        ].map((metric) => (
          <div key={metric.label} className="card" style={{ padding: '14px' }}>
            <div className="mu" style={{ fontSize: '0.78rem' }}>{metric.icon} {metric.label}</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800 }}>{metric.value}</div>
          </div>
        ))}
      </div>

      <h3 style={{ margin: '18px 0 8px', fontSize: '1rem' }}>🔔 {L('Unresolved engagement alerts', 'పరిష్కరించని ఎంగేజ్‌మెంట్ హెచ్చరికలు')}</h3>
      {invariant.alerts.length === 0 ? (
        <p className="mu">{L('No open alerts. The class is keeping up with its plan.', 'తెరిచిన హెచ్చరికలు లేవు. తరగతి ప్రణాళికతో ముందుకు సాగుతోంది.')}</p>
      ) : (
        <ul className="tm-list">
          {invariant.alerts.map((alert) => {
            let details = {};
            try { details = alert.details_json ? JSON.parse(alert.details_json) : {}; } catch { details = {}; }
            return (
              <li key={alert.id} className="tm-thread" style={{ marginBottom: '10px' }}>
                <div className="row spaced" style={{ gap: '8px', flexWrap: 'wrap' }}>
                  <b>{alert.student_name}</b>
                  <span className={`tag ${alert.severity === 'high' ? 'danger' : 'warn'}`}>{alert.alert_type}</span>
                </div>
                <div className="po-small" style={{ margin: '4px 0' }}>
                  {details.message || details.reason || JSON.stringify(details)}
                </div>
                <button type="button" className="sec tm-btn" onClick={() => resolve(alert.id)} disabled={busyAlert === alert.id}>
                  ✓ {L('Mark reviewed', 'సమీక్షించినట్లు గుర్తించండి')}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function InterventionsTab({ lang, className, L, setError, setNotice }) {
  const [interventions, setInterventions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [worksheet, setWorksheet] = useState(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const rows = await api.getCourseInterventions(className);
      setInterventions(Array.isArray(rows) ? rows : []);
    } catch (err) {
      setError(err.message || 'Could not load interventions.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [className]);

  const scan = async () => {
    setBusy('scan');
    setError('');
    setNotice('');
    try {
      const result = await api.scanCourseInterventions(className);
      setNotice(
        L(
          `Scanned recent attempts: ${result.new_campaigns_proposed} new classroom campaign(s) proposed.`,
          `ఇటీవలి ప్రయత్నాలు స్కాన్ చేయబడ్డాయి: ${result.new_campaigns_proposed} కొత్త తరగతి ప్రచారాలు ప్రతిపాదించబడ్డాయి.`
        )
      );
      await load();
    } catch (err) {
      setError(err.message || 'Intervention scan failed.');
    } finally {
      setBusy('');
    }
  };

  const act = async (id, action) => {
    setBusy(`${action}-${id}`);
    setError('');
    try {
      if (action === 'approve') await api.approveCourseIntervention(id);
      else await api.dismissCourseIntervention(id);
      await load();
    } catch (err) {
      setError(err.message || `Could not ${action} the intervention.`);
    } finally {
      setBusy('');
    }
  };

  const openWorksheet = async (misconception) => {
    setBusy(`worksheet-${misconception}`);
    setError('');
    try {
      const data = await api.getCourseWorksheet(misconception, className);
      setWorksheet(data);
    } catch (err) {
      setError(err.message || 'Could not generate the worksheet.');
    } finally {
      setBusy('');
    }
  };

  if (loading && interventions.length === 0) return <p className="mu">{L('Loading interventions…', 'జోక్యాలు లోడ్ అవుతున్నాయి…')}</p>;

  return (
    <div>
      <div className="row" style={{ gap: '10px', flexWrap: 'wrap', marginBottom: '14px' }}>
        <button type="button" className="pri" onClick={scan} disabled={busy === 'scan'}>
          {busy === 'scan' ? L('Scanning…', 'స్కాన్ అవుతోంది…') : `🔎 ${L('Detect misconceptions', 'అపార్థాలను గుర్తించండి')}`}
        </button>
        <button type="button" className="sec" onClick={load}>↻ {L('Refresh', 'రిఫ్రెష్')}</button>
      </div>

      {interventions.length === 0 ? (
        <div className="pn-empty" role="status">
          <div className="pn-empty-icon" aria-hidden="true">🧩</div>
          <p>{L('No interventions yet. Detection requires repeated evidence from real attempts.', 'ఇంకా జోక్యాలు లేవు. గుర్తింపుకు నిజమైన ప్రయత్నాల నుండి పునరావృత ఆధారాలు అవసరం.')}</p>
        </div>
      ) : (
        <ul className="tm-list">
          {interventions.map((item) => (
            <li key={item.id} className="tm-thread" style={{ marginBottom: '12px' }}>
              <div className="row spaced" style={{ gap: '8px', flexWrap: 'wrap' }}>
                <b>{lang === 'te' && item.title_te ? item.title_te : item.title_en}</b>
                <span className={`tag ${STATUS_COLORS[item.status] || ''}`}>{item.status}</span>
              </div>
              <div className="po-small" style={{ margin: '4px 0' }}>
                {item.description || L('Targeted remedial practice grounded in recorded attempts.', 'నమోదైన ప్రయత్నాల ఆధారంగా లక్ష్యిత పునరుద్ధరణ సాధన.')}
              </div>
              <div className="po-small" style={{ margin: '4px 0' }}>
                👥 {item.affected_students_count}/{item.class_size} {L('students affected', 'విద్యార్థులు ప్రభావితం')} ·{' '}
                {L('Affected ratio', 'ప్రభావిత నిష్పత్తి')}: {Math.round((item.affected_ratio || 0) * 100)}%
              </div>
              <div className="tm-form-actions">
                {item.status === 'proposed' && (
                  <>
                    <button type="button" className="pri" onClick={() => act(item.id, 'approve')} disabled={busy === `approve-${item.id}`}>
                      ✓ {L('Approve & assign', 'ఆమోదించి కేటాయించండి')}
                    </button>
                    <button type="button" className="sec tm-btn" onClick={() => act(item.id, 'dismiss')} disabled={busy === `dismiss-${item.id}`}>
                      {L('Dismiss', 'తిరస్కరించండి')}
                    </button>
                  </>
                )}
                <button type="button" className="sec tm-btn" onClick={() => openWorksheet(item.target_misconception)} disabled={busy === `worksheet-${item.target_misconception}`}>
                  🖨 {L('Worksheet', 'వర్క్‌షీట్')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {worksheet && (
        <div className="tm-compose" style={{ marginTop: '16px' }}>
          <div className="row spaced" style={{ gap: '8px' }}>
            <h3 style={{ margin: 0, fontSize: '1rem' }}>🖨 {worksheet.topic}</h3>
            <button type="button" className="sec tm-btn" onClick={() => setWorksheet(null)}>✕</button>
          </div>
          <div className="po-small">🎯 {worksheet.target_misconception} · {formatDate(worksheet.date, lang)}</div>
          <div className="po-small">🧰 {worksheet.tactile_remedy}</div>
          <ol style={{ paddingLeft: '18px', margin: '6px 0' }}>
            {(worksheet.practice_steps || []).map((step, index) => (
              <li key={index} className="po-small">{step}</li>
            ))}
          </ol>
          <ul style={{ paddingLeft: '18px', margin: 0 }}>
            {(worksheet.drill_problems || []).map((problem, index) => (
              <li key={index} className="po-small">{problem}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ReportsTab({ lang, className, L, setError }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.getCourseWeeklyReport(className);
      setReport(data);
    } catch (err) {
      setError(err.message || 'Could not load the weekly report.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [className]);

  if (loading) return <p className="mu">{L('Preparing the weekly report…', 'వారపు నివేదిక సిద్ధమవుతోంది…')}</p>;
  if (!report) return <p className="mu">{L('No report available yet.', 'ఇంకా నివేదిక అందుబాటులో లేదు.')}</p>;

  const cohort = report.cohort_summary || {};
  const progress = report.curriculum_progress || {};
  const analytics = report.intervention_analytics || {};

  return (
    <div>
      <div className="row" style={{ gap: '10px', flexWrap: 'wrap', marginBottom: '14px' }}>
        <button type="button" className="sec" onClick={load}>↻ {L('Refresh', 'రిఫ్రెష్')}</button>
      </div>

      <div className="acc-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
        <div className="card" style={{ padding: '14px' }}>
          <div className="mu" style={{ fontSize: '0.78rem' }}>👥 {L('Cohort', 'తరగతి')}</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{cohort.total_students ?? 0}</div>
        </div>
        <div className="card" style={{ padding: '14px' }}>
          <div className="mu" style={{ fontSize: '0.78rem' }}>📈 {L('Engagement rate', 'ఎంగేజ్‌మెంట్ రేటు')}</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{cohort.engagement_rate_pct ?? 0}%</div>
          <div className="po-small">
            {cohort.active_students ?? 0} {L('active', 'యాక్టివ్')} · {cohort.inactive_students ?? 0} {L('inactive', 'నిష్క్రియ')}
          </div>
        </div>
        <div className="card" style={{ padding: '14px' }}>
          <div className="mu" style={{ fontSize: '0.78rem' }}>📚 {L('Course completion', 'కోర్సు పూర్తి')}</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{progress.completion_rate_pct ?? 0}%</div>
          <div className="po-small">
            {progress.completed_lessons ?? 0}/{progress.total_assigned_lessons ?? 0} {L('lessons', 'పాఠాలు')}
          </div>
        </div>
        <div className="card" style={{ padding: '14px' }}>
          <div className="mu" style={{ fontSize: '0.78rem' }}>🧩 {L('Intervention campaigns', 'జోక్య ప్రచారాలు')}</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{analytics.total_campaigns ?? 0}</div>
          <div className="po-small">
            {analytics.evaluated_participants ?? 0} {L('participants evaluated', 'పాల్గొన్నవారు మూల్యాంకనం')}
          </div>
        </div>
        <div className="card" style={{ padding: '14px' }}>
          <div className="mu" style={{ fontSize: '0.78rem' }}>📈 {L('Mastery gain', 'నైపుణ్య పెరుగుదల')}</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{analytics.relative_gain_pct || '0%'}</div>
          <div className="po-small">
            {analytics.average_pre_intervention_mastery || '0%'} → {analytics.average_post_intervention_mastery || '0%'}
          </div>
        </div>
      </div>

      <h3 style={{ margin: '18px 0 8px', fontSize: '1rem' }}>⚠️ {L('Top learning difficulties', 'ప్రధాన అభ్యాస ఇబ్బందులు')}</h3>
      {(report.top_struggles || []).length === 0 ? (
        <p className="mu">{L('No recurring difficulty detected this week.', 'ఈ వారం పునరావృత ఇబ్బందులు కనిపించలేదు.')}</p>
      ) : (
        <ul className="tm-list">
          {(report.top_struggles || []).map((item, index) => (
            <li key={index} className="po-small" style={{ padding: '6px 0' }}>
              <b>{item.type}</b> · {item.occurrences ?? 0} {L('occurrences', 'సంఘటనలు')}
            </li>
          ))}
        </ul>
      )}

      {report.recommended_next_action && (
        <div className="po-banner" style={{ marginTop: '14px' }}>
          🎯 {L('Next teaching activity', 'తదుపరి బోధన కార్యకలాపం')}: {report.recommended_next_action}
        </div>
      )}

      <p className="po-small" style={{ marginTop: '14px' }}>
        {L('Class', 'తరగతి')}: {report.class_name || className || '—'} · {L('Period', 'కాలం')}: {report.period || 'Last 7 Days'}
      </p>
    </div>
  );
}
