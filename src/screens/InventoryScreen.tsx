import React, { useState } from 'react';
import { View, Text, TextInput, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import { useApp } from '../store/AppContext';
import { ProductCard } from '../components/ProductCard';
import { theme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Inventory'>;

export function InventoryScreen({ navigation }: Props) {
  const { products, refresh } = useApp();
  const [query, setQuery] = useState('');

  React.useEffect(() => {
    const unsub = navigation.addListener('focus', refresh);
    return unsub;
  }, [navigation, refresh]);

  const q = query.trim().toLowerCase();
  const filtered = products.filter((p) =>
    !q ||
    p.name.toLowerCase().includes(q) ||
    (p.barcode || '').toLowerCase().includes(q) ||
    (p.category || '').toLowerCase().includes(q) ||
    (p.manufacturer || '').toLowerCase().includes(q)
  );

  return (
    <View style={styles.c}>
      <View style={styles.searchRow}>
        <TextInput
          style={[styles.search, { flex: 1, margin: 0 }]}
          placeholder="Search name / barcode / category… / వెతకండి…"
          placeholderTextColor={theme.colors.muted}
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
          accessibilityLabel="Search products"
        />
        {query.length > 0 && (
          <TouchableOpacity style={styles.clearBtn} onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel="Clear search">
            <Text style={styles.clearBtnText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.offlineBadge}>
        <Text style={styles.offlineBadgeText}>• Offline-ready / ఆఫ్‌లైన్‌లో పనిచేస్తుంది</Text>
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ padding: 16 }}
        ListEmptyComponent={
          <View style={{ alignItems: 'center' }}>
            <Text style={styles.empty}>No products found. / ఉత్పత్తులు లేవు.</Text>
            <Text style={styles.emptySub}>Tap Scan to add one. / జోడించడానికి స్కాన్ నొక్కండి.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <ProductCard product={item} onPress={() => navigation.navigate('Details', { productId: item.id })} />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: theme.colors.background },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, margin: 16, marginBottom: 8 },
  search: {
    fontSize: 20,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
    borderRadius: 12,
    padding: 14,
    margin: 16,
    marginBottom: 0,
    minHeight: 60,
    backgroundColor: theme.colors.card,
    color: theme.colors.text,
  },
  clearBtn: { minHeight: 60, minWidth: 60, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.cardBorder, borderRadius: 12 },
  clearBtnText: { fontSize: 22, fontWeight: 'bold', color: theme.colors.text },
  offlineBadge: { alignSelf: 'flex-start', marginLeft: 16, marginBottom: 4, backgroundColor: '#E8F5E9', borderWidth: 1, borderColor: theme.colors.primary, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  offlineBadgeText: { fontSize: 16, fontWeight: 'bold', color: theme.colors.primaryDark },
  empty: { fontSize: 20, textAlign: 'center', marginTop: 40, color: theme.colors.muted },
  emptySub: { fontSize: 16, textAlign: 'center', marginTop: 6, color: theme.colors.muted },
});
