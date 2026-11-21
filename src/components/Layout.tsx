import type { ReactNode } from 'react';
import { BookOpen, Plus } from 'lucide-react';

interface LayoutProps {
  children: ReactNode;
  onGoHome: () => void;
  onGoImport?: () => void;
  showImportAction?: boolean;
}

export function Layout({
  children,
  onGoHome,
  onGoImport,
  showImportAction = false,
}: LayoutProps) {
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-inner">
          <button type="button" className="brand-btn" onClick={onGoHome}>
            <span className="brand-mark" aria-hidden="true">
              Aa
            </span>
            <span>
              <span className="brand-title">英文單字複習小幫手</span>
              <span className="brand-sub">親子共學 · 本機儲存免登入</span>
            </span>
          </button>

          {showImportAction && onGoImport ? (
            <button type="button" className="btn btn-primary btn-sm" onClick={onGoImport}>
              <Plus size={16} aria-hidden="true" />
              <span>新增單字組</span>
            </button>
          ) : (
            <button type="button" className="btn btn-ghost btn-sm" onClick={onGoHome}>
              <BookOpen size={16} aria-hidden="true" />
              <span>所有課次</span>
            </button>
          )}
        </div>
      </header>

      <main className="app-main">{children}</main>

      <footer className="app-footer">
        <div className="app-footer-inner">
          <span>所有單字組與配圖皆保存在此裝置的瀏覽器（IndexedDB），免登入即可離線查看。</span>
          <span>提醒：清除網站資料或使用無痕模式可能造成資料遺失。</span>
        </div>
      </footer>
    </div>
  );
}
