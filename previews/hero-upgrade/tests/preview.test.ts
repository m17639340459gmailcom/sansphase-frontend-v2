import assert from 'node:assert/strict';
import { test } from 'node:test';
import { posts, fields, sections } from '../src/content';
import { parseRoute, sectionPath } from '../src/pages';
import { allowedArticleSlugs, preparePublicArticle, relayTarget, staticTarget } from '../server-model';

test('every published record has a working local route and unique slug', () => {
  assert.equal(new Set(posts.map((post) => post.slug)).size, posts.length);
  for (const post of posts) {
    assert.deepEqual(parseRoute(`/blog/${post.slug}`), { page: 'blog', slug: post.slug });
    assert(allowedArticleSlugs.has(post.slug));
  }
  assert.deepEqual(parseRoute('/blog/a-made-up-project'), { page: '404' });
});

test('topic references use real content and do not fabricate web records', () => {
  for (const field of fields) {
    for (const index of field.posts) assert(posts[index]);
  }
  assert.equal(fields.find((field) => field.key === 'web')?.posts.length, 0);
  assert.equal(sectionPath(sections.find((section) => section.id === 'resources')!), '/learning');
  assert.equal(sectionPath(sections.find((section) => section.id === 'resource-center')!), '/resources');
});

test('relays are limited to public article slugs and UUID media', () => {
  assert.equal(relayTarget('/api/article/private-user-id'), null);
  assert.equal(relayTarget('/api/article/../../accounts'), null);
  assert.deepEqual(relayTarget(`/api/article/${posts[0].slug}`), { kind: 'article', id: posts[0].slug });
  assert.deepEqual(relayTarget('/media/c57acd8d-a84c-459b-9eb3-6e7f84a82a2e'), { kind: 'media', id: 'c57acd8d-a84c-459b-9eb3-6e7f84a82a2e' });
});

test('article relay removes executable HTML and rewrites only trusted media', () => {
  const article = preparePublicArticle({ item: { bodyHTML: '<h2>真实内容</h2><script>alert(1)</script><img src="https://www.sansphase.com/api/media/c57acd8d-a84c-459b-9eb3-6e7f84a82a2e?w=800" onerror="alert(2)" srcset="evil 2x"><a href="javascript:alert(3)">link</a><img src="https://evil.example/api/media/c57acd8d-a84c-459b-9eb3-6e7f84a82a2e">', attachments: [{ private: true }] } }, posts[0].slug);
  assert(article.bodyHTML.includes('<h2>真实内容</h2>'));
  assert(article.bodyHTML.includes('src="/media/c57acd8d-a84c-459b-9eb3-6e7f84a82a2e"'));
  assert(!article.bodyHTML.includes('alert('));
  assert(!article.bodyHTML.includes('onerror'));
  assert(!article.bodyHTML.includes('srcset'));
  assert(!article.bodyHTML.includes('evil.example'));
  assert.deepEqual(article.attachments, []);
});

test('static mapping separates source and generated assets; traversal fails closed', () => {
  assert.deepEqual(staticTarget('/blog/a-record'), { area: 'source', relative: 'index.html' });
  assert.deepEqual(staticTarget('/style.css'), { area: 'source', relative: 'style.css' });
  assert.deepEqual(staticTarget('/build/main.js'), { area: 'generated', relative: 'main.js' });
  assert.equal(staticTarget('/build/../server.ts'), null);
  assert.equal(staticTarget('/package.json'), null);
  assert.equal(staticTarget('/src/main.ts'), null);
});
