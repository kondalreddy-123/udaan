import React from 'react';

export default function Header({
  lang,
  setLang,
  activeTab,
  setActiveTab,
  role,
  setRole,
  online,
  setOnline,
  lowBandwidth,
  setLowBandwidth,
  t
}) {
  // Role-filtered tabs: students don't see teacher-only tabs, teachers don't see compare
  const allTabs = [
    { id: 'hero', icon: '✨', roles: ['student', 'teacher', 'author'] },
    { id: 'student', icon: '🚀', roles: ['student', 'author'] },
    { id: 'galaxy', icon: '🪐', roles: ['student', 'author'] },
    { id: 'mathLab', icon: '🔬', roles: ['student', 'author'] },
    { id: 'detective', icon: '🔍', roles: ['student', 'author'] },
    { id: 'teacher', icon: '👨‍🏫', roles: ['teacher', 'author'] },
    { id: 'content', icon: '📝', roles: ['teacher', 'author'] },
    { id: 'compare', icon: '📊', roles: ['student', 'teacher', 'author'] },
  ];

  const tabs = allTabs.filter(tab => tab.roles.includes(role));

  const cycleRole = () => {
    const roles = ['student', 'teacher', 'author'];
    const nextIdx = (roles.indexOf(role) + 1) % roles.length;
    const nextRole = roles[nextIdx];
    setRole(nextRole);
    if (nextRole === 'teacher') setActiveTab('teacher');
    else if (nextRole === 'author') setActiveTab('content');
    else setActiveTab('student');
  };

  const roleLabel = role === 'student' ? '🎓 Student' : role === 'teacher' ? '👨‍🏫 Teacher' : '✏️ Author';
  const roleColor = role === 'student' ? '#00f2fe' : role === 'teacher' ? '#8a4bff' : '#fb923c';

  return (
    <header>
      <div className="logo-box" onClick={() => setActiveTab('hero')} title="Return to Launch Experience">
        <svg className="origami-logo" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="origamiGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#00f2fe" />
              <stop offset="100%" stopColor="#0284c7" />
            </linearGradient>
            <linearGradient id="origamiGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#8a4bff" />
              <stop offset="100%" stopColor="#c084fc" />
            </linearGradient>
            <linearGradient id="origamiGrad3" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#38bdf8" />
              <stop offset="100%" stopColor="#7928ca" />
            </linearGradient>
          </defs>
          <polygon points="12,48 55,18 42,62" fill="url(#origamiGrad1)" opacity="0.95" />
          <polygon points="55,18 92,32 50,58" fill="url(#origamiGrad2)" opacity="0.9" />
          <polygon points="42,62 50,58 78,82" fill="url(#origamiGrad3)" opacity="0.85" />
          <polygon points="26,68 42,62 38,88" fill="url(#origamiGrad1)" opacity="0.75" />
          <circle cx="55" cy="18" r="3" fill="#00f2fe" filter="drop-shadow(0 0 6px #00f2fe)" />
        </svg>
        <div className="logo">
          <span>UDAAN</span>
          <span className="logo-sub">AI-Powered Adaptive Learning</span>
        </div>
        <span className="badge-tag">NCERT CLASS 8</span>
      </div>

      <nav role="tablist" aria-label="Main Navigation">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={activeTab === tab.id ? 'on' : ''}
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
          >
            <span>{tab.icon}</span>
            <span>
              {tab.id === 'compare'
                ? role === 'teacher'
                  ? (lang === 'te' ? 'అభ్యాస అంతర్దృష్టులు' : 'Learning Insights')
                  : role === 'author'
                    ? (lang === 'te' ? 'నమూనా మూల్యాంకనం' : 'Model Evaluation')
                    : t('compare')
                : t(tab.id)}
            </span>
          </button>
        ))}
      </nav>

      <div className="row" style={{ gap: '8px' }}>
        <button
          className={lowBandwidth ? 'warn' : 'sec'}
          onClick={() => setLowBandwidth(!lowBandwidth)}
          title="Toggle Low-Bandwidth Data Saver mode for 2G/3G classrooms"
          style={{ fontSize: '0.78rem', padding: '6px 10px' }}
        >
          {lowBandwidth ? t('dataSaverOn') : t('dataSaverOff')}
        </button>

        <button
          className={online ? 'success' : 'warn'}
          onClick={() => setOnline(!online)}
          aria-live="polite"
          title="Toggle online/offline status"
          style={{ fontSize: '0.82rem' }}
        >
          {online ? t('online') : t('offline')}
        </button>

        <button
          className="sec"
          onClick={cycleRole}
          title="Switch role (Student / Teacher / Author)"
          style={{ fontSize: '0.82rem', borderColor: roleColor, color: roleColor }}
        >
          {roleLabel}
        </button>

        <button
          onClick={() => setLang(lang === 'en' ? 'te' : 'en')}
          title="Toggle English / Telugu"
          style={{ fontSize: '0.82rem' }}
        >
          🌐 {lang === 'en' ? 'తెలుగు' : 'English'}
        </button>
      </div>
    </header>
  );
}
