import { useEffect, useRef, useState } from 'react';
import { officerApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { IconCheck, IconUpload, IconUser } from '../../components/Icons';
import { SectionHeader, SkeletonList } from '../../components/Ui';
import { resolveImageUrl } from '../../utils/resolveUrl';

export default function OfficerProfile() {
  const { user } = useAuth();
  const [officer, setOfficer] = useState(null);
  const [stage, setStage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [uploadingSig, setUploadingSig] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Form details
  const [fullName, setFullName] = useState('');
  const [title, setTitle] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');

  // Signature mode: 'upload' | 'draw'
  const [sigMode, setSigMode] = useState('upload');
  const fileInputRef = useRef(null);
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await officerApi.profile();
      setOfficer(data.officer);
      setStage(data.stage);
      setFullName(data.officer?.full_name || '');
      setTitle(data.officer?.title || '');
      setPhoneNumber(data.officer?.phone_number || '');
    } catch (err) {
      setError(err.message || 'Failed to load officer details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSaveDetails = async (e) => {
    e.preventDefault();
    if (!fullName.trim()) {
      setError('Official full name cannot be blank.');
      return;
    }
    try {
      setBusy(true);
      setError('');
      setNotice('');
      const res = await officerApi.updateProfile({
        full_name: fullName.trim(),
        title: title.trim(),
        phone_number: phoneNumber.trim(),
      });
      setNotice(res.message || 'Officer profile updated successfully.');
      setOfficer(res.officer);
    } catch (err) {
      setError(err.message || 'Failed to update profile details.');
    } finally {
      setBusy(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file (PNG, JPG, or WEBP).');
      return;
    }

    try {
      setUploadingSig(true);
      setError('');
      setNotice('');
      const formData = new FormData();
      formData.append('signature', file);

      const res = await officerApi.uploadSignature(formData);
      setNotice(res.message || 'Official signature uploaded successfully.');
      setOfficer((prev) => ({ ...prev, signature_url: res.signature_url }));
    } catch (err) {
      setError(err.message || 'Failed to upload signature.');
    } finally {
      setUploadingSig(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Canvas drawing functions
  const getCanvasPoint = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
    const clientY = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
    const scaleX = rect.width ? canvas.width / rect.width : 1;
    const scaleY = rect.height ? canvas.height / rect.height : 1;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const startDrawing = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { x, y } = getCanvasPoint(e, canvas);

    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { x, y } = getCanvasPoint(e, canvas);

    ctx.lineTo(x, y);
    ctx.strokeStyle = '#002147';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.stroke();
    setHasDrawn(true);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  const saveDrawing = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasDrawn) {
      setError('Please draw your signature on the pad before saving.');
      return;
    }
    try {
      setBusy(true);
      setError('');
      setNotice('');
      const dataUrl = canvas.toDataURL('image/png');
      const res = await officerApi.saveSignatureDrawing(dataUrl);
      setNotice(res.message || 'Digital signature saved successfully.');
      setOfficer((prev) => ({ ...prev, signature_url: res.signature_url }));
      clearCanvas();
    } catch (err) {
      setError(err.message || 'Failed to save digital signature.');
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

  const hasSignature = Boolean(officer?.signature_url);

  return (
    <div className="stack">
      {error && <div className="error">{error}</div>}
      {notice && <div className="notice">{notice}</div>}

      {/* Mandatory Signature Notice */}
      {!hasSignature && (
        <div className="notice notice-warn" style={{ borderLeft: '4px solid #f59e0b' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
            <span style={{ fontSize: '1.3rem' }}>⚠️</span>
            <div>
              <strong>Official Signature Required for Approvals!</strong>
              <p style={{ marginTop: '0.25rem', fontSize: '0.9rem' }}>
                Under University of Ibadan clearance regulations, each section clearance officer is required to provide
                their name and upload their official signature before approving any student clearance. Your signature
                and name will automatically appear on the official sectional clearance slip of every student you clear.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Section Assignment Banner Card */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.35rem', color: '#0f172a' }}>
              {stage?.display_name || stage?.stage_name || 'Section Clearance'}
            </h2>
            <p style={{ margin: '0.35rem 0 0', color: '#64748b', fontSize: '0.9rem' }}>
              Official clearance portal for <strong>{officer?.department || officer?.hall || officer?.faculty || officer?.section_code}</strong>
            </p>
          </div>
          <span
            className="badge"
            style={{
              backgroundColor: hasSignature ? '#ecfdf5' : '#fef2f2',
              color: hasSignature ? '#047857' : '#b91c1c',
              border: `1px solid ${hasSignature ? '#a7f3d0' : '#fecaca'}`,
              padding: '0.4rem 0.8rem',
              fontSize: '0.85rem',
            }}
          >
            {hasSignature ? '✓ Signature Verified & Ready' : '✗ Signature Missing'}
          </span>
        </div>
      </div>

      {/* Officer Personal & Designation Details */}
      <div className="card">
        <SectionHeader
          title="Officer Credentials & Title"
          description="Your name and designation will appear as the signatory on official clearance slips."
        />

        <form onSubmit={handleSaveDetails} className="form-stack" style={{ marginTop: '1rem' }}>
          <div className="form-row">
            <div className="form-group">
              <label>Official Full Name (Signatory Name) *</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Dr. Olufemi Adeleke"
                required
              />
            </div>
            <div className="form-group">
              <label>Title / Designation</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Senior Lecturer & Departmental Clearance Officer"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Official Institutional Email</label>
              <input type="text" value={officer?.email || ''} disabled style={{ backgroundColor: '#f1f5f9' }} />
            </div>
            <div className="form-group">
              <label>Contact Phone Number</label>
              <input
                type="text"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="e.g. 08030000000"
              />
            </div>
          </div>

          <div className="form-actions" style={{ marginTop: '0.5rem' }}>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              <IconCheck width={15} height={15} />
              {busy ? 'Saving…' : 'Save Officer Details'}
            </button>
          </div>
        </form>
      </div>

      {/* Official Signature Management Card */}
      <div className="card">
        <SectionHeader
          title="Official Endorsement Signature"
          description="Upload an image of your signature or draw your digital signature below."
        />

        {/* Current Active Signature Preview */}
        {hasSignature && (
          <div style={{ marginBottom: '1.25rem', padding: '1rem', backgroundColor: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: '600', color: '#475569', marginBottom: '0.5rem' }}>
              Current Official Signature on Record:
            </div>
            <div
              style={{
                display: 'inline-block',
                padding: '0.5rem 1rem',
                backgroundColor: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '4px',
              }}
            >
              <img
                src={resolveImageUrl(officer.signature_url)}
                alt="Officer Signature"
                style={{ maxHeight: '65px', maxWidth: '240px', objectFit: 'contain' }}
              />
            </div>
            <div style={{ fontSize: '0.8rem', color: '#16a34a', marginTop: '0.4rem', fontWeight: '500' }}>
              ✓ Ready — this signature will be placed on all approved clearance slips.
            </div>
          </div>
        )}

        {/* Toggle Mode: Upload vs Draw */}
        <div className="tab-row" style={{ marginBottom: '1rem' }}>
          <button
            type="button"
            className={`tab${sigMode === 'upload' ? ' active' : ''}`}
            onClick={() => setSigMode('upload')}
          >
            Upload Signature Image
          </button>
          <button
            type="button"
            className={`tab${sigMode === 'draw' ? ' active' : ''}`}
            onClick={() => setSigMode('draw')}
          >
            Draw Digital Signature
          </button>
        </div>

        {sigMode === 'upload' ? (
          <div>
            <p style={{ fontSize: '0.88rem', color: '#64748b', marginBottom: '0.75rem' }}>
              Upload a scanned or photographed image of your signature on clean white paper (PNG or JPG).
            </p>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept="image/jpeg,image/png,image/webp"
              style={{ display: 'none' }}
            />
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingSig}
            >
              <IconUpload width={16} height={16} />
              {uploadingSig ? 'Uploading signature…' : 'Choose Signature File (PNG/JPG)'}
            </button>
          </div>
        ) : (
          <div>
            <p style={{ fontSize: '0.88rem', color: '#64748b', marginBottom: '0.5rem' }}>
              Sign inside the white box using your mouse or touchscreen/stylus:
            </p>
            <div style={{ display: 'inline-block', maxWidth: '100%', border: '2px dashed #94a3b8', borderRadius: '6px', backgroundColor: '#ffffff' }}>
              <canvas
                ref={canvasRef}
                width={400}
                height={130}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
                style={{ cursor: 'crosshair', display: 'block', touchAction: 'none', maxWidth: '100%', height: 'auto' }}
              />
            </div>
            <div style={{ marginTop: '0.75rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={saveDrawing}
                disabled={!hasDrawn || busy}
              >
                <IconCheck width={14} height={14} />
                Save Digital Signature
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={clearCanvas}
                disabled={!hasDrawn}
              >
                Clear Pad
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

