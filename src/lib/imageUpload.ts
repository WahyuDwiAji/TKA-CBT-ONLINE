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
  maxDimension = 1024,
  maxDataUrlLength = 320000
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

  // Keep already-compact images intact
  if (rawDataUrl.length <= maxDataUrlLength && isNativeServerAllowed) {
    return rawDataUrl;
  }

  try {
    const img = await loadImageElement(rawDataUrl);
    const qualities = [0.84, 0.72, 0.6, 0.48];
    const scales = [1, 0.78, 0.6, 0.45];

    for (const dimFactor of scales) {
      const capDim = Math.max(240, Math.round(maxDimension * dimFactor));
      const scale = Math.min(1, capDim / Math.max(img.width || 1, img.height || 1));
      const targetW = Math.max(1, Math.round(img.width * scale));
      const targetH = Math.max(1, Math.round(img.height * scale));

      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        if (isNativeServerAllowed && rawDataUrl.length <= maxDataUrlLength) return rawDataUrl;
        throw new Error('Canvas browser tidak tersedia untuk memproses gambar.');
      }

      ctx.drawImage(img, 0, 0, targetW, targetH);

      for (const q of qualities) {
        const webp = canvas.toDataURL('image/webp', q);
        if (webp.startsWith('data:image/webp') && webp.length <= maxDataUrlLength) {
          return webp;
        }
        const jpeg = canvas.toDataURL('image/jpeg', q);
        if (jpeg.startsWith('data:image/jpeg') && jpeg.length <= maxDataUrlLength) {
          return jpeg;
        }
      }
    }

    throw new Error('Ukuran gambar terlalu besar untuk disimpan di database. Gunakan gambar beresolusi lebih kecil.');
  } catch (err) {
    if (err instanceof Error && err.message.includes('terlalu besar')) {
      throw err;
    }
    if (isNativeServerAllowed && rawDataUrl.length <= maxDataUrlLength) {
      return rawDataUrl;
    }
    throw new Error('Format gambar tidak didukung. Gunakan PNG, JPG/JPEG, WebP, atau GIF.');
  }
}

export async function uploadQuestionImageFile(file: File): Promise<string> {
  return compressImageToDataUrl(file, 1024, 320000);
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

