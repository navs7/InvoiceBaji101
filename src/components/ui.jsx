import { useEffect, useState } from 'react';
import { minorToPlain, toMinor } from '../lib/money.js';

export function Field({ label, error, hint, children, className = '' }) {
  return (
    <label className={`field ${className}`}>
      <span className="lbl">{label}</span>
      {children}
      {hint && !error && <span className="hint">{hint}</span>}
      {error && <span className="err">{error}</span>}
    </label>
  );
}

// Text input that holds decimals as typed but reports integer minor units.
export function MoneyInput({ value, onChange, disabled, placeholder = '0.00' }) {
  const [text, setText] = useState(value ? minorToPlain(value) : '');
  useEffect(() => {
    if (toMinor(text) !== value) setText(value ? minorToPlain(value) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <input
      inputMode="decimal" disabled={disabled} placeholder={placeholder} value={text}
      onChange={(e) => {
        setText(e.target.value);
        const m = toMinor(e.target.value);
        if (!Number.isNaN(m)) onChange(m);
      }}
    />
  );
}

export function Modal({ title, onClose, children, wide, footer }) {
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-label={title}>
        <div className="modal-head"><h2>{title}</h2><button className="icon" onClick={onClose} aria-label="Close">×</button></div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export const Badge = ({ status }) => <span className={`badge ${status}`}>{status}</span>;

// Resize an uploaded image to keep stored documents small.
export function fileToDataUrl(file, maxW, maxH) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, maxW / img.width, maxH / img.height);
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('That file is not a valid image.'));
    img.src = URL.createObjectURL(file);
  });
}

export function download(filename, content, type = 'text/csv;charset=utf-8') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const setIn = (obj, path, value) => {
  const [k, ...rest] = path.split('.');
  return { ...obj, [k]: rest.length ? setIn(obj[k] || {}, rest.join('.'), value) : value };
};
