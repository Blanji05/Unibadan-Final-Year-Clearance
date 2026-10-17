import React from 'react';

/**
 * Catches unhandled runtime rendering errors in any component so that the user
 * sees an actionable recovery UI rather than a blank white screen.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Unhandled UI Error caught by ErrorBoundary:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#f8fafc',
            padding: '1.5rem',
          }}
        >
          <div
            style={{
              maxWidth: '520px',
              width: '100%',
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              padding: '2rem',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
              border: '1px solid #e2e8f0',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                backgroundColor: '#fee2e2',
                color: '#dc2626',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.5rem',
                margin: '0 auto 1rem',
              }}
            >
              ⚠️
            </div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#0f172a', marginBottom: '0.5rem' }}>
              Something went wrong loading this view
            </h2>
            <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '1.25rem', lineHeight: 1.5 }}>
              {this.state.error?.message || 'An unexpected rendering error occurred. Please refresh to try again.'}
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={this.handleReload}
                style={{ padding: '0.5rem 1.25rem', fontSize: '0.875rem' }}
              >
                Reload Page
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={this.handleReset}
                style={{ padding: '0.5rem 1.25rem', fontSize: '0.875rem' }}
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

