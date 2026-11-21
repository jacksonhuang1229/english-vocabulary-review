import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  CheckCircle2,
  Edit3,
  Headphones,
  Image as ImageIcon,
  Keyboard,
  Play,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import type { ImageAsset, QuizMode, WordEntry, WordSet } from '../types/models';
import { computeSetEligibility } from '../quiz/eligibility';
import { normalizeSpellText } from '../quiz/normalize';
import { useImageUrl } from '../hooks/useImageUrl';
import { ImagePickerModal } from '../components/ImagePickerModal';
import { formatStorageError } from '../db/indexedDb';
import { generateId } from '../utils/id';

interface SetDetailPageProps {
  wordSet: WordSet;
  allAssets: ImageAsset[];
  assetsById: Record<string, ImageAsset>;
  onBack: () => void;
  onUpdateSet: (updated: WordSet) => Promise<void>;
  onDeleteSet: (setId: string) => Promise<void>;
  onSaveImageAsset: (asset: ImageAsset) => Promise<void>;
  onStartPractice: (mode: QuizMode) => void;
}

function EntryThumb({
  entry,
  asset,
  onClick,
}: {
  entry: WordEntry;
  asset?: ImageAsset;
  onClick: () => void;
}) {
  const url = useImageUrl(asset?.blob);
  const isConfirmed = Boolean(asset && asset.confirmed && entry.imageConfirmed);

  return (
    <button
      type="button"
      className={`entry-thumb-btn ${url ? 'has-image' : ''}`}
      onClick={onClick}
      aria-label={`管理 ${entry.word} 的配圖`}
    >
      {url ? (
        <>
          <img src={url} alt={entry.word} />
          <span
            className={`thumb-status-dot ${isConfirmed ? 'ok' : 'warn'}`}
            title={isConfirmed ? '已確認配圖' : '配圖待確認'}
          >
            {isConfirmed ? <Check size={12} /> : '!'}
          </span>
        </>
      ) : (
        <>
          <ImageIcon size={20} />
          <span>加配圖</span>
        </>
      )}
    </button>
  );
}

