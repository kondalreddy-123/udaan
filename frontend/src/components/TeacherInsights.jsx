import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';

const FALLBACK_SUMMARY = {
  total_students: 15,
  active_students: 12,
  students_requiring_attention: 4,
  class_average_mastery_pct: 52,
  concepts: [
    { concept_id: 'c5', title_en: 'Adding rationals (unlike denominators)', average_mastery: 0.38, average_mastery_pct: 38, struggling_percent: 62, status_label: 'Needs Intervention' },
    { concept_id: 'c4', title_en: 'Comparing rational numbers', average_mastery: 0.53, average_mastery_pct: 53, struggling_percent: 47, status_label: 'Building' },
    { concept_id: 'c2', title_en: 'LCM & common denominators', average_mastery: 0.64, average_mastery_pct: 64, struggling_percent: 36, status_label: 'Building' },
    { concept_id: 'c3', title_en: 'Rational number meaning (p/q)', average_mastery: 0.74, average_mastery_pct: 74, struggling_percent: 26, status_label: 'On Track' },
    { concept_id: 'c1', title_en: 'Fractions & equivalent forms', average_mastery: 0.81, average_mastery_pct: 81, struggling_percent: 19, status_label: 'Secure' }
  ],
  recurring_misconceptions: [
    { tag: 'num_den_separate', name: 'Added numerators & denominators separately', prevalence_percent: 38, student_count: 6 },
    { tag: 'ignored_negative', name: 'Ignored negative sign during LCM conversion', prevalence_percent: 27, student_count: 4 },
    { tag: 'sign_slip', name: 'Sign slip in final integer addition', prevalence_percent: 13, student_count: 2 }
  ],
  support_priorities: [
    { priority: 'HIGH', concept: 'Adding rationals with unlike denominators', issue: '62% of students struggling (avg mastery 38%)', recommended_action: 'Run a 15-minute tactile fraction-strip lesson, then assign LCM number-line practice.' },
    { priority: 'MEDIUM', concept: 'Comparing rational numbers', issue: '47% of students struggling (avg mastery 53%)', recommended_action: 'Use directed signed number-line drills in pairs.' }
  ]
};

const FALLBACK_STUDENTS = [
  { id: 'sample-1', full_name: 'Ananya Rao', email: 'ananya@school.edu', overall_mastery: 0.91, bkt_band: 'Secure', active_tier: 'Independent', recent_misconceptions: [], needs_attention: false, recommended_action: 'Offer extension rational-equation problems.' },
  { id: 'sample-2', full_name: 'Vihaan Reddy', email: 'vihaan@school.edu', overall_mastery: 0.78, bkt_band: 'On Track', active_tier: 'Guided', recent_misconceptions: [], needs_attention: false, recommended_action: 'Increase difficulty to independent practice.' },
  { id: 'sample-3', full_name: 'Meera Iyer', email: 'meera@school.edu', overall_mastery: 0.72, bkt_band: 'On Track', active_tier: 'Guided', recent_misconceptions: ['sign_slip'], needs_attention: false, recommended_action: 'Targeted sign-check routine before submitting.' },
  { id: 'sample-4', full_name: 'Kabir Khan', email: 'kabir@school.edu', overall_mastery: 0.66, bkt_band: 'Building', active_tier: 'Guided', recent_misconceptions: ['num_den_separate'], needs_attention: false, recommended_action: 'LCM conversion drill with worked examples.' },
  { id: 'sample-5', full_name: 'Ishita Nair', email: 'ishita@school.edu', overall_mastery: 0.58, bkt_band: 'Building', active_tier: 'Guided', recent_misconceptions: ['num_den_separate', 'sign_slip'], needs_attention: true, recommended_action: 'Small-group reteach on unlike denominators.' },
  { id: 'sample-6', full_name: 'Arjun Patel', email: 'arjun@school.edu', overall_mastery: 0.44, bkt_band: 'Building', active_tier: 'Remedial', recent_misconceptions: ['ignored_negative'], needs_attention: true, recommended_action: 'Signed number-line intervention.' },
  { id: 'sample-7', full_name: 'Diya Sharma', email: 'diya@school.edu', overall_mastery: 0.34, bkt_band: 'At Risk', active_tier: 'Remedial', recent_misconceptions: ['num_den_separate', 'ignored_negative'], needs_attention: true, recommended_action: 'One-to-one prerequisite fractions check.' },
  { id: 'sample-8', full_name: 'Rohan Das', email: 'rohan@school.edu', overall_mastery: 0.29, bkt_band: 'At Risk', active_tier: 'Remedial', recent_misconceptions: ['num_den_separate'], needs_attention: true, recommended_action: 'Tactile fraction manipulatives + daily exit ticket.' }
];

