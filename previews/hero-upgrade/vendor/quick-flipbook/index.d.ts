import type { BufferGeometry, Material, Mesh, Texture } from 'three';

export interface FlipBookConfig {
  flipDuration: number;
  yBetweenPages: number;
  pageSubdivisions: number;
  /** Keep the surrounding hardcover's hinge fixed instead of centering the spread. */
  autoCenter?: boolean;
}

export interface FlipPage extends Mesh {
  readonly page: Mesh<BufferGeometry, Material[]>;
  flip(progress: number, direction: number, pageCurveIntensity?: number): void;
  setPageMaterial(material: Material, index: number): void;
  reset(): void;
  dispose(materialToo?: boolean): void;
}

export declare class FlipBook extends Mesh implements Iterable<FlipPage> {
  constructor(config: FlipBookConfig | null);
  setPages(sources: Array<string | Material | Texture | null>): void;
  readonly totalPages: number;
  /** Page face index: nextPage advances by two faces, one physical sheet. */
  currentPage: number;
  /** Physical sheets turned, between zero and totalPages / 2. */
  progress: number;
  readonly isAnimating: boolean;
  animate(deltaSeconds: number): void;
  flipPage(page: FlipPage): void;
  nextPage(): void;
  previousPage(): void;
  dispose(): void;
  [Symbol.iterator](): Iterator<FlipPage>;
}