export function SetDetailPage({
  wordSet,
  allAssets,
  assetsById,
  onBack,
  onUpdateSet,
  onDeleteSet,
  onSaveImageAsset,
  onStartPractice,
}: SetDetailPageProps) {
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(wordSet.name);

  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editWord, setEditWord] = useState('');
  const [editMeaning, setEditMeaning] = useState('');
  const [editAbstract, setEditAbstract] = useState(false);

  const [newWord, setNewWord] = useState('');
  const [newMeaning, setNewMeaning] = useState('');

  const [imageModalEntryId, setImageModalEntryId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const eligibility = useMemo(
    () => computeSetEligibility(wordSet.entries, assetsById),
    [wordSet.entries, assetsById],
  );

  const activeModalEntry = useMemo(
    () => wordSet.entries.find((e) => e.id === imageModalEntryId) ?? null,
    [wordSet.entries, imageModalEntryId],
  );

  async function persistEntries(nextEntries: WordEntry[], nextName = wordSet.name) {
    setError(null);
    try {
      await onUpdateSet({
        ...wordSet,
        name: nextName,
        entries: nextEntries,
        updatedAt: Date.now(),
      });
    } catch (err) {
      setError(formatStorageError(err));
      throw err;
    }
  }

  async function handleSaveSetName() {
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      setError('單字組名稱不可為空。');
      return;
    }
    try {
      await persistEntries(wordSet.entries, trimmed);
      setEditingName(false);
    } catch {
      // error already shown
    }
  }

  async function handleAddEntry(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = newWord.trim().replace(/\s+/g, ' ');
    if (!cleaned) return;
    const entry: WordEntry = {
      id: generateId('word'),
      word: cleaned,
      meaningHint: newMeaning.trim() || undefined,
    };
    try {
      await persistEntries([...wordSet.entries, entry]);
      setNewWord('');
      setNewMeaning('');
    } catch {
      // keep inputs on failure
    }
  }

  function startEditEntry(entry: WordEntry) {
    setEditingEntryId(entry.id);
    setEditWord(entry.word);
    setEditMeaning(entry.meaningHint ?? '');
    setEditAbstract(Boolean(entry.isAbstract));
  }

  async function handleSaveEntryEdit(entry: WordEntry) {
    const cleanedWord = editWord.trim().replace(/\s+/g, ' ');
    if (!cleanedWord) {
      setError('英文單字不可為空。');
      return;
    }

    const spellingChanged = normalizeSpellText(cleanedWord) !== normalizeSpellText(entry.word);
    const updatedEntries = wordSet.entries.map((item) => {
      if (item.id !== entry.id) return item;
      return {
        ...item,
        word: cleanedWord,
        meaningHint: editMeaning.trim() || undefined,
        isAbstract: editAbstract || undefined,
        // 修改詞條拼寫時，既有配圖必須重新確認是否仍適用
        imageConfirmed: spellingChanged && item.imageId ? false : item.imageConfirmed,
      };
    });

    try {
      await persistEntries(updatedEntries);
      setEditingEntryId(null);
    } catch {
      // keep edit state on failure
    }
  }

  async function handleMoveEntry(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= wordSet.entries.length) return;
    const copy = [...wordSet.entries];
    [copy[index], copy[target]] = [copy[target], copy[index]];
    await persistEntries(copy);
  }

  async function handleDeleteEntry(entryId: string) {
    const next = wordSet.entries.filter((e) => e.id !== entryId);
    await persistEntries(next);
  }

  const fillCount = eligibility['fill-blank'].eligibleEntryIds.length;
  const listenCount = eligibility['listen-spell'].eligibleEntryIds.length;
  const pictureCount = eligibility['picture-choice'].eligibleEntryIds.length;
  const totalCount = wordSet.entries.length;

  const needsReconfirmCount = wordSet.entries.filter(
    (e) => Boolean(e.imageId && !e.imageConfirmed),
  ).length;

  return (
    <div className="stack-lg">
      {/* 頂部返回與組名 */}
      <div className="row-between">
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          <ArrowLeft size={18} />
          <span>回到單字組清單</span>
        </button>

        <button
          type="button"
          className="btn btn-danger-outline btn-sm"
          onClick={() => {
            if (window.confirm(`確定要刪除單字組「${wordSet.name}」嗎？`)) {
              void onDeleteSet(wordSet.id);
            }
          }}
        >
          <Trash2 size={15} />
          <span>刪除單字組</span>
        </button>
      </div>

      {/* 課次標題與模式選擇 */}
      <section className="card stack-md">
        {editingName ? (
          <div className="row-wrap">
            <input
              className="input"
              style={{ flex: '1 1 240px', fontWeight: 700 }}
              value={nameDraft}
              aria-label="修改單字組名稱"
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSaveSetName();
                if (e.key === 'Escape') {
                  setNameDraft(wordSet.name);
                  setEditingName(false);
                }
              }}
            />
            <button type="button" className="btn btn-primary btn-sm" onClick={handleSaveSetName}>
              <Save size={15} />
              <span>儲存名稱</span>
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setNameDraft(wordSet.name);
                setEditingName(false);
              }}
            >
              取消
            </button>
          </div>
        ) : (
          <div className="row-between">
            <div className="row-wrap">
              <h1 className="page-title">{wordSet.name}</h1>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setNameDraft(wordSet.name);
                  setEditingName(true);
                }}
              >
                <Edit3 size={15} />
                <span>改名</span>
              </button>
            </div>
            <span className="badge badge-primary">共 {totalCount} 個詞條</span>
          </div>
        )}

        {error ? (
          <div className="alert alert-danger" role="alert">
            <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>{error}</span>
          </div>
        ) : null}

        {needsReconfirmCount > 0 ? (
          <div className="alert alert-warning">
            <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>
              有 {needsReconfirmCount}{' '}
              個詞條因拼寫已修改或尚未確認配圖，請點選該詞縮圖重新確認後方可用於看圖選字。
            </span>
          </div>
        ) : null}

        <div className="stack-sm">
          <h2 className="section-title">選擇複習模式</h2>
          <div className="mode-grid">
            {/* 模式 1：字母填空 */}
            <button
              type="button"
              className="mode-card"
              disabled={fillCount === 0}
              onClick={() => onStartPractice('fill-blank')}
            >
              <div className="stack-sm">
                <div className="row-between">
                  <span className="mode-card-icon fill">
                    <Keyboard size={22} />
                  </span>
                  <span className={`badge ${fillCount > 0 ? 'badge-primary' : 'badge-neutral'}`}>
                    可出題 {fillCount} / {totalCount}
                  </span>
                </div>
                <strong>字母填空</strong>
                <span className="field-hint">
                  保留空格與連字號，只挖英文字母。單字母詞留給其他模式。
                </span>
              </div>
              <div className="row" style={{ color: 'var(--color-primary)', fontWeight: 700, fontSize: '0.875rem' }}>
                <Play size={15} />
                <span>{fillCount > 0 ? '開始練習' : '暫無可出題詞條'}</span>
              </div>
            </button>

            {/* 模式 2：聽音拼字 */}
            <button
              type="button"
              className="mode-card"
              disabled={listenCount === 0}
              onClick={() => onStartPractice('listen-spell')}
            >
              <div className="stack-sm">
                <div className="row-between">
                  <span className="mode-card-icon listen">
                    <Headphones size={22} />
                  </span>
                  <span className={`badge ${listenCount > 0 ? 'badge-primary' : 'badge-neutral'}`}>
                    可出題 {listenCount} / {totalCount}
                  </span>
                </div>
                <strong>聽音拼字</strong>
                <span className="field-hint">
                  使用裝置英文語音朗讀，孩子聽音完整拼出單字或片語。
                </span>
              </div>
              <div className="row" style={{ color: 'var(--color-accent)', fontWeight: 700, fontSize: '0.875rem' }}>
                <Play size={15} />
                <span>{listenCount > 0 ? '開始練習' : '暫無可出題詞條'}</span>
              </div>
            </button>

            {/* 模式 3：看圖選字（即使 0 題也可點擊，進入後清楚引導補圖與確認） */}
            <button
              type="button"
              className="mode-card"
              onClick={() => onStartPractice('picture-choice')}
            >
              <div className="stack-sm">
                <div className="row-between">
                  <span className="mode-card-icon picture">
                    <ImageIcon size={22} />
                  </span>
                  <span className={`badge ${pictureCount > 0 ? 'badge-success' : 'badge-warning'}`}>
                    可出題 {pictureCount} / {totalCount}
                  </span>
                </div>
                <strong>看圖選字</strong>
                <span className="field-hint">
                  以家長確認配圖出題，提供正解與同組最多 3 個不重複干擾項。
                </span>
              </div>
              <div
                className="row"
                style={{
                  color: pictureCount > 0 ? 'var(--color-success)' : 'var(--color-warning)',
                  fontWeight: 700,
                  fontSize: '0.875rem',
                }}
              >
                <Play size={15} />
                <span>{pictureCount > 0 ? '開始練習' : '查看補圖說明'}</span>
              </div>
            </button>
          </div>
        </div>
      </section>

      {/* 詞條與配圖管理 */}
      <section className="card stack-md">
        <div className="row-between">
          <div>
            <h2 className="section-title">詞條與配圖管理</h2>
            <p className="field-hint" style={{ margin: '0.2rem 0 0' }}>
              點擊左側縮圖即可上傳配圖、標記易混淆詞，或從其他課次直接重用已確認配圖。
            </p>
          </div>
        </div>

        {/* 快速新增單字表單 */}
        <form className="card-subtle row-wrap" onSubmit={handleAddEntry}>
          <input
            className="input en-text"
            style={{ flex: '1.3 1 180px' }}
            type="text"
            placeholder="新增英文單字或片語…"
            value={newWord}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            onChange={(e) => setNewWord(e.target.value)}
          />
          <input
            className="input"
            style={{ flex: '1 1 150px' }}
            type="text"
            placeholder="詞義提示（選填）"
            value={newMeaning}
            onChange={(e) => setNewMeaning(e.target.value)}
          />
          <button type="submit" className="btn btn-primary" disabled={!newWord.trim()}>
            <Plus size={17} />
            <span>新增詞條</span>
          </button>
        </form>

        {wordSet.entries.length === 0 ? (
          <p className="muted">此單字組目前沒有詞條，請由上方新增。</p>
        ) : (
          <div className="entry-list">
            {wordSet.entries.map((entry, idx) => {
              const asset = entry.imageId ? assetsById[entry.imageId] : undefined;
              const picConfirmed = Boolean(asset && asset.confirmed && entry.imageConfirmed);
              const needsReconfirm = Boolean(entry.imageId && !entry.imageConfirmed);
              const fillReason = eligibility['fill-blank'].excludedReasons[entry.id];
              const picReason = eligibility['picture-choice'].excludedReasons[entry.id];
              const isEditing = editingEntryId === entry.id;

              return (
                <div
                  key={entry.id}
                  className={`detail-entry-card ${needsReconfirm ? 'needs-confirm' : ''}`}
                >
                  <EntryThumb
                    entry={entry}
                    asset={asset}
                    onClick={() => setImageModalEntryId(entry.id)}
                  />

                  <div className="stack-sm">
                    {isEditing ? (
                      <div className="stack-sm">
                        <div className="entry-fields">
                          <input
                            className="input en-text"
                            value={editWord}
                            autoCapitalize="none"
                            autoCorrect="off"
                            spellCheck={false}
                            aria-label="編輯英文單字"
                            onChange={(e) => setEditWord(e.target.value)}
                          />
                          <input
                            className="input"
                            value={editMeaning}
                            placeholder="詞義提示（選填）"
                            aria-label="編輯詞義提示"
                            onChange={(e) => setEditMeaning(e.target.value)}
                          />
                        </div>
                        <label className="row" style={{ fontSize: '0.82rem', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={editAbstract}
                            onChange={(e) => setEditAbstract(e.target.checked)}
                          />
                          <span>標記為抽象詞（須確認情境圖）</span>
                        </label>
                        {entry.imageId &&
                        normalizeSpellText(editWord) !== normalizeSpellText(entry.word) ? (
                          <span className="field-hint" style={{ color: 'var(--color-warning)' }}>
                            提醒：修改拼寫儲存後，既有配圖將標記為「待重新確認」。
                          </span>
                        ) : null}
                        <div className="row-wrap">
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => void handleSaveEntryEdit(entry)}
                          >
                            <Save size={14} />
                            <span>儲存</span>
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => setEditingEntryId(null)}
                          >
                            <X size={14} />
                            <span>取消</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="row-wrap">
                          <strong className="en-text" style={{ fontSize: '1.15rem' }}>
                            {entry.word}
                          </strong>
                          {entry.meaningHint ? (
                            <span className="muted" style={{ fontSize: '0.9rem' }}>
                              {entry.meaningHint}
                            </span>
                          ) : null}
                          {entry.isAbstract ? (
                            <span className="badge badge-neutral">抽象詞</span>
                          ) : null}
                        </div>

                        <div className="row-wrap">
                          {picConfirmed ? (
                            <span className="badge badge-success">
                              <CheckCircle2 size={12} />
                              配圖已確認
                            </span>
                          ) : needsReconfirm ? (
                            <span className="badge badge-warning">
                              <AlertTriangle size={12} />
                              拼寫已變，請重確認配圖
                            </span>
                          ) : asset ? (
                            <span className="badge badge-warning">配圖未確認</span>
                          ) : (
                            <span className="badge badge-neutral">尚無配圖</span>
                          )}

                          {fillReason ? (
                            <span className="badge badge-neutral" title={fillReason}>
                              {fillReason}
                            </span>
                          ) : null}

                          {picConfirmed && picReason ? (
                            <span className="badge badge-warning" title={picReason}>
                              {picReason}
                            </span>
                          ) : null}
                        </div>
                      </>
                    )}
                  </div>

                  {!isEditing ? (
                    <div className="detail-entry-actions row">
                      <button
                        type="button"
                        className="btn btn-soft btn-sm"
                        onClick={() => setImageModalEntryId(entry.id)}
                      >
                        <ImageIcon size={14} />
                        <span>{asset ? '配圖' : '加圖'}</span>
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-icon"
                        style={{ minWidth: 40, minHeight: 40 }}
                        aria-label={`編輯 ${entry.word}`}
                        onClick={() => startEditEntry(entry)}
                      >
                        <Edit3 size={16} />
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-icon"
                        style={{ minWidth: 40, minHeight: 40 }}
                        disabled={idx === 0}
                        aria-label={`上移 ${entry.word}`}
                        onClick={() => void handleMoveEntry(idx, -1)}
                      >
                        <ArrowUp size={15} />
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-icon"
                        style={{ minWidth: 40, minHeight: 40 }}
                        disabled={idx === wordSet.entries.length - 1}
                        aria-label={`下移 ${entry.word}`}
                        onClick={() => void handleMoveEntry(idx, 1)}
                      >
                        <ArrowDown size={15} />
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-icon"
                        style={{ minWidth: 40, minHeight: 40, color: 'var(--color-danger)' }}
                        aria-label={`刪除 ${entry.word}`}
                        onClick={() => {
                          if (window.confirm(`確定要刪除單字「${entry.word}」嗎？`)) {
                            void handleDeleteEntry(entry.id);
                          }
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {activeModalEntry ? (
        <ImagePickerModal
          entry={activeModalEntry}
          allAssets={allAssets}
          onClose={() => setImageModalEntryId(null)}
          onSaveNewAssetAndAttach={async (asset, patch) => {
            await onSaveImageAsset(asset);
            const nextEntries = wordSet.entries.map((e) =>
              e.id === activeModalEntry.id ? { ...e, ...patch } : e,
            );
            await persistEntries(nextEntries);
          }}
          onUpdateExistingAssetAndAttach={async (asset, patch) => {
            await onSaveImageAsset(asset);
            const nextEntries = wordSet.entries.map((e) =>
              e.id === activeModalEntry.id ? { ...e, ...patch } : e,
            );
            await persistEntries(nextEntries);
          }}
          onDetachImage={async () => {
            const nextEntries = wordSet.entries.map((e) =>
              e.id === activeModalEntry.id
                ? { ...e, imageId: null, imageConfirmed: false }
                : e,
            );
            await persistEntries(nextEntries);
          }}
        />
      ) : null}
    </div>
  );
}
