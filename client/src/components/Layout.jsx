import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import NotificationBell from './NotificationBell';
import {
  IconAward,
  IconCard,
  IconClipboard,
  IconFile,
  IconGrid,
  IconInbox,
  IconList,
  IconLogout,
  IconMenu,
  IconSearch,
  IconUpload,
  IconUser,
  IconUsers,
  IconX,
} from './Icons';

/**
 * Navigation per role. Grouping keeps the student's six destinations readable —
 * a flat list of that length reads as an undifferentiated pile.
 */
const NAV = {
  student: [
    {
      heading: 'Clearance',
      items: [
        { to: '/student', label: 'Overview', icon: IconGrid, end: true },
        { to: '/student/stages', label: 'Clearance Stages', icon: IconList },
      ],
    },
    {
      heading: 'Records',
      items: [
        { to: '/student/documents', label: 'Documents', icon: IconFile },
        { to: '/student/payments', label: 'Payments', icon: IconCard },
        { to: '/student/certificate', label: 'Clearance Letter', icon: IconAward },
      ],
    },
    {
      heading: 'Account',
      items: [{ to: '/profile', label: 'Profile', icon: IconUser }],
    },
  ],
  officer: [
    {
      heading: 'Overview',
      items: [{ to: '/officer', label: 'Dashboard', icon: IconGrid, end: true }],
    },
    {
      heading: 'Review',
      items: [
        { to: '/officer/queue', label: 'Review Queue', icon: IconInbox },
        { to: '/officer/history', label: 'Review History', icon: IconList },
      ],
    },
    {
      heading: 'Staff & Student Search',
      items: [
        { to: '/officer/directory', label: 'Officer Directory', icon: IconUsers },
        { to: '/officer/students', label: 'Student Lookup', icon: IconSearch },
      ],
    },
    {
      heading: 'My Section',
      items: [
        { to: '/officer/requirements', label: 'Required Documents', icon: IconClipboard },
        { to: '/officer/profile', label: 'Profile & Signature', icon: IconUser },
      ],
    },
  ],
  admin: [
    {
      heading: 'Overview',
      items: [{ to: '/admin', label: 'Dashboard', icon: IconGrid, end: true }],
    },
    {
      heading: 'Records',
      items: [
        { to: '/admin/students', label: 'Students', icon: IconUsers },
        { to: '/admin/users', label: 'Staff Accounts', icon: IconUser },
        { to: '/officer/directory', label: 'Officer Directory', icon: IconUsers },
        { to: '/officer/students', label: 'Student Lookup', icon: IconSearch },
      ],
    },
    {
      heading: 'Workflow',
      items: [
        { to: '/admin/sections', label: 'Clearance Sections', icon: IconClipboard },
        { to: '/officer/queue', label: 'Review Queue', icon: IconInbox },
        { to: '/admin/reports', label: 'Reports & Reminders', icon: IconList },
      ],
    },
  ],
};

