import type { FaceSwapScene, Template } from '../../types';
import {
  FACE_SWAP_COMPATIBLE_COMBINATIONS,
  getRegisteredModelEntry,
  resolveCanonicalModelId
} from '../pricing/pricingService';

export interface TemplateReadinessResult {
  ready: boolean;
  status: 'READY' | 'DRAFT_INCOMPLETE' | 'INVALID_CONFIG';
  missingFields: string[];
  errors: string[];
  warnings: string[];
  checkedChecks: {
    idAndTitle: boolean;
    typeAndCategory: boolean;
    engineAndProvider: boolean;
    model: boolean;
    promptAndWorkflow: boolean;
    requiredInputs: boolean;
    coverAndPreviewMedia: boolean;
    requiredGenerationAssets: boolean;
  };
}

const KNOWN_PHOTO_MODELS = new Set<string>([
  'gemini-3.1-flash-lite-image',
  'gemini-3.1-flash-image',
  'gemini-2.5-flash-image',
  'gemini-2.5-flash-preview-image'
]);

const KNOWN_VIDEO_MODELS = new Set<string>([
  'hf_mult_motion_control_flash',
  'hf_mult_replace_object_flash',
  'gemini-omni-1.1-flash',
  'gemini-omni-1.2-flash'
]);

const KNOWN_SMART_MODELS = new Set<string>(['smart_canvas_ffmpeg']);

const VIDEO_WORKFLOWS = new Set<string>([
  'VIDEO_FACE_REPLACEMENT',
  'OBJECT_SWAP',
  'MOTION_TRANSFER',
  'VIDEO_EDIT',
  'IMAGE_TO_VIDEO'
]);

const PHOTO_WORKFLOWS = new Set<string>(['PHOTO_GENERATION', 'PHOTO_EDIT']);

function isNonEmptyMediaRef(val: unknown): val is string {
  if (typeof val !== 'string') return false;
  const trimmed = val.trim();
  if (trimmed.length < 5) return false;
  return (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('/api/media/') ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('data:')
  );
}

/**
 * Deterministic, zero-cost validation of Template Recipe Readiness & Compatibility.
 * Never calls paid AI provider APIs and never mutates input templates.
 */
