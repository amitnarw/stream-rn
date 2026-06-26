/**
 * Theme & Design Tokens for Sozo RN Android
 * Defines the unified, premium, frosted glass design system.
 */
export const theme = {
  colors: {
    // Backgrounds
    background: '#050505',
    placeholder: '#121214',
    
    // Glassmorphism overlays & cards
    cardBg: 'rgba(20, 18, 24, 0.65)',
    cardBorder: 'rgba(255, 255, 255, 0.08)',
    
    // Overlay backdrops (used with native BlurViews for readability)
    overlayBg: 'rgba(15, 15, 20, 0.45)',
    overlayTint: 'rgba(15, 15, 20, 0.38)',
    
    // Text typography
    textPrimary: '#ffffff',
    textSecondary: '#A0A0A5',
    textMuted: '#8E8D92',
    
    // Accents & glows
    accent: '#0047FF',
    accentLight: '#5580FF',
    accentGlow: 'rgba(0, 71, 255, 0.12)',
    
    // Pink/Rose accents (destructive buttons, active heart)
    rose: '#ff4a7d',
    roseBg: 'rgba(255, 74, 125, 0.08)',
    roseBorder: 'rgba(255, 74, 125, 0.25)',
  },
  
  // Shared layout dimensions
  layout: {
    cardRadius: 20,
    headerHeight: 48,
    headerRadius: 24,
    headerMarginHorizontal: 20,
  },
  
  // Pre-configured style blocks
  glass: {
    // Standard frosted card border styling
    card: {
      backgroundColor: 'rgba(20, 18, 24, 0.65)',
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.08)',
      borderRadius: 20,
    },
    
    // High-performance CSS glass shadow for list rows (eliminates lag by avoiding native blurs in loops)
    listRowPlay: {
      backgroundColor: 'rgba(255, 255, 255, 0.85)',
      borderWidth: 1.5,
      borderColor: 'rgba(255, 255, 255, 0.45)',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 4,
      elevation: 3,
    },
  },
};
