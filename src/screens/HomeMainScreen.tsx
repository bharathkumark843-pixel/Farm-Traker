import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { HomeStackParamList } from '../navigation/RootNavigator';
import { FIELD_CROPS, cropLabel, normalizeCrop, PLANT_GROUPS, PLANT_KIND, FieldCrop, Lang } from '../db/types';
import { getProfile, saveProfile } from '../db/database';
import { theme } from '../theme';
import { useFocusEffect } from '@react-navigation/native';

type Props = NativeStackScreenProps<HomeStackParamList, 'HomeMain'>;

// Top 15% animated banner + search over 6 crops + grid. Offline.
export function HomeMainScreen({ navigation }: Props) {
  const [q, setQ] = useState('');
  const [fade] = useState(new Animated.Value(0));
  const [lang, setLang] = useState<Lang>('en');
  React.useEffect(() => {
    // JS driver on all platforms: useNativeDriver warns on web and buys
    // nothing for a one-shot 600ms opacity fade.
    Animated.timing(fade, { toValue: 1, duration: 600, useNativeDriver: false }).start();
    getProfile().then((p) => { if (p.lastCrop && p.lastCrop !== 'All') setQ(''); });
  }, [fade]);
  // Re-read language every time Home regains focus (changed in Account tab).
  useFocusEffect(
    React.useCallback(() => {
      let alive = true;
      getProfile().then((p) => { if (alive) setLang(p.lang); });
      return () => { alive = false; };
    }, [])
  );
  // Selected language goes big, the other small.
  const pick = (enText: string, teText: string) =>
    lang === 'te' ? { primary: teText || enText, secondary: enText } : { primary: enText, secondary: teText };

  const query = q.trim().toLowerCase();
  const rawQuery = q.trim();
  // Search matches EN id + Telugu label + farmer-spoken aliases (vepa, marri, ...).
  // NOTE: normalizeCrop() returns 'Other' for unknown input, so the alias
  // fallback must not match 'Other' generically — otherwise every gibberish
  // query shows the Other card and "No matches" is unreachable.
  function matchesCrop(c: FieldCrop): boolean {
    if (!query) return true;
    if (c.toLowerCase().includes(query)) return true;
    if (rawQuery && cropLabel(c, 'te').includes(rawQuery)) return true;
    const norm = normalizeCrop(rawQuery);
    if (norm !== 'Other' && norm === c) return true;
    return false;
  }
  const filtered = FIELD_CROPS.filter(matchesCrop);
  const banner = pick('🌾 Farm Tracker', '🌾 ఫామ్ ట్రాకర్');

  async function open(crop: FieldCrop | 'All') {
    const p = await getProfile();
    await saveProfile({ ...p, lastCrop: crop });
    navigation.navigate('FieldDetail', { crop });
  }

  function renderCard(c: FieldCrop) {
    const label = pick(c, cropLabel(c, 'te'));
    return (
      <TouchableOpacity key={c} style={styles.card} onPress={() => open(c)} accessibilityRole="button" accessibilityLabel={`${label.primary}, ${label.secondary}`}>
        <Text style={styles.cardPrimary}>{label.primary}</Text>
        <Text style={styles.cardSecondary}>{label.secondary}</Text>
      </TouchableOpacity>
    );
  }

  const isSearching = query.length > 0;
  const allLabel = pick('All products', 'అన్ని ఉత్పత్తులు');

  return (
    <ScrollView style={styles.c} contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      <Animated.View style={[styles.banner, { opacity: fade }]}>
        <Text style={styles.title}>{banner.primary}</Text>
        <Text style={styles.sub}>{banner.secondary}</Text>
        <View style={styles.offlineBadge}>
          <Text style={styles.offlineBadgeText}>{pick('• Offline-ready', '• ఆఫ్‌లైన్‌లో పనిచేస్తుంది').primary}</Text>
        </View>
      </Animated.View>
      <View style={styles.searchRow}>
        <TextInput
          style={[styles.search, { flex: 1, marginBottom: 0 }]}
          value={q}
          onChangeText={setQ}
          placeholder="🔍 Search field… e.g. vepa, mango, మర్రి"
          placeholderTextColor={theme.colors.muted}
          returnKeyType="search"
          accessibilityLabel="Search field, వెతకండి"
        />
        {q.length > 0 && (
          <TouchableOpacity style={styles.clearBtn} onPress={() => setQ('')} accessibilityRole="button" accessibilityLabel="Clear search">
            <Text style={styles.clearBtnText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>
      <TouchableOpacity style={styles.all} onPress={() => open('All')} accessibilityRole="button" accessibilityLabel="All products, అన్ని ఉత్పత్తులు">
        <Text style={styles.allText}>📦 {allLabel.primary}</Text>
        <Text style={styles.allSub}>{allLabel.secondary}</Text>
      </TouchableOpacity>
      {isSearching ? (
        <View style={styles.grid}>
          {filtered.filter((c) => c !== 'Other').map(renderCard)}
          {filtered.includes('Other' as FieldCrop) && renderCard('Other' as FieldCrop)}
          {filtered.length === 0 && (
            <View>
              <Text style={styles.empty}>{pick('No matches. Try another name.', 'ఫలితాలు లేవు. మరో పేరు ప్రయత్నించండి.').primary}</Text>
              <Text style={styles.emptySub}>{pick('No matches. Try another name.', 'ఫలితాలు లేవు. మరో పేరు ప్రయత్నించండి.').secondary}</Text>
              <TouchableOpacity style={styles.resetBtn} onPress={() => setQ('')}>
                <Text style={styles.resetBtnText}>{pick('Reset search', 'వెతుకులాట రీసెట్').primary}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      ) : (
        <>
          {PLANT_GROUPS.map((g) => {
            const items = FIELD_CROPS.filter((c) => PLANT_KIND[c] === g.kind);
            if (items.length === 0) return null;
            const header = pick(g.title_en, g.title_te);
            return (
              <View key={g.kind}>
                <Text style={styles.groupTitle}>{header.primary} <Text style={styles.groupSub}>{header.secondary}</Text></Text>
                <View style={styles.grid}>
                  {items.map(renderCard)}
                </View>
              </View>
            );
          })}
          <View style={styles.grid}>
            {renderCard('Other' as FieldCrop)}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: theme.colors.background },
  banner: { minHeight: 90, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  title: { fontSize: 32, fontWeight: 'bold', color: theme.colors.text },
  sub: { fontSize: 16, color: theme.colors.muted },
  offlineBadge: { marginTop: 6, backgroundColor: '#E8F5E9', borderWidth: 1, borderColor: theme.colors.primary, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  offlineBadgeText: { fontSize: 16, fontWeight: 'bold', color: theme.colors.primaryDark },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  search: { fontSize: 20, borderWidth: 1, borderColor: theme.colors.cardBorder, borderRadius: 12, padding: 14, minHeight: 60, backgroundColor: theme.colors.card, color: theme.colors.text, marginBottom: 12 },
  clearBtn: { minHeight: 60, minWidth: 60, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.cardBorder, borderRadius: 12 },
  clearBtnText: { fontSize: 22, fontWeight: 'bold', color: theme.colors.text },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  groupTitle: { fontSize: 22, fontWeight: 'bold', color: theme.colors.text, marginTop: 8, marginBottom: 8 },
  groupSub: { fontSize: 16, fontWeight: 'normal', color: theme.colors.muted },
  empty: { fontSize: 18, color: theme.colors.muted },
  emptySub: { fontSize: 16, color: theme.colors.muted, marginTop: 4 },
  resetBtn: { marginTop: 12, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.cardBorder, borderRadius: 12, padding: 14, minHeight: 56, justifyContent: 'center', alignItems: 'center' },
  resetBtnText: { fontSize: 20, fontWeight: 'bold', color: theme.colors.text },
  card: { width: '48%', backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.cardBorder, borderRadius: 12, padding: 16, marginBottom: 8, minHeight: 84, justifyContent: 'center' },
  cardPrimary: { fontSize: 22, fontWeight: 'bold', color: theme.colors.text },
  cardSecondary: { fontSize: 16, color: theme.colors.muted },
  all: { marginTop: 4, marginBottom: 12, padding: 16, borderRadius: 12, backgroundColor: theme.colors.primary, minHeight: 72, justifyContent: 'center' },
  allText: { color: '#fff', fontSize: 22, fontWeight: 'bold', textAlign: 'center' },
  allSub: { color: '#fff', fontSize: 16, textAlign: 'center', marginTop: 2, opacity: 0.9 },
});
