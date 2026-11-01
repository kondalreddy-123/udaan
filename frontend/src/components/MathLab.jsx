import React, { useEffect, useMemo, useRef, useState } from 'react';
import MathVisual from './MathLabVisuals';
import { LAB_TOPICS, getLabTopic, getProblemCount } from '../data/mathLabTopics';

const VIZ_TABS = [
  { id: 'slices', label: '3D Model', icon: '🪟' },
  { id: 'numberLine', label: 'Number Line', icon: '↔' },
  { id: 'denominator', label: 'Common Denominator', icon: '➗' },
  { id: 'stepByStep', label: 'Step by Step', icon: '📜' }
];

// The first tab shows a different model depending on the topic, so name it
// after what is actually on screen (bars, counters, flip cards or a balance).
const modelLabel = (problem) => {
  const viz = problem?.viz || {};
  if (viz.balance) return 'Balance Scale';
  if (viz.flip) return 'Reciprocal Flip';
  if (Array.isArray(viz.hops) && !viz.bars) return 'Counter Cubes';
  return 'Fraction Slices';
};

const VIZ_CAPTIONS = {
  slices: 'Concrete model — the numbers as 3D bars you can count.',
  numberLine: 'Spatial model — follow each jump along the number line.',
  denominator: 'Procedure — build matching pieces with the LCM.',
  stepByStep: 'Worked solution — reveal one reasoning step at a time.'
};

const statusFor = (score) => {
  if (score >= 0.75) return { label: 'Completed', tone: 'ok' };
  if (score >= 0.4) return { label: 'Learning', tone: 'cyan' };
  if (score > 0) return { label: 'Needs practice', tone: 'warn' };
  return { label: 'Not started', tone: 'muted' };
};

