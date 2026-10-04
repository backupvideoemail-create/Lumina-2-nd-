export interface HomeBannerItem {
  id: string;
  title: string;
  highlightText?: string;
  subtitle: string;
  badge: string;
  badgeColor?: string; // e.g. 'amber', 'rose', 'cyan'
  image: string;
  targetTemplateId: string;
  category: string;
  likesCount: string;
  commentsCount: string;
  sharesCount: string;
  gradientOverlay?: string;
}

/**
 * HOME PAGE ROTATING HERO BANNERS CONFIGURATION
 * Edit, add, or remove banners here anytime to update the home page carousel!
 * The carousel automatically transitions every 4.5 seconds with pause-on-hover.
 */
export const HOME_HERO_BANNERS: HomeBannerItem[] = [
  {
    id: 'banner_dance_reels',
    title: 'Dance Reels',
    highlightText: 'Made with AI',
    subtitle: 'Hot Instagram Trend · Animate any photo into viral dance beats',
    badge: 'PRO',
    badgeColor: 'amber',
    image: 'https://images.unsplash.com/photo-1547153760-18fc86324498?auto=format&fit=crop&w=1200&q=80',
    targetTemplateId: 'tpl_viral_photo_dance_reel',
    category: 'Dance Video',
    likesCount: '10.8K',
    commentsCount: '1.2K',
    sharesCount: '2.5K',
    gradientOverlay: 'from-[#1a0826]/80 via-transparent to-[#08080a]'
  },
  {
    id: 'banner_full_swag_action',
    title: 'Full Swag 2',
    highlightText: 'Supercar & VIP',
    subtitle: 'Dramatic smoke, luxury cars & cinematic slow-motion aura',
    badge: 'VIRAL',
    badgeColor: 'rose',
    image: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1200&q=80',
    targetTemplateId: 'tpl_monaco_f1_motion',
    category: 'Trending',
    likesCount: '24.5K',
    commentsCount: '3.1K',
    sharesCount: '8.9K',
    gradientOverlay: 'from-[#1f0a0d]/80 via-transparent to-[#08080a]'
  },
  {
    id: 'banner_retro_80s_model',
    title: '1980s Retro Model',
    highlightText: 'Vintage Cinema',
    subtitle: 'Classic Bollywood & 80s analog film aesthetics with grainy golden warmth',
    badge: 'TRENDING',
    badgeColor: 'cyan',
    image: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=1200&q=80',
    targetTemplateId: 'tpl_neon_tokyo_cyber',
    category: 'Retro 80s',
    likesCount: '18.2K',
    commentsCount: '2.4K',
    sharesCount: '5.1K',
    gradientOverlay: 'from-[#081a24]/80 via-transparent to-[#08080a]'
  },
  {
    id: 'banner_wedding_proposal',
    title: 'Proposal & Wedding',
    highlightText: 'Royal Cinematic',
    subtitle: 'Magical rose petal fireworks, royal palace grandeur & fairy lighting',
    badge: 'HOT',
    badgeColor: 'amber',
    image: 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1200&q=80',
    targetTemplateId: 'tpl_baroque_gold_filigree',
    category: 'Proposal & Wedding',
    likesCount: '31.4K',
    commentsCount: '4.8K',
    sharesCount: '12.3K',
    gradientOverlay: 'from-[#241708]/80 via-transparent to-[#08080a]'
  },
  {
    id: 'banner_birthday_wishes',
    title: 'Birthday Magic',
    highlightText: 'Celebration 3D',
    subtitle: 'Glowing neon cake, gold confetti bursts & personalized celebration',
    badge: 'NEW',
    badgeColor: 'purple',
    image: 'https://images.unsplash.com/photo-1513151233558-d860c5398176?auto=format&fit=crop&w=1200&q=80',
    targetTemplateId: 'tpl_met_gala_couture',
    category: 'Birthday',
    likesCount: '15.6K',
    commentsCount: '1.9K',
    sharesCount: '4.2K',
    gradientOverlay: 'from-[#190a2a]/80 via-transparent to-[#08080a]'
  }
];

/**
 * QUICK CATEGORY ICONS (Displayed below carousel banner, matching reference screenshot)
 */
export interface QuickCategoryIcon {
  id: string;
  name: string;
  categoryFilter: string;
  iconType: 'birthday' | 'wedding' | 'dance' | 'horse' | 'faceswap' | 'trending';
  glowColor: string;
  badge?: string;
}

export const QUICK_CATEGORY_ICONS: QuickCategoryIcon[] = [
  {
    id: 'cat_birthday',
    name: 'Birthday',
    categoryFilter: 'Festival',
    iconType: 'birthday',
    glowColor: 'from-amber-600/30 to-amber-900/40 border-amber-500/40'
  },
  {
    id: 'cat_proposal',
    name: 'Proposal & Wedding',
    categoryFilter: 'Luxury',
    iconType: 'wedding',
    glowColor: 'from-orange-600/30 to-rose-900/40 border-orange-500/40'
  },
  {
    id: 'cat_dance',
    name: 'Dance Video',
    categoryFilter: 'Dance',
    iconType: 'dance',
    glowColor: 'from-yellow-600/30 to-amber-900/40 border-yellow-500/40',
    badge: 'HOT'
  },
  {
    id: 'cat_horse',
    name: 'Horse & Royal',
    categoryFilter: 'Cinematic',
    iconType: 'horse',
    glowColor: 'from-amber-600/30 to-yellow-900/40 border-amber-500/40'
  }
];

/**
 * QUICK PILL TAGS UNDER SEARCH BAR (Matching reference screenshot)
 */
export const QUICK_PILL_TAGS = [
  { label: 'Greetings and Wishes', filter: 'Festival' },
  { label: 'Instagram Poster', filter: 'Fashion' },
  { label: 'Devotional', filter: 'Cinematic' },
  { label: 'Viral Dance', filter: 'Dance' },
  { label: 'Retro 80s', filter: 'Trending' },
  { label: 'Supercars & Swag', filter: 'Trending' }
];
