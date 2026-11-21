const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
]);

export function sanitizeImageUrl(url?: string): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('/uploads/') && !trimmed.includes('..')) {
    return trimmed;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  if (/^data:image\/(png|jpeg|jpg|webp|gif);base64,[a-zA-Z0-9+/=]+$/i.test(trimmed)) {
    return trimmed;
  }
  return null;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Gagal membaca file gambar.'));
      }
    };
    reader.onerror = () => reject(new Error('Gagal membaca file gambar.'));
    reader.readAsDataURL(file);
  });
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('File bukan gambar yang valid atau rusak.'));
    img.src = src;
  });
}

export async function compressImageToDataUrl(
  file: File,
  maxDimension = 1280
): Promise<string> {
  const mime = file.type.toLowerCase();
  if (!ALLOWED_MIME_TYPES.has(mime)) {
    throw new Error('Format gambar harus PNG, JPG/JPEG, WebP, atau GIF.');
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('Ukuran file gambar maksimal 10 MB.');
  }

  const rawDataUrl = await readFileAsDataUrl(file);

  // Keep animated GIFs or already-compact PNG/WebP/JPG intact
  if (mime === 'image/gif' || file.size <= 220 * 1024) {
    return rawDataUrl;
  }

  try {
    const img = await loadImageElement(rawDataUrl);
    const scale = Math.min(
      1,
      maxDimension / Math.max(img.width || 1, img.height || 1)
    );
    const targetW = Math.max(1, Math.round(img.width * scale));
    const targetH = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return rawDataUrl;

    ctx.drawImage(img, 0, 0, targetW, targetH);

    // Prefer WebP (preserves transparency + great compression), fallback to JPEG/PNG
    const webp = canvas.toDataURL('image/webp', 0.86);
    if (webp.startsWith('data:image/webp') && webp.length < rawDataUrl.length) {
      return webp;
    }
    const fallbackType = mime === 'image/png' ? 'image/png' : 'image/jpeg';
    const compressed = canvas.toDataURL(fallbackType, 0.86);
    return compressed.length < rawDataUrl.length ? compressed : rawDataUrl;
  } catch {
    return rawDataUrl;
  }
}

export async function uploadQuestionImageFile(file: File): Promise<string> {
  const dataUrl = await compressImageToDataUrl(file);

  const res = await fetch('/api/uploads/question-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      dataUrl,
      filename: file.name,
    }),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || 'Gagal mengunggah gambar ke server.');
  }

  const payload = (await res.json()) as { url?: string };
  if (!payload.url) {
    throw new Error('Server tidak mengembalikan URL gambar.');
  }
  return payload.url;
}
