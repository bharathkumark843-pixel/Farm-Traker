import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, Image, Alert, ActivityIndicator, TouchableOpacity } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import { BigButton } from '../components/BigButton';
import { getProduct, getLogs, deleteProduct, deleteUsageLog, saveProduct } from '../db/database';
import { Product, UsageLog } from '../db/types';
import { isExpired, isExpiringSoon, isLowStock } from '../utils/alerts';
import { useApp } from '../store/AppContext';
import { theme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Details'>;

export function ProductDetailsScreen({ navigation, route }: Props) {
  const { refresh } = useApp();
  const [product, setProduct] = useState<Product | null>(null);
  const [logs, setLogs] = useState<UsageLog[]>([]);

  const load = useCallback(async () => {
    const p = await getProduct(route.params.productId);
    setProduct(p);
    setLogs(await getLogs(route.params.productId));
  }, [route.params.productId]);

  React.useEffect(() => {
    const unsub = navigation.addListener('focus', load);
    load();
    return unsub;
  }, [navigation, load]);

  if (!product) return <View style={{ flex: 1, justifyContent: 'center', padding: 40 }}><ActivityIndicator size="large" /><Text style={styles.msg}>Loading…</Text></View>;

  const expired = isExpired(product);
  const soon = isExpiringSoon(product);
  const low = isLowStock(product);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      {product.photoUri ? <Image source={{ uri: product.photoUri }} style={styles.photo} /> : null}
      <Text style={styles.name}>{product.name}</Text>
      <Text style={styles.sub}>{product.category} • {product.manufacturer}</Text>
      {expired && <Text style={styles.expired}>⛔ EXPIRED — do not use. Check label.</Text>}
      {!expired && soon && <Text style={styles.warn}>⚠️ Expires on {product.expiryDate} (within 30 days)</Text>}
      {low && <Text style={styles.warn}>⚠️ Low stock: {product.quantityRemaining} {product.unit} left</Text>}

      <View style={styles.info}>
        <Text style={styles.row}>Remaining: {product.quantityRemaining} {product.unit}</Text>
        <Text style={styles.row}>Expiry: {product.expiryDate || '—'}</Text>
        <Text style={styles.row}>Barcode: {product.barcode || '—'}</Text>
        <Text style={styles.row}>Label: {product.labelInfo || '—'}</Text>
      </View>

      <BigButton title="📝  LOG USAGE" onPress={() => navigation.navigate('LogUsage', { productId: product.id })} />
      <BigButton title="✏️  EDIT PRODUCT" onPress={() => navigation.navigate('AddEdit', { productId: product.id })} variant="secondary" />
      <BigButton
        title="🗑️  DELETE"
        variant="danger-outline"
        onPress={() =>
          Alert.alert('Delete?', 'Delete this product and its history?', [
            { text: 'Cancel' },
            {
              text: 'Delete', style: 'destructive',
              onPress: async () => { await deleteProduct(product.id); await refresh(); navigation.navigate('HomeMain' as any); },
            },
          ])
        }
      />

      <Text style={styles.section}>Usage History ({logs.length})</Text>
      {logs.map((l) => (
        <View key={l.id} style={styles.log}>
          <Text style={styles.logText}>{l.date} — {l.quantityUsed} used</Text>
          <Text style={styles.logSub}>{l.crop} • {l.field} • {l.purposePest}</Text>
          {l.note ? <Text style={styles.logSub}>{l.note}</Text> : null}
          <TouchableOpacity
            style={styles.logDeleteBtn}
            accessibilityRole="button"
            accessibilityLabel={`Delete entry ${l.date}`}
            onPress={() =>
              Alert.alert('Delete entry?', `${l.date} — ${l.quantityUsed} used. Stock will be restored.`, [
                { text: 'Cancel' },
                {
                  text: 'Delete', style: 'destructive',
                  onPress: async () => {
                    await deleteUsageLog(l.id);
                    try {
                      const prod = await getProduct(product.id);
                      if (prod) {
                        prod.quantityRemaining = Math.min(prod.quantityTotal, prod.quantityRemaining + Number(l.quantityUsed || 0));
                        prod.updatedAt = new Date().toISOString();
                        await saveProduct(prod);
                      }
                    } catch {}
                    await refresh(); load();
                  },
                },
              ])
            }
          >
            <Text style={styles.logDelete}>Delete entry / తొలగించు</Text>
          </TouchableOpacity>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  msg: { fontSize: 20, textAlign: 'center', marginTop: 40, color: theme.colors.muted },
  photo: { width: '100%', height: 240, borderRadius: theme.radius },
  name: { fontSize: 28, fontWeight: 'bold', marginTop: 12, color: theme.colors.text },
  sub: { fontSize: 18, color: theme.colors.muted },
  expired: { fontSize: 18, fontWeight: 'bold', color: theme.colors.danger, backgroundColor: theme.colors.dangerSoft, borderWidth: 1, borderColor: theme.colors.danger, padding: 12, borderRadius: 12, marginTop: 12, overflow: 'hidden' },
  warn: { fontSize: 18, fontWeight: 'bold', color: theme.colors.warning, backgroundColor: theme.colors.warningSoft, borderWidth: 1, borderColor: theme.colors.warning, padding: 12, borderRadius: 12, marginTop: 8, overflow: 'hidden' },
  info: { backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.cardBorder, borderRadius: 12, padding: 16, marginTop: 12, ...theme.shadow },
  row: { fontSize: 18, marginBottom: 4, color: theme.colors.text },
  section: { fontSize: 22, fontWeight: 'bold', marginTop: 16, marginBottom: 8, color: theme.colors.text },
  log: { backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.cardBorder, borderRadius: 12, padding: 12, marginBottom: 8 },
  logText: { fontSize: 18, fontWeight: 'bold', color: theme.colors.text },
  logSub: { fontSize: 16, color: theme.colors.muted },
  logDeleteBtn: { minHeight: 48, justifyContent: 'center', marginTop: 6, paddingVertical: 8 },
  logDelete: { fontSize: 18, fontWeight: 'bold', color: theme.colors.danger },
});
