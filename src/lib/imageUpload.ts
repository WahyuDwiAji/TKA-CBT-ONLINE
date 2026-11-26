const NATIVE_ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
]);

const SERVER_ALLOWED_DATA_URL_REGEX =
  /^data:image\/(png|jpeg|jpg|webp|gif);base64,[a-zA-Z0-9+/=]+$/i;

const IMAGE_EXT_REGEX = /\.(png|jpe?g|webp|gif|bmp|svg|avif|tiff?|ico)$/i;

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
  if (SERVER_ALLOWED_DATA_URL_REGEX.test(trimmed)) {
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

function isLikelyImageFile(file: File): boolean {
  const mime = (file.type || '').toLowerCase();
  if (mime.startsWith('image/')) return true;
  if (!mime && IMAGE_EXT_REGEX.test(file.name || '')) return true;
  return false;
}

export async function dataUrlToFile(dataUrl: string, filename = 'pasted-image.png'): Promise<File> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const mime = blob.type || 'image/png';
  const ext = mime.split('/')[1]?.replace('jpeg', 'jpg').split('+')[0] || 'png';
  const safeName = filename.includes('.') ? filename : `pasted-image.${ext}`;
  return new File([blob], safeName, { type: mime });
}

export async function compressImageToDataUrl(
  file: File,
  maxDimension = 1280
): Promise<string> {
  if (!isLikelyImageFile(file)) {
    throw new Error('Format gambar harus PNG, JPG/JPEG, WebP, GIF, atau BMP.');
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('Ukuran file gambar maksimal 10 MB.');
  }

  const mime = (file.type || '').toLowerCase();
  const rawDataUrl = await readFileAsDataUrl(file);
  const isNativeServerAllowed =
    NATIVE_ALLOWED_MIME_TYPES.has(mime) && SERVER_ALLOWED_DATA_URL_REGEX.test(rawDataUrl);

  // Keep animated GIFs or already-compact native PNG/WebP/JPG intact
  if ((mime === 'image/gif' || file.size <= 220 * 1024) && isNativeServerAllowed) {
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
    if (!ctx) {
      if (isNativeServerAllowed) return rawDataUrl;
      throw new Error('Canvas browser tidak tersedia untuk memproses gambar.');
    }

    ctx.drawImage(img, 0, 0, targetW, targetH);

    // Prefer WebP (preserves transparency + great compression), fallback to PNG/JPEG
    const webp = canvas.toDataURL('image/webp', 0.88);
    if (
      webp.startsWith('data:image/webp') &&
      (!isNativeServerAllowed || webp.length < rawDataUrl.length)
    ) {
      return webp;
    }

    const fallbackType =
      mime === 'image/jpeg' || mime === 'image/jpg' ? 'image/jpeg' : 'image/png';
    const compressed = canvas.toDataURL(fallbackType, 0.88);
    if (!isNativeServerAllowed || compressed.length < rawDataUrl.length) {
      return compressed;
    }
    return rawDataUrl;
  } catch {
    if (isNativeServerAllowed) {
      return rawDataUrl;
    }
    throw new Error('Format gambar tidak didukung. Gunakan PNG, JPG/JPEG, WebP, atau GIF.');
  }
}

export async function uploadQuestionImageFile(file: File): Promise<string> {
  const dataUrl = await compressImageToDataUrl(file);

  const res = await fetch('/api/uploads/question-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      dataUrl,
      filename: file.name || 'pasted-image.png',
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

export interface ClipboardImageResult {
  file?: File;
  dataUrl?: string;
  imageUrl?: string;
}

export function extractImageFromClipboardData(
  clipboardData: DataTransfer | null | undefined
): ClipboardImageResult | null {
  if (!clipboardData) return null;

  // 1. Check DataTransferItemList (screenshots, Copy Image from browser, etc.)
  const items = clipboardData.items;
  if (items && items.length > 0) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind !== 'file') continue;
      if (item.type.startsWith('image/') || item.type === '') {
        const file = item.getAsFile();
        if (file && file.size > 0 && isLikelyImageFile(file)) {
          return { file };
        }
      }
    }
  }

  // 2. Check DataTransfer.files fallback (Explorer / Finder file paste)
  const files = clipboardData.files;
  if (files && files.length > 0) {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file && file.size > 0 && isLikelyImageFile(file)) {
        return { file };
      }
    }
  }

  // 3. Check HTML payload for standalone pasted <img> (e.g. from Word, Docs, or web page)
  const plainText = (clipboardData.getData('text/plain') || '').trim();
  const html = clipboardData.getData('text/html') || '';
  if (html && typeof DOMParser !== 'undefined') {
    try {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const img = doc.querySelector('img');
      const bodyText = (doc.body?.textContent || '').trim();
      if (img && (!bodyText || bodyText === plainText)) {
        const src = (img.getAttribute('src') || '').trim();
        if (src.startsWith('data:image/')) {
          return { dataUrl: src };
        }
        if (/^https?:\/\//i.test(src) && !bodyText) {
          return { imageUrl: src };
        }
      }
    } catch {
      // ignore HTML parse fallback errors
    }
  }

  // 4. Check if plain text itself is a base64 data:image URL
  if (plainText.startsWith('data:image/')) {
    return { dataUrl: plainText };
  }

  return null;
}

export async function resolveClipboardImageToFile(
  result: ClipboardImageResult
): Promise<{ file?: File; imageUrl?: string }> {
  if (result.file) {
    return { file: result.file };
  }
  if (result.dataUrl) {
    const file = await dataUrlToFile(result.dataUrl, `clipboard-${Date.now()}.png`);
    return { file };
  }
  if (result.imageUrl) {
    return { imageUrl: result.imageUrl };
  }
  return {};
}

export async function readImageFromNavigatorClipboard(): Promise<File> {
  if (!navigator.clipboard || typeof navigator.clipboard.read !== 'function') {
    throw new Error(
      'Browser tidak mendukung tombol baca clipboard. Tekan Ctrl+V langsung pada form editor.'
    );
  }

  let items: ClipboardItems;
  try {
    items = await navigator.clipboard.read();
  } catch {
    throw new Error(
      'Izin clipboard ditolak browser. Klik area editor lalu tekan Ctrl+V (atau Cmd+V).'
    );
  }

  const preferredOrder = ['image/png', 'image/webp', 'image/jpeg', 'image/gif'];
  for (const item of items) {
    const matchedType =
      preferredOrder.find((t) => item.types.includes(t)) ||
      item.types.find((t) => t.startsWith('image/'));
    if (matchedType) {
      const blob = await item.getType(matchedType);
      const ext = matchedType.split('/')[1]?.replace('jpeg', 'jpg').split('+')[0] || 'png';
      return new File([blob], `clipboard-${Date.now()}.${ext}`, { type: matchedType });
    }
  }

  throw new Error('Tidak ada gambar di clipboard. Salin gambar / screenshot terlebih dahulu.');
}

