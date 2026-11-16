import type { AspectRatio, FaceSwapScene, Template } from '../types';
import { isVideoMedia } from './mediaUtils';

export const isVideoTemplateItem = (tpl: Partial<Template>): boolean =>
  Boolean(
    tpl.type === 'video' ||
    tpl.mediaType === 'video' ||
    tpl.isFaceSwap ||
    tpl.coverVideo ||
    isVideoMedia(tpl.cover) ||
    isVideoMedia(tpl.preview)
  );

/**
 * Projects active FaceSwap scenes (from separate config/faceswap_scenes collection)
 * into gallery-compatible Template cards for unified discovery & search without
 * merging or migrating any Firestore collections.
 */
export function buildDiscoverableCatalog(
  templates: Template[],
  faceSwapScenes: FaceSwapScene[]
): Template[] {
  const activeTemplates = (templates || []).filter((t) => t && t.isActive !== false);
  const seenIds = new Set<string>();
  const linkedSceneIds = new Set<string>();
  const result: Template[] = [];

  for (const tpl of activeTemplates) {
    if (!tpl.id || seenIds.has(tpl.id)) continue;
    seenIds.add(tpl.id);
    if (tpl.faceSwapSceneId) {
      linkedSceneIds.add(tpl.faceSwapSceneId);
    }
    result.push(tpl);
  }

  const activeScenes = (faceSwapScenes || []).filter(
    (s) => s && s.isActive !== false && s.status !== 'draft' && Boolean(s.id)
  );

  for (const scene of activeScenes) {
    if (seenIds.has(scene.id) || linkedSceneIds.has(scene.id)) {
      continue;
    }
    seenIds.add(scene.id);
    linkedSceneIds.add(scene.id);

    const coverMedia =
      scene.coverSource === 'original'
        ? scene.sourceVideoPreview
        : scene.resultVideoPreview || scene.sourceVideoPreview;
    const previewMedia = scene.resultVideoPreview || scene.sourceVideoPreview;
    const videoCoverUrl = [
      scene.resultVideoPreview,
      scene.sourceVideoPreview,
      scene.demoVideoUrl
    ].find((u) => isVideoMedia(u));
    const resultPosterUrl =
      (scene.resultVideoPreview && !isVideoMedia(scene.resultVideoPreview) ? scene.resultVideoPreview : '') ||
      (scene.sourceVideoPreview && !isVideoMedia(scene.sourceVideoPreview) ? scene.sourceVideoPreview : '') ||
      undefined;
    const mergedTags = Array.from(
      new Set([...(Array.isArray(scene.tags) ? scene.tags : []), 'FaceSwap', 'Face Swap', 'Video'])
    );

    const projected: Template = {
      id: scene.id,
      title: scene.title,
      type: 'video',
      mediaType: 'video',
      category: (scene.category || 'Dance') as any,
      cover: coverMedia || resultPosterUrl || '',
      coverImage: resultPosterUrl,
      coverVideo: videoCoverUrl || (isVideoMedia(coverMedia) ? coverMedia : undefined),
      preview: previewMedia || resultPosterUrl || '',
      sampleFaceThumbnail: scene.sampleFace || undefined,
      sampleResult: scene.resultVideoPreview || undefined,
      sampleBefore: scene.sourceVideoPreview || undefined,
      description: scene.description || 'AI Face Swap Video Scene',
      aspectRatio: (scene.aspectRatio || '9:16') as AspectRatio,
      requiredInputs: [
        {
          id: 'face_reference',
          label: 'Upload Face Reference Photo',
          type: 'image',
          description: 'Clear front-facing portrait for face swap'
        }
      ],
      creditCost: scene.creditCost || 45,
      durationSeconds: scene.durationSeconds || 8,
      engine: 'AI_GENERATION',
      model: 'hf_mult_motion_control_flash',
      workflow: 'MOTION_TRANSFER',
      sortOrder: typeof scene.order === 'number' ? scene.order + 100 : 100,
      isFeatured: Boolean(scene.isFeatured),
      isActive: true,
      tags: mergedTags,
      likesCount: scene.isFeatured ? 8500 : 4200,
      resolutionLabel: '480p AI',
      isFaceSwap: true,
      faceSwapSceneId: scene.id,
      badge: 'Face Swap'
    };

    result.push(projected);
  }

  return result;
}

/**
 * Matches search query against Template Name, Partial Name, Template/Scene ID,
 * Category, Description, Tags, and Format type label.
 */
export function matchesTemplateSearchQuery(tpl: Template, rawQuery: string): boolean {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return true;

  const tplCategory = (tpl.category || 'Trending').toLowerCase();
  const matchTitle = (tpl.title || '').toLowerCase().includes(q);
  const matchId = (tpl.id || '').toLowerCase().includes(q);
  const matchSceneId = (tpl.faceSwapSceneId || '').toLowerCase().includes(q);
  const matchCategory = tplCategory.includes(q);
  const matchDesc = (tpl.description || '').toLowerCase().includes(q);
  const matchTag = Array.isArray(tpl.tags) && tpl.tags.some((t) => (t || '').toLowerCase().includes(q));
  const typeLabel = tpl.isFaceSwap
    ? 'faceswap face swap video'
    : isVideoTemplateItem(tpl)
    ? 'video'
    : 'photo';
  const matchType = typeLabel.includes(q);

  return Boolean(matchTitle || matchId || matchSceneId || matchCategory || matchDesc || matchTag || matchType);
}
