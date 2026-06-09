import { useEffect, useRef, useState } from 'react';
import { useEnv } from '@/context/EnvContext';
import { impactFeedback } from '@tauri-apps/plugin-haptics';
import { eventDispatcher } from '@/utils/event';
import { SelectedFile } from '@/hooks/useFileSelector';
import { isTauriAppPlatform } from '@/services/environment';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { useTranslation } from '@/hooks/useTranslation';
import { BOOK_ACCEPT_FORMATS, SUPPORTED_BOOK_EXTS } from '@/services/constants';
import { useSearchParams } from 'next/navigation';

const SUPPORTED_COVER_IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif'];

const hasSupportedBookExt = (name: string) => {
  const ext = name.split('.').pop()?.toLowerCase();
  return ext ? SUPPORTED_BOOK_EXTS.includes(ext) : false;
};

const hasSupportedCoverImageExt = (name: string) => {
  const ext = name.split('.').pop()?.toLowerCase();
  return ext ? SUPPORTED_COVER_IMAGE_EXTS.includes(ext) : false;
};

const isCoverImageFile = (file: File) =>
  file.type.startsWith('image/') || hasSupportedCoverImageExt(file.name);

const getFirstCoverImageFile = (files: File[]) => files.find(isCoverImageFile);

const getFirstCoverImagePath = (paths: string[]) => paths.find(hasSupportedCoverImageExt);

const hasCoverImageData = (dataTransfer: DataTransfer | null) => {
  if (!dataTransfer) return false;

  const items = Array.from(dataTransfer.items || []);
  if (items.length > 0) {
    return items.some((item) => item.kind === 'file' && item.type.startsWith('image/'));
  }

  return Array.from(dataTransfer.files || []).some(isCoverImageFile);
};

const findBookHashAtClientPoint = (x: number, y: number) => {
  const dpr = window.devicePixelRatio || 1;
  const points = [{ x, y }, ...(dpr !== 1 ? [{ x: x / dpr, y: y / dpr }] : [])];

  for (const point of points) {
    if (point.x < 0 || point.y < 0 || point.x > window.innerWidth || point.y > window.innerHeight) {
      continue;
    }
    const target = document
      .elementFromPoint(point.x, point.y)
      ?.closest<HTMLElement>('[data-book-hash]');
    const bookHash = target?.dataset['bookHash'];
    if (bookHash) return bookHash;
  }

  return null;
};

const getBookHashFromDragEvent = (event: React.DragEvent<HTMLDivElement> | DragEvent) => {
  if (typeof event.clientX !== 'number' || typeof event.clientY !== 'number') return null;
  return findBookHashAtClientPoint(event.clientX, event.clientY);
};

const getBookHashFromNativePosition = (position?: { x: number; y: number }) => {
  if (!position) return null;
  return findBookHashAtClientPoint(position.x, position.y);
};

