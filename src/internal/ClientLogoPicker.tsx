import { useRef, useState, useEffect } from 'react';
import { MAX_LOGO_LENGTH } from '../../contracts/client-logo';

async function prepareLogo(file: File): Promise<string> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Elegí una imagen PNG, JPG o WebP.');
  if (file.size > 5 * 1024 * 1024) throw new Error('La imagen debe pesar menos de 5 MB.');
  const bitmap = await createImageBitmap(file).catch(() => { throw new Error('No pudimos leer esa imagen. Probá con otro archivo.'); });
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 20_000_000) throw new Error('La imagen es demasiado grande. Elegí una versión más pequeña.');
    for (const edge of [192, 128, 96]) {
      const ratio = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * ratio)); canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Este navegador no pudo preparar el logo.');
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const value = canvas.toDataURL('image/png');
      if (value.length <= MAX_LOGO_LENGTH) return value;
    }
    throw new Error('No pudimos reducir el logo. Elegí una imagen más simple.');
  } finally { bitmap.close(); }
}

export default function ClientLogoPicker({ value, onChange, onBusy }: { value: string | null; onChange: (value: string | null) => void; onBusy: (busy: boolean) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  return <section className="client-logo-editor" aria-label="Logo del cliente">
    <div>{value ? <img src={value} alt="Vista previa del logo"/> : <span>Sin logo</span>}</div>
    <section><strong>Logo del cliente</strong><p className="form-hint">PNG, JPG o WebP, hasta 5 MB. Se guarda al confirmar los datos del cliente.</p>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" aria-label="Archivo del logo" hidden onChange={async event => {
        const file = event.target.files?.[0]; event.target.value = ''; if (!file || busy) return;
        setBusy(true); onBusy(true); setError('');
        try { const logo = await prepareLogo(file); if (mounted.current) onChange(logo); }
        catch (error) { if (mounted.current) setError(error instanceof Error ? error.message : 'No pudimos preparar el logo.'); }
        finally { if (mounted.current) { setBusy(false); onBusy(false); } }
      }}/>
      <div className="settings-actions"><button className="button secondary" type="button" disabled={busy} onClick={() => input.current?.click()}>{busy ? 'Preparando logo…' : value ? 'Cambiar logo' : 'Subir logo'}</button>{value && <button className="text-button" type="button" disabled={busy} onClick={() => { onChange(null); setError(''); }}>Quitar logo</button>}</div>
      {error && <p className="error-banner" role="alert">{error}</p>}
    </section>
  </section>;
}
