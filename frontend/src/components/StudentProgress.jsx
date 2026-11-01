import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';

const clampPct = (value) => Math.max(0, Math.min(100, Math.round((Number(value) || 0) * 100)));

function statusFor(p, thresholds) {
  if (p >= thresholds.independent) {
    return { en: 'Secure', te: 'పటిష్టం', cls: 'good', color: '#10b981' };
  }
  if (p >= thresholds.guided) {
    return { en: 'On track', te: 'సరైన మార్గంలో', cls: '', color: '#00f2fe' };
  }
  if (p >= thresholds.foundation) {
    return { en: 'Building', te: 'నిర్మిస్తోంది', cls: 'warn', color: '#fb923c' };
  }
  return { en: 'Needs practice', te: 'సాధన అవసరం', cls: 'danger', color: '#f43f5e' };
}

function Sparkline({ values, color = '#00f2fe' }) {
  if (!values || values.length < 2) {
    return (
      <div
        className="mu"
        style={{
          height: 84,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '0.82rem',
          border: '1px dashed rgba(255,255,255,0.12)',
          borderRadius: 10
        }}
      >
        Answer practice questions to start your trajectory.
      </div>
    );
  }

  const w = 320;
  const h = 84;
  const pad = 8;
  const step = (w - pad * 2) / (values.length - 1);
  const pts = values
    .map((v, i) => {
      const x = pad + i * step;
      const y = h - pad - (Math.max(0, Math.min(100, v)) / 100) * (h - pad * 2);
      return `${x},${y}`;
    })
    .join(' ');
  const area = `${pad},${h - pad} ${pts} ${pad + (values.length - 1) * step},${h - pad}`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Mastery trajectory" style={{ width: '100%', height: 84 }}>
      <defs>
        <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
      <line x1={pad} y1={pad} x2={w - pad} y2={pad} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
      <polygon points={area} fill="url(#spark-fill)" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {values.map((v, i) => {
        const x = pad + i * step;
        const y = h - pad - (Math.max(0, Math.min(100, v)) / 100) * (h - pad * 2);
        return <circle key={i} cx={x} cy={y} r="2.6" fill={color} />;
      })}
    </svg>
  );
}

