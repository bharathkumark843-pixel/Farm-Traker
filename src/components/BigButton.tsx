import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ViewStyle } from 'react-native';
import { theme } from '../theme';

// Minimal large button for older users. Min height 64, font 22+.
// variant="primary" (solid green, main action), "secondary" (white, neutral),
// or "danger-outline" (white bg, red border/text for destructive actions).
export function BigButton({
  title,
  onPress,
  color,
  style,
  variant,
}: {
  title: string;
  onPress: () => void;
  color?: string;
  style?: ViewStyle;
  variant?: 'primary' | 'secondary' | 'danger-outline';
}) {
  const isSecondary = variant === 'secondary' && !color;
  const isDangerOutline = variant === 'danger-outline' && !color;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      style={[
        styles.btn,
        isSecondary ? styles.secondary : isDangerOutline ? styles.dangerOutline : { backgroundColor: color || theme.colors.primary },
        style,
      ]}
    >
      <Text style={[styles.text, isSecondary && styles.secondaryText, isDangerOutline && styles.dangerOutlineText]}>{title}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    minHeight: theme.minTouchHeight,
    borderRadius: theme.radius,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    marginVertical: 6,
    ...theme.shadow,
  },
  secondary: {
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
    shadowOpacity: 0,
    elevation: 0,
  },
  dangerOutline: {
    backgroundColor: theme.colors.card,
    borderWidth: 2,
    borderColor: theme.colors.danger,
    shadowOpacity: 0,
    elevation: 0,
  },
  text: { color: '#fff', fontSize: 22, fontWeight: 'bold', textAlign: 'center' },
  secondaryText: { color: theme.colors.text },
  dangerOutlineText: { color: theme.colors.danger },
});
