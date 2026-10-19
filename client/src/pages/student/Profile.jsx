import { useEffect, useState, useRef } from 'react';
import { studentApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { IconCheck, IconLock, IconUpload, IconUser } from '../../components/Icons';
import { ProgressBar, SectionHeader, SkeletonList } from '../../components/Ui';

export default function Profile() {
  const { user: authUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploadingPassport, setUploadingPassport] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Editable profile fields form state
  const [form, setForm] = useState({
    email: '',
    phone_number: '',
    dob: '',
    gender: '',
    blood_group: '',
    genotype: '',
    next_of_kin_name: '',
    next_of_kin_phone: '',
    next_of_kin_address: '',
    contact_address: '',
    state_of_origin: '',
    lga: '',
    graduation_session: '',
    degree_program: '',
    hall: '',
  });

  const fileInputRef = useRef(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [profileRes, statusRes] = await Promise.all([
        studentApi.profile(),
        studentApi.clearanceStatus(),
      ]);

      const u = profileRes.user || authUser;
      setProfile(u);
      setProgress(statusRes.progress || null);

      setForm({
        email: u.email || '',
        phone_number: u.phone_number || '',
        dob: u.dob || '',
        gender: u.gender || '',
        blood_group: u.blood_group || '',
        genotype: u.genotype || '',
        next_of_kin_name: u.next_of_kin_name || '',
        next_of_kin_phone: u.next_of_kin_phone || '',
        next_of_kin_address: u.next_of_kin_address || '',
        contact_address: u.contact_address || '',
        state_of_origin: u.state_of_origin || '',
        lga: u.lga || '',
        graduation_session: u.graduation_session || '',
        degree_program: u.degree_program || '',
        hall: u.hall || '',
      });
    } catch (err) {
      setError(err.message || 'Failed to load profile details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handlePassportChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file (JPG, PNG, or WEBP).');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('Passport photo size must be less than 5MB.');
      return;
    }

    try {
      setUploadingPassport(true);
      setError('');
      setNotice('');
      const formData = new FormData();
      formData.append('passport', file);

      const res = await studentApi.uploadPassport(formData);
      setNotice(res.message || 'Passport photograph uploaded successfully.');
      setProfile((prev) => ({ ...prev, passport_url: res.passport_url }));
    } catch (err) {
      setError(err.message || 'Failed to upload passport photo.');
    } finally {
      setUploadingPassport(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!form.hall || !form.hall.trim()) {
      setError('Hall of Residence is compulsory.');
      return;
    }
    try {
      setBusy(true);
      setError('');
      setNotice('');

      const res = await studentApi.updateProfile(form);
      setNotice(res.message || 'Profile updated successfully.');
      setProfile(res.user);
      setIsEditing(false);
    } catch (err) {
      setError(err.message || 'Failed to update profile.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="stack">
        <div className="card">
          <SkeletonList rows={5} />
        </div>
      </div>
    );
  }

  const user = profile || authUser;
  const hasPassport = Boolean(user?.passport_url);

  return (
    <div className="stack">
      {error && <div className="error">{error}</div>}
      {notice && <div className="notice">{notice}</div>}

      {/* Mandatory Passport Photograph Warning / Header Card */}
      {!hasPassport && (
        <div className="notice notice-warn" style={{ borderLeft: '4px solid #f59e0b' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
            <span style={{ fontSize: '1.25rem' }}>⚠️</span>
            <div>
              <strong>Profile Passport Photograph Required!</strong>
              <p style={{ marginTop: '0.25rem', fontSize: '0.9rem' }}>
                You are required to upload a clear passport photograph. This photograph will appear on all your official
                section clearance slips and your University of Ibadan Final Clearance Letter.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Passport & Identity Header Card */}
      <div className="card">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', alignItems: 'center' }}>
          {/* Passport Photo Frame */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
            <div
              style={{
                width: '110px',
                height: '130px',
                borderRadius: '6px',
                border: '2px solid #cbd5e1',
                backgroundColor: '#f8fafc',
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                boxShadow: '0 2px 4px rgba(0,0,0,0.06)',
              }}
            >
              {hasPassport ? (
                <img
                  src={user.passport_url}
                  alt="Student Passport"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <div style={{ textAlign: 'center', color: '#94a3b8', padding: '0.5rem' }}>
                  <IconUser width={36} height={36} />
                  <div style={{ fontSize: '0.7rem', fontWeight: '600', marginTop: '0.25rem' }}>No Photo</div>
                </div>
              )}
            </div>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handlePassportChange}
              accept="image/jpeg,image/png,image/webp"
              style={{ display: 'none' }}
            />

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingPassport}
              style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
            >
              <IconUpload width={13} height={13} />
              {uploadingPassport ? 'Uploading…' : hasPassport ? 'Change Passport' : 'Upload Passport'}
            </button>
          </div>

          {/* Student Banner Info */}
          <div style={{ flex: 1, minWidth: '220px' }}>
            <h2 style={{ margin: 0, fontSize: '1.4rem', color: '#0f172a' }}>{user?.full_name}</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', margin: '0.4rem 0' }}>
              <span className="badge badge-primary">Matric: {user?.matric_number}</span>
              <span className="badge" style={{ backgroundColor: '#f1f5f9', color: '#334155' }}>
                {user?.department}
              </span>
              <span className="badge" style={{ backgroundColor: '#f1f5f9', color: '#334155' }}>
                {user?.faculty}
              </span>
            </div>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.88rem', color: '#64748b' }}>
              University of Ibadan Official Graduating Clearance Profile
            </p>
          </div>
        </div>
      </div>

      {/* Locked Official Academic Records Section */}
      <div className="card">
        <SectionHeader
          title="Official Academic Record (Non-Editable / Registry Verified)"
          description="These core matriculation credentials are populated directly from official University Registry CSV records and cannot be altered by students."
        />

        <div className="detail-grid" style={{ marginTop: '0.75rem' }}>
          <div>
            <dt>
              Full Name <IconLock width={12} height={12} />
            </dt>
            <dd style={{ fontWeight: '600' }}>{user?.full_name || '—'}</dd>
          </div>
          <div>
            <dt>
              Gender <IconLock width={12} height={12} />
            </dt>
            <dd style={{ fontWeight: '600' }}>{user?.gender || '—'}</dd>
          </div>
          <div>
            <dt>
              Matric No <IconLock width={12} height={12} />
            </dt>
            <dd style={{ fontWeight: '600' }}>{user?.matric_number || '—'}</dd>
          </div>
          <div>
            <dt>
              Institutional Email <IconLock width={12} height={12} />
            </dt>
            <dd>{user?.email || '—'}</dd>
          </div>
          <div>
            <dt>
              Date Of Birth <IconLock width={12} height={12} />
            </dt>
            <dd>{user?.dob || '—'}</dd>
          </div>
          <div>
            <dt>
              Department <IconLock width={12} height={12} />
            </dt>
            <dd style={{ fontWeight: '600' }}>{user?.department || '—'}</dd>
          </div>
          <div>
            <dt>
              Faculty <IconLock width={12} height={12} />
            </dt>
            <dd style={{ fontWeight: '600' }}>{user?.faculty || '—'}</dd>
          </div>
          <div>
            <dt>
              Graduating Session <IconLock width={12} height={12} />
            </dt>
            <dd style={{ fontWeight: '600' }}>{user?.graduation_session || '—'}</dd>
          </div>
        </div>
      </div>

      {/* Editable Student Profile Details */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <SectionHeader
            title="Personal & Contact Details"
            description="Additional student information. These fields are optional but recommended for your records."
          />
          <button
            type="button"
            className={`btn ${isEditing ? 'btn-secondary' : 'btn-primary'} btn-sm`}
            onClick={() => {
              setIsEditing((prev) => !prev);
              setError('');
              setNotice('');
            }}
          >
            {isEditing ? 'Cancel Editing' : 'Edit Profile'}
          </button>
        </div>

        {isEditing ? (
          <form onSubmit={handleSaveProfile} className="form-stack">
            <div className="form-row">
              <div className="form-group">
                <label>Email Address (For Notifications & Password Reset)</label>
                <input
                  type="email"
                  placeholder="e.g. yourname@gmail.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Phone Number (For SMS & WhatsApp Alerts)</label>
                <input
                  type="text"
                  placeholder="e.g. 08012345678"
                  value={form.phone_number}
                  onChange={(e) => setForm({ ...form, phone_number: e.target.value })}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Hall of Residence * (hall_of_residence)</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Independence Hall, Queen Idia Hall, Off-Campus"
                  value={form.hall}
                  onChange={(e) => setForm({ ...form, hall: e.target.value })}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Blood Group (Blood Group)</label>
                <select
                  value={form.blood_group}
                  onChange={(e) => setForm({ ...form, blood_group: e.target.value })}
                >
                  <option value="">Select Blood Group</option>
                  <option value="A+">A+</option>
                  <option value="A-">A-</option>
                  <option value="B+">B+</option>
                  <option value="B-">B-</option>
                  <option value="AB+">AB+</option>
                  <option value="AB-">AB-</option>
                  <option value="O+">O+</option>
                  <option value="O-">O-</option>
                </select>
              </div>
              <div className="form-group">
                <label>Genotype (Genotype)</label>
                <select
                  value={form.genotype}
                  onChange={(e) => setForm({ ...form, genotype: e.target.value })}
                >
                  <option value="">Select Genotype</option>
                  <option value="AA">AA</option>
                  <option value="AS">AS</option>
                  <option value="SS">SS</option>
                  <option value="AC">AC</option>
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group" style={{ flex: 1 }}>
                <label>State of Origin / LGA (State of origin/LGA)</label>
                <input
                  type="text"
                  placeholder="e.g. Oyo State / Ibadan North"
                  value={form.state_of_origin}
                  onChange={(e) => setForm({ ...form, state_of_origin: e.target.value })}
                />
              </div>
            </div>

            <div className="form-group">
              <label>Residential Address (Residentaial Addresss)</label>
              <textarea
                rows={2}
                placeholder="e.g. Agbowo, UI Post Office area, Ibadan"
                value={form.contact_address}
                onChange={(e) => setForm({ ...form, contact_address: e.target.value })}
              />
            </div>

            {/* If dob or gender was not in registry record, allow student to provide it */}
            {(!user?.dob || !user?.gender) && (
              <div className="form-row" style={{ backgroundColor: '#f8fafc', padding: '0.75rem', borderRadius: '6px' }}>
                {!user?.dob && (
                  <div className="form-group">
                    <label>Date Of Birth (Date Of birth)</label>
                    <input
                      type="date"
                      value={form.dob}
                      onChange={(e) => setForm({ ...form, dob: e.target.value })}
                    />
                  </div>
                )}
                {!user?.gender && (
                  <div className="form-group">
                    <label>Gender (gender)</label>
                    <select
                      value={form.gender}
                      onChange={(e) => setForm({ ...form, gender: e.target.value })}
                    >
                      <option value="">Select Gender</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                    </select>
                  </div>
                )}
              </div>
            )}

            <div style={{ marginTop: '0.5rem', marginBottom: '0.25rem', fontWeight: '600', color: '#1e293b' }}>
              Next of Kin Information (Optional):
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Next of Kin Full Name</label>
                <input
                  type="text"
                  placeholder="e.g. Mr. S. A. Osunlana"
                  value={form.next_of_kin_name}
                  onChange={(e) => setForm({ ...form, next_of_kin_name: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Next of Kin Phone</label>
                <input
                  type="text"
                  placeholder="e.g. 08033334444"
                  value={form.next_of_kin_phone}
                  onChange={(e) => setForm({ ...form, next_of_kin_phone: e.target.value })}
                />
              </div>
            </div>
            <div className="form-group">
              <label>Next of Kin Address</label>
              <input
                type="text"
                placeholder="e.g. Bodija, Ibadan"
                value={form.next_of_kin_address}
                onChange={(e) => setForm({ ...form, next_of_kin_address: e.target.value })}
              />
            </div>

            <div className="form-actions" style={{ marginTop: '1rem' }}>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                <IconCheck width={15} height={15} />
                {busy ? 'Saving Changes…' : 'Save Changes'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy}
                onClick={() => setIsEditing(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <dl className="detail-grid" style={{ marginTop: '0.5rem' }}>
            <div>
              <dt>Phone Number (phone_number)</dt>
              <dd>{user?.phone_number || '—'}</dd>
            </div>
            <div>
              <dt>Hall of Residence (hall_of_residence)</dt>
              <dd>{user?.hall || '—'}</dd>
            </div>
            <div>
              <dt>Blood Group (Blood Group)</dt>
              <dd>{user?.blood_group || '—'}</dd>
            </div>
            <div>
              <dt>Genotype (Genotype)</dt>
              <dd>{user?.genotype || '—'}</dd>
            </div>
            <div>
              <dt>State of Origin / LGA (State of origin/LGA)</dt>
              <dd>{user?.state_of_origin ? (user?.lga ? `${user.state_of_origin} (${user.lga})` : user.state_of_origin) : '—'}</dd>
            </div>
            <div>
              <dt>Residential Address (Residentaial Addresss)</dt>
              <dd>{user?.contact_address || '—'}</dd>
            </div>
            <div>
              <dt>Next of Kin</dt>
              <dd>
                {user?.next_of_kin_name
                  ? `${user.next_of_kin_name} ${user.next_of_kin_phone ? `(${user.next_of_kin_phone})` : ''}`
                  : '—'}
              </dd>
            </div>
          </dl>
        )}
      </div>

      {/* Clearance Progress Summary */}
      {progress && (
        <div className="card">
          <SectionHeader
            title="Clearance Progress Summary"
            description="Overall clearance status across the 10 university stages"
          />
          <ProgressBar value={progress.approved} total={progress.total} />
        </div>
      )}
    </div>
  );
}
