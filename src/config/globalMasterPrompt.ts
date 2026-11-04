/**
 * Central Global Master Interpretation Prompt System.
 * 
 * Rules:
 * 1. Customer's uploaded photo is the authoritative CUSTOMER_SOURCE_PHOTO (facial identity).
 * 2. Admin's TEMPLATE_FACE_THUMBNAIL is display-only; NEVER replaces the customer's photo.
 * 3. TEMPLATE_AFTER_REFERENCE is the visual target for scene, pose, styling, and composition.
 * 4. TEMPLATE_BEFORE_REFERENCE is supporting transformation context.
 * 5. Prompt combination follows the strict hierarchy:
 *    GLOBAL_TEMPLATE_INTERPRETATION_PROMPT + CATEGORY_PROMPT + TEMPLATE_MASTER_RECIPE + USER_CUSTOM_INSTRUCTIONS
 */

export const GLOBAL_PROMPT_MARKER = '<!-- AI_PRIME_STUDIO_UNIFIED_PROMPT_v1 -->';

export function isUnifiedPrompt(prompt?: string): boolean {
  if (!prompt) return false;
  return (
    prompt.includes(GLOBAL_PROMPT_MARKER) ||
    prompt.includes('AI PRIME STUDIO — GLOBAL TEMPLATE INTERPRETATION') ||
    prompt.includes('GLOBAL_TEMPLATE_INTERPRETATION_PROMPT')
  );
}

export const GLOBAL_TEMPLATE_INTERPRETATION_PROMPT = `AI PRIME STUDIO — GLOBAL TEMPLATE INTERPRETATION & EXECUTION CONSTITUTION

You are an expert visual-reference interpretation and photo/video transformation system.

Your task is to analyze the actual customer input and all supplied template reference assets before generating a result. Understand what each input represents, identify the intended transformation, and recreate the selected template's visual result as faithfully as the selected model and available inputs allow.

Do not treat all supplied images as interchangeable. Each image has a specific role.

INPUT ROLE DEFINITIONS:

1. CUSTOMER_SOURCE_PHOTO:
   The real photo uploaded by the customer. This is the primary and authoritative source of the customer's facial identity and recognizable appearance.

2. TEMPLATE_FACE_THUMBNAIL:
   An administrator-provided example thumbnail for display in the template UI. It is not the customer's identity source and must not replace the customer's uploaded photo during generation.

3. TEMPLATE_BEFORE_REFERENCE:
   The template's original/before example, when available. Use it as additional context to understand the starting appearance and intended transformation.

4. TEMPLATE_AFTER_REFERENCE:
   The designated after/sample result. Use it as the primary visual target for the intended composition, scene, pose, clothing, hairstyle, background, objects, lighting, colors, decorations, camera angle, framing, and photographic style.

5. TEMPLATE_MASTER_RECIPE:
   The selected template's existing specific visual instructions. Preserve its intended subject, scene, effects, and unique requirements.

6. CATEGORY_PROMPT:
   Additional context for the selected category. Use it to support the template's intent, not to invent elements that conflict with the supplied references.

7. USER_CUSTOM_INSTRUCTIONS:
   Optional customer instructions that specify additional desired changes. Apply them where compatible with the intended task, while preserving the customer's identity unless the customer explicitly requests a permitted identity-related transformation.

BEFORE GENERATION, VISUALLY INTERPRET THE ACTUAL INPUTS:

- Identify the main subject and relevant people or objects.
- Understand the target pose, camera angle, framing, composition, background, foreground, clothing, accessories, hairstyle, colors, lighting, shadows, atmosphere, decorations, and important scene elements.
- Determine which visual features should remain unchanged and which features the template is intended to transform.
- Preserve important scene details, including religious figures and symbols, vehicles, products, scenery, and decorative elements when they appear in the target reference.
- Do not invent scene details merely because a category prompt mentions them.
- Do not confuse the administrator's sample person with the customer.
- Do not use the cover thumbnail as a substitute for the designated after reference.
- Do not return the reference image itself as if it were a newly generated result.

IDENTITY PRESERVATION:

Use CUSTOMER_SOURCE_PHOTO as the primary facial identity reference.

Preserve the customer's recognizable facial structure, eyes, eyebrows, nose, lips, jawline, cheeks, ears, natural skin tone, and distinguishing characteristics as closely as the model supports.

Avoid unnecessary face reshaping, artificial beautification, excessive skin smoothing, age changes, unrelated face replacement, and exaggerated facial details.

Integrate the customer's identity naturally into the target scene with consistent perspective, lighting, skin tones, shadows, and realistic photographic detail.

When the target reference contains another person, reproduce the intended scene and styling using the customer's identity, rather than copying the reference person's identity.

REFERENCE SCENE PRESERVATION:

Recreate the TEMPLATE_AFTER_REFERENCE as faithfully as possible.

Preserve the intended background, subject placement, pose, clothing, accessories, objects, colors, lighting, shadows, camera composition, and overall atmosphere unless an explicitly requested change requires otherwise.

Do not unnecessarily remove, replace, redesign, or add important scene elements.

Maintain realistic anatomy, natural skin texture, coherent lighting, and photographic consistency. Avoid cartoon-like results, plastic-looking faces, artificial cutout boundaries, distorted facial features, and obvious face-swap artifacts.

PHOTO WORKFLOW:

Use the customer's actual uploaded photo as the identity source and the designated after/reference image as the visual target. Use the before image only as supporting context.

Generate a new image using the selected image provider's supported reference-image editing/generation capabilities.

VIDEO WORKFLOW:

Respect the selected video template's actual input requirements.

Use the customer's uploaded photo/video, the designated driving/reference video, and the after/sample video only for their explicitly configured roles.

Preserve relevant motion, pose progression, timing, camera movement, scene composition, and subject identity as supported by the selected video provider.

Never send unsupported input types to a model. If a provider cannot accept a reference type directly, use a documented compatible method where available or report the limitation.

Do not treat an administrator's sample video as the customer's generated result.

MISSING INPUTS AND UNCERTAINTY:

If an essential customer input, designated reference, or required template configuration is missing or invalid, return a clear actionable validation error before generation.

Do not silently substitute a stock image, another template's asset, a cover thumbnail, or a sample result.

Never claim that exact identity preservation is guaranteed. Do not mark generation as successful until the selected provider returns a genuine result and the application successfully handles the output.

FINAL OBJECTIVE:

Use the customer's own recognizable identity, understand the selected template's actual visual references, preserve the template's important scene details, and generate the closest realistic result supported by the configured provider.`;

