import jsQR from 'jsqr';
import { useEffect, useRef, useState } from 'react';

const SCAN_INTERVAL_MS = 200;

/** Camera view that reports the first QR code it reads. */
export function QrScanner({ onResult, onCancel }: { onResult: (text: string) => void; onCancel: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    let done = false;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (done || !video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        timer = setInterval(() => {
          const v = video.current;
          if (!v || !ctx || v.videoWidth === 0) return;
          canvas.width = v.videoWidth;
          canvas.height = v.videoHeight;
          ctx.drawImage(v, 0, 0);
          const code = jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height, { inversionAttempts: 'dontInvert' });
          if (code?.data && !done) {
            done = true;
            onResult(code.data);
          }
        }, SCAN_INTERVAL_MS);
      } catch (e) {
        setError(e instanceof DOMException && e.name === 'NotAllowedError' ? 'Kamera-Zugriff wurde verweigert.' : 'Kamera konnte nicht gestartet werden.');
      }
    })();

    return () => {
      done = true;
      clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onResult]);

  return (
    <div className="scanner stack">
      <video ref={video} playsInline muted />
      <small>Halte die Kamera auf den QR-Code in der App von Yunus.</small>
      {error && <p className="error-text">{error}</p>}
      <button className="btn-ghost" onClick={onCancel}>
        Abbrechen
      </button>
    </div>
  );
}
