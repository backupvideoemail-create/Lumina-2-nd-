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
  mediaType?: 'image' | 'video';
  coverMedia?: string;
  isActive?: boolean;
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
    likesCount: '1.4K',
    commentsCount: '180',
    sharesCount: '340',
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
    likesCount: '1.8K',
    commentsCount: '210',
    sharesCount: '520',
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
    likesCount: '1.2K',
    commentsCount: '140',
    sharesCount: '280',
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
    likesCount: '1.5K',
    commentsCount: '190',
    sharesCount: '410',
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
    likesCount: '1.1K',
    commentsCount: '120',
    sharesCount: '230',
    gradientOverlay: 'from-[#190a2a]/80 via-transparent to-[#08080a]'
  }
];

/**
 * QUICK CATEGORY ICONS (Compact Trending & Viral categories)
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
    id: 'cat_trending_reels',
    name: 'Trending Reels',
    categoryFilter: 'Trending',
    iconType: 'trending',
    glowColor: 'from-amber-600/30 to-amber-900/40 border-amber-500/40',
    badge: 'HOT'
  },
  {
    id: 'cat_viral_templates',
    name: 'Viral Templates',
    categoryFilter: 'Trending',
    iconType: 'dance',
    glowColor: 'from-orange-600/30 to-rose-900/40 border-orange-500/40',
    badge: 'VIRAL'
  },
  {
    id: 'cat_cinematic',
    name: 'Cinematic AI',
    categoryFilter: 'Cinematic',
    iconType: 'horse',
    glowColor: 'from-yellow-600/30 to-amber-900/40 border-yellow-500/40'
  },
  {
    id: 'cat_luxury_vip',
    name: 'Luxury & VIP',
    categoryFilter: 'Luxury',
    iconType: 'wedding',
    glowColor: 'from-amber-600/30 to-yellow-900/40 border-amber-500/40'
  }
];

/**
 * QUICK PILL TAGS UNDER SEARCH BAR
 */
export const QUICK_PILL_TAGS = [
  { label: 'Trending Reels', filter: 'Trending' },
  { label: 'Viral Motion', filter: 'Dance' },
  { label: 'Cinematic Portrait', filter: 'Cinematic' },
  { label: 'Luxury & VIP', filter: 'Luxury' },
  { label: 'Retro 80s', filter: 'Retro 80s' },
  { label: 'Supercars & Swag', filter: 'Trending' }
];
