import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '../theme';

export function SummaryCard({ label, value, warn }: { label: string; value: string | number; warn?: boolean }) {
  return (
    <View style={[styles.card, warn && styles.warn]}>
      <LinearGradient colors={theme.colors.cardGradient} style={styles.gradient}>
        <Text style={styles.value}>{value}</Text>
        <Text style={styles.label}>{label}</Text>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderColor: theme.colors.cardBorder,
    borderWidth: 1,
    borderRadius: theme.radius,
    margin: 6,
    minHeight: 110,
    overflow: 'hidden',
    ...theme.shadow,
  },
  gradient: {
    flex: 1,
    padding: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  warn: { borderLeftWidth: 4, borderLeftColor: theme.colors.warning },
  value: { fontSize: 28, fontWeight: 'bold', color: theme.colors.text },
  label: {
    fontSize: 15,
    color: theme.colors.muted,
    textAlign: 'center',
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
