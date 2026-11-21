import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Image as ImageIcon,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { ImageAsset, WordEntry } from '../types/models';
import { useImageUrl } from '../hooks/useImageUrl';
import { prepareImageBlobForStorage } from '../services/imageUtils';
import { formatStorageError } from '../db/indexedDb';
import { normalizeMeaningKey, normalizeWordKey } from '../quiz/normalize';
import { generateId } from '../utils/id';

interface ImagePickerModalProps {
  entry: WordEntry;
  allAssets: ImageAsset[];
  onClose: () => void;
  onSaveNewAssetAndAttach: (
    asset: ImageAsset,
    entryPatch: Pick<WordEntry, 'imageId' | 'imageConfirmed' | 'isAbstract' | 'meaningHint'>,
  ) => Promise<void>;
  onUpdateExistingAssetAndAttach: (
    asset: ImageAsset,
    entryPatch: Pick<WordEntry, 'imageId' | 'imageConfirmed' | 'isAbstract' | 'meaningHint'>,
  ) => Promise<void>;
  onDetachImage: () => Promise<void>;
}

function AssetPreviewCard({
  asset,
  badge,
  recommended,
  onSelect,
}: {
  asset: ImageAsset;
  badge?: string;
  recommended?: boolean;
  onSelect: (asset: ImageAsset) => void;
}) {
  const url = useImageUrl(asset.blob);
  return (
    <button
      type="button"
      className={`asset-reuse-card ${recommended ? 'recommended' : ''}`}
      onClick={() => onSelect(asset)}
    >
      {url ? (
        <img className="asset-reuse-thumb" src={url} alt={asset.word} />
      ) : (
        <div className="asset-reuse-thumb" />
      )}
      <strong className="en-text" style={{ fontSize: '0.9rem' }}>
        {asset.word}
      </strong>
      {asset.meaningHint ? (
        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
          {asset.meaningHint}
        </span>
      ) : null}
      {badge ? <span className="badge badge-success">{badge}</span> : null}
    </button>
  );
}