export default function MathLab({
  lang,
  mastery = {},
  topicId,
  onSelectTopic,
  onAnswer,
  onReturnToGalaxy
}) {
  const [activeTopicId, setActiveTopicId] = useState(() => getLabTopic(topicId).id);
  const [problemIdx, setProblemIdx] = useState(0);
  const [vizTab, setVizTab] = useState('slices');
  const [selectedAns, setSelectedAns] = useState(null);
  const [isAnswerChecked, setIsAnswerChecked] = useState(false);
  const [hintLevel, setHintLevel] = useState(0);
  const [currentStep, setCurrentStep] = useState(1);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceNotice, setVoiceNotice] = useState('');
  const [solved, setSolved] = useState(() => new Set());
  const recognitionRef = useRef(null);

  const topic = getLabTopic(activeTopicId);
  const problem = topic.problems[problemIdx % topic.problems.length];
  const isCorrect = selectedAns === problem.answer;

  const hints = lang === 'te' && problem.hints_te ? problem.hints_te : problem.hints;
  const maxHints = hints.length;
  const hints_te_available = Boolean(problem.hints_te);

  const aiPrompt = problem.aiPrompt;
  const aiWrong = problem.aiWrong;
  const aiRight = problem.aiRight;

  const topicSolved = topic.problems.filter((p) => solved.has(p.id)).length;
  const totalSolved = solved.size;

  // ── keep in sync with the topic chosen in the Learning Universe ────────────
  const stopSpeech = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  };

  const selectTopic = (nextId) => {
    if (!nextId || nextId === activeTopicId) return;
    stopSpeech();
    setActiveTopicId(nextId);
    setProblemIdx(0);
    setSelectedAns(null);
    setIsAnswerChecked(false);
    setHintLevel(0);
    setCurrentStep(1);
    setVoiceNotice('');
    setVizTab('slices');
    onSelectTopic?.(nextId);
  };

  useEffect(() => {
    if (topicId && topicId !== activeTopicId) {
      selectTopic(topicId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicId]);

  // ── cleanup speech recognition on unmount ─────────────────────────────────
  useEffect(() => () => {
    stopSpeech();
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (err) {
        /* recognition already stopped */
      }
    }
  }, []);

  // ── problem navigation ────────────────────────────────────────────────────
  const resetForProblem = (nextIdx) => {
    stopSpeech();
    setProblemIdx(nextIdx);
    setSelectedAns(null);
    setIsAnswerChecked(false);
    setHintLevel(0);
    setCurrentStep(1);
    setVoiceNotice('');
  };

  const handleNextProblem = () => {
    resetForProblem((problemIdx + 1) % topic.problems.length);
  };

  const handleCheckAnswer = () => {
    if (!selectedAns || isAnswerChecked) return;
    setIsAnswerChecked(true);
    const correct = selectedAns === problem.answer;

    if (correct) {
      setCurrentStep(7);
      setSolved((prev) => {
        const next = new Set(prev);
        next.add(problem.id);
        return next;
      });
    } else {
      setCurrentStep(3);
    }

    onAnswer?.(topic.id, correct);
  };

  // ── speech synthesis ──────────────────────────────────────────────────────
  const handleReadAloud = (text) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setVoiceNotice('This browser does not support read-aloud.');
      return;
    }
    if (isSpeaking) {
      stopSpeech();
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang === 'te' ? 'te-IN' : 'en-IN';
    utterance.rate = 0.9;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  };

  // ── speech recognition ────────────────────────────────────────────────────
  const handleVoiceInput = () => {
    const SpeechRec = typeof window !== 'undefined'
      ? window.SpeechRecognition || window.webkitSpeechRecognition
      : null;
    if (!SpeechRec) {
      setVoiceNotice('Voice input needs Chrome or Edge.');
      return;
    }
    if (isListening) return;

    const recognition = new SpeechRec();
    recognitionRef.current = recognition;
    recognition.lang = lang === 'te' ? 'te-IN' : 'en-IN';
    recognition.interimResults = false;
    recognition.maxAlternatives = 3;

    recognition.onstart = () => {
      setIsListening(true);
      setVoiceNotice('🎙️ Listening…');
    };
    recognition.onresult = (event) => {
      const transcript = String(event.results?.[0]?.[0]?.transcript || '').trim();
      setVoiceNotice(`Heard: "${transcript}"`);
      const normalised = transcript.replace(/\s+/g, '').toLowerCase();
      const matched = problem.options.find((option) => {
        const clean = option.replace(/\s+/g, '').toLowerCase();
        return normalised.includes(clean) || clean.includes(normalised);
      });
      if (matched) setSelectedAns(matched);
    };
    recognition.onerror = () => {
      setIsListening(false);
      setVoiceNotice('Could not hear that. Try again.');
    };
    recognition.onend = () => {
      setIsListening(false);
      setTimeout(() => setVoiceNotice(''), 3000);
    };

    try {
      recognition.start();
    } catch (err) {
      setIsListening(false);
      setVoiceNotice('Microphone is busy. Try again.');
    }
  };

  // ── display helpers ───────────────────────────────────────────────────────
  const blankRight = typeof problem.display.right === 'string' && problem.display.right.includes('?');
  const rightText = blankRight && isAnswerChecked
    ? problem.display.right.replace('?', String(problem.answer).split('/')[0])
    : problem.display.right;

  const equation = useMemo(() => ({
    left: problem.display.left,
    op: problem.display.op,
    right: rightText,
    showAnswer: !blankRight
  }), [problem, rightText, blankRight]);

  const currentTopicStatus = statusFor(mastery[topic.id] ?? 0);
  const masteryPct = Math.round((mastery[topic.id] ?? 0) * 100);

  return (
    <div style={{ position: 'relative', minHeight: '85vh' }}>
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '14px',
        marginBottom: '18px'
      }}>
        <div>
          <div className="row" style={{ gap: '8px', marginBottom: '6px' }}>
            <span className="badge-tag">3D MATH LAB</span>
            <span className="tag good">{LAB_TOPICS.length} topics</span>
            <span className="tag">{getProblemCount()} problems</span>
          </div>
          <h2 style={{ fontSize: '1.75rem', margin: '0 0 4px' }}>Choose a topic, then explore it in 3D</h2>
          <p className="mu" style={{ margin: 0, maxWidth: '640px' }}>
            Pick any topic below. Every answer updates your personal mastery, and every visualiser is
            animated so you can see the maths move.
          </p>
        </div>

        <div className="ml-stat-pill">
          <span>Solved</span>
          <b>
            {totalSolved}
            <small>/{getProblemCount()}</small>
          </b>
        </div>
      </div>

      {/* ── Topic chooser ────────────────────────────────────────────────── */}
      <section aria-label="Choose a topic to learn" className="ml-topic-section">
        <div className="row spaced" style={{ marginBottom: '10px' }}>
          <h3 style={{ margin: 0, fontSize: '1.02rem' }}>Pick a topic to learn</h3>
          <span className="mu" style={{ fontSize: '0.8rem' }}>Tap a card to open its lab</span>
        </div>

        <div className="ml-topic-grid">
          {LAB_TOPICS.map((item) => {
            const score = mastery[item.id] ?? 0;
            const status = statusFor(score);
            const active = item.id === topic.id;
            const done = item.problems.filter((p) => solved.has(p.id)).length;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => selectTopic(item.id)}
                aria-pressed={active}
                className={`ml-topic-card${active ? ' on' : ''}`}
                style={{ '--topic-color': item.color, '--topic-accent': item.accent }}
              >
                <span className="ml-topic-icon" aria-hidden="true">{item.icon}</span>
                <span className="ml-topic-name">{lang === 'te' ? item.name_te : item.name_en}</span>
                <span className="ml-topic-sub">{item.subtitle}</span>

                <span className="ml-topic-meter" aria-hidden="true">
                  <span className="ml-topic-meter-fill" style={{ width: `${Math.max(4, score * 100)}%` }} />
                </span>

                <span className="ml-topic-meta">
                  <span className={`ml-topic-status ${status.tone}`}>{status.label}</span>
                  <span className="ml-topic-count">{done}/{item.problems.length} ✓</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Selected topic banner + problem pills ────────────────────────── */}
      <div className="card ml-topic-banner">
        <div className="row spaced" style={{ flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div className="row" style={{ gap: '10px', alignItems: 'center' }}>
              <span className="ml-banner-icon" style={{ color: topic.color }}>{topic.icon}</span>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem' }}>
                  {lang === 'te' ? topic.name_te : topic.name_en}
                </h3>
                <div style={{ fontSize: '0.78rem', color: topic.accent || '#00f2fe', fontWeight: 700 }}>
                  {topic.subtitle} · {topic.level}
                </div>
              </div>
            </div>
            <p className="mu" style={{ margin: '10px 0 0', fontSize: '0.88rem', maxWidth: '560px' }}>
              {lang === 'te' ? topic.blurb_te : topic.blurb_en}
            </p>
          </div>

          <div className="ml-topic-progress">
            <div className="ml-topic-progress-top">
              <span>{currentTopicStatus.label}</span>
              <b>{masteryPct}%</b>
            </div>
            <span className="ml-topic-meter big">
              <span className="ml-topic-meter-fill" style={{ width: `${Math.max(4, masteryPct)}%` }} />
            </span>
            <div className="ml-topic-progress-foot">
              {topicSolved}/{topic.problems.length} problems solved in this topic
            </div>
          </div>
        </div>

        <div className="ml-problem-pills">
          {topic.problems.map((p, i) => {
            const isCurrent = i === problemIdx % topic.problems.length;
            const isDone = solved.has(p.id);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => resetForProblem(i)}
                aria-pressed={isCurrent}
                className={`ml-problem-pill${isCurrent ? ' on' : ''}${isDone ? ' done' : ''}`}
              >
                {isDone ? '✓ ' : ''}Q{i + 1}
                <span className="ml-diff" aria-label={`difficulty ${p.difficulty}`}>
                  {'●'.repeat(p.difficulty)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Main 3-column grid ───────────────────────────────────────────── */}
      <div className="ml-lab-grid">
        {/* LEFT: question, options, hints */}
        <div className="card ml-panel">
          <div className="row" style={{ gap: '8px', marginBottom: '12px' }}>
            <span style={{ fontSize: '1.2rem' }}>✏️</span>
            <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#f8fafc' }}>Try it yourself</h3>
          </div>

          <div className="ml-question">
            <div className="ml-question-label">Find the result</div>
            <div className="ml-question-stem">
              {lang === 'te' && problem.stem_te ? problem.stem_te : problem.stem_en}
            </div>

            <div className="ml-voice-row">
              <button
                type="button"
                className={`sec${isSpeaking ? ' warn' : ''}`}
                onClick={() => handleReadAloud(lang === 'te' && problem.stem_te ? problem.stem_te : problem.stem_en)}
                title="Read the question aloud"
              >
                {isSpeaking ? '⏹ Stop' : '🔊 Read aloud'}
              </button>
              <button
                type="button"
                className={`sec${isListening ? ' warn' : ''}`}
                onClick={handleVoiceInput}
                title="Answer by speaking"
              >
                🎙️ {isListening ? 'Listening…' : 'Speak answer'}
              </button>
            </div>
            {voiceNotice && <div className="ml-voice-notice">{voiceNotice}</div>}
          </div>

          <div className="ml-options">
            {problem.options.map((option) => {
              const selected = selectedAns === option;
              let tone = '';
              if (isAnswerChecked && selected) tone = isCorrect ? 'correct' : 'wrong';
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => { if (!isAnswerChecked) setSelectedAns(option); }}
                  className={`ml-option${selected ? ' on' : ''}${tone ? ` ${tone}` : ''}`}
                  aria-pressed={selected}
                  disabled={isAnswerChecked}
                >
                  <span className="ml-option-dot">{selected ? '●' : ''}</span>
                  <span className="ml-option-val">{option}</span>
                  {isAnswerChecked && selected && (
                    <span className="ml-option-mark">{isCorrect ? '✓' : '✗'}</span>
                  )}
                </button>
              );
            })}
          </div>

          {!isAnswerChecked ? (
            <button
              type="button"
              className="pri ml-wide-btn"
              onClick={handleCheckAnswer}
              disabled={!selectedAns}
            >
              Check answer
            </button>
          ) : (
            <button
              type="button"
              className={`${isCorrect ? 'good' : 'warn'} ml-wide-btn`}
              onClick={handleNextProblem}
            >
              {isCorrect ? 'Next problem →' : 'Try another problem ↺'}
            </button>
          )}

          {isAnswerChecked && (
            <div className={`ml-verdict ${isCorrect ? 'ok' : 'bad'}`}>
              {isCorrect
                ? 'Correct — this attempt raised your mastery for this topic.'
                : `Not quite. The correct answer is ${problem.answer}.`}
            </div>
          )}

          {/* progressive hints */}
          <div className="ml-hints">
            {hintLevel === 0 ? (
              <button type="button" className="sec ml-hint-btn" onClick={() => setHintLevel(1)}>
                💡 {lang === 'te' ? 'సూచన చూడండి' : 'Need a hint?'} <span className="mu">(optional)</span>
              </button>
            ) : (
              <>
                <div className="row spaced" style={{ marginBottom: '6px' }}>
                  <span className="ml-hint-title">💡 HINTS ({hintLevel}/{maxHints})</span>
                  {hintLevel < maxHints && (
                    <button
                      type="button"
                      className="sec ml-hint-more"
                      onClick={() => setHintLevel((h) => Math.min(h + 1, maxHints))}
                    >
                      Show more ↓
                    </button>
                  )}
                </div>
                {hints.slice(0, hintLevel).map((hint, i) => (
                  <div key={i} className="ml-hint" style={{ animationDelay: `${i * 60}ms` }}>
                    <b>Level {i + 1}:</b> {hint}
                  </div>
                ))}
                {hintLevel === maxHints && (
                  <div className="ml-hint-done">
                    All hints shown. Now try the answer.
                    {lang === 'te' && !hints_te_available && ' (hints shown in English for this topic)'}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* CENTER: animated 3D visualiser */}
        <div className="card ml-panel ml-stage-card">
          <div className="ml-eq-row">
            <div className="ml-eq">
              <span className="ml-eq-term left">{equation.left}</span>
              <span className="ml-eq-op">{equation.op}</span>
              <span className="ml-eq-term right">{equation.right}</span>
              {equation.showAnswer && (
                <>
                  <span className="ml-eq-op">=</span>
                  <span className={`ml-eq-answer${isAnswerChecked ? ' on' : ''}${isAnswerChecked && !isCorrect ? ' bad' : ''}`}>
                    {isAnswerChecked ? problem.answer : '?'}
                  </span>
                </>
              )}
            </div>
            <div className="ml-eq-hint">
              <span className="ml-eq-hint-label">tip</span>
              <span>{problem.viz?.bars ? 'Count the shaded parts' : problem.viz?.balance ? 'Keep both sides equal' : 'Watch the jumps'}</span>
            </div>
          </div>

          <div className="ml-viz-frame">
            <MathVisual problem={problem} mode={vizTab} revealed={isAnswerChecked} lang={lang} />
          </div>

          <div className="ml-viz-tabs" role="tablist" aria-label="Visualisation style">
            {VIZ_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={vizTab === tab.id}
                onClick={() => setVizTab(tab.id)}
                className={`ml-viz-tab${vizTab === tab.id ? ' on' : ''}`}
              >
                <span aria-hidden="true">{tab.icon}</span>{' '}
                {tab.id === 'slices' ? modelLabel(problem) : tab.label}
              </button>
            ))}
          </div>

          <div className="ml-viz-caption">{VIZ_CAPTIONS[vizTab]}</div>
        </div>

        {/* RIGHT: AI companion */}
        <div className="card ml-panel ml-companion">
          <div className="ml-bubble">
            <div className="ml-bubble-title">✦ AI LEARNING COMPANION</div>
            <div>
              {!isAnswerChecked
                ? aiPrompt
                : isCorrect
                  ? `🎉 ${aiRight}`
                  : `🤔 ${aiWrong}`}
            </div>
          </div>

          <button
            type="button"
            className={`sec${isSpeaking ? ' warn' : ''}`}
            onClick={() => handleReadAloud(
              !isAnswerChecked ? aiPrompt : isCorrect ? aiRight : aiWrong
            )}
            style={{ width: '100%', fontSize: '0.78rem' }}
          >
            {isSpeaking ? '⏹ Stop reading' : '🔊 Read aloud'}
          </button>

          <div className="ai-orb-container" style={{ margin: '16px auto 8px' }}>
            <div className="ai-ring" />
            <div className="ai-ring-2" />
            <div className="ai-orb">
              <div className="ai-face">
                <div className="ai-eyes">
                  <div className="ai-eye" />
                  <div className="ai-eye" />
                </div>
                <div className="ai-mouth" />
              </div>
            </div>
            <div className="ai-thruster" />
          </div>

          <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#f8fafc' }}>
            {lang === 'te' ? 'మీ గణిత ప్రయోగశాల' : 'Math Lab Pod'}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#38bdf8', marginTop: '2px' }}>
            Class 8 · {lang === 'te' ? topic.name_te : topic.name_en}
          </div>

          <div className="ml-solved-box">
            ✓ Solved in this topic: <b>{topicSolved}</b> / {topic.problems.length}
          </div>

          <button
            type="button"
            onClick={onReturnToGalaxy}
            className="sec"
            style={{ marginTop: '12px', width: '100%', fontSize: '0.85rem' }}
          >
            ← Back to Learning Universe
          </button>
        </div>
      </div>

      {/* ── 7-stage workflow tracker ─────────────────────────────────────── */}
      <div className="card ml-workflow">
        <div className="row spaced" style={{ flexWrap: 'wrap', gap: '10px' }}>
          <div className="ml-workflow-steps">
            {['Learn', 'Solve', 'Detect', 'Confirm', 'Support', 'Reassess', 'Update'].map((name, i) => {
              const num = i + 1;
              const isPast = currentStep > num;
              const isCurrent = currentStep === num;
              return (
                <div
                  key={name}
                  className={`ml-workflow-step${isCurrent ? ' current' : ''}${isPast ? ' past' : ''}`}
                >
                  <span>{isPast ? '✓' : num}</span>
                  <span>{name}</span>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => resetForProblem(problemIdx)}
            className="sec"
            style={{ fontSize: '0.82rem', padding: '6px 12px' }}
          >
            ↺ Reset question
          </button>
        </div>
      </div>
    </div>
  );
}
