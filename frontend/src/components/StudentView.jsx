import React, { useState, useEffect } from 'react';
import Cube3D from './Cube3D';
import MasteryCrystal from './MasteryCrystal';
import { api } from '../services/api';

export default function StudentView({
  concepts,
  mastery,
  ruleState,
  bktState,
  queue,
  syncedCount,
  history,
  cfg,
  lang,
  t,
  lowBandwidth,
  onAnswerPractice,
  onLaunchDetective,
  onOpenTour,
  onSyncNow,
  onNavigateTab
}) {
  const [practiceIdx, setPracticeIdx] = useState(0);
  const [selectedTopic, setSelectedTopic] = useState('all');
  const [showHint, setShowHint] = useState(false);
  const [selectedOption, setSelectedOption] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [simulatedPathOverride, setSimulatedPathOverride] = useState(null);
  
  // Real Student Profile State from Backend API
  const [profile, setProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(false);

  // Audio / Speech State
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceNotice, setVoiceNotice] = useState('');

  // Fetch real student profile on mount and update
  const fetchProfile = async () => {
    try {
      setLoadingProfile(true);
      const data = await api.getStudentProfile();
      if (data) setProfile(data);
    } catch (err) {
      // Offline fallback: continue smoothly with local states
    } finally {
      setLoadingProfile(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [practiceIdx, syncedCount]);

  const allPracticeQuestions = [
    {
      topic: 'c5',
      topic_name_en: 'Adding Rationals with Unlike Denominators',
      topic_name_te: 'అకరణీయ సంఖ్యల సంకలనం',
      stem_en: '(-1/2) + (1/4) = ?',
      stem_te: 'గణించండి: (-1/2) + (1/4) = ?',
      tier: 'guided',
      hint_en: 'Find the LCM of 2 and 4 to equalize the denominators.',
      hint_te: 'హారాలను సమానం చేయడానికి 2 మరియు 4 ల క.సా.గు కనుగొనండి.',
      options: [
        { text: '-1/4', correct: true, exp_en: 'Correct! -2/4 + 1/4 = -1/4.', exp_te: 'సరైనది! -2/4 + 1/4 = -1/4.' },
        { text: '-2/6', correct: false, exp_en: 'Added numerators & denominators separately.', exp_te: 'లవాలు మరియు హారాలను విడివిడిగా కూడారు.' },
        { text: '3/4', correct: false, exp_en: 'Dropped the negative sign.', exp_te: 'రుణ గుర్తును విస్మరించారు.' },
        { text: '1/4', correct: false, exp_en: 'Calculation sign slip (+1/4 instead of -1/4).', exp_te: 'గుర్తు గణనలో పొరపాటు.' }
      ]
    },
    {
      topic: 'c5',
      topic_name_en: 'Adding Rationals with Unlike Denominators',
      topic_name_te: 'అకరణీయ సంఖ్యల సంకలనం',
      stem_en: '(-5/6) + (1/3) = ?',
      stem_te: 'గణించండి: (-5/6) + (1/3) = ?',
      tier: 'guided',
      hint_en: 'The LCM of 6 and 3 is 6. Convert 1/3 to 2/6.',
      hint_te: '6 మరియు 3 ల క.సా.గు 6. 1/3 ను 2/6 గా మార్చండి.',
      options: [
        { text: '-1/2', correct: true, exp_en: 'Correct! -5/6 + 2/6 = -3/6 = -1/2.', exp_te: 'సరైనది! -5/6 + 2/6 = -3/6 = -1/2.' },
        { text: '-4/9', correct: false, exp_en: 'Added tops & bottoms separately (-5+1)/(6+3).', exp_te: 'లవాలు హారాలు విడివిడిగా కూడారు.' },
        { text: '-7/6', correct: false, exp_en: 'Subtracted instead of adding.', exp_te: 'కూడటానికి బదులుగా తీసివేత చేశారు.' },
        { text: '1/6', correct: false, exp_en: 'Sign error.', exp_te: 'గుర్తు లోపం.' }
      ]
    },
    {
      topic: 'c2',
      topic_name_en: 'Equivalent Fractions & LCM',
      topic_name_te: 'సమాన భిన్నాలు & క.సా.గు',
      stem_en: 'Which fraction is equivalent to 3/4?',
      stem_te: '3/4 కు సమానమైన భిన్నం ఏది?',
      tier: 'independent',
      hint_en: 'Multiply both numerator and denominator by the same non-zero integer.',
      hint_te: 'లవం మరియు హారం రెండింటినీ ఒకే సంఖ్యతో గుణించండి.',
      options: [
        { text: '9/12', correct: true, exp_en: 'Correct! (3×3)/(4×3) = 9/12.', exp_te: 'సరైనది! (3×3)/(4×3) = 9/12.' },
        { text: '5/6', correct: false, exp_en: 'Added 2 to top and bottom (3+2)/(4+2) = 5/6.', exp_te: 'లవానికి హారానికి 2 కూడారు.' },
        { text: '4/3', correct: false, exp_en: 'Inverted the fraction (reciprocal).', exp_te: 'భిన్నాన్ని తిరగరాశారు (వ్యుత్క్రమం).' },
        { text: '3/8', correct: false, exp_en: 'Doubled denominator only.', exp_te: 'హారాన్ని మాత్రమే రెట్టింపు చేశారు.' }
      ]
    },
    {
      topic: 'c4',
      topic_name_en: 'Signed Rationals & Number Line',
      topic_name_te: 'రుణ అకరణీయ సంఖ్యలు & సంఖ్యా రేఖ',
      stem_en: 'Evaluate: (-2/5) - (-1/5) = ?',
      stem_te: 'గణించండి: (-2/5) - (-1/5) = ?',
      tier: 'guided',
      hint_en: 'Subtracting a negative number is equivalent to adding: a - (-b) = a + b.',
      hint_te: 'రుణ సంఖ్యను తీసివేయడం అంటే కూడటమే: a - (-b) = a + b.',
      options: [
        { text: '-1/5', correct: true, exp_en: 'Correct! -2/5 + 1/5 = -1/5.', exp_te: 'సరైనది! -2/5 + 1/5 = -1/5.' },
        { text: '-3/5', correct: false, exp_en: 'Dropped double negative rule: -2 - 1 = -3.', exp_te: 'గుర్తు నియమాన్ని విస్మరించి -2 - 1 = -3 చేశారు.' },
        { text: '1/5', correct: false, exp_en: 'Calculation sign slip.', exp_te: 'గణనలో గుర్తు పొరపాటు.' },
        { text: '3/5', correct: false, exp_en: 'Dropped all negatives.', exp_te: 'అన్ని గుర్తులను తొలగించారు.' }
      ]
    },
    {
      topic: 'c6',
      topic_name_en: 'Multiplication & Division of Rationals',
      topic_name_te: 'అకరణీయ సంఖ్యల గుణకారం & భాగహారం',
      stem_en: '(2/3) ÷ (4/5) = ?',
      stem_te: 'గణించండి: (2/3) ÷ (4/5) = ?',
      tier: 'independent',
      hint_en: 'Multiply by the reciprocal of the second fraction.',
      hint_te: 'రెండవ భిన్నం యొక్క వ్యుత్క్రమంతో గుణించండి.',
      options: [
        { text: '5/6', correct: true, exp_en: 'Correct! (2/3) × (5/4) = 10/12 = 5/6.', exp_te: 'సరైనది! (2/3) × (5/4) = 10/12 = 5/6.' },
        { text: '8/15', correct: false, exp_en: 'Multiplied straight across without reciprocating.', exp_te: 'తిరగరాయకుండా నేరుగా గుణించారు.' },
        { text: '6/5', correct: false, exp_en: 'Inverted first fraction instead of divisor.', exp_te: 'మొదటి భిన్నాన్ని తిరగరాశారు.' },
        { text: '2/5', correct: false, exp_en: 'Arithmetic mistake.', exp_te: 'గణన లోపం.' }
      ]
    }
  ];

  const filteredPracticeQuestions = allPracticeQuestions.filter(
    (q) => selectedTopic === 'all' || q.topic === selectedTopic
  );

  const practiceQuestions = filteredPracticeQuestions.length > 0 ? filteredPracticeQuestions : allPracticeQuestions;
  const currentQ = practiceQuestions[practiceIdx % practiceQuestions.length];

  // Text-To-Speech (Read Aloud) Helper
  const handleReadAloud = (textToSpeak) => {
    if (!('speechSynthesis' in window)) {
      alert('Speech synthesis is not supported on this browser.');
      return;
    }
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.lang = lang === 'te' ? 'te-IN' : 'en-IN';
    utterance.rate = 0.92;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);
  };

  // Speech-To-Text (Voice Input) Helper
  const handleVoiceInput = () => {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      alert('Speech recognition is not supported on this browser. Try Google Chrome or Edge.');
      return;
    }

    if (isListening) return;

    try {
      const recognition = new SpeechRec();
      recognition.lang = lang === 'te' ? 'te-IN' : 'en-IN';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsListening(true);
        setVoiceNotice(t('listening'));
      };

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript.trim().toLowerCase();
        setVoiceNotice(`Heard: "${transcript}"`);

        // Check if student spoke an option (Option A, B, C, D or text)
        let matchedOpt = null;
        if (transcript.includes('option a') || transcript === 'a' || transcript === 'one') matchedOpt = currentQ.options[0];
        else if (transcript.includes('option b') || transcript === 'b' || transcript === 'two') matchedOpt = currentQ.options[1];
        else if (transcript.includes('option c') || transcript === 'c' || transcript === 'three') matchedOpt = currentQ.options[2];
        else if (transcript.includes('option d') || transcript === 'd' || transcript === 'four') matchedOpt = currentQ.options[3];
        else {
          matchedOpt = currentQ.options.find(o => transcript.includes(o.text.toLowerCase()));
        }

        if (matchedOpt) {
          handlePick(matchedOpt);
        }
      };

      recognition.onerror = () => {
        setIsListening(false);
        setVoiceNotice('');
      };

      recognition.onend = () => {
        setIsListening(false);
        setTimeout(() => setVoiceNotice(''), 3000);
      };

      recognition.start();
    } catch (e) {
      setIsListening(false);
    }
  };

  const handlePick = (opt) => {
    setSelectedOption(opt.text);
    const isCorrect = opt.correct;
    const expText = lang === 'te' ? (opt.exp_te || opt.exp_en) : opt.exp_en;

    setFeedback({
      isCorrect,
      exp: expText
    });

    onAnswerPractice('c5', isCorrect);

    setTimeout(() => {
      setSelectedOption(null);
      setFeedback(null);
      setPracticeIdx((prev) => prev + 1);
      fetchProfile();
    }, 1800);
  };

  // Live Metrics (prioritize backend profile, fallback to props)
  const c5Rule = ruleState.c5 || { lvl: 1, sc: 0, sw: 0, path: 'Focused practice', reason: 'Baseline initialized' };
  const c5Score = profile?.concepts?.find(c => c.concept_id === 'c5')?.mastery_score ?? (mastery.c5 !== undefined ? mastery.c5 : 0.25);
  const c5ScorePct = Math.round(c5Score * 100);

  const streakDays = profile?.streak_days ?? 5;
  const overallMasteryPct = profile?.overall_mastery_pct ?? Math.round(
    (Object.values(mastery).reduce((a, b) => a + (b || 0), 0) / (Object.values(mastery).length || 1)) * 100
  );

  const dailyGoal = profile?.daily_goal ?? { target: 5, completed: (practiceIdx % 5) + 1, percent: Math.min(100, ((practiceIdx % 5) + 1) * 20) };
  const roadmapItems = profile?.roadmap ?? [
    { concept_id: 'c0', title_en: 'Integers & Directed Numbers', title_te: 'పూర్ణాంకాలు & సంఖ్యా రేఖ', status: 'completed', status_label: 'Mastered', mastery_pct: 80 },
    { concept_id: 'c1', title_en: 'Fractions & Equivalent Forms', title_te: 'భిన్నాలు & సమాన రూపాలు', status: 'in_progress', status_label: 'In Progress', mastery_pct: 50 },
    { concept_id: 'c2', title_en: 'LCM & Common Denominators', title_te: 'క.సా.గు & ఉమ్మడి హారాలు', status: 'needs_practice', status_label: 'Needs Practice', mastery_pct: 40 },
    { concept_id: 'c3', title_en: 'Rational Meaning (p/q, q≠0)', title_te: 'అకరణీయ సంఖ్యల నిర్వచనం', status: 'in_progress', status_label: 'In Progress', mastery_pct: 60 },
    { concept_id: 'c4', title_en: 'Comparing Rational Numbers', title_te: 'అకరణీయ సంఖ్యల పోలిక', status: 'needs_practice', status_label: 'Needs Practice', mastery_pct: 30 },
    { concept_id: 'c5', title_en: 'Adding Rationals (Unlike Denominators)', title_te: 'వేర్వేరు హారాలు గల కూడిక', status: 'needs_practice', status_label: 'Active Target', mastery_pct: c5ScorePct },
    { concept_id: 'c6', title_en: 'Multiplication & Division of Rationals', title_te: 'గుణకారం & భాగహారం', status: 'upcoming', status_label: 'Upcoming', mastery_pct: 10 },
  ];

  const recommended = profile?.recommended_learning ?? {
    concept_id: 'c5',
    title_en: 'Adding Rationals with Unlike Denominators',
    title_te: 'వేర్వేరు హారాలు గల అకరణీయ సంఖ్యల కూడిక',
    why_recommended: 'Prerequisite equivalent fractions is established. Practice finding LCMs to master unlike denominators.',
    estimated_time_mins: 12,
    recommended_difficulty: 'Tier 1: Foundational Scaffolding'
  };

  const badges = profile?.badges ?? [
    { id: 'first_5', name_en: 'Curious Explorer', name_te: 'పరిశోధకుడు', desc_en: 'Completed your first 5 exercises!', earned: true },
    { id: 'streak_3', name_en: '3-Day Streak', name_te: '3 రోజుల వరుస', desc_en: 'Learned 3 days in a row!', earned: true },
    { id: 'streak_7', name_en: 'Week Warrior', name_te: 'వారం యోధుడు', desc_en: '7-day learning streak!', earned: false }
  ];

  // Adaptive Pacing Tiers
  const thrFoundation = cfg.pacingFoundation || 40;
  const thrGuided = cfg.pacingGuided || 70;
  const thrIndependent = cfg.pacingIndependent || 85;

  let activePathId = 'normal';
  if (c5ScorePct < thrFoundation || c5Rule.sw >= 2 || c5Rule.path.includes('prerequisite') || c5Rule.path.includes('teacher')) {
    activePathId = 'struggling';
  } else if (c5ScorePct >= thrIndependent || c5Rule.sc >= 3 || c5Rule.path.includes('Harder')) {
    activePathId = 'advanced';
  }

  if (simulatedPathOverride) {
    activePathId = simulatedPathOverride;
  }

  const divergentPaths = {
    struggling: {
      id: 'struggling',
      title: 'Remedial & Tactile Scaffolding Path',
      color: '#fb923c',
      badgeClass: 'warn',
      icon: '🛡️',
      currentActivity: 'Tactile Partition Slices (1/4 scale) + LCM Number Line',
      scaffoldingLevel: 'High Scaffolding (Automatic Step-by-Step Breakdown)',
      why: `Concept c5 mastery is ${c5ScorePct}% (< ${thrFoundation}%). Foundational tactile review activated.`
    },
    normal: {
      id: 'normal',
      title: 'Standard Guided Progression Path',
      color: '#00f2fe',
      badgeClass: 'good',
      icon: '🚀',
      currentActivity: 'Multi-Step Rational Addition with On-Demand Hints',
      scaffoldingLevel: 'Medium Scaffolding (On-Demand Visualizer Hints)',
      why: `Concept c5 mastery is ${c5ScorePct}%. Learner demonstrates steady progress.`
    },
    advanced: {
      id: 'advanced',
      title: 'Advanced Mastery & Extension Path',
      color: '#10b981',
      badgeClass: 'good',
      icon: '⭐',
      currentActivity: 'Rational Algebraic Equations & Real-World Modeling',
      scaffoldingLevel: 'Independent (Timed Accuracy Benchmark)',
      why: `Concept c5 mastery is ${c5ScorePct}% (≥ ${thrIndependent}%). Ready for curriculum acceleration.`
    }
  };

  const currentPath = divergentPaths[activePathId];

  return (
    <div>
      {/* 1. STUDENT PROFILE COMMAND CENTER BANNER WITH AI COMPANION */}
      <section
        className="card"
        style={{
          background: 'linear-gradient(135deg, rgba(16, 17, 22, 0.94) 0%, rgba(10, 13, 20, 0.98) 100%)',
          border: '1px solid rgba(0, 242, 254, 0.3)',
          padding: '24px 28px',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr auto',
            alignItems: 'center',
            gap: '24px'
          }}
        >
          {/* Student Character Avatar (Indian student, blue hoodie & backpack) */}
          <div
            style={{
              position: 'relative',
              width: '84px',
              height: '84px',
              borderRadius: '24px',
              background: 'linear-gradient(135deg, #00f2fe 0%, #8a4bff 100%)',
              padding: '2px',
              boxShadow: '0 0 25px rgba(0, 242, 254, 0.4)',
              flexShrink: 0
            }}
          >
            <div
              style={{
                width: '100%',
                height: '100%',
                borderRadius: '22px',
                background: '#07080a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                position: 'relative'
              }}
            >
              {!lowBandwidth ? (
                <img
                  src="/assets/cinematic/clip4_frame001.jpg"
                  alt="Aarav Sharma - Student Navigator"
                  style={{
                    width: '180%',
                    height: '180%',
                    objectFit: 'cover',
                    objectPosition: '42% 16%'
                  }}
                />
              ) : (
                <span style={{ fontSize: '2.4rem' }}>🧑‍🎓</span>
              )}
            </div>
            <span
              style={{
                position: 'absolute',
                bottom: -2,
                right: -2,
                background: '#10b981',
                width: '16px',
                height: '16px',
                borderRadius: '50%',
                border: '2.5px solid #07080a',
                boxShadow: '0 0 8px #10b981'
              }}
              title="Online Active"
            />
          </div>

          {/* Student Welcome & Bio */}
          <div>
            <div className="row" style={{ gap: '10px', marginBottom: '6px', flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: '1.8rem', margin: 0, fontWeight: 900 }}>
                {lang === 'te' ? 'నమస్కారం,' : 'Welcome back,'} <span className="glow-cyan">{profile?.full_name || 'Aarav Sharma'}!</span>
              </h1>
              <span className="tag purple">NCERT CLASS 8 · SEC A</span>
              <span className="tag good">{streakDays} {t('streak')} 🔥</span>
              {lowBandwidth && <span className="tag warn">{t('dataSaverOn')}</span>}
            </div>
            <p className="mu" style={{ margin: 0, maxWidth: '640px', fontSize: '0.92rem', lineHeight: '1.4' }}>
              {t('sub')}
            </p>
          </div>

          {/* Floating Translucent Spherical AI Companion Guide */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              background: 'rgba(0, 242, 254, 0.08)',
              border: '1px solid rgba(0, 242, 254, 0.3)',
              borderRadius: '18px',
              padding: '10px 16px',
              maxWidth: '310px'
            }}
          >
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(0, 242, 254, 0.9) 0%, rgba(138, 75, 255, 0.6) 70%, transparent 100%)',
                boxShadow: '0 0 16px rgba(0, 242, 254, 0.8)',
                flexShrink: 0,
                animation: 'pulse 2.5s infinite ease-in-out'
              }}
            />
            <div>
              <div style={{ fontSize: '0.78rem', color: '#00f2fe', fontWeight: 800, textTransform: 'uppercase' }}>
                {t('aiGuidance')}
              </div>
              <div style={{ fontSize: '0.84rem', color: '#f8fafc', fontWeight: 600 }}>
                {lang === 'te'
                  ? '“ప్రతి తప్పు సమాధానంలో ఒక కొత్త ఆలోచన దాగి ఉంటుంది. మనం కలిసి నేర్చుకుందాం!”'
                  : '“Every mistake tells us how you think. Let’s decode it together!”'}
              </div>
            </div>
          </div>
        </div>

        {/* Learning Overview Bar */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px',
            marginTop: '22px',
            paddingTop: '18px',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)'
          }}
        >
          {/* Progress metric */}
          <div>
            <div className="row spaced" style={{ fontSize: '0.82rem', marginBottom: '4px' }}>
              <span className="mu">{t('overallProgress')}</span>
              <b style={{ color: '#00f2fe' }}>{overallMasteryPct}%</b>
            </div>
            <div className="bar" style={{ height: '8px' }}>
              <i style={{ width: `${overallMasteryPct}%`, background: 'linear-gradient(90deg, #00f2fe, #8a4bff)' }} />
            </div>
          </div>

          {/* Daily Goal */}
          <div>
            <div className="row spaced" style={{ fontSize: '0.82rem', marginBottom: '4px' }}>
              <span className="mu">{t('dailyGoal')}</span>
              <b style={{ color: dailyGoal.completed >= dailyGoal.target ? '#10b981' : '#fb923c' }}>
                {dailyGoal.completed} / {dailyGoal.target} {dailyGoal.completed >= dailyGoal.target ? '✓' : ''}
              </b>
            </div>
            <div className="bar" style={{ height: '8px' }}>
              <i
                style={{
                  width: `${Math.min(100, (dailyGoal.completed / dailyGoal.target) * 100)}%`,
                  background: dailyGoal.completed >= dailyGoal.target ? '#10b981' : '#fb923c'
                }}
              />
            </div>
          </div>

          {/* Quick Actions */}
          <div className="row" style={{ gap: '8px', justifyContent: 'flex-end', alignItems: 'center' }}>
            <button className="pri" onClick={onLaunchDetective} style={{ padding: '8px 14px', fontSize: '0.86rem' }}>
              🔍 {t('start')}
            </button>
            <button onClick={onOpenTour} className="sec" style={{ padding: '8px 12px', fontSize: '0.86rem' }}>
              ▶ Guided Tour
            </button>
          </div>
        </div>
      </section>

      {/* 2. PERSONALIZED LEARNING ROADMAP ("YOUR LEARNING JOURNEY") */}
      <section className="card" style={{ marginTop: '20px' }}>
        <div className="row spaced" style={{ marginBottom: '14px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.25rem' }}>{t('roadmapTitle')}</h3>
            <span className="mu" style={{ fontSize: '0.85rem' }}>
              NCERT Class 8 Rational Numbers: Prerequisite dependency chain dynamically updated based on mastery.
            </span>
          </div>
          <span className="tag purple">Adaptive Sequence</span>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: '12px',
            position: 'relative'
          }}
        >
          {roadmapItems.map((item, idx) => {
            const isCompleted = item.status === 'completed';
            const isInProgress = item.status === 'in_progress';
            const isNeedsPractice = item.status === 'needs_practice';

            let borderColor = 'rgba(255, 255, 255, 0.1)';
            let bgColor = 'rgba(255, 255, 255, 0.02)';
            let badgeClass = 'mu';

            if (isCompleted) {
              borderColor = '#10b981';
              bgColor = 'rgba(16, 185, 129, 0.08)';
              badgeClass = 'tag good';
            } else if (isInProgress) {
              borderColor = '#00f2fe';
              bgColor = 'rgba(0, 242, 254, 0.08)';
              badgeClass = 'tag';
            } else if (isNeedsPractice) {
              borderColor = '#fb923c';
              bgColor = 'rgba(251, 146, 60, 0.08)';
              badgeClass = 'tag warn';
            }

            return (
              <div
                key={item.concept_id}
                style={{
                  padding: '14px 12px',
                  borderRadius: '12px',
                  border: `1.5px solid ${borderColor}`,
                  background: bgColor,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  transition: 'transform 0.2s ease'
                }}
              >
                <div className="row spaced" style={{ fontSize: '0.74rem' }}>
                  <span className="mu">Step {idx + 1}</span>
                  <span className={badgeClass}>{item.status_label}</span>
                </div>
                <div style={{ fontWeight: 700, fontSize: '0.88rem', minHeight: '38px', lineHeight: '1.3' }}>
                  {lang === 'te' ? item.title_te : item.title_en}
                </div>
                <div className="row spaced" style={{ fontSize: '0.78rem', marginTop: 'auto' }}>
                  <span className="mu">Mastery:</span>
                  <b>{item.mastery_pct}%</b>
                </div>
                <div className="bar" style={{ height: '4px' }}>
                  <i style={{ width: `${item.mastery_pct}%`, background: borderColor }} />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 3. RECOMMENDED LEARNING CARD ("WHAT TO LEARN NEXT") */}
      <section
        className="card"
        style={{
          marginTop: '20px',
          background: 'linear-gradient(135deg, rgba(0, 242, 254, 0.08) 0%, rgba(138, 75, 255, 0.08) 100%)',
          border: '1.5px solid rgba(0, 242, 254, 0.35)',
          padding: '22px 26px'
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '20px', alignItems: 'center' }}>
          <div>
            <div className="row" style={{ gap: '8px', marginBottom: '6px' }}>
              <span className="tag good">🎯 {t('recommendedNext')}</span>
              <span className="tag purple">{recommended.recommended_difficulty}</span>
              <span className="tag mu">⏱️ {recommended.estimated_time_mins} mins</span>
            </div>
            <h3 style={{ fontSize: '1.4rem', margin: '4px 0 8px' }}>
              {lang === 'te' ? recommended.title_te : recommended.title_en}
            </h3>
            <p className="mu" style={{ margin: 0, fontSize: '0.92rem', lineHeight: '1.4' }}>
              <b>{t('whyActivity')}</b> {recommended.why_recommended}
            </p>
          </div>
          <button
            className="pri"
            onClick={onLaunchDetective}
            style={{ padding: '12px 20px', fontSize: '0.95rem', whiteSpace: 'nowrap' }}
          >
            🚀 Start Targeted Practice
          </button>
        </div>
      </section>

      {/* 4. ACTIVE ADAPTIVE PATH SHOWCASE */}
      <div
        className="card"
        style={{
          marginTop: '20px',
          border: `1.5px solid ${currentPath.color}60`,
          background: 'linear-gradient(135deg, rgba(16, 17, 22, 0.9) 0%, rgba(10, 12, 18, 0.95) 100%)',
          boxShadow: `0 12px 32px -8px ${currentPath.color}25`
        }}
      >
        <div className="row spaced" style={{ flexWrap: 'wrap', gap: '10px' }}>
          <div className="row" style={{ gap: '10px' }}>
            <span style={{ fontSize: '1.8rem' }}>{currentPath.icon}</span>
            <div>
              <span className={`tag ${currentPath.badgeClass}`}>ACTIVE DIVERGENT LEARNING PATH</span>
              <h2 style={{ margin: '4px 0 2px', fontSize: '1.35rem', color: currentPath.color }}>
                {currentPath.title}
              </h2>
            </div>
          </div>
          <div className="row" style={{ gap: '8px' }}>
            <button
              className={activePathId === 'struggling' ? 'warn' : 'sec'}
              onClick={() => setSimulatedPathOverride('struggling')}
              style={{ fontSize: '0.78rem', padding: '5px 9px' }}
            >
              Path: Remedial
            </button>
            <button
              className={activePathId === 'normal' ? 'pri' : 'sec'}
              onClick={() => setSimulatedPathOverride('normal')}
              style={{ fontSize: '0.78rem', padding: '5px 9px' }}
            >
              Path: Guided
            </button>
            <button
              className={activePathId === 'advanced' ? 'good' : 'sec'}
              onClick={() => setSimulatedPathOverride('advanced')}
              style={{ fontSize: '0.78rem', padding: '5px 9px' }}
            >
              Path: Advanced
            </button>
          </div>
        </div>

        <div style={{ marginTop: '14px', fontSize: '0.9rem', color: '#cbd5e1', lineHeight: '1.4' }}>
          <b>{t('whyActivity')}</b> {currentPath.why}
        </div>
      </div>

      {/* 5. INTERACTIVE PRACTICE & MASTER MATRIX TWO-COLUMN GRID */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1.35fr) minmax(300px, 1fr)', gap: '20px', marginTop: '20px' }}>
        {/* Left Column: Interactive Practice with Audio & Speech */}
        <div>
          <div className="card" style={{ border: '1px solid rgba(0, 242, 254, 0.3)' }}>
            {/* Topic Filter Pill Buttons */}
            <div style={{ marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="row spaced" style={{ marginBottom: 6, flexWrap: 'wrap', gap: '8px' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#00f2fe' }}>
                  {lang === 'te' ? 'అధ్యాయం / టాపిక్‌ను ఎంచుకోండి:' : 'CHOOSE PRACTICE TOPIC:'}
                </span>
                <span className="mu" style={{ fontSize: '0.75rem' }}>
                  {filteredPracticeQuestions.length} {lang === 'te' ? 'ప్రశ్నలు అందుబాటులో ఉన్నాయి' : 'Questions Available'}
                </span>
              </div>
              <div className="row" style={{ gap: '6px', flexWrap: 'wrap' }}>
                {[
                  { id: 'all', label_en: 'All Topics', label_te: 'అన్ని టాపిక్‌లు' },
                  { id: 'c5', label_en: 'Adding Rationals (c5)', label_te: 'సంకలనం (c5)' },
                  { id: 'c2', label_en: 'Equivalent Fractions (c2)', label_te: 'సమాన భిన్నాలు (c2)' },
                  { id: 'c4', label_en: 'Number Line & Signs (c4)', label_te: 'సంఖ్యా రేఖ & గుర్తులు (c4)' },
                  { id: 'c6', label_en: 'Multiply & Divide (c6)', label_te: 'గుణకారం & భాగహారం (c6)' }
                ].map((top) => (
                  <button
                    key={top.id}
                    className={selectedTopic === top.id ? 'pri' : 'sec'}
                    onClick={() => {
                      setSelectedTopic(top.id);
                      setPracticeIdx(0);
                      setSelectedOption(null);
                      setFeedback(null);
                      setShowHint(false);
                    }}
                    style={{ fontSize: '0.76rem', padding: '4px 10px', borderRadius: '8px' }}
                  >
                    {lang === 'te' ? top.label_te : top.label_en}
                  </button>
                ))}
              </div>
            </div>

            <div className="row spaced" style={{ marginBottom: 12 }}>
              <div>
                <span className="tag">{currentQ.topic ? `NCERT ${currentQ.topic.toUpperCase()}` : 'NCERT'} · Practice #{practiceIdx + 1}</span>
                <h3 style={{ fontSize: '1.25rem', margin: '6px 0 2px' }}>
                  {lang === 'te' ? (currentQ.topic_name_te || currentQ.stem_te) : (currentQ.topic_name_en || currentQ.stem_en)}
                </h3>
              </div>
              <div className="row" style={{ gap: '6px' }}>
                {/* Read Aloud Button */}
                <button
                  className={isSpeaking ? 'warn' : 'sec'}
                  onClick={() => handleReadAloud(`${lang === 'te' ? currentQ.stem_te : currentQ.stem_en}${showHint ? (lang === 'te' ? `. సూచన: ${currentQ.hint_te}` : `. Hint: ${currentQ.hint_en}`) : ''}`)}
                  style={{ padding: '5px 9px', fontSize: '0.8rem' }}
                  title="Read question aloud in selected language"
                >
                  {isSpeaking ? `⏹️ ${t('stopAudio')}` : `🔊 ${t('readAloud')}`}
                </button>
                {/* Voice Input Mic Button */}
                <button
                  className={isListening ? 'warn' : 'sec'}
                  onClick={handleVoiceInput}
                  style={{ padding: '5px 9px', fontSize: '0.8rem' }}
                  title="Answer using microphone speech recognition"
                >
                  🎙️ {isListening ? 'Listening...' : t('voiceMic')}
                </button>
              </div>
            </div>

            {voiceNotice && (
              <div style={{ fontSize: '0.82rem', color: '#00f2fe', marginBottom: 8, fontStyle: 'italic' }}>
                {voiceNotice}
              </div>
            )}

            <div
              style={{
                background: 'rgba(0, 242, 254, 0.05)',
                border: '1px solid rgba(0, 242, 254, 0.2)',
                borderRadius: '14px',
                padding: '16px 20px',
                fontSize: '1.35rem',
                fontWeight: 900,
                color: '#ffffff',
                textAlign: 'center',
                margin: '12px 0'
              }}
            >
              {lang === 'te' ? currentQ.stem_te : currentQ.stem_en}
            </div>

            {/* Progressive Hint (Hidden by default to prevent answer revealing) */}
            <div style={{ margin: '10px 0' }}>
              <button
                type="button"
                className="sec"
                onClick={() => setShowHint(!showHint)}
                style={{ fontSize: '0.78rem', padding: '4px 10px', borderRadius: '6px' }}
              >
                {showHint ? '🙈 ' + (lang === 'te' ? 'సూచన దాచు' : 'Hide Hint') : '💡 ' + (lang === 'te' ? 'సూచన చూడండి (ఐచ్ఛికం)' : 'Need a Hint? (Optional)')}
              </button>
              {showHint && (
                <div style={{ fontSize: '0.86rem', color: '#fb923c', marginTop: 8, padding: '8px 12px', background: 'rgba(251, 146, 60, 0.08)', borderRadius: '8px', border: '1px solid rgba(251, 146, 60, 0.25)', animation: 'fadeIn 0.2s ease' }}>
                  💡 <b>Hint:</b> {lang === 'te' ? currentQ.hint_te : currentQ.hint_en}
                </div>
              )}
            </div>

            {/* Answer Options */}
            <div style={{ margin: '14px 0' }}>
              {currentQ.options.map((opt, i) => {
                let optClass = 'opt';
                if (selectedOption === opt.text) {
                  optClass += opt.correct ? ' right' : ' wrong';
                }

                return (
                  <button
                    key={i}
                    className={optClass}
                    onClick={() => !feedback && handlePick(opt)}
                    disabled={!!feedback}
                  >
                    <span style={{ fontWeight: 700 }}>{opt.text}</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--mu)' }}>Option {String.fromCharCode(65 + i)}</span>
                  </button>
                );
              })}
            </div>

            {/* Feedback Message */}
            {feedback && (
              <div
                style={{
                  padding: '12px 16px',
                  borderRadius: '12px',
                  background: feedback.isCorrect ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)',
                  border: `1px solid ${feedback.isCorrect ? '#10b981' : '#f43f5e'}`,
                  color: '#ffffff',
                  fontSize: '0.92rem',
                  animation: 'fadeIn 0.3s ease',
                  marginTop: '12px'
                }}
              >
                <div className="row spaced" style={{ alignItems: 'flex-start' }}>
                  <div>
                    <b>{feedback.isCorrect ? '✓ Correct!' : '✗ Misconception Detected:'}</b> {feedback.exp}
                  </div>
                  <button
                    className="pri"
                    onClick={() => {
                      setPracticeIdx(prev => prev + 1);
                      setSelectedOption(null);
                      setFeedback(null);
                      setShowHint(false);
                    }}
                    style={{ fontSize: '0.78rem', padding: '6px 12px', whiteSpace: 'nowrap', marginLeft: 12 }}
                  >
                    {t('next')} ➔
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 6. LEARNING HISTORY & DIAGNOSTIC AUDIT LOG */}
          <div className="card" style={{ marginTop: '20px' }}>
            <h3 style={{ fontSize: '1.15rem', marginBottom: 12 }}>{t('learningHistory')}</h3>
            {profile?.diagnostic_history && profile.diagnostic_history.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Question</th>
                      <th>Your Answer</th>
                      <th>Diagnosed Misconception</th>
                      <th>Status</th>
                      <th>Recovery</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profile.diagnostic_history.map((dh) => (
                      <tr key={dh.id}>
                        <td><code>{dh.original_question}</code></td>
                        <td><b>{dh.student_response}</b></td>
                        <td><span className="tag warn">{dh.suspected_misconception}</span></td>
                        <td>{dh.confirmation_status === 'confirmed' ? 'Verified Gap' : (dh.confirmation_status === 'refuted_slip' ? 'Careless Slip' : 'Mastered')}</td>
                        <td>
                          {dh.reassessment_result === 'recovered' ? (
                            <span className="tag good">Recovered ✓</span>
                          ) : (
                            <span className="tag danger">Needs Support ⚠️</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mu" style={{ fontStyle: 'italic', fontSize: '0.88rem' }}>
                Complete diagnostic cases in the Learning Detective to view your verified misconception history.
              </p>
            )}
          </div>
        </div>

        {/* Right Column: Mastery Crystals, 3D Visualizer & Badges */}
        <div>
          {/* Topic-Wise Mastery Matrix */}
          <div className="card" style={{ border: '1px solid rgba(138, 75, 255, 0.25)' }}>
            <div className="row spaced" style={{ marginBottom: 10 }}>
              <h3>{t('mastery')}</h3>
              <span className="tag purple">{concepts.length} Concepts</span>
            </div>
            <p className="mu" style={{ fontSize: '0.84rem', margin: '0 0 12px' }}>
              Estimates updated via Corbett & Anderson (1994) BKT formulation:
            </p>

            {concepts.map((c) => {
              const score = mastery[c.id];
              const source = c.id === 'c5' ? 'bkt' : 'baseline';
              return (
                <MasteryCrystal
                  key={c.id}
                  conceptId={c.id}
                  title={lang === 'te' ? c.te : c.en}
                  score={score}
                  source={source}
                  ruleState={c.id === 'c5' ? ruleState.c5 : null}
                  lang={lang}
                />
              );
            })}
          </div>

          {/* Achievement Badges Suite */}
          <div className="card" style={{ marginTop: '20px' }}>
            <div className="row spaced" style={{ marginBottom: 10 }}>
              <h3>{t('badgesTitle')}</h3>
              <span className="tag good">{badges.filter(b => b.earned).length} Earned</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
              {badges.map((b) => (
                <div
                  key={b.id}
                  style={{
                    padding: '10px',
                    borderRadius: '10px',
                    border: b.earned ? '1.5px solid rgba(16, 185, 129, 0.4)' : '1px dashed rgba(255, 255, 255, 0.1)',
                    background: b.earned ? 'rgba(16, 185, 129, 0.06)' : 'rgba(255, 255, 255, 0.01)',
                    textAlign: 'center',
                    opacity: b.earned ? 1 : 0.5
                  }}
                >
                  <div style={{ fontSize: '1.5rem', marginBottom: '4px' }}>{b.earned ? '🏆' : '🔒'}</div>
                  <div style={{ fontWeight: 700, fontSize: '0.82rem' }}>
                    {lang === 'te' ? (b.name_te || b.name_en) : b.name_en}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--mu)', marginTop: '2px' }}>
                    {b.desc_en}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 3D Rational Math Cube Box */}
          <div className="card" style={{ textAlign: 'center', marginTop: '20px' }}>
            <span className="tag">NCERT 3D VISUALIZER</span>
            {!lowBandwidth ? (
              <Cube3D />
            ) : (
              <div style={{ padding: '24px 0', fontSize: '2rem' }}>🧊 ½ ↔ -¾</div>
            )}
            <div style={{ fontSize: '0.82rem', color: 'var(--mu)', marginTop: 6 }}>
              Spatial manipulation of signed rational parts and equivalent fractions.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
