import React, { useEffect, useRef, useState } from 'react';
import { api, setToken } from '../services/api';
import ParentNotifications from './ParentNotifications';
import ParentMessages from './ParentMessages';
import ParentConnect from './ParentConnect';

const LANGUAGES = [
  { id: 'te', label: 'తెలుగు', sub: 'Telugu' },
  { id: 'en', label: 'English', sub: 'English' },
  { id: 'hi', label: 'हिंदी', sub: 'Hindi' },
];

const LOCALES = { te: 'te-IN', en: 'en-IN', hi: 'hi-IN' };

const YES_WORDS = {
  te: ['అవును', 'ఔను', 'అవును ', 'yes', 'yeah'],
  en: ['yes', 'yeah', 'yep', 'ok', 'okay', 'sure'],
  hi: ['हाँ', 'हां', 'जी', 'जी हाँ', 'yes', 'haan', 'han'],
};

const NO_WORDS = {
  te: ['కాదు', 'లేదు', 'no', 'nope'],
  en: ['no', 'nope', 'not now', 'never'],
  hi: ['नहीं', 'ना', 'no', 'nahi', 'nahin'],
};

function parseYesNo(text, language) {
  const value = (text || '').toLowerCase().trim();
  if (!value) return null;
  if ((YES_WORDS[language] || []).some((word) => value.includes(word))) return true;
  if ((NO_WORDS[language] || []).some((word) => value.includes(word))) return false;
  return null;
}

function statusLabel(status, tr) {
  if (status === 'verified') return tr('verifiedStatus');
  if (status === 'rejected') return tr('rejectedStatus');
  if (status === 'revoked') return tr('revokedStatus');
  return tr('pendingVerification');
}