export function validateTemplateReadiness(
  tpl: Partial<Template> | null | undefined,
  options: { strictPublish?: boolean } = {}
): TemplateReadinessResult {
  const strictPublish = options.strictPublish !== false;
  const missingFields: string[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!tpl || typeof tpl !== 'object') {
    return {
      ready: false,
      status: 'INVALID_CONFIG',
      missingFields: ['template'],
      errors: ['Template payload is missing or invalid.'],
      warnings: [],
      checkedChecks: {
        idAndTitle: false,
        typeAndCategory: false,
        engineAndProvider: false,
        model: false,
        promptAndWorkflow: false,
        requiredInputs: false,
        coverAndPreviewMedia: false,
        requiredGenerationAssets: false
      }
    };
  }

  // 1. Template ID & Title
  const hasId = typeof tpl.id === 'string' && tpl.id.trim().length >= 2;
  const hasTitle = typeof tpl.title === 'string' && tpl.title.trim().length >= 2;
  const idAndTitle = hasId && hasTitle;
  if (!hasId) {
    missingFields.push('id');
    errors.push('Template ID is required.');
  }
  if (!hasTitle) {
    missingFields.push('title');
    errors.push('Template Title is required (minimum 2 characters).');
  }

  // 2. Type & Category
  const hasValidType = tpl.type === 'photo' || tpl.type === 'video';
  const hasCategory = typeof tpl.category === 'string' && tpl.category.trim().length >= 2;
  const typeAndCategory = hasValidType && hasCategory;
  if (!hasValidType) {
    missingFields.push('type');
    errors.push("Template Type must be 'photo' or 'video'.");
  }
  if (!hasCategory) {
    missingFields.push('category');
    errors.push('Template Category is required.');
  }

  // 3. Engine & Provider Compatibility
  const engine = tpl.engine;
  const hasValidEngine = engine === 'AI_GENERATION' || engine === 'SMART_TEMPLATE';
  const resolvedProvider = (
    tpl.recipe?.provider ||
    (tpl as any).provider ||
    (engine === 'SMART_TEMPLATE' ? 'smart_template' : tpl.type === 'video' ? 'higgsfield' : 'gemini')
  )
    .toString()
    .trim()
    .toLowerCase();

  let providerCompatible = true;
  if (!hasValidEngine) {
    missingFields.push('engine');
    errors.push("Engine must be 'AI_GENERATION' or 'SMART_TEMPLATE'.");
    providerCompatible = false;
  } else if (!resolvedProvider) {
    missingFields.push('provider');
    errors.push('Recipe provider is required.');
    providerCompatible = false;
  } else if (engine === 'SMART_TEMPLATE') {
    if (!['smart_template', 'smart_canvas', 'ffmpeg'].includes(resolvedProvider)) {
      errors.push(`SMART_TEMPLATE engine is incompatible with provider '${resolvedProvider}'.`);
      providerCompatible = false;
    }
  } else {
    if (tpl.type === 'photo' && ['google_veo', 'higgsfield', 'smart_template', 'smart_canvas'].includes(resolvedProvider)) {
      errors.push(`Photo template cannot use video/smart provider '${resolvedProvider}'.`);
      providerCompatible = false;
    }
    if (tpl.type === 'video' && resolvedProvider === 'gemini_image') {
      errors.push(`Video template cannot use image-only provider '${resolvedProvider}'.`);
      providerCompatible = false;
    }
  }
  const engineAndProvider = hasValidEngine && Boolean(resolvedProvider) && providerCompatible;

  // 4. Model & Registry Compatibility
  const resolvedModel = (tpl.recipe?.model || tpl.model || '').toString().trim();
  const canonicalModel = resolveCanonicalModelId(resolvedModel);
  const explicitAdapter = (tpl.adapter || tpl.recipe?.adapter || '').toString().trim();
  let modelValid = Boolean(resolvedModel);
  if (!resolvedModel) {
    missingFields.push('model');
    errors.push('Execution model is required.');
  } else {
    const registryEntry = getRegisteredModelEntry(resolvedModel);
    if (engine === 'SMART_TEMPLATE') {
      if (registryEntry && registryEntry.provider !== 'smart_template') {
        errors.push(`SMART_TEMPLATE engine cannot use AI model '${resolvedModel}'.`);
        modelValid = false;
      } else if (!KNOWN_SMART_MODELS.has(resolvedModel)) {
        warnings.push(`SMART_TEMPLATE uses legacy canvas model '${resolvedModel}'.`);
      }
    } else if (registryEntry) {
      if (tpl.type === 'photo' && !PHOTO_WORKFLOWS.has(registryEntry.workflow)) {
        errors.push(`Model '${resolvedModel}' (${registryEntry.workflow}) is incompatible with photo templates.`);
        modelValid = false;
      }
      if (tpl.type === 'video' && PHOTO_WORKFLOWS.has(registryEntry.workflow)) {
        errors.push(`Model '${resolvedModel}' (${registryEntry.workflow}) is photo-only and incompatible with video templates.`);
        modelValid = false;
      }
      if (tpl.workflow === 'MOTION_TRANSFER' && registryEntry.workflow !== 'MOTION_TRANSFER') {
        errors.push(`Model '${resolvedModel}' (${registryEntry.workflow}) is incompatible with workflow 'MOTION_TRANSFER'.`);
        modelValid = false;
      }
      if (tpl.workflow === 'OBJECT_SWAP' && registryEntry.workflow !== 'OBJECT_SWAP') {
        errors.push(`Model '${resolvedModel}' (${registryEntry.workflow}) is incompatible with workflow 'OBJECT_SWAP'.`);
        modelValid = false;
      }
      if (explicitAdapter && registryEntry.adapterId && explicitAdapter !== registryEntry.adapterId) {
        errors.push(`Adapter '${explicitAdapter}' is incompatible with model '${resolvedModel}' (expected '${registryEntry.adapterId}').`);
        modelValid = false;
      }
      if (registryEntry.isEvaluationOnly) {
        warnings.push(`Model '${resolvedModel}' is marked evaluation-only in MODEL_REGISTRY.`);
      }
      if (registryEntry.endpointVerificationStatus === 'PENDING_QUOTE') {
        warnings.push(`Model '${resolvedModel}' pricing quote status is PENDING_QUOTE.`);
      }
    } else if (tpl.type === 'photo' && (KNOWN_PHOTO_MODELS.has(resolvedModel) || KNOWN_PHOTO_MODELS.has(canonicalModel))) {
      if (resolvedProvider !== 'gemini') {
        errors.push(`Gemini photo model '${resolvedModel}' is incompatible with provider '${resolvedProvider}'.`);
        modelValid = false;
      }
    } else if (tpl.type === 'video' && (KNOWN_VIDEO_MODELS.has(resolvedModel) || KNOWN_VIDEO_MODELS.has(canonicalModel))) {
      if (resolvedModel.startsWith('hf_') && resolvedProvider !== 'higgsfield') {
        errors.push(`Higgsfield model '${resolvedModel}' is incompatible with provider '${resolvedProvider}'.`);
        modelValid = false;
      }
    } else {
      missingFields.push('model');
      errors.push(`Model '${resolvedModel}' is unrecognized or incompatible with template type '${tpl.type}'.`);
      modelValid = false;
    }
  }

  // 5. Recipe Prompt & Workflow
  const resolvedWorkflow = (tpl.recipe?.workflow || tpl.workflow || '').toString().trim();
  const resolvedPrompt = (tpl.recipe?.prompt || '').toString().trim();
  const fallbackDescriptionPrompt = (tpl.description || '').toString().trim();
  let promptAndWorkflow = true;
  if (!resolvedWorkflow) {
    missingFields.push('workflow');
    errors.push('Execution workflow identifier is required.');
    promptAndWorkflow = false;
  } else if (tpl.type === 'photo' && VIDEO_WORKFLOWS.has(resolvedWorkflow)) {
    errors.push(`Photo template cannot use video workflow '${resolvedWorkflow}'.`);
    promptAndWorkflow = false;
  }

  if (engine !== 'SMART_TEMPLATE') {
    if (resolvedPrompt.length < 10) {
      if (strictPublish || fallbackDescriptionPrompt.length < 10 || !hasCategory) {
        missingFields.push('recipe.prompt');
        errors.push('Recipe Prompt is required (minimum 10 characters) for AI generation templates.');
        promptAndWorkflow = false;
      } else {
        warnings.push('No explicit recipe.prompt stored; runtime uses category prompt + template description.');
      }
    }
  }

  // 6. Required Inputs
  const reqInputs = Array.isArray(tpl.requiredInputs)
    ? tpl.requiredInputs
    : Array.isArray(tpl.recipe?.requiredInputs)
    ? tpl.recipe!.requiredInputs!
    : [];
  let requiredInputsValid = reqInputs.length > 0 && reqInputs.every(
    (slot) =>
      slot &&
      typeof slot.id === 'string' &&
      slot.id.trim().length > 0 &&
      typeof slot.label === 'string' &&
      slot.label.trim().length > 0 &&
      (slot.type === 'image' || slot.type === 'video')
  );
  if (!requiredInputsValid) {
    missingFields.push('requiredInputs');
    errors.push('At least one valid required input slot (id, label, image/video type) is required.');
  } else if (tpl.category === 'Couple' || (tpl as any).isCouple === true) {
    const personASlots = reqInputs.filter(
      (s) => s.id === 'partner_1' || s.id === 'slot_1' || (s as any).role === 'person_a'
    );
    const personBSlots = reqInputs.filter(
      (s) => s.id === 'partner_2' || s.id === 'slot_2' || (s as any).role === 'person_b'
    );
    if (personASlots.length !== 1 || personBSlots.length !== 1) {
      missingFields.push('requiredInputs(couple_slots)');
      errors.push('Couple templates require exactly one Person A slot and one Person B slot.');
      requiredInputsValid = false;
    }
  }

  // 7. Cover / Preview Media
  const hasCover = isNonEmptyMediaRef(tpl.cover) || isNonEmptyMediaRef(tpl.coverImage) || isNonEmptyMediaRef(tpl.coverVideo);
  const hasPreview =
    tpl.type === 'video'
      ? isNonEmptyMediaRef(tpl.preview) || isNonEmptyMediaRef(tpl.coverVideo) || isNonEmptyMediaRef(tpl.sampleResult) || isNonEmptyMediaRef(tpl.cover)
      : isNonEmptyMediaRef(tpl.preview) || isNonEmptyMediaRef(tpl.cover) || isNonEmptyMediaRef(tpl.sampleResult) || isNonEmptyMediaRef(tpl.sampleAfter);
  const coverAndPreviewMedia = hasCover && hasPreview;
  if (!hasCover) {
    missingFields.push('cover');
    errors.push('Cover media URL is required.');
  }
  if (!hasPreview) {
    missingFields.push('preview');
    errors.push('Preview media URL is required.');
  }

  // 8. Required Generation Assets
  let requiredGenerationAssets = true;
  if (tpl.type === 'photo' && engine !== 'SMART_TEMPLATE') {
    const explicitAfterRef =
      tpl.sampleResult ||
      tpl.sampleAfter ||
      tpl.referenceImageUrl ||
      tpl.recipe?.sampleResult ||
      tpl.recipe?.sampleAfter ||
      tpl.recipe?.referenceImageUrl ||
      tpl.recipe?.referenceAssets?.[0];
    const safeCoverFallback =
      tpl.cover &&
      tpl.cover !== tpl.sampleFaceThumbnail &&
      tpl.cover !== tpl.sampleBefore
        ? tpl.cover
        : undefined;
    const resolvedPhotoRef = explicitAfterRef || safeCoverFallback;
    if (!isNonEmptyMediaRef(resolvedPhotoRef)) {
      missingFields.push('sampleResult/referenceImageUrl');
      errors.push('Photo template requires a dedicated AFTER sample result or reference image asset (cannot substitute cover/face-thumbnail/before asset).');
      requiredGenerationAssets = false;
    }
  } else if (tpl.type === 'video') {
    const needsDrivingVideo =
      resolvedWorkflow === 'MOTION_TRANSFER' ||
      resolvedWorkflow === 'OBJECT_SWAP' ||
      Boolean(tpl.isFaceSwap) ||
      resolvedProvider === 'higgsfield';
    if (needsDrivingVideo) {
      const hasDriving = isNonEmptyMediaRef(tpl.drivingVideoUrl) || isNonEmptyMediaRef(tpl.recipe?.drivingVideoUrl) || Boolean(tpl.faceSwapSceneId);
      if (!hasDriving) {
        missingFields.push('drivingVideoUrl');
        errors.push(`Video workflow '${resolvedWorkflow}' requires a driving/reference video asset.`);
        requiredGenerationAssets = false;
      }
    }
  }

  const ready =
    idAndTitle &&
    typeAndCategory &&
    engineAndProvider &&
    modelValid &&
    promptAndWorkflow &&
    requiredInputsValid &&
    coverAndPreviewMedia &&
    requiredGenerationAssets &&
    errors.length === 0;

  const status: TemplateReadinessResult['status'] = ready
    ? 'READY'
    : missingFields.length > 0
    ? 'DRAFT_INCOMPLETE'
    : 'INVALID_CONFIG';

  return {
    ready,
    status,
    missingFields: Array.from(new Set(missingFields)),
    errors,
    warnings,
    checkedChecks: {
      idAndTitle,
      typeAndCategory,
      engineAndProvider,
      model: modelValid,
      promptAndWorkflow,
      requiredInputs: requiredInputsValid,
      coverAndPreviewMedia,
      requiredGenerationAssets
    }
  };
}

