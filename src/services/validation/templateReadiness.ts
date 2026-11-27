import type { FaceSwapScene, FxRateStatus, Generation, SemanticInputRole, Template, TemplateInputDef } from '../../types';
import {
  FACE_SWAP_COMPATIBLE_COMBINATIONS,
  calculateCustomerTemplateQuote,
  getRegisteredModelEntry,
  resolveCanonicalModelId
} from '../pricing/pricingService';

export interface ResolvedTemplateSlot {
  id: string;
  slotId: string;
  label: string;
  type: 'image' | 'video';
  role: SemanticInputRole;
  isRequired: boolean;
  description?: string;
}

function stableStringifyForFingerprint(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringifyForFingerprint(v)).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringifyForFingerprint(obj[k])}`).join(',')}}`;
}

/**
 * Pure TypeScript deterministic 128-bit hex fingerprint (safe for both Node.js and Vite browser builds).
 */
function deterministicHexDigest128(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  let h3 = 0x85ebca6b;
  let h4 = 0xc2b2ae35;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (ch + i), 0x85ebca6b) >>> 0;
    h3 = Math.imul(h3 ^ (ch * 31 + i), 0xc2b2ae35) >>> 0;
    h4 = Math.imul(h4 ^ ((ch << 5) - ch + i), 0x27d4eb2f) >>> 0;
  }
  return [h1, h2, h3, h4].map((n) => n.toString(16).padStart(8, '0')).join('');
}

export function isExplicitCoupleTemplate(tpl: Partial<Template> | null | undefined): boolean {
  if (!tpl) return false;
  return Boolean(tpl.isCouple === true || tpl.category === 'Couple');
}

function normalizeSlotRole(
  rawRole: unknown,
  slotId: string,
  slotType: 'image' | 'video',
  isCouple: boolean,
  index: number
): SemanticInputRole {
  const roleStr = String(rawRole || '').trim();
  const upper = roleStr.toUpperCase();
  if (
    upper === 'CUSTOMER_SOURCE_PHOTO' ||
    upper === 'CUSTOMER_SOURCE_PHOTO_PERSON_A' ||
    upper === 'CUSTOMER_SOURCE_PHOTO_PERSON_B' ||
    upper === 'CUSTOMER_SOURCE_VIDEO' ||
    upper === 'TEMPLATE_AFTER_REFERENCE' ||
    upper === 'TEMPLATE_BEFORE_REFERENCE' ||
    upper === 'TEMPLATE_FACE_THUMBNAIL' ||
    upper === 'TEMPLATE_DRIVING_VIDEO' ||
    upper === 'TEMPLATE_STYLE_REFERENCE'
  ) {
    // Prevent non-Couple template slots from accidentally assuming Couple Person A/B roles unless explicitly Couple
    if (!isCouple && (upper === 'CUSTOMER_SOURCE_PHOTO_PERSON_A' || upper === 'CUSTOMER_SOURCE_PHOTO_PERSON_B')) {
      return 'CUSTOMER_SOURCE_PHOTO';
    }
    return upper as SemanticInputRole;
  }

  const lower = roleStr.toLowerCase();
  if (isCouple) {
    if (lower === 'person_a' || slotId === 'partner_1' || slotId === 'slot_1' || index === 0) {
      return 'CUSTOMER_SOURCE_PHOTO_PERSON_A';
    }
    if (lower === 'person_b' || slotId === 'partner_2' || slotId === 'slot_2' || index === 1) {
      return 'CUSTOMER_SOURCE_PHOTO_PERSON_B';
    }
  }
  if (lower === 'style_reference' || lower === 'reference') {
    return 'TEMPLATE_STYLE_REFERENCE';
  }
  if (lower === 'driving_video') {
    return 'TEMPLATE_DRIVING_VIDEO';
  }
  if (slotType === 'video' || lower === 'user_video') {
    return 'CUSTOMER_SOURCE_VIDEO';
  }
  return 'CUSTOMER_SOURCE_PHOTO';
}

/**
 * Universal declarative slot resolver for all current and future templates.
 * Reads template requiredInputs + workflow capabilities without hardcoding specific templates.
 */
export function resolveTemplateInputSlots(tpl: Partial<Template> | null | undefined): ResolvedTemplateSlot[] {
  if (!tpl || typeof tpl !== 'object') return [];
  const isCouple = isExplicitCoupleTemplate(tpl);
  const rawList: TemplateInputDef[] = Array.isArray(tpl.requiredInputs)
    ? tpl.requiredInputs
    : Array.isArray(tpl.recipe?.requiredInputs)
    ? tpl.recipe!.requiredInputs!
    : [];

  if (rawList.length > 0) {
    return rawList
      .filter((s) => s && (s.type === 'image' || s.type === 'video'))
      .map((slot, idx) => {
        const slotId = String(slot.slotId || slot.id || `slot_${idx + 1}`).trim();
        const type: 'image' | 'video' = slot.type === 'video' ? 'video' : 'image';
        return {
          id: String(slot.id || slotId).trim(),
          slotId,
          label: String(slot.label || (isCouple ? (idx === 0 ? 'Person A Photo' : 'Person B Photo') : 'Customer Input')).trim(),
          type,
          role: normalizeSlotRole(slot.role, slotId, type, isCouple, idx),
          isRequired: slot.isRequired !== false,
          description: slot.description
        };
      });
  }

  // Fallback synthesis only when a legacy template lacks explicit requiredInputs
  if (tpl.engine === 'SMART_TEMPLATE' && (tpl.inputType === 'NONE' || (tpl as any).requiresCustomerIdentity === false)) {
    return [];
  }
  if (isCouple) {
    return [
      { id: 'partner_1', slotId: 'partner_1', label: 'Person A Photo', type: 'image', role: 'CUSTOMER_SOURCE_PHOTO_PERSON_A', isRequired: true },
      { id: 'partner_2', slotId: 'partner_2', label: 'Person B Photo', type: 'image', role: 'CUSTOMER_SOURCE_PHOTO_PERSON_B', isRequired: true }
    ];
  }
  const inputType = tpl.inputType || tpl.recipe?.inputType;
  if (tpl.type === 'video' && inputType === 'VIDEO_ONLY') {
    return [{ id: 'user_video', slotId: 'user_video', label: 'Source Video', type: 'video', role: 'CUSTOMER_SOURCE_VIDEO', isRequired: true }];
  }
  return [{ id: 'user_photo', slotId: 'user_photo', label: 'Customer Photo', type: 'image', role: 'CUSTOMER_SOURCE_PHOTO', isRequired: true }];
}

