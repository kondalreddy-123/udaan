import React, { useState } from 'react';

const TOUR_STEPS = [
  {
    title: 'Welcome to UDAAN v2.0!',
    text: 'UDAAN is an Understanding-Driven Adaptive Academic Navigator built for NCERT Class 8 Mathematics. All cohort numbers are clearly disclosed as synthetic demo data.'
  },
  {
    title: 'The Learning Detective',
    text: 'Unlike simple quiz apps, UDAAN treats wrong answers as HYPOTHESES. It generates targeted follow-up questions to distinguish careless slips from true misconceptions.'
  },
  {
    title: 'Explainable Teacher Action Cards',
    text: 'When persistent difficulties are detected, the system does not make automatic high-stakes decisions. It creates human-reviewable Action Cards displaying the evidence, triggering rule, and suggested action.'
  },
  {
    title: 'Transparent Model Comparison',
    text: 'Explore the Model Comparison tab to compare Rule-based adaptation against Bayesian Knowledge Tracing across 8 synthetic benchmarks with downloadable CSV export.'
  }
];

export default function WalkthroughTour({ onClose }) {
  const [step, setStep] = useState(0);
  const current = TOUR_STEPS[step];

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      <div className="modal-content">
        <div className="row spaced">
          <span className="tag">
            Guide {step + 1}/{TOUR_STEPS.length}
          </span>
          <button onClick={onClose} style={{ padding: '4px 8px' }}>
            ✕
          </button>
        </div>
        <h3 id="tour-title" style={{ marginTop: '10px' }}>
          {current.title}
        </h3>
        <p style={{ fontSize: '0.95rem', lineHeight: 1.6 }}>{current.text}</p>
        <div className="row spaced" style={{ marginTop: '20px' }}>
          <button
            disabled={step === 0}
            onClick={() => setStep((s) => s - 1)}
          >
            Back
          </button>
          <button
            className="pri"
            onClick={() => {
              if (step < TOUR_STEPS.length - 1) setStep((s) => s + 1);
              else onClose();
            }}
          >
            {step < TOUR_STEPS.length - 1 ? 'Next →' : 'Finish Tour ✓'}
          </button>
        </div>
      </div>
    </div>
  );
}
