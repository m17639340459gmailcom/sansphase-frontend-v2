/* quick_flipbook 1.1.3 (BSD-2-Clause) + three.modifiers 2.5.7 (BSD-3-Clause). See adjacent LICENSE and UPSTREAM.md. */

// previews/hero-upgrade/vendor/quick-flipbook/src/FlipBook.ts
import * as THREE2 from "three";

// previews/hero-upgrade/vendor/quick-flipbook/src/FlipPage.ts
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// previews/hero-upgrade/vendor/quick-flipbook/third-party/three-modifiers/src/math/Vector3.ts
var Vector3 = class _Vector3 {
  x;
  y;
  z;
  static ZERO = new _Vector3(0, 0, 0);
  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }
  /**
   *  Member functions
   */
  clone() {
    return new _Vector3(this.x, this.y, this.z);
  }
  equals(v) {
    return this.x == v.x && this.y == v.y && this.z == v.z;
  }
  zero() {
    this.x = this.y = this.z = 0;
  }
  negate() {
    return new _Vector3(-this.x, -this.y, -this.z);
  }
  add(v) {
    return new _Vector3(this.x + v.x, this.y + v.y, this.z + v.z);
  }
  subtract(v) {
    return new _Vector3(this.x - v.x, this.y - v.y, this.z - v.z);
  }
  multiplyScalar(s) {
    return new _Vector3(this.x * s, this.y * s, this.z * s);
  }
  multiply(v) {
    return new _Vector3(this.x * v.x, this.y * v.y, this.z * v.z);
  }
  divide(s) {
    let os = 1 / s;
    return new _Vector3(this.x * os, this.y * os, this.z * os);
  }
  normalize() {
    let m = this.x * this.x + this.y * this.y + this.z * this.z;
    if (m > 0) {
      let n = 1 / Math.sqrt(m);
      this.x *= n;
      this.y *= n;
      this.z *= n;
    }
  }
  get magnitude() {
    return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
  }
  set magnitude(m) {
    this.normalize();
    this.x *= m;
    this.y *= m;
    this.z *= m;
  }
  fromBufferAttribute(attribute, index) {
    this.x = attribute.getX(index);
    this.y = attribute.getY(index);
    this.z = attribute.getZ(index);
    return this;
  }
  toString() {
    return "[" + this.x + " , " + this.y + " , " + this.z + "]";
  }
  /**
   *  Static functions
   */
  static sum(a, b) {
    return a.add(b);
  }
  static dot(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
  }
  static cross(a, b) {
    return new _Vector3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
  }
  static distance(a, b) {
    let dx = a.x - b.x;
    let dy = a.y - b.y;
    let dz = a.z - b.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
};

// previews/hero-upgrade/vendor/quick-flipbook/third-party/three-modifiers/src/util/ModConstant.ts
var ModConstant = class {
  static NONE = 0;
  static X = 1;
  static Y = 2;
  static Z = 4;
  static LEFT = -1;
  static RIGHT = 1;
};

// previews/hero-upgrade/vendor/quick-flipbook/third-party/three-modifiers/src/core/VertexProxy.ts
var VertexProxy = class {
  _ratioX;
  _ratioY;
  _ratioZ;
  ox;
  oy;
  oz;
  id = "";
  constructor() {
  }
  setVertex(vertex) {
  }
  setRatios(rx, ry, rz) {
    this._ratioX = rx;
    this._ratioY = ry;
    this._ratioZ = rz;
  }
  setOriginalPosition(ox, oy, oz) {
    this.ox = ox;
    this.oy = oy;
    this.oz = oz;
  }
  get x() {
    return 0;
  }
  get y() {
    return 0;
  }
  get z() {
    return 0;
  }
  set x(v) {
  }
  set y(v) {
  }
  set z(v) {
  }
  getValue(axis) {
    switch (axis) {
      case ModConstant.X:
        return this.x;
      case ModConstant.Y:
        return this.y;
      case ModConstant.Z:
        return this.z;
    }
    return 0;
  }
  setValue(axis, v) {
    switch (axis) {
      case ModConstant.X:
        this.x = v;
        break;
      case ModConstant.Y:
        this.y = v;
        break;
      case ModConstant.Z:
        this.z = v;
        break;
    }
  }
  get ratioX() {
    return this._ratioX;
  }
  get ratioY() {
    return this._ratioY;
  }
  get ratioZ() {
    return this._ratioZ;
  }
  getRatio(axis) {
    switch (axis) {
      case ModConstant.X:
        return this._ratioX;
      case ModConstant.Y:
        return this._ratioY;
      case ModConstant.Z:
        return this._ratioZ;
    }
    return -1;
  }
  get originalX() {
    return this.ox;
  }
  get originalY() {
    return this.oy;
  }
  get originalZ() {
    return this.oz;
  }
  getOriginalValue(axis) {
    switch (axis) {
      case ModConstant.X:
        return this.ox;
      case ModConstant.Y:
        return this.oy;
      case ModConstant.Z:
        return this.oz;
    }
    return 0;
  }
  reset() {
    this.x = this.ox;
    this.y = this.oy;
    this.z = this.oz;
  }
  collapse() {
    this.ox = this.x;
    this.oy = this.y;
    this.oz = this.z;
  }
  get vector() {
    return new Vector3(this.x, this.y, this.z);
  }
  set vector(v) {
    this.x = v.x;
    this.y = v.y;
    this.z = v.z;
  }
  get ratioVector() {
    return new Vector3(this.ratioX, this.ratioY, this.ratioZ);
  }
  toString() {
    return `Vertex id:${this.id} xyz:${this.x} ${this.y} ${this.z}`;
  }
};

// previews/hero-upgrade/vendor/quick-flipbook/third-party/three-modifiers/src/three/ThreeVertex.ts
var ThreeVertex = class extends VertexProxy {
  vertor;
  only = false;
  constructor() {
    super();
  }
  setVertex(vertor) {
    this.vertor = vertor;
    this.ox = this.vertor.x;
    this.oy = this.vertor.y;
    this.oz = this.vertor.z;
  }
  get x() {
    return this.vertor.x;
  }
  get y() {
    return this.vertor.y;
  }
  get z() {
    return this.vertor.z;
  }
  set x(v) {
    this.vertor.x = v;
  }
  set y(v) {
    this.vertor.y = v;
  }
  set z(v) {
    this.vertor.z = v;
  }
  toString() {
    let str = super.toString();
    return `${str} only:${this.only}`;
  }
};

