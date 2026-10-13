import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Linking, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { BigButton } from '../components/BigButton';
import { getLoans, getProfile, refreshLoansFromNetwork } from '../db/database';
import { Loan, Lang } from '../db/types';
import { theme } from '../theme';

export function LoansScreen() {
  const [items, setItems] = useState<Loan[]>([]);
  const [note, setNote] = useState('');
  const [lang, setLang] = useState<Lang>('en');
  const [selected, setSelected] = useState<Loan | null>(null);
  const load = useCallback(async () => {
    setItems(await getLoans());
    try {
      const p = await getProfile();
      setLang(p.lang);
    } catch {}
  }, []);
  useFocusEffect(
    React.useCallback(() => { load(); }, [load])
  );

  async function refresh() {
    const r = await refreshLoansFromNetwork();
    const fresh = await getLoans();
    setItems(fresh);
    if (selected) {
      const stillThere = fresh.find((s) => s.id === selected.id) ?? null;
      setSelected(stillThere);
    }
    if (r.updated) setNote(`Updated ${r.at.slice(0, 10)} • ${fresh.length} items`);
    else setNote(r.error ? `Offline — showing saved list (${r.error})` : 'Saved list — set a JSON URL in schemesSource.ts to refresh online');
    await load();
  }

  const pick = (enText: string, teText: string) =>
    lang === 'te' ? { primary: teText || enText, secondary: enText } : { primary: enText, secondary: teText };
  const heading = pick('Loans', 'రుణాలు');

  const titleOf = (s: Loan) => (lang === 'te' ? s.title_te || s.title_en : s.title_en);
  const subOf = (s: Loan) => (lang === 'te' ? s.title_en : s.title_te);
  const descOf = (s: Loan) => (lang === 'te' ? s.desc_te || s.desc_en : s.desc_en);

  // Detail page for one loan.
  if (selected) {
    const s = selected;
    return (
      <ScrollView style={styles.c} contentContainerStyle={{ padding: 16 }}>
        <BigButton title={pick('← ALL LOANS', '← అన్ని రుణాలు').primary} onPress={() => setSelected(null)} variant="secondary" />
        <Text style={styles.title}>{titleOf(s)}</Text>
        {subOf(s) ? <Text style={styles.sub}>{subOf(s)}</Text> : null}
        <View style={styles.card}>
          <Text style={styles.d}>{descOf(s)}</Text>
          {s.phone ? <Text style={styles.d}>📞 {s.phone}</Text> : null}
          {s.updatedOn ? <Text style={styles.meta}>Updated: {s.updatedOn}</Text> : null}
          {s.link ? (
            <TouchableOpacity style={styles.linkBtn} onPress={() => Linking.openURL(s.link!)} accessibilityRole="button" accessibilityLabel="Open government page">
              <Text style={styles.link}>Open government page / ప్రభుత్వ పేజీ →</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.c} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.title}>Loans / రుణాలు</Text>
      <Text style={styles.sub}>{heading.secondary} {note ? `• ${note}` : ''}</Text>
      <View style={styles.offlineBadge}>
        <Text style={styles.offlineBadgeText}>• Saved offline / ఆఫ్‌లైన్‌లో భద్రం • Needs internet to refresh</Text>
      </View>
      {items.map((s) => (
        <TouchableOpacity key={s.id} onPress={() => setSelected(s)} activeOpacity={0.8} style={styles.btn}>
          <View style={{ flex: 1 }}>
            <Text style={styles.t}>{titleOf(s)}</Text>
            {subOf(s) ? <Text style={styles.ts}>{subOf(s)}</Text> : null}
          </View>
          <Text style={styles.chev}>›</Text>
        </TouchableOpacity>
      ))}
      <BigButton title="⟳ REFRESH (online)" onPress={refresh} variant="secondary" />
      <BigButton title="🏦 APPLY ONLINE (JanSamarth)" onPress={() => Linking.openURL('https://www.jansamarth.in')} variant="secondary" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: theme.colors.background },
  title: { fontSize: 28, fontWeight: 'bold', color: theme.colors.text },
  sub: { fontSize: 16, color: theme.colors.muted, marginBottom: 12 },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    minHeight: 64,
  },
  card: { backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.cardBorder, borderRadius: 12, padding: 14, marginBottom: 10, marginTop: 12 },
  t: { fontSize: 20, fontWeight: 'bold', color: theme.colors.text },
  ts: { fontSize: 16, color: theme.colors.muted },
  chev: { fontSize: 32, fontWeight: 'bold', color: theme.colors.primary, marginLeft: 8 },
  d: { fontSize: 18, color: theme.colors.text, marginTop: 6 },
  meta: { fontSize: 16, color: theme.colors.muted, marginTop: 8 },
  linkBtn: { minHeight: 48, justifyContent: 'center', marginTop: 12 },
  link: { fontSize: 18, color: theme.colors.primary, fontWeight: 'bold' },
  offlineBadge: { alignSelf: 'flex-start', backgroundColor: '#E8F5E9', borderWidth: 1, borderColor: theme.colors.primary, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, marginBottom: 8 },
  offlineBadgeText: { fontSize: 16, fontWeight: 'bold', color: theme.colors.primaryDark },
});