/**
 * Clarification #1:
 * SmartCanvas templates may become READY after synthetic testing ONLY when they do not require
 * customer identity/photo personalization. Customer-personalized SmartCanvas templates & all AI templates
 * require real-input verification and visual acceptance.
 */
export function requiresCustomerPhotoPersonalization(tpl: Partial<Template> | null | undefined): boolean {
  if (!tpl) return true;
  if (tpl.engine !== 'SMART_TEMPLATE') return true;
  if ((tpl as any).requiresCustomerIdentity === false || tpl.inputType === 'NONE') {
    return false;
  }
  const slots = resolveTemplateInputSlots(tpl);
  if (slots.length === 0) return false;
  return slots.some(
    (s) =>
      s.role === 'CUSTOMER_SOURCE_PHOTO' ||
      s.role === 'CUSTOMER_SOURCE_PHOTO_PERSON_A' ||
      s.role === 'CUSTOMER_SOURCE_PHOTO_PERSON_B' ||
      s.role === 'CUSTOMER_SOURCE_VIDEO'
  );
}

/**
 * Deterministic fingerprint of a template's execution-relevant configuration.
 * Changing prompt, provider, model, workflow, adapter, Couple setting, slots, or references
 * automatically invalidates prior readiness verification for that template alone.
 */