/**
 * Validates preset FaceSwap Scene readiness and cascading provider/adapter/model/workflow/resolution compatibility.
 */
export function validateFaceSwapSceneReadiness(scene: Partial<FaceSwapScene> | null | undefined): {
  ready: boolean;
  missingFields: string[];
  errors: string[];
} {
  const missingFields: string[] = [];
  const errors: string[] = [];

  if (!scene || typeof scene !== 'object') {
    return {
      ready: false,
      missingFields: ['scene'],
      errors: ['Face Swap scene record is missing.']
    };
  }
  if (!scene.id || !scene.title) {
    missingFields.push('id/title');
    errors.push('Face Swap scene is missing ID or title.');
  }
  if (scene.isActive === false || scene.status === 'draft') {
    errors.push('Selected Face Swap scene is currently in Draft/Inactive state.');
  }
  if (!isNonEmptyMediaRef(scene.sourceVideoPreview)) {
    missingFields.push('sourceVideoPreview');
    errors.push('Face Swap scene is missing its authoritative driving video asset.');
  }
  if (!scene.creditCost || Number(scene.creditCost) <= 0) {
    missingFields.push('creditCost');
    errors.push('Face Swap scene credit cost must be greater than zero.');
  }

  // Validate cascading Provider -> Adapter -> Model -> Workflow -> Resolution compatibility if configured
  const hasAnyProviderConfig = Boolean(scene.provider || scene.adapter || scene.model || scene.workflow || scene.resolution);
  if (hasAnyProviderConfig) {
    const providerKey = (scene.provider || 'higgsfield').trim().toLowerCase();
    const providerEntry = FACE_SWAP_COMPATIBLE_COMBINATIONS.find((p) => p.provider === providerKey);
    if (!providerEntry) {
      errors.push(`Unsupported FaceSwap provider '${scene.provider}'.`);
    } else {
      const adapterKey = (scene.adapter || providerEntry.adapters[0]?.adapter || '').trim();
      const adapterEntry = providerEntry.adapters.find((a) => a.adapter === adapterKey);
      if (!adapterEntry) {
        errors.push(`Adapter '${adapterKey}' is incompatible with FaceSwap provider '${providerKey}'.`);
      } else {
        const modelKey = resolveCanonicalModelId(scene.model || adapterEntry.models[0]?.model || '');
        const modelEntry = adapterEntry.models.find((m) => m.model === modelKey);
        if (!modelEntry) {
          errors.push(`Model '${scene.model || modelKey}' is incompatible with adapter '${adapterKey}'.`);
        } else {
          if (modelEntry.isEvaluationOnly && scene.isActive !== false) {
            errors.push(`Model '${modelEntry.model}' is evaluation-only and cannot be published as an active customer FaceSwap scene.`);
          }
          if (scene.workflow) {
            const wfOk = modelEntry.workflows.some((w) => w.workflow === scene.workflow);
            if (!wfOk) {
              errors.push(`Workflow '${scene.workflow}' is incompatible with model '${modelEntry.model}'.`);
            }
          }
          if (scene.resolution && !modelEntry.supportedResolutions.includes(scene.resolution)) {
            errors.push(`Resolution '${scene.resolution}' is unsupported by model '${modelEntry.model}'.`);
          }
        }
      }
    }
  }

  return {
    ready: errors.length === 0,
    missingFields,
    errors
  };
}

