import React, { useEffect, useMemo, useState } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Animated 3D visualisers for the Math Lab.
//
// Everything here is CSS 3D (perspective / preserve-3d) + SVG-free DOM. That is
// deliberate: it cannot lose a WebGL context, needs no GPU, and keeps working
// on low-bandwidth classroom devices. Each visualisation is driven by the data
// in `mathLabTopics.js`, so the tabs genuinely show different things.
// ─────────────────────────────────────────────────────────────────────────────

// ── small math helpers ───────────────────────────────────────────────────────
const gcd = (a, b) => {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
};

const lcm = (a, b) => Math.abs(a * b) / gcd(a, b);

const parseFraction = (value) => {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(-?\d+)\s*\/\s*(-?\d+)$/);
  if (!match) return null;
  const den = Number(match[2]);
  if (!den) return null;
  return { num: Number(match[1]), den };
};

const answerValue = (problem) => {
  const vizValue = problem?.viz?.value;
  if (typeof vizValue === 'number' && Number.isFinite(vizValue)) return vizValue;
  const frac = parseFraction(problem?.answer);
  if (frac) return frac.num / frac.den;
  const num = Number(problem?.answer);
  return Number.isFinite(num) ? num : 0;
};

const formatTick = (value) => {
  if (Math.abs(value) < 1e-9) return '0';
  if (Number.isInteger(value)) return String(value);
  for (const den of [2, 3, 4, 5, 6, 8]) {
    const scaled = value * den;
    if (Math.abs(scaled - Math.round(scaled)) < 1e-9) {
      return `${Math.round(scaled)}/${den}`;
    }
  }
  return value.toFixed(1);
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. 3D fraction bars
// ─────────────────────────────────────────────────────────────────────────────
function Bar3D({ bar, index, isResult }) {
  const den = Math.max(1, Math.min(24, Math.abs(Number(bar.den) || 1)));
  const filled = Math.min(den, Math.abs(Number(bar.num) || 0));
  const tone = bar.tone || (Number(bar.num) < 0 ? 'neg' : 'pos');

  return (
    <div
      className={`ml-bar${isResult ? ' ml-bar-result' : ''}`}
      style={{ animationDelay: `${index * 110}ms` }}
    >
      <div className="ml-bar-head">
        <span className="ml-bar-label">{bar.label}</span>
        <span className={`ml-bar-frac ${tone}`}>
          {bar.num} / {bar.den}
        </span>
      </div>
      <div
        className="ml-bar-track"
        role="img"
        aria-label={`${bar.label}: ${filled} of ${den} parts shaded`}
      >
        {Array.from({ length: den }).map((_, i) => (
          <span
            key={i}
            className={`ml-slice${i < filled ? ` on ${tone}` : ''}`}
            style={{ '--i': i }}
          />
        ))}
      </div>
    </div>
  );
}

function PlaceholderBar() {
  return (
    <div className="ml-bar ml-bar-placeholder">
      <div className="ml-bar-head">
        <span className="ml-bar-label">?</span>
        <span className="ml-bar-frac muted">unknown</span>
      </div>
      <div className="ml-bar-track">
        {Array.from({ length: 8 }).map((_, i) => (
          <span key={i} className="ml-slice ghost" style={{ '--i': i }} />
        ))}
      </div>
    </div>
  );
}

function Counters3D({ viz }) {
  const hops = Array.isArray(viz.hops) ? viz.hops : [];
  return (
    <div className="ml-counters">
      {hops.map((hop, row) => {
        const size = Math.min(12, Math.abs(hop.delta));
        const direction = hop.delta < 0 ? 'neg' : 'pos';
        return (
          <div className="ml-cube-row" key={row}>
            <span className={`ml-cube-tag ${direction}`}>{hop.label ?? hop.delta}</span>
            <div className="ml-cube-group">
              {Array.from({ length: size }).map((_, i) => (
                <span
                  key={i}
                  className={`ml-cube ${direction}`}
                  style={{ '--i': row * 4 + i }}
                />
              ))}
            </div>
          </div>
        );
      })}
      <div className="ml-counters-total">
        net position <b>{formatTick(Number(viz.value) || 0)}</b>
      </div>
    </div>
  );
}

function Reciprocal3D({ viz }) {
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    setFlipped(false);
    const timer = setTimeout(() => setFlipped(true), 500);
    return () => clearTimeout(timer);
  }, [viz.divisor]);

  return (
    <div className="ml-reciprocal">
      <div className="ml-flip-row">
        <div className="ml-flip-card static">
          <span className="ml-flip-cap">dividend</span>
          <span className="ml-flip-val">{viz.divisor ? viz.divisor.split('/')[0] : '?'}</span>
        </div>
        <div className={`ml-flip-card${flipped ? ' flipped' : ''}`}>
          <div className="ml-flip-inner">
            <div className="ml-flip-face front">
              <span className="ml-flip-cap">divisor</span>
              <span className="ml-flip-val">{viz.divisor}</span>
            </div>
            <div className="ml-flip-face back">
              <span className="ml-flip-cap">reciprocal</span>
              <span className="ml-flip-val">{viz.reciprocal}</span>
            </div>
          </div>
        </div>
      </div>
      <div className="ml-flip-eq">{viz.product}</div>
      <div className="ml-flip-note">Division by a fraction = multiply by its reciprocal</div>
    </div>
  );
}

