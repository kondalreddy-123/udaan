import React, { useState } from 'react';

export default function ModelComparison({ cfg, bktUpdate }) {
  const [testAnswer, setTestAnswer] = useState(null);
  const [interactiveP, setInteractiveP] = useState(cfg.p0 || 0.30);
  const [traceHistory, setTraceHistory] = useState([]);

  const syntheticCases = [
    {
      id: 1,
      seq: '✓✓✗✓✓',
      label: 1,
      expDiff: 3,
      note: 'Strong start, isolated slip in middle; fast recovery.'
    },
    {
      id: 2,
      seq: '✗✗✓✗✗',
      label: 0,
      expDiff: 1,
      note: 'Single isolated success; likely lucky guess.'
    },
    {
      id: 3,
      seq: '✗✓✓✓✓',
      label: 1,
      expDiff: 3,
      note: 'Initial error resolved; firm consecutive streak.'
    },
    {
      id: 4,
      seq: '✓✗✗✗✓',
      label: 0,
      expDiff: 1,
      note: 'Early fluke correct, persistent struggle dominates history.'
    },
    {
      id: 5,
      seq: '✗✗✗✓✓',
      label: 1,
      expDiff: 2,
      note: 'Rule advances on 2-streak; BKT remains cautious because of history.'
    },
    {
      id: 6,
      seq: '✓✓✓✗✗',
      label: 0,
      expDiff: 1,
      note: 'Began confident; difficulty scaling revealed unaddressed gap.'
    },
    {
      id: 7,
      seq: '✗✗✓✓✗',
      label: 0,
      expDiff: 1,
      note: 'Unstable oscillation; lacking conceptual stability.'
    },
    {
      id: 8,
      seq: '✓✗✓✓✓',
      label: 1,
      expDiff: 3,
      note: 'Minor early slip followed by sustained competence.'
    }
  ];

  let ruleAcc = 0;
  let bktAcc = 0;
  let agreeMasteryCount = 0;
  let agreeDiffCount = 0;

  const rows = syntheticCases.map((c) => {
    let sc = 0;
    let sw = 0;
    let p = cfg.p0;
    let ruleLvl = 2;

    for (const ch of c.seq) {
      if (ch === '✓') {
        sc++;
        sw = 0;
        if (sc >= cfg.up) ruleLvl = Math.min(3, ruleLvl + 1);
        p = bktUpdate(p, true);
      } else {
        sw++;
        sc = 0;
        if (sw >= cfg.down) ruleLvl = Math.max(1, ruleLvl - 1);
        p = bktUpdate(p, false);
      }
    }

    const rPred = sc >= cfg.up ? 1 : 0;
    const bPred = p >= 0.85 ? 1 : 0;
    const bktDiffRec = p < 0.40 ? 1 : p < 0.85 ? 2 : 3;

    const rMatch = rPred === c.label;
    const bMatch = bPred === c.label;
    const agreeMastery = rPred === bPred;
    const agreeDiff = ruleLvl === bktDiffRec;

    if (rMatch) ruleAcc++;
    if (bMatch) bktAcc++;
    if (agreeMastery) agreeMasteryCount++;
    if (agreeDiff) agreeDiffCount++;

    return {
      id: c.id,
      seq: c.seq,
      label: c.label,
      rPred,
      bPred,
      p: Math.round(p * 100),
      ruleLvl,
      bktDiffRec,
      rMatch,
      bMatch,
      agreeMastery,
      agreeDiff,
      note: c.note
    };
  });

  const handleSimulateStep = (isCorrect) => {
    const prev = interactiveP;
    const updated = bktUpdate(prev, isCorrect);
    setInteractiveP(updated);
    setTraceHistory((prevHist) => [
      {
        step: prevHist.length + 1,
        isCorrect,
        prevP: Math.round(prev * 100),
        newP: Math.round(updated * 100),
        delta: Math.round((updated - prev) * 100)
      },
      ...prevHist.slice(0, 7)
    ]);
  };

  const handleResetSimulator = () => {
    setInteractiveP(cfg.p0 || 0.30);
    setTraceHistory([]);
  };

  const exportCSV = () => {
    let csv = 'Case ID,Sequence,Teacher Label,Rule Pred,Rule Level,BKT Pred,BKT Level,BKT Pct,Mastery Agree,Diff Agree,Notes\n';
    rows.forEach((r) => {
      csv += `SYN-${r.id},"${r.seq}","${r.label ? 'Mastered' : 'Not Mastered'}","${
        r.rPred ? 'Mastered' : 'Not Mastered'
      }",Level ${r.ruleLvl},"${r.bPred ? 'Mastered' : 'Not Mastered'}",Level ${r.bktDiffRec},${r.p}%,"${
        r.agreeMastery ? 'YES' : 'NO'
      }","${r.agreeDiff ? 'YES' : 'NO'}","${r.note}"\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'udaan_bkt_vs_rules_evaluation.csv';
    a.click();
  };

  return (
    <div>
      {/* SECTION 1: BKT MODEL TRANSPARENCY (Judge Recommendation 3) */}
      <div className="card" style={{ border: '1px solid rgba(0, 242, 254, 0.3)' }}>
        <div className="row spaced">
          <div>
            <div className="row" style={{ gap: '8px' }}>
              <span className="badge-tag">BAYESIAN KNOWLEDGE TRACING</span>
              <span className="tag good">CORBETT & ANDERSON (1994)</span>
            </div>
            <h2 style={{ fontSize: '1.75rem', margin: '8px 0 2px' }}>
              BKT Model Mathematical Transparency
            </h2>
          </div>
          <span style={{ fontSize: '2rem' }}>📐</span>
        </div>

        <p className="mu" style={{ fontSize: '0.94rem', lineHeight: 1.6 }}>
          Bayesian Knowledge Tracing models learner skill acquisition as a two-state Hidden Markov Model. UDAAN maintains exact probabilistic tracking without hidden heuristics.
        </p>

        {/* Centralized BKT Parameter Registry Table */}
        <div
          style={{
            background: 'rgba(7, 8, 10, 0.85)',
            border: '1px solid rgba(0, 242, 254, 0.22)',
            borderRadius: '16px',
            padding: '18px 22px',
            margin: '16px 0'
          }}
        >
          <div className="row spaced" style={{ marginBottom: 12 }}>
            <b style={{ color: '#00f2fe', fontSize: '0.95rem' }}>Centralized Model Parameters & Literature Priors:</b>
            <span className="tag warn sample">Unvalidated Literature Baseline Defaults</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
            <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '12px', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
              <div style={{ fontSize: '0.78rem', color: 'var(--mu)', fontWeight: 700 }}>P(L0) · Initial Prior</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#38bdf8', margin: '4px 0' }}>
                {cfg.p0 || 0.30}
              </div>
              <div style={{ fontSize: '0.74rem', color: '#cbd5e1' }}>
                Probability learner knows skill before first attempt.
              </div>
            </div>

            <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '12px', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
              <div style={{ fontSize: '0.78rem', color: 'var(--mu)', fontWeight: 700 }}>P(T) · Transition</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#a855f7', margin: '4px 0' }}>
                {cfg.transition || 0.15}
              </div>
              <div style={{ fontSize: '0.74rem', color: '#cbd5e1' }}>
                Probability of acquiring skill between learning steps.
              </div>
            </div>

            <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '12px', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
              <div style={{ fontSize: '0.78rem', color: 'var(--mu)', fontWeight: 700 }}>P(S) · Slip Rate</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#fb923c', margin: '4px 0' }}>
                {cfg.slip || 0.10}
              </div>
              <div style={{ fontSize: '0.74rem', color: '#cbd5e1' }}>
                Probability of making an error despite knowing skill.
              </div>
            </div>

            <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '12px', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
              <div style={{ fontSize: '0.78rem', color: 'var(--mu)', fontWeight: 700 }}>P(G) · Guess Rate</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#10b981', margin: '4px 0' }}>
                {cfg.guess || 0.25}
              </div>
              <div style={{ fontSize: '0.74rem', color: '#cbd5e1' }}>
                Probability of guessing correctly without knowing skill.
              </div>
            </div>
          </div>
        </div>

        {/* Mathematical Formulas Card */}
        <div
          style={{
            background: 'rgba(16, 17, 22, 0.75)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '14px',
            padding: '16px 20px',
            margin: '14px 0',
            fontSize: '0.88rem',
            lineHeight: 1.6
          }}
        >
          <b style={{ color: '#00f2fe' }}>Exact Update Formulation:</b>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: 8 }}>
            <div style={{ background: 'rgba(7, 8, 10, 0.7)', padding: '12px', borderRadius: '10px', fontFamily: 'monospace', fontSize: '0.85rem' }}>
              <b style={{ color: '#10b981' }}>1. Correct Observation:</b><br />
              P(L_t | Correct) = [P(L_t-1) * (1 - S)] / [P(L_t-1) * (1 - S) + (1 - P(L_t-1)) * G]<br />
              P(L_t+1) = P(L_t | obs) + (1 - P(L_t | obs)) * T
            </div>
            <div style={{ background: 'rgba(7, 8, 10, 0.7)', padding: '12px', borderRadius: '10px', fontFamily: 'monospace', fontSize: '0.85rem' }}>
              <b style={{ color: '#f43f5e' }}>2. Incorrect Observation:</b><br />
              P(L_t | Incorrect) = [P(L_t-1) * S] / [P(L_t-1) * S + (1 - P(L_t-1)) * (1 - G)]<br />
              P(L_t+1) = P(L_t | obs) + (1 - P(L_t | obs)) * T
            </div>
          </div>
        </div>

        {/* Live Interactive Step-by-Step BKT Simulator */}
        <div
          style={{
            background: 'rgba(0, 242, 254, 0.04)',
            border: '1px dashed rgba(0, 242, 254, 0.28)',
            borderRadius: '14px',
            padding: '16px 20px',
            marginTop: '16px'
          }}
        >
          <div className="row spaced">
            <div>
              <b style={{ color: '#00f2fe' }}>Interactive BKT Step Simulator:</b>
              <span className="mu" style={{ fontSize: '0.84rem', marginLeft: 8 }}>
                Current Probability: <b style={{ color: '#ffffff', fontSize: '1.1rem' }}>{Math.round(interactiveP * 100)}%</b>
              </span>
            </div>
            <div className="row" style={{ gap: '8px' }}>
              <button
                className="pri"
                onClick={() => handleSimulateStep(true)}
                style={{ padding: '6px 14px', fontSize: '0.84rem' }}
              >
                + Test Correct (✓)
              </button>
              <button
                className="danger"
                onClick={() => handleSimulateStep(false)}
                style={{ padding: '6px 14px', fontSize: '0.84rem' }}
              >
                - Test Incorrect (✗)
              </button>
              <button
                className="sec"
                onClick={handleResetSimulator}
                style={{ padding: '6px 10px', fontSize: '0.84rem' }}
              >
                Reset
              </button>
            </div>
          </div>

          {traceHistory.length > 0 && (
            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', marginTop: 12 }}>
              {traceHistory.map((h, i) => (
                <div
                  key={i}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    background: h.isCorrect ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)',
                    border: `1px solid ${h.isCorrect ? '#10b981' : '#f43f5e'}`,
                    fontSize: '0.78rem',
                    whiteSpace: 'nowrap'
                  }}
                >
                  <b>Step {h.step}: {h.isCorrect ? '✓' : '✗'}</b> · {h.prevP}% → <b>{h.newP}%</b> ({h.delta >= 0 ? `+${h.delta}` : h.delta}%)
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* SECTION 2: BKT VS RULE-BASED EVALUATION (Judge Recommendation 4) */}
      <div className="card" style={{ border: '1px solid rgba(138, 75, 255, 0.3)', marginTop: 24 }}>
        <div className="row spaced">
          <div>
            <div className="row" style={{ gap: '8px' }}>
              <span className="badge-tag">SCIENTIFIC BENCHMARK</span>
              <span className="tag warn sample">SYNTHETIC BENCHMARK SUITE (n=8 Sequences)</span>
            </div>
            <h2 style={{ fontSize: '1.65rem', margin: '8px 0 2px' }}>
              BKT vs. Rule-Based Adaptation Evaluation
            </h2>
            <p className="mu" style={{ margin: 0 }}>
              Both models evaluated under identical chronological attempt sequences without lookahead or data leakage.
            </p>
          </div>

          <button className="pri" onClick={exportCSV} style={{ padding: '10px 18px' }}>
            ⬇ Export Evaluation CSV
          </button>
        </div>

        {/* Metric Cards Grid: Mastery & Difficulty Recommendation */}
        <div className="grid" style={{ margin: '18px 0' }}>
          <div className="card" style={{ margin: 0, background: 'rgba(7, 8, 10, 0.7)' }}>
            <div className="mu" style={{ fontSize: '0.78rem', fontWeight: 700 }}>RULE MASTERY ACCURACY</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#38bdf8', margin: '4px 0' }}>
              {ruleAcc}/8 ({Math.round((ruleAcc / 8) * 100)}%)
            </div>
            <div style={{ fontSize: '0.74rem', color: 'var(--mu)' }}>Direct streak match with teacher ground truth</div>
          </div>

          <div className="card" style={{ margin: 0, background: 'rgba(7, 8, 10, 0.7)' }}>
            <div className="mu" style={{ fontSize: '0.78rem', fontWeight: 700 }}>BKT MASTERY ACCURACY</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#00f2fe', margin: '4px 0' }}>
              {bktAcc}/8 ({Math.round((bktAcc / 8) * 100)}%)
            </div>
            <div style={{ fontSize: '0.74rem', color: 'var(--mu)' }}>Probabilistic cutoff (P ≥ 85% threshold)</div>
          </div>

          <div className="card" style={{ margin: 0, background: 'rgba(7, 8, 10, 0.7)' }}>
            <div className="mu" style={{ fontSize: '0.78rem', fontWeight: 700 }}>INTER-MODEL MASTERY AGREEMENT</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#c084fc', margin: '4px 0' }}>
              {agreeMasteryCount}/8 ({Math.round((agreeMasteryCount / 8) * 100)}%)
            </div>
            <div style={{ fontSize: '0.74rem', color: 'var(--mu)' }}>Identical classification between Rule & BKT</div>
          </div>

          <div className="card" style={{ margin: 0, background: 'rgba(7, 8, 10, 0.7)' }}>
            <div className="mu" style={{ fontSize: '0.78rem', fontWeight: 700 }}>DIFFICULTY RECOMMENDATION AGREEMENT</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#10b981', margin: '4px 0' }}>
              {agreeDiffCount}/8 ({Math.round((agreeDiffCount / 8) * 100)}%)
            </div>
            <div style={{ fontSize: '0.74rem', color: 'var(--mu)' }}>Matching Level 1, 2, or 3 recommendation</div>
          </div>
        </div>

        {/* Detailed Benchmark Results Table */}
        <table>
          <thead>
            <tr>
              <th>Case ID</th>
              <th>Attempt Sequence</th>
              <th>Teacher Label</th>
              <th>Rule Pred & Level</th>
              <th>BKT Pred, Level & Prob</th>
              <th>Mastery Agree</th>
              <th>Diff Agree</th>
              <th>Pedagogical Notes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                style={{
                  background: r.agreeMastery ? 'transparent' : 'rgba(251, 146, 60, 0.08)'
                }}
              >
                <td><b>SYN-{r.id}</b></td>
                <td><code>{r.seq}</code></td>
                <td>
                  <span className={`tag ${r.label ? 'good' : 'mu'}`}>
                    {r.label ? 'Mastered' : 'Not Mastered'}
                  </span>
                </td>
                <td>
                  <span className={`tag ${r.rPred ? 'good' : 'mu'}`}>
                    {r.rPred ? 'Mastered' : 'Not Mastered'}
                  </span>{' '}
                  <span className="tag purple">Lvl {r.ruleLvl}</span> {r.rMatch ? '✓' : '✗'}
                </td>
                <td>
                  <span className={`tag ${r.bPred ? 'good' : 'mu'}`}>
                    {r.bPred ? 'Mastered' : 'Not Mastered'}
                  </span>{' '}
                  <span className="tag purple">Lvl {r.bktDiffRec}</span> ({r.p}%) {r.bMatch ? '✓' : '✗'}
                </td>
                <td>
                  <span className={`tag ${r.agreeMastery ? 'good' : 'warn'}`}>
                    {r.agreeMastery ? '✓ Agree' : '✗ Disagree'}
                  </span>
                </td>
                <td>
                  <span className={`tag ${r.agreeDiff ? 'good' : 'warn'}`}>
                    {r.agreeDiff ? '✓ Agree' : '✗ Disagree'}
                  </span>
                </td>
                <td className="mu" style={{ fontSize: '0.82rem' }}>
                  {r.note}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Scientific Limitations & Empirical Observations Section */}
        <div
          style={{
            background: 'rgba(7, 8, 10, 0.85)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '16px',
            padding: '18px 22px',
            marginTop: '20px',
            fontSize: '0.88rem',
            lineHeight: 1.6
          }}
        >
          <div style={{ fontWeight: 800, color: '#fb923c', fontSize: '0.92rem', marginBottom: 6 }}>
            🔬 Evaluation Methodology, Observations & Limitations:
          </div>
          <ul style={{ margin: 0, paddingLeft: '20px', color: '#cbd5e1' }}>
            <li>
              <b>Dataset Origin:</b> 8 synthetic sequences reflecting edge-case student response trajectories (slips, lucky guesses, oscillating performance). <i>Explicitly disclosed as simulated benchmarks, not real clinical data.</i>
            </li>
            <li>
              <b>Rule Baseline Trade-Offs:</b> The rule engine reacts fast (advances on 2 consecutive correct answers) and is 100% human-explainable. However, it is memoryless: an isolated calculation slip erases streak history, and a lucky guess pair can prematurely promote an unready student.
            </li>
            <li>
              <b>BKT Trade-Offs:</b> BKT smoothly absorbs slips and lucky guesses through its Bayesian updating. However, it exhibits historical inertia: when prolonged early struggle precedes a recovery streak (e.g. SYN-05), BKT remains cautious because earlier errors drag down the posterior.
            </li>
            <li>
              <b>Validation Notice:</b> BKT is not inherently superior merely because of probabilistic math. Scientific proof of student learning gains requires randomized controlled trials with delayed post-tests across real schools.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
