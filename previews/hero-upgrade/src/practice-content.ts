// Editorial groupings of the author's public records, not a new project or
// course inventory. Article IDs, covers, dates and bodies stay canonical.
import { fields, posts } from './content';
import type { Text } from './content';

export type Practice = {
  id: 'knowledge' | 'film';
  title: Text;
  category: Text;
  summary: Text;
  focus: Text[];
  field: 'ai' | 'video';
};

export const practices: readonly Practice[] = [
  {
    id: 'knowledge',
    title: { zh: '个人知识库', en: 'A personal knowledge base' },
    category: { zh: '知识系统', en: 'Knowledge systems' },
    summary: {
      zh: '把分散的项目背景、方法与经验，整理成自己和 AI 都能接续使用的上下文。从 Obsidian 的信息分层，到本地检索与日常维护。',
      en: 'Turning scattered project context, methods and experience into knowledge that both I and AI can carry forward. From organising information in Obsidian to local retrieval and daily upkeep.',
    },
    focus: [{ zh: '信息分层', en: 'Information structure' }, { zh: 'AI 协作', en: 'AI collaboration' }, { zh: '检索与维护', en: 'Retrieval & upkeep' }],
    field: 'ai',
  },
  {
    id: 'film',
    title: { zh: 'AI 影像工作流', en: 'An AI video workflow' },
    category: { zh: '影像实践', en: 'Film & process' },
    summary: {
      zh: '让文案、配音、分镜和成片验收接成一条可复盘的制作流程。记录走过的弯路、每一步的交付，以及留待下一期验证的问题。',
      en: 'Connecting scripts, voice-over, storyboards and final review into a production process that can be examined. The detours, the handoffs and the questions left for the next episode.',
    },
    focus: [{ zh: '文案与分镜', en: 'Scripts & storyboards' }, { zh: '制作流程', en: 'Production workflow' }, { zh: '成片复盘', en: 'Film review' }],
    field: 'video',
  },
];

export function practicePosts(practice: Practice) {
  const field = fields.find(field => field.key === practice.field);
  if (!field) throw new Error(`Unknown practice field: ${practice.field}`);
  return field.posts.map(i => {
    if (!posts[i]) throw new Error(`Unknown practice article: ${i}`);
    return { i, p: posts[i] };
  }).sort((a, b) => a.p.date.localeCompare(b.p.date));
}
