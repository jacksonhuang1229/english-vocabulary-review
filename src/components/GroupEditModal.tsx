import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  FolderPlus,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import type { WordGroup, WordSet } from '../types/models';
import { formatStorageError } from '../db/indexedDb';
import { generateId } from '../utils/id';

interface GroupEditModalProps {
  /** 傳入既有群組為編輯模式；傳入 null 為新建群組 */
  group: WordGroup | null;
  allWordSets: WordSet[];
  onClose: () => void;
  onSaveGroup: (group: WordGroup) => Promise<void>;
  onDeleteGroup?: (groupId: string) => Promise<void>;
}

export function GroupEditModal({
  group,
  allWordSets,
  onClose,
  onSaveGroup,
  onDeleteGroup,
}: GroupEditModalProps) {
  const [name, setName] = useState(group?.name ?? '');
  const [description, setDescription] = useState(group?.description ?? '');
  const [selectedIds, setSelectedIds] = useState<string[]>(() => {
    if (!group) return [];
    const existingSetIds = new Set(allWordSets.map((s) => s.id));
    return group.wordSetIds.filter((id) => existingSetIds.has(id));
  });
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const setsById = useMemo(() => {
    const map: Record<string, WordSet> = {};
    for (const s of allWordSets) map[s.id] = s;
    return map;
  }, [allWordSets]);

  const selectedSets = useMemo(
    () => selectedIds.map((id) => setsById[id]).filter((s): s is WordSet => Boolean(s)),
    [selectedIds, setsById],
  );

  const availableSets = useMemo(() => {
    const picked = new Set(selectedIds);
    const q = search.trim().toLowerCase();
    return allWordSets.filter((s) => {
      if (picked.has(s.id)) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.entries.some((e) => e.word.toLowerCase().includes(q))
      );
    });
  }, [allWordSets, selectedIds, search]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  function handleAddSet(setId: string) {
    setSelectedIds((prev) => (prev.includes(setId) ? prev : [...prev, setId]));
  }

  function handleRemoveSet(setId: string) {
    setSelectedIds((prev) => prev.filter((id) => id !== setId));
  }

  function handleMoveSet(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= selectedIds.length) return;
    setSelectedIds((prev) => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function handleSave() {
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setError('請先填寫群組名稱（例如：Flyer Units）。');
      return;
    }

    const now = Date.now();
    const payload: WordGroup = {
      id: group?.id ?? generateId('grp'),
      name: trimmed,
      description: description.trim() || undefined,
      wordSetIds: selectedIds,
      createdAt: group?.createdAt ?? now,
      updatedAt: now,
    };

    setSaving(true);
    try {
      await onSaveGroup(payload);
      onClose();
    } catch (err) {
      setError(formatStorageError(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!group || !onDeleteGroup) return;
    if (
      !window.confirm(
        `確定要刪除群組「${group.name}」嗎？\n（僅刪除群組分類，不會刪除裡面的單字組）`,
      )
    ) {
      return;
    }
    setSaving(true);
    try {
      await onDeleteGroup(group.id);
      onClose();
    } catch (err) {
      setError(formatStorageError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="group-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-panel stack-md">
        <div className="row-between">
          <div className="row">
            <FolderPlus size={20} style={{ color: 'var(--color-primary)' }} />
            <h2 id="group-modal-title" className="section-title">
              {group ? `編輯群組：${group.name}` : '建立新群組'}
            </h2>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            aria-label="關閉群組編輯視窗"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>

        {error ? (
          <div className="alert alert-danger" role="alert">
            <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>{error}</span>
          </div>
        ) : null}

        <div className="stack-sm">
          <div className="field">
            <label className="field-label" htmlFor="group-name-input">
              群組名稱（必填）
            </label>
            <input
              id="group-name-input"
              className="input"
              type="text"
              placeholder="例如：Flyer Units、五上英文月考"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="group-desc-input">
              備註說明（選填）
            </label>
            <input
              id="group-desc-input"
              className="input"
              type="text"
              placeholder="例如：Unit 1 ~ Unit 4 全部課次"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>

        {/* 已加入此群組的單字組 */}
        <section className="card-subtle stack-sm">
          <div className="row-between">
            <strong>群組內的單字組（可排序或移除）</strong>
            <span className="badge badge-primary">已選 {selectedSets.length} 組</span>
          </div>

          {selectedSets.length === 0 ? (
            <p className="field-hint" style={{ margin: 0 }}>
              尚未加入任何單字組，請從下方清單點選「加入」。
            </p>
          ) : (
            <div className="stack-sm">
              {selectedSets.map((set, idx) => (
                <div
                  key={set.id}
                  className="row-between"
                  style={{
                    padding: '0.5rem 0.7rem',
                    background: '#fff',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-sm)',
                  }}
                >
                  <div className="row-wrap">
                    <span className="entry-row-num" style={{ marginTop: 0, width: 28, height: 28 }}>
                      {idx + 1}
                    </span>
                    <strong>{set.name}</strong>
                    <span className="badge badge-neutral">{set.entries.length} 詞</span>
                  </div>
                  <div className="row" style={{ gap: '0.15rem' }}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon"
                      style={{ minWidth: 36, minHeight: 36 }}
                      disabled={idx === 0}
                      aria-label={`上移 ${set.name}`}
                      onClick={() => handleMoveSet(idx, -1)}
                    >
                      <ArrowUp size={15} />
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon"
                      style={{ minWidth: 36, minHeight: 36 }}
                      disabled={idx === selectedSets.length - 1}
                      aria-label={`下移 ${set.name}`}
                      onClick={() => handleMoveSet(idx, 1)}
                    >
                      <ArrowDown size={15} />
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger-outline btn-sm"
                      onClick={() => handleRemoveSet(set.id)}
                    >
                      移除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 可加入的其他單字組 */}
        <section className="stack-sm">
          <div className="row-between">
            <strong>可加入的單字組</strong>
            <span className="field-hint">點擊即可加入群組（同個課次也可加入不同群組）</span>
          </div>

          {allWordSets.length >= 4 ? (
            <div style={{ position: 'relative' }}>
              <Search
                size={16}
                style={{
                  position: 'absolute',
                  left: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--color-text-muted)',
                  pointerEvents: 'none',
                }}
              />
              <input
                className="input"
                style={{ paddingLeft: 36, minHeight: 40 }}
                type="search"
                placeholder="搜尋要加入的單字組…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          ) : null}

          {allWordSets.length === 0 ? (
            <p className="field-hint" style={{ margin: 0 }}>
              目前尚無單字組，您仍可先建立空群組，之後再隨時把單字組加進來。
            </p>
          ) : availableSets.length === 0 ? (
            <p className="field-hint" style={{ margin: 0 }}>
              {search.trim() ? '找不到符合搜尋條件的其他單字組。' : '全部已儲存的單字組都已在此群組中。'}
            </p>
          ) : (
            <div className="stack-sm" style={{ maxHeight: 220, overflowY: 'auto' }}>
              {availableSets.map((set) => (
                <div
                  key={set.id}
                  className="row-between"
                  style={{
                    padding: '0.5rem 0.7rem',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--color-surface)',
                  }}
                >
                  <div className="row-wrap">
                    <strong>{set.name}</strong>
                    <span className="badge badge-neutral">{set.entries.length} 詞</span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-soft btn-sm"
                    onClick={() => handleAddSet(set.id)}
                  >
                    <Plus size={14} />
                    <span>加入</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <div
          className="row-between"
          style={{ paddingTop: '0.75rem', borderTop: '1px solid var(--color-border)' }}
        >
          <div>
            {group && onDeleteGroup ? (
              <button
                type="button"
                className="btn btn-danger-outline btn-sm"
                disabled={saving}
                onClick={() => void handleDelete()}
              >
                <Trash2 size={15} />
                <span>刪除群組</span>
              </button>
            ) : null}
          </div>
          <div className="row-wrap">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              取消
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={saving}
              onClick={() => void handleSave()}
            >
              <CheckCircle2 size={17} />
              <span>{saving ? '儲存中…' : '儲存群組'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
