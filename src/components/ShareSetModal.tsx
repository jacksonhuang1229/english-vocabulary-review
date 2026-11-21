import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  FileJson,
  FileText,
  Link2,
  Share2,
  X,
} from 'lucide-react';
import type { ImageAsset, WordSet } from '../types/models';
import {
  buildShareMessage,
  buildShareUrl,
  downloadTextFile,
  exportWordSetAsTxt,
  exportWordSetPackageJson,
  normalizeCustomShortUrl,
  sanitizeFileName,
} from '../services/shareService';
import { ShortUrlHelperBox } from './ShortUrlHelperBox';

interface ShareSetModalProps {
  wordSet: WordSet;
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

export function ShareSetModal({ wordSet, assetsById, onClose }: ShareSetModalProps) {
  const [copiedMode, setCopiedMode] = useState<'message' | 'link' | null>(null);
  const [customShortUrlInput, setCustomShortUrlInput] = useState('');
  const [exportingPkg, setExportingPkg] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const shareInfo = useMemo(() => buildShareUrl(wordSet), [wordSet]);
  const effectiveUrl = useMemo(
    () => normalizeCustomShortUrl(customShortUrlInput) ?? shareInfo.url,
    [customShortUrlInput, shareInfo.url],
  );
  const shareMessage = useMemo(
    () => buildShareMessage(wordSet, effectiveUrl),
    [wordSet, effectiveUrl],
  );

  const imageCount = useMemo(() => {
    const unique = new Set<string>();
    for (const entry of wordSet.entries) {
      if (entry.imageId && assetsById[entry.imageId]) {
        unique.add(entry.imageId);
      }
    }
    return unique.size;
  }, [wordSet.entries, assetsById]);

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
      setStatusMsg('已複製完整分享訊息（含標題、單字摘要與壓縮短連結），直接貼到 LINE 或訊息即可！');
      window.setTimeout(() => setCopiedMode(null), 2500);
    } else {
      setErrorMsg('無法自動複製，請手動全選下方分享訊息並複製。');
    }
  }

  async function handleCopyLink() {
    setErrorMsg(null);
    setStatusMsg(null);
    const ok = await copyToClipboard(effectiveUrl);
    if (ok) {
      setCopiedMode('link');
      setStatusMsg('已複製連結！貼到 LINE 時也會自動顯示網站預覽卡片。');
      window.setTimeout(() => setCopiedMode(null), 2500);
    } else {
      setErrorMsg('無法自動複製，請手動複製下方連結。');
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
        url: effectiveUrl,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setErrorMsg('系統分享未完成，您仍可點「複製分享訊息」手動傳送。');
    }
  }

  async function handleExportPackage(tryNativeFileShare = false) {
    setErrorMsg(null);
    setStatusMsg(null);
    setExportingPkg(true);
    try {
      const json = await exportWordSetPackageJson(wordSet, assetsById);
      const filename = `${sanitizeFileName(wordSet.name)}.vocab.json`;

      if (tryNativeFileShare && canNativeShare && typeof navigator.canShare === 'function') {
        const file = new File([json], filename, { type: 'application/json' });
        if (navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({
              title: `共用單字組：${wordSet.name}`,
              text: `匯入「${filename}」即可取得完整單字與配圖。`,
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
        `已下載「${filename}」（含 ${wordSet.entries.length} 個單字與 ${imageCount} 張配圖），對方可在「匯入單字組」選擇此檔匯入。`,
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '匯出完整單字組檔失敗。');
    } finally {
      setExportingPkg(false);
    }
  }

  function handleExportTxt() {
    setErrorMsg(null);
    const txt = exportWordSetAsTxt(wordSet);
    const filename = `${sanitizeFileName(wordSet.name)}.txt`;
    downloadTextFile(filename, txt, 'text/plain;charset=utf-8');
    setStatusMsg(`已下載純文字檔「${filename}」（每行一個英文詞）。`);
  }

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-panel stack-md">
        <div className="row-between">
          <div>
            <h2 id="share-modal-title" className="section-title">
              分享與匯出：{wordSet.name}
            </h2>
            <p className="field-hint" style={{ margin: '0.2rem 0 0' }}>
              免登入即可把單字組分享給其他家長或孩子使用（共 {wordSet.entries.length} 個單字
              {imageCount > 0 ? `、${imageCount} 張配圖` : ''}）。
            </p>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            aria-label="關閉分享視窗"
            onClick={onClose}
          >
            <X size={20} />
          </button>
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

        {/* 方式一：直接分享連結（含標題與摘要） */}
        <section className="card-subtle stack-sm">
          <div className="row-between">
            <div className="row">
              <Link2 size={18} style={{ color: 'var(--color-primary)' }} />
              <strong>方式一：傳送分享訊息與壓縮短連結</strong>
            </div>
            <span className="badge badge-primary">最方便</span>
          </div>

          <p className="field-hint" style={{ margin: 0 }}>
            已自動壓縮網址並附上課次標題與單字摘要，貼到 LINE／訊息時對方一眼就看得懂，點開就能直接練習或存到手機。
            {imageCount > 0 ? '（注意：連結不含圖片；若要連同配圖一起分享，請使用下方「方式二」。）' : ''}
          </p>

          {shareInfo.tooLong ? (
            <div className="alert alert-warning">
              <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>
                這組單字較多，壓縮後的連結仍較長（{shareInfo.url.length} 字元），部分通訊軟體可能截斷；建議改用下方「方式二：匯出共用單字組檔」。
              </span>
            </div>
          ) : null}

          <ShortUrlHelperBox
            longUrl={shareInfo.url}
            customShortUrlInput={customShortUrlInput}
            onChangeCustomShortUrl={setCustomShortUrlInput}
          />

          <textarea
            readOnly
            className="textarea"
            aria-label="含標題與摘要的分享訊息預覽"
            style={{
              minHeight: 112,
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
                {copiedMode === 'message' ? '已複製分享訊息' : '複製分享訊息（含標題與摘要）'}
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

        {/* 方式二：匯出完整單字組檔（含配圖） */}
        <section className="card-subtle stack-sm">
          <div className="row-between">
            <div className="row">
              <FileJson size={18} style={{ color: 'var(--color-success)' }} />
              <strong>方式二：匯出完整共用檔（.vocab.json）</strong>
            </div>
            <span className="badge badge-success">含配圖與設定</span>
          </div>

          <p className="field-hint" style={{ margin: 0 }}>
            把單字、詞義提示、{imageCount} 張配圖與看圖選字確認狀態一起打包成單一檔案。對方在「匯入單字組」選擇此檔即可完整還原。
          </p>

          <div className="row-wrap">
            <button
              type="button"
              className="btn btn-success"
              disabled={exportingPkg}
              onClick={() => void handleExportPackage(false)}
            >
              <Download size={16} />
              <span>{exportingPkg ? '打包中…' : '下載完整共用檔 (.vocab.json)'}</span>
            </button>
            {canNativeShare ? (
              <button
                type="button"
                className="btn btn-secondary"
                disabled={exportingPkg}
                onClick={() => void handleExportPackage(true)}
              >
                <Share2 size={16} />
                <span>直接傳送檔案</span>
              </button>
            ) : null}
          </div>
        </section>

        {/* 方式三：匯出純文字 .txt */}
        <section className="card-subtle stack-sm">
          <div className="row">
            <FileText size={18} style={{ color: 'var(--color-text-secondary)' }} />
            <strong>方式三：匯出純文字清單（.txt）</strong>
          </div>
          <p className="field-hint" style={{ margin: 0 }}>
            每行一個英文單字的 UTF-8 文字檔，方便列印、存檔或再次匯入。
          </p>
          <div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={handleExportTxt}>
              <Download size={15} />
              <span>下載 .txt 純文字檔</span>
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
