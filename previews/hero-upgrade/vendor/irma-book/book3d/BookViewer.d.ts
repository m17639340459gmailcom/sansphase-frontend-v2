import type { Box3, Object3D } from 'three';
/** Narrow, verified host API for upstream 32e8c1a plus documented host patches. */
export interface BookPageLayer {
  object: Object3D;
  readonly progress: number;
  readonly leftSupportProgress: number;
  advance(delta: number): boolean;
  reset(): void;
  dispose(): void;
}
export interface BookOptions {
  height?: number; width?: number; spine?: number; binding?: 'hardcover' | 'bodoni' | 'paperback'; spineRound?: number;
  coverSurface?: 'cloth' | 'uncoated' | 'coatedMatte' | 'coatedGloss' | 'laid'; coverColor?: string; inkColor?: string;
  pageColor?: string; endpaperColor?: string; headbandColors?: [string, string]; textureDensity?: number; grain?: number;
  embossMode?: 'none' | 'deboss' | 'emboss'; embossDepth?: number; embossBevel?: number; embossSoftness?: number;
  openAngle?: number; openOnClick?: boolean; openSpeed?: number;
  cameraAzimuth?: number; cameraElevation?: number; zoom?: number; fov?: number;
  shadowOpacity?: number; exposure?: number; autoRotate?: boolean; idleSway?: boolean; pointerParallax?: boolean;
  readingMode?: boolean; onStateChange?: () => void;
  design?: {
    title?: string; subtitle?: string; author?: string; spineTop?: string; spineBottom?: string; blurb?: string;
    frontispieceNote?: string; titleFont?: string; bodyFont?: string; frame?: boolean; frontAlign?: 'left' | 'center';
  };
}
export interface BookCaseViewer {
  readonly isOpen: boolean;
  readonly canOpen: boolean;
  readonly openProgress: number;
  readonly isTurning: boolean;
  readonly pageBounds: Box3;
  readonly pageHingeX: number;
  controls?: { enableZoom: boolean };
  attachPageLayer(layer: BookPageLayer): void;
  invalidate(): void;
  hitTest(clientX: number, clientY: number): boolean;
  update(patch: BookOptions): void;
  toggleOpen(): void;
  setOpen(open: boolean): void;
  resetCamera(): void;
  setActive(active: boolean): void;
  dispose(): void;
}
/** Composed paper viewer returned by the site's library-book-viewer module. */
export interface BookViewer extends BookCaseViewer {
  readonly currentPage: number;
  readonly pageCount: number;
  nextPage(): boolean;
  previousPage(): boolean;
}
export function createBookViewer(container: HTMLElement, options?: BookOptions): BookCaseViewer;
