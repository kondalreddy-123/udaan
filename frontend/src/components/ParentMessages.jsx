import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';

const LOCALES = { te: 'te-IN', en: 'en-IN', hi: 'hi-IN' };

const CATEGORIES = [
  'question',
  'learning_difficulty',
  'support_request',
  'meeting_request',
  'general',
];

function categoryKey(category) {
  return `msgCategory_${category}`;
}

function statusKey(status) {
  return `msgStatus_${status}`;
}

function formatWhen(value, lang) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(LOCALES[lang] || 'en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Parent ↔ teacher messages (Phase 4).
 *
 * Only verified children are offered. The backend independently re-checks the
 * verified relationship and routes to the child's assigned class teacher, so
 * this UI never decides authorization on its own.
 */
export default function ParentMessages({ lang = 'en', t, profile = null, initialMessageId = null, onConsumedInitial, embedded = false }) {
  const tr = (key) => (typeof t === 'function' ? t(key) : key);

  const [children, setChildren] = useState([]);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [composeOpen, setComposeOpen] = useState(false);
  const [studentId, setStudentId] = useState('');
  const [category, setCategory] = useState('question');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  const [openId, setOpenId] = useState(null);
  const [thread, setThread] = useState(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [replyMeeting, setReplyMeeting] = useState(false);
  const [replying, setReplying] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [assignedTeacher, setAssignedTeacher] = useState(null);
  const [teacherLoading, setTeacherLoading] = useState(false);

  const verifiedChildren = useMemo(
    () => (children || []).filter((child) => child.verification_status === 'verified'),
    [children]
  );

  const unreadCount = useMemo(
    () => messages.filter((message) => message.is_unread).length,
    [messages]
  );

  const visibleMessages = useMemo(
    () => (unreadOnly ? messages.filter((message) => message.is_unread) : messages),
    [messages, unreadOnly]
  );

  const loadChildren = async () => {
    if (profile && Array.isArray(profile.linked_children)) {
      setChildren(profile.linked_children);
      const firstVerified = profile.linked_children.find(
        (child) => child.verification_status === 'verified'
      );
      if (firstVerified && !studentId) setStudentId(String(firstVerified.student_id));
      return;
    }
    const me = await api.getParentMe();
    setChildren(me?.linked_children || []);
    const firstVerified = (me?.linked_children || []).find(
      (child) => child.verification_status === 'verified'
    );
    if (firstVerified && !studentId) setStudentId(String(firstVerified.student_id));
  };

  const loadMessages = async () => {
    const list = await api.getParentMessages();
    setMessages(Array.isArray(list) ? list : []);
    return list;
  };

  const openMessage = async (id) => {
    setOpenId(id);
    setThread(null);
    setReplyBody('');
    setReplyMeeting(false);
    setThreadLoading(true);
    setError('');
    try {
      const detail = await api.getParentMessage(id);
      setThread(detail);
      // Reading refreshes the unread badge.
      setMessages((prev) =>
        prev.map((item) =>
          item.id === detail.id
            ? { ...item, is_unread: false, parent_read_at: detail.parent_read_at }
            : item
        )
      );
    } catch (err) {
      setError(err.message || tr('messagesLoadError'));
    } finally {
      setThreadLoading(false);
    }
  };

  const bootstrap = async () => {
    setLoading(true);
    setError('');
    try {
      await Promise.all([loadChildren(), loadMessages()]);
    } catch (err) {
      setError(err.message || tr('messagesLoadError'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Show the teacher UDAAN has assigned to the selected child. The backend
  // resolves this from the verified relationship; the UI never guesses it.
  useEffect(() => {
    if (!studentId) {
      setAssignedTeacher(null);
      return undefined;
    }
    let cancelled = false;
    setTeacherLoading(true);
    api.getChildAssignedTeacher(studentId)
      .then((data) => {
        if (!cancelled) setAssignedTeacher(data);
      })
      .catch(() => {
        if (!cancelled) setAssignedTeacher(null);
      })
      .finally(() => {
        if (!cancelled) setTeacherLoading(false);
      });
    return () => { cancelled = true; };
  }, [studentId]);

  // Deep link from a teacher-reply notification.
  useEffect(() => {
    if (!initialMessageId) return;
    openMessage(initialMessageId);
    if (typeof onConsumedInitial === 'function') onConsumedInitial();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMessageId]);

  const sendMessage = async (event) => {
    event.preventDefault();
    setError('');
    setNotice('');
    if (!studentId) {
      setError(tr('msgChooseChild'));
      return;
    }
    if (subject.trim().length < 2) {
      setError(tr('msgSubjectRequired'));
      return;
    }
    if (body.trim().length < 2) {
      setError(tr('msgBodyRequired'));
      return;
    }

    setSending(true);
    try {
      const created = await api.createParentMessage({
        student_id: Number(studentId),
        category,
        subject: subject.trim(),
        body: body.trim(),
      });
      setMessages((prev) => [created, ...prev]);
      setSubject('');
      setBody('');
      setCategory('question');
      setComposeOpen(false);
      setNotice(tr('msgSent'));
      openMessage(created.id);
    } catch (err) {
      setError(err.message || tr('msgSendError'));
    } finally {
      setSending(false);
    }
  };

  const sendReply = async (event) => {
    event.preventDefault();
    if (!thread) return;
    if (!replyBody.trim()) {
      setError(tr('msgReplyRequired'));
      return;
    }
    setReplying(true);
    setError('');
    setNotice('');
    try {
      const updated = await api.replyParentMessage(thread.id, {
        body: replyBody.trim(),
        meeting_requested: replyMeeting,
      });
      setThread(updated);
      setReplyBody('');
      setReplyMeeting(false);
      setMessages((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setNotice(tr('msgReplySent'));
    } catch (err) {
      setError(err.message || tr('msgReplyError'));
    } finally {
      setReplying(false);
    }
  };

  return (
    <section className={`${embedded ? '' : 'po-panel '}pm-panel`} aria-labelledby="pm-title">
      <div className="po-profile-head">
        <div>
          <h2 id="pm-title" className="po-title" style={{ fontSize: embedded ? '1.15rem' : '1.35rem' }}>
            ✉️ {tr('messagesTitle')}
          </h2>
          <p className="po-sub">{tr('messagesIntro')}</p>
        </div>
        <span className={`po-status ${unreadCount ? 'pending' : 'ok'}`}>
          {unreadCount ? `${unreadCount} ${tr('unread')}` : tr('allRead')}
        </span>
      </div>

      <div className="pm-toolbar">
        <button
          type="button"
          className="po-primary pm-btn"
          onClick={() => setComposeOpen((value) => !value)}
          aria-expanded={composeOpen}
          aria-controls="pm-compose"
          disabled={verifiedChildren.length === 0}
        >
          ✏️ {tr('msgNew')}
        </button>
        <label className="pn-check">
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={(event) => setUnreadOnly(event.target.checked)}
          />
          <span>{tr('onlyUnread')}</span>
        </label>
        <button
          type="button"
          className="sec pm-btn"
          onClick={bootstrap}
          disabled={loading}
        >
          {loading ? tr('loading') : `↻ ${tr('refresh')}`}
        </button>
      </div>

      {verifiedChildren.length === 0 && (
        <div className="po-banner" role="note">
          🔒 {tr('msgNeedsVerifiedChild')}
        </div>
      )}

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

      {composeOpen && verifiedChildren.length > 0 && (
        <form id="pm-compose" className="pm-compose" onSubmit={sendMessage}>
          <h3 className="po-block-title">📝 {tr('msgComposeTitle')}</h3>

          <label className="po-field">
            <span>{tr('msgChild')}</span>
            <select
              value={studentId}
              onChange={(event) => setStudentId(event.target.value)}
              required
            >
              {verifiedChildren.map((child) => (
                <option key={child.link_id} value={child.student_id}>
                  {child.student_name} · {child.class_name}
                </option>
              ))}
            </select>
          </label>

          <div className="pc-card" style={{ margin: '10px 0', padding: '10px 12px' }} role="note">
            <div className="po-small" style={{ color: '#94a3b8' }}>
              👩‍🏫 {tr('msgAssignedTeacher')}
            </div>
            {teacherLoading ? (
              <div className="po-small">{tr('loading')}</div>
            ) : assignedTeacher?.teacher_name ? (
              <>
                <div style={{ fontWeight: 600, color: '#f1f5f9' }}>{assignedTeacher.teacher_name}</div>
                <div className="po-small" style={{ color: '#6ee7b7' }}>
                  {assignedTeacher.class_name}
                  {assignedTeacher.teacher_email ? ` · ${assignedTeacher.teacher_email}` : ''}
                </div>
              </>
            ) : (
              <div className="po-small" style={{ color: '#fbbf24' }}>
                {tr('msgNoAssignedTeacher')}
              </div>
            )}
          </div>

          <label className="po-field">
            <span>{tr('msgCategory')}</span>
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              {CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {tr(categoryKey(value))}
                </option>
              ))}
            </select>
          </label>

          <label className="po-field">
            <span>{tr('msgSubject')}</span>
            <input
              type="text"
              value={subject}
              maxLength={150}
              onChange={(event) => setSubject(event.target.value)}
              placeholder={tr('msgSubjectPlaceholder')}
              required
            />
          </label>

          <label className="po-field">
            <span>{tr('msgBody')}</span>
            <textarea
              rows={4}
              value={body}
              maxLength={4000}
              onChange={(event) => setBody(event.target.value)}
              placeholder={tr('msgBodyPlaceholder')}
              required
            />
          </label>

          <div className="pm-form-actions">
            <button type="submit" className="po-primary" disabled={sending}>
              {sending ? tr('sending') : `📨 ${tr('msgSend')}`}
            </button>
            <button
              type="button"
              className="sec pm-btn"
              onClick={() => setComposeOpen(false)}
              disabled={sending}
            >
              ✕ {tr('cancel')}
            </button>
          </div>
        </form>
      )}

      <div className="pm-layout">
        <div className="pm-list-wrap">
          <h3 className="po-block-title">📥 {tr('msgThreads')}</h3>
          {loading ? (
            <p className="po-sub" role="status">{tr('loading')}</p>
          ) : visibleMessages.length === 0 ? (
            <div className="pn-empty" role="status">
              <div className="pn-empty-icon" aria-hidden="true">💬</div>
              <p>{unreadOnly ? tr('msgNoUnread') : tr('msgEmpty')}</p>
              <p className="po-small">{tr('msgEmptyHelp')}</p>
            </div>
          ) : (
            <ul className="pm-list" aria-live="polite">
              {visibleMessages.map((message) => (
                <li key={message.id}>
                  <button
                    type="button"
                    className={`pm-thread-btn ${openId === message.id ? 'on' : ''} ${message.is_unread ? 'unread' : ''}`}
                    onClick={() => openMessage(message.id)}
                    aria-current={openId === message.id ? 'true' : undefined}
                  >
                    <span className="pm-thread-top">
                      <b>{message.subject}</b>
                      {message.is_unread && <span className="pn-dot">{tr('newLabel')}</span>}
                    </span>
                    <span className="pm-thread-meta">
                      {tr(categoryKey(message.category))} · {message.student_name}
                    </span>
                    <span className="pm-thread-meta">
                      {formatWhen(message.last_activity_at, lang)} · {tr(statusKey(message.status))}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="pm-detail" aria-live="polite">
          {threadLoading && <p className="po-sub" role="status">{tr('loading')}</p>}
          {!threadLoading && !thread && (
            <div className="pn-empty" role="status">
              <div className="pn-empty-icon" aria-hidden="true">👈</div>
              <p>{tr('msgSelectThread')}</p>
            </div>
          )}
          {!threadLoading && thread && (
            <article className="pm-thread" aria-labelledby="pm-thread-title">
              <header className="pm-thread-head">
                <h3 id="pm-thread-title">{thread.subject}</h3>
                <div className="pm-thread-badges">
                  <span className="tag">{tr(categoryKey(thread.category))}</span>
                  <span className={`tag ${thread.status === 'resolved' ? 'good' : ''}`}>
                    {tr(statusKey(thread.status))}
                  </span>
                </div>
                <p className="po-small">
                  {thread.student_name} · {thread.teacher_name} · {formatWhen(thread.created_at, lang)}
                </p>
              </header>

              <div className="pm-bubble parent">
                <div className="pm-bubble-head">
                  <b>{thread.parent_name}</b>
                  <span className="po-small">{formatWhen(thread.created_at, lang)}</span>
                </div>
                <p>{thread.body}</p>
              </div>

              {thread.replies.map((reply) => (
                <div key={reply.id} className={`pm-bubble ${reply.author_role}`}>
                  <div className="pm-bubble-head">
                    <b>{reply.author_name}</b>
                    <span className="po-small">{formatWhen(reply.created_at, lang)}</span>
                  </div>
                  <p>{reply.body}</p>
                  {reply.recommended_activity && (
                    <div className="pm-activity" role="note">
                      <b>📚 {tr('msgRecommendedActivity')}:</b> {reply.recommended_activity}
                    </div>
                  )}
                  {reply.meeting_requested && (
                    <div className="pm-meeting" role="note">
                      🤝 {tr('msgMeetingRequested')}
                    </div>
                  )}
                </div>
              ))}

              {thread.status !== 'resolved' ? (
                <form className="pm-reply" onSubmit={sendReply}>
                  <label className="po-field">
                    <span>{tr('msgReplyLabel')}</span>
                    <textarea
                      rows={3}
                      value={replyBody}
                      maxLength={4000}
                      onChange={(event) => setReplyBody(event.target.value)}
                      placeholder={tr('msgReplyPlaceholder')}
                    />
                  </label>
                  <label className="pn-check">
                    <input
                      type="checkbox"
                      checked={replyMeeting}
                      onChange={(event) => setReplyMeeting(event.target.checked)}
                    />
                    <span>{tr('msgRequestMeeting')}</span>
                  </label>
                  <button type="submit" className="po-primary" disabled={replying}>
                    {replying ? tr('sending') : `📨 ${tr('msgReplySend')}`}
                  </button>
                </form>
              ) : (
                <div className="po-banner" role="status">
                  ✓ {tr('msgResolvedNote')}
                </div>
              )}
            </article>
          )}
        </div>
      </div>
    </section>
  );
}
