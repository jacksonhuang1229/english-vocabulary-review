/**
 * 驗證檔案是否為瀏覽器可成功解碼的圖片，回傳寬高。
 * 若為損毀檔案或非圖片格式，會拋出清楚的錯誤訊息。
 */
export async function verifyImageDecodable(
  file: Blob,
): Promise<{ width: number; height: number; img: HTMLImageElement }> {
  if (!file || file.size === 0) {
    throw new Error('圖片檔案為空，無法讀取。');
  }

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('無法解碼此圖片檔案，請確認格式為 JPG、PNG 或 WebP 後重試。'));
      image.src = url;
    });

    if (img.naturalWidth <= 0 || img.naturalHeight <= 0) {
      throw new Error('無法讀取圖片尺寸，檔案可能已損毀。');
    }

    return { width: img.naturalWidth, height: img.naturalHeight, img };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * 將手機高解析度照片最佳化至適合本機儲存的大小（預設最長邊 960px），
 * 同時確保圖片可正常解碼。
 */
export async function prepareImageBlobForStorage(
  file: File,
  maxDimension = 960,
): Promise<{ blob: Blob; mimeType: string }> {
  const { width, height, img } = await verifyImageDecodable(file);

  // 小圖片且格式合適時直接保存原檔
  if (width <= maxDimension && height <= maxDimension && file.size <= 450 * 1024) {
    return {
      blob: file,
      mimeType: file.type || 'image/jpeg',
    };
  }

  const scale = Math.min(1, maxDimension / Math.max(width, height));
  const targetW = Math.max(1, Math.round(width * scale));
  const targetH = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return { blob: file, mimeType: file.type || 'image/jpeg' };
  }

  ctx.drawImage(img, 0, 0, targetW, targetH);

  const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
  const quality = outputType === 'image/jpeg' ? 0.85 : undefined;

  const compressed = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), outputType, quality);
  });

  if (!compressed) {
    return { blob: file, mimeType: file.type || 'image/jpeg' };
  }

  return {
    blob: compressed,
    mimeType: compressed.type || outputType,
  };
}
