import React from 'react';

export default function Header({
  lang,
  setLang,
  activeTab,
  setActiveTab,
  currentUser,
  onOpenAuth,
  onOpenParentOnboarding,
  onLogout,
  online,
  setOnline,
  lowBandwidth,
  setLowBandwidth,
  t
}) {
  const role = currentUser?.role || 'guest';

  // Role-filtered tabs
  const allTabs = [
    { id: 'hero', icon: '✨', label: t('hero') || 'Home', roles: ['guest', 'student', 'teacher', 'author', 'admin'] },
    { id: 'admin', icon: '⚙️', label: 'Admin Portal', roles: ['admin'] },
    { id: 'student', icon: '🚀', label: t('student') || 'Student Dashboard', roles: ['student', 'admin'] },
    { id: 'parent', icon: '👨‍👩‍👧', label: t('parent') || 'My Family', roles: ['parent'] },
    { id: 'galaxy', icon: '🪐', label: t('galaxy') || 'Topics', roles: ['guest', 'student', 'admin'] },
    { id: 'mathLab', icon: '🔬', label: t('mathLab') || 'Math Lab', roles: ['guest', 'student', 'admin'] },
    { id: 'detective', icon: '🔍', label: t('detective') || 'Review mistakes', roles: ['student', 'admin'] },
    { id: 'teacher', icon: '👨‍🏫', label: t('teacher') || 'Teacher Dashboard', roles: ['teacher', 'admin'] },
    { id: 'content', icon: '📝', label: t('content') || 'Lesson Planner', roles: ['teacher', 'author', 'admin'] },
    {
      id: 'compare',
      icon: '📊',
      label: role === 'teacher'
        ? (lang === 'te' ? 'అభ్యాస అంతర్దృష్టులు' : 'Learning Insights')
        : role === 'author'
          ? (lang === 'te' ? 'నమూనా మూల్యాంకనం' : 'Model Evaluation')
          : t('compare'),
      roles: ['student', 'teacher', 'author', 'admin']
    },
  ];

  const tabs = allTabs.filter(tab => tab.roles.includes(role));

  const roleBadgeConfig = {
    student: { label: 'Student', color: '#75c6cf', bg: 'rgba(72, 156, 166, 0.12)' },
    parent: { label: 'Parent', color: '#7bc5a0', bg: 'rgba(74, 151, 111, 0.12)' },
    teacher: { label: 'Teacher', color: '#b6a2d8', bg: 'rgba(126, 96, 164, 0.14)' },
    author: { label: 'Author', color: '#d8aa73', bg: 'rgba(174, 120, 55, 0.14)' },
    admin: { label: 'Admin', color: '#d8878b', bg: 'rgba(160, 68, 74, 0.14)' },
    guest: { label: 'Guest', color: '#a3afba', bg: 'rgba(148, 163, 184, 0.12)' }
  };

  const currentBadge = roleBadgeConfig[role] || roleBadgeConfig.guest;

  const languageOrder = ['en', 'te', 'hi'];
  const languageLabels = { en: 'English', te: 'తెలుగు', hi: 'हिंदी' };
  const cycleLanguage = () => {
    const currentIndex = languageOrder.indexOf(lang);
    setLang(languageOrder[(currentIndex + 1) % languageOrder.length]);
  };

  return (
    <header>
      <div className="logo-box" onClick={() => setActiveTab('hero')} title="Return home" style={{ cursor: 'pointer' }}>
        <svg className="origami-logo" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <polygon points="12,48 55,18 42,62" fill="#85bdb6" />
          <polygon points="55,18 92,32 50,58" fill="#d1e2dc" />
          <polygon points="42,62 50,58 78,82" fill="#668f89" />
          <polygon points="26,68 42,62 38,88" fill="#9fcac0" />
          <circle cx="55" cy="18" r="3" fill="#e5f0eb" />
        </svg>
        <div className="logo">
          <span>UDAAN</span>
          <span className="logo-sub">Adaptive learning · Class 8</span>
        </div>
        <span className="badge-tag">MATHEMATICS</span>
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
            <span>{tab.label}</span>
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

        {/* User Session & Authentication Control */}
        {currentUser ? (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <span
              style={{
                fontSize: '0.8rem',
                padding: '5px 10px',
                borderRadius: '7px',
                border: `1px solid ${currentBadge.color}55`,
                backgroundColor: currentBadge.bg,
                color: currentBadge.color,
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}
              title={`${currentUser.full_name} (${currentUser.email})`}
            >
              <span>{currentBadge.label}</span>
              <span style={{ color: '#f8fafc', fontWeight: 'normal', maxWidth: '110px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {(currentUser.full_name || currentUser.email || 'User').split(' ')[0]}
              </span>
            </span>
            <button
              className="sec header-logout"
              onClick={onLogout}
              title="Secure Logout (Session Revocation)"
              style={{ fontSize: '0.78rem', padding: '6px 10px' }}
            >
              Logout
            </button>
          </div>
        ) : (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <button
              onClick={onOpenParentOnboarding}
              title="Parent or guardian registration help"
              className="sec header-parent"
            >
              Parent / Guardian
            </button>
            <button
              className="pri header-signin"
              onClick={onOpenAuth}
              style={{ fontSize: '0.82rem', padding: '7px 13px' }}
            >
              Sign in
            </button>
          </div>
        )}

        <button
          onClick={cycleLanguage}
          title={`Change language: ${languageLabels[lang] || 'English'} → ${languageLabels[languageOrder[(languageOrder.indexOf(lang) + 1) % languageOrder.length]]}`}
          aria-label={`Change language. Current language: ${languageLabels[lang] || 'English'}`}
          className="language-button"
          style={{ fontSize: '0.82rem' }}
        >
          🌐 {languageLabels[lang] || 'English'}
        </button>
      </div>
    </header>
  );
}
