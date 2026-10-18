/**
 * Central Category Prompts Configuration.
 * 
 * Each photo category has one shared, centrally managed prompt.
 * Admin can edit these prompts, and new photo templates assigned to
 * a category inherit its prompt automatically.
 */

export const DEFAULT_CATEGORY_PROMPTS: Record<string, string> = {
  'Devotional': 'Devotional divine spiritual aesthetic. Maintain exact person identity, realistic facial features, and expression from Image 1. Seamlessly integrate the person into the sacred atmosphere, traditional divine attire, deity presence and composition (such as Lord Hanuman, Mahadev, or Shri Ram), and spiritual golden aura lighting from reference Image 2.',
  'Trending': 'High-end viral trend photographic transformation. Maintain exact subject face and identity from Image 1, seamlessly rendered into the exact wardrobe, aesthetic lighting, background, and color palette from reference Image 2.',
  'Royal Swag': 'Royal luxury maharaja swag portrait. Maintain exact face and identity from Image 1, styled in royal velvet sherwani, luxury palace background, jewelry, and authoritative cinematic lighting matching Image 2.',
  'Navratri Special': 'Festive Navratri celebration photo. Maintain exact person face and identity from Image 1, styled in festive traditional Indian celebration attire matching reference Image 2 with puja elements and festive lighting.',
  'Male Hairstyle': 'Male grooming and hairstyle transformation. Maintain exact facial identity and facial geometry from Image 1, but accurately apply the exact hair style, cut, volume, and texture shown in style reference Image 2 with studio lighting.',
  'Retro 80s': 'Authentic 1980s Bollywood vintage portrait. Maintain exact identity from Image 1 with vintage 80s color saturation, retro hair styling, classic film grain, and disco lighting from Image 2.',
  'Fashion': 'High-fashion editorial photoshoot. Maintain exact person identity from Image 1 with sleek designer styling, runway lighting, luxury apparel, and sharp magazine aesthetic matching reference Image 2.',
  'Portrait': 'Master studio portrait photograph. Maintain exact person identity and realistic skin textures from Image 1 with dramatic key lighting, aesthetic bokeh, and polished studio color grading from Image 2.',
  'Couple': 'Romantic cinematic couple photoshoot. Maintain person identity from Image 1 integrated into the romantic pose, scenic background, and aesthetic warmth of reference Image 2.',
  'Festival': 'Vibrant Indian festival celebration portrait. Maintain exact facial identity from Image 1 with festive ethnic wear, celebratory lights, and joyous holiday environment matching reference Image 2.',
  'Daily Status': 'Aesthetic daily status portrait. Maintain person face and identity from Image 1, placed into modern vibrant social status composition with inspirational mood and color palette from reference Image 2.',
  'Birthday': 'Grand birthday celebration portrait. Maintain exact subject identity from Image 1 surrounded by elegant celebration decor, birthday balloons, festive golden sparkles, and celebratory lighting matching reference Image 2.',
  'Luxury': 'High-net-worth luxury lifestyle aesthetic. Maintain exact person identity from Image 1, styled with luxury supercar, private lounge, high-end attire, and golden hour lighting matching reference Image 2.',
  'Dance': 'Dynamic cinematic dance stage portrait. Maintain person identity from Image 1 with energetic choreography styling, stage neon spotlights, and cinematic flair matching reference Image 2.',
  'Cinematic': 'Blockbuster cinema still frame portrait. Maintain exact facial likeness and expressions from Image 1 with anamorphic lens flare, deep cinematic color grade, and dramatic volumetric lighting from Image 2.',
  'Creative': 'Surreal fine-art artistic portrait. Maintain person identity from Image 1 with creative abstract lighting, double-exposure elements, and editorial fine-art grading from reference Image 2.'
};

export const getPromptForCategory = (category: string, customPrompts?: Record<string, string>): string => {
  if (customPrompts && customPrompts[category]) {
    return customPrompts[category];
  }
  return DEFAULT_CATEGORY_PROMPTS[category] || DEFAULT_CATEGORY_PROMPTS['Trending'];
};