export default function StudentProgress({
  concepts,
  mastery,
  bktState,
  history,
  cfg,
  attempts,
  lang,
  t,
  onNavigateTab
}) {
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    let alive = true;
    api
      .getStudentProfile()
      .then((data) => {
        if (alive && data) setProfile(data);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const L = (en, te) => (lang === 'te' ? te : en);

  const thresholds = {
    foundation: cfg.pacingFoundation || 40,
    guided: cfg.pacingGuided || 70,
    independent: cfg.pacingIndependent || 85
  };

  const conceptRows = useMemo(
    () =>
      concepts.map((c) => {
        const p = clampPct(mastery[c.id]);
        return { ...c, p, status: statusFor(p, thresholds) };
      }),
    [concepts, mastery, thresholds.foundation, thresholds.guided, thresholds.independent]
  );

  const overallMastery = conceptRows.length
    ? Math.round(conceptRows.reduce((sum, c) => sum + c.p, 0) / conceptRows.length)
    : 0;
  const secureCount = conceptRows.filter((c) => c.p >= thresholds.independent).length;
  const attentionCount = conceptRows.filter((c) => c.p < thresholds.foundation).length;

  const attemptList = attempts || [];
  const totalAttempts = attemptList.length;
  const correctAttempts = attemptList.filter((a) => a.isCorrect).length;
  const accuracy = totalAttempts ? Math.round((correctAttempts / totalAttempts) * 100) : 0;

  let currentStreak = 0;
  for (let i = attemptList.length - 1; i >= 0; i -= 1) {
    if (attemptList[i].isCorrect) currentStreak += 1;
    else break;
  }

  const conceptNames = useMemo(() => {
    const map = {};
    concepts.forEach((c) => {
      map[c.id] = lang === 'te' ? c.te : c.en;
    });
    return map;
  }, [concepts, lang]);

  const attemptsByConcept = useMemo(() => {
    const map = {};
    attemptList.forEach((a) => {
      if (!map[a.cid]) map[a.cid] = { total: 0, correct: 0 };
      map[a.cid].total += 1;
      if (a.isCorrect) map[a.cid].correct += 1;
    });
    return map;
  }, [attemptList]);

  const recentAttempts = useMemo(
    () => [...attemptList].sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 8),
    [attemptList]
  );

  const c5 = bktState?.c5;
  const c5Hist = c5?.hist || [];
  const trajectory = useMemo(() => {
    if (!c5Hist.length) return [];
    const start =
      typeof c5Hist[0].oldP === 'number' ? c5Hist[0].oldP : Math.round((cfg.p0 || 0.3) * 100);
    return [start, ...c5Hist.map((h) => (typeof h.newP === 'number' ? h.newP : 0))];
  }, [c5Hist, cfg.p0]);

  const c5Pct = clampPct(c5?.p ?? mastery.c5 ?? cfg.p0 ?? 0.3);
  const lastDelta = c5Hist.length
    ? (c5Hist[c5Hist.length - 1].newP || 0) - (c5Hist[c5Hist.length - 1].oldP || 0)
    : 0;

  const eligibleConcepts = conceptRows.filter(
    (c) => !c.prereq || (clampPct(mastery[c.prereq]) >= thresholds.foundation)
  );
  const nextPool = (eligibleConcepts.length ? eligibleConcepts : conceptRows).filter(
    (c) => c.p < thresholds.independent
  );
  const nextConcept =
    [...(nextPool.length ? nextPool : eligibleConcepts.length ? eligibleConcepts : conceptRows)].sort(
      (a, b) => a.p - b.p
    )[0] || null;

  const nextTier = !nextConcept
    ? null
    : nextConcept.p < thresholds.foundation
      ? { en: 'Foundational scaffolding', te: 'పునాది సహాయం', cls: 'warn' }
      : nextConcept.p < thresholds.guided
        ? { en: 'Guided practice', te: 'మార్గదర్శక సాధన', cls: '' }
        : nextConcept.p < thresholds.independent
          ? { en: 'Independent practice', te: 'స్వతంత్ర సాధన', cls: 'purple' }
          : { en: 'Extension challenge', te: 'విస్తరణ సవాలు', cls: 'good' };

  const focusAreas = [...conceptRows]
    .filter((c) => c.p < thresholds.independent)
    .sort((a, b) => a.p - b.p)
    .slice(0, 3);

  const streakDays = profile?.streak_days ?? 5;
  const studentName = profile?.full_name || 'Aarav Sharma';

  const statCard = (label, value, sub, color) => (
    <div className="card" style={{ margin: 0, background: 'rgba(7, 8, 10, 0.7)' }}>
      <div className="mu" style={{ fontSize: '0.76rem', fontWeight: 700, letterSpacing: '0.04em' }}>
        {label}
      </div>
      <div style={{ fontSize: '1.85rem', fontWeight: 900, color, margin: '4px 0 2px' }}>{value}</div>
      <div className="mu" style={{ fontSize: '0.74rem' }}>{sub}</div>
    </div>
  );

  return (
    <div>
      {/* PERSONAL HEADER */}
      <section
        className="card"
        style={{
          background:
            'linear-gradient(135deg, rgba(0, 242, 254, 0.12) 0%, rgba(16, 17, 22, 0.96) 55%, rgba(138, 75, 255, 0.14) 100%)',
          border: '1.5px solid rgba(0, 242, 254, 0.35)',
          padding: '26px 30px',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        <div className="row spaced" style={{ flexWrap: 'wrap', gap: 18 }}>
          <div style={{ flex: '1 1 420px' }}>
            <div className="row" style={{ gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
              <span className="tag good">PERSONAL LEARNING PROGRESS</span>
              <span className="tag purple">ONLY VISIBLE TO YOU</span>
            </div>
            <h1 style={{ fontSize: '2rem', margin: '2px 0 8px', fontWeight: 900 }}>
              {L('Your progress,', 'మీ పురోగతి,')} <span className="glow-cyan">{studentName}</span>
            </h1>
            <p className="mu" style={{ margin: 0, maxWidth: 720, fontSize: '0.94rem', lineHeight: 1.5 }}>
              {L(
                'This page is built from your own answers, your own mastery estimates, and your own learning history — not your class average.',
                'ఈ పేజీ మీ సమాధానాలు, మీ నైపుణ్య అంచనాలు మరియు మీ అభ్యాస చరిత్ర ఆధారంగా రూపొందుతుంది — తరగతి సగటు ఆధారంగా కాదు.'
              )}
            </p>
            <div className="row" style={{ gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
              <span className="tag">👤 {studentName}</span>
              <span className="tag purple">{L('NCERT Class 8 · Rational Numbers', 'NCERT 8వ తరగతి · అకరణీయ సంఖ్యలు')}</span>
              <span className="tag good">🔥 {streakDays} {t('streak')}</span>
              <span className="tag">{L('Practice attempts', 'సాధన ప్రయత్నాలు')}: {totalAttempts}</span>
            </div>
          </div>

          <div style={{ textAlign: 'right', minWidth: 170 }}>
            <div style={{ fontSize: '0.78rem', color: 'var(--mu)', fontWeight: 700, letterSpacing: '0.05em' }}>
              {L('OVERALL MASTERY', 'మొత్తం నైపుణ్యం')}
            </div>
            <div style={{ fontSize: '3rem', fontWeight: 900, color: '#00f2fe', lineHeight: 1.05 }}>
              {overallMastery}%
            </div>
            <div className="bar" style={{ height: 9, marginTop: 8 }}>
              <i
                style={{
                  width: `${overallMastery}%`,
                  background: 'linear-gradient(90deg, #00f2fe, #8a4bff)'
                }}
              />
            </div>
            <div className="mu" style={{ fontSize: '0.78rem', marginTop: 6 }}>
              {secureCount}/{conceptRows.length} {L('concepts secure', 'అంశాలు పటిష్టం')}
            </div>
          </div>
        </div>
      </section>

      {/* MY NUMBERS */}
      <div className="grid" style={{ marginTop: 20 }}>
        {statCard(L('OVERALL MASTERY', 'మొత్తం నైపుణ్యం'), `${overallMastery}%`, L(`${secureCount} concepts secure`, `${secureCount} అంశాలు పటిష్టం`), '#00f2fe')}
        {statCard(L('ANSWER ACCURACY', 'సమాధాన ఖచ్చితత్వం'), `${accuracy}%`, `${correctAttempts}/${totalAttempts || 0} ${L('correct attempts', 'సరైన ప్రయత్నాలు')}`, '#10b981')}
        {statCard(L('CURRENT STREAK', 'ప్రస్తుత వరుస'), `${currentStreak}`, L('correct answers in a row', 'వరుసగా సరైన సమాధానాలు'), '#a855f7')}
        {statCard(L('NEEDS ATTENTION', 'శ్రద్ధ అవసరం'), `${attentionCount}`, L('concepts below foundation tier', 'పునాది స్థాయి కంటే తక్కువ అంశాలు'), attentionCount ? '#fb923c' : '#10b981')}
      </div>

      {/* CONCEPT MASTERY + TRAJECTORY */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1.35fr) minmax(300px, 1fr)', gap: 20, marginTop: 20 }}>
        <div className="card" style={{ border: '1px solid rgba(0, 242, 254, 0.25)' }}>
          <div className="row spaced" style={{ marginBottom: 4 }}>
            <div>
              <h3 style={{ margin: 0 }}>{L('My concept mastery', 'నా అంశాల నైపుణ్యం')}</h3>
              <p className="mu" style={{ margin: '4px 0 0', fontSize: '0.85rem' }}>
                {L(
                  'Each bar is your own BKT estimate, updated after every answer you submit.',
                  'ప్రతి బార్ మీ స్వంత BKT అంచనా; మీరు ఇచ్చిన ప్రతి సమాధానం తర్వాత నవీకరించబడుతుంది.'
                )}
              </p>
            </div>
            <span className="tag purple">{conceptRows.length} {L('concepts', 'అంశాలు')}</span>
          </div>

          <div style={{ marginTop: 16 }}>
            {conceptRows.map((c) => {
              const byConcept = attemptsByConcept[c.id];
              return (
                <div key={c.id} style={{ marginBottom: 14 }}>
                  <div className="row spaced" style={{ fontSize: '0.88rem', marginBottom: 4, gap: 8 }}>
                    <span style={{ fontWeight: 600 }}>{lang === 'te' ? c.te : c.en}</span>
                    <span className="row" style={{ gap: 6 }}>
                      {byConcept && (
                        <span className="mu" style={{ fontSize: '0.74rem' }}>
                          {byConcept.correct}/{byConcept.total} {L('correct', 'సరైనవి')}
                        </span>
                      )}
                      <span className={`tag ${c.status.cls}`}>{L(c.status.en, c.status.te)}</span>
                      <b style={{ color: c.status.color }}>{c.p}%</b>
                    </span>
                  </div>
                  <div className="bar" style={{ height: 9 }}>
                    <i style={{ width: `${c.p}%`, background: c.status.color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="card" style={{ margin: 0, border: '1px solid rgba(138, 75, 255, 0.3)' }}>
            <div className="row spaced" style={{ marginBottom: 6 }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{L('My BKT trajectory', 'నా BKT ప్రయాణం')}</h3>
              <span className={`tag ${lastDelta >= 0 ? 'good' : 'danger'}`}>
                {lastDelta >= 0 ? '+' : ''}
                {lastDelta}%
              </span>
            </div>
            <p className="mu" style={{ margin: '0 0 8px', fontSize: '0.82rem' }}>
              {L(
                'Adding Rationals (c5) — probability you have mastered the skill after each attempt.',
                'అకరణీయ సంఖ్యల కూడిక (c5) — ప్రతి ప్రయత్నం తర్వాత మీరు నైపుణ్యం సాధించిన సంభావ్యత.'
              )}
            </p>
            <Sparkline values={trajectory} />
            <div className="row spaced" style={{ marginTop: 10, fontSize: '0.8rem' }}>
              <span className="mu">{L('Current estimate', 'ప్రస్తుత అంచనా')}</span>
              <b style={{ color: '#00f2fe', fontSize: '1.05rem' }}>{c5Pct}%</b>
            </div>
            <div className="mu" style={{ fontSize: '0.74rem', marginTop: 2 }}>
              {c5Hist.length
                ? `${c5Hist.length} ${L('tracked attempts', 'ట్రాక్ చేసిన ప్రయత్నాలు')}`
                : L('No BKT attempts recorded yet.', 'ఇంకా BKT ప్రయత్నాలు నమోదు కాలేదు.')}
            </div>
          </div>

          <div
            className="card"
            style={{
              margin: 0,
              background: 'linear-gradient(135deg, rgba(0, 242, 254, 0.08), rgba(138, 75, 255, 0.08))',
              border: '1.5px solid rgba(0, 242, 254, 0.3)'
            }}
          >
            <div className="row" style={{ gap: 8, marginBottom: 6 }}>
              <span className="tag good">🎯 {L('MY NEXT STEP', 'నా తదుపరి అడుగు')}</span>
              {nextTier && <span className={`tag ${nextTier.cls}`}>{L(nextTier.en, nextTier.te)}</span>}
            </div>
            <h3 style={{ margin: '2px 0 6px', fontSize: '1.15rem' }}>
              {nextConcept ? (lang === 'te' ? nextConcept.te : nextConcept.en) : L('All concepts complete', 'అన్ని అంశాలు పూర్తయ్యాయి')}
            </h3>
            <p className="mu" style={{ margin: 0, fontSize: '0.84rem', lineHeight: 1.45 }}>
              {nextConcept
                ? L(
                    `Your lowest current mastery is ${nextConcept.p}%. A short focused session here will lift your overall progress fastest.`,
                    `మీ ప్రస్తుత అత్యల్ప నైపుణ్యం ${nextConcept.p}%. ఇక్కడ చిన్న లక్ష్యిత సాధన మీ మొత్తం పురోగతిని వేగంగా పెంచుతుంది.`
                  )
                : L('Keep practising to maintain your mastery.', 'మీ నైపుణ్యాన్ని నిలుపుకోవడానికి సాధన కొనసాగించండి.')}
            </p>
            <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <button className="pri" onClick={() => onNavigateTab && onNavigateTab('student')} style={{ fontSize: '0.84rem', padding: '8px 14px' }}>
                🚀 {L('Practice now', 'ఇప్పుడు సాధన చేయండి')}
              </button>
              <button className="sec" onClick={() => onNavigateTab && onNavigateTab('detective')} style={{ fontSize: '0.84rem', padding: '8px 14px' }}>
                🔍 {L('Find my mistakes', 'నా తప్పులు కనుగొనండి')}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* FOCUS AREAS + ACTIVITY */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) minmax(320px, 1.3fr)', gap: 20, marginTop: 20 }}>
        <div className="card" style={{ margin: 0 }}>
          <div className="row spaced" style={{ marginBottom: 10 }}>
            <h3 style={{ margin: 0, fontSize: '1.15rem' }}>{L('My focus areas', 'నా దృష్టి ప్రాంతాలు')}</h3>
            <span className="tag warn">{focusAreas.length}</span>
          </div>
          {focusAreas.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {focusAreas.map((c, idx) => (
                <div
                  key={c.id}
                  style={{
                    padding: '12px 14px',
                    borderRadius: 12,
                    border: `1px solid ${c.status.color}45`,
                    background: `${c.status.color}0d`
                  }}
                >
                  <div className="row spaced" style={{ gap: 8 }}>
                    <b style={{ fontSize: '0.9rem' }}>
                      {idx + 1}. {lang === 'te' ? c.te : c.en}
                    </b>
                    <span style={{ color: c.status.color, fontWeight: 800 }}>{c.p}%</span>
                  </div>
                  <div className="mu" style={{ fontSize: '0.78rem', marginTop: 4 }}>
                    {L(
                      c.p < thresholds.foundation
                        ? 'Start with the visual foundation activity before independent questions.'
                        : c.p < thresholds.guided
                          ? 'Use guided practice with hints, then retry without hints.'
                          : 'Try independent questions to push this concept to secure.',
                      c.p < thresholds.foundation
                        ? 'స్వతంత్ర ప్రశ్నలకు ముందు దృశ్య పునాది కార్యకలాపంతో ప్రారంభించండి.'
                        : c.p < thresholds.guided
                          ? 'సూచనలతో మార్గదర్శక సాధన చేయండి, తర్వాత సూచనలు లేకుండా మళ్లీ ప్రయత్నించండి.'
                          : 'ఈ అంశాన్ని పటిష్టం చేయడానికి స్వతంత్ర ప్రశ్నలు ప్రయత్నించండి.'
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mu" style={{ fontStyle: 'italic', fontSize: '0.88rem' }}>
              {L('Every concept is at or above the independent tier. Great work!', 'ప్రతి అంశం స్వతంత్ర స్థాయిలో లేదా అంతకంటే ఎక్కువగా ఉంది. అద్భుతం!')}
            </p>
          )}
        </div>

        <div className="card" style={{ margin: 0 }}>
          <div className="row spaced" style={{ marginBottom: 10 }}>
            <h3 style={{ margin: 0, fontSize: '1.15rem' }}>{L('My recent activity', 'నా ఇటీవలి కార్యకలాపం')}</h3>
            <span className="tag">{totalAttempts} {L('attempts', 'ప్రయత్నాలు')}</span>
          </div>

          {recentAttempts.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {recentAttempts.map((a) => (
                <div
                  key={a.id}
                  className="row spaced"
                  style={{
                    padding: '9px 12px',
                    borderRadius: 10,
                    background: a.isCorrect ? 'rgba(16, 185, 129, 0.08)' : 'rgba(244, 63, 94, 0.08)',
                    border: `1px solid ${a.isCorrect ? 'rgba(16,185,129,0.3)' : 'rgba(244,63,94,0.3)'}`,
                    gap: 10
                  }}
                >
                  <div className="row" style={{ gap: 8, minWidth: 0 }}>
                    <span style={{ fontSize: '1rem' }}>{a.isCorrect ? '✓' : '✗'}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {conceptNames[a.cid] || a.cid}
                      </div>
                      <div className="mu" style={{ fontSize: '0.72rem' }}>
                        {a.ts ? new Date(a.ts).toLocaleString(lang === 'te' ? 'te-IN' : 'en-IN') : L('Just now', 'ఇప్పుడే')}
                      </div>
                    </div>
                  </div>
                  <span className={`tag ${a.isCorrect ? 'good' : 'danger'}`}>
                    {a.isCorrect ? L('Correct', 'సరైనది') : L('Mistake', 'తప్పు')}
                  </span>
                </div>
              ))}
            </div>
          ) : history && history.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {history.slice(0, 8).map((h, i) => (
                <div key={i} className="mu" style={{ fontSize: '0.82rem', padding: '7px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.03)' }}>
                  {h}
                </div>
              ))}
            </div>
          ) : (
            <p className="mu" style={{ fontStyle: 'italic', fontSize: '0.88rem', lineHeight: 1.5 }}>
              {L(
                'No attempts recorded yet on this device. Answer a practice question or complete a detective case to start building your personal history.',
                'ఈ పరికరంలో ఇంకా ప్రయత్నాలు నమోదు కాలేదు. మీ వ్యక్తిగత చరిత్రను ప్రారంభించడానికి ఒక సాధన ప్రశ్నకు సమాధానం ఇవ్వండి లేదా డిటెక్టివ్ కేసును పూర్తి చేయండి.'
              )}
            </p>
          )}
        </div>
      </div>

      <div className="mu" style={{ fontSize: '0.78rem', marginTop: 16, lineHeight: 1.5 }}>
        {L(
          'Personal progress view · Calculated from your own attempt stream. Your teacher sees aggregated class insights, never this private page.',
          'వ్యక్తిగత పురోగతి వీక్షణ · మీ స్వంత ప్రయత్నాల ఆధారంగా లెక్కించబడుతుంది. మీ ఉపాధ్యాయుడు తరగతి సమగ్ర అంతర్దృష్టులను మాత్రమే చూస్తారు, ఈ వ్యక్తిగత పేజీని ఎప్పుడూ చూడరు.'
        )}
      </div>
    </div>
  );
}