// previews/hero-upgrade/vendor/quick-flipbook/third-party/three-modifiers/src/core/MeshProxy.ts
var MeshProxy = class {
  vertices;
  faces;
  _maxX;
  _maxY;
  _maxZ;
  _minX;
  _minY;
  _minZ;
  _maxAxis;
  _midAxis;
  _minAxis;
  _width;
  _height;
  _depth;
  boundUpdate = false;
  indexUpdate = false;
  uvsAndColorUpdate = false;
  constructor() {
    this.vertices = [];
    this.faces = [];
  }
  setMesh(mesh) {
  }
  updateMeshPosition(p) {
  }
  getVertices() {
    return this.vertices;
  }
  getFaces() {
    return this.faces;
  }
  analyzeGeometry() {
    let vertices = this.getVertices().length;
    let v;
    for (let i = 0; i < vertices; i++) {
      v = this.getVertices()[i];
      if (i == 0) {
        this._minX = this._maxX = v.x;
        this._minY = this._maxY = v.y;
        this._minZ = this._maxZ = v.z;
      } else {
        this._minX = Math.min(this._minX, v.x);
        this._minY = Math.min(this._minY, v.y);
        this._minZ = Math.min(this._minZ, v.z);
        this._maxX = Math.max(this._maxX, v.x);
        this._maxY = Math.max(this._maxY, v.y);
        this._maxZ = Math.max(this._maxZ, v.z);
      }
      v.setOriginalPosition(v.x, v.y, v.z);
    }
    this._width = this._maxX - this._minX;
    this._height = this._maxY - this._minY;
    this._depth = this._maxZ - this._minZ;
    let maxe = Math.max(this._width, Math.max(this._height, this._depth));
    let mine = Math.min(this._width, Math.min(this._height, this._depth));
    if (maxe == this._width && mine == this._height) {
      this._minAxis = ModConstant.Y;
      this._midAxis = ModConstant.Z;
      this._maxAxis = ModConstant.X;
    } else if (maxe == this._width && mine == this._depth) {
      this._minAxis = ModConstant.Z;
      this._midAxis = ModConstant.Y;
      this._maxAxis = ModConstant.X;
    } else if (maxe == this._height && mine == this._width) {
      this._minAxis = ModConstant.X;
      this._midAxis = ModConstant.Z;
      this._maxAxis = ModConstant.Y;
    } else if (maxe == this._height && mine == this._depth) {
      this._minAxis = ModConstant.Z;
      this._midAxis = ModConstant.X;
      this._maxAxis = ModConstant.Y;
    } else if (maxe == this._depth && mine == this._width) {
      this._minAxis = ModConstant.X;
      this._midAxis = ModConstant.Y;
      this._maxAxis = ModConstant.Z;
    } else if (maxe == this._depth && mine == this._height) {
      this._minAxis = ModConstant.Y;
      this._midAxis = ModConstant.X;
      this._maxAxis = ModConstant.Z;
    }
    for (let i = 0; i < vertices; i++) {
      v = this.getVertices()[i];
      v.setRatios(
        (v.x - this._minX) / this._width,
        (v.y - this._minY) / this._height,
        (v.z - this._minZ) / this._depth
      );
    }
  }
  resetGeometry() {
    let vertices = this.getVertices().length;
    for (let i = 0; i < vertices; i++) {
      let v = this.getVertices()[i];
      v.reset();
    }
  }
  collapseGeometry() {
    let vertices = this.getVertices().length;
    for (let i = 0; i < vertices; i++) {
      let v = this.getVertices()[i];
      v.collapse();
    }
    this.analyzeGeometry();
  }
  get minX() {
    return this._minX;
  }
  get minY() {
    return this._minY;
  }
  get minZ() {
    return this._minZ;
  }
  getMin(axis) {
    switch (axis) {
      case ModConstant.X:
        return this._minX;
      case ModConstant.Y:
        return this._minY;
      case ModConstant.Z:
        return this._minZ;
    }
    return -1;
  }
  get maxX() {
    return this._maxX;
  }
  get maxY() {
    return this._maxY;
  }
  get maxZ() {
    return this._maxZ;
  }
  getMax(axis) {
    switch (axis) {
      case ModConstant.X:
        return this._maxX;
      case ModConstant.Y:
        return this._maxY;
      case ModConstant.Z:
        return this._maxZ;
    }
    return -1;
  }
  get maxAxis() {
    return this._maxAxis;
  }
  get midAxis() {
    return this._midAxis;
  }
  get minAxis() {
    return this._minAxis;
  }
  getSize(axis) {
    switch (axis) {
      case ModConstant.X:
        return this._width;
      case ModConstant.Y:
        return this._height;
      case ModConstant.Z:
        return this._depth;
    }
    return -1;
  }
  get width() {
    return this._width;
  }
  get height() {
    return this._height;
  }
  get depth() {
    return this._depth;
  }
  postApply() {
  }
  destroy() {
    this.vertices.length = 0;
    this.faces.length = 0;
  }
};

// previews/hero-upgrade/vendor/quick-flipbook/third-party/three-modifiers/src/core/FaceProxy.ts
var FaceProxy = class {
  _vertices;
  constructor() {
    this._vertices = [];
  }
  get a() {
    return this._vertices[0];
  }
  get b() {
    return this._vertices[1];
  }
  get c() {
    return this._vertices[2];
  }
  set a(val) {
    this._vertices[0] = val;
  }
  set b(val) {
    this._vertices[1] = val;
  }
  set c(val) {
    this._vertices[2] = val;
  }
  addVertex(v) {
    this._vertices.push(v);
  }
  addVertices(...rest) {
    for (let i = 0; i < rest.length; i++) {
      this.addVertex(rest[i]);
    }
  }
  addABC(...rest) {
    for (let i = 0; i < rest.length; i++) {
      this.addVertex(rest[i]);
    }
  }
  get vertices() {
    return this._vertices;
  }
  toString() {
    let str = "";
    for (let i = 0; i < this._vertices.length; i++) {
      str += i + ":" + this._vertices[i] + " ";
    }
    return str;
  }
};

