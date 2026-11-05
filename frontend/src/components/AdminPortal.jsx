import React, { useState, useEffect } from 'react';
import { api } from '../services/api';

export default function AdminPortal({ lang = 'en', t }) {
  const [teachers, setTeachers] = useState([]);
  const [users, setUsers] = useState([]);
  const [activeTab, setActiveTab] = useState('teachers'); // 'teachers' | 'users'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // New Teacher Form State
  const [teacherName, setTeacherName] = useState('');
  const [teacherEmail, setTeacherEmail] = useState('');
  const [teacherPassword, setTeacherPassword] = useState('');
  const [teacherClass, setTeacherClass] = useState('Class 8 - Section A');
  const [creating, setCreating] = useState(false);

  // User Filter State
  const [selectedRole, setSelectedRole] = useState('');

  const loadData = async () => {
    try {
      setLoading(true);
      setError('');
      const [teachersList, usersList] = await Promise.all([
        api.getAdminTeachers().catch(() => []),
        api.getAdminUsers(selectedRole || null).catch(() => [])
      ]);
      setTeachers(teachersList);
      setUsers(usersList);
    } catch (err) {
      setError(err.message || 'Failed to load administrator data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedRole]);

  const handleCreateTeacher = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setCreating(true);

    try {
      if (teacherPassword.length < 6) {
        throw new Error('Teacher password must be at least 6 characters.');
      }
      const newTeacher = await api.createTeacher({
        full_name: teacherName.trim(),
        email: teacherEmail.trim(),
        password: teacherPassword,
        class_name: teacherClass
      });

      setSuccess(`Teacher account "${newTeacher.full_name}" (${newTeacher.email}) provisioned successfully with Argon2id credentials.`);
      setTeacherName('');
      setTeacherEmail('');
      setTeacherPassword('');
      loadData();
    } catch (err) {
      setError(err.message || 'Failed to create teacher account.');
    } finally {
      setCreating(false);
    }
  };

  const handleToggleStatus = async (teacherId, currentActive) => {
    try {
      setError('');
      setSuccess('');
      const updated = await api.updateTeacherStatus(teacherId, !currentActive);
      setSuccess(`Teacher account "${updated.full_name}" status updated to ${updated.is_active ? 'ACTIVE' : 'DEACTIVATED'}.`);
      loadData();
    } catch (err) {
      setError(err.message || 'Failed to update teacher account status.');
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 16px' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#f8fafc', margin: '0 0 4px 0' }}>
            ⚙️ Administrator Command Console
          </h1>
          <p style={{ color: '#94a3b8', margin: 0, fontSize: '0.9rem' }}>
            Manage staff credentials, enforce role-based access control, and monitor platform activity.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className={activeTab === 'teachers' ? 'on' : 'sec'}
            onClick={() => setActiveTab('teachers')}
            style={{ padding: '8px 16px', fontSize: '0.88rem' }}
          >
            👨‍🏫 Teacher Management ({teachers.length})
          </button>
          <button
            className={activeTab === 'users' ? 'on' : 'sec'}
            onClick={() => setActiveTab('users')}
            style={{ padding: '8px 16px', fontSize: '0.88rem' }}
          >
            👥 System Users ({users.length})
          </button>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div style={{ padding: '12px 16px', backgroundColor: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', borderRadius: '8px', color: '#fca5a5', marginBottom: '16px', fontSize: '0.9rem' }}>
          ⚠️ {error}
        </div>
      )}
      {success && (
        <div style={{ padding: '12px 16px', backgroundColor: 'rgba(16, 185, 129, 0.15)', border: '1px solid #10b981', borderRadius: '8px', color: '#6ee7b7', marginBottom: '16px', fontSize: '0.9rem' }}>
          ✓ {success}
        </div>
      )}

      {/* Tab 1: Teachers */}
      {activeTab === 'teachers' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 380px) 1fr', gap: '24px', alignItems: 'start' }}>
          {/* Create Teacher Card */}
          <div className="card" style={{ padding: '24px', backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '12px' }}>
            <h2 style={{ fontSize: '1.2rem', color: '#f8fafc', marginTop: 0, marginBottom: '8px' }}>
              ➕ Provision Teacher Account
            </h2>
            <p style={{ fontSize: '0.82rem', color: '#94a3b8', marginBottom: '18px' }}>
              Teachers cannot register publicly. Only authorized administrators can provision educator credentials.
            </p>

            <form onSubmit={handleCreateTeacher}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', color: '#cbd5e1', marginBottom: '4px' }}>
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={teacherName}
                  onChange={(e) => setTeacherName(e.target.value)}
                  placeholder="e.g. Dr. Lakshmi Rao"
                  style={{ width: '100%', padding: '10px', backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '6px', color: '#fff' }}
                />
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', color: '#cbd5e1', marginBottom: '4px' }}>
                  Email Address *
                </label>
                <input
                  type="email"
                  required
                  value={teacherEmail}
                  onChange={(e) => setTeacherEmail(e.target.value)}
                  placeholder="e.g. lakshmi.rao@udaan.edu"
                  style={{ width: '100%', padding: '10px', backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '6px', color: '#fff' }}
                />
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', color: '#cbd5e1', marginBottom: '4px' }}>
                  Initial Password * (min. 6 chars)
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={teacherPassword}
                  onChange={(e) => setTeacherPassword(e.target.value)}
                  placeholder="Enter initial password"
                  style={{ width: '100%', padding: '10px', backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '6px', color: '#fff' }}
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', color: '#cbd5e1', marginBottom: '4px' }}>
                  Assigned Class / Cohort
                </label>
                <input
                  type="text"
                  value={teacherClass}
                  onChange={(e) => setTeacherClass(e.target.value)}
                  placeholder="Class 8 - Section A"
                  style={{ width: '100%', padding: '10px', backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '6px', color: '#fff' }}
                />
              </div>

              <button
                type="submit"
                disabled={creating}
                style={{
                  width: '100%',
                  padding: '12px',
                  backgroundColor: '#8a4bff',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 'bold',
                  cursor: creating ? 'wait' : 'pointer'
                }}
              >
                {creating ? 'Creating...' : 'Create Teacher Account'}
              </button>
            </form>
          </div>

          {/* Teachers List Table */}
          <div className="card" style={{ padding: '24px', backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '12px', overflowX: 'auto' }}>
            <h2 style={{ fontSize: '1.2rem', color: '#f8fafc', marginTop: 0, marginBottom: '16px' }}>
              📋 Authorized Teachers ({teachers.length})
            </h2>

            {loading && <div style={{ color: '#94a3b8', padding: '16px' }}>Loading teachers...</div>}

            {!loading && teachers.length === 0 && (
              <div style={{ color: '#94a3b8', padding: '24px', textAlign: 'center' }}>
                No teacher accounts found. Use the form to provision the first teacher.
              </div>
            )}

            {!loading && teachers.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #334155', textAlign: 'left', color: '#94a3b8' }}>
                    <th style={{ padding: '10px' }}>Teacher</th>
                    <th style={{ padding: '10px' }}>Email</th>
                    <th style={{ padding: '10px' }}>Class</th>
                    <th style={{ padding: '10px' }}>Status</th>
                    <th style={{ padding: '10px' }}>Created By</th>
                    <th style={{ padding: '10px' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {teachers.map((t) => (
                    <tr key={t.id} style={{ borderBottom: '1px solid #1e293b' }}>
                      <td style={{ padding: '12px 10px', color: '#f8fafc', fontWeight: 600 }}>
                        {t.full_name}
                      </td>
                      <td style={{ padding: '12px 10px', color: '#94a3b8' }}>{t.email}</td>
                      <td style={{ padding: '12px 10px', color: '#38bdf8' }}>{t.class_name || 'Class 8'}</td>
                      <td style={{ padding: '12px 10px' }}>
                        <span style={{
                          padding: '3px 8px',
                          borderRadius: '12px',
                          fontSize: '0.74rem',
                          fontWeight: 'bold',
                          backgroundColor: t.is_active ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                          color: t.is_active ? '#34d399' : '#f87171'
                        }}>
                          {t.is_active ? '● Active' : '○ Deactivated'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 10px', color: '#64748b', fontSize: '0.8rem' }}>
                        {t.created_by || 'system'}
                      </td>
                      <td style={{ padding: '12px 10px' }}>
                        <button
                          onClick={() => handleToggleStatus(t.id, t.is_active)}
                          style={{
                            padding: '4px 10px',
                            fontSize: '0.78rem',
                            borderRadius: '6px',
                            border: t.is_active ? '1px solid #ef4444' : '1px solid #10b981',
                            backgroundColor: 'transparent',
                            color: t.is_active ? '#fca5a5' : '#6ee7b7',
                            cursor: 'pointer'
                          }}
                        >
                          {t.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: All Users Directory */}
      {activeTab === 'users' && (
        <div className="card" style={{ padding: '24px', backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
            <h2 style={{ fontSize: '1.2rem', color: '#f8fafc', margin: 0 }}>
              👥 User Directory & Role Registry ({users.length})
            </h2>
            <div style={{ display: 'flex', gap: '8px' }}>
              {['', 'student', 'teacher', 'admin', 'author', 'parent'].map((role) => (
                <button
                  key={role}
                  className={selectedRole === role ? 'on' : 'sec'}
                  onClick={() => setSelectedRole(role)}
                  style={{ padding: '6px 12px', fontSize: '0.78rem' }}
                >
                  {role ? role.toUpperCase() : 'ALL'}
                </button>
              ))}
            </div>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #334155', textAlign: 'left', color: '#94a3b8' }}>
                <th style={{ padding: '10px' }}>ID</th>
                <th style={{ padding: '10px' }}>Name</th>
                <th style={{ padding: '10px' }}>Email</th>
                <th style={{ padding: '10px' }}>Role</th>
                <th style={{ padding: '10px' }}>Class</th>
                <th style={{ padding: '10px' }}>Status</th>
                <th style={{ padding: '10px' }}>Created</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} style={{ borderBottom: '1px solid #1e293b' }}>
                  <td style={{ padding: '10px', color: '#64748b' }}>#{u.id}</td>
                  <td style={{ padding: '10px', color: '#f8fafc', fontWeight: 600 }}>{u.full_name}</td>
                  <td style={{ padding: '10px', color: '#94a3b8' }}>{u.email}</td>
                  <td style={{ padding: '10px' }}>
                    <span style={{
                      padding: '2px 8px',
                      borderRadius: '8px',
                      fontSize: '0.74rem',
                      fontWeight: 600,
                      backgroundColor:
                        u.role === 'admin' ? 'rgba(239, 68, 68, 0.2)' :
                        u.role === 'teacher' ? 'rgba(138, 75, 255, 0.2)' :
                        u.role === 'author' ? 'rgba(251, 146, 60, 0.2)' :
                        u.role === 'parent' ? 'rgba(234, 179, 8, 0.2)' :
                        'rgba(0, 242, 254, 0.2)',
                      color:
                        u.role === 'admin' ? '#f87171' :
                        u.role === 'teacher' ? '#c084fc' :
                        u.role === 'author' ? '#fb923c' :
                        u.role === 'parent' ? '#fde047' :
                        '#38bdf8'
                    }}>
                      {u.role.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: '10px', color: '#94a3b8' }}>{u.class_name || '—'}</td>
                  <td style={{ padding: '10px' }}>
                    <span style={{ color: u.is_active ? '#34d399' : '#f87171', fontSize: '0.8rem' }}>
                      {u.is_active ? 'Active' : 'Deactivated'}
                    </span>
                  </td>
                  <td style={{ padding: '10px', color: '#64748b', fontSize: '0.78rem' }}>
                    {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
