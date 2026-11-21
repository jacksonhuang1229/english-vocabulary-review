import { CheckCircle2, ExternalLink, Scissors, X } from 'lucide-react';
import {
  buildIsGdShortenLink,
  buildTinyUrlShortenLink,
  normalizeCustomShortUrl,
} from '../services/shareService';

interface ShortUrlHelperBoxProps {
  longUrl: string;
  customShortUrlInput: string;
  onChangeCustomShortUrl: (value: string) => void;
}

export function ShortUrlHelperBox({
  longUrl,
  customShortUrlInput,
  onChangeCustomShortUrl,
}: ShortUrlHelperBoxProps) {
  const validShortUrl = normalizeCustomShortUrl(customShortUrlInput);
  const hasInvalidInput = customShortUrlInput.trim().length > 0 && !validShortUrl;

  return (
    <div
      className="stack-sm"
      style={{
        padding: '0.75rem',
        borderRadius: 'var(--radius-md)',
        background: '#ffffff',
        border: '1px solid var(--color-border)',
      }}
    >
      <div className="row-between">
        <span className="row" style={{ fontSize: '0.86rem', fontWeight: 700 }}>
          <Scissors size={15} style={{ color: 'var(--color-primary)' }} />
          <span>縮成一行超短網址（選用，免重貼長連結）</span>
        </span>
        {validShortUrl ? (
          <span className="badge badge-success">
            <CheckCircle2 size={12} />
            已套用一行短網址
          </span>
        ) : null}
      </div>

      <span className="field-hint">
        步驟 1：點下方任一按鈕會自動帶入連結並直接顯示一行短網址 → 複製後貼回步驟 2，上方分享訊息就會自動換成一行短網址！
      </span>

      <div className="row-wrap">
        <a
          className="btn btn-soft btn-sm"
          href={buildTinyUrlShortenLink(longUrl)}
          target="_blank"
          rel="noopener noreferrer"
        >
          <ExternalLink size={14} />
          <span>前往 TinyURL 產生短網址</span>
        </a>
        <a
          className="btn btn-secondary btn-sm"
          href={buildIsGdShortenLink(longUrl)}
          target="_blank"
          rel="noopener noreferrer"
        >
          <ExternalLink size={14} />
          <span>前往 is.gd 產生短網址</span>
        </a>
      </div>

      <div className="row" style={{ gap: '0.4rem' }}>
        <input
          type="url"
          className="input"
          style={{ minHeight: 40, fontSize: '0.88rem' }}
          placeholder="步驟 2：把產生的短網址貼在這裡（如 https://tinyurl.com/...）"
          aria-label="貼上縮短後的網址"
          value={customShortUrlInput}
          onChange={(e) => onChangeCustomShortUrl(e.target.value)}
        />
        {customShortUrlInput ? (
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            style={{ minWidth: 40, minHeight: 40 }}
            aria-label="清除自訂短網址"
            onClick={() => onChangeCustomShortUrl('')}
          >
            <X size={16} />
          </button>
        ) : null}
      </div>

      {hasInvalidInput ? (
        <span className="field-hint" style={{ color: 'var(--color-danger)' }}>
          請貼上以 https:// 開頭的完整短網址。
        </span>
      ) : null}
    </div>
  );
}