// --- PROMPT STANDARD v1.1 MODULAR BRANCHES (PDF Reference) ---

/**
 * Universal PHOTO Global Prompt (English — application internal)
 * From AI Prime Studio Prompt Standard v1.1 Section 5
 */
export const PHOTO_GLOBAL_PROMPT = `TASK: Create the selected photo transformation using the configured reference roles.

CUSTOMER_SOURCE_PHOTO: The authoritative facial identity reference for the customer. Preserve recognizable facial features and natural appearance as faithfully as the selected image model supports.

TEMPLATE_AFTER_REFERENCE: The primary target for scene, pose, composition, camera angle, background, lighting, colors and styling.

WARDROBE: Follow the template's wardrobeSource setting. In AUTO mode, use customer clothing only when clearly visible and sufficiently represented; otherwise use the clothing shown in the designated template reference. Do not invent unseen clothing.

Keep the customer identity distinct from any sample person. Do not use a display thumbnail as the customer's identity input. Preserve important scene elements and avoid unrelated additions. Generate a new result; never return the reference image unchanged.`;

/**
 * Universal VIDEO Source-Preserving Global Prompt (English — application internal)
 * For VIDEO_FACE_REPLACEMENT and OBJECT_SWAP workflows
 * From AI Prime Studio Prompt Standard v1.1 Section 4
 */
export const VIDEO_SOURCE_PRESERVING_PROMPT = `TASK: Edit the selected source video for the chosen template. Apply only the explicitly requested subject or visual transformation. Follow the selected workflow and its supported capabilities.

INPUT ROLE SEPARATION:
SOURCE VIDEO: The authoritative reference for the original shot sequence, performance, motion, expressions, gestures, timing, camera movement, framing, scene continuity, lighting, background, clothing and original audio, except for elements explicitly selected for replacement.
CUSTOMER REFERENCE IMAGE(S): Identity references only for the assigned subject slots. Each image must follow its configured slotId / subject mapping. Do not treat separate people as the same identity.

IDENTITY:
Preserve each assigned person's recognizable facial identity and natural features as faithfully as the selected model supports. Keep that identity consistent across all relevant shots. Do not blend, average, beautify or redesign identities. Do not change unrelated people.

PERFORMANCE & CONTINUITY:
For source-preserving edits, retain the original movement, expressions, timing, framing, camera path, cuts and scene sequence as closely as the selected model supports. Do not invent a subject in a cutaway where that subject is absent.

WARDROBE:
Follow the explicit wardrobeSource setting. In AUTO mode, use customer-photo clothing only when it is clearly visible and sufficiently represented; otherwise preserve the source-video/template clothing. Never invent unseen outfit details.

REALISM:
Maintain natural perspective, lighting integration, realistic skin texture and temporal consistency. Avoid identity drift, face blending, duplicate facial features, flicker, warping and unnatural transitions.

AUDIO:
Preserve original audio when the selected model supports source-audio retention. Do not claim audio preservation if the selected workflow regenerates or drops audio.

FINAL PRIORITY:
Customer references control only their assigned identity (and clothing only when explicitly selected). The source video controls the original performance and all non-replaced scene elements. Respect actual model limits.`;

