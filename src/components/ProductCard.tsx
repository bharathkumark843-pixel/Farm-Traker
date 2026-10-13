import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Product } from '../db/types';
import { isExpired, isExpiringSoon, isLowStock } from '../utils/alerts';
import { theme } from '../theme';

export function ProductCard({ product, onPress }: { product: Product; onPress: () => void }) {
  const expired = isExpired(product);
  const soon = isExpiringSoon(product);
  const low = isLowStock(product);

  return (
    <TouchableOpacity onPress={onPress} style={[styles.card, expired && styles.expiredCard]}>
      <LinearGradient colors={theme.colors.cardGradient} style={styles.gradient}>
        {product.photoUri ? (
          <Image source={{ uri: product.photoUri }} style={styles.photo} />
        ) : (
          <View style={[styles.photo, styles.photoPlaceholder]}>
            <Text style={{ fontSize: 28 }}>🧪</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{product.name}</Text>
          <Text style={styles.sub}>
            {product.category} • {product.quantityRemaining} {product.unit} left
          </Text>
          <Text style={styles.sub}>Expiry: {product.expiryDate || '—'}</Text>
          <View style={styles.badges}>
            {expired && <Text style={[styles.badge, styles.badgeRed]}>EXPIRED</Text>}
            {!expired && soon && <Text style={[styles.badge, styles.badgeOrange]}>EXPIRING SOON</Text>}
            {low && <Text style={[styles.badge, styles.badgeLow]}>LOW STOCK</Text>}
          </View>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
    borderRadius: theme.radius,
    marginVertical: 6,
    overflow: 'hidden',
    ...theme.shadow,
  },
  gradient: {
    flexDirection: 'row',
    padding: 12,
    alignItems: 'center',
  },
  expiredCard: { borderColor: theme.colors.danger, borderWidth: 2 },
  photo: { width: 56, height: 56, borderRadius: 10, marginRight: 12 },
  photoPlaceholder: { backgroundColor: theme.colors.lightGreen, justifyContent: 'center', alignItems: 'center' },
  name: { fontSize: 20, fontWeight: 'bold', color: theme.colors.text },
  sub: { fontSize: 16, color: theme.colors.muted, marginTop: 2 },
  badges: { flexDirection: 'row', marginTop: 6, flexWrap: 'wrap', gap: 6 },
  badge: { fontSize: 14, fontWeight: 'bold', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, marginRight: 6, overflow: 'hidden', letterSpacing: 0.4, minHeight: 28 },
  badgeRed: { backgroundColor: theme.colors.dangerSoft, color: theme.colors.danger, borderWidth: 1, borderColor: theme.colors.danger },
  badgeOrange: { backgroundColor: '#FFF3E0', color: '#7B3F00', borderWidth: 1, borderColor: '#E65100' },
  badgeLow: { backgroundColor: '#E8F5E9', color: theme.colors.primaryDark, borderWidth: 1, borderColor: theme.colors.primary },
});