const BAND_DEFS = [
  { key: 'secure', labelEn: 'Secure (85%+)', labelTe: 'పటిష్టం (85%+)', min: 0.85, color: '#10b981' },
  { key: 'ontrack', labelEn: 'On track (70–84%)', labelTe: 'సరైన మార్గం (70–84%)', min: 0.70, color: '#00f2fe' },
  { key: 'building', labelEn: 'Building (40–69%)', labelTe: 'నిర్మాణం (40–69%)', min: 0.40, color: '#fb923c' },
  { key: 'risk', labelEn: 'At risk (<40%)', labelTe: 'ప్రమాదం (<40%)', min: 0, color: '#f43f5e' }
];

const bandIndex = (mastery) => {
  const m = Number(mastery) || 0;
  if (m >= 0.85) return 0;
  if (m >= 0.70) return 1;
  if (m >= 0.40) return 2;
  return 3;
};

export default function TeacherInsights({ cfg, lang, t, onNavigateTab }) {
  const [selectedClass, setSelectedClass] = useState('Class 8 - Section A');
  const [selectedChapter, setSelectedChapter] = useState('Rational Numbers');
  const [summary, setSummary] = useState(null);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentDetail, setStudentDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const L = (en, te) => (lang === 'te' ? te : en);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([
      api.getTeacherSummary(selectedClass, selectedChapter).catch(() => null),
      api.getTeacherStudents(selectedClass).catch(() => [])
    ])
      .then(([sumData, studentList]) => {
        if (!alive) return;
        if (sumData) setSummary(sumData);
        if (studentList && studentList.length) setStudents(studentList);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [selectedClass, selectedChapter]);

  const openStudent = async (student) => {
    setSelectedStudent(student);
    setStudentDetail(null);
    try {
      setLoadingDetail(true);
      const detail = await api.getTeacherStudentDetail(student.id);
      if (detail) setStudentDetail(detail);
    } catch (err) {
      // Offline fallback: the table row still carries enough context.
    } finally {
      setLoadingDetail(false);
    }
  };

  const data = summary || FALLBACK_SUMMARY;
  const studentsAreSample = students.length === 0;
  const cohort = studentsAreSample ? FALLBACK_STUDENTS : students;

  const conceptRows = useMemo(() => {
    const rows = data.concepts && data.concepts.length ? data.concepts : FALLBACK_SUMMARY.concepts;
    return rows
      .map((c) => {
        const val = typeof c.average_mastery_pct === 'number'
          ? c.average_mastery_pct
          : Math.round((Number(c.average_mastery) || 0) * 100);
        const color = val < 40 ? '#f43f5e' : val < 70 ? '#fb923c' : '#10b981';
        return { ...c, value: val, color };
      })
      .sort((a, b) => a.value - b.value);
  }, [data]);

  const misconceptions = (data.recurring_misconceptions && data.recurring_misconceptions.length)
    ? data.recurring_misconceptions
    : FALLBACK_SUMMARY.recurring_misconceptions;

  const priorities = (data.support_priorities && data.support_priorities.length)
    ? data.support_priorities
    : FALLBACK_SUMMARY.support_priorities;

  const bandCounts = useMemo(() => {
    const counts = [0, 0, 0, 0];
    cohort.forEach((s) => {
      counts[bandIndex(s.overall_mastery)] += 1;
    });
    return counts;
  }, [cohort]);

  const atRiskStudents = useMemo(
    () => cohort.filter((s) => s.needs_attention).sort((a, b) => (a.overall_mastery || 0) - (b.overall_mastery || 0)),
    [cohort]
  );

  const weakestConcept = conceptRows[0];
  const topMisconception = [...misconceptions].sort((a, b) => b.prevalence_percent - a.prevalence_percent)[0];
  const classAverage = typeof data.class_average_mastery_pct === 'number'
    ? data.class_average_mastery_pct
    : Math.round((Number(data.class_average_mastery) || 0) * 100);

  const statCard = (label, value, sub, color) => (
    <div className="card" style={{ margin: 0, background: 'rgba(7, 8, 10, 0.72)', border: '1px solid rgba(138, 75, 255, 0.18)' }}>
      <div className="mu" style={{ fontSize: '0.74rem', fontWeight: 700, letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: '1.85rem', fontWeight: 900, color, margin: '4px 0 2px' }}>{value}</div>
      <div className="mu" style={{ fontSize: '0.74rem' }}>{sub}</div>
    </div>
  );

  return (
    <div>
      {/* COHORT HEADER */}
      <section
        className="card"
        style={{
          background:
            'linear-gradient(135deg, rgba(138, 75, 255, 0.22) 0%, rgba(16, 17, 22, 0.97) 48%, rgba(251, 146, 60, 0.14) 100%)',
          border: '1.5px solid rgba(138, 75, 255, 0.42)',
          padding: '26px 30px'
        }}
      >
        <div className="row spaced" style={{ flexWrap: 'wrap', gap: 18 }}>
          <div style={{ flex: '1 1 460px' }}>
            <div className="row" style={{ gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
              <span className="tag purple">COHORT INTELLIGENCE</span>
              <span className="tag warn">TEACHER VIEW</span>
              <span className={`tag ${studentsAreSample ? 'warn' : 'good'}`}>
                {studentsAreSample ? L('SAMPLE COHORT FALLBACK', 'నమూనా సమూహం') : L('LIVE CLASS DATA', 'ప్రత్యక్ష తరగతి డేటా')}
              </span>
            </div>
            <h1 style={{ fontSize: '2rem', margin: '2px 0 8px', fontWeight: 900 }}>
              {L('Learning Insights', 'అభ్యాస అంతర్దృష్టులు')}
            </h1>
            <p className="mu" style={{ margin: 0, maxWidth: 780, fontSize: '0.94rem', lineHeight: 1.5 }}>
              {L(
                'Aggregated patterns across the whole class: which concepts are weak, which misconceptions are spreading, and who needs intervention first. This is not an individual student progress page.',
                'మొత్తం తరగతి సమగ్ర నమూనాలు: ఏ అంశాలు బలహీనంగా ఉన్నాయి, ఏ అపార్థాలు వ్యాపిస్తున్నాయి, ఎవరికి మొదట జోక్యం అవసరం. ఇది వ్యక్తిగత విద్యార్థి పురోగతి పేజీ కాదు.'
              )}
            </p>
            <div className="row" style={{ gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
              <span className="tag good">{data.total_students || cohort.length} {L('enrolled students', 'నమోదైన విద్యార్థులు')}</span>
              <span className="tag">{data.active_students || cohort.length} {L('active recently', 'ఇటీవల క్రియాశీలం')}</span>
              <span className="tag warn">{data.students_requiring_attention || atRiskStudents.length} {L('need attention', 'శ్రద్ధ అవసరం')}</span>
              <span className="tag purple">{L('Cohort average', 'సమూహ సగటు')}: {classAverage}%</span>
            </div>
          </div>

          <div className="row" style={{ gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <label className="mu" style={{ fontSize: '0.74rem', display: 'block', marginBottom: 3 }}>{L('Classroom', 'తరగతి')}</label>
              <select
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
                style={{ padding: '8px 12px', background: '#0b0d13', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', borderRadius: 8 }}
              >
                <option>Class 8 - Section A</option>
                <option>Class 8 - Section B</option>
                <option>All Classes</option>
              </select>
            </div>
            <div>
              <label className="mu" style={{ fontSize: '0.74rem', display: 'block', marginBottom: 3 }}>{L('Chapter', 'అధ్యాయం')}</label>
              <select
                value={selectedChapter}
                onChange={(e) => setSelectedChapter(e.target.value)}
                style={{ padding: '8px 12px', background: '#0b0d13', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', borderRadius: 8 }}
              >
                <option>Rational Numbers</option>
                <option>Linear Equations (Preview)</option>
              </select>
            </div>
          </div>
        </div>
      </section>

      {/* COHORT KPIS */}
      <div className="grid" style={{ marginTop: 20 }}>
        {statCard(L('CLASS AVERAGE', 'తరగతి సగటు'), `${classAverage}%`, L('average mastery across concepts', 'అంశాలపై సగటు నైపుణ్యం'), '#c084fc')}
        {statCard(L('ACTIVE LEARNERS', 'క్రియాశీల విద్యార్థులు'), data.active_students || cohort.length, L('engaged in the last 7 days', 'గత 7 రోజుల్లో పాల్గొన్నవారు'), '#00f2fe')}
        {statCard(L('NEED INTERVENTION', 'జోక్యం అవసరం'), data.students_requiring_attention || atRiskStudents.length, L('students below the risk line', 'ప్రమాద రేఖ కంటే తక్కువ విద్యార్థులు'), '#fb923c')}
        {statCard(L('CLASS SIGNAL', 'తరగతి సంకేతం'), weakestConcept ? `${weakestConcept.value}%` : '—', weakestConcept ? L(`weakest: ${weakestConcept.title_en}`, `బలహీనం: ${weakestConcept.title_en}`) : L('no data', 'డేటా లేదు'), '#f43f5e')}
      </div>

      {/* SIGNAL CALLOUTS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginTop: 18 }}>
        <div className="card" style={{ margin: 0, borderLeft: '4px solid #f43f5e', background: 'rgba(244, 63, 94, 0.06)' }}>
          <div className="mu" style={{ fontSize: '0.74rem', fontWeight: 700 }}>{L('LOWEST CONCEPT', 'అత్యల్ప అంశం')}</div>
          <div style={{ fontWeight: 800, fontSize: '0.98rem', marginTop: 4 }}>{weakestConcept ? weakestConcept.title_en : '—'}</div>
          <div className="mu" style={{ fontSize: '0.8rem', marginTop: 3 }}>
            {weakestConcept
              ? `${weakestConcept.value}% ${L('average mastery', 'సగటు నైపుణ్యం')} · ${weakestConcept.struggling_percent ?? 100 - weakestConcept.value}% ${L('struggling', 'కష్టపడుతున్నారు')}`
              : L('Submit attempts to populate insights.', 'అంతర్దృష్టుల కోసం ప్రయత్నాలు సమర్పించండి.')}
          </div>
        </div>

        <div className="card" style={{ margin: 0, borderLeft: '4px solid #fb923c', background: 'rgba(251, 146, 60, 0.06)' }}>
          <div className="mu" style={{ fontSize: '0.74rem', fontWeight: 700 }}>{L('TOP MISCONCEPTION', 'ప్రధాన అపార్థం')}</div>
          <div style={{ fontWeight: 800, fontSize: '0.98rem', marginTop: 4 }}>{topMisconception ? topMisconception.name : '—'}</div>
          <div className="mu" style={{ fontSize: '0.8rem', marginTop: 3 }}>
            {topMisconception
              ? `${topMisconception.prevalence_percent}% ${L('prevalence', 'వ్యాప్తి')} · ${topMisconception.student_count} ${L('students affected', 'విద్యార్థులు ప్రభావితం')}`
              : L('No recurring misconception detected.', 'పునరావృత అపార్థం కనుగొనబడలేదు.')}
          </div>
        </div>

        <div className="card" style={{ margin: 0, borderLeft: '4px solid #8a4bff', background: 'rgba(138, 75, 255, 0.06)' }}>
          <div className="mu" style={{ fontSize: '0.74rem', fontWeight: 700 }}>{L('TEACHER PRIORITY', 'ఉపాధ్యాయ ప్రాధాన్యత')}</div>
          <div style={{ fontWeight: 800, fontSize: '0.98rem', marginTop: 4 }}>{priorities[0]?.concept || '—'}</div>
          <div className="mu" style={{ fontSize: '0.8rem', marginTop: 3 }}>{priorities[0]?.issue || L('No urgent issue flagged.', 'అత్యవసర సమస్య లేదు.')}</div>
        </div>
      </div>

      {/* CONCEPT MASTERY + DISTRIBUTION */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1.35fr) minmax(300px, 1fr)', gap: 20, marginTop: 20 }}>
        <div className="card" style={{ margin: 0, border: '1px solid rgba(138, 75, 255, 0.3)' }}>
          <div className="row spaced" style={{ marginBottom: 4 }}>
            <div>
              <h3 style={{ margin: 0 }}>{L('Cohort concept mastery', 'సమూహ అంశాల నైపుణ్యం')}</h3>
              <p className="mu" style={{ margin: '4px 0 0', fontSize: '0.85rem' }}>
                {L(
                  'Ranked weakest first. Bars show the class average, not any one student.',
                  'బలహీనమైనవి మొదట. బార్లు తరగతి సగటును చూపుతాయి, ఏ ఒక్క విద్యార్థిని కాదు.'
                )}
              </p>
            </div>
            <span className="tag purple">n={data.total_students || cohort.length}</span>
          </div>

          <div style={{ marginTop: 16 }}>
            {conceptRows.map((c) => (
              <div key={c.concept_id} style={{ marginBottom: 14 }}>
                <div className="row spaced" style={{ fontSize: '0.88rem', marginBottom: 4, gap: 8 }}>
                  <span style={{ fontWeight: 600 }}>{c.title_en}</span>
                  <span className="row" style={{ gap: 6 }}>
                    <span className="tag" style={{ fontSize: '0.7rem' }}>{c.status_label}</span>
                    <b style={{ color: c.color }}>{c.value}%</b>
                  </span>
                </div>
                <div className="bar" style={{ height: 9 }}>
                  <i style={{ width: `${c.value}%`, background: c.color }} />
                </div>
                <div className="mu" style={{ fontSize: '0.72rem', marginTop: 3 }}>
                  {c.struggling_percent ?? Math.max(0, 100 - c.value)}% {L('of cohort struggling', 'సమూహం కష్టపడుతోంది')}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="card" style={{ margin: 0 }}>
            <div className="row spaced" style={{ marginBottom: 10 }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{L('Mastery distribution', 'నైపుణ్య పంపిణీ')}</h3>
              <span className="tag">{cohort.length} {L('students', 'విద్యార్థులు')}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {BAND_DEFS.map((band, i) => {
                const count = bandCounts[i];
                const width = cohort.length ? Math.round((count / cohort.length) * 100) : 0;
                return (
                  <div key={band.key}>
                    <div className="row spaced" style={{ fontSize: '0.82rem', marginBottom: 3 }}>
                      <span>{L(band.labelEn, band.labelTe)}</span>
                      <b style={{ color: band.color }}>{count} ({width}%)</b>
                    </div>
                    <div className="bar" style={{ height: 8 }}>
                      <i style={{ width: `${width}%`, background: band.color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card" style={{ margin: 0 }}>
            <div className="row spaced" style={{ marginBottom: 8 }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{L('Misconception spread', 'అపార్థ వ్యాప్తి')}</h3>
              <span className="tag warn">{misconceptions.length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {misconceptions.map((m) => (
                <div key={m.tag} className="row spaced" style={{ gap: 10, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '0.84rem', fontWeight: 600 }}>{m.name}</div>
                    <div className="mu" style={{ fontSize: '0.72rem' }}>
                      {m.student_count} {L('students', 'విద్యార్థులు')} · {m.sample_label || selectedClass}
                    </div>
                  </div>
                  <span className={`tag ${m.prevalence_percent >= 30 ? 'danger' : m.prevalence_percent >= 15 ? 'warn' : ''}`}>
                    {m.prevalence_percent}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* PRIORITY INTERVENTIONS */}
      <div className="card" style={{ marginTop: 20, border: '1px solid rgba(251, 146, 60, 0.3)' }}>
        <div className="row spaced" style={{ marginBottom: 12 }}>
          <div>
            <h3 style={{ margin: 0 }}>🚨 {L('Priority interventions for this cohort', 'ఈ సమూహానికి ప్రాధాన్య జోక్యాలు')}</h3>
            <p className="mu" style={{ margin: '4px 0 0', fontSize: '0.85rem' }}>
              {L(
                'Group-level teaching moves derived from the class pattern — different from the student’s private next-step card.',
                'తరగతి నమూనా ఆధారంగా రూపొందిన సమూహ-స్థాయి బోధన చర్యలు — విద్యార్థి వ్యక్తిగత తదుపరి అడుగు కార్డుకు భిన్నం.'
              )}
            </p>
          </div>
          <span className="tag danger">{priorities.filter((p) => p.priority === 'HIGH').length} {L('high priority', 'అధిక ప్రాధాన్యత')}</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
          {priorities.map((p, idx) => (
            <div
              key={`${p.concept}-${idx}`}
              style={{
                padding: '13px 15px',
                borderRadius: 12,
                border: `1px solid ${p.priority === 'HIGH' ? 'rgba(244,63,94,0.35)' : 'rgba(251,146,60,0.3)'}`,
                background: p.priority === 'HIGH' ? 'rgba(244,63,94,0.06)' : 'rgba(251,146,60,0.06)'
              }}
            >
              <div className="row spaced" style={{ marginBottom: 4 }}>
                <b style={{ fontSize: '0.92rem' }}>{p.concept}</b>
                <span className={`tag ${p.priority === 'HIGH' ? 'danger' : 'warn'}`}>{p.priority}</span>
              </div>
              <div className="mu" style={{ fontSize: '0.8rem', marginBottom: 6 }}>{p.issue}</div>
              <div style={{ fontSize: '0.84rem', color: '#00f2fe', lineHeight: 1.4 }}>{p.recommended_action}</div>
            </div>
          ))}
        </div>
      </div>

      {/* STUDENT WATCHLIST */}
      <div className="card" style={{ marginTop: 20 }}>
        <div className="row spaced" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h3 style={{ margin: 0 }}>{L('Student watchlist', 'విద్యార్థి పర్యవేక్షణ జాబితా')}</h3>
            <p className="mu" style={{ margin: '4px 0 0', fontSize: '0.85rem' }}>
              {L(
                'Cohort-level triage. Open a row for the teacher-only diagnostic portfolio.',
                'సమూహ-స్థాయి వర్గీకరణ. ఉపాధ్యాయ-మాత్రమే డయాగ్నస్టిక్ పోర్ట్ఫోలియో కోసం వరుసను తెరవండి.'
              )}
            </p>
          </div>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <span className="tag good">{cohort.filter((s) => !s.needs_attention).length} {L('on track', 'సరైన మార్గంలో')}</span>
            <span className="tag danger">{atRiskStudents.length} {L('need support', 'సహాయం అవసరం')}</span>
            {onNavigateTab && (
              <button className="sec" onClick={() => onNavigateTab('teacher')} style={{ fontSize: '0.8rem', padding: '5px 10px' }}>
                {L('Open full teacher dashboard', 'పూర్తి ఉపాధ్యాయ డాష్బోర్డ్ తెరవండి')} →
              </button>
            )}
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>{L('Student', 'విద్యార్థి')}</th>
                <th>{L('Mastery band', 'నైపుణ్య స్థాయి')}</th>
                <th>{L('Active tier', 'క్రియాశీల స్థాయి')}</th>
                <th>{L('Recent misconceptions', 'ఇటీవలి అపార్థాలు')}</th>
                <th>{L('Status', 'స్థితి')}</th>
                <th>{L('Recommended teacher action', 'సూచిత ఉపాధ్యాయ చర్య')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {[...cohort]
                .sort((a, b) => (b.needs_attention ? 1 : 0) - (a.needs_attention ? 1 : 0) || (a.overall_mastery || 0) - (b.overall_mastery || 0))
                .map((s) => {
                  const masteryPct = Math.round((s.overall_mastery || 0) * 100);
                  const color = masteryPct < 40 ? '#f43f5e' : masteryPct < 70 ? '#fb923c' : '#10b981';
                  return (
                    <tr key={s.id}>
                      <td>
                        <b>{s.full_name}</b>
                        <div className="mu" style={{ fontSize: '0.72rem' }}>{s.email}</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 800, color }}>{masteryPct}%</div>
                        <div className="mu" style={{ fontSize: '0.72rem' }}>{s.bkt_band}</div>
                      </td>
                      <td><span className="tag purple">{s.active_tier}</span></td>
                      <td>
                        {s.recent_misconceptions && s.recent_misconceptions.length ? (
                          s.recent_misconceptions.map((m, i) => (
                            <span key={i} className="tag warn" style={{ margin: '2px 2px 2px 0', fontSize: '0.7rem' }}>
                              {m}
                            </span>
                          ))
                        ) : (
                          <span className="mu" style={{ fontSize: '0.76rem' }}>{L('None observed', 'ఏమీ లేదు')}</span>
                        )}
                      </td>
                      <td>
                        <span className={`tag ${s.needs_attention ? 'danger' : 'good'}`}>
                          {s.needs_attention ? L('Needs help', 'సహాయం అవసరం') : L('On track', 'సరైన మార్గం')}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.8rem', color: '#cbd5e1', maxWidth: 250 }}>{s.recommended_action}</td>
                      <td>
                        <button className="sec" onClick={() => openStudent(s)} style={{ padding: '4px 8px', fontSize: '0.76rem', whiteSpace: 'nowrap' }}>
                          🔍 {L('View', 'చూడండి')}
                        </button>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

        {loading && <div className="mu" style={{ fontSize: '0.78rem', marginTop: 8 }}>{L('Refreshing class data…', 'తరగతి డేటా రిఫ్రెష్ అవుతోంది…')}</div>}
      </div>

      <div className="mu" style={{ fontSize: '0.78rem', marginTop: 16, lineHeight: 1.5 }}>
        {L(
          'Teacher insights are class-level aggregates. For comparison of diagnostic models, switch to the Author role. For individual student portfolios, open the Teacher Dashboard.',
          'ఉపాధ్యాయ అంతర్దృష్టులు తరగతి-స్థాయి సమగ్రతలు. డయాగ్నస్టిక్ నమూనాల పోలిక కోసం రచయిత పాత్రకు మారండి. వ్యక్తిగత విద్యార్థి పోర్ట్ఫోలియోల కోసం ఉపాధ్యాయ డాష్బోర్డ్ తెరవండి.'
        )}
      </div>

      {/* TEACHER-ONLY STUDENT DETAIL */}
      {selectedStudent && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.82)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: 760,
              width: '100%',
              maxHeight: '88vh',
              overflowY: 'auto',
              background: '#0d1117',
              border: '1.5px solid #8a4bff',
              boxShadow: '0 0 35px rgba(138, 75, 255, 0.32)'
            }}
          >
            <div className="row spaced" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 12 }}>
              <div>
                <span className="tag purple">{L('TEACHER-ONLY PORTFOLIO', 'ఉపాధ్యాయ-మాత్రమే పోర్ట్ఫోలియో')}</span>
                <h2 style={{ margin: '4px 0', fontSize: '1.35rem' }}>{selectedStudent.full_name}</h2>
                <div className="mu" style={{ fontSize: '0.8rem' }}>
                  {selectedStudent.email} · {selectedStudent.bkt_band} · {selectedStudent.active_tier}
                </div>
              </div>
              <button className="sec" onClick={() => { setSelectedStudent(null); setStudentDetail(null); }} style={{ padding: '4px 10px' }}>
                ✕
              </button>
            </div>

            <div className="row" style={{ gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
              <span className={`tag ${selectedStudent.needs_attention ? 'danger' : 'good'}`}>
                {Math.round((selectedStudent.overall_mastery || 0) * 100)}% {L('overall mastery', 'మొత్తం నైపుణ్యం')}
              </span>
              <span className="tag warn">{selectedStudent.recommended_action}</span>
            </div>

            {loadingDetail && <p className="mu" style={{ marginTop: 14, fontSize: '0.84rem' }}>{L('Loading diagnostic records…', 'డయాగ్నస్టిక్ రికార్డులు లోడ్ అవుతున్నాయి…')}</p>}

            {studentDetail?.concepts?.length > 0 && (
              <>
                <h4 style={{ margin: '18px 0 8px', color: '#c084fc' }}>{L('Concept mastery', 'అంశాల నైపుణ్యం')}</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
                  {studentDetail.concepts.map((c) => (
                    <div key={c.concept_id} style={{ padding: 10, borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ fontSize: '0.82rem', fontWeight: 700 }}>{c.title_en}</div>
                      <div className="row spaced" style={{ marginTop: 5 }}>
                        <span className="mu" style={{ fontSize: '0.74rem' }}>{c.bkt_band}</span>
                        <b style={{ color: c.mastery_pct < 45 ? '#fb923c' : '#10b981' }}>{c.mastery_pct}%</b>
                      </div>
                      <div className="bar" style={{ height: 4, marginTop: 4 }}>
                        <i style={{ width: `${c.mastery_pct}%`, background: c.mastery_pct < 45 ? '#fb923c' : '#10b981' }} />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {studentDetail?.diagnostics?.length > 0 && (
              <>
                <h4 style={{ margin: '18px 0 8px', color: '#fb923c' }}>{L('Diagnostic history', 'డయాగ్నస్టిక్ చరిత్ర')}</h4>
                <table>
                  <thead>
                    <tr>
                      <th>{L('Question', 'ప్రశ్న')}</th>
                      <th>{L('Gap', 'లోపం')}</th>
                      <th>{L('Outcome', 'ఫలితం')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {studentDetail.diagnostics.map((d) => (
                      <tr key={d.id}>
                        <td><code>{d.original_question}</code></td>
                        <td><span className="tag warn">{d.suspected_misconception}</span></td>
                        <td>
                          <span className={`tag ${d.reassessment_result === 'recovered' ? 'good' : 'danger'}`}>
                            {d.reassessment_result}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {!loadingDetail && !studentDetail && (
              <p className="mu" style={{ marginTop: 14, fontSize: '0.84rem', lineHeight: 1.5 }}>
                {L(
                  'Live diagnostic detail is unavailable offline. The cohort row above still shows this student’s mastery band, active tier, misconceptions, and recommended action.',
                  'ఆఫ్లైన్లో ప్రత్యక్ష డయాగ్నస్టిక్ వివరాలు అందుబాటులో లేవు. పై వరుస ఈ విద్యార్థి నైపుణ్య స్థాయి, క్రియాశీల టైర్, అపార్థాలు మరియు సూచిత చర్యను చూపుతుంది.'
                )}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
