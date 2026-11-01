import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import CinematicHero from './components/CinematicHero';
import StudentView from './components/StudentView';
import LearningDetective from './components/LearningDetective';
import LearningGalaxy from './components/LearningGalaxy';
import MathLab from './components/MathLab';
import TeacherDashboard from './components/TeacherDashboard';
import ContentAuthoring from './components/ContentAuthoring';
import LessonPlanner from './components/LessonPlanner';
import ModelComparison from './components/ModelComparison';
import StudentProgress from './components/StudentProgress';
import TeacherInsights from './components/TeacherInsights';
import WalkthroughTour from './components/WalkthroughTour';
import { translations } from './i18n/translations';
import { saveAttemptOffline, getOfflineAttempts, removeOfflineAttempt } from './services/idb';

export default function App() {
  const [lang, setLang] = useState('en');
  const [activeTab, setActiveTab] = useState('hero');
  const [role, setRole] = useState('student');
  // Topic currently loaded in the 3D Math Lab (set from the Learning Universe
  // or from the lab's own topic chooser).
  const [labTopic, setLabTopic] = useState('c5');

  // Redirect legacy 'about' tab to 'hero'
  useEffect(() => {
    if (activeTab === 'about') setActiveTab('hero');
  }, [activeTab]);
  const [online, setOnline] = useState(true);
  const [lowBandwidth, setLowBandwidth] = useState(false);

  // Guided tours
  const [showTour, setShowTour] = useState(false);

  // Adaptive thresholds & BKT priors (Judge Recommendations 1, 3, 5)
  const [cfg, setCfg] = useState({
    up: 2,
    down: 2,
    help: 3,
    thr: 30,
    p0: 0.30,
    transition: 0.15,
    slip: 0.10,
    guess: 0.25,
    pacingFoundation: 40,
    pacingGuided: 70,
    pacingIndependent: 85
  });

  // NCERT Concepts
  const concepts = [
    { id: 'c0', en: 'Integers & Directed Numbers', te: 'పూర్ణాంకాలు & సంఖ్యా రేఖ', prereq: null },
    { id: 'c1', en: 'Fractions & Equivalent Forms', te: 'భిన్నాలు & సమాన రూపాలు', prereq: 'c0' },
    { id: 'c2', en: 'LCM & Common Denominators', te: 'క.సా.గు & ఉమ్మడి హారాలు', prereq: 'c1' },
    { id: 'c3', en: 'Rational Meaning (p/q, q≠0)', te: 'అకరణీయ సంఖ్యల నిర్వచనం', prereq: 'c1' },
    { id: 'c4', en: 'Comparing Rational Numbers', te: 'అకరణీయ సంఖ్యల పోలిక', prereq: 'c3' },
    { id: 'c5', en: 'Adding Rationals (Unlike Denominators)', te: 'వేర్వేరు హారాలు గల కూడిక', prereq: 'c2' },
    { id: 'c6', en: 'Multiplication & Division of Rationals', te: 'గుణకారం & భాగహారం', prereq: 'c5' }
  ];

  // Concept masteries
  const [mastery, setMastery] = useState({
    c0: 0.80, c1: 0.50, c2: 0.40, c3: 0.60, c4: 0.30, c5: 0.25, c6: 0.10
  });

  // Rule State & BKT State per concept
  const [ruleState, setRuleState] = useState({
    c5: { lvl: 1, sc: 0, sw: 0, path: 'Focused practice', reason: 'Baseline initialized' }
  });

  const [bktState, setBktState] = useState({
    c5: { p: 0.25, hist: [] }
  });

  // Offline queue and sync
  const [queue, setQueue] = useState([]);
  const [syncedIds, setSyncedIds] = useState(new Set());
  const [history, setHistory] = useState([]);
  const [attempts, setAttempts] = useState([]);

  // Teacher Action Cards
  const [cards, setCards] = useState([
    {
      id: 101,
      student: 'Sample Cohort Aggregate (n=40)',
      concept: 'Adding Rationals (Unlike Denominators)',
      obs: '38% of 40 sample students chose “Added numerators and denominators separately” (-1/3). Follow-ups supported it.',
      rule: 'Misconception prevalence ≥ teacher threshold (30%)',
      act: 'Conduct 15-min tactile fraction manipulative lesson; assign LCM number-line exercises.',
      reassess: 'pending',
      st: 'pending',
      sample: true
    }
  ]);

  // Question Authoring Pool
  const [questions, setQuestions] = useState([
    {
      id: 'Q1',
      concept: 'c5',
      stem_en: '(-3/4) + (1/2) = ?',
      stem_te: '(-3/4) + (1/2) = ?',
      diff: 2,
      opts: [
        { text: '-1/4', correct: true, tag: null, exp_en: 'Correct. (-3/4) + (2/4) = -1/4.', exp_te: 'సరైనది.' },
        { text: '-1/3', correct: false, tag: 'num_den_separate', exp_en: 'Added tops & bottoms: (-3+1)/(4+2) = -2/6 = -1/3.', exp_te: 'లవాలు మరియు హారాలను విడివిడిగా కూడారు.' },
        { text: '5/4', correct: false, tag: 'ignored_negative', exp_en: 'Ignored negative sign: 3/4 + 2/4 = 5/4.', exp_te: 'రుణ గుర్తును విస్మరించారు.' },
        { text: '1/4', correct: false, tag: 'sign_slip', exp_en: 'Sign error in final sum (+1/4 instead of -1/4).', exp_te: 'గుర్తు గణనలో పొరపాటు.' }
      ],
      hint_en: 'Find the LCM of 4 and 2 before adding.',
      hint_te: 'కూడే ముందు 4 మరియు 2 ల క.సా.గు కనుగొనండి.',
      sol_en: '1/2 = 2/4. (-3/4) + (2/4) = (-3 + 2)/4 = -1/4.',
      sol_te: '1/2 = 2/4. (-3/4) + (2/4) = (-3 + 2)/4 = -1/4.',
      st: 'published',
      v: [{ v: 1, note: 'Initial reviewed curriculum seed', date: '2026-10-20' }]
    },
    {
      id: 'Q2',
      concept: 'c5',
      stem_en: '(-1/2) + (1/4) = ?',
      stem_te: '(-1/2) + (1/4) = ?',
      diff: 2,
      opts: [
        { text: '-1/4', correct: true, tag: null, exp_en: 'Correct: -2/4 + 1/4 = -1/4.', exp_te: 'సరైనది.' },
        { text: '-2/6', correct: false, tag: 'num_den_separate', exp_en: 'Added tops and bottoms.', exp_te: 'లవాలు హారాలు విడివిడిగా కూడారు.' },
        { text: '3/4', correct: false, tag: 'ignored_negative', exp_en: 'Dropped negative sign.', exp_te: 'రుణ గుర్తును వదిలేశారు.' },
        { text: '1/4', correct: false, tag: 'sign_slip', exp_en: 'Calculation sign slip.', exp_te: 'గుర్తులో పొరపాటు.' }
      ],
      hint_en: 'Convert -1/2 to fourths.',
      hint_te: '-1/2 ను నాల్గవ వంతులుగా మార్చండి.',
      sol_en: '(-2/4) + (1/4) = -1/4.',
      sol_te: '(-2/4) + (1/4) = -1/4.',
      st: 'reviewed',
      v: [{ v: 1, note: 'Reviewed by teacher', date: '2026-10-22' }]
    }
  ]);

  // Translation helper
  const t = (k) => translations[lang]?.[k] || k;

  // Load offline attempts on mount
  useEffect(() => {
    getOfflineAttempts().then((stored) => {
      if (stored && stored.length) setQueue(stored);
    });
  }, []);

  // Sync queue handler
  const handleSyncQueue = () => {
    if (!online || queue.length === 0) return;
    queue.forEach((item) => {
      if (!syncedIds.has(item.id)) {
        syncedIds.add(item.id);
        removeOfflineAttempt(item.id);
      }
    });
    setSyncedIds(new Set(syncedIds));
    setQueue([]);
  };

  useEffect(() => {
    if (online) handleSyncQueue();
  }, [online]);

  // BKT mathematical update
  const bktUpdate = (p, isCorrect) => {
    const pSafe = Math.max(0.001, Math.min(0.999, p));
    let post;
    if (isCorrect) {
      const num = pSafe * (1 - cfg.slip);
      const den = num + (1 - pSafe) * cfg.guess;
      post = num / Math.max(1e-9, den);
    } else {
      const num = pSafe * cfg.slip;
      const den = num + (1 - pSafe) * (1 - cfg.guess);
      post = num / Math.max(1e-9, den);
    }
    const updated = post + (1 - post) * cfg.transition;
    return Math.max(0.001, Math.min(0.999, updated));
  };

  // Record an attempt
  const handleRecordAttempt = (cid, isCorrect, isReassessment = false) => {
    const id = crypto.randomUUID ? crypto.randomUUID() : `att_${Date.now()}_${Math.random()}`;
    const attempt = { id, cid, isCorrect, ts: Date.now() };

    setQueue((prev) => [...prev, attempt]);
    saveAttemptOffline(attempt);

    // Update BKT
    const currentBkt = bktState[cid] || { p: mastery[cid] || 0.3, hist: [] };
    const oldP = currentBkt.p;
    const newP = bktUpdate(oldP, isCorrect);

    setBktState((prev) => ({
      ...prev,
      [cid]: {
        p: newP,
        hist: [
          ...currentBkt.hist,
          {
            isCorrect,
            oldP: Math.round(oldP * 100),
            newP: Math.round(newP * 100),
            time: new Date().toLocaleTimeString()
          }
        ]
      }
    }));

    setMastery((prev) => ({ ...prev, [cid]: newP }));

    // Update Rule State
    const currentRule = ruleState[cid] || { lvl: 1, sc: 0, sw: 0, path: 'Focused practice', reason: 'Initialized' };
    const newSc = isCorrect ? currentRule.sc + 1 : 0;
    const newSw = isCorrect ? 0 : currentRule.sw + 1;

    let path = 'Focused practice';
    let why = isCorrect ? `Correct answer logged (${newSc}/${cfg.up} to advance).` : `Single error logged (${newSw}/${cfg.down} to prerequisite).`;
    let newLvl = currentRule.lvl;

    if (isReassessment && isCorrect) {
      path = 'Progression - Recovery Verified';
      why = 'Fresh reassessment answered correctly after targeted support.';
    } else if (isReassessment && !isCorrect) {
      path = 'Request teacher help';
      why = 'Persistent difficulty: Fresh reassessment failed.';
      newLvl = Math.max(1, newLvl - 1);
    } else if (newSw >= cfg.help) {
      path = 'Request teacher help';
      why = `${newSw} wrong answers in a row met help threshold (${cfg.help}).`;
      newLvl = Math.max(1, newLvl - 1);
    } else if (newSw >= cfg.down) {
      path = 'Revisit prerequisite';
      why = `Wrong streak (${newSw}) reached prerequisite threshold (${cfg.down}).`;
      newLvl = Math.max(1, newLvl - 1);
    } else if (newSc >= cfg.up) {
      path = 'Harder questions';
      why = `${newSc} correct answers in a row reached advancement threshold (${cfg.up}).`;
      newLvl = Math.min(3, newLvl + 1);
    }

    setRuleState((prev) => ({
      ...prev,
      [cid]: { lvl: newLvl, sc: newSc, sw: newSw, path, reason: why }
    }));

    setHistory((prev) => [
      `${new Date().toLocaleTimeString()} · [${cid}] ${isCorrect ? '✓' : '✗'} → ${path}`,
      ...prev.slice(0, 19)
    ]);

    setAttempts((prev) => [...prev, attempt].slice(-500));
  };

  const handleCardStatus = (id, st) => {
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, st } : c)));
  };

  const handleCardEdit = (id) => {
    const c = cards.find((x) => x.id === id);
    if (!c) return;
    const next = prompt('Edit suggested action for teacher:', c.act);
    if (next && next.trim()) {
      setCards((prev) =>
        prev.map((x) => (x.id === id ? { ...x, act: next.trim(), st: 'accepted' } : x))
      );
    }
  };

  const handleUpdateQuestion = (qi, field, val) => {
    setQuestions((prev) =>
      prev.map((q, i) =>
        i === qi
          ? {
              ...q,
              [field]: val,
              st: 'draft',
              v: [
                ...q.v,
                { v: q.v.length + 1, note: `Edited ${field} → reset to draft`, date: new Date().toISOString().split('T')[0] }
              ]
            }
          : q
      )
    );
  };

  const handleDuplicateQuestion = (qi) => {
    const src = questions[qi];
    const copy = JSON.parse(JSON.stringify(src));
    copy.id = `${src.id}_copy`;
    copy.st = 'draft';
    copy.v = [{ v: 1, note: `Duplicated from ${src.id}`, date: new Date().toISOString().split('T')[0] }];
    setQuestions((prev) => [...prev, copy]);
  };

  const handleAdvanceStatus = (qi) => {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qi) return q;
        const nextSt = q.st === 'draft' ? 'reviewed' : 'published';
        return {
          ...q,
          st: nextSt,
          v: [...q.v, { v: q.v.length + 1, note: `Status advanced to ${nextSt}`, date: new Date().toISOString().split('T')[0] }]
        };
      })
    );
  };

  const handleCreateQuestion = () => {
    const newId = `Q${questions.length + 1}`;
    setQuestions((prev) => [
      ...prev,
      {
        id: newId,
        concept: 'c5',
        stem_en: 'New rational addition problem',
        stem_te: 'కొత్త అకరణీయ సంఖ్యల కూడిక ప్రశ్న',
        diff: 2,
        opts: [
          { text: '1/2', correct: true, tag: null, exp_en: 'Correct sum', exp_te: 'సరైనది' },
          { text: '2/5', correct: false, tag: 'num_den_separate', exp_en: 'Added tops & bottoms', exp_te: 'విడివిడిగా కూడారు' }
        ],
        hint_en: 'Find LCM of denominators',
        hint_te: 'హారాల క.సా.గు కనుగొనండి',
        sol_en: 'Step-by-step conversion',
        sol_te: 'దశలవారీగా పరిష్కారం',
        st: 'draft',
        v: [{ v: 1, note: 'Initial draft created', date: new Date().toISOString().split('T')[0] }]
      }
    ]);
  };

  const handleReportQuestion = (qi) => {
    const q = questions[qi];
    const issue = prompt(`Report correction for ${q.id} (e.g. typo, bad translation):`);
    if (issue) {
      setQuestions((prev) =>
        prev.map((item, i) =>
          i === qi
            ? {
                ...item,
                v: [
                  ...item.v,
                  { v: item.v.length + 1, note: `Correction Report: "${issue}"`, date: new Date().toISOString().split('T')[0] }
                ]
              }
            : item
        )
      );
      alert('Correction report submitted to curriculum review queue.');
    }
  };

  const handleDeleteQuestion = (qi) => {
    const q = questions[qi];
    if (!q) return;
    const confirmDelete = window.confirm(
      `Are you sure you want to delete question "${q.id}" (${q.stem_en})? This will permanently remove it and its version history.`
    );
    if (confirmDelete) {
      setQuestions((prev) => prev.filter((_, i) => i !== qi));
    }
  };

  return (
    <div>
      <Header
        lang={lang}
        setLang={setLang}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        role={role}
        setRole={setRole}
        online={online}
        setOnline={setOnline}
        lowBandwidth={lowBandwidth}
        setLowBandwidth={setLowBandwidth}
        t={t}
      />

      <main role="main">
        {activeTab === 'hero' && (
          <CinematicHero
            lang={lang}
            t={t}
            lowBandwidth={lowBandwidth}
            onStartLearning={() => setActiveTab('student')}
            onExploreUniverse={() => setActiveTab('galaxy')}
            onOpenDetective={() => setActiveTab('detective')}
          />
        )}

        {activeTab === 'student' && (
          <StudentView
            concepts={concepts}
            mastery={mastery}
            ruleState={ruleState}
            bktState={bktState}
            queue={queue}
            syncedCount={syncedIds.size}
            history={history}
            cfg={cfg}
            lang={lang}
            t={t}
            lowBandwidth={lowBandwidth}
            onAnswerPractice={(cid, ok) => handleRecordAttempt(cid, ok, false)}
            onLaunchDetective={() => setActiveTab('detective')}
            onOpenTour={() => setShowTour(true)}
            onSyncNow={handleSyncQueue}
            onNavigateTab={setActiveTab}
          />
        )}

        {activeTab === 'galaxy' && (
          <LearningGalaxy
            mastery={mastery}
            concepts={concepts}
            lang={lang}
            t={t}
            onSelectTopic={(topicId) => {
              setLabTopic(topicId);
              setActiveTab('mathLab');
            }}
          />
        )}

        {activeTab === 'mathLab' && (
          <MathLab
            lang={lang}
            t={t}
            mastery={mastery}
            topicId={labTopic}
            onSelectTopic={setLabTopic}
            onAnswer={(cid, ok) => handleRecordAttempt(cid, ok, false)}
            onReturnToGalaxy={() => setActiveTab('galaxy')}
          />
        )}

        {activeTab === 'detective' && (
          <LearningDetective
            lang={lang}
            t={t}
            onCompleteCase={(cid, ok, isReassess) => handleRecordAttempt(cid, ok, isReassess)}
            onRaiseActionCard={(card) => setCards((prev) => [card, ...prev])}
            onReturnToDashboard={() => setActiveTab('student')}
          />
        )}

        {activeTab === 'teacher' && (
          <TeacherDashboard
            cards={cards}
            cfg={cfg}
            onUpdateCfg={setCfg}
            onCardStatus={handleCardStatus}
            onCardEdit={handleCardEdit}
            onOpenTour={() => setShowTour(true)}
          />
        )}

        {activeTab === 'content' && (
          <LessonPlanner
            lang={lang}
            t={t}
            questions={questions}
            onUpdateQuestion={handleUpdateQuestion}
            onDuplicateQuestion={handleDuplicateQuestion}
            onAdvanceStatus={handleAdvanceStatus}
            onCreateQuestion={handleCreateQuestion}
            onReportQuestion={handleReportQuestion}
            onDeleteQuestion={handleDeleteQuestion}
          />
        )}

        {activeTab === 'compare' && (
          role === 'teacher' ? (
            <TeacherInsights
              cfg={cfg}
              lang={lang}
              t={t}
              onNavigateTab={setActiveTab}
            />
          ) : role === 'student' ? (
            <StudentProgress
              concepts={concepts}
              mastery={mastery}
              bktState={bktState}
              history={history}
              cfg={cfg}
              attempts={attempts}
              lang={lang}
              t={t}
              onNavigateTab={setActiveTab}
            />
          ) : (
            <ModelComparison cfg={cfg} bktUpdate={bktUpdate} />
          )
        )}
      </main>

      {showTour && <WalkthroughTour onClose={() => setShowTour(false)} />}
    </div>
  );
}