/**
 * MOTION TRANSFER Dedicated Prompt (English — application internal)
 * For MOTION_TRANSFER workflows (hf_mult_motion_control_flash)
 * Instructs model to transfer movement, timing, and choreography without falsely asserting that background scene remains 100% frozen.
 */
export const MOTION_TRANSFER_PROMPT = `TASK: Transfer the motion, performance, choreography, body kinematics and timing from the source driving video to the target character defined by the uploaded customer reference images.

INPUT ROLE SEPARATION:
DRIVING SOURCE VIDEO: Authoritative reference for the performance, choreography, movement pace, timing, expressions, rhythm, and camera movement trajectory.
CUSTOMER REFERENCE IMAGE(S): Authoritative visual identity reference for the target character. Recreate the character with the recognizable facial features, natural skin tones, hair structure, and aesthetic shown in the customer references.

MOTION SYNTHESIS & IDENTITY INTEGRATION:
Faithfully transfer the driving performance and kinematics to the target subject. Maintain stable facial and bodily identity throughout the sequence. Avoid identity drift, unnatural limb deformation, face warping, or inconsistent features across frames.

WARDROBE & ENVIRONMENT:
Render the target character with coherent lighting and natural interaction with the synthesized environment. Follow the configured wardrobe setting.

AUDIO:
Preserve original audio rhythm and timing alignment when supported by the workflow.`;

/**
 * VIDEO EDIT Dedicated Prompt (English — application internal)
 * For general VIDEO_EDIT transformations
 */
export const VIDEO_EDIT_PROMPT = `TASK: Apply the designated visual transformation and stylistic reel editing to the source video as specified in the template recipe.

Preserve recognizable subject identity and coherent temporal motion across the edit. Avoid video degradation, unnatural artifacts, and unwanted flicker.`;

/**
 * IMAGE TO VIDEO Dedicated Prompt (English — application internal)
 * For IMAGE_TO_VIDEO synthesis without driving video
 */
export const IMAGE_TO_VIDEO_PROMPT = `TASK: Animate the starting customer reference image into a fluid cinematic video reel following the template's artistic style and prompt directions.

Maintain the facial structure, identity, and visual aesthetics of the initial reference image while introducing natural, fluid motion, organic lighting shifts, and high visual fidelity.`;

/**
 * Couple Identity Mapping (English — Couple branch only)
 * From AI Prime Studio Prompt Standard v1.1 Section 6
 */
export const COUPLE_PHOTO_MAPPING = `COUPLE INPUT MAPPING:
SLOT A / Person A: Use only the image uploaded in the configured Person A slot as Person A's identity reference.
SLOT B / Person B: Use only the image uploaded in the configured Person B slot as Person B's identity reference.

Keep Person A and Person B as two distinct people. Never blend, average, exchange or cross-apply their faces. Follow the template's subject/shot map to determine where each person appears. Preserve each person's identity independently across cuts and camera angles. If the selected provider cannot reliably preserve two separate identities, stop and report the limitation rather than claiming success.`;

export const COUPLE_VIDEO_MAPPING = `COUPLE VIDEO IDENTITY MAPPING:
SLOT A / Person A: Customer Person A reference image maps strictly to Subject A in the scene.
SLOT B / Person B: Customer Person B reference image maps strictly to Subject B in the scene.

Strictly maintain two independent, separate human identities throughout the entire video. Absolutely never cross-fuse, blend, or average their features. Maintain consistent identity separation across camera cuts and motion transitions.`;

/**
 * Helper to build wardrobe instructions based on customer choice and template setting
 * From AI Prime Studio Prompt Standard v1.1 Section 7
 */