// previews/hero-upgrade/vendor/quick-flipbook/third-party/three-modifiers/src/math/TMath.ts
var TMath = class _TMath {
  static PI = 3.1415;
  static normalize(start, end, val) {
    let range = end - start;
    let normal;
    if (range == 0) {
      normal = 1;
    } else {
      normal = _TMath.trim(0, 1, (val - start) / end);
    }
    return normal;
  }
  static toRange(start, end, normalized) {
    let range = end - start;
    let val;
    if (range == 0) {
      val = 0;
    } else {
      val = start + (end - start) * normalized;
    }
    return val;
  }
  static inInRange(start, end, value, excluding = false) {
    if (excluding) return value >= start && value <= end;
    else return value > start && value < end;
  }
  static sign(val, ifZero = 0) {
    if (val == 0) return ifZero;
    else return val > 0 ? 1 : -1;
  }
  static trim(start, end, value) {
    return Math.min(end, Math.max(start, value));
  }
  static wrap(start, end, value) {
    if (value < start) return value + (end - start);
    else if (value >= end) return value - (end - start);
    else return value;
  }
  static degToRad(deg) {
    return deg / 180 * Math.PI;
  }
  static radToDeg(rad) {
    return rad / Math.PI * 180;
  }
  static presicion(number, precision) {
    let r = Math.pow(10, precision);
    return Math.round(number * r) / r;
  }
  static uceil(val) {
    return val < 0 ? Math.floor(val) : Math.ceil(val);
  }
  static mappedKey(v) {
    let precisionPoints = 4;
    let precision = Math.pow(10, precisionPoints);
    let key = Math.round(v.x * precision) + "_" + Math.round(v.y * precision) + "_" + Math.round(v.z * precision);
    return key;
  }
};

// previews/hero-upgrade/vendor/quick-flipbook/third-party/three-modifiers/src/util/TMap.ts
var Item = class {
  value;
  to;
  from = [];
  push(v) {
    this.from.push(v);
  }
};
var TMap = class {
  _map;
  constructor() {
    this._map = {};
  }
  add(to, from, value) {
    let key = `t_${to}`;
    if (!this._map[key]) this._map[key] = new Item();
    this._map[key].push(from);
    this._map[key].to = to;
    this._map[key].value = value;
  }
  getToByValue(value) {
    let item = this.getItemByValue(value);
    return item ? item.to : -1;
  }
  getFromByTo(to) {
    let item = this.getItemByTo(to);
    return item ? item.from : null;
  }
  includeByValue(value) {
    let item = this.getItemByValue(value);
    return !!item;
  }
  getItemByValue(value) {
    for (let key in this._map) {
      let item = this._map[key];
      if (item.value === value) return item;
    }
    return null;
  }
  getItemByTo(to) {
    let key = `t_${to}`;
    return this._map[key];
  }
  destroy() {
    for (let key in this._map) {
      delete this._map[key];
    }
  }
};

// previews/hero-upgrade/vendor/quick-flipbook/third-party/three-modifiers/src/three/ThreeMesh.ts
var ThreeMesh = class extends MeshProxy {
  mesh;
  verticesMap = new TMap();
  uvsAndColorUpdate = false;
  setMesh(mesh) {
    this.mesh = mesh;
    this.setVertices();
    this.setFaces();
    this.mergeVertices();
    this.mergeFaces();
  }
  setVertices() {
    let position = this.getAttr("position");
    for (let i = 0; i < position.count; i++) {
      let vector = new ThreeVertex();
      let vec = new Vector3().fromBufferAttribute(position, i);
      vector.setVertex(vec);
      this.vertices.push(vector);
    }
  }
  setFaces() {
    let index = this.getAttr("index");
    let position = this.getAttr("position");
    if (index !== null) {
      for (let i = 0; i < index.count; i += 3) {
        let face = new FaceProxy();
        let a = index.getX(i);
        let b = index.getX(i + 1);
        let c = index.getX(i + 2);
        let v0 = this.vertices[a];
        let v1 = this.vertices[b];
        let v2 = this.vertices[c];
        face.addVertices(v0, v1, v2);
        this.faces.push(face);
      }
    } else {
      for (let i = 0; i < position.count; i += 3) {
        let face = new FaceProxy();
        let a = i;
        let b = i + 1;
        let c = i + 2;
        let v0 = this.vertices[a];
        let v1 = this.vertices[b];
        let v2 = this.vertices[c];
        face.addVertices(v0, v1, v2);
        this.faces.push(face);
      }
    }
  }
  mergeVertices() {
    let unique = [];
    let tmap = this.verticesMap;
    for (let i = 0; i < this.vertices.length; i++) {
      let v = this.vertices[i];
      let xyz = TMath.mappedKey(v);
      if (!tmap.includeByValue(xyz)) {
        let index = unique.length;
        v.only = true;
        unique.push(v);
        tmap.add(index, i, xyz);
      } else {
        let index = tmap.getToByValue(xyz);
        tmap.add(index, i, xyz);
      }
    }
    this.vertices = unique;
  }
  mergeFaces() {
    let faceIndicesToRemove = [];
    for (let i = 0, il = this.faces.length; i < il; i++) {
      let face = this.faces[i];
      let a = TMath.mappedKey(face.a);
      let b = TMath.mappedKey(face.b);
      let c = TMath.mappedKey(face.c);
      let index1 = this.verticesMap.getToByValue(a);
      let index2 = this.verticesMap.getToByValue(b);
      let index3 = this.verticesMap.getToByValue(c);
      face.a = this.vertices[index1];
      face.b = this.vertices[index2];
      face.c = this.vertices[index3];
      let indices = [index1, index2, index3];
      for (let n = 0; n < 3; n++) {
        if (indices[n] === indices[(n + 1) % 3]) {
          faceIndicesToRemove.push(i);
          break;
        }
      }
    }
    for (let i = faceIndicesToRemove.length - 1; i >= 0; i--) {
      let idx = faceIndicesToRemove[i];
      this.faces.splice(idx, 1);
    }
  }
  postApply() {
    this.updatePosition();
    this.updateIndex();
    this.computeBounding();
    this.updateUvsAndColor();
  }
  updateUvsAndColor() {
    if (this.uvsAndColorUpdate) {
      let color = this.getAttr("color");
      if (color) color.needsUpdate = true;
      let uv = this.getAttr("uv");
      if (uv) uv.needsUpdate = true;
    }
  }
  computeBounding() {
    if (this.boundUpdate) {
      let geometry = this.mesh.geometry;
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
    }
  }
  updatePosition() {
    let position = this.getAttr("position");
    let length = this.vertices.length;
    let fromIds;
    let v;
    let i, j, index;
    for (i = 0; i < length; i++) {
      v = this.vertices[i];
      fromIds = this.verticesMap.getFromByTo(i);
      for (j = 0; j < fromIds.length; j++) {
        index = fromIds[j];
        position.setX(index, v.x);
        position.setY(index, v.y);
        position.setZ(index, v.z);
      }
    }
    position.needsUpdate = true;
  }
  updateIndex() {
    if (this.indexUpdate) {
      let index = this.getAttr("index");
      if (index) index.needsUpdate = true;
    }
  }
  getAttr(attr) {
    let geometry = this.mesh.geometry;
    if (attr === "index") return geometry.getIndex();
    return geometry.getAttribute(attr);
  }
  updateMeshPosition(p) {
    this.mesh.position.x += p.x;
    this.mesh.position.y += p.y;
    this.mesh.position.z += p.z;
  }
  destroy() {
    super.destroy();
    this.verticesMap.destroy();
    this.verticesMap = null;
    this.mesh = null;
  }
};

