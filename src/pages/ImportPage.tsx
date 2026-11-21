import { useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  CheckCircle2,
  ClipboardPaste,
  FileJson,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  ImagePlus,
  Loader2,
  Plus,
  Trash2,
} from 'lucide-react';
import type { DraftEntry, ImageAsset, WordGroup, WordSet } from '../types/models';
import {
  parseWordListText,
  readUtf8TextFile,
  suggestSetNameFromFilename,
} from '../services/textImport';
import { parseAnyVocabPackageJson } from '../services/shareService';
import { normalizeSpellText } from '../quiz/normalize';
import { recognizeEnglishWordsFromImage } from '../services/ocrService';
import { formatStorageError } from '../db/indexedDb';
import { generateId } from '../utils/id';

interface ImportPageProps {
  onCancel: () => void;
  onSaveWordSet: (wordSet: WordSet, bundledAssets?: ImageAsset[]) => Promise<void>;
  onSaveImportedGroup: (
    group: WordGroup,
    wordSets: WordSet[],
    bundledAssets?: ImageAsset[],
  ) => Promise<void>;
}

export function ImportPage({ onCancel, onSaveWordSet, onSaveImportedGroup }: ImportPageProps) {
  const [setName, setSetName] = useState('');
  const [entries, setEntries] = useState<DraftEntry[]>([]);
  const [bundledAssetsById, setBundledAssetsById] = useState<Record<string, ImageAsset>>({});
  const [pendingGroupImport, setPendingGroupImport] = useState<{
    group: WordGroup;
    wordSets: WordSet[];
    imageAssets: ImageAsset[];
  } | null>(null);
  const [showPasteBox, setShowPasteBox] = useState(false);
  const [pasteText, setPasteText] = useState('');

  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrStatus, setOcrStatus] = useState('');
  const [ocrProgress, setOcrProgress] = useState(0);

  const [notice, setNotice] = useState<{
    tone: 'info' | 'warning' | 'danger' | 'success';
    text: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  const txtInputRef = useRef<HTMLInputElement>(null);
  const pkgInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  function mergeImportedEntries(newEntries: DraftEntry[], sourceLabel: string) {
    setEntries((prev) => [...prev, ...newEntries]);
    setNotice({
      tone: 'success',
      text: `已從「${sourceLabel}」匯入 ${newEntries.length} 個詞條，請在下方檢查並修正後點擊「確認儲存」。`,
    });
  }

  async function handleTxtFileChange(file: File | undefined) {
    if (!file) return;
    setNotice(null);
    try {
      const content = await readUtf8TextFile(file);
      const parsed = parseWordListText(content);
      if (parsed.empty) {
        setNotice({
          tone: 'warning',
          text: '這個文字檔是空的或沒有任何有效詞條。您目前的預覽內容已完整保留，請選擇其他檔案或直接手動輸入。',
        });
        return;
      }
      if (!setName.trim()) {
        setSetName(suggestSetNameFromFilename(file.name));
      }
      mergeImportedEntries(parsed.entries, file.name);
    } catch (err) {
      setNotice({
        tone: 'danger',
        text: `${err instanceof Error ? err.message : '文字檔讀取失敗'}。您目前的編輯內容已保留。`,
      });
    }
  }

  async function handlePackageFileChange(file: File | undefined) {
    if (!file) return;
    setNotice(null);
    try {
      const content = await readUtf8TextFile(file);
      const parsed = parseAnyVocabPackageJson(content);

      if (parsed.kind === 'group') {
        setPendingGroupImport({
          group: parsed.group,
          wordSets: parsed.wordSets,
          imageAssets: parsed.imageAssets,
        });
        setNotice({
          tone: 'success',
          text: `已讀取共用群組檔「${file.name}」（內含 ${parsed.wordSets.length} 個課次${
            parsed.imageAssets.length > 0 ? `與 ${parsed.imageAssets.length} 張配圖` : ''
          }），請在下方確認群組名稱後一鍵匯入！`,
        });
        return;
      }

      const { wordSet: importedSet, imageAssets } = parsed;
      if (!setName.trim()) {
        setSetName(importedSet.name);
      }
      if (imageAssets.length > 0) {
        setBundledAssetsById((prev) => {
          const next = { ...prev };
          for (const asset of imageAssets) {
            next[asset.id] = asset;
          }
          return next;
        });
      }
      const draftItems: DraftEntry[] = importedSet.entries.map((entry) => ({
        id: generateId('draft'),
        word: entry.word,
        meaningHint: entry.meaningHint ?? '',
        isAbstract: entry.isAbstract,
        bundledImageId: entry.imageId ?? null,
        bundledImageConfirmed: Boolean(entry.imageConfirmed),
        originalBundledWord: entry.word,
      }));
      setEntries((prev) => [...prev, ...draftItems]);
      setNotice({
        tone: 'success',
        text: `已從共用單字組檔「${file.name}」載入 ${draftItems.length} 個詞條${
          imageAssets.length > 0 ? `與 ${imageAssets.length} 張配圖` : ''
        }，確認後點擊「確認儲存單字組」即可寫入本機。`,
      });
    } catch (err) {
      setNotice({
        tone: 'danger',
        text: `${err instanceof Error ? err.message : '共用檔案讀取失敗'}。您目前的編輯內容已保留。`,
      });
    }
  }

  async function handleConfirmGroupImport() {
    if (!pendingGroupImport) return;
    const trimmedName = pendingGroupImport.group.name.trim();
    if (!trimmedName) {
      setNotice({ tone: 'warning', text: '請先填寫群組名稱再匯入。' });
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      await onSaveImportedGroup(
        { ...pendingGroupImport.group, name: trimmedName },
        pendingGroupImport.wordSets,
        pendingGroupImport.imageAssets,
      );
    } catch (err) {
      setNotice({
        tone: 'danger',
        text: `${formatStorageError(err)} 您目前的匯入預覽已保留。`,
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleImageForOcr(file: File | undefined, sourceTitle: string) {
    if (!file) return;
    setNotice(null);
    setOcrLoading(true);
    setOcrProgress(0.05);
    setOcrStatus('正在準備辨識照片…');

    try {
      const result = await recognizeEnglishWordsFromImage(file, (update) => {
        setOcrStatus(update.status);
        setOcrProgress(update.progress);
      });

      if (result.entries.length === 0) {
        setNotice({
          tone: 'warning',
          text: '未能從這張照片辨識出英文單字（可能過於模糊、光線不足或非單欄印刷英文）。已保留您目前的匯入內容，可重拍、改選其他照片，或使用下方「手動貼上文字」。',
        });
        return;
      }

      setEntries((prev) => [...prev, ...result.entries]);
      if (result.lowConfidenceWarning) {
        setNotice({
          tone: 'warning',
          text: `已辨識出 ${result.entries.length} 行（照片略模糊，辨識信心度約 ${Math.round(result.confidence)}%），建議逐行檢查拼寫後再確認儲存，或重拍更清晰的照片。`,
        });
      } else {
        setNotice({
          tone: 'success',
          text: `已透過${sourceTitle}辨識出 ${result.entries.length} 個英文詞條！請確認拼寫並填寫課次名稱後儲存。`,
        });
      }
    } catch (err) {
      setNotice({
        tone: 'danger',
        text: `${err instanceof Error ? err.message : '照片辨識失敗'}。已保留您目前的預覽內容，可重拍、換檔或手動貼上文字。`,
      });
    } finally {
      setOcrLoading(false);
    }
  }

  function handleApplyPaste() {
    const parsed = parseWordListText(pasteText);
    if (parsed.empty) {
      setNotice({
        tone: 'warning',
        text: '貼上的文字為空，請每行輸入一個英文單字或片語。',
      });
      return;
    }
    mergeImportedEntries(parsed.entries, '手動貼上');
    setPasteText('');
    setShowPasteBox(false);
  }

  function handleAddBlankRow() {
    setEntries((prev) => [
      ...prev,
      { id: generateId('draft'), word: '', meaningHint: '' },
    ]);
  }

  function handleUpdateRow(id: string, patch: Partial<DraftEntry>) {
    setEntries((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function handleDeleteRow(id: string) {
    setEntries((prev) => prev.filter((item) => item.id !== id));
  }

  function handleCancelClick() {
    const hasUnsaved = setName.trim().length > 0 || entries.length > 0;
    if (hasUnsaved && !window.confirm('取消匯入將不會儲存目前的預覽內容，確定要返回嗎？')) {
      return;
    }
    onCancel();
  }

  async function handleConfirmSave() {
    setNotice(null);
    const trimmedName = setName.trim();
    if (!trimmedName) {
      setNotice({
        tone: 'warning',
        text: '請先填寫課次名稱（例如：Flyer - Unit 4）。',
      });
      return;
    }

    const cleanedEntries = entries
      .map((item) => ({
        ...item,
        word: item.word.trim().replace(/\s+/g, ' '),
        meaningHint: item.meaningHint.trim(),
      }))
      .filter((item) => item.word.length > 0);

    if (cleanedEntries.length === 0) {
      setNotice({
        tone: 'warning',
        text: '請至少加入 1 個英文單字後再確認儲存。',
      });
      return;
    }

    const now = Date.now();
    const usedBundledIds = new Set<string>();
    const newSet: WordSet = {
      id: generateId('set'),
      name: trimmedName,
      createdAt: now,
      updatedAt: now,
      entries: cleanedEntries.map((item) => {
        const hasBundledImg = Boolean(item.bundledImageId && bundledAssetsById[item.bundledImageId]);
        if (hasBundledImg && item.bundledImageId) {
          usedBundledIds.add(item.bundledImageId);
        }
        const spellingChanged =
          hasBundledImg &&
          item.originalBundledWord &&
          normalizeSpellText(item.word) !== normalizeSpellText(item.originalBundledWord);

        return {
          id: generateId('word'),
          word: item.word,
          meaningHint: item.meaningHint || undefined,
          isAbstract: item.isAbstract || undefined,
          imageId: hasBundledImg ? item.bundledImageId : undefined,
          imageConfirmed: hasBundledImg
            ? spellingChanged
              ? false
              : Boolean(item.bundledImageConfirmed)
            : undefined,
        };
      }),
    };

    const assetsToSave = Array.from(usedBundledIds)
      .map((id) => bundledAssetsById[id])
      .filter((a): a is ImageAsset => Boolean(a));

    setSaving(true);
    try {
      await onSaveWordSet(newSet, assetsToSave);
    } catch (err) {
      // 寫入失敗時保留預覽中的所有修改
      setNotice({
        tone: 'danger',
        text: `${formatStorageError(err)} 您目前的預覽與修改已保留。`,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="stack-lg">
      <div className="row-between">
        <button type="button" className="btn btn-ghost" onClick={handleCancelClick}>
          <ArrowLeft size={18} />
          <span>取消並返回清單</span>
        </button>
      </div>

      <section className="card stack-md">
        <div>
          <h1 className="page-title">匯入與建立單字組</h1>
          <p className="muted" style={{ margin: '0.35rem 0 0' }}>
            可上傳 UTF-8 文字檔、用手機拍下單欄印刷單字表、從相簿選圖，或手動貼上。所有來源都會進入下方共用預覽，確認無誤後才寫入本機資料庫。
          </p>
        </div>

        {/* 匯入來源選擇 */}
        <div className="import-sources-grid">
          <button
            type="button"
            className="source-tile"
            disabled={ocrLoading}
            onClick={() => txtInputRef.current?.click()}
          >
            <span className="source-tile-icon">
              <FileText size={20} />
            </span>
            <span className="source-tile-title">上傳 UTF-8 .txt</span>
            <span className="source-tile-desc">每行一個英文詞，支援片語與連字號</span>
          </button>

          <button
            type="button"
            className="source-tile"
            disabled={ocrLoading}
            onClick={() => cameraInputRef.current?.click()}
          >
            <span className="source-tile-icon">
              <Camera size={20} />
            </span>
            <span className="source-tile-title">手機拍照辨識</span>
            <span className="source-tile-desc">拍攝單欄印刷英文，於瀏覽器端 OCR</span>
          </button>

          <button
            type="button"
            className="source-tile"
            disabled={ocrLoading}
            onClick={() => galleryInputRef.current?.click()}
          >
            <span className="source-tile-icon">
              <ImagePlus size={20} />
            </span>
            <span className="source-tile-title">相簿／檔案選圖</span>
            <span className="source-tile-desc">獨立照片上傳入口，免受相機限制</span>
          </button>

          <button
            type="button"
            className="source-tile"
            disabled={ocrLoading}
            onClick={() => pkgInputRef.current?.click()}
          >
            <span className="source-tile-icon" style={{ background: 'var(--color-success-soft)', color: 'var(--color-success)' }}>
              <FileJson size={20} />
            </span>
            <span className="source-tile-title">匯入共用檔／群組檔</span>
            <span className="source-tile-desc">支援 .vocab.json 與 .vocab-group.json（含配圖）</span>
          </button>

          <button
            type="button"
            className="source-tile"
            disabled={ocrLoading}
            onClick={() => setShowPasteBox((v) => !v)}
          >
            <span className="source-tile-icon">
              <ClipboardPaste size={20} />
            </span>
            <span className="source-tile-title">手動貼上文字</span>
            <span className="source-tile-desc">直接貼上或輸入每行一個單字</span>
          </button>
        </div>

        {/* 隱藏檔案輸入元件：拍照與選圖分開保留 */}
        <input
          ref={txtInputRef}
          type="file"
          accept=".txt,text/plain"
          className="sr-only"
          onChange={(e) => {
            void handleTxtFileChange(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <input
          ref={pkgInputRef}
          type="file"
          accept=".json,.vocab.json,application/json"
          className="sr-only"
          onChange={(e) => {
            void handlePackageFileChange(e.target.files?.[0]);
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
            void handleImageForOcr(e.target.files?.[0], '手機拍照');
            e.target.value = '';
          }}
        />
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => {
            void handleImageForOcr(e.target.files?.[0], '選取照片');
            e.target.value = '';
          }}
        />

        {showPasteBox ? (
          <div className="card-subtle stack-sm">
            <label className="field-label" htmlFor="manual-paste-textarea">
              手動貼上英文單字（每行一個英文詞或片語）
            </label>
            <textarea
              id="manual-paste-textarea"
              className="textarea en-text"
              placeholder={'ice cream\nwell-known\ngo\na'}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
            />
            <div className="row-wrap" style={{ justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setShowPasteBox(false)}
              >
                收合
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={handleApplyPaste}>
                加入下方預覽
              </button>
            </div>
          </div>
        ) : null}

        {ocrLoading ? (
          <div className="alert alert-info stack-sm" role="status" aria-live="polite">
            <div className="row">
              <Loader2 size={18} className="spin" />
              <strong>{ocrStatus || '正在辨識照片…'}</strong>
              <span>{Math.round(ocrProgress * 100)}%</span>
            </div>
            <div className="progress-bar">
              <div
                className="progress-bar-fill"
                style={{ width: `${Math.round(ocrProgress * 100)}%` }}
              />
            </div>
            <span className="field-hint">
              辨識完全在您的瀏覽器內執行，照片不會上傳至任何伺服器。
            </span>
          </div>
        ) : null}

        {notice ? (
          <div className={`alert alert-${notice.tone}`} role="alert">
            {notice.tone === 'success' ? (
              <CheckCircle2 size={18} style={{ flexShrink: 0, marginTop: 2 }} />
            ) : (
              <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
            )}
            <span>{notice.text}</span>
          </div>
        ) : null}
      </section>

      {/* 群組檔匯入確認區（當上傳 .vocab-group.json 時顯示） */}
      {pendingGroupImport ? (
        <section className="card stack-md" style={{ borderColor: 'var(--color-success-border)' }}>
          <div className="row-between">
            <div className="row">
              <FolderOpen size={20} style={{ color: 'var(--color-success)' }} />
              <h2 className="section-title">群組檔匯入預覽</h2>
            </div>
            <span className="badge badge-success">
              {pendingGroupImport.wordSets.length} 個課次
              {pendingGroupImport.imageAssets.length > 0
                ? ` · ${pendingGroupImport.imageAssets.length} 張配圖`
                : ''}
            </span>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="import-group-name">
              群組名稱（可修改）
            </label>
            <input
              id="import-group-name"
              className="input"
              type="text"
              value={pendingGroupImport.group.name}
              onChange={(e) =>
                setPendingGroupImport((prev) =>
                  prev ? { ...prev, group: { ...prev.group, name: e.target.value } } : null,
                )
              }
            />
          </div>

          <div className="stack-sm">
            {pendingGroupImport.wordSets.map((ws, idx) => (
              <div
                key={ws.id}
                className="row-between"
                style={{
                  padding: '0.55rem 0.75rem',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                <div className="row-wrap">
                  <span className="entry-row-num" style={{ marginTop: 0, width: 28, height: 28 }}>
                    {idx + 1}
                  </span>
                  <strong>{ws.name}</strong>
                </div>
                <span className="badge badge-primary">{ws.entries.length} 個單字</span>
              </div>
            ))}
          </div>

          <div className="row-wrap" style={{ justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={saving}
              onClick={() => setPendingGroupImport(null)}
            >
              取消此群組檔
            </button>
            <button
              type="button"
              className="btn btn-success btn-lg"
              disabled={saving}
              onClick={() => void handleConfirmGroupImport()}
            >
              <CheckCircle2 size={18} />
              <span>{saving ? '匯入中…' : '確認一次匯入整個群組'}</span>
            </button>
          </div>
        </section>
      ) : null}

      {/* 共用可編輯預覽區 */}
      <section className="card stack-md">
        <div className="row-between">
          <div>
            <h2 className="section-title">匯入預覽與編輯</h2>
            <p className="field-hint" style={{ margin: '0.2rem 0 0' }}>
              可自由修改組名、修正辨識拼寫、增刪詞條，按下「確認儲存單字組」才會寫入。
            </p>
          </div>
          <span className="badge badge-primary">{entries.length} 筆待確認</span>
        </div>

        <div className="field">
          <label className="field-label" htmlFor="import-set-name">
            課次／單字組名稱（必填）
          </label>
          <input
            id="import-set-name"
            className="input"
            type="text"
            placeholder="例如：Flyer - Unit 4"
            value={setName}
            onChange={(e) => setSetName(e.target.value)}
          />
        </div>

        {entries.length === 0 ? (
          <div className="card-subtle stack-sm" style={{ textAlign: 'center', padding: '1.5rem' }}>
            <p className="muted" style={{ margin: 0 }}>
              預覽清單目前是空的。請從上方匯入 .txt 文字檔、拍照／選圖辨識，或手動新增單字列。
            </p>
            <div>
              <button type="button" className="btn btn-soft btn-sm" onClick={handleAddBlankRow}>
                <Plus size={16} />
                <span>手動新增一列單字</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="entry-list">
            {entries.map((item, idx) => (
              <div key={item.id} className="entry-row">
                <div className="entry-row-num">{idx + 1}</div>
                <div className="entry-fields">
                  <input
                    className="input en-text"
                    type="text"
                    aria-label={`第 ${idx + 1} 筆英文單字`}
                    placeholder="英文單字或片語（例：ice cream）"
                    value={item.word}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    onChange={(e) => handleUpdateRow(item.id, { word: e.target.value })}
                  />
                  <input
                    className="input"
                    type="text"
                    aria-label={`第 ${idx + 1} 筆詞義提示（選填）`}
                    placeholder="詞義提示（選填，例如：冰淇淋）"
                    value={item.meaningHint}
                    onChange={(e) => handleUpdateRow(item.id, { meaningHint: e.target.value })}
                  />
                  {item.bundledImageId && bundledAssetsById[item.bundledImageId] ? (
                    <span className="badge badge-success" style={{ justifySelf: 'start' }}>
                      <ImageIcon size={12} />
                      隨附配圖
                    </span>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-icon"
                  aria-label={`刪除第 ${idx + 1} 筆`}
                  onClick={() => handleDeleteRow(item.id)}
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))}

            <div className="row-wrap">
              <button type="button" className="btn btn-soft btn-sm" onClick={handleAddBlankRow}>
                <Plus size={16} />
                <span>新增一列</span>
              </button>
              {entries.length > 0 ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    if (window.confirm('確定要清空目前預覽中的所有詞條嗎？')) {
                      setEntries([]);
                    }
                  }}
                >
                  清空預覽列表
                </button>
              ) : null}
            </div>
          </div>
        )}

        <div
          className="row-wrap"
          style={{
            justifyContent: 'flex-end',
            paddingTop: '1rem',
            borderTop: '1px solid var(--color-border)',
          }}
        >
          <button
            type="button"
            className="btn btn-secondary"
            disabled={saving}
            onClick={handleCancelClick}
          >
            取消匯入
          </button>
          <button
            type="button"
            className="btn btn-primary btn-lg"
            disabled={saving || ocrLoading}
            onClick={handleConfirmSave}
          >
            <CheckCircle2 size={18} />
            <span>{saving ? '儲存中…' : '確認儲存單字組'}</span>
          </button>
        </div>
      </section>
    </div>
  );
}
