import QRCode from 'qrcode';
import { useEffect, useState } from 'react';

/** Renders `text` as a QR code image. */
export function InviteQr({ text }: { text: string }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let alive = true;
    void QRCode.toDataURL(text, { errorCorrectionLevel: 'M', margin: 2, width: 280, color: { dark: '#111722', light: '#ffffff' } }).then((url) => {
      if (alive) setSrc(url);
    });
    return () => {
      alive = false;
    };
  }, [text]);
  return src ? <img className="qr" src={src} width={280} height={280} alt="Einladungs-QR-Code" /> : null;
}
