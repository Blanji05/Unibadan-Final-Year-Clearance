import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  IconCheck,
  IconClock,
  IconAward,
  IconFile,
  IconUsers,
  IconUpload,
  IconChevronRight,
  IconMenu,
  IconX,
  IconLock,
  IconBell,
  IconCamera,
} from '../components/Icons';

export default function Home() {
  const { user } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeFaq, setActiveFaq] = useState(null);

  const dashboardPath = user
    ? user.role === 'student'
      ? '/student'
      : user.role === 'officer'
      ? '/officer'
      : '/admin'
    : '/login';

  const stages = [
    {
      num: 1,
      name: 'Kenneth Dike Library (KDL)',
      loc: 'KDL Main Building',
      desc: 'First clearance stage. Return outstanding books, settle overdue library fines, and verify KDL ID card sign-off.',
      tag: 'Entry Stage (Parallel)',
      time: '~30 mins',
    },
    {
      num: 2,
      name: 'Caution and Hall Clearance',
      loc: 'Hostel & Maintenance Office',
      desc: 'Required for all students. Room clearance, maintenance stamp, all session tuition receipts, and off-campus form if applicable.',
      tag: 'Entry Stage (Parallel)',
      time: '1–2 days',
    },
    {
      num: 3,
      name: 'Jaja Health Clinic',
      loc: 'University Health Services',
      desc: 'Fastest verification. Present your original Jaja Clinic registration card for stamping and health records audit.',
      tag: 'Entry Stage (Parallel)',
      time: '~15 mins',
    },
    {
      num: 4,
      name: 'UI Alumni Association',
      loc: 'Opposite Queen Elizabeth Hall',
      desc: 'Verification of ₦1,000 alumni dues payment and completion of online membership form at alumni.ui.edu.ng.',
      tag: 'Entry Stage (Parallel)',
      time: '~30 mins',
    },
    {
      num: 5,
      name: 'Departmental Clearance',
      loc: 'Academic Department Office',
      desc: 'Academic coursework sign-off, final year project defense confirmation, and departmental association dues.',
      tag: 'Entry Stage (Parallel)',
      time: '1–2 days',
    },
    {
      num: 6,
      name: 'Sports Council',
      loc: 'Beside Faculty of Education',
      desc: 'Sports equipment return audit, dues settlement, and sports council verification sign-off.',
      tag: 'Requires 1, 2, 4',
      time: '~30 mins',
    },
    {
      num: 7,
      name: 'Faculty Office',
      loc: 'Faculty Office Secretariat',
      desc: 'Consolidation of Departmental, Sports, Library, Hall, and Alumni clearances by the Faculty Clearance Officer.',
      tag: 'Requires 1, 2, 4, 5, 6',
      time: '1–2 days',
    },
    {
      num: 8,
      name: 'Lodgings Clearance',
      loc: 'Student Affairs (Behind Central Admin)',
      desc: 'Student Affairs lodgings audit verifying hall accommodation and preceding clearance clearances before Bursary.',
      tag: 'Requires 1–7',
      time: '1 day',
    },
    {
      num: 9,
      name: 'Bursary Office',
      loc: 'Bursar Office',
      desc: 'Comprehensive multi-year financial audit covering all school fee receipts from 100L through final year and graduation fee.',
      tag: 'Requires 1–8',
      time: '2–3 days',
    },
    {
      num: 10,
      name: 'Student Affairs Division (Final)',
      loc: 'Central Administration',
      desc: 'Final University Clearance. Formal release and digital issuance of your official graduation clearance certificate.',
      tag: 'Final Stage (Requires 1–9)',
      time: '1–2 days',
    },
  ];

  const faqs = [
    {
      q: 'Who is eligible to use this clearance system?',
      a: 'All graduating undergraduate and postgraduate students of the University of Ibadan who have fulfilled academic coursework requirements and are preparing for convocation, statement of result collection, or NYSC mobilization.',
    },
    {
      q: 'How do I log in to my clearance portal?',
      a: 'Click the "Sign In" button at the top right of this page. Students can log in using either their matriculation number (e.g. 230922) or official university email along with their password. Staff and officers log in with their assigned staff credentials.',
    },
    {
      q: 'Can I complete multiple clearance stages at the same time?',
      a: 'Yes! Stages 1 through 5 (Library, Hall, Jaja Clinic, Alumni, and Department) have no prerequisites and run in parallel. You can submit documents for all five simultaneously. Subsequent stages (Sports, Faculty, Lodgings, Bursary, and Student Affairs) unlock sequentially as earlier stages are approved.',
    },
    {
      q: 'What if I resided off-campus during one or more academic sessions?',
      a: 'Students who lived off-campus for any session must submit the approved Off-Campus Form under Stage 2 (Caution and Hall Clearance) alongside their tuition receipts and room clearance.',
    },
    {
      q: 'How will I know when an officer approves or rejects my documents?',
      a: 'You will receive an automated, styled email notification sent to your registered student email as soon as an officer reviews your submission, containing approval details or actionable feedback on what needs correction.',
    },
    {
      q: 'How is the final clearance certificate verified?',
      a: 'Upon completion of all 10 stages, the system automatically generates an official University of Ibadan Clearance Letter and Certificate equipped with a cryptographic verification hash and a tamper-proof QR code that can be scanned for instant verification.',
    },
  ];

  const toggleFaq = (idx) => {
    setActiveFaq(activeFaq === idx ? null : idx);
  };

  return (
    <div className="home-container">
      {/* 1. TOP NAVIGATION */}
      <header className="home-navbar">
        <div className="home-nav-inner">
          <Link to="/" className="home-brand">
            <div className="home-brand-logo">UI</div>
            <div className="home-brand-text">
              <strong>University of Ibadan</strong>
              <span>Final-Year Clearance Portal</span>
            </div>
          </Link>

          <nav className="home-nav-links">
            <a href="#about" className="home-nav-link">About</a>
            <a href="#stages" className="home-nav-link">Clearance Stages</a>
            <a href="#how-it-works" className="home-nav-link">How It Works</a>
            <a href="#requirements" className="home-nav-link">Requirements</a>
            <a href="#faq" className="home-nav-link">FAQ</a>
          </nav>

          <div className="home-nav-actions">
            {user ? (
              <Link to={dashboardPath} className="btn btn-primary home-btn-signin">
                Go to Dashboard <IconChevronRight width={16} height={16} />
              </Link>
            ) : (
              <Link to="/login" className="btn btn-primary home-btn-signin">
                Sign In <IconChevronRight width={16} height={16} />
              </Link>
            )}
            <button
              className="home-nav-toggle"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              type="button"
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <IconX width={20} height={20} /> : <IconMenu width={20} height={20} />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="home-mobile-nav">
            <a href="#about" onClick={() => setMobileMenuOpen(false)}>About System</a>
            <a href="#stages" onClick={() => setMobileMenuOpen(false)}>Clearance Stages</a>
            <a href="#how-it-works" onClick={() => setMobileMenuOpen(false)}>How It Works</a>
            <a href="#requirements" onClick={() => setMobileMenuOpen(false)}>Document Requirements</a>
            <a href="#faq" onClick={() => setMobileMenuOpen(false)}>Frequently Asked Questions</a>
            <div className="home-mobile-nav-footer">
              {user ? (
                <Link to={dashboardPath} className="btn btn-primary" onClick={() => setMobileMenuOpen(false)}>
                  Open Dashboard
                </Link>
              ) : (
                <Link to="/login" className="btn btn-primary" onClick={() => setMobileMenuOpen(false)}>
                  Sign In to Portal
                </Link>
              )}
            </div>
          </div>
        )}
      </header>

      {/* 2. HERO SECTION */}
      <section className="home-hero">
        <div className="home-hero-content">
          <div className="home-hero-badge">
            <span className="home-badge-dot"></span>
            Official Clearance Portal • University of Ibadan
          </div>
          <h1 className="home-hero-title">
            Digitized Final-Year Student Clearance System
          </h1>
          <p className="home-hero-subtitle">
            Experience a fast, transparent, and queue-free graduation clearance. Upload required slips and fee receipts, track live review statuses across all 10 university units, and generate your tamper-proof, QR-verifiable clearance certificate.
          </p>

          <div className="home-hero-cta">
            {user ? (
              <Link to={dashboardPath} className="btn btn-primary home-btn-hero">
                Access Your Dashboard <IconChevronRight width={18} height={18} />
              </Link>
            ) : (
              <Link to="/login" className="btn btn-primary home-btn-hero">
                Sign In to Your Portal <IconChevronRight width={18} height={18} />
              </Link>
            )}
            <a href="#stages" className="btn btn-secondary home-btn-hero-outline">
              Explore the 10 Stages
            </a>
          </div>

          {/* Quick Metrics Bar */}
          <div className="home-metrics-bar">
            <div className="home-metric-item">
              <strong>10 Stages</strong>
              <span>Central Verification Units</span>
            </div>
            <div className="home-metric-divider"></div>
            <div className="home-metric-item">
              <strong>16 Faculties</strong>
              <span>Halls & 100+ Departments</span>
            </div>
            <div className="home-metric-divider"></div>
            <div className="home-metric-item">
              <strong>Instant Alerts</strong>
              <span>Real-Time Student Emails</span>
            </div>
            <div className="home-metric-divider"></div>
            <div className="home-metric-item">
              <strong>QR Verified</strong>
              <span>Cryptographic Clearance Certificate</span>
            </div>
          </div>
        </div>
      </section>

      {/* 3. ABOUT THE SYSTEM */}
      <section id="about" className="home-section home-about-section">
        <div className="home-section-header">
          <span className="home-section-eyebrow">About The Platform</span>
          <h2 className="home-section-title">Eliminating Manual Clearance Hassles</h2>
          <p className="home-section-desc">
            Designed specifically for the Premier University, this portal eliminates repetitive campus-wide foot travel, lost physical forms, and long waiting lines by unifying every clearance division into one coordinated digital workflow.
          </p>
        </div>

        <div className="home-feature-grid">
          <div className="home-feature-card">
            <div className="home-feature-icon" style={{ background: '#fef3c7', color: '#92400e' }}>
              <IconAward width={24} height={24} />
            </div>
            <h3>For Graduating Students</h3>
            <p>
              Check prerequisites in real-time, snap or upload receipts directly from your mobile device, track your clearance progress bar, and download your final clearance slip whenever approved.
            </p>
          </div>

          <div className="home-feature-card">
            <div className="home-feature-icon" style={{ background: '#ecfdf5', color: '#065f46' }}>
              <IconUsers width={24} height={24} />
            </div>
            <h3>For Clearance Officers</h3>
            <p>
              Dedicated officer dashboards for Halls, Departments, Faculties, Library, Bursary, and Student Affairs with instant student search, quick filter queues, and remark feedback.
            </p>
          </div>

          <div className="home-feature-card">
            <div className="home-feature-icon" style={{ background: '#eff6ff', color: '#1e40af' }}>
              <IconLock width={24} height={24} />
            </div>
            <h3>Cryptographic Verification</h3>
            <p>
              Every certificate issued is protected by a unique SHA-256 verification code and a scannable QR code, enabling instant external verification by postgraduate schools, employers, and NYSC.
            </p>
          </div>
        </div>
      </section>

      {/* 4. THE 10 CLEARANCE STAGES ROADMAP */}
      <section id="stages" className="home-section home-stages-section">
        <div className="home-section-header">
          <span className="home-section-eyebrow">Stage Progression</span>
          <h2 className="home-section-title">The 10 Official UI Clearance Stages</h2>
          <p className="home-section-desc">
            Clearance is split into parallel entry stages (which can be settled concurrently) followed by sequential consolidated reviews culminating at the Bursary and Student Affairs Division.
          </p>
        </div>

        <div className="home-stages-grid">
          {stages.map((st) => (
            <div key={st.num} className="home-stage-card">
              <div className="home-stage-head">
                <span className="home-stage-num">{st.num}</span>
                <span className="home-stage-tag">{st.tag}</span>
              </div>
              <h4 className="home-stage-name">{st.name}</h4>
              <p className="home-stage-loc">📍 {st.loc}</p>
              <p className="home-stage-desc">{st.desc}</p>
              <div className="home-stage-foot">
                <span>⏱️ {st.time}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="home-stages-banner">
          <div className="home-stages-banner-left">
            <h4>💡 Pro Tip for Graduands</h4>
            <p>
              Begin by submitting Stages 1 to 5 immediately! They do not depend on each other and can be reviewed simultaneously by your Library, Hall Warden, Jaja Clinic, Alumni Officer, and Department.
            </p>
          </div>
          <Link to="/login" className="btn btn-primary" style={{ whiteSpace: 'nowrap' }}>
            Get Started Now
          </Link>
        </div>
      </section>

      {/* 5. HOW IT WORKS */}
      <section id="how-it-works" className="home-section home-how-section">
        <div className="home-section-header">
          <span className="home-section-eyebrow">Clearance Workflow</span>
          <h2 className="home-section-title">How To Complete Your Clearance</h2>
          <p className="home-section-desc">
            Four simple steps from account login to official certificate download.
          </p>
        </div>

        <div className="home-steps-grid">
          <div className="home-step-item">
            <div className="home-step-number">01</div>
            <h4>Sign In</h4>
            <p>Log in using your Matriculation Number (e.g. 230922) and secure password provided for clearance access.</p>
          </div>
          <div className="home-step-item">
            <div className="home-step-number">02</div>
            <h4>Upload Receipts & Slips</h4>
            <p>Upload your 100L–final year fee receipts, library card, Jaja card, and room clearance forms in PDF or image format.</p>
          </div>
          <div className="home-step-item">
            <div className="home-step-number">03</div>
            <h4>Officer Review</h4>
            <p>Clearance officers review your records. Receive real-time email notifications for every approval or remark.</p>
          </div>
          <div className="home-step-item">
            <div className="home-step-number">04</div>
            <h4>Generate Certificate</h4>
            <p>Once all 10 stages are approved, download your official Final Clearance Certificate with digital verification QR code.</p>
          </div>
        </div>
      </section>

      {/* 6. REQUIREMENTS SUMMARY */}
      <section id="requirements" className="home-section home-requirements-section">
        <div className="home-section-header">
          <span className="home-section-eyebrow">Document Vault</span>
          <h2 className="home-section-title">Key Documents You Will Need</h2>
          <p className="home-section-desc">
            Have the following documents ready to upload or scan when completing your clearance:
          </p>
        </div>

        <div className="home-reqs-checklist">
          <div className="home-req-item">
            <IconCheck className="home-req-check" />
            <div>
              <strong>School Fee Receipts (100L to Final Year)</strong>
              <span>Required by Caution & Hall, Bursary, and Student Affairs.</span>
            </div>
          </div>

          <div className="home-req-item">
            <IconCheck className="home-req-check" />
            <div>
              <strong>Kenneth Dike Library (KDL) ID Card</strong>
              <span>Required for initial library clearance verification.</span>
            </div>
          </div>

          <div className="home-req-item">
            <IconCheck className="home-req-check" />
            <div>
              <strong>Jaja Health Registration Card</strong>
              <span>Original clinic registration card for health clearance.</span>
            </div>
          </div>

          <div className="home-req-item">
            <IconCheck className="home-req-check" />
            <div>
              <strong>Hall Room Clearance & Maintenance Slip</strong>
              <span>Signed hall room clearance or Off-Campus Form if you lived outside.</span>
            </div>
          </div>

          <div className="home-req-item">
            <IconCheck className="home-req-check" />
            <div>
              <strong>Alumni Association Payment Receipt (₦1,000)</strong>
              <span>Official teller or Remita payment receipt and printed online form.</span>
            </div>
          </div>

          <div className="home-req-item">
            <IconCheck className="home-req-check" />
            <div>
              <strong>Departmental Clearance Slip</strong>
              <span>Signed departmental verification showing coursework & dues completion.</span>
            </div>
          </div>

          <div className="home-req-item">
            <IconCheck className="home-req-check" />
            <div>
              <strong>Statement of Result (Personal Copy - 2 Photocopies)</strong>
              <span>From Examinations Office, required at Bursary & Student Affairs.</span>
            </div>
          </div>

          <div className="home-req-item">
            <IconCheck className="home-req-check" />
            <div>
              <strong>Graduation & Convocation Fee Receipt</strong>
              <span>Official receipt required for final Bursary and Student Affairs sign-off.</span>
            </div>
          </div>
        </div>
      </section>

      {/* 7. FREQUENTLY ASKED QUESTIONS */}
      <section id="faq" className="home-section home-faq-section">
        <div className="home-section-header">
          <span className="home-section-eyebrow">Got Questions?</span>
          <h2 className="home-section-title">Frequently Asked Questions</h2>
          <p className="home-section-desc">
            Quick answers to common questions about final-year clearance.
          </p>
        </div>

        <div className="home-faq-accordion">
          {faqs.map((faq, i) => (
            <div
              key={i}
              className={`home-faq-card ${activeFaq === i ? 'active' : ''}`}
              onClick={() => toggleFaq(i)}
            >
              <div className="home-faq-question">
                <h4>{faq.q}</h4>
                <span className="home-faq-toggle-icon">
                  {activeFaq === i ? '−' : '+'}
                </span>
              </div>
              {activeFaq === i && (
                <div className="home-faq-answer">
                  <p>{faq.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* 8. CALL TO ACTION BANNER */}
      <section className="home-cta-section">
        <div className="home-cta-box">
          <h2>Ready to Begin Your Final-Year Clearance?</h2>
          <p>
            Sign in now to upload your documents, track officer sign-offs in real time, and download your graduation clearance slip.
          </p>
          <div className="home-cta-buttons">
            <Link to="/login" className="btn btn-primary home-btn-hero">
              Sign In to Clearance Portal <IconChevronRight width={18} height={18} />
            </Link>
          </div>
        </div>
      </section>

      {/* 9. FOOTER */}
      <footer className="home-footer">
        <div className="home-footer-inner">
          <div className="home-footer-col">
            <div className="home-brand">
              <div className="home-brand-logo">UI</div>
              <div className="home-brand-text">
                <strong>University of Ibadan</strong>
                <span>Final-Year Clearance Management System</span>
              </div>
            </div>
            <p className="home-footer-tagline">
              First and Best • Dedicated portal for graduating students, hall wardens, academic departments, faculties, Bursary, and Student Affairs Division.
            </p>
          </div>

          <div className="home-footer-col">
            <h5>Navigation</h5>
            <ul className="home-footer-links">
              <li><a href="#about">About the System</a></li>
              <li><a href="#stages">10 Clearance Stages</a></li>
              <li><a href="#how-it-works">How It Works</a></li>
              <li><a href="#requirements">Document Vault Requirements</a></li>
              <li><a href="#faq">FAQ</a></li>
            </ul>
          </div>

          <div className="home-footer-col">
            <h5>Quick Portals</h5>
            <ul className="home-footer-links">
              <li><Link to="/login">Student & Staff Login</Link></li>
              <li><Link to="/forgot-password">Forgot Password</Link></li>
              <li><a href="https://ui.edu.ng" target="_blank" rel="noopener noreferrer">Official UI Website</a></li>
              <li><a href="https://alumni.ui.edu.ng" target="_blank" rel="noopener noreferrer">UI Alumni Portal</a></li>
            </ul>
          </div>

          <div className="home-footer-col">
            <h5>Contact & Support</h5>
            <p className="home-footer-contact">
              📍 Student Affairs Division, Central Administration<br />
              University of Ibadan, Ibadan, Oyo State, Nigeria<br />
              ✉️ clearance.support@ui.edu.ng
            </p>
          </div>
        </div>

        <div className="home-footer-bottom">
          <p>© {new Date().getFullYear()} University of Ibadan. All rights reserved. Final Year Clearance Management System.</p>
        </div>
      </footer>
    </div>
  );
}