export function computeTemplateConfigFingerprint(tpl: Partial<Template> | null | undefined): string {
  if (!tpl || typeof tpl !== 'object') return '';
  const slots = resolveTemplateInputSlots(tpl).map((s) => ({
    id: s.id,
    slotId: s.slotId,
    role: s.role,
    type: s.type,
    isRequired: s.isRequired
  }));
  const recipe = (tpl.recipe || {}) as Record<string, any>;
  const payload = {
    type: tpl.type || '',
    engine: tpl.engine || '',
    provider: tpl.provider || recipe.provider || '',
    adapter: tpl.adapter || recipe.adapter || '',
    model: tpl.model || recipe.model || '',
    workflow: tpl.workflow || recipe.workflow || '',
    category: tpl.category || '',
    isCouple: isExplicitCoupleTemplate(tpl),
    aspectRatio: tpl.aspectRatio || '',
    resolutionLabel: tpl.resolutionLabel || '',
    durationSeconds: tpl.durationSeconds ?? null,
    inputType: tpl.inputType || recipe.inputType || '',
    requiredInputs: slots,
    referenceImageUrl: tpl.referenceImageUrl || recipe.referenceImageUrl || '',
    sampleResult: tpl.sampleResult || recipe.sampleResult || '',
    sampleAfter: tpl.sampleAfter || recipe.sampleAfter || '',
    sampleBefore: tpl.sampleBefore || recipe.sampleBefore || '',
    drivingVideoUrl: tpl.drivingVideoUrl || recipe.drivingVideoUrl || '',
    recipePrompt: recipe.prompt || '',
    recipeReferenceAssets: Array.isArray(recipe.referenceAssets) ? recipe.referenceAssets : []
  };
  return `fp_${deterministicHexDigest128(stableStringifyForFingerprint(payload))}`;
}

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
  const allowNoCustomerSlots =
    engine === 'SMART_TEMPLATE' && (tpl.inputType === 'NONE' || (tpl as any).requiresCustomerIdentity === false);
  let requiredInputsValid =
    (allowNoCustomerSlots && reqInputs.length === 0) ||
    (reqInputs.length > 0 &&
      reqInputs.every(
        (slot) =>
          slot &&
          typeof slot.id === 'string' &&
          slot.id.trim().length > 0 &&
          typeof slot.label === 'string' &&
          slot.label.trim().length > 0 &&
          (slot.type === 'image' || slot.type === 'video')
      ));
  if (!requiredInputsValid) {
    missingFields.push('requiredInputs');
    errors.push('At least one valid required input slot (id, label, image/video type) is required.');
  } else if (isExplicitCoupleTemplate(tpl)) {
    const personASlots = reqInputs.filter(
      (s) =>
        s.id === 'partner_1' ||
        s.id === 'slot_1' ||
        s.role === 'person_a' ||
        s.role === 'CUSTOMER_SOURCE_PHOTO_PERSON_A'
    );
    const personBSlots = reqInputs.filter(
      (s) =>
        s.id === 'partner_2' ||
        s.id === 'slot_2' ||
        s.role === 'person_b' ||
        s.role === 'CUSTOMER_SOURCE_PHOTO_PERSON_B'
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
  lastTestResult: 'PASSED' | 'FAILED' | 'UNTESTED' | 'SMOKE_PASSED' | 'AWAITING_VISUAL_ACCEPTANCE';
  lastTestError?: string;
  lastTestInputMode?: 'real_input' | 'synthetic_smoke';
  visualAcceptanceStatus?: 'NOT_REQUIRED' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';
  configFingerprint?: string;
  isCustomerGeneratable: boolean;
  legacyOperational?: boolean;
  recommendedFix?: string;
}

/**
 * Normalizes any template (legacy, newly created, paused, edited, failed, or verified)
 * into the canonical 5-state Admin Gallery Readiness model:
 * READY | TEST_REQUIRED | NEEDS_SETUP | FAILED | PAUSED.
 *
 * Strictly enforces:
 * - Never treats static config or API key checks as verified READY.
 * - AI templates & customer-personalized SmartCanvas templates require real test input + visual acceptance before READY.
 * - Non-personalized SmartCanvas templates may become READY from synthetic smoke testing.
 * - Video templates never become READY from photo-only or smoke-only verification.
 * - Changing execution config invalidates verifiedConfigFingerprint -> TEST_REQUIRED for that template alone.
 */
export function normalizeTemplateReadinessStatus(
  tpl: Partial<Template> | null | undefined
): NormalizedTemplateReadinessInfo {
  const staticCheck = validateTemplateReadiness(tpl, { strictPublish: false });
  const currentFingerprint = tpl ? computeTemplateConfigFingerprint(tpl) : undefined;
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
      lastTestInputMode: tpl?.lastTestInputMode,
      visualAcceptanceStatus: tpl?.visualAcceptanceStatus,
      configFingerprint: currentFingerprint,
      isCustomerGeneratable: false,
      legacyOperational: false,
      recommendedFix: staticCheck.missingFields.length > 0
        ? `Edit template and fill missing items: ${staticCheck.missingFields.join(', ')}.`
        : 'Open Edit Template and fix invalid provider, model, slot, or media configuration.'
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
      lastTestInputMode: tpl.lastTestInputMode,
      visualAcceptanceStatus: tpl.visualAcceptanceStatus,
      configFingerprint: currentFingerprint,
      isCustomerGeneratable: false,
      legacyOperational: false,
      recommendedFix: 'Click the Eye icon to activate this template when ready for customers.'
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
      lastTestInputMode: tpl.lastTestInputMode,
      visualAcceptanceStatus: tpl.visualAcceptanceStatus,
      configFingerprint: currentFingerprint,
      isCustomerGeneratable: false,
      legacyOperational: false,
      recommendedFix: errText.toLowerCase().includes('api_key') || errText.toLowerCase().includes('gemini_api_key') || errText.toLowerCase().includes('higgsfield')
        ? 'Check provider API key/billing secret on Cloud Run, then re-run Test.'
        : errText.toLowerCase().includes('rejected') || errText.toLowerCase().includes('visual')
        ? 'Review template prompt/AFTER reference, edit if needed, and re-run Real Test.'
        : 'Review failure reason, verify reference/slots in Edit, and re-run Smoke or Real Test.'
    };
  }

  const fingerprintMismatch = Boolean(
    tpl.verifiedConfigFingerprint &&
      currentFingerprint &&
      tpl.verifiedConfigFingerprint !== currentFingerprint
  );

  const awaitingVisual =
    tpl.lastTestResult === 'AWAITING_VISUAL_ACCEPTANCE' ||
    tpl.visualAcceptanceStatus === 'PENDING_REVIEW';
  const smokeOnlyPassed = tpl.lastTestResult === 'SMOKE_PASSED';
  const requiresRealAndVisual = requiresCustomerPhotoPersonalization(tpl);
  const blockedBySmokeOnPersonalized =
    requiresRealAndVisual && tpl.lastTestInputMode === 'synthetic_smoke';
  const blockedByPendingVisual =
    requiresRealAndVisual &&
    (awaitingVisual || tpl.visualAcceptanceStatus === 'REJECTED');

  const isVerifiedPassed =
    !fingerprintMismatch &&
    !smokeOnlyPassed &&
    !blockedBySmokeOnPersonalized &&
    !blockedByPendingVisual &&
    tpl.readinessStatus === 'READY' &&
    tpl.lastTestResult === 'PASSED' &&
    Boolean(tpl.lastVerifiedAt);

  if (isVerifiedPassed) {
    return {
      status: 'READY',
      label: 'READY',
      reason:
        tpl.visualAcceptanceStatus === 'APPROVED'
          ? 'Verified end-to-end with real inputs and Admin visual quality acceptance.'
          : 'Verified via Admin end-to-end test.',
      lastVerifiedAt: tpl.lastVerifiedAt,
      lastTestResult: 'PASSED',
      lastTestError: tpl.lastTestError,
      lastTestInputMode: tpl.lastTestInputMode,
      visualAcceptanceStatus: tpl.visualAcceptanceStatus,
      configFingerprint: currentFingerprint,
      isCustomerGeneratable: true,
      legacyOperational: false
    };
  }

  const isBlockedNewOrEdited = Boolean(tpl.requiresVerificationBeforeCustomerUse || fingerprintMismatch);
  const resolvedReason = fingerprintMismatch
    ? 'Template configuration changed since last verification — run Admin Test to re-verify.'
    : awaitingVisual
    ? 'Technical test passed — review generated output & click Approve Visual Quality to mark READY.'
    : smokeOnlyPassed || blockedBySmokeOnPersonalized
    ? 'Synthetic smoke test passed (provider & storage OK) — upload real test input(s) and approve visual quality for READY.'
    : isBlockedNewOrEdited
    ? tpl.readinessReason || 'New or edited template — run Admin test before launching to customers.'
    : 'Legacy active template (operational for customers) — verification pending in Admin Gallery.';

  const recommendedFix = fingerprintMismatch
    ? requiresRealAndVisual
      ? 'Open Real Test, upload real test input(s), verify output, and Approve Visual Quality.'
      : 'Click Smoke Test to re-verify updated SmartCanvas configuration.'
    : awaitingVisual
    ? 'Inspect the generated preview and click Approve Visual Quality to mark READY.'
    : smokeOnlyPassed || blockedBySmokeOnPersonalized
    ? 'Click Real Test, upload actual customer-style sample photo(s)/video, then Approve Visual Quality.'
    : requiresRealAndVisual
    ? 'Click Real Test (0 cr) with a real sample input and approve visual quality.'
    : 'Click Smoke Test (0 cr) to verify and mark READY.';

  return {
    status: 'TEST_REQUIRED',
    label: 'TEST REQUIRED',
    reason: resolvedReason,
    lastVerifiedAt: tpl.lastVerifiedAt,
    lastTestResult: fingerprintMismatch ? 'UNTESTED' : (tpl.lastTestResult || 'UNTESTED'),
    lastTestError: tpl.lastTestError,
    lastTestInputMode: tpl.lastTestInputMode,
    visualAcceptanceStatus: tpl.visualAcceptanceStatus,
    configFingerprint: currentFingerprint,
    isCustomerGeneratable: !isBlockedNewOrEdited,
    legacyOperational: !isBlockedNewOrEdited,
    recommendedFix
  };
}

