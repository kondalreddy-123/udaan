import React from 'react';

export default function TeacherGuideModal({ onClose }) {
  return (
    <div className="modal" role="dialog" aria-modal="true">
      <div className="modal-content">
        <div className="row spaced">
          <h3>📖 Teacher Guide & Protocol</h3>
          <button onClick={onClose} style={{ padding: '4px 8px' }}>
            ✕
          </button>
        </div>
        <div style={{ fontSize: '0.9rem', lineHeight: 1.6, marginTop: '12px' }}>
          <b>1. Setting Intervention Thresholds:</b>
          <p>
            Set the correct streak threshold to 2 or 3 depending on whether you are conducting formative diagnostic practice or summative mastery testing.
          </p>
          <b>2. Reviewing Action Cards:</b>
          <p>
            Every Action Card presents the triggering rule and evidence. You can Accept, Edit the recommended action, or Dismiss if you know context the system does not.
          </p>
          <b>3. Distinguishing Slips vs. Misconceptions:</b>
          <p>
            If a student makes an isolated calculation error, the Detective gives them a second chance without penalizing concept mastery.
          </p>
          <b>4. NCERT Rational Numbers Scope:</b>
          <p>
            Covers Chapter 1: Rational Numbers (7 progressive concepts), with special diagnostic focus on Concept c5 (Adding rationals with unlike denominators) and prerequisite c2 (LCM).
          </p>
        </div>
      </div>
    </div>
  );
}