// previews/hero-upgrade/vendor/quick-flipbook/third-party/three-modifiers/src/ModifierStack.ts
var ModifierStack = class {
  baseMesh;
  stack;
  constructor(mesh) {
    this.baseMesh = new ThreeMesh();
    this.baseMesh.setMesh(mesh);
    this.baseMesh.analyzeGeometry();
    this.stack = [];
  }
  set indexUpdate(update) {
    this.baseMesh.indexUpdate = update;
  }
  set boundUpdate(update) {
    this.baseMesh.boundUpdate = update;
  }
  set uvsAndColorUpdate(update) {
    this.baseMesh.uvsAndColorUpdate = update;
  }
  addModifier(mod) {
    mod.setModifiable(this.baseMesh);
    this.stack.push(mod);
  }
  removeModifier(mod) {
    let index = this.stack.indexOf(mod);
    if (index > -1) {
      this.stack.splice(index, 1);
    }
  }
  apply() {
    this.baseMesh.resetGeometry();
    for (let i = 0; i < this.stack.length; i++) {
      this.stack[i].apply();
    }
    this.baseMesh.postApply();
  }
  collapse() {
    this.apply();
    this.baseMesh.collapseGeometry();
    this.stack.length = 0;
  }
  reset() {
    this.baseMesh.resetGeometry();
  }
  clear() {
    this.stack.length = 0;
  }
  destroy() {
    this.baseMesh.destroy();
    for (let i = 0; i < this.stack.length; i++) {
      this.stack[i].destroy();
    }
    this.clear();
  }
};