/**
 * Checks whether an Admin template edit changed execution recipe/provider/model/slots/Couple/assets
 * requiring re-verification (resetting readinessStatus to TEST_REQUIRED for that template alone).
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
    'category',
    'isCouple',
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
    const recipeKeys = [
      'provider',
      'adapter',
      'model',
      'engine',
      'prompt',
      'workflow',
      'drivingVideoUrl',
      'referenceImageUrl',
      'sampleResult',
      'sampleBefore'
    ];
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
    if (
      nextRecipe.requiredInputs !== undefined &&
      JSON.stringify(nextRecipe.requiredInputs) !== JSON.stringify(prevRecipe.requiredInputs || [])
    ) {
      return true;
    }
  }

  const mergedCandidate: Partial<Template> = {
    ...existing,
    ...updates,
    recipe: updates.recipe !== undefined ? { ...(existing.recipe || {}), ...(updates.recipe || {}) } : existing.recipe
  };
  return computeTemplateConfigFingerprint(existing) !== computeTemplateConfigFingerprint(mergedCandidate);
}

export interface IterativeChangeCapability {
  supported: boolean;
  mode: 'image_edit' | 'smart_rerender' | 'video_instruction_rerender' | 'unsupported';
  reason?: string;
}

const HIGGSFIELD_SUPPORTED_EDIT_WORKFLOWS = new Set<string>([
  'MOTION_TRANSFER',
  'VIDEO_FACE_REPLACEMENT'
]);

const GOOGLE_VIDEO_SUPPORTED_EDIT_WORKFLOWS = new Set<string>([
  'VIDEO_EDIT',
  'IMAGE_TO_VIDEO'
]);

const UNSUPPORTED_PHOTO_WORKFLOWS = new Set<string>([
  'MOTION_TRANSFER',
  'OBJECT_SWAP',
  'VIDEO_FACE_REPLACEMENT',
  'VIDEO_EDIT',
  'IMAGE_TO_VIDEO',
  'STATIC_UNEDITABLE',
  'NONE'
]);

/**
 * Determines universally across SmartCanvas, Photo AI, Google Omni/Veo, and Higgsfield Motion Transfer
 * whether the template's explicit configured provider + adapter + workflow genuinely supports
 * iterative "Make More Changes". Never returns supported solely from `tpl.type === 'video'`.
 */