export function ImagePickerModal({
  entry,
  allAssets,
  onClose,
  onSaveNewAssetAndAttach,
  onUpdateExistingAssetAndAttach,
  onDetachImage,
}: ImagePickerModalProps) {
  const currentAsset = useMemo(
    () => (entry.imageId ? allAssets.find((a) => a.id === entry.imageId) ?? null : null),
    [allAssets, entry.imageId],
  );

  const [pendingBlob, setPendingBlob] = useState<Blob | null>(null);
  const [pendingMime, setPendingMime] = useState<string>('');
  const [pendingSource, setPendingSource] = useState<'upload' | 'camera'>('upload');

  const [meaningHint, setMeaningHint] = useState(entry.meaningHint ?? currentAsset?.meaningHint ?? '');
  const [isAbstract, setIsAbstract] = useState(Boolean(entry.isAbstract));
  const [confirmed, setConfirmed] = useState(
    Boolean(entry.imageId && entry.imageConfirmed && currentAsset?.confirmed),
  );
  const [confusableInput, setConfusableInput] = useState(
    (currentAsset?.confusableWords ?? []).join(', '),
  );
  const [reuseQuery, setReuseQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const activeBlob = pendingBlob ?? currentAsset?.blob ?? null;
  const activePreviewUrl = useImageUrl(activeBlob);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const { exactMatches, wordMatches, otherConfirmed } = useMemo(() => {
    const targetWord = normalizeWordKey(entry.word);
    const targetMeaning = normalizeMeaningKey(meaningHint);
    const q = reuseQuery.trim().toLowerCase();

    const exact: ImageAsset[] = [];
    const sameWordList: ImageAsset[] = [];
    const others: ImageAsset[] = [];

    for (const asset of allAssets) {
      if (!asset.confirmed) continue;
      if (asset.id === entry.imageId && !pendingBlob) continue;

      if (q) {
        const hay = `${asset.word} ${asset.meaningHint}`.toLowerCase();
        if (!hay.includes(q)) continue;
      }

      const sameWord = asset.normalizedWord === targetWord && targetWord.length > 0;
      const sameMeaning =
        targetMeaning.length > 0
          ? asset.normalizedMeaning === targetMeaning
          : asset.normalizedMeaning === '';

      if (sameWord && sameMeaning) exact.push(asset);
      else if (sameWord) sameWordList.push(asset);
      else others.push(asset);
    }

    return { exactMatches: exact, wordMatches: sameWordList, otherConfirmed: others };
  }, [allAssets, entry.word, entry.imageId, meaningHint, pendingBlob, reuseQuery]);

  async function handleFileSelected(file: File | undefined, source: 'upload' | 'camera') {
    if (!file) return;
    setError(null);
    try {
      const prepared = await prepareImageBlobForStorage(file);
      setPendingBlob(prepared.blob);
      setPendingMime(prepared.mimeType);
      setPendingSource(source);
      // 抽象詞預設提醒家長確認後再勾選；一般詞上傳後預設先讓家長檢視預覽並勾選確認
      setConfirmed(!isAbstract);
    } catch (err) {
      setError(err instanceof Error ? err.message : '圖片讀取失敗，請選擇其他圖片檔。');
    }
  }

  function parseConfusableWords(): string[] {
    return confusableInput
      .split(/[,，\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  async function handleSave() {
    setError(null);
    if (!pendingBlob && !currentAsset) {
      setError('請先上傳圖片，或從下方選用其他單字組已確認的配圖。');
      return;
    }

    setSaving(true);
    const now = Date.now();
    const confusableWords = parseConfusableWords();
    const trimmedMeaning = meaningHint.trim();

    try {
      if (pendingBlob) {
        const newAsset: ImageAsset = {
          id: generateId('img'),
          word: entry.word.trim(),
          normalizedWord: normalizeWordKey(entry.word),
          meaningHint: trimmedMeaning,
          normalizedMeaning: normalizeMeaningKey(trimmedMeaning),
          blob: pendingBlob,
          mimeType: pendingMime || 'image/jpeg',
          source: pendingSource,
          confirmed,
          confusableWords,
          createdAt: now,
          updatedAt: now,
        };
        await onSaveNewAssetAndAttach(newAsset, {
          imageId: newAsset.id,
          imageConfirmed: confirmed,
          isAbstract,
          meaningHint: trimmedMeaning || undefined,
        });
      } else if (currentAsset) {
        const updatedAsset: ImageAsset = {
          ...currentAsset,
          word: entry.word.trim(),
          normalizedWord: normalizeWordKey(entry.word),
          meaningHint: trimmedMeaning,
          normalizedMeaning: normalizeMeaningKey(trimmedMeaning),
          confirmed,
          confusableWords,
          updatedAt: now,
        };
        await onUpdateExistingAssetAndAttach(updatedAsset, {
          imageId: updatedAsset.id,
          imageConfirmed: confirmed,
          isAbstract,
          meaningHint: trimmedMeaning || undefined,
        });
      }
      onClose();
    } catch (err) {
      setError(formatStorageError(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleReuseConfirmedAsset(asset: ImageAsset) {
    setError(null);
    setSaving(true);
    try {
      // 共用配圖只保存一份：直接參照同一個 asset.id，不複製 Blob
      await onUpdateExistingAssetAndAttach(asset, {
        imageId: asset.id,
        imageConfirmed: true,
        isAbstract,
        meaningHint: (meaningHint.trim() || asset.meaningHint || undefined),
      });
      onClose();
    } catch (err) {
      setError(formatStorageError(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    setError(null);
    setSaving(true);
    try {
      await onDetachImage();
      onClose();
    } catch (err) {
      setError(formatStorageError(err));
    } finally {
      setSaving(false);
    }
  }

  const needsReconfirm = Boolean(currentAsset && !pendingBlob && !entry.imageConfirmed);

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="image-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-panel stack-md">
        <div className="row-between">
          <div>
            <h2 id="image-modal-title" className="section-title">
              設定配圖：<span className="en-text">{entry.word}</span>
            </h2>
            <p className="field-hint" style={{ margin: '0.2rem 0 0' }}>
              只有家長確認過的圖片才會出現在「看圖選字」題庫中。
            </p>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            aria-label="關閉視窗"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>

        {needsReconfirm ? (
          <div className="alert alert-warning">
            <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <strong>請重新確認既有配圖是否適用</strong>
              <div>
                此詞條的拼寫剛修改過或尚未確認。請確認下方圖片仍對應「
                <span className="en-text">{entry.word}</span>」再勾選確認，或更換新圖片。
              </div>
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="alert alert-danger" role="alert">
            <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>{error}</span>
          </div>
        ) : null}

        {/* 上傳與拍照區 */}
        <div className="card-subtle stack-sm">
          <div className="row-wrap">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={16} />
              <span>從裝置上傳圖片</span>
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => cameraInputRef.current?.click()}
            >
              <Camera size={16} />
              <span>拍照作為配圖</span>
            </button>
            {currentAsset && !pendingBlob ? (
              <button
                type="button"
                className="btn btn-danger-outline btn-sm"
                disabled={saving}
                onClick={handleRemove}
              >
                <Trash2 size={15} />
                <span>移除此詞配圖</span>
              </button>
            ) : null}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              void handleFileSelected(e.target.files?.[0], 'upload');
              e.target.value = '';
            }}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(e) => {
              void handleFileSelected(e.target.files?.[0], 'camera');
              e.target.value = '';
            }}
          />

          {activePreviewUrl ? (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '0.5rem' }}>
              <div className="picture-frame" style={{ maxWidth: 280 }}>
                <img src={activePreviewUrl} alt={entry.word} />
              </div>
            </div>
          ) : (
            <div
              className="row"
              style={{
                justifyContent: 'center',
                padding: '1.25rem',
                color: 'var(--color-text-muted)',
                fontSize: '0.875rem',
              }}
            >
              <ImageIcon size={18} />
              <span>尚未選擇圖片，可由上方上傳或從下方重用既有配圖</span>
            </div>
          )}
        </div>

        {/* 圖片屬性與家長確認設定 */}
        {activePreviewUrl ? (
          <div className="stack-sm">
            <div className="field">
              <label className="field-label" htmlFor="img-meaning-hint">
                詞義或情境提示（供跨組同詞同詞義重用）
              </label>
              <input
                id="img-meaning-hint"
                className="input"
                type="text"
                value={meaningHint}
                placeholder="例如：冰淇淋、或抽象詞情境描述（知名的歌手）"
                onChange={(e) => setMeaningHint(e.target.value)}
              />
            </div>

            <div className="field">
              <label className="field-label" htmlFor="img-confusable">
                易混淆干擾詞排除（選填，以逗號分隔）
              </label>
              <input
                id="img-confusable"
                className="input en-text"
                type="text"
                value={confusableInput}
                placeholder="例如：cup, mug（若此圖也容易被看成這些詞，出題時將排除）"
                onChange={(e) => setConfusableInput(e.target.value)}
              />
            </div>

            <label className="row" style={{ cursor: 'pointer', padding: '0.25rem 0' }}>
              <input
                type="checkbox"
                checked={isAbstract}
                onChange={(e) => {
                  const next = e.target.checked;
                  setIsAbstract(next);
                  if (next && pendingBlob) {
                    setConfirmed(false);
                  }
                }}
              />
              <span style={{ fontSize: '0.9rem' }}>
                此為抽象詞，使用情境圖（須由家長特別確認含義明確）
              </span>
            </label>

            <label
              className="row"
              style={{
                cursor: 'pointer',
                padding: '0.65rem 0.75rem',
                borderRadius: 'var(--radius-md)',
                background: confirmed ? 'var(--color-success-soft)' : 'var(--color-warning-soft)',
                border: `1px solid ${confirmed ? 'var(--color-success-border)' : 'var(--color-warning-border)'}`,
              }}
            >
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>
                家長已確認此圖片含義清楚且對應「<span className="en-text">{entry.word}</span>
                」，允許用於看圖選字
              </span>
            </label>

            <div className="row-wrap" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                取消
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={saving}
                onClick={handleSave}
              >
                <CheckCircle2 size={18} />
                <span>{saving ? '儲存中…' : '儲存配圖設定'}</span>
              </button>
            </div>
          </div>
        ) : null}

        {/* 從其他單字組選用已確認的配圖 */}
        <div className="stack-sm" style={{ borderTop: '1px solid var(--color-border)', paddingTop: '1rem' }}>
          <div className="row-between">
            <h3 className="section-title" style={{ fontSize: '1rem' }}>
              從已確認圖庫重用配圖（共用只存一份）
            </h3>
            <span className="badge badge-neutral">
              {exactMatches.length + wordMatches.length + otherConfirmed.length} 張可選
            </span>
          </div>

          {allAssets.some((a) => a.confirmed) ? (
            <>
              <div className="row" style={{ position: 'relative' }}>
                <Search
                  size={16}
                  style={{
                    position: 'absolute',
                    left: 12,
                    color: 'var(--color-text-muted)',
                    pointerEvents: 'none',
                  }}
                />
                <input
                  className="input"
                  style={{ paddingLeft: 36 }}
                  type="search"
                  placeholder="搜尋其他單字組已確認的配圖（英文或詞義）"
                  value={reuseQuery}
                  onChange={(e) => setReuseQuery(e.target.value)}
                />
              </div>

              {exactMatches.length > 0 ? (
                <div className="stack-sm">
                  <div className="field-hint" style={{ color: 'var(--color-success)', fontWeight: 600 }}>
                    同詞同詞義配圖（點擊即可直接重用）
                  </div>
                  <div className="asset-reuse-grid">
                    {exactMatches.map((asset) => (
                      <AssetPreviewCard
                        key={asset.id}
                        asset={asset}
                        badge="同詞同詞義"
                        recommended
                        onSelect={handleReuseConfirmedAsset}
                      />
                    ))}
                  </div>
                </div>
              ) : null}

              {wordMatches.length > 0 ? (
                <div className="stack-sm">
                  <div className="field-hint">同拼寫但不同詞義的已確認配圖</div>
                  <div className="asset-reuse-grid">
                    {wordMatches.map((asset) => (
                      <AssetPreviewCard
                        key={asset.id}
                        asset={asset}
                        badge="同拼寫"
                        onSelect={handleReuseConfirmedAsset}
                      />
                    ))}
                  </div>
                </div>
              ) : null}

              {otherConfirmed.length > 0 ? (
                <div className="stack-sm">
                  <div className="field-hint">其他單字組已確認配圖</div>
                  <div className="asset-reuse-grid">
                    {otherConfirmed.map((asset) => (
                      <AssetPreviewCard
                        key={asset.id}
                        asset={asset}
                        onSelect={handleReuseConfirmedAsset}
                      />
                    ))}
                  </div>
                </div>
              ) : null}

              {exactMatches.length === 0 &&
              wordMatches.length === 0 &&
              otherConfirmed.length === 0 ? (
                <p className="field-hint">沒有符合搜尋條件的其他已確認配圖。</p>
              ) : null}
            </>
          ) : (
            <p className="field-hint">
              目前圖庫尚無已確認的配圖。為任一單字上傳並確認配圖後，其他課次遇到相同單字即可直接重用。
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