// previews/hero-upgrade/vendor/quick-flipbook/third-party/three-modifiers/src/math/Vector2.ts
var Vector2 = class _Vector2 {
  x;
  y;
  static ZERO = new _Vector2(0, 0);
  constructor(x, y) {
    this.x = x;
    this.y = y;
  }
  clone() {
    return new _Vector2(this.x, this.y);
  }
  equals(v) {
    return this.x == v.x && this.y == v.y;
  }
  zero() {
    this.x = this.y;
  }
  negate() {
    return new _Vector2(-this.x, -this.y);
  }
  add(v) {
    return new _Vector2(this.x + v.x, this.y + v.y);
  }
  subtract(v) {
    return new _Vector2(this.x - v.x, this.y - v.y);
  }
  multiplyScalar(s) {
    return new _Vector2(this.x * s, this.y * s);
  }
  multiply(v) {
    return new _Vector2(this.x * v.x, this.y * v.y);
  }
  divide(s) {
    let os = 1 / s;
    return new _Vector2(this.x * os, this.y * os);
  }
  normalize() {
    let m = this.x * this.x + this.y * this.y;
    if (m > 0) {
      let n = 1 / Math.sqrt(m);
      this.x *= n;
      this.y *= n;
    }
  }
  get magnitude() {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }
  set magnitude(m) {
    this.normalize();
    this.x *= m;
    this.y *= m;
  }
  toString() {
    return "[" + this.x + " , " + this.y + "]";
  }
  static sum(a, b) {
    return a.add(b);
  }
  static dot(a, b) {
    return a.x * b.x + a.y * b.y;
  }
  static distance(a, b) {
    let dx = a.x - b.x;
    let dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
};

// previews/hero-upgrade/vendor/quick-flipbook/third-party/three-modifiers/src/core/Modifier.ts
var Modifier = class {
  mod;
  setModifiable(mod) {
    this.mod = mod;
  }
  getVertices() {
    return this.mod.getVertices();
  }
  destroy() {
    this.mod = null;
  }
};

// previews/hero-upgrade/vendor/quick-flipbook/third-party/three-modifiers/src/math/Matrix.ts
var Matrix = class _Matrix {
  constructor(m11, m12, m21, m22) {
    this.m = [m11, m12, m21, m22];
  }
  m;
  dispose() {
    this.m.length = 0;
    return this;
  }
  reset() {
    this.m[0] = 1;
    this.m[1] = 0;
    this.m[2] = 0;
    this.m[3] = 1;
    return this;
  }
  rotate(angle) {
    let c = Math.cos(angle);
    let s = Math.sin(angle);
    this.m[0] = c;
    this.m[1] = -s;
    this.m[2] = s;
    this.m[3] = c;
    return this;
  }
  scale(sx, sy) {
    this.m[0] = 1;
    this.m[1] = 0;
    this.m[2] = 0;
    this.m[3] = 1;
    if (sx !== void 0) {
      this.m[0] = sx;
      this.m[3] = sx;
    }
    if (sy !== void 0) {
      this.m[3] = sy;
    }
    return this;
  }
  multiply(b) {
    return _Matrix.mult(this, b);
  }
  transformPoint(p) {
    let xy = _Matrix.transform(this, [p.x, p.y]);
    return new Vector2(xy[0], xy[1]);
  }
  transformPointSelf(p) {
    let xy = _Matrix.transform(this, [p.x, p.y]);
    p.x = xy[0];
    p.y = xy[1];
    return p;
  }
  clone() {
    let m = this.m;
    return new _Matrix(m[0], m[1], m[2], m[3]);
  }
  static transform(m2, xy) {
    let m = m2.m, x = xy[0], y = xy[1];
    xy[0] = m[0] * x + m[1] * y;
    xy[1] = m[2] * x + m[3] * y;
    return xy;
  }
  static mult(m1, m2) {
    let a = m1.m, b = m2.m, a0 = a[0], a1 = a[1], a2 = a[2], a3 = a[3];
    a[0] = a0 * b[0] + a1 * b[2];
    a[1] = a0 * b[1] + a1 * b[3];
    a[2] = a2 * b[0] + a3 * b[2];
    a[3] = a2 * b[1] + a3 * b[3];
    return m1;
  }
};

// previews/hero-upgrade/vendor/quick-flipbook/third-party/three-modifiers/src/modifiers/Bend.ts
var Bend = class extends Modifier {
  _force;
  _offset;
  _angle;
  _diagAngle;
  _constraint = ModConstant.NONE;
  max;
  min;
  mid;
  width;
  height;
  origin;
  m1;
  m2;
  switchAxes = false;
  constructor(f = 0, o = 0.5, a = 0) {
    super();
    this._force = f;
    this._offset = o;
    this.angle = a;
  }
  setModifiable(mod) {
    super.setModifiable(mod);
    this.max = this.switchAxes ? mod.midAxis : mod.maxAxis;
    this.min = mod.minAxis;
    this.mid = this.switchAxes ? mod.maxAxis : mod.midAxis;
    this.width = mod.getSize(this.max);
    this.height = mod.getSize(this.mid);
    this.origin = mod.getMin(this.max);
    this._diagAngle = Math.atan(this.width / this.height);
  }
  set force(f) {
    this._force = f;
  }
  get force() {
    return this._force;
  }
  set constraint(c) {
    this._constraint = c;
  }
  get constraint() {
    return this._constraint;
  }
  get offset() {
    return this._offset;
  }
  set offset(offset) {
    this._offset = offset;
  }
  get diagAngle() {
    return this._diagAngle;
  }
  get angle() {
    return this._angle;
  }
  set angle(a) {
    this._angle = a;
    this.m1 = new Matrix(1, 0, 0, 1);
    this.m1.rotate(this._angle);
    this.m2 = new Matrix(1, 0, 0, 1);
    this.m2.rotate(-this._angle);
  }
  apply() {
    if (this.force == 0) return;
    let vs = this.mod.getVertices();
    let vc = vs.length;
    let distance = this.origin + this.width * this.offset;
    let radius = this.width / Math.PI / this.force;
    let bendAngle = Math.PI * 2 * (this.width / (radius * Math.PI * 2));
    for (let i = 0; i < vc; i++) {
      let v = vs[i];
      let vmax = v.getValue(this.max);
      let vmid = v.getValue(this.mid);
      let vmin = v.getValue(this.min);
      let np = this.m1.transformPoint(new Vector2(vmax, vmid));
      vmax = np.x;
      vmid = np.y;
      let p = (vmax - this.origin) / this.width;
      if (this.constraint == ModConstant.LEFT && p <= this.offset || this.constraint == ModConstant.RIGHT && p >= this.offset) {
      } else {
        let fa = Math.PI / 2 - bendAngle * this.offset + bendAngle * p;
        let op = Math.sin(fa) * (radius + vmin);
        let ow = Math.cos(fa) * (radius + vmin);
        vmin = op - radius;
        vmax = distance - ow;
      }
      let np2 = this.m2.transformPoint(new Vector2(vmax, vmid));
      vmax = np2.x;
      vmid = np2.y;
      v.setValue(this.max, vmax);
      v.setValue(this.mid, vmid);
      v.setValue(this.min, vmin);
    }
  }
};

// previews/hero-upgrade/vendor/quick-flipbook/third-party/three-modifiers/src/math/Matrix4.ts
var Matrix4 = class _Matrix4 {
  n11;
  n12;
  n13;
  n14;
  n21;
  n22;
  n23;
  n24;
  n31;
  n32;
  n33;
  n34;
  n41;
  n42;
  n43;
  n44;
  constructor(pn11 = 1, pn12 = 0, pn13 = 0, pn14 = 0, pn21 = 0, pn22 = 1, pn23 = 0, pn24 = 0, pn31 = 0, pn32 = 0, pn33 = 1, pn34 = 0, pn41 = 0, pn42 = 0, pn43 = 0, pn44 = 1) {
    this.n11 = pn11;
    this.n12 = pn12;
    this.n13 = pn13;
    this.n14 = pn14;
    this.n21 = pn21;
    this.n22 = pn22;
    this.n23 = pn23;
    this.n24 = pn24;
    this.n31 = pn31;
    this.n32 = pn32;
    this.n33 = pn33;
    this.n34 = pn34;
    this.n41 = pn41;
    this.n42 = pn42;
    this.n43 = pn43;
    this.n44 = pn44;
  }
  static translationMatrix(x, y, z) {
    let m = new _Matrix4();
    m.n14 = x;
    m.n24 = y;
    m.n34 = z;
    return m;
  }
  static scaleMatrix(x, y, z) {
    let m = new _Matrix4();
    m.n11 = x;
    m.n22 = y;
    m.n33 = z;
    return m;
  }
  static rotationMatrix(x, y, z, rad, targetmatrix = null) {
    let m;
    if (!targetmatrix) m = new _Matrix4();
    else m = targetmatrix;
    let nCos = Math.cos(rad);
    let nSin = Math.sin(rad);
    let scos = 1 - nCos;
    let sxy = x * y * scos;
    let syz = y * z * scos;
    let sxz = x * z * scos;
    let sz = nSin * z;
    let sy = nSin * y;
    let sx = nSin * x;
    m.n11 = nCos + x * x * scos;
    m.n12 = -sz + sxy;
    m.n13 = sy + sxz;
    m.n14 = 0;
    m.n21 = sz + sxy;
    m.n22 = nCos + y * y * scos;
    m.n23 = -sx + syz;
    m.n24 = 0;
    m.n31 = -sy + sxz;
    m.n32 = sx + syz;
    m.n33 = nCos + z * z * scos;
    m.n34 = 0;
    return m;
  }
  calculateMultiply(a, b) {
    let a11 = a.n11;
    let b11 = b.n11;
    let a21 = a.n21;
    let b21 = b.n21;
    let a31 = a.n31;
    let b31 = b.n31;
    let a12 = a.n12;
    let b12 = b.n12;
    let a22 = a.n22;
    let b22 = b.n22;
    let a32 = a.n32;
    let b32 = b.n32;
    let a13 = a.n13;
    let b13 = b.n13;
    let a23 = a.n23;
    let b23 = b.n23;
    let a33 = a.n33;
    let b33 = b.n33;
    let a14 = a.n14;
    let b14 = b.n14;
    let a24 = a.n24;
    let b24 = b.n24;
    let a34 = a.n34;
    let b34 = b.n34;
    this.n11 = a11 * b11 + a12 * b21 + a13 * b31;
    this.n12 = a11 * b12 + a12 * b22 + a13 * b32;
    this.n13 = a11 * b13 + a12 * b23 + a13 * b33;
    this.n14 = a11 * b14 + a12 * b24 + a13 * b34 + a14;
    this.n21 = a21 * b11 + a22 * b21 + a23 * b31;
    this.n22 = a21 * b12 + a22 * b22 + a23 * b32;
    this.n23 = a21 * b13 + a22 * b23 + a23 * b33;
    this.n24 = a21 * b14 + a22 * b24 + a23 * b34 + a24;
    this.n31 = a31 * b11 + a32 * b21 + a33 * b31;
    this.n32 = a31 * b12 + a32 * b22 + a33 * b32;
    this.n33 = a31 * b13 + a32 * b23 + a33 * b33;
    this.n34 = a31 * b14 + a32 * b24 + a33 * b34 + a34;
  }
  static multiply(a, b) {
    let m = new _Matrix4();
    m.calculateMultiply(a, b);
    return m;
  }
  static multiplyVector(m, v) {
    let vx = v.x;
    let vy = v.y;
    let vz = v.z;
    v.x = vx * m.n11 + vy * m.n12 + vz * m.n13 + m.n14;
    v.y = vx * m.n21 + vy * m.n22 + vz * m.n23 + m.n24;
    v.z = vx * m.n31 + vy * m.n32 + vz * m.n33 + m.n34;
  }
};

// previews/hero-upgrade/vendor/quick-flipbook/third-party/three-modifiers/src/modifiers/Twist.ts
var Twist = class extends Modifier {
  _vector = new Vector3(0, 1, 0);
  _angle;
  center = Vector3.ZERO;
  constructor(a = 0) {
    super();
    this._angle = a;
  }
  get angle() {
    return this._angle;
  }
  set angle(value) {
    this._angle = value;
  }
  get vector() {
    return this._vector;
  }
  set vector(value) {
    this._vector = value;
  }
  apply() {
    this._vector.normalize();
    let dv = new Vector3(this.mod.maxX / 2, this.mod.maxY / 2, this.mod.maxZ / 2);
    let d = -Vector3.dot(this._vector, this.center);
    for (let i = 0; i < this.mod.getVertices().length; i++) {
      let vertex = this.mod.getVertices()[i];
      let dd = Vector3.dot(new Vector3(vertex.x, vertex.y, vertex.z), this._vector) + d;
      this.twistPoint(vertex, dd / dv.magnitude * this._angle);
    }
  }
  twistPoint(v, a) {
    let mat = Matrix4.translationMatrix(v.x, v.y, v.z);
    mat = Matrix4.multiply(Matrix4.rotationMatrix(this._vector.x, this._vector.y, this._vector.z, a), mat);
    v.x = mat.n14;
    v.y = mat.n24;
    v.z = mat.n34;
  }
};

// previews/hero-upgrade/vendor/quick-flipbook/third-party/three-modifiers/src/util/EventEmitter.ts
var EventEmitter = class {
  constructor() {
  }
  on(type, listener) {
    if (!_listeners) _listeners = {};
    if (!_listeners[type]) _listeners[type] = [];
    _listeners[type].push(listener);
    return listener;
  }
  emit(eventName, ...rest) {
    let ret = false;
    if (eventName && _listeners) {
      let arr = _listeners[eventName];
      if (!arr) return ret;
      arr = arr.slice();
      let handler, i = arr.length;
      let args = Array.prototype.slice.call(arguments);
      args.shift();
      while (i--) {
        let handler2 = arr[i];
        ret = ret || handler2.apply(null, args);
      }
    }
    return !!ret;
  }
  one(type, listener) {
    let args = Array.prototype.slice.call(arguments, 2);
    let proxyListener = () => {
      this.off(type, proxyListener);
      listener.apply(null, args);
    };
    this.on(type, proxyListener);
  }
  has(type) {
    return !!(_listeners && _listeners[type]);
  }
  off(type, listener) {
    if (!_listeners || !_listeners[type]) return;
    let arr = _listeners[type];
    for (let i = 0, l = arr.length; i < l; i++) {
      if (arr[i].toString() == listener.toString()) {
        if (l == 1) {
          delete _listeners[type];
        } else {
          arr.splice(i, 1);
        }
        break;
      }
    }
  }
  offAll(type) {
    if (!type) _listeners = null;
    else if (_listeners) delete _listeners[type];
  }
};
var _listeners;

// previews/hero-upgrade/vendor/quick-flipbook/third-party/three-modifiers/src/modifiers/UserDefined.ts
var UserDefined = class extends Modifier {
  eventEmitter;
  renderVector;
  constructor() {
    super();
    this.eventEmitter = new EventEmitter();
  }
  apply() {
    let vertices = this.mod.getVertices();
    let verticesLength = vertices.length;
    for (let i = 0; i < verticesLength; i++) {
      let v = vertices[i];
      this.renderVector && this.renderVector(v, i, verticesLength);
    }
    this.dispatchEvent("CHANGE");
  }
  addEventListener(type, listener) {
    this.eventEmitter.on(type, listener);
  }
  dispatchEvent(eventName) {
    return this.eventEmitter.emit(eventName);
  }
  hasEventListener(type) {
    return this.eventEmitter.has(type);
  }
  removeEventListener(type, listener) {
    this.eventEmitter.off(type, listener);
  }
};

// previews/hero-upgrade/vendor/quick-flipbook/src/modifier/PageCurve.ts
var PageCurve = class extends UserDefined {
  /**
   * @param elevationAxis Axis to use as elevation dimension
   * @param alongAxis Axis to use as the "plane" (perpendicular to elevation ideally)
   * @param effectRange from 0 to 1, along the "along axis" what portion wil be subjected to this effect.
   * @param effectMid from 0 to 1, at what point we stop climbing up and start going down again?
   * @param elevationHeight how "high" we elevate the vertices along the elevationAxis?
   */
  constructor(elevationAxis = ModConstant.Y, alongAxis = ModConstant.X, effectRange = 0.5, effectMid = 0.5, elevationHeight = 0.5) {
    super();
    this.elevationAxis = elevationAxis;
    this.alongAxis = alongAxis;
    this.effectRange = effectRange;
    this.effectMid = effectMid;
    this.elevationHeight = elevationHeight;
    this.renderVector = this._renderVector;
  }
  elevationAxis;
  alongAxis;
  effectRange;
  effectMid;
  elevationHeight;
  /**
   * strength of the deformation effect
   */
  intensity = 1;
  _renderVector(vec, i, l) {
    let radio = vec.getRatio(this.alongAxis);
    let val = vec.getValue(this.elevationAxis);
    if (radio <= this.effectRange) {
      radio /= this.effectRange;
      let elevation = 0;
      if (radio < this.effectMid) {
        radio = radio / this.effectMid;
        elevation = Math.sqrt(1 - Math.pow(radio, 2) + radio * 2 - 1);
      } else {
        radio = (radio - this.effectMid) / (1 - this.effectMid);
        elevation = (Math.cos(radio * Math.PI) - -1) / (1 - -1);
      }
      vec.setValue(this.elevationAxis, val + elevation * this.elevationHeight * this.intensity);
    }
  }
};

// previews/hero-upgrade/vendor/quick-flipbook/src/FlipPage.ts
var flipXUV = (geo) => {
  var uvAttribute = geo.attributes.uv;
  for (var i = 0; i < uvAttribute.count; i++) {
    var u = uvAttribute.getX(i);
    var v = uvAttribute.getY(i);
    uvAttribute.setXY(i, 1 - u, v);
  }
  return geo;
};
var NOTEXTURE = new THREE.MeshStandardMaterial({ color: "#ffffff" });
var FlipPage = class extends THREE.Mesh {
  modifiers;
  bend;
  twist;
  /**
   * The plane geometry of this page
   */
  page;
  pageCurve;
  constructor(subdivisions = 10) {
    super();
    let plane = new THREE.Mesh(
      mergeGeometries(
        [
          flipXUV(new THREE.PlaneGeometry(1, 1, subdivisions, subdivisions)),
          flipXUV(new THREE.PlaneGeometry(1, 1, subdivisions, subdivisions).rotateY(Math.PI))
        ],
        true
        // allow groups
      ),
      [
        NOTEXTURE,
        NOTEXTURE
      ]
    );
    plane.castShadow = true;
    plane.receiveShadow = true;
    plane.rotateX(Math.PI / 2);
    plane.position.x = 0.5;
    this.scale.z = -1;
    this.add(plane);
    this.page = plane;
    this.modifiers = new ModifierStack(plane);
    this.bend = new Bend(0, 0, 0);
    this.bend.constraint = ModConstant.LEFT;
    this.twist = new Twist(0);
    this.twist.vector = new Vector3(2, 0, 0);
    this.twist.center = new Vector3(-0.5, 0, 0);
    this.pageCurve = new PageCurve(
      ModConstant.Z,
      ModConstant.X,
      0.812,
      0.325,
      0.054
    );
    this.modifiers.addModifier(this.pageCurve);
    this.modifiers.addModifier(this.bend);
    this.modifiers.addModifier(this.twist);
  }
  /**
   * Sets the material for a page's face.
   * @param newMaterial New material for this page's face.
   * @param index 0 or 1
   */
  setPageMaterial(newMaterial, index) {
    this.page.material[index] = newMaterial;
  }
  /**
   * Sets the internal progress of the flip of this page. 0 = no flip. 1 = fully flipped to the otehr side.
   * @param progress a number from 0 to 1
   * @param direction either -1 or 1 to know to which side we are flipping (this is used to invert the bending of the page to the correct side on flip)
   * @param pageCurveIntensity Intensity of the page curve modifier effect
   */
  flip(progress, direction, pageCurveIntensity = 1) {
    this.rotation.z = Math.PI * progress;
    this.bend.force = Math.min(-Math.sin(this.rotation.z) / 2, -1e-4) * direction;
    this.twist.angle = Math.sin(this.rotation.z) / 10;
    this.pageCurve.intensity = (-1 + 2 * progress) * (-Math.sin(this.rotation.z) + 1) * pageCurveIntensity;
    this.modifiers.apply();
    this.page.geometry.computeVertexNormals();
    this.page.geometry.computeBoundingBox();
    this.page.geometry.computeBoundingSphere();
  }
  /**
   * call dispose on the material of this face.
   */
  disposeMaterial(faceIndex) {
    const material = this.page.material[faceIndex];
    if (material !== NOTEXTURE) {
      material.dispose();
    }
  }
  /**
   * Just sets all materials to "no texture"
   */
  reset() {
    this.setPageMaterial(NOTEXTURE, 0);
    this.setPageMaterial(NOTEXTURE, 1);
  }
  dispose(materialToo = false) {
    if (materialToo) {
      this.disposeMaterial(0);
      this.disposeMaterial(1);
    }
    this.page.geometry.dispose();
    this.modifiers.destroy();
  }
};

// previews/hero-upgrade/vendor/quick-flipbook/src/FlipBook.ts
var AOTexture = /* @__PURE__ */ (function() {
  var texture;
  return () => {
    if (!texture) {
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext("2d");
      const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
      gradient.addColorStop(0, "black");
      gradient.addColorStop(0.1, "white");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      texture = new THREE2.CanvasTexture(canvas);
      canvas.remove();
    }
    return texture;
  };
})();
var FlipBook = class extends THREE2.Mesh {
  /**
   * Sheets of paper (each FlipPage holds 2 "pages")
   */
  pages;
  pool;
  _url2Loader;
  _pageSubdivisions;
  _currentProgress;
  _goalProgress;
  _currentPage;
  _flipDuration;
  _stepSize;
  _flipDirection;
  _ySpacing;
  _autoCenter;
  _disposed = false;
  _ownedMaterials = /* @__PURE__ */ new Set();
  constructor(config) {
    super();
    this.pages = [];
    this.pool = [];
    this._url2Loader = /* @__PURE__ */ new Map();
    this._currentProgress = 0;
    this._flipDuration = config?.flipDuration || 1;
    this._ySpacing = config?.yBetweenPages || 1e-3;
    this._pageSubdivisions = config?.pageSubdivisions || 20;
    this._autoCenter = config?.autoCenter !== false;
    this.currentPage = 0;
  }
  [Symbol.iterator]() {
    let index = 0;
    return {
      next: () => {
        if (index < this.pages.length) {
          return { value: this.pages[index++], done: false };
        } else {
          return { value: null, done: true };
        }
      }
    };
  }
  /**
       * Initialize the book. Pass in the URLs to the images to use for each page.
       * The order in which they will be loaded is one page (2 images per page) at a time.
       * After one page is loaded, the next will start loading. While one page is loading the rest are in perpetual inactive state (nothing loading)

       * @param pagesSources Array with the "source" to use as the page texture, either a material or a url to load an image from.
       */
  setPages(pagesSources) {
    if (this._disposed) return;
    if (pagesSources.length % 2 !== 0) {
      pagesSources.push("");
    }
    while (this.pages.length) {
      let page = this.pages.pop();
      page.reset();
      this.pool.push(page);
      this.remove(page);
    }
    let prom = Promise.resolve();
    for (let i = 0; i < pagesSources.length; i += 2) {
      const urlA = pagesSources[i];
      const urlB = pagesSources[i + 1];
      let page = this.pool.pop();
      if (!page) {
        page = new FlipPage(this._pageSubdivisions);
      }
      this.add(page);
      page.position.y = -this._ySpacing * this.pages.length;
      this.pages.push(page);
      page.name = `Page#${this.pages.length}`;
      prom = prom.then(this.loadPages(urlA, urlB, page));
    }
    if (this.currentPage > this.pages.length * 2 - 1) {
      this._currentPage = this.pages.length * 2 - 1;
      this._currentProgress = this.pages.length;
    }
    this.flipPages();
  }
  /**
   * Returns the total number of pages.
   * **Do not confuse with the number of sheets of paper**
   */
  get totalPages() {
    return this.pages.length * 2;
  }
  /**
   * Loads the 2 faces of a page at the same time...
   */
  loadPages(sourceA, sourceB, page) {
    return () => Promise.all([
      this.loadPage(sourceA, 1, page),
      this.loadPage(sourceB, 0, page)
    ]);
  }
  /**
   * Loads a page's face. If it is a Material it just puts that, if it is a string it will try to load it using the TextureLoader
   */
  loadPage(source, side, page) {
    if (this._disposed) return Promise.resolve();
    if (!source || source === "") {
      const blankPage = new THREE2.MeshStandardMaterial({
        color: "white",
        roughness: 0.2,
        aoMapIntensity: 0.7,
        aoMap: side == 1 ? AOTexture() : null
      });
      this._ownedMaterials.add(blankPage);
      page.setPageMaterial(blankPage, side);
      return Promise.resolve();
    }
    if (source instanceof THREE2.Material) {
      page.setPageMaterial(source, side);
      return Promise.resolve();
    }
    if (source instanceof THREE2.Texture) {
      page.setPageMaterial(this.textureToMaterial(source, side), side);
      return Promise.resolve();
    }
    const url = source;
    if (!this._url2Loader.has(url)) {
      this._url2Loader.set(url, new Promise((resolve, reject) => {
        new THREE2.TextureLoader().load(
          source,
          (texture) => {
            resolve(this.textureToMaterial(texture, side));
          },
          void 0,
          (err) => {
            resolve(null);
          }
        );
      }));
    }
    return this._url2Loader.get(url).then((material) => {
      page.setPageMaterial(material, side);
    });
  }
  textureToMaterial(texture, side) {
    texture.magFilter = THREE2.LinearFilter;
    texture.minFilter = THREE2.LinearFilter;
    texture.generateMipmaps = false;
    texture.colorSpace = THREE2.SRGBColorSpace;
    const material = new THREE2.MeshStandardMaterial({
      color: "white",
      map: texture,
      roughness: 0.2,
      aoMapIntensity: 0.7,
      aoMap: side == 1 ? AOTexture() : null,
      toneMapped: false
    });
    this._ownedMaterials.add(material);
    return material;
  }
  /**
   * The current "page" (as you would read on a book, the page number...)
   */
  get currentPage() {
    return this._currentPage;
  }
  set currentPage(n) {
    if (this._disposed) return;
    let goal = Math.ceil(n / 2);
    let distance = goal - this._currentProgress;
    this._stepSize = distance / this._flipDuration;
    this._flipDirection = this._stepSize > 0 ? 1 : -1;
    this._currentPage = Math.ceil(n);
    this._goalProgress = goal;
    this.flipPages();
  }
  /**
   * Each page has a progress that goes form 0 to 1.
   * Here, the progress of a book goes form 0 to `Total Pages` (but in this case, by "page" we mean paper, a paper has 2 pages, the fornt and back page...)
   * and the decimal portion is the progress of the flip of that page.
   * If you have 3 pages, for example, to send the user to the last page's back side, you have to call .progress = 3 (which is almost equivalent to 2.9999... )
   *
   * expects a number from `0` to `book.totalPages/2`
   */
  get progress() {
    return this._currentProgress;
  }
  set progress(p) {
    if (this._disposed) return;
    let oldProgress = this._currentProgress;
    this._currentProgress = Math.max(0, Math.min(p, this.pages.length));
    this._currentPage = Math.floor(this._currentProgress * 2);
    this._stepSize = 0;
    this._flipDirection = this._currentProgress > oldProgress ? 1 : -1;
    this.flipPages();
  }
  /**
   * Call this to animate this book every frame.
   * @param delta seconds since last frame render
   */
  animate(delta) {
    if (this._disposed) return;
    if (this._stepSize != 0) {
      this._currentProgress += this._stepSize * delta;
      if (this._stepSize > 0 && this._currentProgress > this._goalProgress || this._stepSize < 0 && this._currentProgress < this._goalProgress) {
        this._currentProgress = this._goalProgress;
        this._stepSize = 0;
      }
      this.flipPages();
    }
  }
  /**
   * It will flip all the pages until this page is facing at the user.
   * @param page Page of interest
   */
  /** Host adaptation: the scheduler can sleep between page turns. */
  get isAnimating() {
    return !this._disposed && this._stepSize !== 0;
  }
  flipPage(page) {
    if (this._disposed) return;
    var pageIndex = this.pages.indexOf(page);
    if (pageIndex < 0)
      throw new ReferenceError("I don't own that page! Not mine!");
    const A = pageIndex * 2;
    const B = A + 1;
    this.currentPage = this._currentPage <= A ? B : A;
  }
  /**
   * Send the book to the next page
   */
  nextPage() {
    this.currentPage = Math.min(Math.ceil(this.currentPage / 2) + 1, this.pages.length) * 2;
  }
  /**
   * Send the book to the previous page
   */
  previousPage() {
    this.currentPage = Math.max(Math.ceil(this.currentPage / 2) - 1, 0) * 2;
  }
  /**
   * Goes one by one and calculate the progress of each FlipPage based on the progress of the book.
   */
  flipPages() {
    const totalPages = this.pages.length;
    let activeProgress = this._currentProgress % 1;
    let activeIndex = Math.floor(this._currentProgress);
    for (let i = 0; i < totalPages; i++) {
      const page = this.pages[i];
      const pageProgress = activeIndex < i ? 0 : activeIndex > i ? 1 : activeProgress;
      const yProgress = pageProgress < 0.5 ? 0 : (pageProgress - 0.5) / 0.5;
      const leftPileY = -this._ySpacing * (totalPages - i);
      const rightPileY = -this._ySpacing * i;
      const pageCurveEffectIntensity = this._currentProgress < 1 ? activeProgress : this._currentProgress >= totalPages ? 0 : this._currentProgress >= totalPages - 1 ? 1 - activeProgress : 1;
      page.flip(pageProgress, this._flipDirection, pageCurveEffectIntensity);
      page.position.y = rightPileY + yProgress * (leftPileY - rightPileY);
    }
    const offset = activeIndex == 0 ? -0.5 + 0.5 * activeProgress : activeIndex == totalPages - 1 ? 0.5 * activeProgress : activeIndex == totalPages ? 0.5 : 0;
    if (this._autoCenter) this.position.x = offset * this.scale.x;
  }
  /**
   * Will dispose the book, the pages and all the materials used. Also the internal cache.
   */
  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    while (this.pages.length) {
      let page = this.pages.pop();
      this.remove(page);
      page.dispose(false);
    }
    while (this.pool.length) {
      this.pool.pop().dispose(false);
    }
    this._ownedMaterials.forEach((material) => material.dispose());
    this._ownedMaterials.clear();
    this._url2Loader.forEach((m) => m.then((m2) => m2?.dispose()));
    this._url2Loader.clear();
  }
};
export {
  FlipBook
};