export function supportsIterativeChanges(
  tpl: Partial<Template> | null | undefined
): IterativeChangeCapability {
  if (!tpl) {
    return { supported: false, mode: 'unsupported', reason: 'Template metadata unavailable.' };
  }

  const engine = String(tpl.engine || tpl.recipe?.engine || 'AI_GENERATION').trim().toUpperCase();
  const provider = String(tpl.provider || tpl.recipe?.provider || '').trim().toLowerCase();
  const adapter = String(tpl.adapter || tpl.recipe?.adapter || '').trim();
  const workflow = String(tpl.workflow || tpl.recipe?.workflow || '').trim().toUpperCase();
  const rawModel = String(tpl.model || tpl.recipe?.model || '').trim();
  const canonicalModel = rawModel ? resolveCanonicalModelId(rawModel) : '';
  const regEntry = canonicalModel ? getRegisteredModelEntry(canonicalModel) : undefined;

  const inputType = tpl.inputType || tpl.recipe?.inputType;
  const isNonPersonalized =
    inputType === 'NONE' || (tpl as any).requiresCustomerIdentity === false;
  const hasInputs = Boolean(!isNonPersonalized && ((tpl.requiredInputs && tpl.requiredInputs.length > 0) || inputType));

  // 1. SmartCanvas Templates (Personalized Photo or Video only; static NONE frames excluded)
  if (engine === 'SMART_TEMPLATE' || provider === 'smart_template' || adapter === 'smartCanvas') {
    if (provider && provider !== 'smart_template') {
      return {
        supported: false,
        mode: 'unsupported',
        reason: `Mismatched SmartCanvas provider '${provider}'.`
      };
    }
    if (adapter && adapter !== 'smartCanvas') {
      return {
        supported: false,
        mode: 'unsupported',
        reason: `Mismatched SmartCanvas adapter '${adapter}'.`
      };
    }
    if (isNonPersonalized || !hasInputs) {
      return {
        supported: false,
        mode: 'unsupported',
        reason: 'Non-personalized static SmartCanvas frames do not support custom iterative edits.'
      };
    }
    return { supported: true, mode: 'smart_rerender' };
  }

  // 2. Video AI Templates: require explicit supported provider + adapter + workflow
  if (
    tpl.type === 'video' ||
    provider === 'higgsfield' ||
    provider === 'google_omni' ||
    provider === 'google_veo' ||
    adapter === 'faceSwapAdapter' ||
    adapter === 'videoProviderAdapter'
  ) {
    // 2a. Higgsfield Motion Transfer (faceSwapAdapter)
    const isHiggsfieldCandidate =
      provider === 'higgsfield' ||
      (!provider && (adapter === 'faceSwapAdapter' || regEntry?.provider === 'higgsfield'));

    if (isHiggsfieldCandidate) {
      if (adapter && adapter !== 'faceSwapAdapter') {
        return {
          supported: false,
          mode: 'unsupported',
          reason: `Higgsfield template uses unsupported adapter '${adapter}'.`
        };
      }
      if (regEntry && (regEntry.provider !== 'higgsfield' || regEntry.adapterId !== 'faceSwapAdapter')) {
        return {
          supported: false,
          mode: 'unsupported',
          reason: `Model '${canonicalModel}' is incompatible with Higgsfield Motion Transfer editing.`
        };
      }
      const effectiveWf = workflow || regEntry?.workflow || (provider === 'higgsfield' && adapter === 'faceSwapAdapter' ? 'MOTION_TRANSFER' : '');
      if (!effectiveWf || !HIGGSFIELD_SUPPORTED_EDIT_WORKFLOWS.has(effectiveWf)) {
        return {
          supported: false,
          mode: 'unsupported',
          reason: `Higgsfield workflow '${effectiveWf || 'UNSET'}' does not support Make More Changes.`
        };
      }
      return { supported: true, mode: 'video_instruction_rerender' };
    }

    // 2b. Google Omni / Veo Video (videoProviderAdapter)
    const isGoogleVideoCandidate =
      provider === 'google_omni' ||
      provider === 'google_veo' ||
      (provider === 'gemini' &&
        (adapter === 'videoProviderAdapter' ||
          regEntry?.adapterId === 'videoProviderAdapter' ||
          canonicalModel.includes('omni') ||
          canonicalModel.startsWith('veo'))) ||
      (!provider &&
        (adapter === 'videoProviderAdapter' || regEntry?.adapterId === 'videoProviderAdapter'));

    if (isGoogleVideoCandidate) {
      if (adapter && adapter !== 'videoProviderAdapter') {
        return {
          supported: false,
          mode: 'unsupported',
          reason: `Google video template uses unsupported adapter '${adapter}'.`
        };
      }
      if (regEntry && regEntry.adapterId !== 'videoProviderAdapter') {
        return {
          supported: false,
          mode: 'unsupported',
          reason: `Model '${canonicalModel}' is incompatible with videoProviderAdapter editing.`
        };
      }
      if (canonicalModel && !canonicalModel.includes('omni') && !canonicalModel.startsWith('veo')) {
        return {
          supported: false,
          mode: 'unsupported',
          reason: `Model '${canonicalModel}' is not a supported Omni/Veo video model.`
        };
      }
      const effectiveWf =
        workflow ||
        regEntry?.workflow ||
        ((provider === 'google_omni' || provider === 'google_veo') && adapter === 'videoProviderAdapter'
          ? 'IMAGE_TO_VIDEO'
          : '');
      if (!effectiveWf || !GOOGLE_VIDEO_SUPPORTED_EDIT_WORKFLOWS.has(effectiveWf)) {
        return {
          supported: false,
          mode: 'unsupported',
          reason: `Google video workflow '${effectiveWf || 'UNSET'}' does not support Make More Changes.`
        };
      }
      return { supported: true, mode: 'video_instruction_rerender' };
    }

    return {
      supported: false,
      mode: 'unsupported',
      reason: 'Video template lacks an explicitly supported provider, adapter, and workflow for Make More Changes.'
    };
  }

  // 3. Photo AI Templates (Gemini Image Editing via geminiAdapter)
  if (tpl.type === 'photo') {
    const resolvedProvider = provider || regEntry?.provider || (adapter === 'geminiAdapter' ? 'gemini' : '');
    const resolvedAdapter = adapter || regEntry?.adapterId || (resolvedProvider === 'gemini' ? 'geminiAdapter' : '');

    if (resolvedProvider !== 'gemini' || resolvedAdapter !== 'geminiAdapter') {
      return {
        supported: false,
        mode: 'unsupported',
        reason: `Photo template provider '${resolvedProvider || 'unset'}' / adapter '${resolvedAdapter || 'unset'}' does not support Make More Changes.`
      };
    }
    if (regEntry && (regEntry.provider !== 'gemini' || regEntry.adapterId !== 'geminiAdapter')) {
      return {
        supported: false,
        mode: 'unsupported',
        reason: `Model '${canonicalModel}' is incompatible with Gemini photo editing.`
      };
    }
    if (workflow && UNSUPPORTED_PHOTO_WORKFLOWS.has(workflow)) {
      return {
        supported: false,
        mode: 'unsupported',
        reason: `Workflow '${workflow}' does not support Gemini photo editing.`
      };
    }
    return { supported: true, mode: 'image_edit' };
  }

  return {
    supported: false,
    mode: 'unsupported',
    reason: 'Configured adapter does not support iterative post-result changes.'
  };
}

export interface IterativeEditQuoteResult {
  valid: boolean;
  credits: number | null;
  source: 'authoritative_template_quote' | 'template_credit_cost' | 'previous_generation_cost' | 'unavailable';
  reason?: string;
}

/**
 * Resolves the authoritative credit cost for Make More Changes without inventing an arbitrary fallback.
 * Checks authoritative template quote first, then valid configured template creditCost or previous generation creditCost.
 */
