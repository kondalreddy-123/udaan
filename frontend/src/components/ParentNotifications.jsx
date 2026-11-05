import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';

const LOCALES = { te: 'te-IN', en: 'en-IN', hi: 'hi-IN' };

/**
 * Accessible parent notification centre (Phase 4).
 * Large controls, explicit read/unread state, and optional text-to-speech.
 */
export default function ParentNotifications({ lang = 'en', t, onOpenMessage }) {
  const tr = (key) => (typeof t === 'function' ? t(key) : key);
  const locale = LOCALES[lang] || 'en-IN';

  const [items, setItems] = useState([]);
  const [prefs, setPrefs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showPrefs, setShowPrefs] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [speakingId, setSpeakingId] = useState(null);
  const [unreadOnly, setUnreadOnly] = useState(false);

  const voiceSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const unreadCount = useMemo(() => items.filter((n) => !n.is_read).length, [items]);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [notifications, preferences] = await Promise.all([
        api.getParentNotifications(unreadOnly),
        api.getParentNotificationPreferences(),
      ]);
      setItems(Array.isArray(notifications) ? notifications : []);
      setPrefs(preferences || null);
    } catch (err) {
      setError(err.message || tr('notificationsLoadError'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreadOnly]);

  useEffect(() => () => {
    if (voiceSupported) window.speechSynthesis.cancel();
  }, [voiceSupported]);

  const stopSpeaking = () => {
    if (voiceSupported) window.speechSynthesis.cancel();
    setSpeakingId(null);
  };

  const speak = (item) => {
    if (!voiceSupported) {
      setNotice(tr('voiceUnsupported'));
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(`${item.title}. ${item.body}`);
    utterance.lang = LOCALES[item.language] || locale;
    utterance.rate = 0.92;
    utterance.onend = () => setSpeakingId(null);
    utterance.onerror = () => setSpeakingId(null);
    setSpeakingId(item.id);
    window.speechSynthesis.speak(utterance);
  };

  const markRead = async (item) => {
    if (item.is_read) return;
    setError('');
    try {
      const updated = await api.markParentNotificationRead(item.id);
      setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, ...updated } : n)));
    } catch (err) {
      setError(err.message || tr('notificationUpdateError'));
    }
  };

  const markAllRead = async () => {
    setError('');
    try {
      await api.markAllParentNotificationsRead();
      setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setNotice(tr('allMarkedRead'));
    } catch (err) {
      setError(err.message || tr('notificationUpdateError'));
    }
  };

  const savePrefs = async () => {
    if (!prefs) return;
    setSavingPrefs(true);
    setError('');
    try {
      const updated = await api.updateParentNotificationPreferences({
        notifications_consent: prefs.notifications_consent,
        notify_in_app: prefs.notify_in_app,
        notify_email: prefs.notify_email,
        notify_voice: prefs.notify_voice,
      });
      setPrefs(updated);
      setNotice(tr('preferencesSaved'));
    } catch (err) {
      setError(err.message || tr('preferencesSaveError'));
    } finally {
      setSavingPrefs(false);
    }
  };

  const togglePref = (key) => {
    setPrefs((prev) => {
      if (!prev) return prev;
      const next = { ...prev, [key]: !prev[key] };
      if (key === 'notifications_consent' && !next.notifications_consent) {
        next.notify_in_app = false;
        next.notify_email = false;
        next.notify_voice = false;
      }
      return next;
    });
  };

  return (
    <section className="po-panel pn-panel" aria-labelledby="pn-title">
      <div className="po-profile-head">
        <div>
          <h2 id="pn-title" className="po-title" style={{ fontSize: '1.35rem' }}>
            🔔 {tr('notificationsTitle')}
          </h2>
          <p className="po-sub">{tr('notificationsIntro')}</p>
        </div>
        <span className={`po-status ${unreadCount ? 'pending' : 'ok'}`}>
          {unreadCount ? `${unreadCount} ${tr('unread')}` : tr('allRead')}
        </span>
      </div>

      <div className="pn-toolbar">
        <label className="pn-check">
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={(e) => setUnreadOnly(e.target.checked)}
          />
          <span>{tr('onlyUnread')}</span>
        </label>
        <button type="button" className="sec pn-btn" onClick={load} disabled={loading}>
          {loading ? tr('loading') : `↻ ${tr('refresh')}`}
        </button>
        <button type="button" className="sec pn-btn" onClick={markAllRead} disabled={!unreadCount}>
          ✓ {tr('markAllRead')}
        </button>
        <button
          type="button"
          className="sec pn-btn"
          onClick={() => setShowPrefs((v) => !v)}
          aria-expanded={showPrefs}
          aria-controls="pn-preferences"
        >
          ⚙️ {tr('notificationPrefs')}
        </button>
      </div>

      {notice && (
        <div className="po-banner" role="status" aria-live="polite">
          {notice}
        </div>
      )}
      {error && (
        <div className="po-banner" role="alert" style={{ borderColor: '#f87171', color: '#fecdd3' }}>
          ⚠️ {error}
        </div>
      )}

      {showPrefs && prefs && (
        <div id="pn-preferences" className="pn-prefs" role="group" aria-label={tr('notificationPrefs')}>
          <h3 className="po-block-title">⚙️ {tr('notificationPrefs')}</h3>
          <label className="pn-check pn-check-lg">
            <input
              type="checkbox"
              checked={Boolean(prefs.notifications_consent)}
              onChange={() => togglePref('notifications_consent')}
            />
            <span>{tr('notifyConsent')}</span>
          </label>
          <div className="pn-check pn-check-lg pn-fixed" role="note">
            <span aria-hidden="true">✅</span>
            <span>
              {tr('notifyInApp')}
              <small className="pn-hint">{tr('inAppAlwaysOn')}</small>
            </span>
          </div>
          <label className="pn-check pn-check-lg">
            <input
              type="checkbox"
              checked={Boolean(prefs.notify_email)}
              onChange={() => togglePref('notify_email')}
              disabled={!prefs.notifications_consent || !prefs.email_notifications_available}
            />
            <span>
              {tr('notifyEmail')}
              {!prefs.email_notifications_available && (
                <small className="pn-hint">{tr('emailNotConfigured')}</small>
              )}
            </span>
          </label>
          <label className="pn-check pn-check-lg">
            <input
              type="checkbox"
              checked={Boolean(prefs.notify_voice)}
              onChange={() => togglePref('notify_voice')}
              disabled={!prefs.notifications_consent}
            />
            <span>{tr('notifyVoice')}</span>
          </label>
          <button type="button" className="po-primary" onClick={savePrefs} disabled={savingPrefs}>
            {savingPrefs ? tr('saving') : `💾 ${tr('savePreferences')}`}
          </button>
        </div>
      )}

      {loading ? (
        <p className="po-sub" role="status">{tr('loading')}</p>
      ) : items.length === 0 ? (
        <div className="pn-empty" role="status">
          <div className="pn-empty-icon" aria-hidden="true">🌱</div>
          <p>{tr('noNotifications')}</p>
          <p className="po-small">{tr('noNotificationsHelp')}</p>
        </div>
      ) : (
        <ul className="pn-list" aria-live="polite">
          {items.map((item) => (
            <li key={item.id} className={`pn-item ${item.is_read ? '' : 'unread'}`}>
              <div className="pn-item-head">
                <b>{item.title}</b>
                {!item.is_read && <span className="pn-dot">{tr('newLabel')}</span>}
              </div>
              <p>{item.body}</p>
              <div className="pn-meta">
                <span>{item.student_name}</span>
                <span aria-hidden="true">·</span>
                <span>{new Date(item.created_at).toLocaleDateString(locale)}</span>
                {item.email_status === 'not_configured' && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{tr('emailNotConfiguredShort')}</span>
                  </>
                )}
              </div>
              <div className="pn-actions">
                <button
                  type="button"
                  className="sec pn-btn"
                  onClick={() => (speakingId === item.id ? stopSpeaking() : speak(item))}
                  aria-label={`${speakingId === item.id ? tr('stop') : tr('listen')}: ${item.title}`}
                >
                  {speakingId === item.id ? `⏹ ${tr('stop')}` : `🔊 ${tr('listen')}`}
                </button>
                {!item.is_read && (
                  <button type="button" className="sec pn-btn" onClick={() => markRead(item)}>
                    ✓ {tr('markRead')}
                  </button>
                )}
                {item.message_id && typeof onOpenMessage === 'function' && (
                  <button
                    type="button"
                    className="pri pn-btn"
                    onClick={() => {
                      markRead(item);
                      onOpenMessage(item.message_id);
                    }}
                  >
                    ✉️ {tr('openMessage')}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {!voiceSupported && (
        <p className="po-small" role="note">🔈 {tr('voiceUnsupported')}</p>
      )}
    </section>
  );
}
