import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { IconEye, IconEyeOff } from '../../components/Icons';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>UI Student Clearance</h1>
        <p className="auth-subtitle">Sign in to continue</p>

        {error && <div className="error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Email or Matric Number</label>
            <input
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="e.g. 230922 or student@ui.edu.ng"
              autoComplete="username"
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{ paddingRight: '2.5rem' }}
                autoComplete="current-password"
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
