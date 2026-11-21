import { useEffect, useState } from 'react';

/**
 * 將 IndexedDB 儲存的 Blob 轉為可顯示的 ObjectURL，並在 unmount 或變更時自動釋放。
 */
export function useImageUrl(blob?: Blob | null): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [blob]);

  return url;
}
