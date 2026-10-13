// Harvest Gold theme: warm ivory background, leaf-green primary actions,
// marigold accent, clay warnings. Senior-friendly: large touch targets,
// near-black text, warm (not grey) borders.
export const theme = {
  colors: {
    primary: '#33691E', // leaf green — main actions
    primaryDark: '#1F4D16',
    accent: '#FF8F00', // marigold — active tab, highlights
    background: '#FFF8E1', // warm ivory
    card: '#FFFFFF',
    lightGreen: '#FFECB3', // warm tint placeholder fill
    text: '#212121',
    muted: '#5F4B32',
    danger: '#c62828',
    dangerSoft: '#FEF2F2',
    warning: '#BF360C', // clay
    warningSoft: '#FBE9E7',
    cardBorder: '#E5D9B8', // warm border
    cardGradient: ['#FFFFFF', '#F3E5BD'] as [string, string], // 3D card shading: light top → warm depth
  },
  fontSize: {
    small: 16,
    medium: 20,
    large: 24,
    title: 28,
  },
  radius: 14,
  // Minimum button height for older users — unchanged
  minTouchHeight: 64,
  inputHeight: 60,
  shadow: {
    shadowColor: '#5D4037',
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  } as const,
  spacing: {
    xs: 6,
    sm: 12,
    md: 16,
    lg: 24,
  } as const,
};
