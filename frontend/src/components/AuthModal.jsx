import React, { useState } from 'react';
import { api, setToken } from '../services/api';

export default function AuthModal({ isOpen, onClose, onAuthSuccess, onOpenParentOnboarding, initialMode = 'login', lang = 'en', t }) {
  const [mode, setMode] = useState(initialMode); // 'login' | 'register' | 'parent-register' | 'parent-otp' | 'parent-forgot' | 'parent-reset'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [className, setClassName] = useState('Class 8 - Section A');
  const [grade, setGrade] = useState(8);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Parent OTP state
  const [parentEmail, setParentEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [otpCooldown, setOtpCooldown] = useState(0);
  const [resetOtp, setResetOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [connectionCode, setConnectionCode] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [teacherDetails, setTeacherDetails] = useState('');

  if (!isOpen) return null;

  const startCooldown = (secs = 60) => {
    setOtpCooldown(secs);
    const interval = setInterval(() => {
      setOtpCooldown((prev) => {
        if (prev <= 1) { clearInterval(interval); return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  const switchMode = (m) => { setMode(m); setError(''); setSuccessMsg(''); };

  const quickDemoAccounts = [
    { label: '🎓 Student', email: 'student@udaan.edu', role: 'student', desc: 'Aarav Sharma' },
    { label: '👨‍👩‍👧 Parent', email: 'parent@udaan.edu', role: 'parent', desc: 'Sunita Sharma (Parent)' },
    { label: '👨‍🏫 Teacher', email: 'teacher@udaan.edu', role: 'teacher', desc: 'Dr. Lakshmi Rao' },
    { label: '⚙️ Admin', email: 'admin@udaan.edu', role: 'admin', desc: 'UDAAN Admin' },
    { label: '📝 Author', email: 'author@udaan.edu', role: 'author', desc: 'Prof. Ramanujan' }
  ];

  const handleQuickFill = (acc) => {
    setEmail(acc.email);
    setPassword('udaan123');
    setError('');
    setSuccessMsg(`Selected demo credentials for ${acc.label}. Click "Sign In" below.`);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setLoading(true);

    try {
      if (mode === 'login') {
        const res = await api.login(email.trim(), password);
        setToken(res.access_token);
        if (onAuthSuccess) onAuthSuccess(res.user, res.access_token);
        onClose();
      } else if (mode === 'register') {
        // Student Registration
        if (password.length < 6) throw new Error('Password must be at least 6 characters long.');
        if (!fullName.trim()) throw new Error('Full Name is required for registration.');
        const res = await api.registerStudent({
          email: email.trim(),
          password,
          full_name: fullName.trim(),
          class_name: className,
          grade: Number(grade)
        });
        setToken(res.access_token);
        if (onAuthSuccess) onAuthSuccess(res.user, res.access_token);
        onClose();
      }
    } catch (err) {
      setError(err.message || 'Authentication failed. Please verify credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleParentRegister = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    if (!fullName.trim()) return setError('Full name is required.');
    if (!parentEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parentEmail.trim()))
      return setError('Please enter a valid email address.');
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    if (password !== confirmPassword) return setError('Passwords do not match.');
    setLoading(true);
    try {
      await api.registerParent({
        full_name: fullName.trim(),
        email: parentEmail.trim(),
        password,
        confirm_password: confirmPassword,
        connection_code: connectionCode.trim() || undefined,
        school_name: schoolName.trim() || undefined,
        teacher_details: teacherDetails.trim() || undefined,
      });
      setSuccessMsg(`OTP sent to ${parentEmail.trim()}. Check your inbox.`);
      startCooldown(60);
      switchMode('parent-otp');
    } catch (err) {
      setError(err.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleParentOtpVerify = async (e) => {
    e.preventDefault();
    setError('');
    if (otp.trim().length !== 6) return setError('Please enter the 6-digit OTP from your email.');
    setLoading(true);
    try {
      const res = await api.verifyParentOtp({ email: parentEmail.trim(), otp: otp.trim() });
      setToken(res.access_token);
      if (onAuthSuccess) onAuthSuccess(res.user, res.access_token);
      onClose();
    } catch (err) {
      setError(err.message || 'OTP verification failed. Please check and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (otpCooldown > 0) return;
    setError('');
    setLoading(true);
    try {
      await api.resendParentOtp(parentEmail.trim());
      setSuccessMsg('New OTP sent to your email.');
      startCooldown(60);
    } catch (err) {
      setError(err.message || 'Could not resend OTP. Please try again shortly.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setError('');
    if (!parentEmail.trim()) return setError('Please enter your registered email address.');
    setLoading(true);
    try {
      await api.forgotParentPassword(parentEmail.trim());
      setSuccessMsg('If that email is registered, a reset OTP has been sent.');
      startCooldown(60);
      switchMode('parent-reset');
    } catch (err) {
      setError(err.message || 'Could not send reset OTP.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError('');
    if (resetOtp.trim().length !== 6) return setError('Enter the 6-digit OTP from your email.');
    if (newPassword.length < 8) return setError('Password must be at least 8 characters.');
    setLoading(true);
    try {
      await api.resetParentPassword({
        email: parentEmail.trim(),
        otp: resetOtp.trim(),
        new_password: newPassword,
        confirm_password: newPassword,
      });
      setSuccessMsg('Password reset successfully. You can now sign in.');
      switchMode('login');
    } catch (err) {
      setError(err.message || 'Password reset failed.');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    width: '100%', padding: '10px 12px',
    backgroundColor: '#1e293b', border: '1px solid #475569',
    borderRadius: '8px', color: '#ffffff', fontSize: '0.9rem',
    boxSizing: 'border-box'
  };
  const labelStyle = { display: 'block', fontSize: '0.82rem', color: '#cbd5e1', marginBottom: '4px' };

  return (
    <div className="modal-backdrop" style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(5, 7, 15, 0.85)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: '16px'
    }}>
      <div className="card" style={{
        maxWidth: '480px', width: '100%',
        backgroundColor: '#0f172a', border: '1px solid #334155',
        borderRadius: '16px', padding: '28px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
        position: 'relative', maxHeight: '90vh', overflowY: 'auto'
      }}>
        {/* Close Button */}
        <button onClick={onClose} style={{
          position: 'absolute', top: '16px', right: '16px',
          background: 'none', border: 'none', color: '#94a3b8',
          fontSize: '1.25rem', cursor: 'pointer', padding: '4px 8px'
        }} aria-label="Close">✕</button>

        {/* Title & Brand */}
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <span style={{ fontSize: '1.6rem' }}>✈️</span>
            <span style={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#f8fafc', letterSpacing: '0.05em' }}>UDAAN</span>
          </div>
          <p style={{ margin: 0, fontSize: '0.88rem', color: '#94a3b8' }}>
            {mode === 'login' ? 'Secure Role-Based Portal Access'
              : mode === 'register' ? 'Create New Student Account'
              : mode === 'parent-register' ? 'Parent Registration'
              : mode === 'parent-otp' ? 'Email Verification'
              : mode === 'parent-forgot' ? 'Forgot Password'
              : 'Reset Password'}
          </p>
        </div>

        {/* ── Tabs: Sign In / Student Register / Parent Register ── */}
        {(mode === 'login' || mode === 'register' || mode === 'parent-register') && (
          <div style={{
            display: 'flex', backgroundColor: '#1e293b',
            borderRadius: '10px', padding: '4px', marginBottom: '20px'
          }}>
            {[
              { key: 'login', label: 'Sign In', color: '#8a4bff', textDark: false },
              { key: 'register', label: 'Student', color: '#00f2fe', textDark: true },
              { key: 'parent-register', label: '👨‍👩‍👧 Parent', color: '#10b981', textDark: true },
            ].map(({ key, label, color, textDark }) => (
              <button key={key} type="button"
                onClick={() => switchMode(key)}
                style={{
                  flex: 1, padding: '8px', border: 'none', borderRadius: '8px',
                  backgroundColor: mode === key ? color : 'transparent',
                  color: mode === key ? (textDark ? '#0f172a' : '#ffffff') : '#94a3b8',
                  fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem', transition: 'all 0.2s'
                }}
              >{label}</button>
            ))}
          </div>
        )}

        {/* Status Banners */}
        {error && (
          <div style={{
            padding: '10px 14px', backgroundColor: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid #ef4444', borderRadius: '8px',
            color: '#fca5a5', fontSize: '0.85rem', marginBottom: '14px'
          }}>⚠️ {error}</div>
        )}
        {successMsg && (
          <div style={{
            padding: '8px 12px', backgroundColor: 'rgba(16, 185, 129, 0.15)',
            border: '1px solid #10b981', borderRadius: '8px',
            color: '#6ee7b7', fontSize: '0.82rem', marginBottom: '14px'
          }}>✓ {successMsg}</div>
        )}

        {/* ── LOGIN FORM ── */}
        {mode === 'login' && (
          <>
            <div style={{
              marginBottom: '18px', padding: '12px', backgroundColor: '#1e293b',
              borderRadius: '10px', border: '1px dashed #475569'
            }}>
              <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginBottom: '8px', fontWeight: 600 }}>
                ⚡ ONE-CLICK DEMO CREDENTIALS (ARGON2id VERIFIED):
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' }}>
                {quickDemoAccounts.map((acc) => (
                  <button key={acc.email} type="button" onClick={() => handleQuickFill(acc)}
                    style={{
                      padding: '6px 8px', fontSize: '0.76rem', textAlign: 'left',
                      backgroundColor: email === acc.email ? '#334155' : '#0f172a',
                      border: email === acc.email ? '1px solid #8a4bff' : '1px solid #1e293b',
                      borderRadius: '6px', color: '#e2e8f0', cursor: 'pointer'
                    }}>
                    <div style={{ fontWeight: 'bold' }}>{acc.label}</div>
                    <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>{acc.desc}</div>
                  </button>
                ))}
              </div>
            </div>
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '14px' }}>
                <label style={labelStyle}>Email Address *</label>
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. student@udaan.edu" style={inputStyle} />
              </div>
              <div style={{ marginBottom: '18px' }}>
                <label style={labelStyle}>Password *</label>
                <input type="password" required minLength={6} value={password}
                  onChange={(e) => setPassword(e.target.value)} placeholder="Enter password" style={inputStyle} />
              </div>
              <button type="submit" disabled={loading} style={{
                width: '100%', padding: '12px', backgroundColor: '#8a4bff',
                color: '#ffffff', border: 'none', borderRadius: '8px',
                fontWeight: 'bold', fontSize: '0.95rem', cursor: loading ? 'wait' : 'pointer',
                opacity: loading ? 0.7 : 1, boxShadow: '0 4px 12px rgba(138, 75, 255, 0.3)'
              }}>
                {loading ? 'Signing in…' : 'Sign In'}
              </button>
              <div style={{ textAlign: 'center', marginTop: '12px' }}>
                <button type="button" onClick={() => { setParentEmail(''); switchMode('parent-forgot'); }}
                  style={{ background: 'none', border: 'none', color: '#10b981', cursor: 'pointer', fontSize: '0.82rem' }}>
                  Forgot parent password?
                </button>
              </div>
            </form>
          </>
        )}

        {/* ── STUDENT REGISTER FORM ── */}
        {mode === 'register' && (
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>Student Full Name *</label>
              <input type="text" required value={fullName} onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Aarav Sharma" style={inputStyle} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px', marginBottom: '14px' }}>
              <div>
                <label style={labelStyle}>Class & Section</label>
                <input type="text" value={className} onChange={(e) => setClassName(e.target.value)}
                  placeholder="Class 8 - Section A" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Grade</label>
                <input type="number" min="1" max="12" value={grade}
                  onChange={(e) => setGrade(e.target.value)} style={inputStyle} />
              </div>
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>Email Address *</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. student@udaan.edu" style={inputStyle} />
            </div>
            <div style={{ marginBottom: '18px' }}>
              <label style={labelStyle}>Password * <span style={{ color: '#94a3b8' }}>(min. 6 characters)</span></label>
              <input type="password" required minLength={6} value={password}
                onChange={(e) => setPassword(e.target.value)} placeholder="Enter password" style={inputStyle} />
            </div>
            <div style={{ fontSize: '0.74rem', color: '#94a3b8', marginBottom: '16px', lineHeight: 1.4 }}>
              ℹ️ Self-registration is for students. Teacher accounts are provisioned by administration.
            </div>
            <button type="submit" disabled={loading} style={{
              width: '100%', padding: '12px', backgroundColor: '#00f2fe', color: '#0f172a',
              border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '0.95rem',
              cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1
            }}>
              {loading ? 'Registering…' : 'Complete Registration'}
            </button>
          </form>
        )}

        {/* ── PARENT REGISTER FORM ── */}
        {mode === 'parent-register' && (
          <form onSubmit={handleParentRegister}>
            <div style={{
              padding: '10px 14px', backgroundColor: 'rgba(16,185,129,0.1)',
              border: '1px solid #10b981', borderRadius: '8px',
              color: '#6ee7b7', fontSize: '0.82rem', marginBottom: '16px'
            }}>
              👨‍👩‍👧 Create a free ParentConnect account to receive weekly progress reports for your child.
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>Student Connection Code <span style={{ color: '#94a3b8' }}>(e.g. UD-XXXXXXXX from your child)</span></label>
              <input type="text" value={connectionCode} onChange={(e) => setConnectionCode(e.target.value.toUpperCase())}
                placeholder="e.g. UD-7K9A2M4X" style={{ ...inputStyle, letterSpacing: '0.1em', fontWeight: 600 }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
              <div>
                <label style={labelStyle}>School Name <span style={{ color: '#94a3b8' }}>(Optional)</span></label>
                <input type="text" value={schoolName} onChange={(e) => setSchoolName(e.target.value)}
                  placeholder="e.g. ZPHS School" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Teacher Details <span style={{ color: '#94a3b8' }}>(Optional)</span></label>
                <input type="text" value={teacherDetails} onChange={(e) => setTeacherDetails(e.target.value)}
                  placeholder="e.g. Sharma Sir" style={inputStyle} />
              </div>
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>Parent / Guardian Full Name *</label>
              <input type="text" required value={fullName} onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Priya Sharma" style={inputStyle} />
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>Email Address * <span style={{ color: '#94a3b8' }}>(will receive OTP)</span></label>
              <input type="email" required value={parentEmail} onChange={(e) => setParentEmail(e.target.value)}
                placeholder="e.g. priya@gmail.com" style={inputStyle} />
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>Password * <span style={{ color: '#94a3b8' }}>(min. 8 characters)</span></label>
              <input type="password" required minLength={8} value={password}
                onChange={(e) => setPassword(e.target.value)} placeholder="Create a strong password" style={inputStyle} />
            </div>
            <div style={{ marginBottom: '18px' }}>
              <label style={labelStyle}>Confirm Password *</label>
              <input type="password" required minLength={8} value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Re-enter password" style={inputStyle} />
            </div>
            <button type="submit" disabled={loading} style={{
              width: '100%', padding: '12px', backgroundColor: '#10b981', color: '#0f172a',
              border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '0.95rem',
              cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1
            }}>
              {loading ? 'Sending OTP…' : 'Register & Send OTP'}
            </button>
            <p style={{ textAlign: 'center', marginTop: '10px', fontSize: '0.78rem', color: '#64748b' }}>
              A 6-digit OTP will be emailed to verify your address.
            </p>
          </form>
        )}

        {/* ── PARENT OTP VERIFICATION ── */}
        {mode === 'parent-otp' && (
          <form onSubmit={handleParentOtpVerify}>
            <div style={{
              padding: '12px 14px', backgroundColor: 'rgba(16,185,129,0.1)',
              border: '1px solid #10b981', borderRadius: '8px',
              color: '#6ee7b7', fontSize: '0.85rem', marginBottom: '20px', textAlign: 'center'
            }}>
              📧 Check your inbox at <strong>{parentEmail}</strong><br />
              <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Enter the 6-digit code sent to your email</span>
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label style={labelStyle}>6-Digit OTP *</label>
              <input type="text" required value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="e.g. 482917" maxLength={6} inputMode="numeric"
                style={{ ...inputStyle, fontSize: '1.4rem', letterSpacing: '0.3em', textAlign: 'center' }} />
            </div>
            <button type="submit" disabled={loading} style={{
              width: '100%', padding: '12px', backgroundColor: '#10b981', color: '#0f172a',
              border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '0.95rem',
              cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1, marginBottom: '10px'
            }}>
              {loading ? 'Verifying…' : 'Verify & Login'}
            </button>
            <div style={{ textAlign: 'center' }}>
              <button type="button" onClick={handleResendOtp} disabled={loading || otpCooldown > 0}
                style={{
                  background: 'none', border: 'none', fontSize: '0.82rem',
                  color: otpCooldown > 0 ? '#475569' : '#10b981',
                  cursor: otpCooldown > 0 ? 'default' : 'pointer'
                }}>
                {otpCooldown > 0 ? `Resend OTP in ${otpCooldown}s` : 'Resend OTP'}
              </button>
              <span style={{ color: '#475569', margin: '0 8px' }}>·</span>
              <button type="button" onClick={() => switchMode('parent-register')}
                style={{ background: 'none', border: 'none', fontSize: '0.82rem', color: '#94a3b8', cursor: 'pointer' }}>
                Change email
              </button>
            </div>
          </form>
        )}

        {/* ── PARENT FORGOT PASSWORD ── */}
        {mode === 'parent-forgot' && (
          <form onSubmit={handleForgotPassword}>
            <div style={{ marginBottom: '16px', fontSize: '0.85rem', color: '#94a3b8' }}>
              Enter your registered parent email and we'll send a password-reset OTP.
            </div>
            <div style={{ marginBottom: '18px' }}>
              <label style={labelStyle}>Registered Email *</label>
              <input type="email" required value={parentEmail} onChange={(e) => setParentEmail(e.target.value)}
                placeholder="e.g. priya@gmail.com" style={inputStyle} />
            </div>
            <button type="submit" disabled={loading} style={{
              width: '100%', padding: '12px', backgroundColor: '#8a4bff', color: '#fff',
              border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '0.95rem',
              cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1, marginBottom: '10px'
            }}>
              {loading ? 'Sending…' : 'Send Reset OTP'}
            </button>
            <div style={{ textAlign: 'center' }}>
              <button type="button" onClick={() => switchMode('login')}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '0.82rem' }}>
                ← Back to Sign In
              </button>
            </div>
          </form>
        )}

        {/* ── PARENT RESET PASSWORD ── */}
        {mode === 'parent-reset' && (
          <form onSubmit={handleResetPassword}>
            <div style={{
              padding: '10px 14px', backgroundColor: 'rgba(138,75,255,0.1)',
              border: '1px solid #8a4bff', borderRadius: '8px',
              color: '#c4b5fd', fontSize: '0.82rem', marginBottom: '16px'
            }}>
              📧 Reset OTP sent to <strong>{parentEmail}</strong>
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>OTP from Email *</label>
              <input type="text" required value={resetOtp}
                onChange={(e) => setResetOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="6-digit code" maxLength={6} inputMode="numeric"
                style={{ ...inputStyle, fontSize: '1.2rem', letterSpacing: '0.2em', textAlign: 'center' }} />
            </div>
            <div style={{ marginBottom: '18px' }}>
              <label style={labelStyle}>New Password * <span style={{ color: '#94a3b8' }}>(min. 8 characters)</span></label>
              <input type="password" required minLength={8} value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)} placeholder="Enter new password" style={inputStyle} />
            </div>
            <button type="submit" disabled={loading} style={{
              width: '100%', padding: '12px', backgroundColor: '#8a4bff', color: '#fff',
              border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '0.95rem',
              cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1, marginBottom: '10px'
            }}>
              {loading ? 'Resetting…' : 'Reset Password'}
            </button>
            <div style={{ textAlign: 'center' }}>
              <button type="button" onClick={() => switchMode('login')}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '0.82rem' }}>
                ← Back to Sign In
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
