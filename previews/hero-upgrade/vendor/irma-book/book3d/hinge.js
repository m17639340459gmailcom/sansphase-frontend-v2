import { ShaderChunk, Vector2 } from 'three';

/**
 * Opening the front board.
 *
 * The cover stays a single mesh: instead of cutting it into three pieces —
 * which would open a crack at the groove — the front board's vertices are
 * rotated in the vertex shader around the groove's axis, with a soft
 * transition as wide as the groove itself. The cloth flexes, like on a real
 * book.
 *
 * The mask is the product of two conditions: being past the groove
 * (x > hingeX) and being on the front half (z > 0). There's no ambiguity
 * between the two: past the groove there's no geometry near z = 0, because
 * that's where the page block is — a separate mesh that doesn't move.
 */
const HINGE_HEAD = /* glsl */`
uniform vec2 bookHingeCenter;   // (x, z) of the axis, in millimeters
uniform float bookHingeBlend;   // half-width of the flexing zone
uniform float bookHingeMaskShift; // host reading mode: flex only on the spine side
uniform float bookOpenAngle;

float bookHingeFactor( vec3 p ) {
  float maskCenter = bookHingeCenter.x + bookHingeMaskShift;
  float across = smoothstep( maskCenter - bookHingeBlend, maskCenter + bookHingeBlend, p.x );
  return across * step( 0.0, p.z );
}
`;

/**
 * Each injection declares its own variables: the depth pass doesn't include
 * `beginnormal_vertex`, so the two blocks can't share them.
 */
const LOCALS = /* glsl */`
    float bookA = bookOpenAngle * bookHingeFactor( position );
    float bookS = sin( bookA );
    float bookC = cos( bookA );`;

export function createHingeUniforms() {
  return {
    bookHingeCenter: { value: new Vector2(0, 0) },
    bookHingeBlend: { value: 2.4 },
    bookHingeMaskShift: { value: 0 },
    bookOpenAngle: { value: 0 },
  };
}

/**
 * Injects the rotation into the vertex shader. As with the emboss,
 * `onBeforeCompile` receives the shader with its `#include`s not yet
 * resolved: the directive is replaced by inlining the original chunk.
 */
export function hingeVertexShader(source) {
  return source
    .replace('void main() {', `${HINGE_HEAD}\nvoid main() {`)
    .replace(
      '#include <beginnormal_vertex>',
      `${ShaderChunk.beginnormal_vertex}
  {
${LOCALS}
    objectNormal = vec3(
      objectNormal.x * bookC - objectNormal.z * bookS,
      objectNormal.y,
      objectNormal.x * bookS + objectNormal.z * bookC
    );
  }`
    )
    .replace(
      '#include <begin_vertex>',
      `${ShaderChunk.begin_vertex}
  {
${LOCALS}
    vec2 bookD = vec2( transformed.x - bookHingeCenter.x, transformed.z - bookHingeCenter.y );
    transformed.x = bookHingeCenter.x + bookD.x * bookC - bookD.y * bookS;
    transformed.z = bookHingeCenter.y + bookD.x * bookS + bookD.y * bookC;
  }`
    );
}
