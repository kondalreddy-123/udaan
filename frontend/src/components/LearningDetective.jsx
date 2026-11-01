import React, { useState } from 'react';
import { api } from '../services/api';

function VisualDemonstration({ type, lang }) {
  if (type === 'fraction_strips') {
    return (
      <div style={{ margin: '14px 0', padding: '14px', background: 'rgba(0, 242, 254, 0.05)', borderRadius: '10px', border: '1px solid rgba(0, 242, 254, 0.2)' }}>
        <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#00f2fe', marginBottom: 8 }}>
          {lang === 'te' ? 'సమాన హారాల భిన్న పట్టీలు (క.సా.గు = 4):' : 'Fraction Strips with Equal Denominators (LCM = 4):'}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div>
            <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginBottom: 3 }}>-3/4 (3 negative fourths):</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', height: 26, borderRadius: 6, overflow: 'hidden', border: '1px solid #fb923c' }}>
              <div style={{ background: '#f43f5e', opacity: 0.9, borderRight: '1px solid #07080a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', color: '#fff', fontWeight: 700 }}>-1/4</div>
              <div style={{ background: '#f43f5e', opacity: 0.9, borderRight: '1px solid #07080a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', color: '#fff', fontWeight: 700 }}>-1/4</div>
              <div style={{ background: '#f43f5e', opacity: 0.9, borderRight: '1px solid #07080a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', color: '#fff', fontWeight: 700 }}>-1/4</div>
              <div style={{ background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', color: '#64748b' }}>0</div>
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginBottom: 3 }}>+1/2 = +2/4 (2 positive fourths):</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', height: 26, borderRadius: 6, overflow: 'hidden', border: '1px solid #00f2fe' }}>
              <div style={{ background: '#10b981', opacity: 0.9, borderRight: '1px solid #07080a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', color: '#fff', fontWeight: 700 }}>+1/4</div>
              <div style={{ background: '#10b981', opacity: 0.9, borderRight: '1px solid #07080a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', color: '#fff', fontWeight: 700 }}>+1/4</div>
              <div style={{ background: 'rgba(255,255,255,0.05)', borderRight: '1px solid #07080a' }}></div>
              <div style={{ background: 'rgba(255,255,255,0.05)' }}></div>
            </div>
          </div>
          <div style={{ padding: '6px 12px', background: 'rgba(16, 185, 129, 0.12)', borderRadius: 6, fontSize: '0.82rem', color: '#34d399', fontWeight: 600 }}>
            ✓ (-3/4) + (+2/4) = (-3 + 2)/4 = -1/4 (1 negative unit remains)
          </div>
        </div>
      </div>
    );
  }
  if (type === 'area_model') {
    return (
      <div style={{ margin: '14px 0', padding: '14px', background: 'rgba(168, 85, 247, 0.05)', borderRadius: '10px', border: '1px solid rgba(168, 85, 247, 0.2)' }}>
        <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#c084fc', marginBottom: 8 }}>
          {lang === 'te' ? 'వైశాల్య నమూనా ద్వారా గుణకార సమానత్వం:' : 'Area Model: Multiplicative Partition Scaling:'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', textAlign: 'center', marginBottom: 4 }}>2/3 (2 columns shaded)</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 30px)', height: 60, border: '2px solid #a855f7', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ background: '#a855f7', opacity: 0.8, borderRight: '1px solid #07080a' }}></div>
              <div style={{ background: '#a855f7', opacity: 0.8, borderRight: '1px solid #07080a' }}></div>
              <div style={{ background: 'rgba(255,255,255,0.04)' }}></div>
            </div>
          </div>
          <span style={{ fontSize: '1.2rem', color: '#00f2fe', fontWeight: 700 }}>× 3/3 ➔</span>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', textAlign: 'center', marginBottom: 4 }}>6/9 (6 of 9 cells shaded)</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 30px)', gridTemplateRows: 'repeat(3, 20px)', border: '2px solid #00f2fe', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ background: '#00f2fe', opacity: 0.8, borderRight: '1px solid #07080a', borderBottom: '1px solid #07080a' }}></div>
              <div style={{ background: '#00f2fe', opacity: 0.8, borderRight: '1px solid #07080a', borderBottom: '1px solid #07080a' }}></div>
              <div style={{ background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid #07080a' }}></div>
              <div style={{ background: '#00f2fe', opacity: 0.8, borderRight: '1px solid #07080a', borderBottom: '1px solid #07080a' }}></div>
              <div style={{ background: '#00f2fe', opacity: 0.8, borderRight: '1px solid #07080a', borderBottom: '1px solid #07080a' }}></div>
              <div style={{ background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid #07080a' }}></div>
              <div style={{ background: '#00f2fe', opacity: 0.8, borderRight: '1px solid #07080a' }}></div>
              <div style={{ background: '#00f2fe', opacity: 0.8, borderRight: '1px solid #07080a' }}></div>
              <div style={{ background: 'rgba(255,255,255,0.04)' }}></div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (type === 'number_line') {
    return (
      <div style={{ margin: '14px 0', padding: '14px', background: 'rgba(0, 242, 254, 0.05)', borderRadius: '10px', border: '1px solid rgba(0, 242, 254, 0.2)' }}>
        <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#00f2fe', marginBottom: 8 }}>
          {lang === 'te' ? 'సంఖ్యా రేఖ నియమం (తీసివేత - రుణ గుర్తు = కుడివైపు కదలిక):' : 'Number Line Rule: Subtracting a negative steps RIGHT'}
        </div>
        <div style={{ position: 'relative', height: 46, borderBottom: '2px solid #38bdf8', margin: '24px 10px 14px' }}>
          {[-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1].map((tick, i) => (
            <div key={i} style={{ position: 'absolute', left: `${(tick + 1) * 50}%`, transform: 'translateX(-50%)', top: 28, fontSize: '0.72rem', color: tick === 0 ? '#00f2fe' : '#94a3b8' }}>
              <div style={{ width: 2, height: 6, background: '#38bdf8', margin: '0 auto 2px' }}></div>
              {tick}
            </div>
          ))}
          <div style={{ position: 'absolute', left: '25%', top: -14, color: '#f43f5e', fontSize: '0.78rem', fontWeight: 700 }}>
            Start -0.5
          </div>
          <div style={{ position: 'absolute', left: '25%', width: '37.5%', height: 16, borderTop: '2px dashed #10b981', borderRight: '2px solid #10b981', top: 0 }}></div>
          <div style={{ position: 'absolute', left: '62.5%', top: -14, color: '#10b981', fontSize: '0.78rem', fontWeight: 700 }}>
            +0.75 ➔ Lands on +0.25 (+1/4)
          </div>
        </div>
      </div>
    );
  }
  if (type === 'reciprocal') {
    return (
      <div style={{ margin: '14px 0', padding: '14px', background: 'rgba(251, 146, 60, 0.05)', borderRadius: '10px', border: '1px solid rgba(251, 146, 60, 0.2)' }}>
        <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#fb923c', marginBottom: 8 }}>
          {lang === 'te' ? 'వ్యుత్క్రమ నియమం: భాగహారాన్ని గుణకారంగా మార్చండి' : 'Invert & Multiply: Flip divisor into reciprocal'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '1.1rem', fontWeight: 700 }}>
          <span style={{ color: '#f8fafc' }}>(3/5) ÷ (2/3)</span>
          <span style={{ color: '#00f2fe' }}>➔</span>
          <span style={{ color: '#34d399' }}>(3/5) × (3/2)</span>
          <span style={{ color: '#00f2fe' }}>=</span>
          <span style={{ color: '#38bdf8' }}>9/10</span>
        </div>
      </div>
    );
  }
  return null;
}

export default function LearningDetective({
  lang,
  t,
  onCompleteCase,
  onRaiseActionCard,
  onReturnToDashboard
}) {
  const [activeCaseKey, setActiveCaseKey] = useState('case_rational_add');
  const [session, setSession] = useState(null);
  const [aiExplanation, setAiExplanation] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceNotice, setVoiceNotice] = useState('');
  const [selectedTopicFilter, setSelectedTopicFilter] = useState('all');

  // All 7 NCERT Class 8 Rational Number Misconception Cases
  const cases = {
    case_rational_add: {
      id: 'case_rational_add',
      concept_id: 'c5',
      topic_category: 'addition_subtraction',
      badge: 'NCERT c5 · Adding Rationals',
      title_en: 'Adding Fractions with Unlike Denominators',
      title_te: 'వేర్వేరు హారాలు గల అకరణీయ సంఖ్యల కూడిక',
      prereq: 'Equivalent Fractions & LCM (c2)',
      primary: {
        stem_en: 'Evaluate: (-3/4) + (1/2) = ?',
        stem_te: 'గణించండి: (-3/4) + (1/2) = ?',
        options: [
          { text: '-1/4', correct: true, tag: null, label: 'A', exp_en: 'Correct! -3/4 + 2/4 = -1/4.', exp_te: 'సరైనది! -3/4 + 2/4 = -1/4.' },
          { text: '-1/3', correct: false, tag: 'num_den_separate', label: 'B', exp_en: 'Added tops and bottoms: (-3+1)/(4+2) = -2/6 = -1/3.', exp_te: 'లవాలు మరియు హారాలను విడివిడిగా కూడారు.' },
          { text: '5/4', correct: false, tag: 'ignored_negative', label: 'C', exp_en: 'Dropped negative sign: 3/4 + 2/4 = 5/4.', exp_te: 'రుణ గుర్తును విస్మరించారు.' },
          { text: '1/4', correct: false, tag: 'sign_slip', label: 'D', exp_en: 'Calculation sign slip: +1/4 instead of -1/4.', exp_te: 'గుర్తు గణనలో పొరపాటు.' }
        ]
      },
      followUp: {
        stem_en: 'Diagnostic Check: 1/2 + 1/2 = ?',
        stem_te: 'నిర్ధారణ ప్రశ్న: 1/2 + 1/2 = ?',
        optA: { text_en: '1', text_te: '1', correct: true },
        optB: { text_en: '2/4', text_te: '2/4', correct: false }
      },
      support: {
        hint_en: 'Fractions cannot be added by combining tops and bottoms! Denominators define slice sizes. You must find the LCM to make slice sizes equal first.',
        hint_te: 'భిన్నాలను లవాలు మరియు హారాలను నేరుగా కలపడం ద్వారా కూడలేము! హారాలు భాగాల పరిమాణాన్ని సూచిస్తాయి. మొదట క.సా.గు కనుగొనాలి.',
        example_en: 'Step 1: LCM(4, 2) = 4.\nStep 2: Convert 1/2 to 2/4.\nStep 3: (-3/4) + (2/4) = (-3 + 2)/4 = -1/4.\nVisual: On the number line, start at 0, step left to -3/4, then step right by 2/4 to stop at -1/4.',
        example_te: 'దశ 1: 4 మరియు 2 ల క.సా.గు = 4.\nదశ 2: 1/2 ను 2/4 గా మార్చండి.\nదశ 3: (-3/4) + (2/4) = -1/4.\nసంఖ్యా రేఖపై 0 నుండి -3/4 కి వెళ్లి, కుడివైపు +2/4 కదిలితే -1/4 వద్ద ఆగుతారు.',
        visualType: 'fraction_strips'
      },
      reassessment: {
        stem_en: 'Fresh Reassessment (new numbers): (-2/3) + (1/6) = ?',
        stem_te: 'కొత్త పునఃపరిశీలన ప్రశ్న: (-2/3) + (1/6) = ?',
        options: [
          { text: '-1/2', correct: true, label: 'A' },
          { text: '-1/9', correct: false, label: 'B' },
          { text: '1/2', correct: false, label: 'C' },
          { text: '-1/6', correct: false, label: 'D' }
        ],
        solution_en: 'LCM(3, 6) = 6. Convert -2/3 to -4/6. Then (-4 + 1)/6 = -3/6 = -1/2.'
      }
    },
    case_equivalent_fractions: {
      id: 'case_equivalent_fractions',
      concept_id: 'c1',
      topic_category: 'fractions_scaling',
      badge: 'NCERT c1 · Equivalent Fractions',
      title_en: 'Equivalent Fractions & Multiplicative Scaling',
      title_te: 'సమాన భిన్నాలు మరియు గుణకార రూపాలు',
      prereq: 'Integers & Basic Partitions (c0)',
      primary: {
        stem_en: 'Which fraction is strictly equivalent to 2/3?',
        stem_te: '2/3 కు ఖచ్చితమైన సమాన భిన్నం ఏది?',
        options: [
          { text: '6/9', correct: true, tag: null, label: 'A', exp_en: 'Correct! Both top and bottom multiplied by 3: (2×3)/(3×3) = 6/9.', exp_te: 'సరైనది! లవం మరియు హారాలు రెండూ 3 చే గుణించబడ్డాయి.' },
          { text: '4/5', correct: false, tag: 'additive_equivalence', label: 'B', exp_en: 'Added 2 to both top and bottom (2+2)/(3+2) = 4/5. Adding alters the proportion!', exp_te: 'లవానికి మరియు హారానికి 2 కూడారు. కూడటం వల్ల భిన్నం విలువ మారుతుంది!' },
          { text: '3/2', correct: false, tag: 'reciprocal_confusion', label: 'C', exp_en: 'Inverted the fraction (reciprocal) instead of scaling.', exp_te: 'భిన్నాన్ని తిరగరాశారు (వ్యుత్క్రమం).' },
          { text: '2/6', correct: false, tag: 'denominator_only_scaled', label: 'D', exp_en: 'Multiplied denominator only, shrinking fraction to 1/3.', exp_te: 'హారాన్ని మాత్రమే రెట్టింపు చేశారు.' }
        ]
      },
      followUp: {
        stem_en: 'Diagnostic Check: Does 1/2 equal (1+1)/(2+1) = 2/3?',
        stem_te: 'నిర్ధారణ ప్రశ్న: 1/2 అనేది (1+1)/(2+1) = 2/3 కి సమానమా?',
        optA: { text_en: 'No, they represent different values', text_te: 'కాదు, అవి వేర్వేరు విలువలను సూచిస్తాయి', correct: true },
        optB: { text_en: 'Yes, adding equal numbers keeps fractions equal', text_te: 'అవును, ఒకే సంఖ్యను కూడితే భిన్నం సమానమే', correct: false }
      },
      support: {
        hint_en: 'To make an equivalent fraction, you must MULTIPLY or DIVIDE both numerator and denominator by the exact same number. Never add!',
        hint_te: 'సమాన భిన్నాన్ని పొందడానికి లవం మరియు హారాన్ని ఒకే సంఖ్యతో గుణించాలి లేదా భాగించాలి. ఎప్పుడూ కూడకూడదు!',
        example_en: 'Example: 2/3 × (3/3) = 6/9.\nVisual: Imagine a rectangular cake sliced into 3 parts. Shading 2 parts gives 2/3. Slicing each part into 3 gives 6 shaded parts out of 9 total parts. The shaded area is identical!',
        example_te: 'ఉదాహరణ: 2/3 × (3/3) = 6/9.\nచిత్రరూపం: 3 భాగాలలో 2 భాగాలు రంగు వేయబడ్డాయి. ప్రతి భాగాన్ని మళ్ళీ 3 చిన్న ముక్కలుగా విభజిస్తే మొత్తం 9 లో 6 భాగాలు అవుతాయి. మొత్తం విస్తీర్ణం మారదు!',
        visualType: 'area_model'
      },
      reassessment: {
        stem_en: 'Fresh Reassessment: Which fraction is strictly equivalent to 3/5?',
        stem_te: 'కొత్త పునఃపరిశీలన ప్రశ్న: 3/5 కు ఖచ్చితమైన సమాన భిన్నం ఏది?',
        options: [
          { text: '9/15', correct: true, label: 'A' },
          { text: '5/7', correct: false, label: 'B' },
          { text: '5/3', correct: false, label: 'C' },
          { text: '6/5', correct: false, label: 'D' }
        ],
        solution_en: 'Multiply top and bottom by 3: (3×3)/(5×3) = 9/15.'
      }
    },
    case_sign_confusion: {
      id: 'case_sign_confusion',
      concept_id: 'c4',
      topic_category: 'addition_subtraction',
      badge: 'NCERT c4 · Signed Rationals',
      title_en: 'Signed Rational Subtraction & Double Negatives',
      title_te: 'రుణ అకరణీయ సంఖ్యల తీసివేత మరియు గుర్తుల నియమాలు',
      prereq: 'Integers & Directed Numbers (c0)',
      primary: {
        stem_en: 'Evaluate: (-2/7) - (-3/7) = ?',
        stem_te: 'గణించండి: (-2/7) - (-3/7) = ?',
        options: [
          { text: '1/7', correct: true, tag: null, label: 'A', exp_en: 'Correct! -(-3/7) becomes +3/7. (-2+3)/7 = 1/7.', exp_te: 'సరైనది! -(-3/7) అనేది +3/7 అవుతుంది. (-2+3)/7 = 1/7.' },
          { text: '-5/7', correct: false, tag: 'dropped_double_negative', label: 'B', exp_en: 'Treated -(-3) as -3, leading to -2 - 3 = -5.', exp_te: 'రుణ గుర్తు నియమాన్ని విస్మరించి -2 - 3 = -5/7 గా లెక్కించారు.' },
          { text: '-1/7', correct: false, tag: 'sign_slip', label: 'C', exp_en: 'Sign slip: (-2 + 3 = -1 instead of +1).', exp_te: 'చివరి సంకలనంలో గుర్తు పొరపాటు (-2 + 3 = +1 ఉండాలి).' },
          { text: '5/7', correct: false, tag: 'ignored_all_negatives', label: 'D', exp_en: 'Dropped all negative signs entirely.', exp_te: 'అన్ని రుణ గుర్తులను విస్మరించి కూడారు.' }
        ]
      },
      followUp: {
        stem_en: 'Diagnostic Check: In integer arithmetic, what is (-2) - (-3)?',
        stem_te: 'నిర్ధారణ ప్రశ్న: (-2) - (-3) ఎంత?',
        optA: { text_en: '+1', text_te: '+1', correct: true },
        optB: { text_en: '-5', text_te: '-5', correct: false }
      },
      support: {
        hint_en: 'Double Negative Rule: a - (-b) = a + b. On the number line, taking away a negative debt means moving to the RIGHT!',
        hint_te: 'గుర్తుల నియమం: a - (-b) = a + b. సంఖ్యా రేఖపై రుణ సంఖ్యను తీసివేయడం అంటే కుడివైపుకు కదలడం!',
        example_en: '(-2/7) - (-3/7) = (-2 - (-3)) / 7 = (-2 + 3) / 7 = 1/7.',
        example_te: '(-2/7) - (-3/7) = (-2 + 3) / 7 = 1/7.',
        visualType: 'number_line'
      },
      reassessment: {
        stem_en: 'Fresh Reassessment: Evaluate: (-3/8) - (-5/8) = ?',
        stem_te: 'కొత్త పునఃపరిశీలన ప్రశ్న: (-3/8) - (-5/8) = ?',
        options: [
          { text: '2/8 (= 1/4)', correct: true, label: 'A' },
          { text: '-8/8 (= -1)', correct: false, label: 'B' },
          { text: '-2/8 (= -1/4)', correct: false, label: 'C' },
          { text: '8/8 (= 1)', correct: false, label: 'D' }
        ],
        solution_en: '(-3 - (-5))/8 = (-3 + 5)/8 = 2/8 = 1/4.'
      }
    },
    case_number_line: {
      id: 'case_number_line',
      concept_id: 'c4',
      topic_category: 'number_line',
      badge: 'NCERT c4 · Comparing Rationals',
      title_en: 'Comparing & Ordering Negative Rational Numbers',
      title_te: 'రుణ అకరణీయ సంఖ్యల పోలిక మరియు సంఖ్యా రేఖ',
      prereq: 'Directed Numbers on Number Line (c0)',
      primary: {
        stem_en: 'Which inequality statement is TRUE?',
        stem_te: 'కింది వాటిలో ఏ అసమానత నిజమైనది?',
        options: [
          { text: '-1/2 > -3/4', correct: true, tag: null, label: 'A', exp_en: 'Correct! -0.5 is closer to 0 and to the right of -0.75.', exp_te: 'సరైనది! -1/2 (-0.5) అనేది -3/4 కు కుడివైపు ఉంటుంది.' },
          { text: '-3/4 > -1/2', correct: false, tag: 'magnitude_inversion', label: 'B', exp_en: 'Since 3/4 > 1/2, assumed -3/4 > -1/2. Negative order is inverted!', exp_te: 'ధన సంఖ్యల క్రమాన్ని రుణ సంఖ్యలకు వర్తింపజేశారు.' },
          { text: '-1/2 < -1', correct: false, tag: 'distance_from_zero_error', label: 'C', exp_en: '-1/2 is halfway between 0 and -1, so it is greater than -1.', exp_te: '-1/2 అనేది -1 కంటే పెద్దది.' },
          { text: '-1/2 = -3/4', correct: false, tag: 'denominator_ignored', label: 'D', exp_en: 'Different quantities cannot be equal.', exp_te: 'హారాలను సమానం చేయకుండా సమానమని భావించారు.' }
        ]
      },
      followUp: {
        stem_en: 'Diagnostic Check: Which integer is greater: -2 or -5?',
        stem_te: 'నిర్ధారణ ప్రశ్న: ఏ పూర్ణాంకం పెద్దది: -2 లేదా -5?',
        optA: { text_en: '-2', text_te: '-2', correct: true },
        optB: { text_en: '-5', text_te: '-5', correct: false }
      },
      support: {
        hint_en: 'Right is GREATER! On a standard horizontal number line, whichever number sits further to the right is always the larger number.',
        hint_te: 'కుడివైపున ఉండేదే పెద్దది! క్షితిజ సమాంతర సంఖ్యా రేఖపై కుడివైపున ఉండే సంఖ్య ఎల్లప్పుడూ పెద్దది.',
        example_en: 'Convert to common denominator: -2/4 vs -3/4.\nNumber line: 0 ... -1/4 ... -2/4 ... -3/4 ... -1.\nSince -2/4 is to the right of -3/4, -1/2 > -3/4.',
        example_te: 'సమాన హారాలు: -2/4 మరియు -3/4.\nసంఖ్యా రేఖపై -2/4 అనేది -3/4 కు కుడివైపు ఉంటుంది, కాబట్టి -1/2 > -3/4.',
        visualType: 'number_line'
      },
      reassessment: {
        stem_en: 'Fresh Reassessment: Which statement is TRUE?',
        stem_te: 'కొత్త పునఃపరిశీలన ప్రశ్న: ఏ అసమానత నిజమైనది?',
        options: [
          { text: '-1/3 > -2/3', correct: true, label: 'A' },
          { text: '-2/3 > -1/3', correct: false, label: 'B' },
          { text: '-2/3 > 0', correct: false, label: 'C' },
          { text: '-1/3 = -2/3', correct: false, label: 'D' }
        ],
        solution_en: '-1/3 (-0.33) is to the right of -2/3 (-0.67), so -1/3 > -2/3.'
      }
    },
    case_mult_div_confusion: {
      id: 'case_mult_div_confusion',
      concept_id: 'c6',
      topic_category: 'operations',
      badge: 'NCERT c6 · Operations',
      title_en: 'Multiplication & Division of Rational Numbers',
      title_te: 'అకరణీయ సంఖ్యల గుణకారం మరియు భాగహారం',
      prereq: 'Fractions & Reciprocals (c1)',
      primary: {
        stem_en: 'Evaluate: (2/3) ÷ (3/4) = ?',
        stem_te: 'గణించండి: (2/3) ÷ (3/4) = ?',
        options: [
          { text: '8/9', correct: true, tag: null, label: 'A', exp_en: 'Correct! (2/3) × (4/3) = 8/9.', exp_te: 'సరైనది! (2/3) × (4/3) = 8/9.' },
          { text: '6/12 (= 1/2)', correct: false, tag: 'straight_across_division', label: 'B', exp_en: 'Multiplied straight across without reciprocating divisor.', exp_te: 'రెండవ భిన్నాన్ని తిరగరాయకుండా నేరుగా గుణించారు.' },
          { text: '9/8', correct: false, tag: 'inverted_dividend', label: 'C', exp_en: 'Inverted first fraction instead of divisor.', exp_te: 'మొదటి భిన్నాన్ని తిరగరాశారు.' },
          { text: '5/7', correct: false, tag: 'cross_added', label: 'D', exp_en: 'Added tops and bottoms (2+3)/(3+4).', exp_te: 'లవాలు హారాలు కూడారు.' }
        ]
      },
      followUp: {
        stem_en: 'Diagnostic Check: How do you divide by a fraction a/b?',
        stem_te: 'నిర్ధారణ ప్రశ్న: a/b భిన్నంతో ఎలా భాగించాలి?',
        optA: { text_en: 'Multiply by its reciprocal b/a', text_te: 'దాని వ్యుత్క్రమం b/a చే గుణించాలి', correct: true },
        optB: { text_en: 'Divide numerators and denominators straight across', text_te: 'లవాలు మరియు హారాలను నేరుగా భాగించాలి', correct: false }
      },
      support: {
        hint_en: 'Keep - Change - Flip! Keep the 1st fraction, Change ÷ to ×, Flip the 2nd fraction to its reciprocal.',
        hint_te: 'మొదటి భిన్నాన్ని అలాగే ఉంచండి, ÷ గుర్తును × గా మార్చండి, రెండవ భిన్నాన్ని తిరగరాయండి (వ్యుత్క్రమం)!',
        example_en: '(2/3) ÷ (3/4) = (2/3) × (4/3) = 8/9.',
        example_te: '(2/3) ÷ (3/4) = (2/3) × (4/3) = 8/9.',
        visualType: 'reciprocal'
      },
      reassessment: {
        stem_en: 'Fresh Reassessment: Evaluate: (3/5) ÷ (2/3) = ?',
        stem_te: 'కొత్త పునఃపరిశీలన ప్రశ్న: (3/5) ÷ (2/3) = ?',
        options: [
          { text: '9/10', correct: true, label: 'A' },
          { text: '6/15 (= 2/5)', correct: false, label: 'B' },
          { text: '10/9', correct: false, label: 'C' },
          { text: '5/8', correct: false, label: 'D' }
        ],
        solution_en: '(3/5) × (3/2) = 9/10.'
      }
    },
    case_simplification_cancel: {
      id: 'case_simplification_cancel',
      concept_id: 'c1',
      topic_category: 'fractions_scaling',
      badge: 'NCERT c1 · Simplification',
      title_en: 'Fraction Simplification & Factor Cancellation',
      title_te: 'భిన్నాల సూక్ష్మీకరణ మరియు సామాన్య కారణాంకాల రద్దు',
      prereq: 'Factors & Equivalent Forms (c1)',
      primary: {
        stem_en: 'Simplify the expression: (4 + 6) / 4 = ?',
        stem_te: 'సూక్ష్మీకరించండి: (4 + 6) / 4 = ?',
        options: [
          { text: '5/2 (= 2.5)', correct: true, tag: null, label: 'A', exp_en: 'Correct! (10)/4 = 5/2. Only common factors can be cancelled, never addends!', exp_te: 'సరైనది! (10)/4 = 5/2. కారణాంకాలను మాత్రమే రద్దు చేయాలి, కూడికలోని పదాలను కాదు!' },
          { text: '7', correct: false, tag: 'cancelled_additive_term', label: 'B', exp_en: 'Cancelled the 4s: 4/4 = 1, then added 6: 1 + 6 = 7. Invalid!', exp_te: '4 లను రద్దు చేసి 1 + 6 = 7 గా రాశారు. ఇది తప్పు!' },
          { text: '6', correct: false, tag: 'cancelled_and_dropped', label: 'C', exp_en: 'Crossed out 4s entirely and left 6.', exp_te: '4 లను తొలగించి కేవలం 6 మిగిల్చారు.' },
          { text: '4/10', correct: false, tag: 'inverted_fraction', label: 'D', exp_en: 'Inverted numerator and denominator.', exp_te: 'భిన్నాన్ని తిరగరాశారు.' }
        ]
      },
      followUp: {
        stem_en: 'Diagnostic Check: In (2 + 8) / 2, can you cancel the 2s to get 1 + 8 = 9?',
        stem_te: 'నిర్ధారణ ప్రశ్న: (2 + 8) / 2 లో 2 లను రద్దు చేసి 1 + 8 = 9 గా రాయవచ్చా?',
        optA: { text_en: 'No, terms connected by addition cannot be cancelled', text_te: 'లేదు, కూడికలోని పదాలను రద్దు చేయలేము', correct: true },
        optB: { text_en: 'Yes, matching numbers top and bottom always cancel', text_te: 'అవును, ఒకే సంఖ్య ఉంటే ఎప్పుడైనా రద్దు చేయవచ్చు', correct: false }
      },
      support: {
        hint_en: 'Only FACTORS cancel! You can only cancel numbers multiplied across the entire top and bottom, never terms separated by + or -.',
        hint_te: 'గుణకారం రూపంలో ఉన్న కారణాంకాలను మాత్రమే రద్దు చేయాలి. కూడిక లేదా తీసివేత గుర్తులు ఉన్నప్పుడు రద్దు చేయకూడదు!',
        example_en: '(4 + 6) / 4 = 10/4 = 5/2 = 2.5.',
        example_te: '(4 + 6) / 4 = 10/4 = 5/2 = 2.5.',
        visualType: 'distributive'
      },
      reassessment: {
        stem_en: 'Fresh Reassessment: Simplify: (6 + 9) / 3 = ?',
        stem_te: 'కొత్త పునఃపరిశీలన ప్రశ్న: (6 + 9) / 3 = ?',
        options: [
          { text: '5', correct: true, label: 'A' },
          { text: '11', correct: false, label: 'B' },
          { text: '9', correct: false, label: 'C' },
          { text: '3/15', correct: false, label: 'D' }
        ],
        solution_en: '(6 + 9) / 3 = 15/3 = 5.'
      }
    },
    case_mixed_to_improper: {
      id: 'case_mixed_to_improper',
      concept_id: 'c3',
      topic_category: 'fractions_scaling',
      badge: 'NCERT c3 · Rational Meaning',
      title_en: 'Mixed Numbers to Improper Rational Numbers',
      title_te: 'మిశ్రమ భిన్నాలను అపక్రమ భిన్నాలుగా మార్చడం',
      prereq: 'Rational Meaning p/q (c1)',
      primary: {
        stem_en: 'Convert the mixed rational number -2 3/4 to improper form p/q:',
        stem_te: '-2 3/4 మిశ్రమ భిన్నాన్ని p/q రూపంలో రాయండి:',
        options: [
          { text: '-11/4', correct: true, tag: null, label: 'A', exp_en: 'Correct! -((2×4 + 3)/4) = -11/4.', exp_te: 'సరైనది! -((2×4 + 3)/4) = -11/4.' },
          { text: '-6/4', correct: false, tag: 'multiplied_whole_by_num', label: 'B', exp_en: 'Multiplied whole by numerator: -(2×3)/4 = -6/4.', exp_te: 'పూర్ణాంకాన్ని లవంతో గుణించారు: -(2×3)/4.' },
          { text: '11/4', correct: false, tag: 'dropped_negative_sign', label: 'C', exp_en: 'Dropped overall negative sign.', exp_te: 'రుణ గుర్తును విస్మరించారు.' },
          { text: '-5/4', correct: false, tag: 'added_whole_to_num', label: 'D', exp_en: 'Added whole to numerator without scaling: -(2+3)/4.', exp_te: 'హారంతో గుణించకుండా నేరుగా కూడారు.' }
        ]
      },
      followUp: {
        stem_en: 'Diagnostic Check: How many half-slices are in 2 1/2 pizzas?',
        stem_te: 'నిర్ధారణ ప్రశ్న: 2 1/2 పిజ్జాలలో ఎన్ని సగభాగాల ముక్కలు ఉంటాయి?',
        optA: { text_en: '5 halves', text_te: '5 సగభాగాల ముక్కలు', correct: true },
        optB: { text_en: '2 halves', text_te: '2 సగభాగాల ముక్కలు', correct: false }
      },
      support: {
        hint_en: 'Conversion Formula: For -A B/C, calculate -((A × C + B) / C). Each whole pizza contains C slices!',
        hint_te: '-A B/C ను మార్చడానికి: -((A × C + B) / C). ప్రతి పూర్తి భాగంలో C భాగాలు ఉంటాయి!',
        example_en: '-2 3/4: 2 whole pizzas = 2 × 4 = 8 fourths. Add 3 fourths = 11 fourths. Total = -11/4.',
        example_te: '-2 3/4: 2 పూర్తి భాగాలు = 8 నాల్గవ వంతులు. మరో 3 భాగాలు కూడితే 11. మొత్తం = -11/4.',
        visualType: 'pizza_slices'
      },
      reassessment: {
        stem_en: 'Fresh Reassessment: Convert -3 2/5 to an improper rational form p/q:',
        stem_te: 'కొత్త పునఃపరిశీలన ప్రశ్న: -3 2/5 ను p/q రూపంలో రాయండి:',
        options: [
          { text: '-17/5', correct: true, label: 'A' },
          { text: '-6/5', correct: false, label: 'B' },
          { text: '17/5', correct: false, label: 'C' },
          { text: '-5/5 (= -1)', correct: false, label: 'D' }
        ],
        solution_en: '-(3 × 5 + 2)/5 = -17/5.'
      }
    }
  };

  const currentCase = cases[activeCaseKey] || cases.case_rational_add;

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
  const handleVoiceInput = (optionsList, onSelect) => {
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
        setVoiceNotice(lang === 'te' ? 'వింటున్నాము... ఎంపికను చెప్పండి (ఉదా: A లేదా B)' : 'Listening... Say option (e.g. "A" or "B")');
      };

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript.trim().toLowerCase();
        setVoiceNotice(`Heard: "${transcript}"`);
        setIsListening(false);

        let matchedIndex = -1;
        if (transcript.includes('a') || transcript.includes('one') || transcript.includes('1') || transcript.includes('మొదటి')) {
          matchedIndex = 0;
        } else if (transcript.includes('b') || transcript.includes('two') || transcript.includes('2') || transcript.includes('రెండవ')) {
          matchedIndex = 1;
        } else if (transcript.includes('c') || transcript.includes('three') || transcript.includes('3') || transcript.includes('మూడవ')) {
          matchedIndex = 2;
        } else if (transcript.includes('d') || transcript.includes('four') || transcript.includes('4') || transcript.includes('నాల్గవ')) {
          matchedIndex = 3;
        }

        if (matchedIndex !== -1 && optionsList[matchedIndex]) {
          onSelect(optionsList[matchedIndex], matchedIndex);
        } else {
          setVoiceNotice(`Could not match "${transcript}". Please tap an option directly.`);
        }
      };

      recognition.onerror = () => {
        setIsListening(false);
        setVoiceNotice('Voice error or timeout. Please tap your answer.');
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.start();
    } catch (e) {
      setIsListening(false);
      console.warn('Speech recognition error:', e);
    }
  };

  const startCase = async () => {
    setAiExplanation(null);
    setVoiceNotice('');
    try {
      await api.startDetective(currentCase.id);
    } catch (err) {
      console.warn('Backend startDetective notice:', err);
    }

    setSession({
      step: 'solve', // solve, confirm, retry_slip, support, reassess, done, persistent
      tag: null,
      hypothesis: null,
      evidenceStrength: 'None',
      evidenceRationale: '',
      msg: ''
    });
  };

  const handlePickPrimary = async (opt, optionIndex) => {
    setVoiceNotice('');
    if (opt.correct) {
      try {
        await api.submitPrimary(optionIndex);
      } catch (err) {
        console.warn('Backend submitPrimary error:', err);
      }

      setSession({
        step: 'done',
        msg: lang === 'te' ? 'అద్భుతం! భావన సంపూర్ణంగా స్పష్టమైంది.' : 'Outstanding! The concept is secure. Your topic mastery has been upgraded.',
        evidenceStrength: 'Mastered'
      });
      onCompleteCase(currentCase.concept_id, true);
    } else {
      setSession({
        step: 'confirm',
        tag: opt.tag,
        hypothesis: `Suspected pattern: '${opt.tag}'. Diagnoses are treated as scientific hypotheses requiring experimental confirmation.`,
        evidenceStrength: 'Initial Signal (Single Observation)'
      });
      onCompleteCase(currentCase.concept_id, false);

      // Async backend record sync
      try {
        await api.submitPrimary(optionIndex);
      } catch (err) {
        console.warn('Backend submitPrimary error:', err);
      }

      // Fetch personalized AI tutor explanation
      setAiLoading(true);
      try {
        const aiResp = await api.getAIExplanation({
          concept_id: currentCase.concept_id,
          question_text: lang === 'te' ? currentCase.primary.stem_te : currentCase.primary.stem_en,
          student_answer: opt.text,
          suspected_misconception: opt.tag || 'unknown',
          language: lang === 'te' ? 'te' : 'en'
        });
        setAiExplanation(aiResp);
      } catch (err) {
        console.warn('AI explanation fetch error:', err);
      } finally {
        setAiLoading(false);
      }
    }
  };

  const handleFollowup = async (isCorrect) => {
    setVoiceNotice('');
    try {
      await api.submitFollowup(isCorrect);
    } catch (err) {
      console.warn('Backend submitFollowup error:', err);
    }

    if (isCorrect) {
      setSession((prev) => ({
        ...prev,
        step: 'retry_slip',
        evidenceStrength: 'Refuted (Careless Slip)',
        evidenceRationale: 'Follow-up answered correctly! Student understands foundational logic; initial error was an isolated calculation slip.'
      }));
    } else {
      setSession((prev) => ({
        ...prev,
        step: 'support',
        evidenceStrength: 'High (Confirmed Misconception)',
        evidenceRationale: 'Follow-up confirmed an identical misconception pattern. Activating multi-modal visual scaffolding.'
      }));
    }
  };

  const handleReassessment = async (opt, optionIndex) => {
    setVoiceNotice('');
    const isCorrect = opt.correct;
    try {
      await api.submitReassessment(optionIndex);
    } catch (err) {
      console.warn('Backend submitReassessment error:', err);
    }

    if (isCorrect) {
      setSession((prev) => ({
        ...prev,
        step: 'done',
        msg: lang === 'te' ? 'విజయవంతంగా సరిదిద్దబడింది! పునఃపరిశీలన ప్రశ్న ఉత్తీర్ణులయ్యారు.' : 'Recovery verified! Fresh reassessment passed with brand new numbers.',
        evidenceStrength: 'Resolved (Recovery Verified)'
      }));
      onCompleteCase(currentCase.concept_id, true, true);
    } else {
      setSession((prev) => ({
        ...prev,
        step: 'persistent',
        evidenceStrength: 'Persistent Difficulty'
      }));
      onCompleteCase(currentCase.concept_id, false, true);
      onRaiseActionCard({
        id: Date.now(),
        student: 'Aarav Sharma (Class 8)',
        concept: currentCase.title_en,
        obs: `Learner exhibited '${session.tag}', confirmed in diagnostic follow-up, and failed fresh reassessment.`,
        rule: 'Reassessment failed after targeted intervention',
        act: `Provide 1-on-1 tactile number-line support on Prerequisite: ${currentCase.prereq}.`,
        reassess: 'failed',
        st: 'pending',
        sample: false
      });
    }
  };

  // Case Selector Screen (if no session active)
  if (!session) {
    return (
      <div className="card" style={{ maxWidth: '960px', margin: '30px auto', padding: '32px' }}>
        <div className="row spaced" style={{ marginBottom: '16px' }}>
          <div>
            <div className="row" style={{ gap: '8px' }}>
              <span className="badge-tag">7-STAGE LEARNING DETECTIVE</span>
              <span className="tag purple">NCERT CLASS 8 RATIONAL NUMBERS</span>
            </div>
            <h2 style={{ fontSize: '2rem', margin: '8px 0 2px' }}>
              {lang === 'te' ? 'అడాప్టివ్ లెర్నింగ్ డిటెక్టివ్' : 'Adaptive Misconception Detective'}
            </h2>
          </div>
          <span style={{ fontSize: '2.4rem' }}>🔍</span>
        </div>

        <p className="mu" style={{ fontSize: '1.02rem', lineHeight: 1.6 }}>
          <b>Core Thesis:</b> A wrong answer is <i>evidence, not proof</i>. Select an NCERT Class 8 rational number investigation case to discover why a student answers differently, formulate hypotheses, test with diagnostic checks, scaffold with visual models, and verify recovery.
        </p>

        {/* Topic Filter & Selection */}
        <div style={{ margin: '22px 0 14px' }}>
          <div className="row spaced" style={{ marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
            <b style={{ color: '#00f2fe', fontSize: '0.88rem', letterSpacing: '0.5px' }}>
              {lang === 'te' ? 'అధ్యాయం / టాపిక్‌ను ఎంచుకోండి:' : 'CHOOSE TOPIC TO INVESTIGATE:'}
            </b>
            <div className="row" style={{ gap: '6px', flexWrap: 'wrap' }}>
              {[
                { id: 'all', label_en: 'All Topics (7)', label_te: 'అన్ని టాపిక్‌లు (7)' },
                { id: 'addition_subtraction', label_en: 'Addition & Subtraction', label_te: 'సంకలనం & వ్యవకలనం' },
                { id: 'fractions_scaling', label_en: 'Equivalent Fractions', label_te: 'సమాన భిన్నాలు' },
                { id: 'number_line', label_en: 'Number Line & Ordering', label_te: 'సంఖ్యా రేఖ & పోలిక' },
                { id: 'operations', label_en: 'Multiplication & Division', label_te: 'గుణకారం & భాగహారం' }
              ].map((tf) => (
                <button
                  key={tf.id}
                  className={selectedTopicFilter === tf.id ? 'pri' : 'sec'}
                  onClick={() => {
                    setSelectedTopicFilter(tf.id);
                    const matching = Object.values(cases).filter(c => tf.id === 'all' || c.topic_category === tf.id);
                    if (matching.length > 0 && !matching.some(c => c.id === activeCaseKey)) {
                      setActiveCaseKey(matching[0].id);
                    }
                  }}
                  style={{ fontSize: '0.78rem', padding: '5px 11px', borderRadius: '8px' }}
                >
                  {lang === 'te' ? tf.label_te : tf.label_en}
                </button>
              ))}
            </div>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: '12px',
              marginTop: '12px'
            }}
          >
            {Object.values(cases)
              .filter((c) => selectedTopicFilter === 'all' || c.topic_category === selectedTopicFilter)
              .map((c) => {
              const isSelected = activeCaseKey === c.id;
              return (
                <div
                  key={c.id}
                  onClick={() => setActiveCaseKey(c.id)}
                  style={{
                    padding: '14px 16px',
                    borderRadius: '14px',
                    background: isSelected ? 'rgba(0, 242, 254, 0.12)' : 'rgba(255, 255, 255, 0.02)',
                    border: `1.5px solid ${isSelected ? '#00f2fe' : 'rgba(255, 255, 255, 0.08)'}`,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    boxShadow: isSelected ? '0 0 16px rgba(0, 242, 254, 0.2)' : 'none'
                  }}
                >
                  <div className="row spaced" style={{ marginBottom: 4 }}>
                    <span className="tag" style={{ fontSize: '0.72rem' }}>{c.badge}</span>
                    {isSelected && <span className="tag good" style={{ fontSize: '0.7rem' }}>SELECTED</span>}
                  </div>
                  <h4 style={{ margin: '6px 0 2px', fontSize: '0.96rem', color: isSelected ? '#00f2fe' : '#ffffff' }}>
                    {lang === 'te' ? c.title_te : c.title_en}
                  </h4>
                  <div className="mu" style={{ fontSize: '0.78rem' }}>
                    Prereq: {c.prereq}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Active Case Summary Preview Box */}
        <div
          style={{
            background: 'rgba(7, 8, 10, 0.85)',
            border: '1px solid rgba(0, 242, 254, 0.25)',
            borderRadius: '16px',
            padding: '20px',
            marginBottom: '24px'
          }}
        >
          <div className="row spaced">
            <div>
              <span className="tag purple">SELECTED INVESTIGATION</span>
              <h3 style={{ margin: '6px 0 2px', color: '#ffffff' }}>
                {lang === 'te' ? currentCase.title_te : currentCase.title_en}
              </h3>
              <div style={{ color: 'var(--mu)', fontSize: '0.86rem' }}>
                Diagnostic question: <b>{lang === 'te' ? currentCase.primary.stem_te : currentCase.primary.stem_en}</b>
              </div>
            </div>
            <button className="pri" style={{ fontSize: '1.05rem', padding: '12px 28px' }} onClick={startCase}>
              🚀 Begin Case Investigation
            </button>
          </div>
        </div>

        <div className="row spaced">
          <span className="mu" style={{ fontSize: '0.82rem' }}>
            Full bilingual NCERT Class 8 coverage with multi-modal visual scaffolding.
          </span>
          <button className="sec" onClick={onReturnToDashboard}>
            ← Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // Active Session Investigation Screen
  return (
    <div className="card" style={{ maxWidth: '960px', margin: '20px auto', padding: '30px' }}>
      <div className="row spaced" style={{ marginBottom: 12 }}>
        <div>
          <span className="tag">{currentCase.badge} · Prereq: {currentCase.prereq}</span>
          <h2 style={{ fontSize: '1.65rem', margin: '6px 0 2px' }}>
            {lang === 'te' ? currentCase.title_te : currentCase.title_en}
          </h2>
        </div>
        <button className="sec" onClick={() => setSession(null)}>
          ↺ Switch Case
        </button>
      </div>

      {/* 7-Stage Workflow Step Timeline Tracker */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          padding: '10px 14px',
          background: 'rgba(7, 8, 10, 0.85)',
          borderRadius: '14px',
          border: '1px solid rgba(0, 242, 254, 0.2)',
          margin: '14px 0 22px',
          overflowX: 'auto'
        }}
      >
        {[
          { key: 'learn', num: 1, label: 'Learn' },
          { key: 'solve', num: 2, label: 'Solve' },
          { key: 'detect', num: 3, label: 'Detect' },
          { key: 'confirm', num: 4, label: 'Confirm' },
          { key: 'support', num: 5, label: 'Support' },
          { key: 'reassess', num: 6, label: 'Reassess' },
          { key: 'done', num: 7, label: 'Update' }
        ].map((st) => {
          let isCurrent = false;
          let isDone = false;
          if (session.step === 'solve' && st.num <= 2) isCurrent = true;
          else if (session.step === 'confirm' && st.num === 4) isCurrent = true;
          else if ((session.step === 'support' || session.step === 'retry_slip') && st.num === 5) isCurrent = true;
          else if (session.step === 'reassess' && st.num === 6) isCurrent = true;
          else if ((session.step === 'done' || session.step === 'persistent') && st.num === 7) isDone = true;

          return (
            <div
              key={st.key}
              style={{
                flex: 1,
                textAlign: 'center',
                padding: '6px 10px',
                borderRadius: '10px',
                background: isCurrent
                  ? 'linear-gradient(135deg, #00f2fe 0%, #38bdf8 100%)'
                  : isDone
                  ? 'rgba(16, 185, 129, 0.2)'
                  : 'rgba(255, 255, 255, 0.03)',
                color: isCurrent ? '#07080a' : isDone ? '#34d399' : '#64748b',
                fontWeight: isCurrent || isDone ? 800 : 500,
                fontSize: '0.8rem',
                whiteSpace: 'nowrap'
              }}
            >
              {st.num}. {st.label}
            </div>
          );
        })}
      </div>

      {/* AI Companion Dialogue & Status Bar */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'auto 1fr',
          gap: '20px',
          alignItems: 'center',
          background: 'rgba(16, 17, 22, 0.75)',
          border: '1px solid rgba(0, 242, 254, 0.25)',
          borderRadius: '18px',
          padding: '16px 20px',
          marginBottom: '24px'
        }}
      >
        <div className="ai-orb-container" style={{ width: 60, height: 60 }}>
          <div className="ai-ring" style={{ width: 56, height: 56 }} />
          <div className="ai-orb" style={{ width: 44, height: 44 }}>
            <div className="ai-face">
              <div className="ai-eyes">
                <div className="ai-eye" />
                <div className="ai-eye" />
              </div>
            </div>
          </div>
        </div>

        <div>
          <div className="row spaced">
            <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#00f2fe' }}>
              ✦ COMPANION OBSERVATION STATUS
            </span>
            <span className="tag purple">Evidence: {session.evidenceStrength}</span>
          </div>
          <div style={{ fontSize: '0.92rem', color: '#cbd5e1', marginTop: 4 }}>
            {session.step === 'solve' && 'Carefully solve the problem below. Choose the option matching your calculation.'}
            {session.step === 'confirm' && session.hypothesis}
            {session.step === 'retry_slip' && session.evidenceRationale}
            {session.step === 'support' && session.evidenceRationale}
            {session.step === 'reassess' && 'Now let us test your understanding on a brand-new problem with fresh numbers.'}
            {session.step === 'done' && session.msg}
            {session.step === 'persistent' && 'Persistent difficulty detected. A pedagogical Action Card has been sent to your teacher.'}
          </div>
        </div>
      </div>

      {/* STAGE 1: PRIMARY ASSESSMENT QUESTION */}
      {session.step === 'solve' && (
        <div className="card" style={{ border: '1px solid rgba(0, 242, 254, 0.3)' }}>
          <div className="row spaced">
            <span className="badge-tag">STAGE 2: INITIAL SOLVE</span>
            <div className="row" style={{ gap: '8px' }}>
              <button
                type="button"
                className="sec"
                onClick={() => handleReadAloud(lang === 'te' ? currentCase.primary.stem_te : currentCase.primary.stem_en)}
                style={{ padding: '4px 10px', fontSize: '0.78rem' }}
              >
                {isSpeaking ? '⏹ Stop' : (lang === 'te' ? '🔊 చదవండి' : '🔊 Read Aloud')}
              </button>
              <button
                type="button"
                className="sec"
                onClick={() => handleVoiceInput(currentCase.primary.options, handlePickPrimary)}
                style={{ padding: '4px 10px', fontSize: '0.78rem', border: isListening ? '1px solid #00f2fe' : undefined }}
              >
                {isListening ? '🎙️ Listening...' : (lang === 'te' ? '🎙️ వాయిస్ సమాధానం' : '🎙️ Voice Answer')}
              </button>
            </div>
          </div>

          <h3 style={{ fontSize: '1.4rem', margin: '12px 0 16px', color: '#ffffff' }}>
            {lang === 'te' ? currentCase.primary.stem_te : currentCase.primary.stem_en}
          </h3>

          {voiceNotice && (
            <div style={{ padding: '8px 12px', background: 'rgba(0, 242, 254, 0.1)', borderRadius: '8px', marginBottom: '12px', fontSize: '0.85rem', color: '#00f2fe' }}>
              🎙️ {voiceNotice}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', margin: '16px 0' }}>
            {currentCase.primary.options.map((opt, i) => (
              <button
                key={i}
                className="opt"
                onClick={() => handlePickPrimary(opt, i)}
                style={{ padding: '14px 18px', textAlign: 'left' }}
              >
                <b style={{ color: '#00f2fe', marginRight: 8 }}>{opt.label}.</b>
                <span style={{ fontSize: '1.1rem', fontWeight: 700 }}>{opt.text}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* STAGE 2: DIAGNOSTIC FOLLOW-UP QUESTION */}
      {session.step === 'confirm' && (
        <div className="card" style={{ border: '1px solid rgba(168, 85, 247, 0.35)' }}>
          <div className="row spaced">
            <span className="badge-tag">STAGE 4: DIAGNOSTIC HYPOTHESIS TEST</span>
            <div className="row" style={{ gap: '8px' }}>
              <button
                type="button"
                className="sec"
                onClick={() => handleReadAloud(lang === 'te' ? currentCase.followUp.stem_te : currentCase.followUp.stem_en)}
                style={{ padding: '4px 10px', fontSize: '0.78rem' }}
              >
                {isSpeaking ? '⏹ Stop' : (lang === 'te' ? '🔊 చదవండి' : '🔊 Read Aloud')}
              </button>
            </div>
          </div>

          <h3 style={{ fontSize: '1.3rem', margin: '12px 0 16px', color: '#f8fafc' }}>
            {lang === 'te' ? currentCase.followUp.stem_te : currentCase.followUp.stem_en}
          </h3>
          <p className="mu" style={{ fontSize: '0.88rem' }}>
            {lang === 'te'
              ? 'ఈ తనిఖీ మీ మునుపటి సమాధానం కేవలం చిన్న గణన పొరపాటా లేక భావనా లోపమా అని ధృవీకరిస్తుంది.'
              : 'This quick check helps me verify if your previous response was an isolated calculation slip or a conceptual habit.'}
          </p>

          {/* AI Pedagogical Tutor Insight Card */}
          {aiLoading && (
            <div style={{ padding: '12px 16px', background: 'rgba(0, 242, 254, 0.05)', borderRadius: '12px', border: '1px dashed rgba(0, 242, 254, 0.3)', margin: '14px 0' }}>
              <span className="mu" style={{ fontSize: '0.85rem' }}>✨ AI Pedagogical Engine analyzing mistake pattern...</span>
            </div>
          )}
          {aiExplanation && !aiLoading && (
            <div style={{ padding: '14px 18px', background: 'rgba(168, 85, 247, 0.1)', borderRadius: '12px', border: '1px solid rgba(168, 85, 247, 0.4)', margin: '14px 0' }}>
              <div className="row spaced" style={{ marginBottom: 6 }}>
                <span style={{ fontSize: '0.84rem', fontWeight: 800, color: '#c084fc' }}>
                  {aiExplanation.source === 'gemini' ? '✨ Gemini AI Tutor Insight' : '📘 NCERT Pedagogical Engine'}
                </span>
                <span className="tag" style={{ fontSize: '0.72rem' }}>
                  {aiExplanation.misconception_tag} · {aiExplanation.latency_ms}ms
                </span>
              </div>
              <p style={{ margin: 0, fontSize: '0.92rem', color: '#f1f5f9', lineHeight: 1.55 }}>
                {aiExplanation.explanation}
              </p>
            </div>
          )}

          {voiceNotice && (
            <div style={{ padding: '8px 12px', background: 'rgba(0, 242, 254, 0.1)', borderRadius: '8px', marginBottom: '12px', fontSize: '0.85rem', color: '#00f2fe' }}>
              🎙️ {voiceNotice}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', margin: '16px 0' }}>
            <button
              className="opt"
              onClick={() => handleFollowup(currentCase.followUp.optA.correct)}
              style={{ padding: '14px 18px' }}
            >
              <b>A.</b> {lang === 'te' ? currentCase.followUp.optA.text_te : currentCase.followUp.optA.text_en}
            </button>
            <button
              className="opt"
              onClick={() => handleFollowup(currentCase.followUp.optB.correct)}
              style={{ padding: '14px 18px' }}
            >
              <b>B.</b> {lang === 'te' ? currentCase.followUp.optB.text_te : currentCase.followUp.optB.text_en}
            </button>
          </div>
        </div>
      )}

      {/* STAGE 3A: CARELESS SLIP RETRY */}
      {session.step === 'retry_slip' && (
        <div className="card" style={{ border: '1px solid rgba(16, 185, 129, 0.4)' }}>
          <span className="tag good">RECOVERY: CARELESS SLIP DETECTED</span>
          <h3 style={{ margin: '12px 0 6px', color: '#34d399' }}>Great news! Your foundational reasoning is sound.</h3>
          <p className="mu" style={{ fontSize: '0.92rem' }}>
            Your correct answer on the follow-up proves you understand the concept. Try the original problem again carefully!
          </p>
          <button className="pri" onClick={startCase} style={{ marginTop: 12 }}>
            ↺ Retry Original Problem
          </button>
        </div>
      )}

      {/* STAGE 3B: MULTI-MODAL TARGETED SCAFFOLDING */}
      {session.step === 'support' && (
        <div className="card" style={{ border: '1px solid rgba(251, 146, 60, 0.4)' }}>
          <div className="row spaced">
            <span className="badge-tag">STAGE 5: TARGETED CONCEPTUAL SCAFFOLDING</span>
            <button
              type="button"
              className="sec"
              onClick={() => handleReadAloud(`${lang === 'te' ? currentCase.support.hint_te : currentCase.support.hint_en}. ${lang === 'te' ? currentCase.support.example_te : currentCase.support.example_en}`)}
              style={{ padding: '4px 10px', fontSize: '0.78rem' }}
            >
              {isSpeaking ? '⏹ Stop' : (lang === 'te' ? '🔊 చదవండి' : '🔊 Read Aloud')}
            </button>
          </div>
          <h3 style={{ margin: '12px 0 8px', color: '#fb923c' }}>
            {lang === 'te' ? 'భావనా వివరణ మరియు స్పర్శ నమూనా' : 'Conceptual Clarification & Visual Model'}
          </h3>

          <div
            style={{
              background: 'rgba(251, 146, 60, 0.08)',
              border: '1px solid rgba(251, 146, 60, 0.25)',
              borderRadius: '12px',
              padding: '14px 18px',
              margin: '12px 0',
              lineHeight: 1.55
            }}
          >
            <b style={{ color: '#fb923c' }}>💡 Progressive Hint:</b>
            <div style={{ color: '#f8fafc', marginTop: 4 }}>
              {lang === 'te' ? currentCase.support.hint_te : currentCase.support.hint_en}
            </div>
          </div>

          <div
            style={{
              background: 'rgba(7, 8, 10, 0.8)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '12px',
              padding: '16px 20px',
              margin: '14px 0',
              lineHeight: 1.6
            }}
          >
            <b style={{ color: '#00f2fe' }}>🔬 Visual Worked Demonstration:</b>
            <VisualDemonstration type={currentCase.support.visualType} lang={lang} />
            <pre
              style={{
                background: 'transparent',
                border: 'none',
                color: '#e2e8f0',
                padding: '8px 0 0',
                margin: 0,
                fontSize: '0.9rem',
                whiteSpace: 'pre-wrap',
                fontFamily: 'inherit'
              }}
            >
              {lang === 'te' ? currentCase.support.example_te : currentCase.support.example_en}
            </pre>
          </div>

          <button
            className="pri"
            onClick={() => setSession((prev) => ({ ...prev, step: 'reassess' }))}
            style={{ padding: '12px 24px', fontSize: '0.98rem' }}
          >
            Proceed to Fresh Reassessment →
          </button>
        </div>
      )}

      {/* STAGE 4: FRESH REASSESSMENT WITH NEW NUMBERS */}
      {session.step === 'reassess' && (
        <div className="card" style={{ border: '1px solid rgba(0, 242, 254, 0.35)' }}>
          <div className="row spaced">
            <span className="badge-tag">STAGE 6: FRESH REASSESSMENT (NEW NUMBERS)</span>
            <div className="row" style={{ gap: '8px' }}>
              <button
                type="button"
                className="sec"
                onClick={() => handleReadAloud(lang === 'te' ? currentCase.reassessment.stem_te : currentCase.reassessment.stem_en)}
                style={{ padding: '4px 10px', fontSize: '0.78rem' }}
              >
                {isSpeaking ? '⏹ Stop' : (lang === 'te' ? '🔊 చదవండి' : '🔊 Read Aloud')}
              </button>
              <button
                type="button"
                className="sec"
                onClick={() => handleVoiceInput(currentCase.reassessment.options, handleReassessment)}
                style={{ padding: '4px 10px', fontSize: '0.78rem', border: isListening ? '1px solid #00f2fe' : undefined }}
              >
                {isListening ? '🎙️ Listening...' : (lang === 'te' ? '🎙️ వాయిస్ సమాధానం' : '🎙️ Voice Answer')}
              </button>
            </div>
          </div>

          <h3 style={{ fontSize: '1.35rem', margin: '12px 0 16px', color: '#ffffff' }}>
            {lang === 'te' ? currentCase.reassessment.stem_te : currentCase.reassessment.stem_en}
          </h3>

          {voiceNotice && (
            <div style={{ padding: '8px 12px', background: 'rgba(0, 242, 254, 0.1)', borderRadius: '8px', marginBottom: '12px', fontSize: '0.85rem', color: '#00f2fe' }}>
              🎙️ {voiceNotice}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', margin: '16px 0' }}>
            {currentCase.reassessment.options.map((opt, i) => (
              <button
                key={i}
                className="opt"
                onClick={() => handleReassessment(opt, i)}
                style={{ padding: '14px 18px', textAlign: 'left' }}
              >
                <b style={{ color: '#00f2fe', marginRight: 8 }}>{opt.label}.</b>
                <span style={{ fontSize: '1.1rem', fontWeight: 700 }}>{opt.text}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* STAGE 5A: SUCCESS CELEBRATION */}
      {session.step === 'done' && (
        <div className="card" style={{ border: '1px solid rgba(16, 185, 129, 0.5)', textAlign: 'center', padding: '36px' }}>
          <span style={{ fontSize: '3rem' }}>🎉</span>
          <h2 style={{ color: '#34d399', margin: '14px 0 6px' }}>
            {lang === 'te' ? 'భావన విజయవంతంగా నేర్చుకోబడింది!' : 'Case Resolved & Mastery Upgraded!'}
          </h2>
          <p className="mu" style={{ maxWidth: '520px', margin: '0 auto 24px', fontSize: '1rem' }}>
            {session.msg}
          </p>
          <div className="row" style={{ justifyContent: 'center', gap: '12px' }}>
            <button className="pri" onClick={() => setSession(null)}>
              Explore Another Misconception Case
            </button>
            <button className="sec" onClick={onReturnToDashboard}>
              Return to Student Command
            </button>
          </div>
        </div>
      )}

      {/* STAGE 5B: PERSISTENT DIFFICULTY ESCALATION */}
      {session.step === 'persistent' && (
        <div className="card" style={{ border: '1px solid rgba(244, 63, 94, 0.5)', padding: '28px' }}>
          <span className="tag danger">STAGE 7: ESCALATED TO TEACHER</span>
          <h3 style={{ color: '#fb7185', margin: '12px 0 6px' }}>
            Teacher Action Card Generated
          </h3>
          <p className="mu" style={{ fontSize: '0.92rem', lineHeight: 1.55 }}>
            Because the fresh reassessment was not passed after targeted scaffolding, UDAAN has flagged this concept for your instructor. An explainable recommendation card with prerequisite review steps has been added to the Teacher Command Center.
          </p>
          <div className="row" style={{ marginTop: 16, gap: '12px' }}>
            <button className="pri" onClick={() => setSession(null)}>
              Select Prerequisite Topic
            </button>
            <button className="sec" onClick={onReturnToDashboard}>
              Return to Dashboard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
