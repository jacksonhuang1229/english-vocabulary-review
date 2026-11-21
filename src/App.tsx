import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { ImageAsset, QuizMode, WordSet } from './types/models';
import { defaultVocabRepo, formatStorageError } from './db/indexedDb';
import { createSampleWordSets } from './services/sampleData';
import { Layout } from './components/Layout';
import { HomePage } from './pages/HomePage';
import { ImportPage } from './pages/ImportPage';
import { SetDetailPage } from './pages/SetDetailPage';
import { PracticePage } from './pages/PracticePage';

type Route =
  | { page: 'home' }
  | { page: 'import' }
  | { page: 'detail'; setId: string }
  | { page: 'practice'; setId: string; mode: QuizMode };

const VALID_MODES: QuizMode[] = ['fill-blank', 'listen-spell', 'picture-choice'];

function parseHashRoute(hash: string): Route {
  const clean = hash.replace(/^#\/?/, '').trim();
  if (!clean) return { page: 'home' };
  const parts = clean.split('/').map((p) => decodeURIComponent(p));
  if (parts[0] === 'import') {
    return { page: 'import' };
  }
  if (parts[0] === 'set' && parts[1]) {
    return { page: 'detail', setId: parts[1] };
  }
  if (parts[0] === 'practice' && parts[1] && VALID_MODES.includes(parts[2] as QuizMode)) {
    return { page: 'practice', setId: parts[1], mode: parts[2] as QuizMode };
  }
  return { page: 'home' };
}

function buildHash(route: Route): string {
  if (route.page === 'home') return '#/';
  if (route.page === 'import') return '#/import';
  if (route.page === 'detail') return `#/set/${encodeURIComponent(route.setId)}`;
  return `#/practice/${encodeURIComponent(route.setId)}/${encodeURIComponent(route.mode)}`;
}

export function App() {
  const [route, setRoute] = useState<Route>(() => parseHashRoute(window.location.hash));
  const [wordSets, setWordSets] = useState<WordSet[]>([]);
  const [imageAssets, setImageAssets] = useState<ImageAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const navigate = useCallback((next: Route) => {
    const targetHash = buildHash(next);
    if (window.location.hash !== targetHash) {
      window.location.hash = targetHash;
    } else {
      setRoute(next);
    }
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, []);

  useEffect(() => {
    const onHashChange = () => {
      setRoute(parseHashRoute(window.location.hash));
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const refreshData = useCallback(async () => {
    setLoadError(null);
    try {
      const [sets, assets] = await Promise.all([
        defaultVocabRepo.listWordSets(),
        defaultVocabRepo.listImageAssets(),
      ]);
      setWordSets(sets);
      setImageAssets(assets);
    } catch (err) {
      setLoadError(formatStorageError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshData();
  }, [refreshData]);

  const assetsById = useMemo(() => {
    const map: Record<string, ImageAsset> = {};
    for (const asset of imageAssets) {
      map[asset.id] = asset;
    }
    return map;
  }, [imageAssets]);

  const handleSaveNewSet = useCallback(
    async (newSet: WordSet) => {
      await defaultVocabRepo.saveWordSet(newSet);
      await refreshData();
      navigate({ page: 'detail', setId: newSet.id });
    },
    [navigate, refreshData],
  );

  const handleUpdateSet = useCallback(
    async (updated: WordSet) => {
      await defaultVocabRepo.saveWordSet(updated);
      setWordSets((prev) =>
        prev
          .map((s) => (s.id === updated.id ? updated : s))
          .sort((a, b) => b.updatedAt - a.updatedAt),
      );
    },
    [],
  );

  const handleDeleteSet = useCallback(
    async (setId: string) => {
      await defaultVocabRepo.deleteWordSet(setId);
      setWordSets((prev) => prev.filter((s) => s.id !== setId));
      if (route.page !== 'home' && 'setId' in route && route.setId === setId) {
        navigate({ page: 'home' });
      }
    },
    [navigate, route],
  );

  const handleSaveImageAsset = useCallback(async (asset: ImageAsset) => {
    const saved = await defaultVocabRepo.saveImageAsset(asset);
    setImageAssets((prev) => {
      const exists = prev.some((a) => a.id === saved.id);
      const next = exists ? prev.map((a) => (a.id === saved.id ? saved : a)) : [saved, ...prev];
      return next.sort((a, b) => b.updatedAt - a.updatedAt);
    });
  }, []);

  const handleLoadSamples = useCallback(async () => {
    const samples = createSampleWordSets();
    for (const sample of samples) {
      await defaultVocabRepo.saveWordSet(sample);
    }
    await refreshData();
  }, [refreshData]);

  const activeSet = useMemo(() => {
    if (route.page === 'detail' || route.page === 'practice') {
      return wordSets.find((s) => s.id === route.setId) ?? null;
    }
    return null;
  }, [route, wordSets]);

  return (
    <Layout
      onGoHome={() => navigate({ page: 'home' })}
      onGoImport={() => navigate({ page: 'import' })}
      showImportAction={route.page === 'home'}
    >
      {loadError ? (
        <div className="alert alert-danger" role="alert" style={{ marginBottom: '1rem' }}>
          <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
          <div className="row-between" style={{ flex: 1 }}>
            <span>{loadError}</span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => void refreshData()}>
              重新載入
            </button>
          </div>
        </div>
      ) : null}

      {route.page === 'home' ? (
        <HomePage
          wordSets={wordSets}
          assetsById={assetsById}
          loading={loading}
          onSelectSet={(setId) => navigate({ page: 'detail', setId })}
          onStartImport={() => navigate({ page: 'import' })}
          onLoadSamples={handleLoadSamples}
          onDeleteSet={handleDeleteSet}
        />
      ) : route.page === 'import' ? (
        <ImportPage
          onCancel={() => navigate({ page: 'home' })}
          onSaveWordSet={handleSaveNewSet}
        />
      ) : route.page === 'detail' ? (
        loading ? (
          <div className="card">正在讀取單字組…</div>
        ) : activeSet ? (
          <SetDetailPage
            wordSet={activeSet}
            allAssets={imageAssets}
            assetsById={assetsById}
            onBack={() => navigate({ page: 'home' })}
            onUpdateSet={handleUpdateSet}
            onDeleteSet={handleDeleteSet}
            onSaveImageAsset={handleSaveImageAsset}
            onStartPractice={(mode) =>
              navigate({ page: 'practice', setId: activeSet.id, mode })
            }
          />
        ) : (
          <div className="card stack-md">
            <h1 className="section-title">找不到此單字組</h1>
            <p className="muted" style={{ margin: 0 }}>
              該課次可能已被刪除，或尚未在此瀏覽器中建立。
            </p>
            <div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => navigate({ page: 'home' })}
              >
                返回單字組清單
              </button>
            </div>
          </div>
        )
      ) : loading ? (
        <div className="card">正在準備複習題目…</div>
      ) : activeSet ? (
        <PracticePage
          wordSet={activeSet}
          mode={route.mode}
          assetsById={assetsById}
          onBackToSet={() => navigate({ page: 'detail', setId: activeSet.id })}
          onBackToHome={() => navigate({ page: 'home' })}
        />
      ) : (
        <div className="card stack-md">
          <h1 className="section-title">找不到要複習的單字組</h1>
          <div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => navigate({ page: 'home' })}
            >
              返回單字組清單
            </button>
          </div>
        </div>
      )}
    </Layout>
  );
}

export default App;