export function resolveIterativeEditQuote(params: {
  template?: Partial<Template> | null;
  previousGeneration?: Partial<Generation> | null;
  liveFxStatus?: FxRateStatus | null;
}): IterativeEditQuoteResult {
  const tpl = params.template;
  const prev = params.previousGeneration;

  if (tpl) {
    const isSmart = Boolean(
      (tpl as any).isSmartTemplate ||
        (tpl as any).smartMode ||
        (tpl as any).source === 'smart' ||
        tpl.engine === 'SMART_TEMPLATE'
    );
    const modelId = resolveCanonicalModelId(tpl.model || prev?.model) || tpl.model || prev?.model || '';
    const modelEntry = modelId ? getRegisteredModelEntry(modelId) : undefined;
    const rawRes = (prev?.resolution || tpl.resolutionLabel || '').toLowerCase();
    const validRes =
      rawRes === '480p' || rawRes === '720p' || rawRes === '1080p'
        ? (rawRes as '480p' | '720p' | '1080p')
        : modelEntry?.appDefaultResolution;
    const durationSec = prev?.durationSeconds || tpl.durationSeconds || modelEntry?.appDefaultDurationSeconds;

    const quote = calculateCustomerTemplateQuote({
      modelId,
      type: tpl.type || prev?.templateType || 'photo',
      resolution: validRes,
      durationSeconds: durationSec,
      sourceVideoDurationSeconds:
        modelEntry?.provider === 'higgsfield' || modelId.startsWith('hf_')
          ? Math.min(15, durationSec || 4)
          : undefined,
      engine: tpl.engine,
      creditCost: tpl.creditCost,
      providerCostUsd: tpl.providerCostUsd,
      fxRateOverride: params.liveFxStatus?.isFresh && params.liveFxStatus.rate ? params.liveFxStatus.rate : undefined
    });

    if (quote.status === 'EVALUATION_ONLY' || quote.status === 'UNSUPPORTED') {
      return {
        valid: false,
        credits: null,
        source: 'unavailable',
        reason: quote.reason || 'This template configuration does not have an active customer edit quote.'
      };
    }

    if (quote.status === 'QUOTED' && Number.isFinite(quote.credits) && quote.credits > 0) {
      return {
        valid: true,
        credits: quote.credits,
        source: 'authoritative_template_quote'
      };
    }

    if (!isSmart && params.liveFxStatus !== undefined && params.liveFxStatus !== null && !params.liveFxStatus.isFresh) {
      return {
        valid: false,
        credits: null,
        source: 'unavailable',
        reason: 'Live pricing quote is refreshing. Please wait a moment before submitting.'
      };
    }

    if (typeof tpl.creditCost === 'number' && Number.isFinite(tpl.creditCost) && tpl.creditCost > 0) {
      return {
        valid: true,
        credits: tpl.creditCost,
        source: 'template_credit_cost'
      };
    }
  }

  if (typeof prev?.creditCost === 'number' && Number.isFinite(prev.creditCost) && prev.creditCost > 0) {
    return {
      valid: true,
      credits: prev.creditCost,
      source: 'previous_generation_cost'
    };
  }

  return {
    valid: false,
    credits: null,
    source: 'unavailable',
    reason: 'Authoritative credit quote is unavailable for this generation. Edit cannot proceed until pricing loads.'
  };
}

export interface BilingualCustomizationChip {
  id: string;
  labelEn: string;
  labelHi: string;
  promptDirective: string;
}

/**
 * Identifies whether a template routes through SmartCanvas SVG/FFmpeg frame rendering
 * (where customPrompt is rendered as frame caption/text rather than AI visual inpainting).
 */
export function isSmartCanvasCustomization(tpl: Partial<Template> | null | undefined): boolean {
  if (!tpl) return false;
  const engine = String(tpl.engine || tpl.recipe?.engine || '').trim().toUpperCase();
  const provider = String(tpl.provider || tpl.recipe?.provider || '').trim().toLowerCase();
  const adapter = String(tpl.adapter || tpl.recipe?.adapter || '').trim();
  const model = String(tpl.model || tpl.recipe?.model || '').trim().toLowerCase();
  return Boolean(
    engine === 'SMART_TEMPLATE' ||
      provider === 'smart_template' ||
      adapter === 'smartCanvas' ||
      model === 'smart_canvas' ||
      model === 'smart_canvas_ffmpeg' ||
      (tpl as any).isSmartTemplate === true ||
      (tpl as any).smartMode === true ||
      (tpl as any).source === 'smart'
  );
}

