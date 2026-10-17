import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { authApi } from '../services/api';
import { IconEye, IconEyeOff, IconLock } from './Icons';

export default function FirstLoginPasswordModal() {
  const { user, updateUser } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  if (!user || user.role !== 'student' || !user.must_change_password) {
    return null;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (!/\d/.test(password)) {
      setError('Password must contain at least one digit or number.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match. Please re-enter.');
      return;
    }

    try {
      setBusy(true);
      const res = await authApi.changeInitialPassword(password);
      setSuccess(res.message || 'Password updated successfully! A confirmation email has been dispatched.');
      setTimeout(() => {
        updateUser({ must_change_password: false });
      }, 1200);
    } catch (err) {
      setError(err.message || 'Failed to update password.');
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(4px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: '500px',
          backgroundColor: '#ffffff',
          borderRadius: '8px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1)',
          padding: '2rem',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
          <div
            style={{
              width: '52px',
              height: '52px',
              borderRadius: '50%',
              backgroundColor: '#e0f2fe',
              color: '#0369a1',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '0.75rem',
            }}
          >
            <IconLock width={26} height={26} />
          </div>
          <h2 style={{ margin: 0, fontSize: '1.35rem', color: '#0f172a' }}>
            First-Time Login: Set Your Password
          </h2>
          <p style={{ margin: '0.4rem 0 0', fontSize: '0.88rem', color: '#64748b', lineHeight: 1.5 }}>
            Welcome, <strong>{user.full_name}</strong>! As a security requirement for newly uploaded accounts, you must change your initial temporary password to a personal password.
          </p>
        </div>

        <div
          style={{
            backgroundColor: '#fef7ee',
            border: '1px solid #e6decb',
            borderRadius: '6px',
            padding: '0.75rem 1rem',
            fontSize: '0.82rem',
            color: '#78350f',
            marginBottom: '1.25rem',
          }}
        >
          📧 A confirmation notification will be sent to your institutional email:
          <div style={{ fontWeight: '600', marginTop: '0.2rem' }}>{user.email}</div>
        </div>

        {error && <div className="error" style={{ marginBottom: '1rem' }}>{error}</div>}
        {success && <div className="notice" style={{ marginBottom: '1rem', borderLeft: '4px solid #10b981' }}>{success}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <label>New Password (min. 8 characters with at least one number)</label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter new password…"
                required
                style={{ paddingRight: '2.5rem' }}
                disabled={busy || Boolean(success)}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                style={{
                  position: 'absolute',
                  right: '0.65rem',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '0.25rem',
                  color: '#64748b',
                  display: 'flex',
                  alignItems: 'center',
                }}
                title={showPassword ? 'Hide password' : 'View password'}
              >
                {showPassword ? <IconEyeOff width={18} height={18} /> : <IconEye width={18} height={18} />}
              </button>
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: '1.5rem' }}>
            <label>Confirm New Password</label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password…"
                required
                style={{ paddingRight: '2.5rem' }}
                disabled={busy || Boolean(success)}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((v) => !v)}
                style={{
                  position: 'absolute',
                  right: '0.65rem',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '0.25rem',
                  color: '#64748b',
                  display: 'flex',
                  alignItems: 'center',
                }}
                title={showConfirmPassword ? 'Hide password' : 'View password'}
              >
                {showConfirmPassword ? <IconEyeOff width={18} height={18} /> : <IconEye width={18} height={18} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', padding: '0.65rem', fontSize: '0.95rem' }}
            disabled={busy || Boolean(success)}
          >
            {busy ? 'Saving & Sending Email…' : 'Save New Password & Continue'}
          </button>
        </form>
      </div>
    </div>
  );
}