function resolveImageUrl(url) {
  if (!url) return null;
  if (url.startsWith('data:') || url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  const backendBase = (import.meta.env.VITE_API_URL || 'https://unibadan-final-year-clearance.onrender.com').replace(/\/api\/?$/, '');
  return `${backendBase}${url.startsWith('/') ? '' : '/'}${url}`;
}

/** First letter of surname + first letter of first name, e.g. "Osunlana Anjoolaoluwa Victor" -> "OA". */
function getStudentInitials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'UI';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function UserAvatar({ user, size = 'md', onClick }) {
  const [imgFailed, setImgFailed] = useState(false);
  const passportSrc = resolveImageUrl(user?.passport_url);
  const initialsText = getStudentInitials(user?.full_name);
  const isSmall = size === 'sm';

  useEffect(() => {
    setImgFailed(false);
  }, [user?.passport_url]);

  const avatarStyle = {
    width: isSmall ? '32px' : '38px',
    height: isSmall ? '32px' : '38px',
    borderRadius: '50%',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f172a',
    color: '#ffffff',
    fontWeight: '700',
    fontSize: isSmall ? '0.75rem' : '0.85rem',
    letterSpacing: '0.5px',
    flexShrink: 0,
    cursor: onClick ? 'pointer' : 'default',
    border: '2px solid rgba(255,255,255,0.15)',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    padding: 0,
  };

  return (
    <button
      type="button"
      className={`avatar ${isSmall ? 'avatar-sm' : ''} avatar-btn`}
      style={avatarStyle}
      onClick={onClick}
      title={user?.full_name || 'Your Profile'}
      aria-label="Your profile"
    >
      {passportSrc && !imgFailed ? (
        <img
          src={passportSrc}
          alt={user?.full_name || 'Student'}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={() => setImgFailed(true)}
        />
      ) : (
        <span>{initialsText}</span>
      )}
    </button>
  );
}

const ROLE_LABEL = {
  student: 'Student',
  officer: 'Section Officer',
  admin: 'Administrator',
};

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const openProfile = () => navigate(user?.role === 'officer' ? '/officer/profile' : '/profile');

  // Navigating (drawer link, back button, anywhere) closes the mobile drawer.
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  const groups = NAV[user?.role] || [];

  // Title for the topbar, derived from the active route so it always matches
  // the highlighted nav item.
  const current = groups
    .flatMap((g) => g.items)
    .filter((item) => (item.end ? location.pathname === item.to : location.pathname.startsWith(item.to)))
    .sort((a, b) => b.to.length - a.to.length)[0];

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-logo">UI</div>
          <div>
            <strong>UI Clearance</strong>
            <span>University of Ibadan</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          {groups.map((group) => (
            <div className="nav-group" key={group.heading}>
              <p className="nav-heading">{group.heading}</p>
              {group.items.map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                >
                  <Icon />
                  <span>{label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <UserAvatar user={user} size="md" onClick={openProfile} />
            <div className="sidebar-user-meta">
              <strong>{user?.full_name}</strong>
              <span style={{ fontSize: '0.75rem', lineHeight: '1.2' }}>
                {user?.role === 'officer'
                  ? (user?.department ? user.department : user?.hall ? user.hall : user?.faculty ? `Faculty of ${user.faculty}` : (user?.section_code || 'Officer'))
                  : ROLE_LABEL[user?.role] || user?.role}
              </span>
            </div>
          </div>
          <button onClick={handleLogout} className="btn-logout" type="button">
            <IconLogout width={16} height={16} />
            Sign out
          </button>
        </div>
      </aside>

      <div className="app-body">
        <header className="topbar">
          <button
            className="nav-toggle"
            onClick={() => setDrawerOpen(true)}
            type="button"
            aria-label="Open menu"
          >
            <IconMenu />
          </button>

          <div className="topbar-title">
            <div className="topbar-title-inner">
              <h2>{current?.label || 'Dashboard'}</h2>
              {user?.role === 'officer' && (
                <span
                  className="topbar-badge"
                  title={
                    user.department
                      ? `Dept: ${user.department}`
                      : user.hall
                      ? `Hall: ${user.hall}`
                      : user.faculty
                      ? `Faculty of ${user.faculty}`
                      : (user.section_code ? `${user.section_code} Section` : 'Officer')
                  }
                  style={{
                    backgroundColor: user.section_code === 'department' ? '#fef7ee' : user.section_code === 'faculty' ? '#f0fdf4' : '#f8fafc',
                    color: user.section_code === 'department' ? '#78350f' : user.section_code === 'faculty' ? '#15803d' : '#334155',
                  }}
                >
                  {user.department
                    ? `Dept: ${user.department}`
                    : user.hall
                    ? `Hall: ${user.hall}`
                    : user.faculty
                    ? `Faculty of ${user.faculty}`
                    : (user.section_code ? `${user.section_code} Section` : 'Officer')}
                </span>
              )}
            </div>
            {user?.matric_number && <p>{user.matric_number}</p>}
          </div>

          <div className="topbar-user">
            <NotificationBell />
            <UserAvatar user={user} size="sm" onClick={openProfile} />
          </div>
        </header>

        <main className="main-content">
          <Outlet />
        </main>
      </div>

      {/* Mobile / tablet navigation: the sidebar in a slide-in drawer. */}
      {drawerOpen && (
        <>
          <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)} />

          <aside className="drawer">
            <div className="drawer-head">
              <div className="sidebar-brand">
                <div className="sidebar-logo">UI</div>
                <div>
                  <strong>UI Clearance</strong>
                  <span>University of Ibadan</span>
                </div>
              </div>
              <button
                className="drawer-close"
                onClick={() => setDrawerOpen(false)}
                type="button"
                aria-label="Close menu"
              >
                <IconX />
              </button>
            </div>

            <nav className="drawer-nav">
              {groups.map((group) => (
                <div className="nav-group" key={group.heading}>
                  <p className="nav-heading">{group.heading}</p>
                  {group.items.map(({ to, label, icon: Icon, end }) => (
                    <NavLink
                      key={to}
                      to={to}
                      end={end}
                      onClick={() => setDrawerOpen(false)}
                      className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                    >
                      <Icon />
                      <span>{label}</span>
                    </NavLink>
                  ))}
                </div>
              ))}
            </nav>

            <div className="drawer-footer">
              <div className="sidebar-user">
                <UserAvatar user={user} size="md" onClick={openProfile} />
                <div className="sidebar-user-meta">
                  <strong>{user?.full_name}</strong>
                  <span>{ROLE_LABEL[user?.role] || user?.role}</span>
                </div>
              </div>
              <button onClick={handleLogout} className="btn-logout" type="button">
                <IconLogout width={16} height={16} />
                Sign out
              </button>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
