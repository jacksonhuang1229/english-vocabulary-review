import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  FileJson,
  FolderOpen,
  Link2,
  Share2,
  X,
} from 'lucide-react';
import type { ImageAsset, WordGroup, WordSet } from '../types/models';
import {
  buildGroupShareMessage,
  buildGroupShareUrl,
  downloadTextFile,
  exportWordGroupPackageJson,
  sanitizeFileName,
} from '../services/shareService';

interface ShareGroupModalProps {
  group: WordGroup;
  sets: WordSet[];
  assetsById: Record<string, ImageAsset>;
  onClose: () => void;
}

async function copyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fallback below
    }
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export function ShareGroupModal({
  group,
  sets,
  assetsById,
  onClose,
}: ShareGroupModalProps) {
  const [copiedMode, setCopiedMode] = useState<'message' | 'link' | null>(null);
  const [exportingPkg, setExportingPkg] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const totalWords = useMemo(
    () => sets.reduce((sum, s) => sum + s.entries.length, 0),
    [sets],
  );

  const imageCount = useMemo(() => {
    const unique = new Set<string>();
    for (const set of sets) {
      for (const entry of set.entries) {
        if (entry.imageId && assetsById[entry.imageId]) {
          unique.add(entry.imageId);
        }
      }
    }
    return unique.size;
  }, [sets, assetsById]);

  const shareInfo = useMemo(
    () => buildGroupShareUrl(group.name, sets),
    [group.name, sets],
  );
  const shareMessage = useMemo(
    () => buildGroupShareMessage(group.name, sets, shareInfo.url),
    [group.name, sets, shareInfo.url],
  );

  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  async function handleCopyMessage() {
    setErrorMsg(null);
    setStatusMsg(null);
    const ok = await copyToClipboard(shareMessage.fullText);
    if (ok) {
      setCopiedMode('message');
      setStatusMsg('已複製群組分享訊息（含群組標題、內含課次摘要與壓縮短連結），直接貼到 LINE 即可！');
      window.setTimeout(() => setCopiedMode(null), 2500);
    } else {
      setErrorMsg('無法自動複製，請手動全選下方訊息並複製。');
    }
  }

  async function handleCopyLink() {
    setErrorMsg(null);
    setStatusMsg(null);
    const ok = await copyToClipboard(shareInfo.url);
    if (ok) {
      setCopiedMode('link');
      setStatusMsg('已複製群組壓縮短連結！');
      window.setTimeout(() => setCopiedMode(null), 2500);
    } else {
      setErrorMsg('無法自動複製，請手動複製。');
    }
  }

  async function handleNativeShareLink() {
    if (!canNativeShare) return;
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      await navigator.share({
        title: shareMessage.title,
        text: `${shareMessage.title}\n${shareMessage.summary}`,
        url: shareInfo.url,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setErrorMsg('系統分享未完成，您仍可點「複製分享訊息」手動傳送。');
    }
  }

  async function handleExportGroupPackage(tryNativeFileShare = false) {
    setErrorMsg(null);
    setStatusMsg(null);
    setExportingPkg(true);
    try {
      const json = await exportWordGroupPackageJson(group, sets, assetsById);
      const filename = `${sanitizeFileName(group.name)}.vocab-group.json`;

      if (tryNativeFileShare && canNativeShare && typeof navigator.canShare === 'function') {
        const file = new File([json], filename, { type: 'application/json' });
        if (navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({
              title: `共用英文單字群組：${group.name}`,
              text: `匯入「${filename}」即可一次取得群組內 ${sets.length} 個課次與配圖。`,
              files: [file],
            });
            setStatusMsg('已開啟系統分享檔案。');
            return;
          } catch (err) {
            if (err instanceof DOMException && err.name === 'AbortError') return;
          }
        }
      }

      downloadTextFile(filename, json, 'application/json;charset=utf-8');
      setStatusMsg(
        `已下載「${filename}」（含 ${sets.length} 個課次、${totalWords} 個單字與 ${imageCount} 張配圖），對方在「新增單字組」→「匯入共用單字組檔」即可一次匯入整個群組。`,
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '匯出群組檔案失敗。');
    } finally {
      setExportingPkg(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-group-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-panel stack-md">
        <div className="row-between">
          <div>
            <div className="row">
              <FolderOpen size={20} style={{ color: 'var(--color-primary)' }} />
              <h2 id="share-group-modal-title" className="section-title">
                一次分享整個群組：{group.name}
              </h2>
            </div>
            <p className="field-hint" style={{ margin: '0.2rem 0 0' }}>
              內含 {sets.length} 個課次、共 {totalWords} 個單字
              {imageCount > 0 ? `、${imageCount} 張配圖` : ''}。
            </p>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            aria-label="關閉群組分享視窗"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>

        <div className="row-wrap">
          {sets.map((s) => (
            <span key={s.id} className="badge badge-primary">
              {s.name} ({s.entries.length})
            </span>
          ))}
        </div>

        {statusMsg ? (
          <div className="alert alert-success" role="status">
            <Check size={18} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>{statusMsg}</span>
          </div>
        ) : null}

        {errorMsg ? (
          <div className="alert alert-danger" role="alert">
            <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>{errorMsg}</span>
          </div>
        ) : null}

        {/* 方式一：分享群組訊息與壓縮短連結 */}
        <section className="card-subtle stack-sm">
          <div className="row-between">
            <div className="row">
              <Link2 size={18} style={{ color: 'var(--color-primary)' }} />
              <strong>方式一：傳送群組分享訊息與壓縮短連結</strong>
            </div>
            <span className="badge badge-primary">一鍵收整組</span>
          </div>

          <p className="field-hint" style={{ margin: 0 }}>
            對方點開連結後就能看到群組裡所有課次，可直接點任一課次開始練習，或一鍵把整個群組一次存到手機！
            {imageCount > 0 ? '（連結不含圖片；若要連同配圖一起分享，請用下方「方式二」。）' : ''}
          </p>

          {shareInfo.tooLong ? (
            <div className="alert alert-warning">
              <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>
                此群組單字量較大，壓縮後網址仍有 {shareInfo.url.length} 字元，建議改用下方「方式二：下載整個群組共用檔」傳送最穩定。
              </span>
            </div>
          ) : null}

          <textarea
            readOnly
            className="textarea"
            aria-label="群組分享訊息預覽"
            style={{
              minHeight: 118,
              fontSize: '0.86rem',
              lineHeight: 1.5,
              wordBreak: 'break-all',
            }}
            value={shareMessage.fullText}
            onFocus={(e) => e.currentTarget.select()}
          />

          <div className="row-wrap">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void handleCopyMessage()}
            >
              {copiedMode === 'message' ? <Check size={16} /> : <Copy size={16} />}
              <span>
                {copiedMode === 'message' ? '已複製群組訊息' : '複製群組分享訊息（含標題與摘要）'}
              </span>
            </button>
            {canNativeShare ? (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => void handleNativeShareLink()}
              >
                <Share2 size={16} />
                <span>用手機分享…</span>
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => void handleCopyLink()}
            >
              {copiedMode === 'link' ? <Check size={15} /> : <Link2 size={15} />}
              <span>{copiedMode === 'link' ? '已複製短連結' : '只複製短連結'}</span>
            </button>
          </div>
        </section>

        {/* 方式二：匯出完整群組檔（含全部配圖） */}
        <section className="card-subtle stack-sm">
          <div className="row-between">
            <div className="row">
              <FileJson size={18} style={{ color: 'var(--color-success)' }} />
              <strong>方式二：匯出整個群組完整檔（.vocab-group.json）</strong>
            </div>
            <span className="badge badge-success">含全部課次與配圖</span>
          </div>

          <p className="field-hint" style={{ margin: 0 }}>
            一次打包群組內 {sets.length} 個課次、{totalWords} 個單字與 {imageCount} 張配圖（共用配圖不重複儲存）。對方在「匯入單字組」選擇此檔即可一次還原整個群組。
          </p>

          <div className="row-wrap">
            <button
              type="button"
              className="btn btn-success"
              disabled={exportingPkg}
              onClick={() => void handleExportGroupPackage(false)}
            >
              <Download size={16} />
              <span>{exportingPkg ? '打包中…' : '下載群組共用檔 (.vocab-group.json)'}</span>
            </button>
            {canNativeShare ? (
              <button
                type="button"
                className="btn btn-secondary"
                disabled={exportingPkg}
                onClick={() => void handleExportGroupPackage(true)}
              >
                <Share2 size={16} />
                <span>直接傳送檔案</span>
              </button>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