export type CanonicalTemplateReadinessStatus =
  | 'READY'
  | 'TEST_REQUIRED'
  | 'NEEDS_SETUP'
  | 'FAILED'
  | 'PAUSED';

export interface NormalizedTemplateReadinessInfo {
  status: CanonicalTemplateReadinessStatus;
  label: string;
  reason: string;
  lastVerifiedAt?: string;
  lastTestResult: 'PASSED' | 'FAILED' | 'UNTESTED';
  lastTestError?: string;
  isCustomerGeneratable: boolean;
  legacyOperational?: boolean;
}

/**
 * Normalizes any template (legacy, newly created, paused, edited, failed, or verified)
 * into the canonical 5-state Admin Gallery Readiness model:
 * READY | TEST_REQUIRED | NEEDS_SETUP | FAILED | PAUSED.
 *
 * Strictly enforces:
 * - Never treats static config or API key checks as verified READY.
 * - READY requires an actual recorded passing verification test (lastVerifiedAt / lastTestResult === 'PASSED').
 * - Existing active statically configured templates remain operational for customers (isCustomerGeneratable: true, legacyOperational: true)
 *   while honestly showing TEST_REQUIRED (verification pending) in Admin Gallery until verified.
 * - New or execution-edited templates (requiresVerificationBeforeCustomerUse === true) stay TEST_REQUIRED and blocked until tested.
 * - Confirmed failing templates become FAILED and isolate only that template.
 */