export default function ParentOnboarding({
  isOpen = false,
  mode = 'onboarding',
  onClose,
  onAuthSuccess,
  lang = 'en',
  setLang,
  t,
}) {
  const tr = (key) => (typeof t === 'function' ? t(key) : key);
  const isProfileMode = mode === 'profile';

  const [step, setStep] = useState('choose');
  const [language, setLanguage] = useState(lang || 'te');
  const [code, setCode] = useState('');
  const [validated, setValidated] = useState(null);
  const [form, setForm] = useState({
    parent_name: '',
    email: '',
    password: '',
    phone_number: '',
    relationship_type: 'parent',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [success, setSuccess] = useState(null);
  const [successVerified, setSuccessVerified] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceNotice, setVoiceNotice] = useState('');
  const [profile, setProfile] = useState(null);
  const [profileForm, setProfileForm] = useState({
    full_name: '',
    preferred_language: lang || 'te',
    contact_method: 'in_app',
    phone_number: '',
    notification_preference: 'not_configured',
  });
  const [profileNotice, setProfileNotice] = useState('');
  const [profileTab, setProfileTab] = useState('home'); // 'home' | 'reports' | 'notifications' | 'messages'
  const [focusMessageId, setFocusMessageId] = useState(null);

  const dialogRef = useRef(null);
  const recognitionRef = useRef(null);

  const speechSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const recognitionSupported =
    typeof window !== 'undefined' &&
    Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);

  // Keep the selected language in sync with the app-level language.
  useEffect(() => {
    if (isProfileMode) return;
    setLanguage(lang || 'te');
  }, [lang, isProfileMode]);

  // Load profile data when the parent profile panel is shown.
  useEffect(() => {
    if (!isProfileMode) return;
    let cancelled = false;
    api
      .getParentMe()
      .then((data) => {
        if (cancelled) return;
        setProfile(data);
        if (data.preferred_language && typeof setLang === 'function') {
          setLang(data.preferred_language);
        }
        setProfileForm({
          full_name: data.full_name || '',
          preferred_language: data.preferred_language || 'te',
          contact_method: data.contact_method || 'in_app',
          phone_number: data.phone_number || '',
          notification_preference: data.notification_preference || 'not_configured',
        });
      })
      .catch((err) => {
        if (!cancelled) setProfileNotice(err.message || 'Could not load your profile.');
      });
    return () => {
      cancelled = true;
    };
  }, [isProfileMode]);

  // Focus the dialog and support Escape to close.
  useEffect(() => {
    if (!isOpen && !isProfileMode) return undefined;
    const timer = window.setTimeout(() => dialogRef.current?.focus(), 40);
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && isOpen && onClose) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, isProfileMode, onClose]);

  // Always stop speech/recognition when the panel closes or unmounts.
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (e) {
          // ignore
        }
      }
    };
  }, []);

  const applyLanguage = (next) => {
    setLanguage(next);
    setProfileForm((prev) => ({ ...prev, preferred_language: next }));
    if (typeof setLang === 'function') setLang(next);
  };

  const stopSpeaking = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setSpeaking(false);
  };

  const speak = (text) => {
    if (!speechSupported) {
      setVoiceNotice(tr('voiceUnsupported'));
      return;
    }
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = LOCALES[language] || 'en-IN';
      utterance.rate = 0.86;
      utterance.pitch = 1;
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);
      window.speechSynthesis.speak(utterance);
      setSpeaking(true);
    } catch (e) {
      setVoiceNotice(tr('voiceUnsupported'));
      setSpeaking(false);
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch (e) {
        // ignore
      }
    }
    setListening(false);
  };

  const listenForYesNo = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceNotice(tr('voiceUnsupported'));
      return;
    }
    stopListening();
    try {
      const recognition = new SpeechRecognition();
      recognition.lang = LOCALES[language] || 'en-IN';
      recognition.interimResults = false;
      recognition.maxAlternatives = 3;
      recognition.continuous = false;
      recognition.onresult = (event) => {
        let heard = '';
        for (let i = 0; i < event.results.length; i += 1) {
          heard += ` ${event.results[i][0].transcript}`;
        }
        const answer = parseYesNo(heard, language);
        setListening(false);
        if (answer === true) {
          setVoiceNotice('');
          setStep('invite');
          speak(tr('enterCodeHint'));
        } else if (answer === false) {
          setVoiceNotice('');
          speak(tr('voiceNoTeacher'));
        } else {
          setVoiceNotice(tr('voiceNotHeard'));
        }
      };
      recognition.onerror = () => {
        setListening(false);
        setVoiceNotice(tr('voiceNotHeard'));
      };
      recognition.onend = () => setListening(false);
      recognitionRef.current = recognition;
      recognition.start();
      setListening(true);
      setVoiceNotice(tr('voiceListening'));
    } catch (e) {
      setListening(false);
      setVoiceNotice(tr('voiceUnsupported'));
    }
  };

  const openVoice = () => {
    setError('');
    setVoiceNotice('');
    setStep('voice');
    if (!recognitionSupported) {
      setVoiceNotice(tr('voiceUnsupported'));
    }
    speak(`${tr('voiceWelcome')} ${tr('haveCodeQuestion')}`);
  };

  const validateCode = async () => {
    setError('');
    setNotice('');
    if (!code.trim()) {
      setError(tr('codeInvalid'));
      return;
    }
    setLoading(true);
    try {
      const data = await api.validateParentInvitation(code.trim());
      setValidated(data);
      const preferred = data.preferred_language || language;
      applyLanguage(preferred);
      setForm((prev) => ({ ...prev, relationship_type: 'parent' }));
      setNotice(`${tr('codeValid')}: ${data.student_first_name} · ${data.class_name}`);
      if (voiceNotice) speak(`${tr('codeValid')}. ${tr('parentDetails')}`);
    } catch (err) {
      setValidated(null);
      setError(err.message || tr('codeInvalid'));
    } finally {
      setLoading(false);
    }
  };

  const submitRegistration = async (event) => {
    event.preventDefault();
    setError('');
    setNotice('');
    if (!validated) {
      setError(tr('codeInvalid'));
      return;
    }
    if (!form.parent_name.trim()) {
      setError(tr('parentName'));
      return;
    }
    if (!form.email.trim() || !form.email.includes('@')) {
      setError(tr('email'));
      return;
    }
    if (!form.password || form.password.length < 6) {
      setError(tr('password'));
      return;
    }
    setLoading(true);
    try {
      const res = await api.registerParentWithInvitation({
        invitation_code: code.trim(),
        parent_name: form.parent_name.trim(),
        email: form.email.trim(),
        password: form.password,
        phone_number: form.phone_number.trim() || null,
        preferred_language: language,
        relationship_type: form.relationship_type,
      });
      setToken(res.access_token);
      setSuccess(res.user);
      setStep('success');
      if (typeof onAuthSuccess === 'function') onAuthSuccess(res.user, res.access_token);

      // Teacher-assisted setup codes create an already-verified link. Tell the
      // parent the truth instead of always saying "waiting for verification".
      let verified = false;
      try {
        const profile = await api.getParentMe();
        verified = (profile?.linked_children || []).some(
          (child) => child.verification_status === 'verified'
        );
      } catch (e) {
        // The success screen still works if this refresh fails.
      }
      setSuccessVerified(verified);
      speak(verified ? tr('successVerified') : tr('successPending'));
    } catch (err) {
      setError(err.message || tr('codeInvalid'));
    } finally {
      setLoading(false);
    }
  };

  const saveProfile = async () => {
    setProfileNotice('');
    setLoading(true);
    try {
      const updated = await api.updateParentProfile({
        full_name: profileForm.full_name,
        preferred_language: profileForm.preferred_language,
        contact_method: profileForm.contact_method,
        phone_number: profileForm.phone_number || null,
        notification_preference: profileForm.notification_preference,
      });
      setProfile(updated);
      applyLanguage(updated.preferred_language || profileForm.preferred_language);
      setProfileNotice(tr('saved'));
    } catch (err) {
      setProfileNotice(err.message || 'Could not save your profile.');
    } finally {
      setLoading(false);
    }
  };

  const resetToChoose = () => {
    stopSpeaking();
    stopListening();
    setStep('choose');
    setError('');
    setNotice('');
    setVoiceNotice('');
    setValidated(null);
    setCode('');
    setSuccess(null);
    setSuccessVerified(false);
  };

  const progressValue = step === 'choose' ? 1 : step === 'success' ? 3 : 2;

  // The parent profile panel is embedded as a tab (no modal).
  if (isProfileMode) {
    return (
      <section className="po-panel" aria-labelledby="po-profile-title">
        <div className="po-profile-head">
          <div>
            <h1 id="po-profile-title" className="po-title" style={{ fontSize: '1.6rem' }}>
              👨‍👩‍👧 {tr('profileTitle')}
            </h1>
            <p className="po-sub">{tr('parentIntro')}</p>
          </div>
          {profile && (
            <span className={`po-status ${profile.is_verified ? 'ok' : 'pending'}`}>
              {profile.is_verified ? `✓ ${tr('contactVerified')}` : tr('notVerified')}
            </span>
          )}
        </div>

        <nav className="po-tabs" role="tablist" aria-label={tr('parentTabsLabel')}>
          <button
            type="button"
            role="tab"
            id="po-tab-home"
            aria-selected={profileTab === 'home'}
            aria-controls="po-tabpanel-home"
            className={`po-tab ${profileTab === 'home' ? 'on' : ''}`}
            onClick={() => setProfileTab('home')}
          >
            🏠 {tr('parentTabHome')}
          </button>
          <button
            type="button"
            role="tab"
            id="po-tab-notifications"
            aria-selected={profileTab === 'notifications'}
            aria-controls="po-tabpanel-notifications"
            className={`po-tab ${profileTab === 'notifications' ? 'on' : ''}`}
            onClick={() => setProfileTab('notifications')}
          >
            🔔 {tr('notificationsTitle')}
          </button>
          <button
            type="button"
            role="tab"
            id="po-tab-messages"
            aria-selected={profileTab === 'messages'}
            aria-controls="po-tabpanel-messages"
            className={`po-tab ${profileTab === 'messages' ? 'on' : ''}`}
            onClick={() => setProfileTab('messages')}
          >
            ✉️ {tr('messagesTitle')}
          </button>
          <button
            type="button"
            role="tab"
            id="po-tab-reports"
            aria-selected={profileTab === 'reports'}
            aria-controls="po-tabpanel-reports"
            className={`po-tab ${profileTab === 'reports' ? 'on' : ''}`}
            onClick={() => setProfileTab('reports')}
          >
            📊 {tr('pcTabLabel')}
          </button>
        </nav>

        {profileNotice && profileTab === 'home' && (
          <div className="po-banner" role="status">
            {profileNotice}
          </div>
        )}

        {profileTab === 'home' && (
          <div
            className="po-grid"
            id="po-tabpanel-home"
            role="tabpanel"
            aria-labelledby="po-tab-home"
            tabIndex={0}
          >
            <div className="po-block">
              <h2 className="po-block-title">🗣️ {tr('chooseLanguage')}</h2>
              <div className="po-lang-row">
                {LANGUAGES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`po-lang ${profileForm.preferred_language === item.id ? 'on' : ''}`}
                    aria-pressed={profileForm.preferred_language === item.id}
                    onClick={() => applyLanguage(item.id)}
                  >
                    <span className="po-lang-native">{item.label}</span>
                    <span className="po-lang-sub">{item.sub}</span>
                  </button>
                ))}
              </div>

              <label className="po-field">
                <span>{tr('parentName')}</span>
                <input
                  type="text"
                  value={profileForm.full_name}
                  onChange={(e) => setProfileForm((prev) => ({ ...prev, full_name: e.target.value }))}
                  autoComplete="name"
                />
              </label>

              <label className="po-field">
                <span>{tr('phone')}</span>
                <input
                  type="tel"
                  value={profileForm.phone_number}
                  onChange={(e) => setProfileForm((prev) => ({ ...prev, phone_number: e.target.value }))}
                  autoComplete="tel"
                />
              </label>

              <label className="po-field">
                <span>{tr('contactMethod')}</span>
                <select
                  value={profileForm.contact_method}
                  onChange={(e) => setProfileForm((prev) => ({ ...prev, contact_method: e.target.value }))}
                >
                  <option value="in_app">UDAAN app</option>
                  <option value="sms">SMS</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="phone_call">Phone call</option>
                  <option value="school_record">School records</option>
                </select>
              </label>

              <div className="po-field">
                <span>{tr('notificationsTitle')}</span>
                <button
                  type="button"
                  className="sec pm-btn"
                  onClick={() => setProfileTab('notifications')}
                >
                  🔔 {tr('openNotifications')}
                </button>
              </div>

              <button type="button" className="po-primary" onClick={saveProfile} disabled={loading}>
                {loading ? tr('creating') : `💾 ${tr('saveChanges')}`}
              </button>
            </div>

            <div className="po-block">
              <h2 className="po-block-title">👶 {tr('childrenTitle')}</h2>
              {!profile || !profile.linked_children || profile.linked_children.length === 0 ? (
                <p className="po-sub">{tr('noChildren')}</p>
              ) : (
                <ul className="po-child-list">
                  {profile.linked_children.map((child) => (
                    <li key={child.link_id} className="po-child">
                      <div>
                        <b>{child.student_name}</b>
                        <div className="po-small">
                          {child.class_name} · {child.relationship_type}
                        </div>
                      </div>
                      <span className={`po-status ${child.verification_status === 'verified' ? 'ok' : 'pending'}`}>
                        {statusLabel(child.verification_status, tr)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {profile && (
                <button
                  type="button"
                  className="po-primary"
                  style={{ marginTop: '14px' }}
                  onClick={() => setProfileTab('messages')}
                >
                  ✉️ {tr('talkToTeacher')}
                </button>
              )}

              <div className="po-privacy" role="note">
                🔒 {tr('invitationPrivacyNote')}
              </div>
            </div>
          </div>
        )}

        {profileTab === 'notifications' && (
          <div
            id="po-tabpanel-notifications"
            role="tabpanel"
            aria-labelledby="po-tab-notifications"
            tabIndex={0}
          >
            <ParentNotifications
              lang={lang}
              t={t}
              onOpenMessage={(messageId) => {
                setFocusMessageId(messageId);
                setProfileTab('messages');
              }}
            />
          </div>
        )}

        {profileTab === 'messages' && (
          <div
            id="po-tabpanel-messages"
            role="tabpanel"
            aria-labelledby="po-tab-messages"
            tabIndex={0}
          >
            <ParentMessages
              lang={lang}
              t={t}
              profile={profile}
              initialMessageId={focusMessageId}
              onConsumedInitial={() => setFocusMessageId(null)}
            />
          </div>
        )}

        {profileTab === 'reports' && (
          <div
            id="po-tabpanel-reports"
            role="tabpanel"
            aria-labelledby="po-tab-reports"
            tabIndex={0}
          >
            <ParentConnect lang={lang} t={t} profile={profile} />
          </div>
        )}
      </section>
    );
  }

  if (!isOpen) return null;

  return (
    <div className="po-backdrop" role="presentation" onMouseDown={(e) => {
      if (e.target === e.currentTarget && onClose) onClose();
    }}>
      <div
        className="po-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="po-title"
        aria-describedby="po-desc"
        tabIndex={-1}
        ref={dialogRef}
      >
        <div className="po-topbar">
          <div>
            <div className="po-brand">✈️ UDAAN</div>
            <h1 id="po-title" className="po-title">
              {tr('parentWelcome')}
            </h1>
            <p id="po-desc" className="po-sub">
              {tr('parentIntro')}
            </p>
          </div>
          {onClose && (
            <button type="button" className="po-close" onClick={onClose} aria-label={tr('close')}>
              ✕
            </button>
          )}
        </div>

        <div className="po-progress" role="progressbar" aria-valuemin={1} aria-valuemax={3} aria-valuenow={progressValue} aria-label={`${tr('step')} ${progressValue} ${tr('of')} 3`}>
          <i style={{ width: `${(progressValue / 3) * 100}%` }} />
        </div>
        <div className="po-step-label">
          {tr('step')} {progressValue} {tr('of')} 3
        </div>

        <div className="po-live" aria-live="polite">
          {voiceNotice}
        </div>

        {error && (
          <div className="po-banner error" role="alert">
            ⚠️ {error}
          </div>
        )}
        {notice && !error && (
          <div className="po-banner ok" role="status">
            ✓ {notice}
          </div>
        )}

        {step === 'choose' && (
          <div className="po-options" aria-label={tr('chooseHow')}>
            <h2 className="po-question">{tr('chooseHow')}</h2>

            <button type="button" className="po-option" onClick={() => { setError(''); setStep('teacher'); }}>
              <span className="po-option-icon" aria-hidden="true">👨‍🏫</span>
              <span className="po-option-text">
                <b>{tr('teacherHelp')}</b>
                <small>{tr('teacherHelpDesc')}</small>
              </span>
              <span className="po-option-arrow" aria-hidden="true">›</span>
            </button>

            <button type="button" className="po-option" onClick={() => { setError(''); setStep('invite'); }}>
              <span className="po-option-icon" aria-hidden="true">🔑</span>
              <span className="po-option-text">
                <b>{tr('inviteCode')}</b>
                <small>{tr('inviteCodeDesc')}</small>
              </span>
              <span className="po-option-arrow" aria-hidden="true">›</span>
            </button>

            <button type="button" className="po-option" onClick={openVoice}>
              <span className="po-option-icon" aria-hidden="true">🎙️</span>
              <span className="po-option-text">
                <b>{tr('voiceHelp')}</b>
                <small>{tr('voiceHelpDesc')}</small>
              </span>
              <span className="po-option-arrow" aria-hidden="true">›</span>
            </button>

            <p className="po-privacy">🔒 {tr('invitationPrivacyNote')}</p>
          </div>
        )}

        {step === 'teacher' && (
          <div className="po-body">
            <h2 className="po-question">👨‍🏫 {tr('teacherAssistedTitle')}</h2>
            <p className="po-steps">{tr('teacherAssistedSteps')}</p>
            <p className="po-note">ℹ️ {tr('teacherAssistedNote')}</p>
            <div className="po-actions">
              <button type="button" className="po-secondary" onClick={resetToChoose}>
                ← {tr('back')}
              </button>
              <button type="button" className="po-primary" onClick={onClose}>
                {tr('continue')} →
              </button>
            </div>
          </div>
        )}

        {step === 'voice' && (
          <div className="po-body">
            <h2 className="po-question">🎙️ {tr('haveCodeQuestion')}</h2>
            <p className="po-note">{tr('haveCodeHint')}</p>

            <div className="po-lang-row" style={{ marginBottom: '14px' }}>
              {LANGUAGES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`po-lang ${language === item.id ? 'on' : ''}`}
                  aria-pressed={language === item.id}
                  onClick={() => {
                    applyLanguage(item.id);
                    speak(`${tr('haveCodeQuestion')} ${tr('haveCodeHint')}`);
                  }}
                >
                  <span className="po-lang-native">{item.label}</span>
                  <span className="po-lang-sub">{item.sub}</span>
                </button>
              ))}
            </div>

            <div className="po-voice-card">
              <button
                type="button"
                className={`po-mic ${listening ? 'listening' : ''}`}
                onClick={listenForYesNo}
                aria-label={tr('voiceMic')}
                aria-pressed={listening}
              >
                <span aria-hidden="true">{listening ? '🎙️' : '🎤'}</span>
                <span className="po-mic-label">{listening ? tr('listening') : tr('voiceMic')}</span>
              </button>

              <div className="po-voice-controls">
                <button type="button" className="po-secondary" onClick={() => speak(`${tr('voiceWelcome')} ${tr('haveCodeQuestion')}`)}>
                  🔊 {tr('listen')}
                </button>
                <button type="button" className="po-secondary" onClick={() => speak(tr('haveCodeQuestion'))}>
                  🔁 {tr('replay')}
                </button>
                <button type="button" className="po-secondary" onClick={() => { stopSpeaking(); stopListening(); }}>
                  ⏹ {tr('stop')}
                </button>
              </div>
              {speaking && <div className="po-small" role="status">🔊 {tr('listen')}…</div>}
            </div>

            <div className="po-yesno" role="group" aria-label={tr('haveCodeQuestion')}>
              <button type="button" className="po-yes" onClick={() => { setVoiceNotice(''); setStep('invite'); speak(tr('enterCodeHint')); }}>
                <span aria-hidden="true">👍</span> {tr('yes')}
              </button>
              <button type="button" className="po-no" onClick={() => { setVoiceNotice(''); speak(tr('voiceNoTeacher')); }}>
                <span aria-hidden="true">👎</span> {tr('no')}
              </button>
            </div>

            <p className="po-note">
              {recognitionSupported ? `🎧 ${tr('haveCodeHint')}` : `ℹ️ ${tr('voiceUnsupported')}`}
            </p>

            <div className="po-actions">
              <button type="button" className="po-secondary" onClick={resetToChoose}>
                ← {tr('back')}
              </button>
              <button type="button" className="po-secondary" onClick={() => setStep('teacher')}>
                👨‍🏫 {tr('teacherHelp')}
              </button>
            </div>
          </div>
        )}

        {step === 'invite' && (
          <div className="po-body">
            <h2 className="po-question">🔑 {validated ? tr('parentDetails') : tr('enterCodeTitle')}</h2>

            {!validated ? (
              <>
                <p className="po-note">{tr('enterCodeHint')}</p>
                <label className="po-field">
                  <span>{tr('enterCodeTitle')}</span>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="UD-ABCD1234"
                    autoComplete="one-time-code"
                    inputMode="text"
                    aria-describedby="po-code-hint"
                    style={{ fontSize: '1.4rem', letterSpacing: '0.12em', textTransform: 'uppercase' }}
                  />
                </label>
                <p id="po-code-hint" className="po-small">{tr('enterCodeHint')}</p>
                <button type="button" className="po-primary" onClick={validateCode} disabled={loading}>
                  {loading ? '…' : `🔎 ${tr('checkCode')}`}
                </button>
              </>
            ) : (
              <>
                <div className="po-child-found" role="status">
                  <span aria-hidden="true">🧒</span>
                  <div>
                    <b>{validated.student_first_name}</b>
                    <div className="po-small">{validated.class_name} · {tr('child')}</div>
                  </div>
                </div>

                <div className="po-lang-row" style={{ marginBottom: '14px' }}>
                  {LANGUAGES.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`po-lang ${language === item.id ? 'on' : ''}`}
                      aria-pressed={language === item.id}
                      onClick={() => applyLanguage(item.id)}
                    >
                      <span className="po-lang-native">{item.label}</span>
                      <span className="po-lang-sub">{item.sub}</span>
                    </button>
                  ))}
                </div>

                <form onSubmit={submitRegistration}>
                  <label className="po-field">
                    <span>{tr('parentName')} *</span>
                    <input
                      type="text"
                      required
                      value={form.parent_name}
                      onChange={(e) => setForm((prev) => ({ ...prev, parent_name: e.target.value }))}
                      autoComplete="name"
                    />
                  </label>

                  <label className="po-field">
                    <span>{tr('email')} *</span>
                    <input
                      type="email"
                      required
                      value={form.email}
                      onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                      autoComplete="email"
                    />
                  </label>

                  <label className="po-field">
                    <span>{tr('password')} *</span>
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={form.password}
                      onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                      autoComplete="new-password"
                    />
                  </label>

                  <label className="po-field">
                    <span>{tr('phone')}</span>
                    <input
                      type="tel"
                      value={form.phone_number}
                      onChange={(e) => setForm((prev) => ({ ...prev, phone_number: e.target.value }))}
                      autoComplete="tel"
                    />
                  </label>

                  <label className="po-field">
                    <span>{tr('child')} · {tr('parentRole')}</span>
                    <select
                      value={form.relationship_type}
                      onChange={(e) => setForm((prev) => ({ ...prev, relationship_type: e.target.value }))}
                    >
                      <option value="mother">Mother</option>
                      <option value="father">Father</option>
                      <option value="guardian">Guardian</option>
                      <option value="parent">Parent</option>
                    </select>
                  </label>

                  <p className="po-privacy">🔒 {tr('invitationPrivacyNote')}</p>

                  <div className="po-actions">
                    <button type="button" className="po-secondary" onClick={() => { setValidated(null); setError(''); }}>
                      ← {tr('back')}
                    </button>
                    <button type="submit" className="po-primary" disabled={loading}>
                      {loading ? `⏳ ${tr('creating')}` : `✓ ${tr('createAccount')}`}
                    </button>
                  </div>
                </form>
              </>
            )}

            {!validated && (
              <div className="po-actions">
                <button type="button" className="po-secondary" onClick={resetToChoose}>
                  ← {tr('back')}
                </button>
                <button type="button" className="po-secondary" onClick={() => setStep('teacher')}>
                  👨‍🏫 {tr('teacherHelp')}
                </button>
              </div>
            )}
          </div>
        )}

        {step === 'success' && (
          <div className="po-body po-success">
            <div className="po-success-icon" aria-hidden="true">✅</div>
            <h2 className="po-question">{tr('successPendingTitle')}</h2>
            <p className="po-steps">
              {successVerified ? tr('successVerified') : tr('successPending')}
            </p>
            <div className="po-actions" style={{ justifyContent: 'center' }}>
              <button type="button" className="po-primary" onClick={onClose}>
                {tr('continue')} →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