const SMART_CANVAS_CAPTION_CHIPS_BY_WORKFLOW: Record<string, BilingualCustomizationChip[]> = {
  'retro-polaroid-warm': [
    {
      id: 'smart_polaroid_analog',
      labelEn: 'Analog Memories',
      labelHi: 'एनालॉग यादें',
      promptDirective: 'ANALOG MEMORIES · 35MM'
    },
    {
      id: 'smart_polaroid_golden',
      labelEn: 'Golden Days',
      labelHi: 'सुनहरे पल',
      promptDirective: 'GOLDEN DAYS · KODAK FRAME'
    },
    {
      id: 'smart_polaroid_weekend',
      labelEn: 'Weekend Escape',
      labelHi: 'वीकेंड सफर',
      promptDirective: 'WEEKEND ESCAPE · FOREVER'
    },
    {
      id: 'smart_polaroid_love',
      labelEn: 'With Love & Light',
      labelHi: 'प्यार और रोशनी के साथ',
      promptDirective: 'MADE WITH LOVE · 2026'
    }
  ],
  'story-clean-minimal': [
    {
      id: 'smart_story_quiet',
      labelEn: 'Quiet Mornings',
      labelHi: 'शांत सुबह',
      promptDirective: 'Quiet mornings, timeless frame.'
    },
    {
      id: 'smart_story_elegance',
      labelEn: 'Pure Elegance',
      labelHi: 'सादा सौंदर्य',
      promptDirective: 'Pure elegance in every moment.'
    },
    {
      id: 'smart_story_gratitude',
      labelEn: 'Grateful Heart',
      labelHi: 'आभारी मन',
      promptDirective: 'Grateful heart, peaceful mind.'
    },
    {
      id: 'smart_story_less_more',
      labelEn: 'Less is More',
      labelHi: 'कम में भी खास',
      promptDirective: 'Less noise, more beauty.'
    }
  ],
  'dark-academia-mood': [
    {
      id: 'smart_academia_chronicle',
      labelEn: 'Timeless Chronicle',
      labelHi: 'अमर कहानी',
      promptDirective: 'EX LIBRIS · TIMELESS CHRONICLE'
    },
    {
      id: 'smart_academia_wisdom',
      labelEn: 'Chapter of Wisdom',
      labelHi: 'ज्ञान का अध्याय',
      promptDirective: 'CHAPTER IV · QUIET WISDOM'
    },
    {
      id: 'smart_academia_archive',
      labelEn: 'Classic Archive',
      labelHi: 'क्लासिक संग्रह',
      promptDirective: 'ARCHIVE OF GOLDEN THOUGHTS'
    },
    {
      id: 'smart_academia_autumn',
      labelEn: 'Autumn Reflections',
      labelHi: 'शरद यादें',
      promptDirective: 'AUTUMN INK · TIMELESS SOUL'
    }
  ],
  'bali-jungle-glow': [
    {
      id: 'smart_bali_golden',
      labelEn: 'Tropical Golden Hour',
      labelHi: 'सुनहरा उष्णकटिबंधीय पल',
      promptDirective: 'UBUD GOLDEN HOUR · SANCTUARY'
    },
    {
      id: 'smart_bali_calm',
      labelEn: 'Island Serenity',
      labelHi: 'द्वीप की शांति',
      promptDirective: 'ISLAND CALM · SUNLIT BREEZE'
    },
    {
      id: 'smart_bali_escape',
      labelEn: 'Nature Escape',
      labelHi: 'प्रकृति का सुकून',
      promptDirective: 'TROPICAL ESCAPE · PURE JOY'
    },
    {
      id: 'smart_bali_palm',
      labelEn: 'Palm Sunset Glow',
      labelHi: 'ताड़ और सूर्यास्त की चमक',
      promptDirective: 'PALM HORIZON · GOLDEN GLOW'
    }
  ],
  'film-strip-carousel': [
    {
      id: 'smart_film_contact',
      labelEn: '35mm Contact Roll',
      labelHi: '35mm कॉन्टैक्ट रोल',
      promptDirective: '35MM CONTACT ROLL · STUDIO'
    },
    {
      id: 'smart_film_cinema',
      labelEn: 'Cinema Frames',
      labelHi: 'सिनेमा फ्रेम्स',
      promptDirective: 'CINEMA FRAMES · ARCHIVE'
    },
    {
      id: 'smart_film_reel',
      labelEn: 'Moments on Reel',
      labelHi: 'रील की यादें',
      promptDirective: 'MOMENTS CAPTURED ON REEL'
    },
    {
      id: 'smart_film_director',
      labelEn: 'Director Cut',
      labelHi: 'डायरेक्टर कट',
      promptDirective: 'DIRECTOR CUT · CLASSIC FILM'
    }
  ],
  'good-morning-frame': [
    {
      id: 'smart_gm_radiant',
      labelEn: 'Radiant Morning',
      labelHi: 'शुभ प्रभात संदेश',
      promptDirective: 'Good Morning · Have a Radiant Day'
    },
    {
      id: 'smart_gm_blessed',
      labelEn: 'Blessed & Fresh',
      labelHi: 'ताज़गी और आशीर्वाद',
      promptDirective: 'Suprabhat · Peace & Joy Always'
    },
    {
      id: 'smart_gm_sunshine',
      labelEn: 'New Day Sunshine',
      labelHi: 'नए दिन की धूप',
      promptDirective: 'Fresh Morning · Bright Beginnings'
    },
    {
      id: 'smart_gm_wishes',
      labelEn: 'Warm Wishes',
      labelHi: 'हार्दिक शुभकामनाएं',
      promptDirective: 'Sending Warm Wishes Today'
    }
  ],
  'synthwave-grid-animation': [
    {
      id: 'smart_synth_horizon',
      labelEn: 'Neon Horizon',
      labelHi: 'नियॉन क्षितिज',
      promptDirective: 'NEON HORIZON · NIGHT DRIVE'
    },
    {
      id: 'smart_synth_retro',
      labelEn: 'Retro 1984 Vibe',
      labelHi: 'रेट्रो 1984 वाइब',
      promptDirective: 'SYNTHWAVE 1984 · ELECTRIC'
    },
    {
      id: 'smart_synth_dreams',
      labelEn: 'Cyber Dreams',
      labelHi: 'साइबर ड्रीम्स',
      promptDirective: 'CYBER DREAMS · FUTURE GLOW'
    },
    {
      id: 'smart_synth_pulse',
      labelEn: 'Midnight Pulse',
      labelHi: 'मिडनाइट पल्स',
      promptDirective: 'MIDNIGHT PULSE · V2 EDITION'
    }
  ]
};

SMART_CANVAS_CAPTION_CHIPS_BY_WORKFLOW['cyber-synthwave-horizon'] =
  SMART_CANVAS_CAPTION_CHIPS_BY_WORKFLOW['synthwave-grid-animation'];