function Balance3D({ viz }) {
  const [level, setLevel] = useState(false);

  useEffect(() => {
    setLevel(false);
    const timer = setTimeout(() => setLevel(true), 650);
    return () => clearTimeout(timer);
  }, [viz.left, viz.right]);

  const tilt = level ? 0 : Number(viz.tilt) || -10;

  return (
    <div className="ml-balance">
      <div className="ml-beam" style={{ '--tilt': `${tilt}deg` }}>
        <div className="ml-beam-bar" />
        <div className="ml-pan ml-pan-left">
          <span className="ml-pan-label">{viz.left}</span>
        </div>
        <div className="ml-pan ml-pan-right">
          <span className="ml-pan-label">{viz.right}</span>
        </div>
      </div>
      <div className="ml-fulcrum" />
      <div className={`ml-balanced${level ? ' on' : ''}`}>
        {level ? `balanced at ${viz.unknown}` : 'balancing...'}
      </div>
    </div>
  );
}

function Slices3D({ problem, revealed }) {
  const viz = problem.viz || {};

  if (viz.flip) return <Reciprocal3D viz={viz.flip} />;
  if (viz.balance) return <Balance3D viz={viz.balance} />;

  const bars = Array.isArray(viz.bars) ? viz.bars : [];
  if (!bars.length) return <Counters3D viz={viz} />;

  // Equivalence questions (1/2 = ?/8) must not show the answer before checking.
  const isEquivalence = typeof problem.display?.right === 'string' && problem.display.right.includes('?');
  const visibleBars = isEquivalence && !revealed ? bars.slice(0, 1) : bars;

  return (
    <div className="ml-stack">
      {visibleBars.map((bar, i) => (
        <Bar3D key={`${bar.label}-${i}`} bar={bar} index={i} />
      ))}
      {isEquivalence && !revealed && <PlaceholderBar />}
      {revealed && viz.result && (
        <Bar3D bar={{ ...viz.result, tone: 'res' }} index={visibleBars.length} isResult />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. 3D number line with sequential jumps
// ─────────────────────────────────────────────────────────────────────────────
function buildLine(problem) {
  const viz = problem.viz || {};
  let points;

  if (Array.isArray(viz.hops) && viz.hops.length) {
    let cursor = Number(viz.start) || 0;
    points = [{ value: cursor, label: formatTick(cursor), kind: 'start' }];
    viz.hops.forEach((hop, i) => {
      cursor = Number((cursor + Number(hop.delta)).toFixed(4));
      points.push({
        value: cursor,
        label: hop.label ?? (Number(hop.delta) > 0 ? `+${hop.delta}` : String(hop.delta)),
        kind: i === 0 ? 'hop' : 'hop'
      });
    });
  } else {
    const target = answerValue(problem);
    points = [
      { value: 0, label: '0', kind: 'start' },
      { value: target, label: problem.answer, kind: 'hop' }
    ];
  }

  const values = points.map((p) => p.value);
  let min = Math.min(0, ...values);
  let max = Math.max(0, ...values);
  const span = max - min;
  const pad = span < 2 ? (2 - span) / 2 : span * 0.14;
  min -= pad;
  max += pad;

  const rawStep = (max - min) / 8;
  const step = [0.25, 0.5, 1, 2, 3, 5, 10, 20, 25].find((s) => s >= rawStep) || 50;

  const ticks = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) {
    ticks.push(Number(v.toFixed(4)));
  }

  return { points, min, max, ticks };
}

function NumberLine3D({ problem }) {
  const line = useMemo(() => buildLine(problem), [problem.id]);
  const [hopIndex, setHopIndex] = useState(-1);

  useEffect(() => {
    setHopIndex(-1);
    const timers = line.points.slice(1).map((_, i) =>
      setTimeout(() => setHopIndex(i), 380 + i * 620)
    );
    return () => timers.forEach(clearTimeout);
  }, [problem.id, line.points.length]);

  const current = hopIndex < 0 ? line.points[0] : line.points[hopIndex + 1];
  const pct = (value) => ((value - line.min) / (line.max - line.min)) * 100;

  return (
    <div className="ml-numline-wrap">
      <div className="ml-numline">
        <div className="ml-numline-axis" />
        {line.ticks.map((tick) => (
          <div key={tick} className="ml-tick" style={{ left: `${pct(tick)}%` }}>
            <span className="ml-tick-mark" />
            <span className="ml-tick-label">{formatTick(tick)}</span>
          </div>
        ))}

        {line.points.map((point, i) => (
          <div
            key={`${point.value}-${i}`}
            className={`ml-stop${i === 0 ? ' start' : ''}`}
            style={{ left: `${pct(point.value)}%`, animationDelay: `${i * 120}ms` }}
          >
            <span className="ml-stop-dot" />
          </div>
        ))}

        <div className="ml-marker" style={{ left: `${pct(current.value)}%` }}>
          <span className="ml-marker-bubble">{current.label}</span>
          <span className="ml-marker-pin" />
        </div>
      </div>

      <div className="ml-hop-row">
        {line.points.slice(1).map((point, i) => (
          <span
            key={`${point.label}-${i}`}
            className={`ml-hop-chip${hopIndex >= i ? ' on' : ''}`}
          >
            {point.label}
          </span>
        ))}
      </div>
      <div className="ml-viz-foot">
        Each jump moves the marker along the line. Watch where it finishes.
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Common-denominator ladder
// ─────────────────────────────────────────────────────────────────────────────
function multiplesUpTo(start, target, cap = 10) {
  const out = [];
  if (!start) return out;
  for (let k = 1; k <= cap; k += 1) {
    const value = start * k;
    out.push(value);
    if (value >= target) break;
  }
  return out;
}

function deriveLadder(problem) {
  const viz = problem.viz || {};
  if (viz.ladder) return viz.ladder;

  const bars = Array.isArray(viz.bars) ? viz.bars : [];
  const dens = [...new Set(bars.map((b) => Math.abs(Number(b.den) || 1)))];
  if (dens.length < 2) return null;

  const target = dens.reduce((acc, d) => lcm(acc, d), 1);
  return {
    a: dens[0],
    b: dens[1],
    lcm: target,
    conversions: bars.slice(0, 2).map((bar) => {
      const factor = target / Math.abs(Number(bar.den) || 1);
      return {
        from: `${bar.num}/${bar.den}`,
        factor,
        to: `${Number(bar.num) * factor}/${target}`
      };
    })
  };
}

function Ladder3D({ ladder }) {
  const { a, b, lcm: target, conversions = [] } = ladder;
  const rowA = multiplesUpTo(a, target);
  const rowB = multiplesUpTo(b, target);

  return (
    <div className="ml-ladder">
      <div className="ml-multiples">
        <div className="ml-multiple-row">
          <span className="ml-multiple-cap">x{a}</span>
          {rowA.map((value, i) => (
            <span
              key={value}
              className={`ml-multiple${value === target ? ' hit' : ''}`}
              style={{ animationDelay: `${i * 70}ms` }}
            >
              {value}
            </span>
          ))}
        </div>
        <div className="ml-multiple-row">
          <span className="ml-multiple-cap">x{b}</span>
          {rowB.map((value, i) => (
            <span
              key={value}
              className={`ml-multiple${value === target ? ' hit' : ''}`}
              style={{ animationDelay: `${i * 70 + 60}ms` }}
            >
              {value}
            </span>
          ))}
        </div>
      </div>

      <div className="ml-lcm-badge">
        LCM = <b>{target}</b>
      </div>

      {conversions.length > 0 && (
        <div className="ml-conversions">
          {conversions.map((conv, i) => (
            <div
              key={`${conv.from}-${i}`}
              className="ml-conversion"
              style={{ animationDelay: `${300 + i * 160}ms` }}
            >
              <span className="ml-conv-frac">{conv.from}</span>
              <span className="ml-conv-arrow">
                <span className="ml-conv-factor">x{conv.factor}</span>
                <span className="ml-conv-line" />
              </span>
              <span className="ml-conv-frac to">{conv.to}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function InverseOps3D({ steps, expr }) {
  return (
    <div className="ml-inverse">
      <div className="ml-inverse-expr">{expr}</div>
      <div className="ml-inverse-list">
        {steps.map((step, i) => (
          <div
            key={`${step.op}-${i}`}
            className={`ml-inverse-step${i === steps.length - 1 ? ' done' : ''}`}
            style={{ animationDelay: `${i * 160}ms` }}
          >
            <span className="ml-inverse-op">{step.op}</span>
            <span className="ml-inverse-note">{step.note}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Denominator3D({ problem }) {
  const viz = problem.viz || {};
  const ladder = deriveLadder(problem);

  if (ladder) return <Ladder3D ladder={ladder} />;
  if (Array.isArray(viz.inverse)) {
    return <InverseOps3D steps={viz.inverse} expr={`${problem.display.left} = ${problem.display.right}`} />;
  }

  return (
    <div className="ml-no-ladder">
      <div className="ml-no-ladder-title">No common denominator needed here</div>
      <p>
        {Array.isArray(viz.hops)
          ? 'Integers sit on the same number line, so you simply combine the signed jumps.'
          : 'This problem does not compare two different denominators.'}
      </p>
      {Array.isArray(viz.hops) && (
        <div className="ml-hop-row">
          {viz.hops.map((hop, i) => (
            <span key={i} className={`ml-hop-chip on ${Number(hop.delta) < 0 ? 'neg' : 'pos'}`}>
              {hop.label ?? hop.delta}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Step-by-step reveal
// ─────────────────────────────────────────────────────────────────────────────
function Steps3D({ steps }) {
  const [shown, setShown] = useState(1);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    setShown(1);
    setPlaying(false);
  }, [steps]);

  useEffect(() => {
    if (!playing) return undefined;
    if (shown >= steps.length) {
      setPlaying(false);
      return undefined;
    }
    const timer = setTimeout(() => setShown((s) => s + 1), 950);
    return () => clearTimeout(timer);
  }, [playing, shown, steps.length]);

  const allShown = shown >= steps.length;

  return (
    <div className="ml-steps">
      <div className="ml-steps-list">
        {steps.map((step, i) => {
          const visible = i < shown;
          return (
            <div
              key={`${i}-${step}`}
              className={`ml-step${visible ? ' on' : ''}${i === shown - 1 ? ' current' : ''}`}
            >
              <span className="ml-step-num">{i + 1}</span>
              <span className="ml-step-text">{visible ? step : '...'}</span>
            </div>
          );
        })}
      </div>

      <div className="ml-steps-controls">
        <button
          className="sec"
          onClick={() => {
            setShown(allShown ? 1 : steps.length);
            setPlaying(false);
          }}
        >
          {allShown ? '↺ Restart' : 'Show all steps'}
        </button>
        <button
          className={playing ? 'warn' : 'pri'}
          onClick={() => {
            if (allShown) setShown(1);
            setPlaying((p) => !p);
          }}
        >
          {playing ? '⏸ Pause' : '▶ Play steps'}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Public switch
// ─────────────────────────────────────────────────────────────────────────────
const FALLBACK_STEPS = [
  'Read the question carefully.',
  'Choose the operation that matches the question.',
  'Work it out one step at a time.'
];

export default function MathVisual({ problem, mode, revealed = false, lang }) {
  if (!problem) return null;

  const steps = problem.viz?.steps || FALLBACK_STEPS;

  switch (mode) {
    case 'numberLine':
      return <NumberLine3D problem={problem} />;
    case 'denominator':
      return <Denominator3D problem={problem} />;
    case 'stepByStep':
      return <Steps3D steps={steps} />;
    case 'slices':
    default:
      return <Slices3D problem={problem} revealed={revealed} lang={lang} />;
  }
}
