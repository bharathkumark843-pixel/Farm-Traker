import React, { useState } from 'react';
import { ScrollView, Text, TextInput, StyleSheet, Alert, View, TouchableOpacity } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { HomeStackParamList } from '../navigation/RootNavigator';
import { BigButton } from '../components/BigButton';
import { getProduct, addUsageLog, getProfile } from '../db/database';
import { newId, todayISO, FIELD_CROPS, normalizeCrop, PLANT_GROUPS, PLANT_KIND, FieldCrop, cropLabel, Lang } from '../db/types';
import { useApp } from '../store/AppContext';
import { theme } from '../theme';

type Props = NativeStackScreenProps<HomeStackParamList, 'LogUsage'>;

// Logs usage and subtracts from stock. Never goes negative without confirmation.
export function LogUsageScreen({ navigation, route }: Props) {
  const { refresh } = useApp();
  const initialCrop = normalizeCrop((route.params as any)?.crop ?? '');
  const [date, setDate] = useState(todayISO());
  const [qty, setQty] = useState('');
  const [crop, setCrop] = useState<FieldCrop>(initialCrop === 'Other' && !(route.params as any)?.crop ? 'Paddy' : initialCrop);
  const [otherCrop, setOtherCrop] = useState('');
  const [field, setField] = useState('');
  const [purpose, setPurpose] = useState('');
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState('');
  const [lang, setLang] = useState<Lang>('en');
  React.useEffect(() => { getProfile().then((p) => setLang(p.lang)).catch(() => {}); }, []);
  const pickGroup = (enText: string, teText: string) =>
    lang === 'te' ? { primary: teText || enText, secondary: enText } : { primary: enText, secondary: teText };

  const input = { borderWidth: 1, borderColor: theme.colors.cardBorder, borderRadius: 12, fontSize: 20, padding: 14, marginBottom: 12, minHeight: 60, backgroundColor: theme.colors.card, color: theme.colors.text } as any;

  function isValidDate(v: string): boolean {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
    if (!m) return false;
    const d = new Date(`${v.trim()}T00:00:00`);
    return !Number.isNaN(d.getTime()) && d.getFullYear() === Number(m[1]) && d.getMonth() + 1 === Number(m[2]) && d.getDate() === Number(m[3]);
  }

  function formatDateMask(v: string): string {
    const digits = v.replace(/\D/g, '').slice(0, 8);
    if (digits.length <= 4) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
  }

  async function save(confirmed = false) {
    const q = Number(qty);
    if (!q || q <= 0) {
      setFormError('Please enter how much was used. / ఎంత వాడారో ఇవ్వండి.');
      return;
    }
    if (date.trim() && !isValidDate(date)) {
      setFormError('Check date — use YYYY-MM-DD, e.g. 2026-10-05.');
      return;
    }
    setFormError('');
    const p = await getProduct(route.params.productId);
    if (!p) return;
    if (p.quantityRemaining - q < 0 && !confirmed) {
      Alert.alert('Low stock', `Only ${p.quantityRemaining} ${p.unit} left. Continue and set to zero?`, [
        { text: 'Cancel' },
        { text: 'Yes, continue', onPress: () => save(true) },
      ]);
      return;
    }
    await addUsageLog({
      id: newId(), productId: p.id, date: date || todayISO(),
      quantityUsed: q, crop: crop === 'Other' && otherCrop.trim() ? otherCrop.trim() : crop, field, purposePest: purpose, note,
      createdAt: new Date().toISOString(),
    });
    await refresh();
    navigation.navigate('Details', { productId: p.id });
  }

  return (
    <ScrollView style={styles.c} contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      <Text style={styles.label}>Date (YYYY-MM-DD)</Text>
      <TextInput style={input} value={date} onChangeText={(v) => setDate(formatDateMask(v))} placeholder="2026-10-05" placeholderTextColor={theme.colors.muted} keyboardType="number-pad" maxLength={10} />
      <Text style={styles.hint}>Use YYYY-MM-DD. Leave as today if unsure. / నేటి తేదీ అలాగే ఉంచండి.</Text>
      <Text style={styles.label}>Quantity Used *</Text>
      <TextInput style={input} value={qty} onChangeText={setQty} keyboardType="numeric" placeholder="e.g. 1" placeholderTextColor={theme.colors.muted} />
      <Text style={styles.label}>Crop / పంట *</Text>
      <Text style={styles.selected}>Selected: {crop === 'Other' && otherCrop.trim() ? otherCrop.trim() : crop} / {cropLabel(crop, 'te')}</Text>
      {PLANT_GROUPS.map((g) => (
        <View key={g.kind} style={{ marginBottom: 4 }}>
          <Text style={{ fontSize: 16, fontWeight: 'bold', color: theme.colors.muted, marginBottom: 6 }}>{pickGroup(g.title_en, g.title_te).primary} <Text style={{ fontWeight: 'normal' }}>{pickGroup(g.title_en, g.title_te).secondary}</Text></Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 8 }}>
            {FIELD_CROPS.filter((c) => PLANT_KIND[c] === g.kind).map((c) => (
              <TouchableOpacity key={c} onPress={() => setCrop(c)} accessibilityRole="button" accessibilityLabel={`Crop ${c}`} style={{ paddingHorizontal: 18, paddingVertical: 14, minHeight: 56, justifyContent: 'center', borderRadius: 999, borderWidth: 1, borderColor: crop === c ? theme.colors.primary : theme.colors.cardBorder, backgroundColor: crop === c ? theme.colors.primary : theme.colors.card, marginRight: 12, marginBottom: 8 }}>
                <Text style={{ fontSize: 18, fontWeight: 'bold', color: crop === c ? '#fff' : theme.colors.text }}>{c} <Text style={{ fontSize: 16, color: crop === c ? '#fff' : theme.colors.muted }}>{cropLabel(c, 'te')}</Text></Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      ))}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 8 }}>
        <TouchableOpacity onPress={() => setCrop('Other')} accessibilityRole="button" accessibilityLabel="Crop Other" style={{ paddingHorizontal: 18, paddingVertical: 14, minHeight: 56, justifyContent: 'center', borderRadius: 999, borderWidth: 1, borderColor: crop === 'Other' ? theme.colors.primary : theme.colors.cardBorder, backgroundColor: crop === 'Other' ? theme.colors.primary : theme.colors.card, marginRight: 8, marginBottom: 8 }}>
          <Text style={{ fontSize: 18, fontWeight: 'bold', color: crop === 'Other' ? '#fff' : theme.colors.text }}>Other <Text style={{ fontSize: 16, color: crop === 'Other' ? '#fff' : theme.colors.muted }}>{cropLabel('Other', 'te')}</Text></Text>
        </TouchableOpacity>
      </View>
      {crop === 'Other' && (
        <TextInput style={input} value={otherCrop} onChangeText={setOtherCrop} placeholder="Other crop name" placeholderTextColor={theme.colors.muted} />
      )}
      <Text style={styles.label}>Field Name (plot, e.g. North field)</Text>
      <TextInput style={input} value={field} onChangeText={setField} placeholder="e.g. North field" placeholderTextColor={theme.colors.muted} />
      <Text style={styles.label}>Pest / Purpose</Text>
      <TextInput style={input} value={purpose} onChangeText={setPurpose} placeholder="e.g. Bollworm" placeholderTextColor={theme.colors.muted} />
      <Text style={styles.label}>Note (optional)</Text>
      <TextInput style={input} value={note} onChangeText={setNote} multiline placeholderTextColor={theme.colors.muted} />
      {formError ? <Text style={styles.error}>{formError}</Text> : null}
      <BigButton title="✅  SAVE USAGE" onPress={() => save()} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: theme.colors.background },
  label: { fontSize: 20, fontWeight: 'bold', marginBottom: 6, color: theme.colors.text },
  hint: { fontSize: 16, color: theme.colors.muted, marginTop: -6, marginBottom: 12 },
  selected: { fontSize: 18, fontWeight: 'bold', color: theme.colors.primaryDark, backgroundColor: '#E8F5E9', borderWidth: 1, borderColor: theme.colors.primary, borderRadius: 10, padding: 10, marginBottom: 8, overflow: 'hidden' },
  error: { fontSize: 18, fontWeight: 'bold', color: theme.colors.danger, backgroundColor: theme.colors.dangerSoft, borderWidth: 1, borderColor: theme.colors.danger, padding: 12, borderRadius: 12, marginTop: 8, marginBottom: 8, overflow: 'hidden' },
});
