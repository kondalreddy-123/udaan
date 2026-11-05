import React, { useState, useEffect } from 'react';
import ContentAuthoring from './ContentAuthoring';
import { api } from '../services/api';

const DEFAULT_LESSONS = [
  {
    id: 'lesson-rn-1',
    title_en: 'Adding Rational Numbers with Different Denominators',
    title_te: 'విభిన్న హారాలు కలిగిన అకరణీయ సంఖ్యల సంకలనం',
    subject: 'Mathematics',
    grade: 'Class 8',
    chapter: 'Rational Numbers (అకరణీయ సంఖ్యలు)',
    topic: 'addition_rational',
    difficulty: 'Intermediate',
    estimatedMinutes: 20,
    status: 'Published',
    objectives_en: [
      'Find the Least Common Multiple (LCM) of denominators',
      'Convert each fraction to an equivalent fraction with the common denominator',
      'Add numerators while retaining the common denominator'
    ],
    objectives_te: [
      'హారాల కనిష్ట సామాన్య గుణిజం (క.సా.గు) ను కనుగొనడం',
      'ప్రతి భిన్నాన్ని సమాన హారంతో సమాన భిన్నంగా మార్చడం',
      'ఉమ్మడి హారాన్ని ఉంచుతూ లవాలను మాత్రమే కూడడం'
    ],
    prerequisites: ['LCM calculation', 'Equivalent fractions', 'Integer addition'],
    sections: [
      {
        id: 'sec-1',
        type: 'concept',
        heading_en: 'The Golden Rule of Fraction Addition',
        heading_te: 'భిన్నాల కూడిక యొక్క ముఖ్య నియమం',
        content_en: 'You CANNOT simply add numerators and denominators across: a/b + c/d != (a+c)/(b+d). Before adding, pieces must be of equal size, which means equal denominators.',
        content_te: 'మీరు లవాలను మరియు హారాలను నేరుగా కూడకూడదు: a/b + c/d != (a+c)/(b+d). కూడే ముందు, భాగాలు సమాన పరిమాణంలో ఉండాలి, అంటే హారాలు సమానం కావాలి.'
      },
      {
        id: 'sec-2',
        type: 'misconception_warning',
        heading_en: 'Watch Out: The Direct Addition Trap',
        heading_te: 'జాగ్రత్త: ప్రత్యక్ష కూడిక పొరపాటు',
        content_en: 'Adding 1/2 + 1/3 does NOT give 2/5! Notice that 1/2 is already 50% of the pizza, while 2/5 is only 40%. The answer cannot be smaller than one of its parts!',
        content_te: '1/2 + 1/3 ని కూడితే 2/5 రాదు! 1/2 అంటేనే సగం (50%), కానీ 2/5 అంటే కేవలం 40%. కూడిన తర్వాత మొత్తం ఒక భాగం కంటే తక్కువ ఎలా అవుతుంది?'
      },
      {
        id: 'sec-3',
        type: 'example',
        heading_en: 'Step-by-Step Worked Example: 1/2 + 1/3',
        heading_te: 'దశలవారీగా ఉదాహరణ: 1/2 + 1/3',
        content_en: 'Step 1: LCM of 2 and 3 is 6.\nStep 2: 1/2 = 3/6, and 1/3 = 2/6.\nStep 3: 3/6 + 2/6 = (3 + 2)/6 = 5/6.\nFinal Answer: 5/6.',
        content_te: 'దశ 1: 2 మరియు 3 ల క.సా.గు 6.\nదశ 2: 1/2 = 3/6, మరియు 1/3 = 2/6.\nదశ 3: 3/6 + 2/6 = (3 + 2)/6 = 5/6.\nచివరి సమాధానం: 5/6.'
      },
      {
        id: 'sec-4',
        type: 'lab_link',
        heading_en: 'Interactive 3D Visualizer',
        heading_te: '3D గణిత నమూనా ప్రదర్శన',
        content_en: 'Switch to the 3D Math Lab tab to see fraction bars sliced dynamically into 6 equal segments!',
        content_te: 'భిన్నాలు 6 సమాన భాగాలుగా విభజించబడటం ప్రత్యక్షంగా చూడటానికి 3D మ్యాథ్ ల్యాబ్ విభాగాన్ని చూడండి!'
      }
    ]
  },
  {
    id: 'lesson-rn-2',
    title_en: 'Rational Numbers on the Number Line & Negatives',
    title_te: 'సంఖ్యా రేఖపై అకరణీయ సంఖ్యలు మరియు రుణ సంఖ్యలు',
    subject: 'Mathematics',
    grade: 'Class 8',
    chapter: 'Rational Numbers',
    topic: 'number_line',
    difficulty: 'Beginner',
    estimatedMinutes: 15,
    status: 'Published',
    objectives_en: [
      'Locate negative rational numbers to the left of 0',
      'Understand division of unit intervals into equal parts'
    ],
    objectives_te: [
      'సున్నాకి ఎడమవైపున రుణ అకరణీయ సంఖ్యలను గుర్తించడం',
      'యూనిట్ దూరాలను సమాన భాగాలుగా విభజించడం'
    ],
    prerequisites: ['Integers on number line', 'Basic fractions'],
    sections: [
      {
        id: 'sec-2-1',
        type: 'concept',
        heading_en: 'Direction Matters: Negative is Left',
        heading_te: 'దిశ ముఖ్యం: రుణ సంఖ్యలు ఎడమవైపు ఉంటాయి',
        content_en: '-3/4 lies between 0 and -1. Divide the distance between 0 and -1 into 4 equal segments and count 3 steps to the left from 0.',
        content_te: '-3/4 అనేది 0 మరియు -1 ల మధ్య ఉంటుంది. 0 మరియు -1 మధ్య భాగాన్ని 4 సమాన భాగాలుగా చేసి, 0 నుండి ఎడమవైపుకు 3 భాగాలు లెక్కించాలి.'
      }
    ]
  }
];