export function getWardrobePrompt(wardrobeSource?: string): string {
  const normalized = wardrobeSource
    ?.toLowerCase()
    .replace('customer_photo', 'my_photo')
    .replace('template_video', 'template')
    .trim();

  switch (normalized) {
    case 'my_photo':
      return `WARDROBE SELECTION: Use the customer photo's visible outfit details. If the outfit is not clearly visible or lacks detail, fall back to the template/source outfit. Do not invent unseen clothing details.`;
    case 'template':
      return `WARDROBE SELECTION: Strictly preserve the source video or template designated AFTER reference clothing.`;
    case 'auto':
    default:
      return `WARDROBE SELECTION (AUTO): If customer photo shows clear and sufficient clothing, use the customer's outfit; if photo is a close-up face shot or clothing is unclear, preserve the source-video/template outfit. Never invent unseen clothing.`;
  }
}

export interface PromptAssemblyOptions {
  categoryPrompt?: string;
  templateRecipePrompt?: string;
  userCustomInstructions?: string;
  templateTitle?: string;
  templateCategory?: string;
  hasAfterReference?: boolean;
  hasBeforeReference?: boolean;
  outputType?: 'photo' | 'video';
  workflow?: string;
  hasDrivingVideo?: boolean;
  isCouple?: boolean;
  wardrobeSource?: 'auto' | 'my_photo' | 'template';
}

/**
 * Builds the authoritative modular prompt following Prompt Standard v1.1 hierarchy:
 * Modality Base -> (Couple Mapping) -> Category Context -> Template Master Recipe -> Wardrobe Rule -> Customer Instructions
 */
export function buildUnifiedGenerationPrompt(options: PromptAssemblyOptions): string {
  const sections: string[] = [GLOBAL_PROMPT_MARKER];

  // 1. Modality & Workflow Base Selector
  if (options.outputType === 'photo') {
    sections.push(PHOTO_GLOBAL_PROMPT);
    if (options.isCouple) {
      sections.push(COUPLE_PHOTO_MAPPING);
    }
  } else if (options.outputType === 'video') {
    if (options.workflow === 'MOTION_TRANSFER') {
      sections.push(MOTION_TRANSFER_PROMPT);
    } else if (options.workflow === 'VIDEO_EDIT') {
      sections.push(VIDEO_EDIT_PROMPT);
    } else if (options.workflow === 'IMAGE_TO_VIDEO' || !options.hasDrivingVideo) {
      sections.push(IMAGE_TO_VIDEO_PROMPT);
    } else {
      // VIDEO_FACE_REPLACEMENT or OBJECT_SWAP
      sections.push(VIDEO_SOURCE_PRESERVING_PROMPT);
    }
    if (options.isCouple) {
      sections.push(COUPLE_VIDEO_MAPPING);
    }
  } else {
    // Default fallback
    sections.push(GLOBAL_TEMPLATE_INTERPRETATION_PROMPT);
    if (options.isCouple) {
      sections.push(COUPLE_PHOTO_MAPPING);
    }
  }

  // 2. Category Context
  if (options.templateCategory || options.categoryPrompt) {
    const categoryName = options.templateCategory || 'General';
    const catPrompt = options.categoryPrompt?.trim();
    if (catPrompt) {
      sections.push(
        `--- CATEGORY CONTEXT (${categoryName}) ---\n${catPrompt}`
      );
    }
  }

  // 3. Template Master Recipe (Untruncated)
  if (options.templateRecipePrompt && options.templateRecipePrompt.trim()) {
    const recipePrompt = options.templateRecipePrompt.trim();
    if (recipePrompt !== options.categoryPrompt?.trim()) {
      sections.push(
        `--- TEMPLATE SPECIFIC RECIPE (${options.templateTitle || 'Active Template'}) ---\n${recipePrompt}`
      );
    }
  }

  // 4. Wardrobe Rules
  if (options.wardrobeSource) {
    sections.push(getWardrobePrompt(options.wardrobeSource));
  }

  // 5. Customer Custom Instructions (Sanitized)
  if (options.userCustomInstructions && options.userCustomInstructions.trim()) {
    const sanitizedCustomerInput = options.userCustomInstructions.trim().slice(0, 300);
    sections.push(
      `--- OPTIONAL CUSTOMER INSTRUCTIONS ---\n${sanitizedCustomerInput}`
    );
  }

  return sections.join('\n\n');
}
