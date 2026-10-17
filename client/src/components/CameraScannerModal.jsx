import { useEffect, useRef, useState } from 'react';
import { IconCamera, IconRefresh, IconX } from './Icons';

/**
 * Camera Scanner / Snapper Modal
 *
 * Allows students to scan or snap physical documents directly from their device
 * camera or webcam without needing a third-party scanning app.
 *
 * Features:
 * - Direct camera stream with facingMode: 'environment' (back camera for phone/tablet).
 * - Document alignment guide overlay.
 * - Snap & review with retake or accept.
 * - Automatic conversion to a crisp JPEG File object.
 * - Graceful fallback to file picker / device camera on permission issues.
 */
export default function CameraScannerModal({ isOpen, onClose, onCapture, requirementLabel }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [capturedUrl, setCapturedUrl] = useState(null);
  const [capturedBlob, setCapturedBlob] = useState(null);
  const [cameraError, setCameraError] = useState('');
  const [facingMode, setFacingMode] = useState('environment'); // 'environment' or 'user'
  const [isStarting, setIsStarting] = useState(false);

  // Stop camera tracks cleanly
  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  // Start camera stream
  const startCamera = async (mode = facingMode) => {
    stopStream();
    setCameraError('');
    setIsStarting(true);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('Camera access is not supported on this browser. Please use standard file upload.');
      setIsStarting(false);
      return;
    }

    try {
      const constraints = {
        video: {
          facingMode: { ideal: mode },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err) {
      console.warn('Camera error:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCameraError('Camera access was denied. Please allow camera permissions in your browser or select a file instead.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setCameraError('No camera device detected on this system.');
      } else {
        // Fallback to basic video without resolution constraints
        try {
          const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: true });
          streamRef.current = fallbackStream;
          if (videoRef.current) {
            videoRef.current.srcObject = fallbackStream;
            await videoRef.current.play();
          }
        } catch (fallbackErr) {
          setCameraError('Unable to activate camera: ' + fallbackErr.message);
        }
      }
    } finally {
      setIsStarting(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setCapturedUrl(null);
      setCapturedBlob(null);
      startCamera(facingMode);
    } else {
      stopStream();
    }
    return () => {
      stopStream();
    };
  }, [isOpen, facingMode]);

  // Flip camera (between environment and user)
  const toggleFacingMode = () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
  };

  // Snap photo from video frame
  const handleSnap = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;

    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, width, height);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const previewUrl = URL.createObjectURL(blob);
        setCapturedBlob(blob);
        setCapturedUrl(previewUrl);
        stopStream();
      },
      'image/jpeg',
      0.92
    );
  };

  // Retake photo
  const handleRetake = () => {
    if (capturedUrl) {
      URL.revokeObjectURL(capturedUrl);
    }
    setCapturedUrl(null);
    setCapturedBlob(null);
    startCamera(facingMode);
  };

  // Confirm photo and create File object
  const handleConfirm = () => {
    if (!capturedBlob) return;
    const cleanLabel = (requirementLabel || 'document').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    const fileName = `${cleanLabel}_scan_${Date.now()}.jpg`;
    const file = new File([capturedBlob], fileName, { type: 'image/jpeg' });

    onCapture(file);
    handleClose();
  };

  // Handle native mobile file capture fallback
  const handleNativeFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      onCapture(file);
      handleClose();
    }
  };

  const handleClose = () => {
    stopStream();
    if (capturedUrl) {
      URL.revokeObjectURL(capturedUrl);
    }
    setCapturedUrl(null);
    setCapturedBlob(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="scanner-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="scanner-title">
      <div className="scanner-modal-card">
        <div className="scanner-header">
          <div>
            <h3 id="scanner-title" className="scanner-title">
              <IconCamera width={20} height={20} />
              Scan Document
            </h3>
            <p className="scanner-subtitle">
              {requirementLabel ? `Target: ${requirementLabel}` : 'Capture a clear photo of your physical document'}
            </p>
          </div>
          <button type="button" className="btn-icon-close" onClick={handleClose} aria-label="Close scanner">
            <IconX width={20} height={20} />
          </button>
        </div>

        <div className="scanner-body">
          {cameraError ? (
            <div className="scanner-error-box">
              <p className="error-text">{cameraError}</p>
              <div className="scanner-fallback-options">
                <label className="btn btn-primary">
                  Choose Photo / Take with Device Camera
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    style={{ display: 'none' }}
                    onChange={handleNativeFileSelect}
                  />
                </label>
                <button type="button" className="btn btn-secondary" onClick={() => startCamera(facingMode)}>
                  Retry Camera
                </button>
              </div>
            </div>
          ) : capturedUrl ? (
            <div className="scanner-preview-wrapper">
              <img src={capturedUrl} alt="Captured Document" className="scanner-preview-img" />
              <div className="scanner-preview-badge">Document Captured</div>
            </div>
          ) : (
            <div className="scanner-video-wrapper">
              <video
                ref={videoRef}
                playsInline
                autoPlay
                muted
                className="scanner-video"
              />
              {/* Document framing guide */}
              <div className="scanner-guide-overlay">
                <div className="scanner-frame-box">
                  <span className="scanner-corner corner-tl" />
                  <span className="scanner-corner corner-tr" />
                  <span className="scanner-corner corner-bl" />
                  <span className="scanner-corner corner-br" />
                  <div className="scanner-guide-hint">Align document edges within frame</div>
                </div>
              </div>
              {isStarting && <div className="scanner-starting-indicator">Starting camera...</div>}
            </div>
          )}
        </div>

        <div className="scanner-footer">
          {capturedUrl ? (
            <div className="scanner-actions">
              <button type="button" className="btn btn-secondary" onClick={handleRetake}>
                Retake
              </button>
              <button type="button" className="btn btn-success" onClick={handleConfirm}>
                Use This Document
              </button>
            </div>
          ) : !cameraError ? (
            <div className="scanner-actions scanner-capture-bar">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={toggleFacingMode}
                title="Switch Camera"
              >
                <IconRefresh width={16} height={16} />
                Switch Camera
              </button>
              <button
                type="button"
                className="btn btn-primary btn-snap"
                onClick={handleSnap}
                disabled={isStarting}
              >
                <IconCamera width={18} height={18} />
                Snap Photo
              </button>
              <label className="btn btn-secondary btn-sm" title="Upload from device storage">
                Choose Existing
                <input
                  type="file"
                  accept="image/*,.pdf"
                  style={{ display: 'none' }}
                  onChange={handleNativeFileSelect}
                />
              </label>
            </div>
          ) : (
            <div className="scanner-actions">
              <button type="button" className="btn btn-secondary" onClick={handleClose}>
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

