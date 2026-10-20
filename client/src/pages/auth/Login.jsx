import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { IconEye, IconEyeOff } from '../../components/Icons';
import FirstLoginPasswordModal from '../../components/FirstLoginPasswordModal';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [pendingFirstLogin, setPendingFirstLogin] = useState(null);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    setEmail('');
    setPassword('');
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');
    setLoading(true);

    try {
      const res = await login(email, password);
      if (res?.must_change_password) {
        // First-time login: show popup without logging into the dashboard
        setPendingFirstLogin({ user: res.user, token: res.token });
        return;
      }
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFirstLoginSuccess = () => {
    // When password is changed, close popup and display the login form so the student signs in with new credentials
    setPendingFirstLogin(null);
    setPassword('');
    setSuccessMessage('Your password has been changed successfully! Please sign in with your new password to continue.');
  };

  return (
    <div className="auth-page">
      {pendingFirstLogin && (
        <FirstLoginPasswordModal
          user={pendingFirstLogin.user}
          token={pendingFirstLogin.token}
          onSuccess={handleFirstLoginSuccess}
          onClose={() => setPendingFirstLogin(null)}
        />
      )}

      <div className="auth-card">
        <h1>UI Student Clearance</h1>
        <p className="auth-subtitle">Sign in to continue</p>

        {successMessage && (
          <div
            className="notice"
            style={{
              marginBottom: '1.25rem',
              borderLeft: '4px solid #10b981',
              backgroundColor: '#ecfdf5',
              color: '#065f46',
              padding: '0.75rem 1rem',
              borderRadius: '4px',
              fontSize: '0.88rem',
              lineHeight: 1.4,
            }}
          >
            ✓ {successMessage}
          </div>
        )}

        {error && <div className="error">{error}</div>}

        <form onSubmit={handleSubmit} autoComplete="off">
          {/* Invisible inputs to prevent browser credential managers from pre-filling inputs */}
          <input type="text" name="fake_username_prevent_autofill" style={{ display: 'none' }} tabIndex={-1} aria-hidden="true" />
          <input type="password" name="fake_password_prevent_autofill" style={{ display: 'none' }} tabIndex={-1} aria-hidden="true" />

          <div className="form-group">
            <label>Email or Matric Number</label>
            <input
              type="text"
              name="matric_or_email"
              id="matric_or_email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="e.g. 230922 or student@ui.edu.ng"
              autoComplete="off"
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                name="user_access_password"
                id="user_access_password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{ paddingRight: '2.5rem' }}
                autoComplete="new-password"
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
                  justifyContent: 'center',
                }}
                title={showPassword ? 'Hide password' : 'View password'}
                aria-label={showPassword ? 'Hide password' : 'View password'}
              >
                {showPassword ? <IconEyeOff width={18} height={18} /> : <IconEye width={18} height={18} />}
              </button>
            </div>
          </div>

          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <p style={{ marginTop: '1rem', textAlign: 'center', color: '#666' }}>
          <Link to="/forgot-password">Forgot your password?</Link>
          <br />
          <span style={{ fontSize: '0.85rem' }}>Accounts are created by the clearance administrator.</span>
        </p>
      </div>
    </div>
  );
}