export function normalizeTemplateReadinessStatus(
  tpl: Partial<Template> | null | undefined
): NormalizedTemplateReadinessInfo {
  const staticCheck = validateTemplateReadiness(tpl, { strictPublish: false });
  if (!tpl || !staticCheck.ready || tpl.readinessStatus === 'DRAFT_INCOMPLETE' || tpl.readinessStatus === 'INVALID_CONFIG' || tpl.readinessStatus === 'NEEDS_SETUP') {
    const reason =
      tpl?.readinessReason ||
      staticCheck.errors[0] ||
      (staticCheck.missingFields.length > 0
        ? `Missing: ${staticCheck.missingFields.join(', ')}`
        : 'Incomplete or invalid template configuration.');
    return {
      status: 'NEEDS_SETUP',
      label: 'NEEDS SETUP',
      reason,
      lastVerifiedAt: tpl?.lastVerifiedAt,
      lastTestResult: tpl?.lastTestResult || 'UNTESTED',
      lastTestError: tpl?.lastTestError,
      isCustomerGeneratable: false,
      legacyOperational: false
    };
  }

  if (tpl.isActive === false || tpl.readinessStatus === 'PAUSED') {
    return {
      status: 'PAUSED',
      label: 'PAUSED',
      reason: tpl.readinessReason || 'Paused by Admin (hidden from customer generation).',
      lastVerifiedAt: tpl.lastVerifiedAt,
      lastTestResult: tpl.lastTestResult || 'UNTESTED',
      lastTestError: tpl.lastTestError,
      isCustomerGeneratable: false,
      legacyOperational: false
    };
  }

  if (tpl.readinessStatus === 'FAILED' || tpl.lastTestResult === 'FAILED') {
    const errText = tpl.lastTestError || tpl.readinessReason || 'Last Admin verification test failed.';
    return {
      status: 'FAILED',
      label: 'FAILED',
      reason: errText,
      lastVerifiedAt: tpl.lastVerifiedAt,
      lastTestResult: 'FAILED',
      lastTestError: errText,
      isCustomerGeneratable: false,
      legacyOperational: false
    };
  }

  const isVerifiedPassed =
    tpl.readinessStatus === 'READY' &&
    tpl.lastTestResult === 'PASSED' &&
    Boolean(tpl.lastVerifiedAt);

  if (isVerifiedPassed) {
    return {
      status: 'READY',
      label: 'READY',
      reason: 'Verified via real Admin end-to-end test.',
      lastVerifiedAt: tpl.lastVerifiedAt,
      lastTestResult: 'PASSED',
      lastTestError: tpl.lastTestError,
      isCustomerGeneratable: true,
      legacyOperational: false
    };
  }

  const isBlockedNewOrEdited = Boolean(tpl.requiresVerificationBeforeCustomerUse);

  return {
    status: 'TEST_REQUIRED',
    label: 'TEST REQUIRED',
    reason: isBlockedNewOrEdited
      ? (tpl.readinessReason || 'New or edited template — run 1-click Admin test before launching to customers.')
      : 'Legacy active template (operational for customers) — verification pending in Admin Gallery.',
    lastVerifiedAt: tpl.lastVerifiedAt,
    lastTestResult: tpl.lastTestResult || 'UNTESTED',
    lastTestError: tpl.lastTestError,
    isCustomerGeneratable: !isBlockedNewOrEdited,
    legacyOperational: !isBlockedNewOrEdited
  };
}

