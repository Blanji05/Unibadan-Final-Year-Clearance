import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { authApi } from '../../services/api';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await authApi.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Choose a new password</h1>

        {!token ? (
          <>
            <div className="error">This reset link is incomplete. Request a new one.</div>
            <p style={{ textAlign: 'center' }}>
              <Link to="/forgot-password">Request a reset link</Link>
            </p>
          </>
        ) : done ? (
          <>
            <div className="notice">Password updated. You can now sign in.</div>
            <p style={{ textAlign: 'center', marginTop: '1rem' }}>
              <Link to="/login">Go to sign in</Link>
            </p>
          </>
        ) : (
          <>
            <p style={{ color: '#666' }}>At least 8 characters, including a number.</p>
            {error && <div className="error">{error}</div>}
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>New password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                  required
                  autoComplete="new-password"
                />
              </div>
              <div className="form-group">
                <label>Confirm password</label>
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  minLength={8}
                  required
                  autoComplete="new-password"
                />
              </div>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Saving…' : 'Update password'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

