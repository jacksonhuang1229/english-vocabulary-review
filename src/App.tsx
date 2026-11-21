import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { ImageAsset, PracticeRecord, QuizMode, WordGroup, WordSet } from './types/models';
import { defaultVocabRepo, formatStorageError } from './db/indexedDb';
import { createSampleWordSets } from './services/sampleData';
import {
  decodeShareTokenToWordGroup,
  decodeShareTokenToWordSet,
} from './services/shareService';
import { Layout } from './components/Layout';
import { HomePage } from './pages/HomePage';
import { ImportPage } from './pages/ImportPage';
import { SetDetailPage } from './pages/SetDetailPage';
import { PracticePage } from './pages/PracticePage';
import { SharedSetPage } from './pages/SharedSetPage';
import { SharedGroupPage } from './pages/SharedGroupPage';
import { HistoryPage } from './pages/HistoryPage';

type Route =
  | { page: 'home' }
  | { page: 'import' }
  | { page: 'history'; setId?: string }
  | { page: 'detail'; setId: string }
  | { page: 'practice'; setId: string; mode: QuizMode }
  | { page: 'share'; token: string }
  | { page: 'share-practice'; token: string; mode: QuizMode }
  | { page: 'share-group'; token: string }
  | { page: 'share-group-practice'; token: string; setIndex: number; mode: QuizMode };

const VALID_MODES: QuizMode[] = ['fill-blank', 'listen-spell', 'picture-choice'];