/**
 * Checks whether an Admin template edit changed execution recipe/provider/model/assets
 * requiring re-verification (resetting readinessStatus to TEST_REQUIRED).
 */
export function didTemplateExecutionRecipeChange(
  existing: Partial<Template>,
  updates: Partial<Template>
): boolean {
  const scalarKeys: Array<keyof Template> = [
    'type',
    'engine',
    'provider',
    'adapter',
    'model',
    'workflow',
    'aspectRatio',
    'resolutionLabel',
    'durationSeconds',
    'cover',
    'coverImage',
    'coverVideo',
    'preview',
    'sampleResult',
    'sampleAfter',
    'sampleBefore',
    'referenceImageUrl',
    'drivingVideoUrl',
    'inputType'
  ];

  for (const key of scalarKeys) {
    if (updates[key] !== undefined && updates[key] !== existing[key]) {
      return true;
    }
  }

  if (updates.requiredInputs !== undefined) {
    if (JSON.stringify(updates.requiredInputs) !== JSON.stringify(existing.requiredInputs || [])) {
      return true;
    }
  }

  if (updates.recipe !== undefined) {
    const prevRecipe: Record<string, any> = (existing.recipe || {}) as Record<string, any>;
    const nextRecipe: Record<string, any> = (updates.recipe || {}) as Record<string, any>;
    const recipeKeys = ['provider', 'adapter', 'model', 'engine', 'prompt', 'workflow', 'drivingVideoUrl', 'referenceImageUrl', 'sampleResult', 'sampleBefore'];
    for (const rk of recipeKeys) {
      if (nextRecipe[rk] !== undefined && nextRecipe[rk] !== prevRecipe[rk]) {
        return true;
      }
    }
    if (
      nextRecipe.referenceAssets !== undefined &&
      JSON.stringify(nextRecipe.referenceAssets) !== JSON.stringify(prevRecipe.referenceAssets || [])
    ) {
      return true;
    }
  }

  return false;
}

