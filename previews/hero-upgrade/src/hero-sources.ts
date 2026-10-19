import { posts, type Text } from './content';

/** The scene explores actual inputs, not three imaginary completed products. */
export const heroSources: readonly { kind: 'identity' | 'record'; label: Text; caption: Text; postIndex?: number }[] = [
  { kind: 'record', label: { zh: '影像引擎', en: 'Film studio' }, caption: { zh: '从文案、配音、分镜，到成片验收。', en: 'From script and voice to storyboard and final review.' }, postIndex: 1 },
  { kind: 'record', label: { zh: '知识归档', en: 'Knowledge archive' }, caption: { zh: '把实践写成记录，让经验可以检索。', en: 'Record the practice. Make the experience retrievable.' }, postIndex: 0 },
  { kind: 'identity', label: { zh: '無相', en: 'Identity' }, caption: { zh: '让无形的想法，留下可见的轨迹。', en: 'Ideas take shape. The process leaves a trace.' } },
];

export function postForHeroSource(index: number) {
  const postIndex = heroSources[index]?.postIndex;
  return postIndex === undefined ? undefined : posts[postIndex];
}
