import {
  ACESFilmicToneMapping,
  AgXToneMapping,
  Box3,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  NeutralToneMapping,
  VSMShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Raycaster,
  Scene,
  ShadowMaterial,
  Sphere,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { bookSpec, jacketSpec } from './geometry/profiles.js';
import { sweptProfileGeometry } from './geometry/sweptProfile.js';
import { createBookMaterials } from './materials.js';
import { createHeadbands } from './headband.js';
import { createHingeUniforms } from './hinge.js';
import { createFirstPage } from './firstPage.js';
import { DEFAULT_DESIGN } from './textures/coverArt.js';

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Millimeters -> scene units. */
const MM = 0.01;

export const DEFAULT_PARAMS = {
  // format
  height: 240,
  width: 160,
  spine: 32,
  binding: 'hardcover',      // 'hardcover' | 'bodoni' | 'paperback'
  spineRound: 0.7,           // 0 = square spine, 1 = fully round
  square: 3,                 // square: how far the boards overhang the block
  board: 2.7,                // board thickness
  grooveDepth: 0.9,          // groove depth
  coverThickness: 0.32,      // paperback cover thickness

  // materials
  coverSurface: 'cloth',     // cloth | uncoated | coatedMatte | coatedGloss | laid
  coverColor: '#2f1d16',
  inkColor: '#e8d9c2',
  endpaperColor: '#cdbb9c',
  pageColor: '#efe7d6',
  pageThickness: 0.105,
  headband: true,
  headbandColors: ['#8d2f28', '#efe4cc'],

  // Bodoni binding: cloth spine, boards in paper (coverSurface/coverColor)
  spineClothWidth: 10,       // millimeters of cloth exposed on the board
  spineClothSurface: 'cloth',
  spineClothColor: '#9e2b2e',

  // cover artwork
  showText: true,            // procedural text editor on the cover
  embossMode: 'none',        // 'none' | 'deboss' | 'emboss'
  embossDepth: 0.6,
  embossSource: 'text',      // 'text' = titles · 'image' = artwork luminance
  embossInkless: false,      // blind emboss: no ink, just the impression
  embossBevel: 0.6,          // shoulder in mm: 0 = rectangular cross-section, wider = triangular on thin strokes
  embossSoftness: 0.55,      // 0 = straight, faceted shoulder, 1 = rounded

  // opening
  openable: true,           // the front board opens on click
  openOnClick: true,
  openAngle: 125,           // opening angle, in degrees
  openSpeed: 5.5,

  // dust jacket
  jacket: false,
  jacketSurface: 'coatedMatte',
  jacketFlapArt: false,      // the wrap artwork extends onto the printed flaps
  jacketGap: 0.28,
  jacketThickness: 0.18,
  flapWidth: 95,
  grain: 1,
  textureDensity: 6,
  design: { ...DEFAULT_DESIGN },

  // scene
  exposure: 1.08,
  envIntensity: 0.65,
  keyIntensity: 2.6,
  fillIntensity: 0.5,
  rimIntensity: 1.1,
  shadowOpacity: 0.34,
  toneMapping: 'neutral',
  fov: 26,
  cameraAzimuth: -34,        // degrees
  cameraElevation: 10,
  zoom: 0.95,
  autoRotate: true,
  autoRotateSpeed: 0.6,
  // seconds to wait after the last interaction (drag/zoom) before auto-rotate
  // resumes — 0 = resumes immediately on release
  autoRotateResumeDelay: 4,
  pointerParallax: true,
  idleSway: true,
};

const TONE = {
  neutral: NeutralToneMapping,
  agx: AgXToneMapping,
  aces: ACESFilmicToneMapping,
};

/**
 * Creates the viewer inside `container`. The canvas is transparent: the page
 * hosting it decides the background.
 *
 * @param {HTMLElement} container
 * @param {Partial<typeof DEFAULT_PARAMS>} [options]
 */
export function createBookViewer(container, options = {}) {
  let disposed = false;
  let externallyActive = true;
  let inViewport = true;
  const imageVersions = new Map();
  const params = { ...DEFAULT_PARAMS, ...options, design: { ...DEFAULT_DESIGN, ...(options.design ?? {}) } };
  const images = { front: null, back: null, spine: null, wrap: null, firstPage: null };
  const hinge = createHingeUniforms();

  const renderer = new WebGLRenderer({
    antialias: true,
    alpha: true,
    // Host adaptation: this embedded viewer does not export captures.
    preserveDrawingBuffer: false,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = VSMShadowMap;
  renderer.toneMapping = TONE[params.toneMapping] ?? NeutralToneMapping;
  renderer.toneMappingExposure = params.exposure;
  renderer.setClearAlpha(0);
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:pan-y';
  container.appendChild(renderer.domElement);

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  const environment = new RoomEnvironment();
  let envRT;
  try {
    envRT = pmrem.fromScene(environment, 0.04);
  } catch (error) {
    pmrem.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
    throw error;
  } finally {
    environment.dispose();
  }
  scene.environment = envRT.texture;
  scene.environmentIntensity = params.envIntensity;

  const camera = new PerspectiveCamera(params.fov, 1, 0.05, 100);

  // --- lights: high key to the left, cool fill, rim light on the spine ---
  const key = new DirectionalLight(0xfff4e8, params.keyIntensity);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 8;
  key.shadow.blurSamples = 16;
  scene.add(key, key.target);

  const fill = new DirectionalLight(0xdfe8ff, params.fillIntensity);
  const rim = new DirectionalLight(0xffffff, params.rimIntensity);
  const ambient = new HemisphereLight(0xffffff, 0x8a7a6a, 0.35);
  scene.add(fill, rim, ambient);

  const ground = new Mesh(
    new PlaneGeometry(40, 40),
    new ShadowMaterial({ opacity: params.shadowOpacity, transparent: true })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const book = new Group();
  scene.add(book);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.enablePan = false;
  controls.rotateSpeed = 0.85;
  controls.zoomSpeed = 0.7;
  controls.minPolarAngle = 0.15;
  controls.maxPolarAngle = Math.PI * 0.52;
  controls.autoRotate = params.autoRotate;
  controls.autoRotateSpeed = params.autoRotateSpeed;

  let firstBuild = true;
  let lastFitDistance = 0;
  let openTarget = 0;
  let openCurrent = 0;
  let hingeActive = false;
  let firstPage = null;
  let coverMesh = null;
  let pagesMesh = null;
  let jacketMesh = null;
  let headbands = null;
  let materials = null;
  let spec = null;
  let bookSize = new Vector3();
  // Host extension: a separate, licensed paper engine lives in the same case.
  // The case/cloth geometry and the opening hinge remain irma-book's.
  let pageLayer = null;
  let leftPagesMesh = null;
  const closedPosition = new Vector3();
  const closedTarget = new Vector3();
  const readingPosition = new Vector3();
  const readingTarget = new Vector3();
  let readingTransition = false;
  // suspends idle sway/pointer parallax/auto-rotate so export.js can drive
  // the camera or book rotation deterministically for a capture — see
  // beginExport()/endExport() below
  let exportMode = false;

  function disposeBook() {
    if (leftPagesMesh) { book.remove(leftPagesMesh); leftPagesMesh = null; }
    for (const mesh of [coverMesh, pagesMesh, jacketMesh]) {
      if (!mesh) continue;
      book.remove(mesh);
      mesh.geometry.dispose();
    }
    jacketMesh = null;
    if (firstPage) {
      book.remove(firstPage);
      firstPage.userData.dispose();
      firstPage = null;
    }
    if (headbands) {
      book.remove(headbands);
      headbands.userData.dispose();
      headbands = null;
    }
    materials?.dispose();
    coverMesh = pagesMesh = materials = null;
  }

  /** Rebuilds geometry and materials from the current parameters. */
  function rebuild() {
    if (disposed) return;
    disposeBook();
    spec = bookSpec(params);

    const coverGeometry = sweptProfileGeometry({ ...spec.cover, capMaterial: 2 });
    const pagesGeometry = sweptProfileGeometry({ ...spec.pages, capMaterial: 2 });

    // the dust jacket only exists on hardcover
    const useJacket = params.jacket && spec.meta.binding === 'hardcover';
    const jacketGeometry = useJacket
      ? sweptProfileGeometry({ ...jacketSpec(params), capMaterial: 2 })
      : null;

    // hardcover and paperback both open, on different hinges
    hingeActive = Boolean(params.openable) && spec.meta.hingeX !== undefined;
    if (hingeActive) {
      hinge.bookHingeCenter.value.set(spec.meta.hingeX, params.readingMode ? 0 : spec.meta.hingeZ);
      hinge.bookHingeBlend.value = spec.meta.hingeBlend;
      // The front lining starts exactly at the hinge. Keeping the upstream
      // mask centered there would turn its inner vertices only halfway and
      // stretch a sloped triangle over the left paper when opened flat.
      hinge.bookHingeMaskShift.value = params.readingMode ? -spec.meta.hingeBlend : 0;
    } else {
      openTarget = openCurrent = 0;
      hinge.bookOpenAngle.value = 0;
    }

    materials = createBookMaterials({
      params, coverGeometry, jacketGeometry, images, spec,
      hingeUniforms: hingeActive ? hinge : null,
    });

    coverMesh = new Mesh(coverGeometry, materials.cover);
    pagesMesh = new Mesh(pagesGeometry, materials.pages);
    if (jacketGeometry) jacketMesh = new Mesh(jacketGeometry, materials.jacket);
    for (const mesh of [coverMesh, pagesMesh, jacketMesh]) {
      if (!mesh) continue;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.scale.setScalar(MM);
      book.add(mesh);
    }
    if (materials.depthMaterial) {
      for (const mesh of [coverMesh, jacketMesh]) {
        if (mesh) mesh.customDepthMaterial = materials.depthMaterial;
      }
    }

    if (hingeActive) {
      pagesGeometry.computeBoundingBox();
      firstPage = createFirstPage({
        pagesBounds: pagesGeometry.boundingBox,
        params,
        image: images.firstPage,
      });
      if (firstPage) {
        firstPage.scale.setScalar(MM);
        firstPage.position.multiplyScalar(MM);
        book.add(firstPage);
      }
    }

    if (params.headband) {
      pagesGeometry.computeBoundingBox();
      headbands = createHeadbands({ spec, params, pagesBounds: pagesGeometry.boundingBox });
      if (headbands) {
        headbands.scale.setScalar(MM);
        book.add(headbands);
      }
    }

    if (pageLayer) mountPageLayer();

    // rests the book on the ground plane
    book.position.y = (params.height / 2) * MM;
    bookSize.set(params.width, params.height, params.spine).multiplyScalar(MM);

    frameLights();
    frameCamera(firstBuild ? 'initial' : 'refit');
    firstBuild = false;
    invalidate();
  }

  function mountPageLayer() {
    if (firstPage) firstPage.visible = false;
    book.add(pageLayer.object);
    // Shared geometry/material: the original block now supplies two supports,
    // whose thickness follows how much of the paper has moved across the spine.
    leftPagesMesh = new Mesh(pagesMesh.geometry, pagesMesh.material);
    leftPagesMesh.castShadow = leftPagesMesh.receiveShadow = true;
    leftPagesMesh.scale.set(-MM, MM, MM);
    leftPagesMesh.position.x = 2 * spec.meta.hingeX * MM;
    leftPagesMesh.visible = false;
    book.add(leftPagesMesh);
  }

  function attachPageLayer(layer) {
    if (disposed) { layer.dispose(); return; }
    if (pageLayer) { book.remove(pageLayer.object); pageLayer.dispose(); }
    if (leftPagesMesh) book.remove(leftPagesMesh);
    pageLayer = layer;
    mountPageLayer();
    invalidate();
  }

  function poseReadingBook() {
    const t = openCurrent * openCurrent * (3 - 2 * openCurrent);
    book.rotation.x = -Math.PI * 0.5 * t;
    book.rotation.y = 0;
    book.position.y = (params.height * .5 * (1 - t) + (params.spine * .5 + 1.5) * t) * MM;
    camera.position.lerpVectors(closedPosition, readingPosition, t);
    controls.target.lerpVectors(closedTarget, readingTarget, t);
    camera.lookAt(controls.target);
    if (pageLayer) {
      pageLayer.object.visible = openCurrent > .04;
      const fraction = pageLayer.progress;
      const leftFraction = pageLayer.leftSupportProgress;
      const bounds = pagesMesh.geometry.boundingBox;
      const thickness = (bounds.max.z - bounds.min.z) * MM;
      const bottom = bounds.min.z * MM;
      pagesMesh.scale.z = MM * Math.max(.001, 1 - fraction);
      pagesMesh.position.z = bottom + thickness * (1 - fraction) * .5;
      leftPagesMesh.scale.z = MM * Math.max(.001, leftFraction);
      leftPagesMesh.position.z = bottom + thickness * leftFraction * .5;
      leftPagesMesh.visible = leftFraction > .001 && openCurrent > .04;
      pagesMesh.visible = fraction < .999;
    }
  }

  function frameLights() {
    const r = bookSize.length() * 0.5;
    const center = new Vector3(0, bookSize.y * 0.5, 0);
    key.position.set(-2.2, 3.0, 2.6).normalize().multiplyScalar(r * 6).add(center);
    key.target.position.copy(center);
    key.target.updateMatrixWorld();
    fill.position.set(3.4, 1.2, 2.0).normalize().multiplyScalar(r * 6).add(center);
    rim.position.set(0.6, 1.6, -3.2).normalize().multiplyScalar(r * 6).add(center);

    const cam = key.shadow.camera;
    const extent = r * 2.4;
    cam.left = -extent;
    cam.right = extent;
    cam.top = extent;
    cam.bottom = -extent;
    cam.near = r;
    cam.far = r * 12;
    cam.updateProjectionMatrix();
  }

  /**
   * @param {'initial'|'refit'|'keep'} mode  'initial' snaps the camera to the
   * default angle, 'refit' keeps the user's viewpoint and only rescales the
   * distance (used after a rebuild), 'keep' doesn't touch the position at all.
   */
  function frameCamera(mode = 'initial') {
    const sphere = new Sphere(new Vector3(0, bookSize.y * 0.5, 0), bookSize.length() * 0.5);
    const distance = (sphere.radius / Math.sin((camera.fov * Math.PI) / 360)) * 1.05 / params.zoom;
    if (mode === 'initial') {
      const az = (params.cameraAzimuth * Math.PI) / 180;
      const el = (params.cameraElevation * Math.PI) / 180;
      camera.position.set(
        sphere.center.x + Math.sin(az) * Math.cos(el) * distance,
        sphere.center.y + Math.sin(el) * distance,
        sphere.center.z + Math.cos(az) * Math.cos(el) * distance
      );
    } else if (mode === 'refit') {
      // same viewpoint and relative zoom, rescaled to the new extent
      const dir = camera.position.clone().sub(controls.target);
      if (dir.lengthSq() < 1e-9) dir.set(0, 0, 1);
      const ratio = lastFitDistance > 0 ? dir.length() / lastFitDistance : 1;
      camera.position.copy(sphere.center).add(dir.normalize().multiplyScalar(distance * ratio));
    }
    lastFitDistance = distance;
    controls.target.copy(sphere.center);
    controls.minDistance = distance * 0.45;
    controls.maxDistance = distance * 2.6;
    camera.near = Math.max(0.02, distance * 0.02);
    camera.far = distance * 12;
    camera.updateProjectionMatrix();
    controls.update();
  }

  // --- interaction: pointer parallax and idle sway ---
  const pointer = { x: 0, y: 0, tx: 0, ty: 0, active: false };
  // -Infinity: "never interacted yet" — auto-rotate can start right away, it
  // doesn't need to wait out a delay that doesn't make sense yet
  let lastInteraction = -Infinity;
  const onPointerMove = (e) => {
    const rect = container.getBoundingClientRect();
    pointer.tx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.ty = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    invalidate();
  };
  const onPointerLeave = () => {
    pointer.tx = 0;
    pointer.ty = 0;
  };
  container.addEventListener('pointermove', onPointerMove);
  container.addEventListener('pointerleave', onPointerLeave);
  controls.addEventListener('start', () => {
    pointer.active = true;
    lastInteraction = performance.now();
  });
  controls.addEventListener('end', () => {
    pointer.active = false;
    // the resume delay starts here — at release, not at the start of the
    // gesture — otherwise a drag longer than the delay itself would let
    // auto-rotate kick back in while the user is still interacting
    lastInteraction = performance.now();
  });

  // --- opening on click, distinguishing a tap from a drag ---
  const raycaster = new Raycaster();
  const ndc = new Vector2();
  let pressed = null;

  const onPointerDown = (e) => {
    pressed = { x: e.clientX, y: e.clientY, t: performance.now() };
  };
  const onPointerUp = (e) => {
    const start = pressed;
    pressed = null;
    if (!start || !params.openOnClick || !hingeActive) return;
    // a drag rotates the scene and shouldn't open the book
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8) return;
    if (performance.now() - start.t > 500) return;

    if (hitTest(e.clientX, e.clientY)) toggleOpen();
  };
  function hitTest(clientX, clientY) {
    if (disposed) return false;
    const rect = renderer.domElement.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return false;
    ndc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    book.updateMatrixWorld(true);
    raycaster.setFromCamera(ndc, camera);
    const targets = [pagesMesh, jacketMesh, firstPage, leftPagesMesh, pageLayer?.object].filter(mesh => mesh?.visible);
    // The shader moves the front board; its CPU raycast is only reliable shut.
    if (!params.readingMode || openCurrent < .05) targets.push(coverMesh);
    return raycaster.intersectObjects(targets, true).length > 0;
  }
  container.addEventListener('pointerdown', onPointerDown);
  container.addEventListener('pointerup', onPointerUp);

  // --- render loop, paused while the canvas isn't visible ---
  let needsRender = true;
  let raf = 0;
  const clock = { t: performance.now() };
  const canRender = () => !disposed && externallyActive && inViewport && !document.hidden;
  function schedule() {
    if (!canRender() || raf) return;
    clock.t = performance.now();
    raf = requestAnimationFrame(tick);
  }
  function syncActivity() {
    if (!canRender()) {
      cancelAnimationFrame(raf);
      raf = 0;
      return;
    }
    needsRender = true;
    schedule();
  }
  function invalidate() {
    if (disposed) return;
    needsRender = true;
    schedule();
  }
  function setActive(active) {
    if (disposed) return;
    externallyActive = Boolean(active);
    syncActivity();
  }
  const onVisibilityChange = () => syncActivity();
  document.addEventListener('visibilitychange', onVisibilityChange);

  function tick(now) {
    raf = 0;
    if (!canRender()) return;
    const dt = Math.min(0.05, (now - clock.t) / 1000);
    clock.t = now;

    if (!exportMode) {
      const damp = 1 - Math.exp(-dt * 6);
      pointer.x += (pointer.tx - pointer.x) * damp;
      pointer.y += (pointer.ty - pointer.y) * damp;

      let ry = 0;
      let rx = 0;
      if (params.pointerParallax && !pointer.active) {
        ry += pointer.x * 0.16;
        rx += pointer.y * 0.07;
      }
      if (params.idleSway && !pointer.active) {
        ry += Math.sin(now / 3400) * 0.035;
        rx += Math.sin(now / 5200) * 0.012;
      }
      if (!params.readingMode || !readingTransition) {
        if (Math.abs(book.rotation.y - ry) > 1e-5 || Math.abs(book.rotation.x - rx) > 1e-5) needsRender = true;
        book.rotation.y = ry;
        book.rotation.x = rx;
      }

      if (hingeActive) {
        const ease = params.openSpeed === Infinity ? 1 : 1 - Math.exp(-dt * (params.openSpeed ?? 5.5));
        const next = openCurrent + (openTarget - openCurrent) * ease;
        if (openCurrent !== openTarget) {
          openCurrent = Math.abs(next - openTarget) < 1e-4 ? openTarget : next;
          hinge.bookOpenAngle.value = openCurrent * ((params.openAngle ?? 125) * Math.PI) / 180;
          needsRender = true;
        }
      }

      if (pageLayer?.advance(dt)) needsRender = true;
      if (params.readingMode && readingTransition) {
        poseReadingBook();
        if (openCurrent === openTarget) {
          if (openTarget === 0) {
            readingTransition = false;
            controls.enabled = true;
            book.position.y = params.height * .5 * MM;
            frameCamera('initial');
          }
          if (notifiedOpen !== openTarget) { notifiedOpen = openTarget; params.onStateChange?.(); }
        }
      }

      // controls.autoRotate is decided here, not in update(): it depends on
      // the time elapsed since the last interaction, which changes every
      // frame even if no parameter changed.
      if (params.autoRotate) {
        const resumeDelay = params.autoRotateResumeDelay ?? 4;
        const shouldRotate = (now - lastInteraction) / 1000 >= resumeDelay;
        if (controls.autoRotate !== shouldRotate) controls.autoRotate = shouldRotate;
      } else if (controls.autoRotate) {
        controls.autoRotate = false;
      }

      if (controls.enabled && (controls.enableDamping || controls.autoRotate)) {
        if (controls.update()) needsRender = true;
      }
    }
    if (needsRender) {
      needsRender = false;
      renderer.render(scene, camera);
    }
    schedule();
  }

  const resize = () => {
    if (disposed) return;
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    invalidate();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(container);

  const io = new IntersectionObserver(
    ([entry]) => { inViewport = entry.isIntersecting; syncActivity(); },
    { rootMargin: '120px' }
  );
  io.observe(container);

  try {
    resize();
    rebuild();
  } catch (error) {
    dispose();
    throw error;
  }

  // images passed in at creation: loaded without blocking the first render
  if (options.images) {
    for (const [slot, src] of Object.entries(options.images)) {
      if (src) setImage(slot, src);
    }
  }

  /** Applies a batch of parameters; rebuilds only if needed. */
  function update(patch = {}) {
    if (disposed) return;
    const heavyKeys = [
      'height', 'width', 'spine', 'binding', 'spineRound', 'square', 'board',
      'grooveDepth', 'coverThickness', 'coverSurface', 'coverColor', 'inkColor',
      'endpaperColor', 'pageColor', 'pageThickness', 'grain', 'textureDensity',
      'surfaceSeed', 'design', 'headband', 'showText', 'embossMode', 'embossDepth',
      'embossSource', 'embossInkless', 'embossBevel', 'embossSoftness',
      'spineClothWidth', 'spineClothSurface', 'spineClothColor',
      'jacket', 'jacketSurface', 'jacketGap',
      'jacketThickness', 'flapWidth', 'openable', 'jacketFlapArt',
    ];
    let heavy = false;
    for (const [k, v] of Object.entries(patch)) {
      if (k === 'design') {
        Object.assign(params.design, v);
        heavy = true;
        continue;
      }
      if (params[k] === v) continue;
      params[k] = v;
      if (heavyKeys.includes(k)) heavy = true;
    }

    renderer.toneMapping = TONE[params.toneMapping] ?? NeutralToneMapping;
    renderer.toneMappingExposure = params.exposure;
    scene.environmentIntensity = params.envIntensity;
    key.intensity = params.keyIntensity;
    fill.intensity = params.fillIntensity;
    rim.intensity = params.rimIntensity;
    ground.material.opacity = params.shadowOpacity;
    // controls.autoRotate is NOT set here: the render loop decides it every
    // frame, based on the delay since the last interaction (see tick()
    // below) — setting it here too would force it to true on every update(),
    // overriding the pause after a user drag/zoom.
    controls.autoRotateSpeed = params.autoRotateSpeed;
    camera.fov = params.fov;

    if (heavy) rebuild();
    else {
      frameCamera('keep');
      camera.updateProjectionMatrix();
      invalidate();
    }
  }

  /**
   * Sets (or clears) a cover image.
   * @param {'front'|'back'|'spine'} slot
   * @param {HTMLImageElement|string|null} image  an image element, or a URL
   */
  async function setImage(slot, image) {
    if (disposed || !Object.hasOwn(images, slot)) return;
    const version = (imageVersions.get(slot) ?? 0) + 1;
    imageVersions.set(slot, version);
    const loaded = typeof image === 'string' ? await loadImage(image) : (image ?? null);
    if (disposed || imageVersions.get(slot) !== version) return;
    images[slot] = loaded;
    rebuild();
  }

  function resetCamera() {
    if (disposed) return;
    frameCamera('initial');
    invalidate();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    externallyActive = false;
    imageVersions.clear();
    cancelAnimationFrame(raf);
    raf = 0;
    document.removeEventListener('visibilitychange', onVisibilityChange);
    ro.disconnect();
    io.disconnect();
    container.removeEventListener('pointermove', onPointerMove);
    container.removeEventListener('pointerleave', onPointerLeave);
    container.removeEventListener('pointerdown', onPointerDown);
    container.removeEventListener('pointerup', onPointerUp);
    controls.dispose();
    if (pageLayer) { book.remove(pageLayer.object); pageLayer.dispose(); pageLayer = null; }
    disposeBook();
    ground.geometry.dispose();
    ground.material.dispose();
    key.shadow.dispose();
    envRT.dispose();
    pmrem.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
  }

  function setOpen(open) {
    if (disposed || !hingeActive) return;
    if (params.readingMode) {
      if (open && !readingTransition) {
        closedPosition.copy(camera.position);
        closedTarget.copy(controls.target);
        readingTarget.set(spec.meta.hingeX * MM, (params.spine * .5 + 1.5) * MM, 0);
        const distance = lastFitDistance * 1.03;
        readingPosition.copy(readingTarget).add(new Vector3(distance * .035, distance * .88, distance * .475));
      }
      controls.enabled = false;
      controls.enableDamping = false;
      readingTransition = true;
      if (!open) pageLayer?.reset();
    }
    openTarget = open ? 1 : 0;
    params.onStateChange?.();
    invalidate();
  }
  let notifiedOpen = 0;
  const toggleOpen = () => setOpen(openTarget < 0.5);

  /**
   * Freezes idle sway, pointer parallax and auto-rotate so external code
   * (export.js's turntable capture) can set `book.rotation`/`camera`
   * directly and know the render loop won't fight it on the next frame.
   * Call `endExport()` to hand control back.
   */
  function beginExport() {
    if (disposed) return;
    exportMode = true;
    controls.enabled = false;
  }
  function endExport() {
    if (disposed) return;
    exportMode = false;
    controls.enabled = true;
    lastInteraction = performance.now();
    invalidate();
  }

  return {
    params, update, setImage, resetCamera, dispose, invalidate, setActive, attachPageLayer, hitTest,
    rebuild, setOpen, toggleOpen, beginExport, endExport,
    get isOpen() { return openTarget > 0.5; },
    get canOpen() { return hingeActive; },
    get openProgress() { return openCurrent; },
    get isTurning() { return openCurrent !== openTarget; },
    get pageBounds() { return pagesMesh.geometry.boundingBox.clone(); },
    get pageHingeX() { return spec.meta.hingeX; },
    get spec() { return spec; },
    get atlasCanvas() { return materials?.atlas.canvas ?? null; },
    renderer, scene, camera, controls, book,
  };
}