export default function LessonPlanner({
  lang = 'en',
  t = (k) => k,
  questions = [],
  onUpdateQuestion,
  onDuplicateQuestion,
  onAdvanceStatus,
  onCreateQuestion,
  onReportQuestion,
  onDeleteQuestion
}) {
  const [plannerMode, setPlannerMode] = useState('lessons'); // 'lessons' | 'questions'
  const [lessons, setLessons] = useState(() => {
    try {
      const saved = localStorage.getItem('udaan_teacher_lessons');
      return saved ? JSON.parse(saved) : DEFAULT_LESSONS;
    } catch {
      return DEFAULT_LESSONS;
    }
  });

  const [activeLessonId, setActiveLessonId] = useState(lessons[0]?.id || null);
  const [editingLesson, setEditingLesson] = useState(null);
  const [aiDrafting, setAiDrafting] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem('udaan_teacher_lessons', JSON.stringify(lessons));
    } catch (e) {
      console.warn('Failed to persist lessons:', e);
    }
  }, [lessons]);

  const activeLesson = lessons.find((l) => l.id === activeLessonId) || lessons[0];

  const handleCreateNewLesson = () => {
    const newLesson = {
      id: `lesson-${Date.now()}`,
      title_en: 'New Lesson: Rational Numbers Operation',
      title_te: 'కొత్త పాఠం: అకరణీయ సంఖ్యల ప్రక్రియ',
      subject: 'Mathematics',
      grade: 'Class 8',
      chapter: 'Rational Numbers',
      topic: 'multiplication_rational',
      difficulty: 'Beginner',
      estimatedMinutes: 15,
      status: 'Draft',
      objectives_en: ['Multiply numerators together', 'Multiply denominators together'],
      objectives_te: ['లవాలను గుణించడం', 'హారాలను గుణించడం'],
      prerequisites: ['Basic multiplication', 'Simplification of fractions'],
      sections: [
        {
          id: `sec-${Date.now()}-1`,
          type: 'concept',
          heading_en: 'Introduction',
          heading_te: 'పరిచయం',
          content_en: 'Enter core mathematical concepts here with clear visual descriptions.',
          content_te: 'ఇక్కడ స్పష్టమైన వివరణలతో గణిత భావనలను నమోదు చేయండి.'
        }
      ]
    };
    setLessons([newLesson, ...lessons]);
    setActiveLessonId(newLesson.id);
    setEditingLesson(newLesson);
    setPreviewMode(false);
  };

  const handleSaveLesson = (updated) => {
    setLessons(lessons.map((l) => (l.id === updated.id ? updated : l)));
    setEditingLesson(null);
  };

  const handleTogglePublish = (lessonId) => {
    setLessons(
      lessons.map((l) => {
        if (l.id === lessonId) {
          const nextStatus = l.status === 'Published' ? 'Draft' : 'Published';
          return { ...l, status: nextStatus };
        }
        return l;
      })
    );
  };

  const handleDeleteLesson = (lessonId) => {
    if (lessons.length <= 1) {
      alert(lang === 'te' ? 'కనీసం ఒక పాఠం ఉండాలి.' : 'At least one lesson must remain.');
      return;
    }
    const filtered = lessons.filter((l) => l.id !== lessonId);
    setLessons(filtered);
    setActiveLessonId(filtered[0].id);
    if (editingLesson?.id === lessonId) setEditingLesson(null);
  };

  const handleAIDraftMisconceptionSection = async (lesson) => {
    setAiDrafting(true);
    try {
      const prompt = `Class 8 NCERT Mathematics Topic: ${lesson.title_en} (${lesson.topic}). Identify the top mathematical misconception students make, explain why it happens, and give a worked correction.`;
      const res = await api.getAIExplanation({
        stem: prompt,
        student_answer: '',
        misconception_tag: 'rational_addition_error',
        topic: lesson.topic || 'Rational Numbers',
        lang,
      });
      const explanation = res?.explanation || 'Common error: Adding numerators and denominators directly.';

      const newSection = {
        id: `sec-ai-${Date.now()}`,
        type: 'misconception_warning',
        heading_en: 'AI Misconception Diagnostic Note',
        heading_te: 'AI అభ్యాస లోప నిర్ధారణ గమనిక',
        content_en: explanation,
        content_te: res?.explanation_te || 'లవాలు మరియు హారాలను నేరుగా కూడటం అత్యంత సాధారణ పొరపాటు. సమాన హారాలను క.సా.గు ద్వారా సాధించాలి.'
      };

      const updated = {
        ...lesson,
        sections: [...lesson.sections, newSection]
      };
      handleSaveLesson(updated);
      if (editingLesson) setEditingLesson(updated);
    } catch {
      alert('AI assistant offline. Using standard NCERT pedagogical note.');
    } finally {
      setAiDrafting(false);
    }
  };

  const isTe = lang === 'te';

  return (
    <div className="tab-page" style={{ padding: '8px 0 32px 0' }}>
      {/* Top Navigation Bar */}
      <div className="card" style={{ marginBottom: '16px', background: 'linear-gradient(135deg, rgba(16,17,22,0.9), rgba(138,75,255,0.08))' }}>
        <div className="spaced" style={{ flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div className="row" style={{ gap: '10px' }}>
              <span style={{ fontSize: '1.8rem' }}>📝</span>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.4rem' }}>
                  {isTe ? 'ఉపాధ్యాయుల పాఠ్య ప్రణాళిక & ప్రశ్నల రూపకల్పన' : 'Teacher Lesson Planner & Content Studio'}
                </h2>
                <p className="mu" style={{ margin: 0, fontSize: '0.86rem' }}>
                  {isTe
                    ? 'ఎన్‌సీఈఆర్‌టీ 8వ తరగతి అకరణీయ సంఖ్యల సమగ్ర పాఠాలు, 3D ల్యాబ్ అనుసంధానం మరియు ప్రశ్నల తయారీ'
                    : 'Craft NCERT Class 8 rational numbers curriculum, structured 3D lab lessons, and misconception-tagged diagnostic items'}
                </p>
              </div>
            </div>
          </div>

          <div className="row" style={{ gap: '8px' }}>
            <button
              className={plannerMode === 'lessons' ? 'pri' : 'sec'}
              onClick={() => setPlannerMode('lessons')}
              style={{ padding: '8px 14px', fontSize: '0.9rem' }}
            >
              📚 {isTe ? 'పాఠ్య ప్రణాళికలు' : 'Lesson Plans'} ({lessons.length})
            </button>
            <button
              className={plannerMode === 'questions' ? 'pri' : 'sec'}
              onClick={() => setPlannerMode('questions')}
              style={{ padding: '8px 14px', fontSize: '0.9rem' }}
            >
              ❓ {isTe ? 'ప్రశ్నల నిధి & రివ్యూ' : 'Question Bank & Review'} ({questions.length})
            </button>
          </div>
        </div>
      </div>

      {plannerMode === 'questions' ? (
        <ContentAuthoring
          questions={questions}
          onUpdateQuestion={onUpdateQuestion}
          onDuplicateQuestion={onDuplicateQuestion}
          onAdvanceStatus={onAdvanceStatus}
          onCreateQuestion={onCreateQuestion}
          onReportQuestion={onReportQuestion}
          onDeleteQuestion={onDeleteQuestion}
        />
      ) : (
        <div className="grid" style={{ gridTemplateColumns: '320px 1fr', gap: '16px', alignItems: 'start' }}>
          {/* Sidebar: Lesson Catalog */}
          <div className="card" style={{ padding: '16px' }}>
            <div className="spaced" style={{ marginBottom: '14px' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem' }}>
                {isTe ? 'పాఠాల జాబితా' : 'Lessons Library'}
              </h3>
              <button className="pri" onClick={handleCreateNewLesson} style={{ padding: '4px 10px', fontSize: '0.8rem' }}>
                + {isTe ? 'కొత్త పాఠం' : 'New Lesson'}
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {lessons.map((l) => (
                <div
                  key={l.id}
                  onClick={() => {
                    setActiveLessonId(l.id);
                    setEditingLesson(null);
                    setPreviewMode(false);
                  }}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    background: activeLessonId === l.id ? 'rgba(0, 242, 254, 0.12)' : 'rgba(255,255,255,0.03)',
                    border: activeLessonId === l.id ? '1px solid var(--pr)' : '1px solid rgba(255,255,255,0.06)',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div className="spaced" style={{ marginBottom: '4px' }}>
                    <span className={`tag ${l.status === 'Published' ? 'good' : 'warn'}`} style={{ fontSize: '0.7rem' }}>
                      {l.status === 'Published' ? (isTe ? 'ప్రచురితం' : 'Published') : (isTe ? 'చిత్తుప్రతి' : 'Draft')}
                    </span>
                    <span className="mu" style={{ fontSize: '0.75rem' }}>⏱ {l.estimatedMinutes}m</span>
                  </div>
                  <div style={{ fontWeight: 600, fontSize: '0.88rem', color: '#fff', marginBottom: '2px' }}>
                    {isTe ? l.title_te : l.title_en}
                  </div>
                  <div className="mu" style={{ fontSize: '0.74rem' }}>{l.topic} • {l.difficulty}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Main Work Area: Lesson Detail / Editor / Preview */}
          <div className="card" style={{ padding: '20px' }}>
            {activeLesson ? (
              <div>
                {/* Header Actions */}
                <div className="spaced" style={{ flexWrap: 'wrap', gap: '10px', marginBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '12px' }}>
                  <div>
                    <span className="badge-tag" style={{ marginRight: '8px' }}>{activeLesson.grade} • {activeLesson.subject}</span>
                    <span className={`tag ${activeLesson.status === 'Published' ? 'good' : 'warn'}`}>
                      {activeLesson.status}
                    </span>
                  </div>
                  <div className="row" style={{ gap: '8px' }}>
                    <button
                      className="sec"
                      onClick={() => setPreviewMode(!previewMode)}
                      style={{ fontSize: '0.82rem', padding: '6px 12px' }}
                    >
                      {previewMode ? (isTe ? '✏️ సవరణ మోడ్' : '✏️ Edit Mode') : (isTe ? '👁 విద్యార్థి ప్రివ్యూ' : '👁 Student Preview')}
                    </button>

                    <button
                      className={activeLesson.status === 'Published' ? 'warn' : 'pri'}
                      onClick={() => handleTogglePublish(activeLesson.id)}
                      style={{ fontSize: '0.82rem', padding: '6px 12px' }}
                    >
                      {activeLesson.status === 'Published'
                        ? (isTe ? 'చిత్తుప్రతిగా మార్చు' : 'Unpublish')
                        : (isTe ? '🚀 ప్రచురించు' : '🚀 Publish')}
                    </button>

                    <button
                      className="sec"
                      onClick={() => handleAIDraftMisconceptionSection(activeLesson)}
                      disabled={aiDrafting}
                      style={{ fontSize: '0.82rem', padding: '6px 12px', border: '1px solid var(--purple)' }}
                    >
                      {aiDrafting ? '⏳ AI Drafting...' : '✨ AI Misconception Note'}
                    </button>

                    <button
                      className="danger"
                      onClick={() => handleDeleteLesson(activeLesson.id)}
                      style={{ fontSize: '0.82rem', padding: '6px 10px' }}
                      title="Delete Lesson"
                    >
                      🗑️
                    </button>
                  </div>
                </div>

                {/* Content */}
                {previewMode ? (
                  /* Student View Preview */
                  <div style={{ background: 'rgba(0,0,0,0.3)', padding: '16px', borderRadius: '10px', border: '1px solid rgba(0,242,254,0.2)' }}>
                    <div style={{ display: 'inline-block', background: 'rgba(0,242,254,0.1)', color: 'var(--pr)', padding: '3px 8px', borderRadius: '4px', fontSize: '0.75rem', marginBottom: '8px' }}>
                      {isTe ? 'విద్యార్థి వీక్షణ ప్రివ్యూ' : 'Interactive Student Lesson View'}
                    </div>
                    <h2 style={{ color: '#fff', margin: '4px 0 12px 0' }}>
                      {isTe ? activeLesson.title_te : activeLesson.title_en}
                    </h2>
                    
                    <div style={{ marginBottom: '16px', padding: '10px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}>
                      <strong style={{ fontSize: '0.85rem', color: 'var(--pr)' }}>
                        🎯 {isTe ? 'నేర్చుకునే లక్ష్యాలు:' : 'Learning Objectives:'}
                      </strong>
                      <ul style={{ margin: '6px 0 0 18px', padding: 0, fontSize: '0.85rem' }}>
                        {(isTe ? activeLesson.objectives_te : activeLesson.objectives_en).map((obj, i) => (
                          <li key={i}>{obj}</li>
                        ))}
                      </ul>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      {activeLesson.sections.map((sec) => (
                        <div
                          key={sec.id}
                          style={{
                            padding: '14px 16px',
                            borderRadius: '8px',
                            background:
                              sec.type === 'misconception_warning'
                                ? 'rgba(244, 63, 94, 0.08)'
                                : sec.type === 'lab_link'
                                ? 'rgba(138, 75, 255, 0.1)'
                                : 'rgba(255,255,255,0.02)',
                            borderLeft:
                              sec.type === 'misconception_warning'
                                ? '4px solid var(--er)'
                                : sec.type === 'lab_link'
                                ? '4px solid var(--purple)'
                                : '4px solid var(--pr)'
                          }}
                        >
                          <div style={{ fontWeight: 600, fontSize: '0.95rem', color: '#fff', marginBottom: '6px' }}>
                            {sec.type === 'misconception_warning' && '⚠️ '}
                            {sec.type === 'lab_link' && '🔬 '}
                            {sec.type === 'example' && '💡 '}
                            {isTe ? sec.heading_te : sec.heading_en}
                          </div>
                          <div style={{ fontSize: '0.88rem', color: 'var(--tx)', whiteSpace: 'pre-line' }}>
                            {isTe ? sec.content_te : sec.content_en}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  /* Editor Mode */
                  <div>
                    <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                      <div>
                        <label style={{ fontSize: '0.78rem', color: 'var(--mu)', display: 'block', marginBottom: '4px' }}>
                          Lesson Title (English)
                        </label>
                        <input
                          className="inp"
                          value={activeLesson.title_en}
                          onChange={(e) =>
                            handleSaveLesson({ ...activeLesson, title_en: e.target.value })
                          }
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.78rem', color: 'var(--mu)', display: 'block', marginBottom: '4px' }}>
                          Lesson Title (Telugu)
                        </label>
                        <input
                          className="inp"
                          value={activeLesson.title_te}
                          onChange={(e) =>
                            handleSaveLesson({ ...activeLesson, title_te: e.target.value })
                          }
                        />
                      </div>
                    </div>

                    <div className="grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '16px' }}>
                      <div>
                        <label style={{ fontSize: '0.78rem', color: 'var(--mu)', display: 'block', marginBottom: '4px' }}>Topic Tag</label>
                        <input
                          className="inp"
                          value={activeLesson.topic}
                          onChange={(e) => handleSaveLesson({ ...activeLesson, topic: e.target.value })}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.78rem', color: 'var(--mu)', display: 'block', marginBottom: '4px' }}>Difficulty</label>
                        <select
                          className="inp"
                          value={activeLesson.difficulty}
                          onChange={(e) => handleSaveLesson({ ...activeLesson, difficulty: e.target.value })}
                        >
                          <option>Beginner</option>
                          <option>Intermediate</option>
                          <option>Advanced</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: '0.78rem', color: 'var(--mu)', display: 'block', marginBottom: '4px' }}>Time (mins)</label>
                        <input
                          className="inp"
                          type="number"
                          value={activeLesson.estimatedMinutes}
                          onChange={(e) => handleSaveLesson({ ...activeLesson, estimatedMinutes: Number(e.target.value) })}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.78rem', color: 'var(--mu)', display: 'block', marginBottom: '4px' }}>Class / Grade</label>
                        <input
                          className="inp"
                          value={activeLesson.grade}
                          onChange={(e) => handleSaveLesson({ ...activeLesson, grade: e.target.value })}
                        />
                      </div>
                    </div>

                    {/* Lesson Sections */}
                    <div style={{ marginTop: '20px' }}>
                      <div className="spaced" style={{ marginBottom: '12px' }}>
                        <h4 style={{ margin: 0, fontSize: '0.98rem' }}>
                          {isTe ? 'పాఠ్య విభాగాలు' : 'Lesson Content Sections'} ({activeLesson.sections.length})
                        </h4>
                        <button
                          className="sec"
                          onClick={() => {
                            const newSec = {
                              id: `sec-${Date.now()}`,
                              type: 'concept',
                              heading_en: 'New Section',
                              heading_te: 'కొత్త విభాగం',
                              content_en: '',
                              content_te: ''
                            };
                            handleSaveLesson({
                              ...activeLesson,
                              sections: [...activeLesson.sections, newSec]
                            });
                          }}
                          style={{ fontSize: '0.78rem', padding: '4px 10px' }}
                        >
                          + {isTe ? 'విభాగం జోడించు' : 'Add Section'}
                        </button>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        {activeLesson.sections.map((sec, sIdx) => (
                          <div
                            key={sec.id}
                            style={{
                              padding: '12px',
                              borderRadius: '8px',
                              background: 'rgba(255,255,255,0.02)',
                              border: '1px solid rgba(255,255,255,0.06)'
                            }}
                          >
                            <div className="spaced" style={{ marginBottom: '8px' }}>
                              <select
                                className="inp"
                                value={sec.type}
                                onChange={(e) => {
                                  const updated = activeLesson.sections.map((s, i) =>
                                    i === sIdx ? { ...s, type: e.target.value } : s
                                  );
                                  handleSaveLesson({ ...activeLesson, sections: updated });
                                }}
                                style={{ width: '200px', fontSize: '0.78rem' }}
                              >
                                <option value="concept">Concept Note</option>
                                <option value="misconception_warning">Misconception Warning</option>
                                <option value="example">Worked Example</option>
                                <option value="lab_link">3D Math Lab Link</option>
                                <option value="summary">Summary</option>
                              </select>

                              <button
                                className="danger"
                                onClick={() => {
                                  const updated = activeLesson.sections.filter((_, i) => i !== sIdx);
                                  handleSaveLesson({ ...activeLesson, sections: updated });
                                }}
                                style={{ fontSize: '0.72rem', padding: '3px 8px' }}
                              >
                                ✕ Remove
                              </button>
                            </div>

                            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                              <input
                                className="inp"
                                placeholder="Heading (English)"
                                value={sec.heading_en}
                                onChange={(e) => {
                                  const updated = activeLesson.sections.map((s, i) =>
                                    i === sIdx ? { ...s, heading_en: e.target.value } : s
                                  );
                                  handleSaveLesson({ ...activeLesson, sections: updated });
                                }}
                              />
                              <input
                                className="inp"
                                placeholder="Heading (Telugu)"
                                value={sec.heading_te}
                                onChange={(e) => {
                                  const updated = activeLesson.sections.map((s, i) =>
                                    i === sIdx ? { ...s, heading_te: e.target.value } : s
                                  );
                                  handleSaveLesson({ ...activeLesson, sections: updated });
                                }}
                              />
                            </div>

                            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                              <textarea
                                className="inp"
                                rows={3}
                                placeholder="Content (English)..."
                                value={sec.content_en}
                                onChange={(e) => {
                                  const updated = activeLesson.sections.map((s, i) =>
                                    i === sIdx ? { ...s, content_en: e.target.value } : s
                                  );
                                  handleSaveLesson({ ...activeLesson, sections: updated });
                                }}
                              />
                              <textarea
                                className="inp"
                                rows={3}
                                placeholder="Content (Telugu)..."
                                value={sec.content_te}
                                onChange={(e) => {
                                  const updated = activeLesson.sections.map((s, i) =>
                                    i === sIdx ? { ...s, content_te: e.target.value } : s
                                  );
                                  handleSaveLesson({ ...activeLesson, sections: updated });
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="mu">{isTe ? 'దయచేసి ఒక పాఠాన్ని ఎంచుకోండి.' : 'Please select or create a lesson.'}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
