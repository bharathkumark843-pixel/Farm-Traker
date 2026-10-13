import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { HomeStackParamList } from '../navigation/RootNavigator';
import { useApp } from '../store/AppContext';
import { BigButton } from '../components/BigButton';
import { SummaryCard } from '../components/SummaryCard';
import { ProductCard } from '../components/ProductCard';
import { isExpiringSoon, isExpired, isLowStock } from '../utils/alerts';
import { cropLabel, normalizeCrop, Lang } from '../db/types';
import { getProfile } from '../db/database';
import { t, getLang, syncLang } from '../i18n';
import { theme } from '../theme';

type Props = NativeStackScreenProps<HomeStackParamList, 'FieldDetail'>;

// Reuses current Home/Inventory summary, filtered by crop. Offline.
export function FieldDetailScreen({ navigation, route }: Props) {
  const { products, logs, refresh } = useApp();
  const crop = route.params.crop;
  const [lang, setLang] = useState<Lang>(getLang());

  React.useEffect(() => {
    const unsub = navigation.addListener('focus', () => {
      refresh();
      getProfile().then((p) => { setLang(p.lang); syncLang(p.lang); }).catch(() => {});
    });
    getProfile().then((p) => { setLang(p.lang); syncLang(p.lang); }).catch(() => {});
    return unsub;
  }, [navigation, refresh]);

  const pick = (enText: string, teText: string) =>
    lang === 'te' ? { primary: teText || enText, secondary: enText } : { primary: enText, secondary: teText };

  const cropLogs = crop === 'All' ? logs : logs.filter((l) => normalizeCrop(l.crop) === crop);
  const productIds = new Set(cropLogs.map((l) => l.productId));
  const scoped = crop === 'All' ? products : products.filter((p) => productIds.has(p.id) || true);
  // Note: products have no crop column; show all + highlight used-in-crop. Filter tightens once logs exist.
  const list = crop === 'All' ? scoped : scoped.filter((p) => productIds.size === 0 || productIds.has(p.id));

  const low = list.filter(isLowStock);
  const expiring = list.filter((p) => isExpiringSoon(p) || isExpired(p));
  const title = crop === 'All' ? pick(t('allProducts'), 'అన్ని ఉత్పత్తులు') : pick(crop, cropLabel(crop as any, 'te'));

  return (
    <ScrollView style={styles.c} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.title}>{title.primary}</Text>
      <Text style={styles.subTitle}>{title.secondary} • Offline / ఆఫ్‌లైన్</Text>
      <View style={styles.row}>
        <SummaryCard label={t('items')} value={list.length} />
        <SummaryCard label={t('runningLow')} value={low.length} warn={low.length > 0} />
      </View>
      <View style={styles.row}>
        <SummaryCard label={t('expiring')} value={expiring.length} warn={expiring.length > 0} />
        <SummaryCard label={t('usageLogs')} value={cropLogs.length} />
      </View>
      <BigButton title="📷  SCAN (auto-tags crop)" onPress={() => navigation.navigate('Scan' as any, { crop } as any)} />
      <BigButton title="📦  ALL PRODUCTS" onPress={() => navigation.navigate('Inventory' as any)} variant="secondary" />
      <BigButton title="📊  REPORTS" onPress={() => navigation.navigate('Reports' as any)} variant="secondary" />
      <Text style={styles.section}>{t('products')} {crop === 'All' ? '' : `— ${title.primary}`}</Text>
      {list.length === 0 && <Text style={styles.empty}>{t('noProductsFor')} {title.primary}. Tap Scan.</Text>}
      {list.slice(0, 20).map((p) => (
        <ProductCard key={p.id} product={p} onPress={() => navigation.navigate('Details' as any, { productId: p.id } as any)} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: theme.colors.background },
  title: { fontSize: 28, fontWeight: 'bold', color: theme.colors.text },
  subTitle: { fontSize: 16, color: theme.colors.muted, marginBottom: 8 },
  row: { flexDirection: 'row' },
  section: { fontSize: 20, fontWeight: 'bold', marginTop: 16, marginBottom: 8, color: theme.colors.text },
  empty: { fontSize: 18, color: theme.colors.muted },
});
