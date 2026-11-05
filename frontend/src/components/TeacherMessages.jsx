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
 * Teacher inbox for verified parent conversations (Phase 4).
 *
 * The backend scopes every thread to students the teacher may manage and to
 * still-verified guardian links; this component only filters for convenience.
 */
export default function TeacherMessages({ lang = 'en', t, onUnreadChange, studentId = null, embedded = false }) {
  const tr = (key) => (typeof t === 'function' ? t(key) : key);

  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);

  const [openId, setOpenId] = useState(null);
  const [thread, setThread] = useState(null);
  const [threadLoading, setThreadLoading] = useState(false);

  const [replyBody, setReplyBody] = useState('');
  const [recommendedActivity, setRecommendedActivity] = useState('');
  const [meetingRequested, setMeetingRequested] = useState(false);
  const [replying, setReplying] = useState(false);

  const [resolveOpen, setResolveOpen] = useState(false);
  const [resolutionNote, setResolutionNote] = useState('');
  const [resolving, setResolving] = useState(false);

  const [composeOpen, setComposeOpen] = useState(false);
  const [guardianLinks, setGuardianLinks] = useState([]);
  const [linksLoading, setLinksLoading] = useState(false);
  const [composing, setComposing] = useState(false);
  const [compose, setCompose] = useState({
    student_id: '',
    parent_id: '',
    category: 'general',
    subject: '',
    body: '',
    recommended_activity: '',
    meeting_requested: false,
  });

  const unreadCount = useMemo(
    () => messages.filter((message) => message.is_unread).length,
    [messages]
  );

  const visibleMessages = useMemo(() => {
    let rows = messages;
    if (statusFilter) rows = rows.filter((message) => message.status === statusFilter);
    if (categoryFilter) rows = rows.filter((message) => message.category === categoryFilter);
    if (unreadOnly) rows = rows.filter((message) => message.is_unread);
    return rows;
  }, [messages, statusFilter, categoryFilter, unreadOnly]);

  useEffect(() => {
    if (typeof onUnreadChange === 'function') onUnreadChange(unreadCount);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreadCount]);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const list = await api.getTeacherMessages(null, false, studentId);
      const rows = Array.isArray(list) ? list : [];
      setMessages(rows);
      if (rows.length > 0) {
        const toOpen = openId && rows.some((m) => m.id === openId) ? openId : rows[0].id;
        openMessage(toOpen);
      } else {
        setOpenId(null);
        setThread(null);
      }
    } catch (err) {
      setError(err.message || tr('messagesLoadError'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  const loadGuardians = async () => {
    setLinksLoading(true);
    try {
      const links = await api.getTeacherParentLinks('verified');
      setGuardianLinks(Array.isArray(links) ? links : []);
    } catch (err) {
      setError(err.message || tr('messagesLoadError'));
    } finally {
      setLinksLoading(false);
    }
  };

  const openCompose = async () => {
    setComposeOpen(true);
    setError('');
    setNotice('');
    if (studentId) {
      setCompose((value) => ({ ...value, student_id: String(studentId) }));
    }
    if (guardianLinks.length === 0) await loadGuardians();
  };

  const composeLinks = useMemo(() => {
    if (!studentId) return guardianLinks;
    return guardianLinks.filter((link) => link.student_id === studentId);
  }, [guardianLinks, studentId]);

  const studentOptions = useMemo(() => {
    const map = new Map();
    composeLinks.forEach((link) => {
      if (!map.has(link.student_id)) map.set(link.student_id, link.student_name);
    });
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [composeLinks]);

  const parentOptions = useMemo(
    () => composeLinks.filter((link) => String(link.student_id) === String(compose.student_id)),
    [composeLinks, compose.student_id]
  );

  useEffect(() => {
    if (!composeOpen || !studentId || guardianLinks.length === 0) return;
    const link = guardianLinks.find((item) => item.student_id === studentId);
    if (link) {
      setCompose((value) => ({
        ...value,
        student_id: String(studentId),
        parent_id: String(link.parent_id),
      }));
    }
  }, [composeOpen, studentId, guardianLinks]);

  const chooseComposeStudent = (value) => {
    const options = guardianLinks.filter((link) => String(link.student_id) === String(value));
    setCompose((current) => ({
      ...current,
      student_id: value,
      parent_id: options.length === 1 ? String(options[0].parent_id) : '',
    }));
  };

  const sendCompose = async (event) => {
    event.preventDefault();
    if (!compose.student_id || !compose.subject.trim() || !compose.body.trim()) {
      setError(tr('tmComposeRequired'));
      return;
    }
    if (!compose.parent_id) {
      setError(tr('tmComposeParentRequired'));
      return;
    }
    setComposing(true);
    setError('');
    setNotice('');
    try {
      const created = await api.startTeacherMessage({
        student_id: Number(compose.student_id),
        parent_id: Number(compose.parent_id),
        category: compose.category,
        subject: compose.subject.trim(),
        body: compose.body.trim(),
        recommended_activity: compose.recommended_activity.trim() || null,
        meeting_requested: compose.meeting_requested,
      });
      setMessages((prev) => [created, ...prev.filter((item) => item.id !== created.id)]);
      setComposeOpen(false);
      setCompose({
        student_id: studentId ? String(studentId) : '',
        parent_id: '',
        category: 'general',
        subject: '',
        body: '',
        recommended_activity: '',
        meeting_requested: false,
      });
      await openMessage(created.id);
      setNotice(tr('tmComposeSent'));
    } catch (err) {
      setError(err.message || tr('tmComposeError'));
    } finally {
      setComposing(false);
    }
  };

  const openMessage = async (id) => {
    setOpenId(id);
    setThread(null);
    setThreadLoading(true);
    setError('');
    setNotice('');
    setReplyBody('');
    setRecommendedActivity('');
    setMeetingRequested(false);
    setResolveOpen(false);
    setResolutionNote('');
    try {
      const detail = await api.getTeacherMessage(id);
      setThread(detail);
      setMessages((prev) =>
        prev.map((item) =>
          item.id === detail.id
            ? { ...item, is_unread: false, teacher_read_at: detail.teacher_read_at }
            : item
        )
      );
    } catch (err) {
      setError(err.message || tr('messagesLoadError'));
    } finally {
      setThreadLoading(false);
    }
  };

  const replaceThread = (updated) => {
    setThread(updated);
    setMessages((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
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
      const updated = await api.replyTeacherMessage(thread.id, {
        body: replyBody.trim(),
        recommended_activity: recommendedActivity.trim() || null,
        meeting_requested: meetingRequested,
      });
      replaceThread(updated);
      setReplyBody('');
      setRecommendedActivity('');
      setMeetingRequested(false);
      setNotice(tr('msgReplySent'));
    } catch (err) {
      setError(err.message || tr('msgReplyError'));
    } finally {
      setReplying(false);
    }
  };

  const resolveThread = async (event) => {
    event.preventDefault();
    if (!thread) return;
    setResolving(true);
    setError('');
    setNotice('');
    try {
      const updated = await api.resolveTeacherMessage(thread.id, {
        resolution_note: resolutionNote.trim() || null,
      });
      replaceThread(updated);
      setResolveOpen(false);
      setResolutionNote('');
      setNotice(tr('msgResolved'));
    } catch (err) {
      setError(err.message || tr('msgResolveError'));
    } finally {
      setResolving(false);
    }
  };

  return (
    <section className={`${embedded ? '' : 'card '}tm-panel`} aria-labelledby="tm-title">
      <div className="tm-head">
        <div>
          <h2 id="tm-title" style={{ margin: 0, fontSize: embedded ? '1.05rem' : undefined }}>
            ✉️ {tr('teacherMessagesTitle')}
          </h2>
          <p className="mu" style={{ margin: '4px 0 0', fontSize: '0.88rem' }}>
            {tr('teacherMessagesIntro')}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="pri tm-btn"
            onClick={openCompose}
            aria-expanded={composeOpen}
            aria-controls="tm-compose"
          >
            ✚ {tr('tmComposeNew')}
          </button>
          <span className={`tag ${unreadCount ? 'warn' : 'good'}`}>
            {unreadCount ? `${unreadCount} ${tr('unread')}` : tr('allRead')}
          </span>
        </div>
      </div>

      <div className="tm-toolbar">
        <label className="tm-filter">
          <span>{tr('msgFilterStatus')}</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="">{tr('msgAllStatuses')}</option>
            <option value="open">{tr('msgStatus_open')}</option>
            <option value="replied">{tr('msgStatus_replied')}</option>
            <option value="resolved">{tr('msgStatus_resolved')}</option>
          </select>
        </label>
        <label className="tm-filter">
          <span>{tr('msgFilterCategory')}</span>
          <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
            <option value="">{tr('msgAllCategories')}</option>
            {CATEGORIES.map((value) => (
              <option key={value} value={value}>{tr(categoryKey(value))}</option>
            ))}
          </select>
        </label>
        <label className="pn-check">
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={(event) => setUnreadOnly(event.target.checked)}
          />
          <span>{tr('onlyUnread')}</span>
        </label>
        <button type="button" className="sec tm-btn" onClick={load} disabled={loading}>
          {loading ? tr('loading') : `↻ ${tr('refresh')}`}
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

      {composeOpen && (
        <form id="tm-compose" className="tm-compose" onSubmit={sendCompose}>
          <div className="tm-compose-head">
            <h3 style={{ margin: 0, fontSize: embedded ? '1rem' : '1.1rem' }}>✚ {tr('tmComposeTitle')}</h3>
            <p className="mu" style={{ margin: '4px 0 0', fontSize: '0.84rem' }}>{tr('tmComposeIntro')}</p>
          </div>

          {linksLoading ? (
            <p className="mu" role="status">{tr('loading')}</p>
          ) : studentOptions.length === 0 ? (
            <div className="pn-empty" role="status">
              <div className="pn-empty-icon" aria-hidden="true">👨‍👩‍👧</div>
              <p>{tr('tmComposeNoGuardians')}</p>
            </div>
          ) : (
            <>
              <div className="tm-compose-grid">
                <label className="po-field">
                  <span>{tr('tmComposeStudent')}</span>
                  <select
                    value={compose.student_id}
                    onChange={(event) => chooseComposeStudent(event.target.value)}
                    disabled={Boolean(studentId)}
                  >
                    <option value="">{tr('tmComposeChooseStudent')}</option>
                    {studentOptions.map((option) => (
                      <option key={option.id} value={option.id}>{option.name}</option>
                    ))}
                  </select>
                </label>
                <label className="po-field">
                  <span>{tr('tmComposeParent')}</span>
                  <select
                    value={compose.parent_id}
                    onChange={(event) => setCompose((value) => ({ ...value, parent_id: event.target.value }))}
                  >
                    <option value="">—</option>
                    {parentOptions.map((link) => (
                      <option key={link.parent_id} value={link.parent_id}>{link.parent_name}</option>
                    ))}
                  </select>
                </label>
                <label className="po-field">
                  <span>{tr('tmComposeCategory')}</span>
                  <select
                    value={compose.category}
                    onChange={(event) => setCompose((value) => ({ ...value, category: event.target.value }))}
                  >
                    {CATEGORIES.map((value) => (
                      <option key={value} value={value}>{tr(categoryKey(value))}</option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="po-field">
                <span>{tr('tmComposeSubject')}</span>
                <input
                  type="text"
                  value={compose.subject}
                  maxLength={150}
                  onChange={(event) => setCompose((value) => ({ ...value, subject: event.target.value }))}
                  placeholder={tr('tmComposeSubjectPlaceholder')}
                />
              </label>
              <label className="po-field">
                <span>{tr('tmComposeBody')}</span>
                <textarea
                  rows={4}
                  value={compose.body}
                  maxLength={4000}
                  onChange={(event) => setCompose((value) => ({ ...value, body: event.target.value }))}
                  placeholder={tr('tmComposeBodyPlaceholder')}
                />
              </label>
              <label className="po-field">
                <span>{tr('msgRecommendedActivity')}</span>
                <input
                  type="text"
                  value={compose.recommended_activity}
                  maxLength={500}
                  onChange={(event) => setCompose((value) => ({ ...value, recommended_activity: event.target.value }))}
                  placeholder={tr('msgRecommendedPlaceholder')}
                />
              </label>
              <label className="pn-check">
                <input
                  type="checkbox"
                  checked={compose.meeting_requested}
                  onChange={(event) => setCompose((value) => ({ ...value, meeting_requested: event.target.checked }))}
                />
                <span>{tr('msgRequestMeeting')}</span>
              </label>
              <div className="tm-form-actions">
                <button type="submit" className="pri" disabled={composing}>
                  {composing ? tr('tmComposeSending') : `📨 ${tr('tmComposeSend')}`}
                </button>
                <button type="button" className="sec tm-btn" onClick={() => setComposeOpen(false)}>
                  {tr('tmComposeCancel')}
                </button>
              </div>
            </>
          )}
        </form>
      )}

      <div className="tm-layout">
        <div className="tm-list-wrap">
          {loading ? (
            <p className="mu" role="status">{tr('loading')}</p>
          ) : visibleMessages.length === 0 ? (
            <div className="pn-empty" role="status">
              <div className="pn-empty-icon" aria-hidden="true">📭</div>
              <p>{tr('teacherMsgEmpty')}</p>
              <p className="po-small">{tr('teacherMsgEmptyHelp')}</p>
            </div>
          ) : (
            <ul className="tm-list" aria-live="polite">
              {visibleMessages.map((message) => (
                <li key={message.id}>
                  <button
                    type="button"
                    className={`tm-thread-btn ${openId === message.id ? 'on' : ''} ${message.is_unread ? 'unread' : ''}`}
                    onClick={() => openMessage(message.id)}
                    aria-current={openId === message.id ? 'true' : undefined}
                  >
                    <span className="tm-thread-top">
                      <b>{message.subject}</b>
                      {message.is_unread && <span className="pn-dot">{tr('newLabel')}</span>}
                    </span>
                    <span className="tm-thread-meta">
                      {message.student_name} · {message.parent_name}
                    </span>
                    <span className="tm-thread-meta">
                      {tr(categoryKey(message.category))} · {tr(statusKey(message.status))} ·{' '}
                      {formatWhen(message.last_activity_at, lang)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="tm-detail" aria-live="polite">
          {threadLoading && <p className="mu" role="status">{tr('loading')}</p>}
          {!threadLoading && !thread && (
            <div className="pn-empty" role="status">
              <div className="pn-empty-icon" aria-hidden="true">👈</div>
              <p>{tr('teacherMsgSelect')}</p>
            </div>
          )}
          {!threadLoading && thread && (
            <article className="tm-thread" aria-labelledby="tm-thread-title">
              <header className="tm-thread-head">
                <h3 id="tm-thread-title">{thread.subject}</h3>
                <div className="tm-thread-badges">
                  <span className="tag">{tr(categoryKey(thread.category))}</span>
                  <span className={`tag ${thread.status === 'resolved' ? 'good' : ''}`}>
                    {tr(statusKey(thread.status))}
                  </span>
                </div>
                <p className="po-small">
                  {thread.student_name} · {thread.parent_name} · {formatWhen(thread.created_at, lang)}
                </p>
              </header>

              <div className={`pm-bubble ${thread.initiated_by_role === 'teacher' ? 'teacher' : 'parent'}`}>
                <div className="pm-bubble-head">
                  <b>{thread.initiated_by_role === 'teacher' ? thread.teacher_name : thread.parent_name}</b>
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
                <form className="tm-reply" onSubmit={sendReply}>
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
                  <label className="po-field">
                    <span>{tr('msgRecommendedActivity')}</span>
                    <input
                      type="text"
                      value={recommendedActivity}
                      maxLength={500}
                      onChange={(event) => setRecommendedActivity(event.target.value)}
                      placeholder={tr('msgRecommendedPlaceholder')}
                    />
                  </label>
                  <label className="pn-check">
                    <input
                      type="checkbox"
                      checked={meetingRequested}
                      onChange={(event) => setMeetingRequested(event.target.checked)}
                    />
                    <span>{tr('msgRequestMeeting')}</span>
                  </label>
                  <div className="tm-form-actions">
                    <button type="submit" className="pri" disabled={replying}>
                      {replying ? tr('sending') : `📨 ${tr('msgReplySend')}`}
                    </button>
                    <button
                      type="button"
                      className="sec tm-btn"
                      onClick={() => setResolveOpen((value) => !value)}
                      aria-expanded={resolveOpen}
                      aria-controls="tm-resolve"
                    >
                      ✓ {tr('msgResolve')}
                    </button>
                  </div>

                  {resolveOpen && (
                    <div id="tm-resolve" className="tm-resolve">
                      <label className="po-field">
                        <span>{tr('msgResolutionNote')}</span>
                        <textarea
                          rows={2}
                          value={resolutionNote}
                          maxLength={1000}
                          onChange={(event) => setResolutionNote(event.target.value)}
                          placeholder={tr('msgResolutionPlaceholder')}
                        />
                      </label>
                      <button type="button" className="pri" onClick={resolveThread} disabled={resolving}>
                        {resolving ? tr('saving') : `✓ ${tr('msgResolveConfirm')}`}
                      </button>
                    </div>
                  )}
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
