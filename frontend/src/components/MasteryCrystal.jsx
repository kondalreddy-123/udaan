import React from 'react';

export default function MasteryCrystal({ conceptId, title, score, source, ruleState, lang, onClick }) {
  let provenance = 'Baseline Estimate';
  if (source === 'bkt') provenance = 'BKT Neural Estimate';
  else if (source === 'rule') provenance = 'Rule Level Tracker';

  const pct = Math.round((score || 0.25) * 100);

  // Status mapping matching Clip 1
  let statusBadge = { label: 'In Progress', color: '#38bdf8', bg: 'rgba(0, 242, 254, 0.12)' };
  let crystalGlow = 'rgba(0, 242, 254, 0.8)';

  if (pct >= 75) {
    statusBadge = { label: 'Mastered', color: '#34d399', bg: 'rgba(16, 185, 129, 0.14)' };
    crystalGlow = 'rgba(16, 185, 129, 0.85)';
  } else if (pct < 30) {
    statusBadge = { label: 'Needs Focus', color: '#fb923c', bg: 'rgba(251, 146, 60, 0.14)' };
    crystalGlow = 'rgba(251, 146, 60, 0.8)';
  } else {
    statusBadge = { label: 'In Progress', color: '#c084fc', bg: 'rgba(138, 75, 255, 0.15)' };
    crystalGlow = 'rgba(138, 75, 255, 0.85)';
  }

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        padding: '14px 18px',
        background: 'rgba(16, 17, 22, 0.72)',
        borderRadius: '16px',
        margin: '10px 0',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        backdropFilter: 'blur(16px)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.25s ease'
      }}
      className="card-hover-effect"
    >
      {/* 3D Holographic Crystal Sphere */}
      <div
        style={{
          width: '52px',
          height: '52px',
          borderRadius: '50%',
          background: `radial-gradient(circle at 35% 35%, #ffffff 0%, ${crystalGlow} 50%, #07080a 100%)`,
          boxShadow: `0 0 22px ${crystalGlow}, inset 0 0 8px rgba(255,255,255,0.7)`,
          display: 'grid',
          placeItems: 'center',
          flexShrink: 0,
          border: '1px solid rgba(255, 255, 255, 0.3)',
          animation: 'floatOrb 4.5s ease-in-out infinite'
        }}
        aria-hidden="true"
      >
        <span style={{ fontSize: '0.82rem', fontWeight: 900, color: '#ffffff', textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
          {pct}%
        </span>
      </div>

      {/* Concept Details & Live Metrics */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="row spaced" style={{ marginBottom: 4 }}>
          <b style={{ fontSize: '0.98rem', color: '#f8fafc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {title}
          </b>
          <span
            style={{
              fontSize: '0.74rem',
              fontWeight: 800,
              padding: '3px 8px',
              borderRadius: '99px',
              color: statusBadge.color,
              background: statusBadge.bg,
              border: `1px solid ${statusBadge.color}40`,
              letterSpacing: '0.3px'
            }}
          >
            {statusBadge.label}
          </span>
        </div>

        <div className="bar" style={{ margin: '6px 0 8px', height: '8px' }}>
          <i
            style={{
              width: `${pct}%`,
              background:
                pct >= 75
                  ? 'linear-gradient(90deg, #10b981 0%, #00f2fe 100%)'
                  : 'linear-gradient(90deg, #00f2fe 0%, #8a4bff 100%)'
            }}
          ></i>
        </div>

        <div className="row spaced" style={{ fontSize: '0.78rem' }}>
          <span className="mu">
            Source: <b style={{ color: '#e2e8f0' }}>{provenance}</b>
          </span>
          {ruleState && (
            <span className="mu">
              Rule Level: <b style={{ color: '#00f2fe' }}>{ruleState.lvl}/3</b> ({ruleState.path})
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