function parseHashRoute(hash: string): Route {
  const clean = hash.replace(/^#\/?/, '').trim();
  if (!clean) return { page: 'home' };
  const parts = clean.split('/').map((p) => decodeURIComponent(p));
  if (parts[0] === 'import') {
    return { page: 'import' };
  }
  if (parts[0] === 'history') {
    return { page: 'history', setId: parts[1] || undefined };
  }
  if (parts[0] === 'set' && parts[1]) {
    return { page: 'detail', setId: parts[1] };
  }
  if (parts[0] === 'practice' && parts[1] && VALID_MODES.includes(parts[2] as QuizMode)) {
    return { page: 'practice', setId: parts[1], mode: parts[2] as QuizMode };
  }
  if ((parts[0] === 's' || parts[0] === 'share') && parts[1]) {
    return { page: 'share', token: parts[1] };
  }
  if (
    (parts[0] === 'sp' || parts[0] === 'share-practice') &&
    parts[1] &&
    VALID_MODES.includes(parts[2] as QuizMode)
  ) {
    return { page: 'share-practice', token: parts[1], mode: parts[2] as QuizMode };
  }
  if (parts[0] === 'g' && parts[1]) {
    return { page: 'share-group', token: parts[1] };
  }
  if (
    parts[0] === 'gp' &&
    parts[1] &&
    parts[2] !== undefined &&
    VALID_MODES.includes(parts[3] as QuizMode)
  ) {
    const idx = Number(parts[2]);
    if (Number.isInteger(idx) && idx >= 0) {
      return {
        page: 'share-group-practice',
        token: parts[1],
        setIndex: idx,
        mode: parts[3] as QuizMode,
      };
    }
  }
  return { page: 'home' };
}

function buildHash(route: Route): string {
  if (route.page === 'home') return '#/';
  if (route.page === 'import') return '#/import';
  if (route.page === 'history') {
    return route.setId ? `#/history/${encodeURIComponent(route.setId)}` : '#/history';
  }
  if (route.page === 'detail') return `#/set/${encodeURIComponent(route.setId)}`;
  if (route.page === 'share') return `#/s/${encodeURIComponent(route.token)}`;
  if (route.page === 'share-practice') {
    return `#/sp/${encodeURIComponent(route.token)}/${encodeURIComponent(route.mode)}`;
  }
  if (route.page === 'share-group') return `#/g/${encodeURIComponent(route.token)}`;
  if (route.page === 'share-group-practice') {
    return `#/gp/${encodeURIComponent(route.token)}/${route.setIndex}/${encodeURIComponent(route.mode)}`;
  }
  return `#/practice/${encodeURIComponent(route.setId)}/${encodeURIComponent(route.mode)}`;
}

export function App() {
  const [route, setRoute] = useState<Route>(() => parseHashRoute(window.location.hash));
  const [wordSets, setWordSets] = useState<WordSet[]>([]);
  const [wordGroups, setWordGroups] = useState<WordGroup[]>([]);
  const [imageAssets, setImageAssets] = useState<ImageAsset[]>([]);
  const [practiceRecords, setPracticeRecords] = useState<PracticeRecord[]>([]);
  const [initialGroupFilterId, setInitialGroupFilterId] = useState<string | null>(null);
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
      const [sets, groups, assets, records] = await Promise.all([
        defaultVocabRepo.listWordSets(),
        defaultVocabRepo.listWordGroups(),
        defaultVocabRepo.listImageAssets(),
        defaultVocabRepo.listPracticeRecords(),
      ]);
      setWordSets(sets);
      setWordGroups(groups);
      setImageAssets(assets);
      setPracticeRecords(records);
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
    async (newSet: WordSet, bundledAssets?: ImageAsset[]) => {
      if (bundledAssets && bundledAssets.length > 0) {
        for (const asset of bundledAssets) {
          await defaultVocabRepo.saveImageAsset(asset);
        }
      }
      await defaultVocabRepo.saveWordSet(newSet);
      await refreshData();
      navigate({ page: 'detail', setId: newSet.id });
    },
    [navigate, refreshData],
  );

  const handleSaveImportedGroup = useCallback(
    async (group: WordGroup, sets: WordSet[], bundledAssets?: ImageAsset[]) => {
      if (bundledAssets && bundledAssets.length > 0) {
        for (const asset of bundledAssets) {
          await defaultVocabRepo.saveImageAsset(asset);
        }
      }
      for (const s of sets) {
        await defaultVocabRepo.saveWordSet(s);
      }
      await defaultVocabRepo.saveWordGroup(group);
      await refreshData();
      setInitialGroupFilterId(group.id);
      navigate({ page: 'home' });
    },
    [navigate, refreshData],
  );

  const handleUpdateSet = useCallback(async (updated: WordSet) => {
    await defaultVocabRepo.saveWordSet(updated);
    setWordSets((prev) =>
      prev
        .map((s) => (s.id === updated.id ? updated : s))
        .sort((a, b) => b.updatedAt - a.updatedAt),
    );
  }, []);

  const handleDeleteSet = useCallback(
    async (setId: string) => {
      await defaultVocabRepo.deleteWordSet(setId);
      setWordSets((prev) => prev.filter((s) => s.id !== setId));
      setWordGroups((prev) =>
        prev.map((g) =>
          g.wordSetIds.includes(setId)
            ? { ...g, wordSetIds: g.wordSetIds.filter((id) => id !== setId) }
            : g,
        ),
      );
      if (route.page !== 'home' && 'setId' in route && route.setId === setId) {
        navigate({ page: 'home' });
      }
    },
    [navigate, route],
  );

  const handleSaveGroup = useCallback(async (group: WordGroup) => {
    await defaultVocabRepo.saveWordGroup(group);
    setWordGroups((prev) => {
      const exists = prev.some((g) => g.id === group.id);
      const next = exists ? prev.map((g) => (g.id === group.id ? group : g)) : [group, ...prev];
      return next.sort((a, b) => b.updatedAt - a.updatedAt);
    });
  }, []);

  const handleDeleteGroup = useCallback(async (groupId: string) => {
    await defaultVocabRepo.deleteWordGroup(groupId);
    setWordGroups((prev) => prev.filter((g) => g.id !== groupId));
  }, []);

  const handleSavePracticeRecord = useCallback(async (record: PracticeRecord) => {
    await defaultVocabRepo.savePracticeRecord(record);
    setPracticeRecords((prev) =>
      [record, ...prev.filter((r) => r.id !== record.id)].sort(
        (a, b) => b.completedAt - a.completedAt,
      ),
    );
  }, []);

  const handleDeletePracticeRecord = useCallback(async (recordId: string) => {
    await defaultVocabRepo.deletePracticeRecord(recordId);
    setPracticeRecords((prev) => prev.filter((r) => r.id !== recordId));
  }, []);

  const handleClearPracticeRecords = useCallback(async (wordSetId?: string) => {
    await defaultVocabRepo.clearPracticeRecords(wordSetId);
    setPracticeRecords((prev) =>
      wordSetId ? prev.filter((r) => r.wordSetId !== wordSetId) : [],
    );
  }, []);

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
    if (route.page === 'share' || route.page === 'share-practice') {
      try {
        return decodeShareTokenToWordSet(route.token);
      } catch {
        return null;
      }
    }
    if (route.page === 'share-group-practice') {
      try {
        const decoded = decodeShareTokenToWordGroup(route.token);
        return decoded.wordSets[route.setIndex] ?? null;
      } catch {
        return null;
      }
    }
    return null;
  }, [route, wordSets]);

  const activeSharedGroupTitle = useMemo(() => {
    if (route.page === 'share-group') {
      try {
        return decodeShareTokenToWordGroup(route.token).groupName;
      } catch {
        return null;
      }
    }
    return null;
  }, [route]);

  useEffect(() => {
    if (route.page === 'history') {
      document.title = '複習紀錄｜英文單字複習小幫手';
    } else if (activeSet?.name) {
      document.title = `${activeSet.name}｜英文單字複習小幫手`;
    } else if (activeSharedGroupTitle) {
      document.title = `${activeSharedGroupTitle}｜英文單字複習小幫手`;
    } else {
      document.title = '英文單字複習小幫手';
    }
  }, [route.page, activeSet?.name, activeSharedGroupTitle]);

  return (
    <Layout
      onGoHome={() => navigate({ page: 'home' })}
      onGoImport={() => navigate({ page: 'import' })}
      onGoHistory={() => navigate({ page: 'history' })}
      recordCount={practiceRecords.length}
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
          wordGroups={wordGroups}
          assetsById={assetsById}
          loading={loading}
          initialGroupFilterId={initialGroupFilterId}
          onSelectSet={(setId) => navigate({ page: 'detail', setId })}
          onStartImport={() => navigate({ page: 'import' })}
          onLoadSamples={handleLoadSamples}
          onDeleteSet={handleDeleteSet}
          onSaveGroup={handleSaveGroup}
          onDeleteGroup={handleDeleteGroup}
        />
      ) : route.page === 'import' ? (
        <ImportPage
          onCancel={() => navigate({ page: 'home' })}
          onSaveWordSet={handleSaveNewSet}
          onSaveImportedGroup={handleSaveImportedGroup}
        />
      ) : route.page === 'history' ? (
        <HistoryPage
          records={practiceRecords}
          wordSets={wordSets}
          initialSetFilter={route.setId ?? null}
          onBackHome={() => navigate({ page: 'home' })}
          onOpenSet={(setId) => navigate({ page: 'detail', setId })}
          onDeleteRecord={handleDeletePracticeRecord}
          onClearRecords={handleClearPracticeRecords}
        />
      ) : route.page === 'detail' ? (
        loading ? (
          <div className="card">正在讀取單字組…</div>
        ) : activeSet ? (
          <SetDetailPage
            wordSet={activeSet}
            allAssets={imageAssets}
            assetsById={assetsById}
            recentRecords={practiceRecords.filter((r) => r.wordSetId === activeSet.id)}
            onBack={() => navigate({ page: 'home' })}
            onUpdateSet={handleUpdateSet}
            onDeleteSet={handleDeleteSet}
            onSaveImageAsset={handleSaveImageAsset}
            onStartPractice={(mode) =>
              navigate({ page: 'practice', setId: activeSet.id, mode })
            }
            onViewSetHistory={() => navigate({ page: 'history', setId: activeSet.id })}
            onDeleteRecord={handleDeletePracticeRecord}
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
      ) : route.page === 'share' ? (
        <SharedSetPage
          token={route.token}
          onGoHome={() => navigate({ page: 'home' })}
          onStartDirectPractice={(mode) =>
            navigate({ page: 'share-practice', token: route.token, mode })
          }
          onSaveToLocal={(newSet) => handleSaveNewSet(newSet)}
        />
      ) : route.page === 'share-practice' ? (
        activeSet ? (
          <PracticePage
            wordSet={activeSet}
            mode={route.mode}
            assetsById={{}}
            onBackToSet={() => navigate({ page: 'share', token: route.token })}
            onBackToHome={() => navigate({ page: 'home' })}
            onRecordCompleted={handleSavePracticeRecord}
            onViewHistory={() => navigate({ page: 'history' })}
          />
        ) : (
          <div className="card stack-md">
            <h1 className="section-title">分享連結無效或已損毀</h1>
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
      ) : route.page === 'share-group' ? (
        <SharedGroupPage
          token={route.token}
          onGoHome={() => navigate({ page: 'home' })}
          onStartDirectPractice={(setIndex, mode) =>
            navigate({ page: 'share-group-practice', token: route.token, setIndex, mode })
          }
          onSaveGroupToLocal={(group, sets) => handleSaveImportedGroup(group, sets)}
        />
      ) : route.page === 'share-group-practice' ? (
        activeSet ? (
          <PracticePage
            wordSet={activeSet}
            mode={route.mode}
            assetsById={{}}
            onBackToSet={() => navigate({ page: 'share-group', token: route.token })}
            onBackToHome={() => navigate({ page: 'home' })}
            onRecordCompleted={handleSavePracticeRecord}
            onViewHistory={() => navigate({ page: 'history' })}
          />
        ) : (
          <div className="card stack-md">
            <h1 className="section-title">群組分享連結無效或找不到該課次</h1>
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
          onRecordCompleted={handleSavePracticeRecord}
          onViewHistory={() => navigate({ page: 'history', setId: activeSet.id })}
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
