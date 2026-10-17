import { useEffect, useState } from 'react';
import { adminApi } from '../../services/api';
import { saveBlob } from '../../services/download';
import { IconClock, IconFile, IconInbox } from '../../components/Icons';
import { SectionHeader, SkeletonList } from '../../components/Ui';

/**
 * Reports, deadline and reminders: everything an administrator needs to chase
 * the clearance season, in one place.
 */
export default function Reports() {
  const [deadline, setDeadline] = useState('');
  const [daysLeft, setDaysLeft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const s = await adminApi.settings();
        setDeadline(s.deadline || '');
        setDaysLeft(s.days_left);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const run = async (key, fn) => {
    setError('');
    setNotice('');
    setBusy(key);
    try {
      await fn();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  };

  const today = new Date().toISOString().slice(0, 10);

  const download = (kind) =>
    run(kind, async () => {
      const blob = await adminApi.exportCsv(kind);
      saveBlob(blob, `${kind}-${today}.csv`);
    });

  const saveDeadline = (value) =>
    run('deadline', async () => {
      const res = await adminApi.setDeadline(value || null);
      setDeadline(res.deadline || '');
      setDaysLeft(res.days_left);
      setNotice(res.message);
    });

  const sendReminders = () => {
    if (!window.confirm('Send a reminder to every student who still has something outstanding?')) return;
    return run('reminders', async () => {
      const res = await adminApi.sendReminders();
      setNotice(res.message);
    });
  };

  if (loading) {
    return (
      <div className="card">
        <SkeletonList rows={4} />
      </div>
    );
  }

  return (
    <div className="stack">
      {error && <div className="error">{error}</div>}
      {notice && <div className="notice">{notice}</div>}

      <div className="card">
        <SectionHeader
          title="Export data"
          description="CSV files open directly in Excel"
        />
        <div className="form-actions">
          <button className="btn btn-secondary" type="button" onClick={() => download('students')} disabled={Boolean(busy)} title="Download official student profile CSV with live updates">
            <IconFile width={15} height={15} /> {busy === 'students' ? 'Preparing…' : 'Students Profile (Live CSV)'}
          </button>
          <button className="btn btn-secondary" type="button" onClick={() => download('payments')} disabled={Boolean(busy)}>
            <IconFile width={15} height={15} /> {busy === 'payments' ? 'Preparing…' : 'Payments'}
          </button>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <SectionHeader
            title="Clearance deadline"
            description="Students see a countdown and warnings as it approaches"
          />
          <div className="form-group">
            <label>Deadline date</label>
            <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </div>
          {deadline && daysLeft !== null && (
            <p className="mini-sub">
              {daysLeft < 0
                ? `Passed ${Math.abs(daysLeft)} day${Math.abs(daysLeft) === 1 ? '' : 's'} ago`
                : daysLeft === 0
                  ? 'Today'
                  : `${daysLeft} day${daysLeft === 1 ? '' : 's'} from now`}
            </p>
          )}
          <div className="form-actions">
            <button
              className="btn btn-primary btn-sm"
              type="button"
              onClick={() => saveDeadline(deadline)}
              disabled={Boolean(busy) || !deadline}
            >
              <IconClock width={15} height={15} /> {busy === 'deadline' ? 'Saving…' : 'Save deadline'}
            </button>
            <button
              className="btn btn-secondary btn-sm"
              type="button"
              onClick={() => saveDeadline('')}
              disabled={Boolean(busy)}
            >
              Clear
            </button>
          </div>
        </div>

        <div className="card">
          <SectionHeader
            title="Send reminders"
            description="One message per student, by in-app, email and SMS where available"
          />
          <p className="mini-sub" style={{ marginBottom: '1rem' }}>
            Covers the deadline, rejected stages to fix, reviews that are taking too long, and unpaid fees. Students
            with nothing outstanding are skipped.
          </p>
          <button className="btn btn-primary" type="button" onClick={sendReminders} disabled={Boolean(busy)}>
            <IconInbox width={15} height={15} /> {busy === 'reminders' ? 'Sending…' : 'Send reminders now'}
          </button>
        </div>
      </div>
    </div>
  );
}

