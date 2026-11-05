import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import WeeklyReportView from './WeeklyReportView';
import ParentMessages from './ParentMessages';

const LANGUAGES = [
  { id: 'te', label: 'తెలుగు' },
  { id: 'en', label: 'English' },
  { id: 'hi', label: 'हिंदी' },
];

const RELATIONSHIPS = [
  { id: 'parent', key: 'pcRelationshipParent' },
  { id: 'mother', key: 'pcRelationshipMother' },
  { id: 'father', key: 'pcRelationshipFather' },
  { id: 'guardian', key: 'pcRelationshipGuardian' },
];

/**
 * ParentConnect tab (Phase 5).
 *
 * Parents register exactly one verified email or mobile contact, consent to
 * weekly reports, and browse the reports that were generated from real
 * learning activity. Delivery status is always shown honestly: when a
 * provider is not configured nothing is reported as sent.
 */
export default function ParentConnect({ lang = 'en', t, profile = null, mode = 'parent' }) {
  const isStudent = mode === 'student';
  const tr = (key, replacements) => {
    let text = typeof t === 'function' ? t(key) : key;
    if (replacements) {
      Object.keys(replacements).forEach((name) => {
        text = String(text).split(`{${name}}`).join(String(replacements[name]));
      });
    }
    return text;
  };

  const [prefs, setPrefs] = useState(null);
  const [status, setStatus] = useState(null);
  const [reports, setReports] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState(false);

  const [channel, setChannel] = useState('email');
  const [guardianName, setGuardianName] = useState('');
  const [relationship, setRelationship] = useState('parent');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [reportLanguage, setReportLanguage] = useState(lang);
  const [consent, setConsent] = useState(true);
  const [otp, setOtp] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [rotatedLink, setRotatedLink] = useState('');

  const [reportsEnabled, setReportsEnabled] = useState(true);
  const [consentPref, setConsentPref] = useState(true);
  const [prefLanguage, setPrefLanguage] = useState(lang);
  const [childId, setChildId] = useState('');

  // Student mode (Phase 5 bridge): manage ParentConnect for a verified link.
  const [studentOverview, setStudentOverview] = useState(null);
  const [studentParentId, setStudentParentId] = useState('');
  const [studentEditing, setStudentEditing] = useState(false);

  // ── New Phase 5: Parent self-service connect/disconnect, test report, email change ──
  const [connectCode, setConnectCode] = useState('');
  const [connectRelType, setConnectRelType] = useState('parent');
  const [connectBusy, setConnectBusy] = useState(false);
  const [connectError, setConnectError] = useState('');
  const [connectSuccess, setConnectSuccess] = useState('');
  const [showConnectForm, setShowConnectForm] = useState(false);
  const [connectedChildren, setConnectedChildren] = useState([]);
  const [childSearchQuery, setChildSearchQuery] = useState('');
  const [revocationOtpState, setRevocationOtpState] = useState({
    linkId: null,
    childName: '',
    otp: '',
    error: '',
    success: '',
    busy: false,
  });

  const [deliveryDay, setDeliveryDay] = useState('sunday');
  const [deliveryTime, setDeliveryTime] = useState('18:00');

  const [testReportBusy, setTestReportBusy] = useState(false);
  const [testReportResult, setTestReportResult] = useState(null);

  const [emailChangeBusy, setEmailChangeBusy] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailChangeOtp, setEmailChangeOtp] = useState('');
  const [emailChangeStep, setEmailChangeStep] = useState('idle'); // 'idle' | 'otp'
  const [emailChangeMsg, setEmailChangeMsg] = useState('');

  const contact = prefs?.contact || null;
  const hasDestination = Boolean(contact?.destination);
  const needsVerification = hasDestination && !contact?.is_verified;
  const showContactForm = editing || !hasDestination;

  const studentLinks = studentOverview?.links || [];
  const verifiedLinks = useMemo(
    () => studentLinks.filter((link) => link.can_manage),
    [studentLinks],
  );
  const activeLink = useMemo(
    () => verifiedLinks.find((link) => String(link.parent_id) === String(studentParentId)) || null,
    [verifiedLinks, studentParentId],
  );
  const studentContact = activeLink?.contact || null;
  const studentHasDestination = Boolean(studentContact?.destination);
  const studentNeedsVerification = studentHasDestination && !studentContact?.is_verified;
  const studentShowContactForm = studentEditing || !studentHasDestination;

  const verifiedChildren = useMemo(
    () => (profile?.linked_children || []).filter((child) => child.verification_status === 'verified'),
    [profile],
  );

  useEffect(() => {
    if (!childId && verifiedChildren.length > 0) {
      setChildId(String(verifiedChildren[0].student_id));
    }
  }, [verifiedChildren, childId]);

  useEffect(() => {
    if (prefs) {
      setReportsEnabled(Boolean(prefs.weekly_reports_enabled));
      setConsentPref(Boolean(prefs.notification_consent));
      setPrefLanguage(prefs.report_language || lang);
      if (prefs.delivery_day) setDeliveryDay(prefs.delivery_day);
      if (prefs.delivery_time) setDeliveryTime(prefs.delivery_time);
      if (!editing && !hasDestination) setReportLanguage(prefs.report_language || lang);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs]);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = window.setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const loadReports = async () => {
    const list = await api.getWeeklyReports();
    setReports(Array.isArray(list) ? list : []);
  };

  const loadPrefs = async () => {
    const data = await api.getParentConnectPreferences();
    setPrefs(data || null);
    return data;
  };

  const loadConnectedChildren = async () => {
    if (isStudent) return;
    try {
      const res = await api.getParentMyChild();
      setConnectedChildren(res?.children || []);
    } catch (err) {
      console.error('Failed to load connected children:', err);
    }
  };

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [preferences, list] = await Promise.all([
        api.getParentConnectPreferences(),
        api.getWeeklyReports(),
      ]);
      setPrefs(preferences || null);
      setReports(Array.isArray(list) ? list : []);
      try {
        setStatus(await api.getParentConnectStatus());
      } catch (statusErr) {
        setStatus(null);
      }
      await loadConnectedChildren();
    } catch (err) {
      setError(err.message || tr('pcLoadError'));
    } finally {
      setLoading(false);
    }
  };

  const syncStudentForm = (link) => {
    if (!link) return;
    const c = link.contact || {};
    setChannel(c.contact_type || 'email');
    setGuardianName(c.guardian_name || link.parent_name || '');
    setRelationship(c.relationship_type || link.relationship_type || 'parent');
    setEmail('');
    setPhone('');
    setReportLanguage(c.report_language || lang);
    setConsent(Boolean(c.notification_consent));
    setReportsEnabled(Boolean(c.weekly_reports_enabled));
    setConsentPref(Boolean(c.notification_consent));
    setPrefLanguage(c.report_language || lang);
  };

  const loadStudent = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const data = await api.getStudentParentConnectOverview();
      setStudentOverview(data || null);
      const manageable = (data?.links || []).filter((link) => link.can_manage);
      let nextId = studentParentId;
      if (!manageable.some((link) => String(link.parent_id) === String(nextId))) {
        nextId = manageable.length ? String(manageable[0].parent_id) : '';
        setStudentParentId(nextId);
      }
      const selected = manageable.find((link) => String(link.parent_id) === String(nextId));
      if (selected && !studentEditing) syncStudentForm(selected);
    } catch (err) {
      setError(err.message || tr('pcLoadError'));
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    if (isStudent) loadStudent();
    else load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStudent]);

  const startEditing = () => {
    setChannel(contact?.contact_type || 'email');
    setGuardianName(contact?.guardian_name || '');
    setRelationship(contact?.relationship_type || 'parent');
    setEmail('');
    setPhone('');
    setReportLanguage(prefs?.report_language || lang);
    setConsent(Boolean(contact?.notification_consent ?? true));
    setEditing(true);
    setError('');
    setNotice('');
  };

  const cancelEditing = () => {
    setEditing(false);
    setEmail('');
    setPhone('');
    setOtp('');
    setError('');
  };

  const saveContact = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const payload = {
        contact_type: channel,
        guardian_name: guardianName.trim() || undefined,
        relationship_type: relationship,
        notification_consent: Boolean(consent),
        weekly_reports_enabled: Boolean(consent),
        report_language: reportLanguage,
      };
      if (channel === 'email') payload.email = email.trim();
      else payload.phone = phone.trim();

      const result = await api.registerParentConnectContact(payload);
      await loadPrefs();
      await loadReports();

      if (result.otp_delivery_status === 'sent') {
        setNotice(tr('pcCodeSent'));
        setCooldown(60);
        setOtp('');
        setEditing(false);
      } else if (result.otp_delivery_status === 'not_configured') {
        setNotice(tr('pcNotConfigured'));
        setEditing(false);
      } else if (result.otp_delivery_status === 'failed') {
        setError(tr('pcDeliveryFailed'));
      } else if (result.is_verified) {
        setNotice(tr('pcAlreadyVerified'));
        setEditing(false);
      }
    } catch (err) {
      setError(err.message || tr('pcContactSaveError'));
    } finally {
      setBusy(false);
    }
  };

  const verifyContact = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api.verifyParentConnectContact(otp.trim());
      setOtp('');
      setCooldown(0);
      await loadPrefs();
      await loadReports();
      setNotice(tr('pcVerifySuccess'));
    } catch (err) {
      setError(err.message || tr('pcVerifyError'));
    } finally {
      setBusy(false);
    }
  };

  const resendOtp = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await api.resendParentConnectOtp();
      if (result.otp_delivery_status === 'sent') {
        setNotice(tr('pcCodeSent'));
        setCooldown(60);
      } else if (result.otp_delivery_status === 'not_configured') {
        setNotice(tr('pcNotConfigured'));
      } else {
        setError(tr('pcDeliveryFailed'));
      }
      await loadPrefs();
    } catch (err) {
      setError(err.message || tr('pcDeliveryFailed'));
    } finally {
      setBusy(false);
    }
  };

  const savePreferences = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const updated = await api.updateParentConnectPreferences({
        enabled: Boolean(reportsEnabled && consentPref),
        weekly_reports_enabled: Boolean(reportsEnabled),
        notification_consent: Boolean(consentPref),
        report_language: prefLanguage,
      });
      setPrefs(updated || null);
      setNotice(tr('pcPrefsSaved'));
    } catch (err) {
      setError(err.message || tr('pcPrefsSaveError'));
    } finally {
      setBusy(false);
    }
  };

  const selectStudentParent = (value) => {
    setStudentParentId(value);
    setStudentEditing(false);
    setOtp('');
    setError('');
    setNotice('');
    const link = verifiedLinks.find((item) => String(item.parent_id) === String(value));
    if (link) syncStudentForm(link);
  };

  const startStudentEditing = () => {
    if (!activeLink) return;
    syncStudentForm(activeLink);
    setStudentEditing(true);
    setError('');
    setNotice('');
  };

  const cancelStudentEditing = () => {
    setStudentEditing(false);
    setEmail('');
    setPhone('');
    setOtp('');
    setError('');
    if (activeLink) syncStudentForm(activeLink);
  };

  const saveStudentContact = async (event) => {
    event.preventDefault();
    if (!activeLink) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const payload = {
        parent_id: activeLink.parent_id,
        contact_type: channel,
        guardian_name: guardianName.trim() || undefined,
        relationship_type: relationship,
        notification_consent: Boolean(consent),
        weekly_reports_enabled: Boolean(consent),
        report_language: reportLanguage,
      };
      if (channel === 'email') payload.email = email.trim();
      else payload.phone = phone.trim();

      const result = await api.registerStudentParentConnectContact(payload);
      await loadStudent({ silent: true });

      if (result.otp_delivery_status === 'sent') {
        setNotice(tr('pcCodeSent'));
        setCooldown(60);
        setOtp('');
        setStudentEditing(false);
      } else if (result.otp_delivery_status === 'not_configured') {
        setNotice(tr('pcNotConfigured'));
        setStudentEditing(false);
      } else if (result.otp_delivery_status === 'failed') {
        setError(tr('pcDeliveryFailed'));
      } else if (result.is_verified) {
        setNotice(tr('pcAlreadyVerified'));
        setStudentEditing(false);
      }
    } catch (err) {
      setError(err.message || tr('pcContactSaveError'));
    } finally {
      setBusy(false);
    }
  };

  const verifyStudentContact = async (event) => {
    event.preventDefault();
    if (!activeLink) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api.verifyStudentParentConnectContact(activeLink.parent_id, otp.trim());
      setOtp('');
      setCooldown(0);
      await loadStudent({ silent: true });
      setNotice(tr('pcVerifySuccess'));
    } catch (err) {
      setError(err.message || tr('pcVerifyError'));
    } finally {
      setBusy(false);
    }
  };

  const resendStudentOtp = async () => {
    if (!activeLink) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await api.resendStudentParentConnectOtp(activeLink.parent_id);
      if (result.otp_delivery_status === 'sent') {
        setNotice(tr('pcCodeSent'));
        setCooldown(60);
      } else if (result.otp_delivery_status === 'not_configured') {
        setNotice(tr('pcNotConfigured'));
      } else {
        setError(tr('pcDeliveryFailed'));
      }
      await loadStudent({ silent: true });
    } catch (err) {
      setError(err.message || tr('pcDeliveryFailed'));
    } finally {
      setBusy(false);
    }
  };

  const saveStudentPreferences = async (event) => {
    event.preventDefault();
    if (!activeLink) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api.updateStudentParentConnectPreferences({
        parent_id: activeLink.parent_id,
        enabled: Boolean(reportsEnabled && consentPref),
        weekly_reports_enabled: Boolean(reportsEnabled),
        notification_consent: Boolean(consentPref),
        report_language: prefLanguage,
      });
      await loadStudent({ silent: true });
      setNotice(tr('pcPrefsSaved'));
    } catch (err) {
      setError(err.message || tr('pcPrefsSaveError'));
    } finally {
      setBusy(false);
    }
  };

  const generateLatest = async () => {
    if (!childId) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const detail = await api.generateWeeklyReport({
        student_id: Number(childId),
        deliver: true,
      });
      setSelected(detail);
      setRotatedLink('');
      if (detail.delivery_status === 'sent') setNotice(tr('pcReportSent'));
      else if (detail.delivery_status === 'not_configured') setNotice(tr('pcReportNotConfigured'));
      else setNotice(tr('pcReportGenerated'));
      await loadReports();
    } catch (err) {
      setError(err.message || tr('pcGenerateError'));
    } finally {
      setBusy(false);
    }
  };

  const openReport = async (reportId) => {
    setBusy(true);
    setError('');
    setNotice('');
    setRotatedLink('');
    try {
      const detail = await api.getWeeklyReport(reportId);
      setSelected(detail);
    } catch (err) {
      setError(err.message || tr('pcReportLoadError'));
    } finally {
      setBusy(false);
    }
  };

  const resendReport = async () => {
    if (!selected) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const detail = await api.resendWeeklyReport(selected.id);
      setSelected(detail);
      setNotice(tr('pcReportResent'));
      await loadReports();
    } catch (err) {
      setError(err.message || tr('pcGenerateError'));
    } finally {
      setBusy(false);
    }
  };

  const rotateLink = async () => {
    if (!selected) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await api.rotateWeeklyReportLink(selected.id);
      setSelected((prev) => ({
        ...prev,
        public_link_active: true,
        token_expires_at: result.expires_at,
      }));
      setRotatedLink(result.link || '');
      setNotice(tr('pcLinkRotated'));
    } catch (err) {
      setError(err.message || tr('pcGenerateError'));
    } finally {
      setBusy(false);
    }
  };

  const revokeLink = async () => {
    if (!selected) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api.revokeWeeklyReportLink(selected.id);
      setSelected((prev) => ({ ...prev, public_link_active: false }));
      setRotatedLink('');
      setNotice(tr('pcLinkRevoked'));
    } catch (err) {
      setError(err.message || tr('pcGenerateError'));
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    if (!rotatedLink) return;
    try {
      await navigator.clipboard.writeText(rotatedLink);
      setNotice(tr('pcLinkCopied'));
    } catch (err) {
      setError(rotatedLink);
    }
  };

  // Filtered children for Parent Connected Child Search (with strict parent isolation)
  const filteredChildren = useMemo(() => {
    if (!childSearchQuery.trim()) return connectedChildren;
    const q = childSearchQuery.toLowerCase().trim();
    return connectedChildren.filter((c) =>
      (c.full_name && c.full_name.toLowerCase().includes(q)) ||
      (String(c.student_id).includes(q)) ||
      (c.class_name && c.class_name.toLowerCase().includes(q)) ||
      (c.school_name && c.school_name.toLowerCase().includes(q)) ||
      (c.teacher_name && c.teacher_name.toLowerCase().includes(q))
    );
  }, [connectedChildren, childSearchQuery]);

  const handleConfirmRevocation = async (e, linkId) => {
    e.preventDefault();
    if (!revocationOtpState.otp || revocationOtpState.otp.trim().length < 6) {
      setRevocationOtpState((prev) => ({
        ...prev,
        error: 'Please enter the complete 6-digit OTP sent to your registered email.',
      }));
      return;
    }
    setRevocationOtpState((prev) => ({ ...prev, busy: true, error: '', success: '' }));
    try {
      const res = await api.confirmParentRevocation({
        link_id: linkId,
        otp: revocationOtpState.otp.trim(),
      });
      setRevocationOtpState({
        linkId: null,
        childName: '',
        otp: '',
        error: '',
        success: res.message || 'Access successfully revoked.',
        busy: false,
      });
      setNotice('Parental access has been revoked as confirmed.');
      await load();
      await loadConnectedChildren();
    } catch (err) {
      setRevocationOtpState((prev) => ({
        ...prev,
        busy: false,
        error: err.message || 'Verification failed. Please check the code and try again.',
      }));
    }
  };

  // ── New handlers: connect student by code, test report, email change ──
  const connectStudent = async (e) => {
    e.preventDefault();
    if (!connectCode.trim()) return setConnectError('Please enter a connection code.');
    setConnectBusy(true);
    setConnectError('');
    setConnectSuccess('');
    try {
      const res = await api.connectStudentByCode(connectCode.trim(), connectRelType);
      setConnectSuccess(res.message || 'Connection request sent! Waiting for student approval.');
      setConnectCode('');
      setShowConnectForm(false);
      await load();
    } catch (err) {
      setConnectError(err.message || 'Could not connect. Check the code and try again.');
    } finally {
      setConnectBusy(false);
    }
  };

  const disconnectChild = async (studentId, studentName) => {
    if (!window.confirm(`Remove connection with ${studentName}? This will stop weekly reports for this child.`)) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api.disconnectStudent(studentId);
      setNotice('Student disconnected successfully.');
      await load();
    } catch (err) {
      setError(err.message || 'Could not disconnect student.');
    } finally {
      setBusy(false);
    }
  };

  const sendTestReport = async () => {
    if (!childId) return setError('Please select a child first.');
    setTestReportBusy(true);
    setTestReportResult(null);
    setError('');
    setNotice('');
    try {
      const res = await api.sendTestReport(Number(childId));
      setTestReportResult(res);
      if (res.delivery_status === 'sent') setNotice('✅ Test report sent successfully!');
      else if (res.delivery_status === 'not_configured') setNotice('⚠️ Email provider not configured. Set RESEND_API_KEY in .env.');
      else setNotice(`Test report generated. Status: ${res.delivery_status}`);
    } catch (err) {
      setError(err.message || 'Could not send test report.');
    } finally {
      setTestReportBusy(false);
    }
  };

  const requestEmailChange = async (e) => {
    e.preventDefault();
    if (!newEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim()))
      return setEmailChangeMsg('Please enter a valid email address.');
    setEmailChangeBusy(true);
    setEmailChangeMsg('');
    try {
      await api.requestParentEmailChange(newEmail.trim());
      setEmailChangeMsg(`OTP sent to ${newEmail.trim()}. Enter it below to confirm.`);
      setEmailChangeStep('otp');
    } catch (err) {
      setEmailChangeMsg(err.message || 'Could not send OTP. Try again.');
    } finally {
      setEmailChangeBusy(false);
    }
  };

  const verifyEmailChange = async (e) => {
    e.preventDefault();
    if (emailChangeOtp.trim().length !== 6) return setEmailChangeMsg('Enter the 6-digit OTP.');
    setEmailChangeBusy(true);
    setEmailChangeMsg('');
    try {
      await api.verifyParentEmailChange(emailChangeOtp.trim());
      setEmailChangeMsg('✅ Email updated successfully!');
      setEmailChangeStep('idle');
      setNewEmail('');
      setEmailChangeOtp('');
      await load();
    } catch (err) {
      setEmailChangeMsg(err.message || 'OTP verification failed.');
    } finally {
      setEmailChangeBusy(false);
    }
  };

  const savePreferencesWithSchedule = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const updated = await api.updateParentConnectPreferences({
        enabled: Boolean(reportsEnabled && consentPref),
        weekly_reports_enabled: Boolean(reportsEnabled),
        notification_consent: Boolean(consentPref),
        report_language: prefLanguage,
        delivery_day: deliveryDay,
        delivery_time: deliveryTime,
      });
      setPrefs(updated || null);
      setNotice(tr('pcPrefsSaved'));
    } catch (err) {
      setError(err.message || tr('pcPrefsSaveError'));
    } finally {
      setBusy(false);
    }
  };

  const deliveryLabel = (value) => {
    const key = `pcDelivery_${value || 'pending'}`;
    const label = tr(key);
    return label === key ? value : label;
  };

  const channelConfigured =
    channel === 'sms' ? Boolean(status?.sms_configured) : Boolean(status?.email_configured);
  const studentChannelConfigured =
    channel === 'sms'
      ? Boolean(studentOverview?.sms_configured)
      : Boolean(studentOverview?.email_configured);

  if (loading) {
    return (
      <section className="pc-panel" aria-labelledby="pc-title">
        <h2 id="pc-title" className="po-title" style={{ fontSize: '1.35rem' }}>
          📊 {tr('pcTitle')}
        </h2>
        <p className="po-sub" role="status">{tr('pcSaving')}</p>
      </section>
    );
  }

  if (isStudent) {
    const studentDeliveryKey = activeLink?.delivery_reason || (activeLink?.delivery_eligible ? 'pending' : 'skipped_no_contact');
    return (
      <section className="pc-panel" aria-labelledby="pc-title">
        <div className="po-profile-head">
          <div>
            <h2 id="pc-title" className="po-title" style={{ fontSize: '1.35rem' }}>
              📊 {tr('pcStudentTitle')}
            </h2>
            <p className="po-sub">{tr('pcStudentIntro')}</p>
          </div>
          {activeLink && studentContact && (
            <span className={`po-status ${studentContact.is_verified ? 'ok' : 'pending'}`}>
              {studentContact.is_verified ? `✓ ${tr('pcVerified')}` : tr('pcUnverified')}
            </span>
          )}
        </div>

        {error && (
          <div className="po-banner" role="alert" style={{ borderColor: '#f87171', color: '#fecdd3' }}>
            ⚠️ {error}
          </div>
        )}
        {notice && !error && (
          <div className="po-banner" role="status">
            ✓ {notice}
          </div>
        )}

        {verifiedLinks.length === 0 ? (
          <div className="pc-card" role="note">
            <h3 className="po-block-title">🔗 {tr('pcStudentPrerequisiteTitle')}</h3>
            <p className="po-small pc-muted">
              {studentLinks.length === 0 ? tr('pcStudentNoLinks') : tr('pcStudentPrerequisite')}
            </p>
            <p className="po-small pc-muted">{tr('pcStudentUseOption1')}</p>
            {studentLinks.length > 0 && (
              <ul className="pc-status-list">
                {studentLinks.map((link, index) => (
                  <li key={`${link.parent_id}-${index}`}>
                    <b>{link.parent_name}</b>
                    <span className={`pc-chip ${link.status === 'verified' ? 'ok' : 'warn'}`}>
                      {link.status === 'verified'
                        ? tr('pcVerified')
                        : tr(`pcStudentLink_${link.status}`)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <>
            <div className="pc-card">
              <div className="po-field">
                <label htmlFor="pc-student-parent">{tr('pcStudentSelectParent')}</label>
                <select
                  id="pc-student-parent"
                  value={studentParentId}
                  onChange={(e) => selectStudentParent(e.target.value)}
                >
                  {verifiedLinks.map((link) => (
                    <option key={link.parent_id} value={link.parent_id}>
                      {link.parent_name} · {link.parent_email}
                    </option>
                  ))}
                </select>
              </div>
              <p className="po-small pc-muted">{tr('pcStudentParentLoginNote')}</p>

              <div className="pc-status-grid" aria-live="polite">
                <div className="pc-status-item">
                  <span>{tr('pcStudentContactStatus')}</span>
                  <b className={`pc-chip ${studentContact?.is_verified ? 'ok' : 'warn'}`}>
                    {studentContact?.is_verified ? tr('pcVerified') : tr('pcUnverified')}
                  </b>
                </div>
                <div className="pc-status-item">
                  <span>{tr('pcStudentConsentStatus')}</span>
                  <b className={`pc-chip ${studentContact?.notification_consent ? 'ok' : 'warn'}`}>
                    {studentContact?.notification_consent
                      ? tr('pcStudentConsentGiven')
                      : tr('pcStudentConsentMissing')}
                  </b>
                </div>
                <div className="pc-status-item">
                  <span>{tr('pcStudentChannel')}</span>
                  <b className={`pc-chip ${studentContact?.contact_type ? 'ok' : 'warn'}`}>
                    {studentContact?.contact_type === 'sms'
                      ? tr('pcUseSms')
                      : studentContact?.contact_type === 'email'
                        ? tr('pcUseEmail')
                        : tr('pcStudentNone')}
                  </b>
                </div>
                <div className="pc-status-item">
                  <span>{tr('pcStudentLastReport')}</span>
                  <b className={`pc-chip ${activeLink?.latest_report?.delivery_status === 'sent' ? 'ok' : 'warn'}`}>
                    {activeLink?.latest_report
                      ? deliveryLabel(activeLink.latest_report.delivery_status)
                      : tr('pcStudentNoReport')}
                  </b>
                </div>
                <div className="pc-status-item">
                  <span>{tr('pcStudentDeliveryStatus')}</span>
                  <b className={`pc-chip ${activeLink?.delivery_eligible ? 'ok' : 'warn'}`}>
                    {activeLink?.delivery_eligible
                      ? tr('pcStudentStatusReady')
                      : tr('pcStudentStatusBlocked', { reason: deliveryLabel(studentDeliveryKey) })}
                  </b>
                </div>
              </div>
              {studentOverview?.provider_ready === false && (
                <p className="pc-note" role="note">ℹ️ {tr('pcStudentProviderMissing')}</p>
              )}
            </div>

            <div className="pc-grid">
              <div className="pc-card">
                <h3 className="po-block-title">✉️ {tr('pcStudentContactTitle')}</h3>
                <p className="po-small pc-muted">{tr('pcStudentContactIntro')}</p>

                {!studentShowContactForm && studentHasDestination && (
                  <div className="pc-contact-summary">
                    <div>
                      <div className="pc-contact-value">
                        {studentContact.guardian_name || activeLink.parent_name}
                      </div>
                      <div className="po-small">
                        {studentContact.contact_type === 'sms' ? tr('pcUseSms') : tr('pcUseEmail')} ·{' '}
                        <b>{studentContact.destination}</b>
                      </div>
                      <div className="po-small pc-muted">
                        {tr('pcStudentContactFor', { name: activeLink.parent_name })}
                      </div>
                    </div>
                    <span className={`pc-chip ${studentContact.is_verified ? 'ok' : 'warn'}`}>
                      {studentContact.is_verified ? tr('pcVerified') : tr('pcUnverified')}
                    </span>
                    <button type="button" className="sec pc-btn" onClick={startStudentEditing}>
                      {tr('pcChangeContact')}
                    </button>
                  </div>
                )}

                {studentNeedsVerification && !studentShowContactForm && (
                  <form className="pc-otp-form" onSubmit={verifyStudentContact}>
                    <h4 className="pc-subtitle">{tr('pcOtpTitle')}</h4>
                    <p className="po-small">
                      {tr('pcOtpIntro', { destination: studentContact.destination })}
                    </p>
                    <div className="po-field">
                      <label htmlFor="pc-student-otp">{tr('pcOtpLabel')}</label>
                      <input
                        id="pc-student-otp"
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={8}
                        value={otp}
                        onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, ''))}
                      />
                    </div>
                    <div className="pc-form-actions">
                      <button type="submit" className="po-primary" disabled={busy || otp.trim().length < 4}>
                        {busy ? tr('pcVerifying') : tr('pcVerify')}
                      </button>
                      <button
                        type="button"
                        className="sec pc-btn"
                        onClick={resendStudentOtp}
                        disabled={busy || cooldown > 0}
                      >
                        {cooldown > 0
                          ? tr('pcResendIn', { seconds: cooldown })
                          : tr('pcResendCode')}
                      </button>
                    </div>
                  </form>
                )}

                {studentShowContactForm && (
                  <form className="pc-contact-form" onSubmit={saveStudentContact}>
                    <p className="pc-note" role="note">ℹ️ {tr('pcStudentContactHelp')}</p>

                    <div className="pc-channel-toggle" role="group" aria-label={tr('pcStudentContactTitle')}>
                      <button
                        type="button"
                        className={`pc-channel ${channel === 'email' ? 'on' : ''}`}
                        aria-pressed={channel === 'email'}
                        onClick={() => setChannel('email')}
                      >
                        ✉️ {tr('pcUseEmail')}
                      </button>
                      <button
                        type="button"
                        className={`pc-channel ${channel === 'sms' ? 'on' : ''}`}
                        aria-pressed={channel === 'sms'}
                        onClick={() => setChannel('sms')}
                      >
                        📱 {tr('pcUseSms')}
                      </button>
                    </div>

                    {!studentChannelConfigured && (
                      <p className="pc-note" role="note">
                        ℹ️ {channel === 'sms' ? tr('pcProviderSmsMissing') : tr('pcProviderEmailMissing')}
                      </p>
                    )}

                    <div className="po-field">
                      <label htmlFor="pc-student-guardian-name">{tr('pcStudentGuardianName')}</label>
                      <input
                        id="pc-student-guardian-name"
                        type="text"
                        autoComplete="name"
                        value={guardianName}
                        onChange={(e) => setGuardianName(e.target.value)}
                      />
                    </div>

                    <div className="po-field">
                      <label htmlFor="pc-student-relationship">{tr('pcRelationship')}</label>
                      <select
                        id="pc-student-relationship"
                        value={relationship}
                        onChange={(e) => setRelationship(e.target.value)}
                      >
                        {RELATIONSHIPS.map((item) => (
                          <option key={item.id} value={item.id}>
                            {tr(item.key)}
                          </option>
                        ))}
                      </select>
                    </div>

                    {channel === 'email' ? (
                      <div className="po-field">
                        <label htmlFor="pc-student-email">{tr('pcEmailLabel')}</label>
                        <input
                          id="pc-student-email"
                          type="email"
                          autoComplete="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                        />
                      </div>
                    ) : (
                      <div className="po-field">
                        <label htmlFor="pc-student-phone">{tr('pcPhoneLabel')}</label>
                        <input
                          id="pc-student-phone"
                          type="tel"
                          autoComplete="tel"
                          required
                          placeholder="98765 43210"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                        />
                      </div>
                    )}

                    <div className="po-field">
                      <label htmlFor="pc-student-language">{tr('pcReportLanguage')}</label>
                      <select
                        id="pc-student-language"
                        value={reportLanguage}
                        onChange={(e) => setReportLanguage(e.target.value)}
                      >
                        {LANGUAGES.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <label className="pc-check">
                      <input
                        type="checkbox"
                        checked={consent}
                        onChange={(e) => setConsent(e.target.checked)}
                      />
                      <span>{tr('pcStudentConsent')}</span>
                    </label>
                    <p className="po-small pc-muted">{tr('pcStudentConsentHelp')}</p>

                    <div className="pc-form-actions">
                      <button type="submit" className="po-primary" disabled={busy}>
                        {busy ? tr('pcSaving') : tr('pcSendCode')}
                      </button>
                      {studentHasDestination && (
                        <button type="button" className="sec pc-btn" onClick={cancelStudentEditing} disabled={busy}>
                          {tr('pcCancel')}
                        </button>
                      )}
                    </div>
                  </form>
                )}
              </div>

              <div className="pc-card">
                <h3 className="po-block-title">⚙️ {tr('pcPreferencesTitle')}</h3>
                {!studentHasDestination ? (
                  <p className="po-small pc-muted">{tr('pcStudentContactIntro')}</p>
                ) : (
                  <form onSubmit={saveStudentPreferences}>
                    <label className="pc-check">
                      <input
                        type="checkbox"
                        checked={reportsEnabled}
                        onChange={(e) => setReportsEnabled(e.target.checked)}
                      />
                      <span>{tr('pcEnableReports')}</span>
                    </label>

                    <label className="pc-check">
                      <input
                        type="checkbox"
                        checked={consentPref}
                        onChange={(e) => setConsentPref(e.target.checked)}
                      />
                      <span>{tr('pcStudentConsent')}</span>
                    </label>

                    <div className="po-field">
                      <label htmlFor="pc-student-pref-language">{tr('pcPrefsLanguage')}</label>
                      <select
                        id="pc-student-pref-language"
                        value={prefLanguage}
                        onChange={(e) => setPrefLanguage(e.target.value)}
                      >
                        {LANGUAGES.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {studentOverview?.next_run_at_ist && (
                      <p className="po-small pc-muted">
                        {tr('pcStudentNextRun', {
                          when: studentOverview.next_run_at_ist,
                          schedule: studentOverview.schedule,
                        })}
                      </p>
                    )}

                    <button type="submit" className="po-primary" disabled={busy}>
                      {busy ? tr('pcSaving') : tr('pcSavePrefs')}
                    </button>
                  </form>
                )}
              </div>
            </div>
          </>
        )}
      </section>
    );
  }

  return (
    <section className="pc-panel" aria-labelledby="pc-title">
      <div className="po-profile-head">
        <div>
          <h2 id="pc-title" className="po-title" style={{ fontSize: '1.35rem' }}>
            📊 {tr('pcTitle')}
          </h2>
          <p className="po-sub">{tr('pcIntro')}</p>
        </div>
        {contact?.destination && (
          <span className={`po-status ${contact.is_verified ? 'ok' : 'pending'}`}>
            {contact.is_verified ? `✓ ${tr('pcVerified')}` : tr('pcUnverified')}
          </span>
        )}
      </div>

      {error && (
        <div className="po-banner" role="alert" style={{ borderColor: '#f87171', color: '#fecdd3' }}>
          ⚠️ {error}
        </div>
      )}
      {notice && !error && (
        <div className="po-banner" role="status">
          ✓ {notice}
        </div>
      )}

      <div className="pc-grid">
        <div className="pc-card">
          <h3 className="po-block-title">✉️ {tr('pcContactTitle')}</h3>
          <p className="po-small pc-muted">{tr('pcContactIntro')}</p>

          {!showContactForm && hasDestination && (
            <div className="pc-contact-summary">
              <div>
                <div className="pc-contact-value">{contact.guardian_name || profile?.full_name || ''}</div>
                <div className="po-small">
                  {contact.contact_type === 'sms' ? tr('pcUseSms') : tr('pcUseEmail')} ·{' '}
                  <b>{contact.destination}</b>
                </div>
              </div>
              <span className={`pc-chip ${contact.is_verified ? 'ok' : 'warn'}`}>
                {contact.is_verified ? tr('pcVerified') : tr('pcUnverified')}
              </span>
              <button type="button" className="sec pc-btn" onClick={startEditing}>
                {tr('pcChangeContact')}
              </button>
            </div>
          )}

          {needsVerification && !showContactForm && (
            <form className="pc-otp-form" onSubmit={verifyContact}>
              <h4 className="pc-subtitle">{tr('pcOtpTitle')}</h4>
              <p className="po-small">
                {tr('pcOtpIntro', { destination: contact.destination })}
              </p>
              <div className="po-field">
                <label htmlFor="pc-otp">{tr('pcOtpLabel')}</label>
                <input
                  id="pc-otp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={8}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, ''))}
                />
              </div>
              <div className="pc-form-actions">
                <button type="submit" className="po-primary" disabled={busy || otp.trim().length < 4}>
                  {busy ? tr('pcVerifying') : tr('pcVerify')}
                </button>
                <button
                  type="button"
                  className="sec pc-btn"
                  onClick={resendOtp}
                  disabled={busy || cooldown > 0}
                >
                  {cooldown > 0
                    ? tr('pcResendIn', { seconds: cooldown })
                    : tr('pcResendCode')}
                </button>
              </div>
            </form>
          )}

          {showContactForm && (
            <form className="pc-contact-form" onSubmit={saveContact}>
              <div className="pc-channel-toggle" role="group" aria-label={tr('pcContactTitle')}>
                <button
                  type="button"
                  className={`pc-channel ${channel === 'email' ? 'on' : ''}`}
                  aria-pressed={channel === 'email'}
                  onClick={() => setChannel('email')}
                >
                  ✉️ {tr('pcUseEmail')}
                </button>
                <button
                  type="button"
                  className={`pc-channel ${channel === 'sms' ? 'on' : ''}`}
                  aria-pressed={channel === 'sms'}
                  onClick={() => setChannel('sms')}
                >
                  📱 {tr('pcUseSms')}
                </button>
              </div>

              {!channelConfigured && (
                <p className="pc-note" role="note">
                  ℹ️ {channel === 'sms' ? tr('pcProviderSmsMissing') : tr('pcProviderEmailMissing')}
                </p>
              )}

              <div className="po-field">
                <label htmlFor="pc-guardian-name">{tr('pcGuardianName')}</label>
                <input
                  id="pc-guardian-name"
                  type="text"
                  autoComplete="name"
                  value={guardianName}
                  onChange={(e) => setGuardianName(e.target.value)}
                />
              </div>

              <div className="po-field">
                <label htmlFor="pc-relationship">{tr('pcRelationship')}</label>
                <select
                  id="pc-relationship"
                  value={relationship}
                  onChange={(e) => setRelationship(e.target.value)}
                >
                  {RELATIONSHIPS.map((item) => (
                    <option key={item.id} value={item.id}>
                      {tr(item.key)}
                    </option>
                  ))}
                </select>
              </div>

              {channel === 'email' ? (
                <div className="po-field">
                  <label htmlFor="pc-email">{tr('pcEmailLabel')}</label>
                  <input
                    id="pc-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              ) : (
                <div className="po-field">
                  <label htmlFor="pc-phone">{tr('pcPhoneLabel')}</label>
                  <input
                    id="pc-phone"
                    type="tel"
                    autoComplete="tel"
                    required
                    placeholder="98765 43210"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
              )}

              <div className="po-field">
                <label htmlFor="pc-contact-language">{tr('pcReportLanguage')}</label>
                <select
                  id="pc-contact-language"
                  value={reportLanguage}
                  onChange={(e) => setReportLanguage(e.target.value)}
                >
                  {LANGUAGES.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>

              <label className="pc-check">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                <span>{tr('pcConsent')}</span>
              </label>
              <p className="po-small pc-muted">{tr('pcConsentHelp')}</p>

              <div className="pc-form-actions">
                <button type="submit" className="po-primary" disabled={busy}>
                  {busy ? tr('pcSaving') : tr('pcSendCode')}
                </button>
                {hasDestination && (
                  <button type="button" className="sec pc-btn" onClick={cancelEditing} disabled={busy}>
                    {tr('pcCancel')}
                  </button>
                )}
              </div>
            </form>
          )}
        </div>

        <div className="pc-card">
          <h3 className="po-block-title">⚙️ {tr('pcPreferencesTitle')}</h3>
          {!hasDestination ? (
            <p className="po-small pc-muted">{tr('pcContactIntro')}</p>
          ) : (
            <form onSubmit={savePreferences}>
              <label className="pc-check">
                <input
                  type="checkbox"
                  checked={reportsEnabled}
                  onChange={(e) => setReportsEnabled(e.target.checked)}
                />
                <span>{tr('pcEnableReports')}</span>
              </label>

              <label className="pc-check">
                <input
                  type="checkbox"
                  checked={consentPref}
                  onChange={(e) => setConsentPref(e.target.checked)}
                />
                <span>{tr('pcConsent')}</span>
              </label>

              <div className="po-field">
                <label htmlFor="pc-pref-language">{tr('pcPrefsLanguage')}</label>
                <select
                  id="pc-pref-language"
                  value={prefLanguage}
                  onChange={(e) => setPrefLanguage(e.target.value)}
                >
                  {LANGUAGES.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>

              {status?.next_run_at_ist && (
                <p className="po-small pc-muted">
                  {tr('pcPublicIntro')} · {status.schedule}
                </p>
              )}

              <div className="po-field">
                <label htmlFor="pc-delivery-day">📅 Report Delivery Day</label>
                <select
                  id="pc-delivery-day"
                  value={deliveryDay}
                  onChange={(e) => setDeliveryDay(e.target.value)}
                >
                  {['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map((d) => (
                    <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>
                  ))}
                </select>
              </div>

              <div className="po-field">
                <label htmlFor="pc-delivery-time">🕕 Delivery Time (IST)</label>
                <select
                  id="pc-delivery-time"
                  value={deliveryTime}
                  onChange={(e) => setDeliveryTime(e.target.value)}
                >
                  {['06:00','08:00','10:00','12:00','14:00','16:00','18:00','20:00','22:00'].map((t) => (
                    <option key={t} value={t}>{t} IST</option>
                  ))}
                </select>
              </div>

              <button type="submit" className="po-primary" disabled={busy}>
                {busy ? tr('pcSaving') : tr('pcSavePrefs')}
              </button>
            </form>
          )}
        </div>

        {/* ── Connect Child by Code ── */}
        <div className="pc-card" style={{ borderColor: '#10b981' }}>
          <h3 className="po-block-title">🔗 Connect a Child</h3>
          <p className="po-small pc-muted">
            Ask your child to generate a connection code in their Student Dashboard. Enter it here to link their account.
          </p>

          {connectSuccess && (
            <div className="po-banner" role="status" style={{ borderColor: '#10b981', color: '#6ee7b7' }}>
              ✓ {connectSuccess}
            </div>
          )}
          {connectError && (
            <div className="po-banner" role="alert" style={{ borderColor: '#f87171', color: '#fecdd3' }}>
              ⚠️ {connectError}
            </div>
          )}

          {!showConnectForm ? (
            <button
              type="button"
              className="po-primary"
              onClick={() => { setShowConnectForm(true); setConnectError(''); setConnectSuccess(''); }}
              style={{ backgroundColor: '#10b981', color: '#0f172a', marginTop: '10px' }}
            >
              + Connect Another Child
            </button>
          ) : (
            <form onSubmit={connectStudent} style={{ marginTop: '12px' }}>
              <div className="po-field">
                <label htmlFor="pc-connect-code">Connection Code</label>
                <input
                  id="pc-connect-code"
                  type="text"
                  value={connectCode}
                  onChange={(e) => setConnectCode(e.target.value.toUpperCase())}
                  placeholder="e.g. UDAAN-X7K2P9"
                  autoComplete="off"
                />
              </div>
              <div className="po-field">
                <label htmlFor="pc-connect-rel">Your Relationship</label>
                <select id="pc-connect-rel" value={connectRelType} onChange={(e) => setConnectRelType(e.target.value)}>
                  <option value="parent">Parent</option>
                  <option value="mother">Mother</option>
                  <option value="father">Father</option>
                  <option value="guardian">Guardian</option>
                </select>
              </div>
              <div className="pc-form-actions">
                <button type="submit" className="po-primary" disabled={connectBusy}
                  style={{ backgroundColor: '#10b981', color: '#0f172a' }}>
                  {connectBusy ? 'Connecting…' : 'Connect Child'}
                </button>
                <button type="button" className="sec pc-btn" onClick={() => { setShowConnectForm(false); setConnectError(''); }}>
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* ── Connected Children, Search & Verification Management (PART 5 & PART 3) ── */}
        </div>

        <div className="pc-card" style={{ gridColumn: '1 / -1', background: 'rgba(15, 23, 42, 0.75)', border: '1px solid rgba(168, 85, 247, 0.3)', boxShadow: '0 8px 32px rgba(0, 0, 0, 0.37)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
            <div>
              <h3 className="po-block-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>👨‍👩‍👧</span> Connected Children &amp; Verification Status
              </h3>
              <p className="po-small pc-muted" style={{ margin: '4px 0 0 0' }}>
                Monitor your child's learning access and verification status. Student-isolated: only your connected children appear here.
              </p>
            </div>
            {connectedChildren.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="pc-chip ok" style={{ fontSize: '0.75rem' }}>
                  {connectedChildren.filter(c => c.link_status === 'verified').length} Verified / {connectedChildren.length} Total
                </span>
              </div>
            )}
          </div>

          {/* Connected Child Search bar */}
          {connectedChildren.length > 0 && (
            <div style={{ position: 'relative', marginBottom: '20px' }}>
              <input
                type="text"
                value={childSearchQuery}
                onChange={(e) => setChildSearchQuery(e.target.value)}
                placeholder="🔍 Search your connected child by name, student ID, class, school, or teacher..."
                style={{
                  width: '100%',
                  padding: '12px 40px 12px 16px',
                  background: 'rgba(30, 41, 59, 0.6)',
                  border: '1px solid rgba(148, 163, 184, 0.25)',
                  borderRadius: '10px',
                  color: '#f8fafc',
                  fontSize: '0.9rem',
                }}
              />
              {childSearchQuery && (
                <button
                  type="button"
                  onClick={() => setChildSearchQuery('')}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    fontSize: '1.1rem',
                  }}
                  title="Clear search"
                >
                  ✕
                </button>
              )}
            </div>
          )}

          {/* Revocation success banner */}
          {revocationOtpState.success && (
            <div className="po-banner" role="status" style={{ borderColor: '#10b981', color: '#6ee7b7', marginBottom: '16px' }}>
              ✓ {revocationOtpState.success}
            </div>
          )}

          {/* Empty state: No connected children */}
          {connectedChildren.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '36px 20px',
              background: 'rgba(30, 41, 59, 0.4)',
              borderRadius: '12px',
              border: '1px dashed rgba(168, 85, 247, 0.35)',
              margin: '10px 0',
            }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '10px' }}>👨‍👩‍👦</div>
              <h4 style={{ color: '#f1f5f9', fontSize: '1.1rem', margin: '0 0 8px 0' }}>No connected children found</h4>
              <p style={{ color: '#94a3b8', fontSize: '0.88rem', maxWidth: '440px', margin: '0 auto 16px auto', lineHeight: '1.5' }}>
                Enter a connection code from your child to connect and start tracking their adaptive learning progress.
              </p>
              <button
                type="button"
                className="po-primary"
                onClick={() => { setShowConnectForm(true); setConnectError(''); }}
                style={{
                  background: 'linear-gradient(135deg, #10b981, #059669)',
                  color: '#0f172a',
                  fontWeight: 600,
                  padding: '10px 22px',
                  borderRadius: '8px',
                }}
              >
                + Connect a Child by Code
              </button>
            </div>
          ) : filteredChildren.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '28px', color: '#94a3b8' }}>
              <p>No connected children matching &quot;<strong>{childSearchQuery}</strong>&quot;</p>
              <button
                type="button"
                className="sec pc-btn"
                onClick={() => setChildSearchQuery('')}
                style={{ marginTop: '8px' }}
              >
                Clear Search Filter
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
              {filteredChildren.map((child) => {
                const isVerified = child.link_status === 'verified';
                const isPending = child.link_status === 'pending';
                const isRejected = child.link_status === 'rejected';
                const isRevoked = child.link_status === 'revoked';

                const statusColor = isVerified
                  ? '#10b981'
                  : isPending
                  ? '#f59e0b'
                  : isRejected
                  ? '#ef4444'
                  : isRevoked
                  ? '#64748b'
                  : '#a855f7';

                return (
                  <div
                    key={child.student_id}
                    style={{
                      background: 'rgba(30, 41, 59, 0.65)',
                      border: `1px solid ${child.has_pending_revocation ? '#ef4444' : isVerified ? 'rgba(16, 185, 129, 0.35)' : 'rgba(148, 163, 184, 0.2)'}`,
                      borderRadius: '12px',
                      padding: '16px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      boxShadow: child.has_pending_revocation
                        ? '0 0 20px rgba(239, 68, 68, 0.25)'
                        : isVerified
                        ? '0 4px 16px rgba(16, 185, 129, 0.1)'
                        : 'none',
                    }}
                  >
                    <div>
                      {/* Top Row: Name, Class, and Status Badge */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '1.05rem', color: '#f8fafc' }}>
                            {child.full_name}
                          </div>
                          <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '2px' }}>
                            Class: <strong>{child.class_name || 'Standard'}</strong> · ID: #{child.student_id}
                          </div>
                        </div>
                        <span
                          style={{
                            padding: '4px 10px',
                            borderRadius: '9999px',
                            fontSize: '0.74rem',
                            fontWeight: 600,
                            letterSpacing: '0.02em',
                            border: `1px solid ${statusColor}`,
                            color: statusColor,
                            background: `${statusColor}18`,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {child.connection_display_status || (isVerified ? 'Parent Verified' : child.link_status)}
                        </span>
                      </div>

                      {/* Metadata Grid */}
                      <div style={{ fontSize: '0.8rem', color: '#cbd5e1', background: 'rgba(15, 23, 42, 0.5)', padding: '10px 12px', borderRadius: '8px', marginBottom: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span style={{ color: '#94a3b8' }}>🏫 School:</span>
                          <strong>{child.school_name || 'Not specified'}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span style={{ color: '#94a3b8' }}>👨‍🏫 Teacher:</span>
                          <strong>{child.teacher_name || 'Not assigned'}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#94a3b8' }}>✉️ Parent Email:</span>
                          <span>{child.email_verified ? '✅ Verified' : '⚠️ Unverified'}</span>
                        </div>
                      </div>

                      {/* Performance data (verified only) */}
                      {isVerified ? (
                        <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '10px 12px', borderRadius: '8px', marginBottom: '12px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                            <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Overall Mastery</span>
                            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#34d399' }}>
                              {child.overall_mastery_pct != null ? `${child.overall_mastery_pct}%` : 'N/A'}
                            </span>
                          </div>
                          <div style={{ width: '100%', height: '6px', background: 'rgba(15, 23, 42, 0.6)', borderRadius: '3px', overflow: 'hidden', marginBottom: '8px' }}>
                            <div
                              style={{
                                width: `${Math.min(100, Math.max(0, child.overall_mastery_pct || 0))}%`,
                                height: '100%',
                                background: 'linear-gradient(90deg, #10b981, #06b6d4)',
                                borderRadius: '3px',
                              }}
                            />
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#94a3b8' }}>
                            <span>Accuracy: <strong style={{ color: '#f8fafc' }}>{child.accuracy_pct != null ? `${child.accuracy_pct}%` : 'N/A'}</strong></span>
                            <span>Active: <strong style={{ color: '#f8fafc' }}>{child.last_active ? new Date(child.last_active).toLocaleDateString() : 'Recent'}</strong></span>
                          </div>
                        </div>
                      ) : isPending ? (
                        <div style={{ fontSize: '0.78rem', color: '#fbbf24', background: 'rgba(245, 158, 11, 0.1)', padding: '8px 10px', borderRadius: '6px', marginBottom: '12px' }}>
                          ⏳ Request is awaiting approval from {child.full_name}. Learning data will unlock once accepted.
                        </div>
                      ) : isRevoked ? (
                        <div style={{ fontSize: '0.78rem', color: '#94a3b8', background: 'rgba(100, 116, 139, 0.15)', padding: '8px 10px', borderRadius: '6px', marginBottom: '12px' }}>
                          🚫 Access has been revoked for this child. Enter a fresh connection code to reconnect.
                        </div>
                      ) : null}

                      {/* ── OTP Revocation Alert & Confirmation Section (PART 3) ── */}
                      {child.has_pending_revocation && (
                        <div style={{
                          background: 'rgba(239, 68, 68, 0.15)',
                          border: '1px solid #ef4444',
                          borderRadius: '8px',
                          padding: '12px',
                          marginBottom: '12px',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#fca5a5', fontWeight: 700, fontSize: '0.85rem', marginBottom: '6px' }}>
                            <span>⚠️</span> Access Removal Requested by Child
                          </div>
                          <p style={{ fontSize: '0.78rem', color: '#fecdd3', margin: '0 0 8px 0', lineHeight: '1.4' }}>
                            Your child requested to remove your access. An OTP was sent to your registered email.
                            To confirm, enter the 6-digit OTP below. If you do not approve, your access remains active.
                          </p>
                          <div style={{ fontSize: '0.72rem', color: '#fbcfe8', fontStyle: 'italic', marginBottom: '8px' }}>
                            &quot;మీ బిడ్డ వారి UDAAN ఖాతాకు మీకున్న యాక్సెస్‌ను తొలగించాలని అభ్యర్థించారు. నిర్ధారించడానికి OTPను నమోదు చేయండి.&quot;
                          </div>

                          {revocationOtpState.error && revocationOtpState.linkId === child.link_id && (
                            <div style={{ color: '#f87171', fontSize: '0.78rem', marginBottom: '6px' }}>
                              ⚠️ {revocationOtpState.error}
                            </div>
                          )}

                          <form onSubmit={(e) => handleConfirmRevocation(e, child.link_id)}>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <input
                                type="text"
                                inputMode="numeric"
                                maxLength={6}
                                placeholder="6-digit OTP"
                                value={revocationOtpState.linkId === child.link_id ? revocationOtpState.otp : ''}
                                onChange={(e) => setRevocationOtpState({
                                  linkId: child.link_id,
                                  childName: child.full_name,
                                  otp: e.target.value.replace(/[^0-9]/g, '').slice(0, 6),
                                  error: '',
                                  success: '',
                                  busy: false,
                                })}
                                style={{
                                  flex: 1,
                                  padding: '6px 10px',
                                  fontSize: '0.9rem',
                                  letterSpacing: '0.2em',
                                  textAlign: 'center',
                                  background: 'rgba(15, 23, 42, 0.8)',
                                  border: '1px solid #ef4444',
                                  borderRadius: '6px',
                                  color: '#fff',
                                }}
                              />
                              <button
                                type="submit"
                                disabled={revocationOtpState.busy || revocationOtpState.linkId !== child.link_id || !revocationOtpState.otp}
                                style={{
                                  background: '#ef4444',
                                  color: '#fff',
                                  border: 'none',
                                  borderRadius: '6px',
                                  padding: '6px 12px',
                                  fontSize: '0.75rem',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                }}
                              >
                                {revocationOtpState.busy && revocationOtpState.linkId === child.link_id ? 'Confirming…' : 'Confirm Removal'}
                              </button>
                            </div>
                          </form>
                        </div>
                      )}
                    </div>

                    {/* Bottom Actions */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '10px', marginTop: '6px' }}>
                      {isVerified && (
                        <button
                          type="button"
                          className="sec pc-btn"
                          onClick={() => {
                            setChildId(String(child.student_id));
                            generateLatest();
                          }}
                          disabled={busy}
                          style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                        >
                          📊 View Report
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => disconnectChild(child.student_id, child.full_name)}
                        disabled={busy}
                        style={{
                          background: 'none',
                          border: '1px solid rgba(239, 68, 68, 0.4)',
                          borderRadius: '6px',
                          color: '#f87171',
                          fontSize: '0.74rem',
                          padding: '4px 10px',
                          cursor: 'pointer',
                        }}
                      >
                        Disconnect
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Email Change ── */}
        {contact?.is_verified && (
          <div className="pc-card">
            <h3 className="po-block-title">📧 Change Email Address</h3>
            <p className="po-small pc-muted">
              Current: <strong>{contact.destination}</strong>
            </p>
            {emailChangeMsg && (
              <div className="po-banner" role="status"
                style={{ borderColor: emailChangeMsg.startsWith('✅') ? '#10b981' : '#f59e0b', color: '#fef3c7', marginBottom: '10px' }}>
                {emailChangeMsg}
              </div>
            )}
            {emailChangeStep === 'idle' ? (
              <form onSubmit={requestEmailChange}>
                <div className="po-field">
                  <label htmlFor="pc-new-email">New Email Address</label>
                  <input
                    id="pc-new-email"
                    type="email"
                    required
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="e.g. newemail@gmail.com"
                  />
                </div>
                <button type="submit" className="sec pc-btn" disabled={emailChangeBusy}>
                  {emailChangeBusy ? 'Sending OTP…' : 'Request Email Change'}
                </button>
              </form>
            ) : (
              <form onSubmit={verifyEmailChange}>
                <div className="po-field">
                  <label htmlFor="pc-email-change-otp">OTP sent to {newEmail}</label>
                  <input
                    id="pc-email-change-otp"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={emailChangeOtp}
                    onChange={(e) => setEmailChangeOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="6-digit code"
                    style={{ letterSpacing: '0.3em', fontSize: '1.2rem', textAlign: 'center' }}
                  />
                </div>
                <div className="pc-form-actions">
                  <button type="submit" className="po-primary" disabled={emailChangeBusy}>
                    {emailChangeBusy ? 'Verifying…' : 'Verify & Update Email'}
                  </button>
                  <button type="button" className="sec pc-btn"
                    onClick={() => { setEmailChangeStep('idle'); setEmailChangeMsg(''); setEmailChangeOtp(''); }}>
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>

      <div className="pc-card pc-reports-card">
        {selected ? (
          <>
            <WeeklyReportView
              report={selected}
              lang={selected.language || lang}
              t={t}
              onBack={() => {
                setSelected(null);
                setRotatedLink('');
              }}
              actions={
                <>
                  <button type="button" className="sec pc-btn" onClick={resendReport} disabled={busy}>
                    ✉️ {tr('pcResendReport')}
                  </button>
                  <button type="button" className="sec pc-btn" onClick={rotateLink} disabled={busy}>
                    🔗 {tr('pcRotateLink')}
                  </button>
                  {selected.public_link_active && (
                    <button type="button" className="sec pc-btn" onClick={revokeLink} disabled={busy}>
                      🚫 {tr('pcRevokeLink')}
                    </button>
                  )}
                  <span className={`pc-chip ${selected.delivery_status === 'sent' ? 'ok' : 'warn'}`}>
                    {deliveryLabel(selected.delivery_status)}
                  </span>
                </>
              }
            />
            {rotatedLink && (
              <div className="pc-link-box">
                <label htmlFor="pc-link-value">{tr('pcSecureLink')}</label>
                <div className="pc-link-row">
                  <input id="pc-link-value" type="text" readOnly value={rotatedLink} />
                  <button type="button" className="sec pc-btn" onClick={copyLink}>
                    {tr('pcCopyLink')}
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="pc-reports-head">
              <div>
                <h3 className="po-block-title">🗂️ {tr('pcReportsTitle')}</h3>
                <p className="po-small pc-muted">{tr('pcReportsIntro')}</p>
              </div>
              {verifiedChildren.length > 0 ? (
                <div className="pc-generate">
                  <label className="po-field pc-child-select">
                    <span>{tr('pcReportFor')}</span>
                    <select value={childId} onChange={(e) => setChildId(e.target.value)}>
                      {verifiedChildren.map((child) => (
                        <option key={child.student_id} value={child.student_id}>
                          {child.student_name} · {child.class_name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="button" className="po-primary" onClick={generateLatest} disabled={busy || !childId}>
                    {busy ? tr('pcGenerating') : tr('pcGenerateLatest')}
                  </button>
                  <button
                    type="button"
                    className="sec pc-btn"
                    onClick={sendTestReport}
                    disabled={testReportBusy || !childId}
                    title="Send a test weekly report to your registered email now"
                    style={{ marginLeft: '8px' }}
                  >
                    {testReportBusy ? '📤 Sending…' : '📤 Send Test Report'}
                  </button>
                </div>
              ) : (
                <p className="pc-note" role="note">{tr('pcNoVerifiedChild')}</p>
              )}
            </div>

            {/* Test report delivery result */}
            {testReportResult && (
              <div style={{
                marginBottom: '12px', padding: '10px 14px', borderRadius: '8px',
                background: testReportResult.delivery_status === 'sent' ? 'rgba(16,185,129,0.12)' : 'rgba(251,191,36,0.1)',
                border: `1px solid ${testReportResult.delivery_status === 'sent' ? '#10b981' : '#f59e0b'}`,
                fontSize: '0.84rem', color: '#f1f5f9'
              }}>
                <strong>Test Report:</strong>{' '}
                {testReportResult.delivery_status === 'sent'
                  ? `✅ Sent to ${testReportResult.recipient_email || 'your email'}`
                  : testReportResult.delivery_status === 'not_configured'
                  ? '⚠️ Email provider not configured (set RESEND_API_KEY in .env)'
                  : `Status: ${testReportResult.delivery_status}`}
                {testReportResult.error_detail && (
                  <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '4px' }}>{testReportResult.error_detail}</div>
                )}
              </div>
            )}

            {reports.length === 0 ? (
              <p className="po-sub">{tr('pcNoReports')}</p>
            ) : (
              <ul className="pc-report-list" aria-live="polite">
                {reports.map((report) => (
                  <li key={report.id}>
                    <button
                      type="button"
                      className="pc-report-item"
                      onClick={() => openReport(report.id)}
                    >
                      <span className="pc-report-week">
                        <b>{report.week_label || `${report.week_start} – ${report.week_end}`}</b>
                        <small>
                          {report.student_name} · {report.generated_by}
                        </small>
                      </span>
                      <span className={`pc-chip ${report.inactive ? 'muted' : 'ok'}`}>
                        {report.inactive ? tr('pcInactive') : tr('pcActive')}
                      </span>
                      <span className={`pc-chip ${report.delivery_status === 'sent' ? 'ok' : 'warn'}`}>
                        {deliveryLabel(report.delivery_status)}
                      </span>
                      <span className="pc-view-link">{tr('pcViewReport')} ›</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      <div style={{ marginTop: '22px', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '18px' }}>
        <h3 className="po-block-title">💬 {tr('msgMessageTeacher')}</h3>
        <p className="po-small pc-muted">{tr('msgMessageTeacherHelp')}</p>
        <ParentMessages lang={lang} t={t} profile={profile} embedded />
      </div>
    </section>
  );
}