const SMART_CANVAS_CAPTION_FALLBACK_CHIPS: BilingualCustomizationChip[] = [
  {
    id: 'smart_caption_studio',
    labelEn: 'Timeless Studio Note',
    labelHi: 'स्टूडियो कैप्शन',
    promptDirective: 'TIMELESS STUDIO MEMORIES'
  },
  {
    id: 'smart_caption_moments',
    labelEn: 'Special Moments',
    labelHi: 'खास पल',
    promptDirective: 'SPECIAL MOMENTS · 2026'
  },
  {
    id: 'smart_caption_joy',
    labelEn: 'Warm Wishes',
    labelHi: 'शुभकामनाएं',
    promptDirective: 'MADE WITH JOY & STYLE'
  },
  {
    id: 'smart_caption_celebrate',
    labelEn: 'Golden Celebration',
    labelHi: 'सुनहरा जश्न',
    promptDirective: 'GOLDEN MOMENTS FOREVER'
  }
];

/**
 * Generates universal, engine/adapter-aware bilingual (English + Hindi) customization chips
 * for both pre-generation ("Customize Your Result") and post-result ("Make More Changes").
 * - SmartCanvas returns ONLY workflow-matched literal caption/text chips (with a safe caption-only
 *   fallback for unknown/future SmartCanvas workflows) and never exposes unsupported visual-edit chips.
 * - Gemini Photo & supported Video adapters preserve their existing visual/instruction customization chips.
 * Zero chips are auto-selected by default so pure template fidelity holds unless chosen.
 */
export function getBilingualCustomizationChips(
  tpl: Partial<Template> | null | undefined,
  context: 'pre_gen' | 'post_edit' = 'pre_gen'
): BilingualCustomizationChip[] {
  if (isSmartCanvasCustomization(tpl)) {
    const smartWf = String(tpl?.workflow || tpl?.recipe?.workflow || '').trim().toLowerCase();
    const matched = SMART_CANVAS_CAPTION_CHIPS_BY_WORKFLOW[smartWf];
    return matched ? [...matched] : [...SMART_CANVAS_CAPTION_FALLBACK_CHIPS];
  }

  const category = String(tpl?.category || '').toLowerCase();
  const desc = `${tpl?.title || ''} ${tpl?.description || ''} ${tpl?.workflow || ''}`.toLowerCase();
  const isCouple = isExplicitCoupleTemplate(tpl);
  const isVideo = tpl?.type === 'video';
  const chips: BilingualCustomizationChip[] = [];

  const mentionsEyewear =
    desc.includes('sunglass') ||
    desc.includes('eyewear') ||
    desc.includes('glasses') ||
    desc.includes('swag') ||
    category.includes('swag') ||
    category.includes('luxury') ||
    category.includes('fashion') ||
    category.includes('retro') ||
    category.includes('trending');

  if (context === 'post_edit') {
    chips.push({
      id: 'keep_unchanged',
      labelEn: 'Keep everything else unchanged',
      labelHi: 'बाकी सब वैसा ही रखें',
      promptDirective: 'Keep everything else unchanged (pose, face, lighting, and background)'
    });
  }

  if (mentionsEyewear || !isVideo) {
    chips.push({
      id: 'remove_sunglasses',
      labelEn: 'Remove sunglasses',
      labelHi: 'चश्मा हटाएं',
      promptDirective: 'Remove sunglasses and show customer natural eyes clearly'
    });
  }

  if (!desc.includes('sunglass') && !isVideo) {
    chips.push({
      id: 'add_sunglasses',
      labelEn: 'Add stylish sunglasses',
      labelHi: 'स्टाइलिश चश्मा लगाएं',
      promptDirective: 'Add stylish dark sunglasses matching the scene'
    });
  }

  chips.push({
    id: 'outfit_color',
    labelEn: 'Change outfit colour',
    labelHi: 'कपड़ों का रंग बदलें',
    promptDirective: 'Change outfit colour to royal black and gold'
  });

  if (category.includes('royal') || category.includes('festival') || category.includes('devotional') || category.includes('fashion') || category.includes('luxury') || isCouple) {
    chips.push({
      id: 'jewelry_watch',
      labelEn: 'Adjust watch or jewelry',
      labelHi: 'घड़ी या ज्वेलरी बदलें',
      promptDirective: 'Update watch and jewelry details while keeping pose intact'
    });
  }

  if (!isVideo && !isCouple) {
    chips.push({
      id: 'add_person',
      labelEn: 'Add companion / friend',
      labelHi: 'एक और व्यक्ति जोड़ें',
      promptDirective: 'Add another person beside the subject naturally'
    });
  }

  chips.push({
    id: 'lighting_bg',
    labelEn: isVideo ? 'Richer cinematic lighting' : 'Change background / lighting',
    labelHi: isVideo ? 'बेहतर सिनेमैटिक लाइटिंग' : 'बैकग्राउंड / लाइटिंग बदलें',
    promptDirective: isVideo
      ? 'Enhance cinematic lighting and atmospheric glow'
      : 'Enhance background ambiance with warm golden studio lighting'
  });

  if (!isVideo) {
    chips.push({
      id: 'soft_smile',
      labelEn: 'Natural soft smile',
      labelHi: 'हल्की मुस्कान जोड़ें',
      promptDirective: 'Give a natural confident soft smile'
    });
  } else {
    chips.push({
      id: 'smooth_motion',
      labelEn: 'Smoother slow-motion feel',
      labelHi: 'स्मूथ स्लो-मोशन इफेक्ट',
      promptDirective: 'Keep motion smooth and natural with crisp facial clarity'
    });
  }

  return chips.slice(0, 6);
}

