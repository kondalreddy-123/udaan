import React from 'react';

export default function Cube3D() {
  return (
    <div className="stage" aria-hidden="true" style={{ height: '240px', position: 'relative' }}>
      {/* Ambient background energy rings */}
      <div
        style={{
          position: 'absolute',
          width: '210px',
          height: '210px',
          borderRadius: '50%',
          border: '1px dashed rgba(0, 242, 254, 0.25)',
          transform: 'rotateX(68deg)',
          animation: 'spinRing 20s linear infinite'
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: '180px',
          height: '180px',
          borderRadius: '50%',
          border: '1px dashed rgba(138, 75, 255, 0.25)',
          transform: 'rotateY(68deg)',
          animation: 'spinRing 15s linear infinite reverse'
        }}
      />

      {/* Floating particles */}
      <div className="orb" style={{ width: '28px', height: '28px', left: '12%', top: '15%', background: 'radial-gradient(circle, #00f2fe, transparent)' }}></div>
      <div className="orb" style={{ width: '18px', height: '18px', right: '14%', top: '70%', background: 'radial-gradient(circle, #8a4bff, transparent)', animationDelay: '2s' }}></div>

      {/* 3D Glass Crystal Math Cube */}
      <div
        className="cube"
        style={{
          width: '110px',
          height: '110px',
          position: 'relative',
          transformStyle: 'preserve-3d',
          animation: 'spin 18s linear infinite'
        }}
      >
        <div style={{ background: 'linear-gradient(135deg, rgba(0, 242, 254, 0.4) 0%, rgba(16, 17, 22, 0.85) 100%)', borderColor: 'rgba(0, 242, 254, 0.6)' }}>
          ½
        </div>
        <div style={{ background: 'linear-gradient(135deg, rgba(138, 75, 255, 0.4) 0%, rgba(16, 17, 22, 0.85) 100%)', borderColor: 'rgba(138, 75, 255, 0.6)' }}>
          −¾
        </div>
        <div style={{ background: 'linear-gradient(135deg, rgba(0, 210, 196, 0.4) 0%, rgba(16, 17, 22, 0.85) 100%)', borderColor: 'rgba(0, 210, 196, 0.6)' }}>
          ⅔
        </div>
        <div style={{ background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.4) 0%, rgba(16, 17, 22, 0.85) 100%)', borderColor: 'rgba(56, 189, 248, 0.6)' }}>
          +
        </div>
        <div style={{ background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.4) 0%, rgba(16, 17, 22, 0.85) 100%)', borderColor: 'rgba(168, 85, 247, 0.6)' }}>
          LCM
        </div>
        <div style={{ background: 'linear-gradient(135deg, rgba(0, 242, 254, 0.4) 0%, rgba(16, 17, 22, 0.85) 100%)', borderColor: 'rgba(0, 242, 254, 0.6)' }}>
          −¼
        </div>
      </div>
    </div>
  );
}
