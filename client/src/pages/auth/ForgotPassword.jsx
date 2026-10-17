import { useState } from 'react';
import { Link } from 'react-router-dom';
import { authApi } from '../../services/api';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await authApi.forgotPassword(email);
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Reset your password</h1>

        {sent ? (
          <>
            <div className="notice">
              If an account exists for <strong>{email}</strong>, a reset link is on its way. It works once and
              expires in 60 minutes.
            </div>
            <p style={{ marginTop: '1rem', textAlign: 'center' }}>
              <Link to="/login">Back to sign in</Link>
            </p>
          </>
        ) : (
          <>
            <p style={{ color: '#666' }}>Enter your account email and we'll send you a reset link.</p>
            {error && <div className="error">{error}</div>}
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="your.email@ui.edu.ng"
                />
              </div>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Sending…' : 'Send reset link'}
              </button>
            </form>
            <p style={{ marginTop: '1rem', textAlign: 'center' }}>
              <Link to="/login">Back to sign in</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

