import React, { useState } from 'react';

export default function ClassroomObservatory({
  cards,
  cfg,
  onCardStatus,
  onCardEdit
}) {
  const [selectedStudent, setSelectedStudent] = useState(null);

  // Student cohort nodes (Sample Cohort Data, n=40 students)
  const studentNodes = [
    {
      id: 'S-01',
      name: 'Aarav Sharma',
      cluster: 'Urgent Intervention',
      misconception: 'num_den_separate',
      misconceptionLabel: 'Added numerators & denominators separately',
      concept: 'Adding Rationals (c5)',
      mastery: 0.25,
      attempts: 4,
      status: 'pending',
      evidence: 'Selected -1/3 on Q1, confirmed on follow-up (2/4), failed reassessment (-1/9).',
      triggeringRule: 'Reassessment failed after targeted intervention',
      suggestedAction: '1-on-1 tactile number line manipulative session on finding LCM.',
      cardId: 101
    },
    {
      id: 'S-02',
      name: 'Diya Patel',
      cluster: 'Urgent Intervention',
      misconception: 'num_den_separate',
      misconceptionLabel: 'Added numerators & denominators separately',
      concept: 'Adding Rationals (c5)',
      mastery: 0.28,
      attempts: 3,
      status: 'pending',
      evidence: 'Selected -1/3 on Q1, follow-up confirmed denominator addition.',
      triggeringRule: 'Misconception confirmed via dynamic diagnostic follow-up',
      suggestedAction: 'Assign equivalent fraction strip matching practice.',
      cardId: 102
    },
    {
      id: 'S-03',
      name: 'Rohan Verma',
      cluster: 'Targeted Review',
      misconception: 'ignored_negative',
      misconceptionLabel: 'Ignored negative sign during LCM conversion',
      concept: 'Adding Rationals (c5)',
      mastery: 0.42,
      attempts: 5,
      status: 'accepted',
      evidence: 'Selected 5/4 on Q1; converted to fourths correctly but lost negative sign.',
      triggeringRule: 'Wrong streak >= down threshold (2)',
      suggestedAction: 'Direct number line signed movement practice.',
      cardId: 103
    },
    {
      id: 'S-04',
      name: 'Ananya Reddy',
      cluster: 'Challenge Ready',
      misconception: 'none',
      misconceptionLabel: 'No recurring misconceptions detected',
      concept: 'Adding Rationals (c5)',
      mastery: 0.88,
      attempts: 6,
      status: 'completed',
      evidence: 'Clean 4-in-a-row correct streak on rational addition.',
      triggeringRule: 'Correct streak >= up threshold (2)',
      suggestedAction: 'Advance to Level 3: Rational Algebraic Expressions (c7).',
      cardId: 104
    },
    {
      id: 'S-05',
      name: 'Kavya Nair',
      cluster: 'Targeted Review',
      misconception: 'sign_slip',
      misconceptionLabel: 'Sign calculation slip in final numerator',
      concept: 'Integers & Rationals (c0)',
      mastery: 0.52,
      attempts: 3,
      status: 'pending',
      evidence: 'Selected +1/4 instead of -1/4; arithmetic slip.',
      triggeringRule: 'Isolated calculation error detected',
      suggestedAction: 'Brief 3-minute oral drill on directed integers.',
      cardId: 105
    },
    {
      id: 'S-06',
      name: 'Vihaan Rao',
      cluster: 'Challenge Ready',
      misconception: 'none',
      misconceptionLabel: 'Mastery secure across all benchmarks',
      concept: 'Adding Rationals (c5)',
      mastery: 0.92,
      attempts: 5,
      status: 'completed',
      evidence: 'Consistent rapid accuracy on unlike denominators.',
      triggeringRule: 'BKT posterior mastery probability >= 85%',
      suggestedAction: 'Assign peer-mentoring or extension algebra challenges.',
      cardId: 106
    }
  ];

  return (
    <div className="card" style={{ marginTop: '16px' }}>
      <div className="row spaced">
        <div>
          <h3>🔭 Visual Classroom Observatory</h3>
          <span className="tag warn sample">SYNTHETIC DEMO COHORT (n=40 students)</span>
        </div>
        <div className="row">
          <span className="tag danger">● Urgent Intervention (15)</span>
          <span className="tag warn">● Targeted Review (19)</span>
          <span className="tag good">● Challenge Ready (6)</span>
        </div>
      </div>
      <p className="mu" style={{ fontSize: '0.86rem', margin: '4px 0 14px' }}>
        Interactive student node cluster. Click any student node to inspect evidence, diagnostic diagnosis, and intervention actions.
      </p>

      {/* Visual Constellation Grid of Student Nodes */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
          gap: '12px',
          padding: '16px',
          background: 'radial-gradient(ellipse at center, rgba(91,75,255,0.06), rgba(0,0,0,0.02))',
          borderRadius: '14px',
          border: '1.5px dashed var(--bd)'
        }}
      >
        {studentNodes.map((s) => {
          const isSelected = selectedStudent?.id === s.id;
          const nodeColor =
            s.cluster === 'Urgent Intervention'
              ? 'var(--er)'
              : s.cluster === 'Targeted Review'
              ? 'var(--wn)'
              : 'var(--ok)';

          return (
            <button
              key={s.id}
              onClick={() => setSelectedStudent(s)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: '12px 8px',
                borderRadius: '12px',
                background: isSelected ? 'rgba(91,75,255,0.15)' : 'var(--card)',
                border: `2px solid ${isSelected ? 'var(--pr)' : nodeColor}`,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                transform: isSelected ? 'scale(1.05)' : 'scale(1)'
              }}
              aria-label={`Student ${s.name}, Status: ${s.cluster}, Mastery: ${Math.round(s.mastery * 100)}%`}
            >
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '50%',
                  background: `${nodeColor}22`,
                  border: `2px solid ${nodeColor}`,
                  display: 'grid',
                  placeItems: 'center',
                  fontWeight: 800,
                  color: nodeColor,
                  fontSize: '0.9rem',
                  marginBottom: '6px'
                }}
              >
                {s.name.charAt(0)}
              </div>
              <b style={{ fontSize: '0.84rem', textAlign: 'center', lineHeight: 1.2 }}>{s.name}</b>
              <span className="mu" style={{ fontSize: '0.72rem', marginTop: '2px' }}>
                {Math.round(s.mastery * 100)}% BKT
              </span>
            </button>
          );
        })}
      </div>

      {/* Selected Student Evidence Panel */}
      {selectedStudent && (
        <div
          style={{
            background: 'var(--card)',
            border: '2px solid var(--pr)',
            borderRadius: '14px',
            padding: '18px',
            marginTop: '16px',
            animation: 'rise .3s both'
          }}
        >
          <div className="row spaced">
            <div>
              <h4 style={{ margin: 0, fontSize: '1.1rem' }}>
                👤 {selectedStudent.name} ({selectedStudent.id})
              </h4>
              <span className="mu" style={{ fontSize: '0.82rem' }}>
                Diagnostic Cohort: Class 8 - Section A
              </span>
            </div>
            <div className="row">
              <span
                className="tag"
                style={{
                  background:
                    selectedStudent.cluster === 'Urgent Intervention'
                      ? 'rgba(229,56,79,0.15)'
                      : 'rgba(26,160,91,0.15)',
                  color:
                    selectedStudent.cluster === 'Urgent Intervention'
                      ? 'var(--er)'
                      : 'var(--ok)'
                }}
              >
                {selectedStudent.cluster}
              </span>
            </div>
          </div>

          <div className="grid" style={{ margin: '12px 0' }}>
            <div style={{ background: 'var(--bg)', padding: '10px', borderRadius: '10px' }}>
              <div className="mu" style={{ fontSize: '0.8rem' }}>Recurring Misconception</div>
              <b style={{ color: 'var(--wn)' }}>{selectedStudent.misconceptionLabel}</b>
              <div className="mu" style={{ fontSize: '0.75rem' }}>Tag: {selectedStudent.misconception}</div>
            </div>

            <div style={{ background: 'var(--bg)', padding: '10px', borderRadius: '10px' }}>
              <div className="mu" style={{ fontSize: '0.8rem' }}>Diagnostic Evidence</div>
              <p style={{ margin: '2px 0', fontSize: '0.88rem' }}>{selectedStudent.evidence}</p>
            </div>
          </div>

          <div style={{ background: 'rgba(91,75,255,0.06)', padding: '12px', borderRadius: '10px', margin: '10px 0' }}>
            <div><b>Triggering Rule:</b> <span className="tag">{selectedStudent.triggeringRule}</span></div>
            <div style={{ marginTop: '4px' }}>
              <b>Suggested Pedagogical Action:</b> {selectedStudent.suggestedAction}
            </div>
          </div>

          <div className="row" style={{ marginTop: '14px' }}>
            <button
              className="pri"
              onClick={() => {
                onCardStatus(selectedStudent.cardId, 'accepted');
                alert(`Action accepted for ${selectedStudent.name}. Scheduled for small-group intervention.`);
              }}
            >
              ✓ Accept Recommended Intervention
            </button>
            <button
              className="sec"
              onClick={() => onCardEdit(selectedStudent.cardId)}
            >
              ✏ Edit Action Note
            </button>
            <button
              className="danger"
              onClick={() => {
                onCardStatus(selectedStudent.cardId, 'dismissed');
                alert(`Action dismissed for ${selectedStudent.name}.`);
              }}
            >
              ✗ Dismiss
            </button>
            <button className="sec" onClick={() => setSelectedStudent(null)}>
              Close Panel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