export const useDragDropImport = () => {
  const _ = useTranslation();
  const searchParams = useSearchParams();
  const group = searchParams?.get('group') || '';

  const { appService } = useEnv();
  const [isDragging, setIsDragging] = useState(false);
  const [isCoverImageDragging, setIsCoverImageDragging] = useState(false);
  const [coverDropTargetHash, setCoverDropTargetHash] = useState<string | null>(null);
  const coverDropTargetHashRef = useRef<string | null>(null);
  const nativeDragPathsRef = useRef<string[]>([]);

  const updateCoverDropTarget = (bookHash: string | null) => {
    if (coverDropTargetHashRef.current === bookHash) return;
    coverDropTargetHashRef.current = bookHash;
    setCoverDropTargetHash(bookHash);
  };

  const resetCoverDragState = () => {
    setIsCoverImageDragging(false);
    updateCoverDropTarget(null);
    nativeDragPathsRef.current = [];
  };

  const handleCoverImageDrop = (bookHash: string | null, file?: File, path?: string) => {
    if (!bookHash || (!file && !path)) return false;
    eventDispatcher.dispatch('update-book-cover-from-drop', { bookHash, file, path });
    return true;
  };

  const handleDroppedFiles = async (droppedItems: File[] | string[]) => {
    if (droppedItems.length === 0 || !appService) return;

    const fileItems: (File | string)[] = [];
    const directoryPaths: string[] = [];
    for (const item of droppedItems) {
      if (typeof item === 'string' && (await appService.isDirectory(item, 'None'))) {
        directoryPaths.push(item);
      } else {
        fileItems.push(item);
      }
    }

    const fileSelections: SelectedFile[] = fileItems
      .filter((item) => hasSupportedBookExt(typeof item === 'string' ? item : item.name))
      .map((item) => ({
        file: typeof item === 'string' ? undefined : item,
        path: typeof item === 'string' ? item : undefined,
      }));

    if (fileSelections.length === 0 && directoryPaths.length === 0) {
      eventDispatcher.dispatch('toast', {
        message: _('No supported files found. Supported formats: {{formats}}', {
          formats: BOOK_ACCEPT_FORMATS,
        }),
        type: 'error',
      });
      return;
    }

    if (appService.hasHaptics) {
      impactFeedback('medium');
    }

    if (fileSelections.length > 0) {
      eventDispatcher.dispatch('import-book-files', {
        files: fileSelections,
        groupId: group,
      });
    }
    for (const dir of directoryPaths) {
      eventDispatcher.dispatch('import-book-directory', { path: dir });
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement> | DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const isCoverDrag = hasCoverImageData(event.dataTransfer);
    setIsCoverImageDragging(isCoverDrag);
    updateCoverDropTarget(isCoverDrag ? getBookHashFromDragEvent(event) : null);
    setIsDragging(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement> | DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    resetCoverDragState();
  };

  const handleDrop = async (event: React.DragEvent<HTMLDivElement> | DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);

    if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
      const files = Array.from(event.dataTransfer.files);
      const coverFile = getFirstCoverImageFile(files);
      if (coverFile && handleCoverImageDrop(getBookHashFromDragEvent(event), coverFile)) {
        resetCoverDragState();
        return;
      }
      resetCoverDragState();
      handleDroppedFiles(files);
      return;
    }

    resetCoverDragState();
  };

  useEffect(() => {
    const libraryPage = document.querySelector('.library-page');
    if (!appService?.isMobile) {
      libraryPage?.addEventListener('dragover', handleDragOver as unknown as EventListener);
      libraryPage?.addEventListener('dragleave', handleDragLeave as unknown as EventListener);
      libraryPage?.addEventListener('drop', handleDrop as unknown as EventListener);
    }

    let nativeUnlisten: Promise<() => void> | undefined;
    if (isTauriAppPlatform()) {
      nativeUnlisten = getCurrentWebview().onDragDropEvent((event) => {
        const payload = event.payload as {
          type: string;
          paths?: string[];
          position?: { x: number; y: number };
        };
        if (payload.paths) {
          nativeDragPathsRef.current = payload.paths;
        }

        const coverImagePath = getFirstCoverImagePath(nativeDragPathsRef.current);
        if (payload.type === 'enter' || payload.type === 'over') {
          setIsDragging(true);
          setIsCoverImageDragging(!!coverImagePath);
          updateCoverDropTarget(
            coverImagePath ? getBookHashFromNativePosition(payload.position) : null,
          );
        } else if (payload.type === 'drop') {
          setIsDragging(false);
          const droppedPaths = payload.paths || nativeDragPathsRef.current;
          const targetBookHash = getBookHashFromNativePosition(payload.position);
          if (coverImagePath && handleCoverImageDrop(targetBookHash, undefined, coverImagePath)) {
            resetCoverDragState();
            return;
          }
          resetCoverDragState();
          handleDroppedFiles(droppedPaths);
        } else {
          setIsDragging(false);
          resetCoverDragState();
        }
      });
    }

    return () => {
      if (!appService?.isMobile) {
        libraryPage?.removeEventListener('dragover', handleDragOver as unknown as EventListener);
        libraryPage?.removeEventListener('dragleave', handleDragLeave as unknown as EventListener);
        libraryPage?.removeEventListener('drop', handleDrop as unknown as EventListener);
      }
      nativeUnlisten?.then((fn) => fn());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appService, group]);

  return { isDragging, isCoverImageDragging, coverDropTargetHash };
};
