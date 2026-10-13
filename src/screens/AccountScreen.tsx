import React, { useState } from 'react';
import { Text, TextInput, ScrollView, StyleSheet, Alert } from 'react-native';
import { BigButton } from '../components/BigButton';
import { getProfile, saveProfile } from '../db/database';
import { Lang, toE164India, isValidPincode } from '../db/types';
import { logsToCSV } from '../utils/csv';
import { useApp } from '../store/AppContext';
import { notifyAuthChanged } from '../store/authBus';
import { syncLang } from '../i18n';
import { theme } from '../theme';

// Offline profile + settings.
export function AccountScreen() {
  const { products, logs } = useApp();
  const [phone, setPhone] = useState('');
  const [phoneDigits, setPhoneDigits] = useState('');
  const [name, setName] = useState('');
  const [village, setVillage] = useState('');
  const [pincode, setPincode] = useState('');
  const [acres, setAcres] = useState('');
  const [formError, setFormError] = useState('');
  const [lang, setLang] = useState<Lang>('en');

  React.useEffect(() => {
    getProfile().then((p) => {
      setPhone(p.phoneE164); setPhoneDigits(p.phoneE164.replace(/^\+91/, ''));
      setName(p.name); setVillage(p.village); setPincode(p.pincode || ''); setAcres(p.acres ? String(p.acres) : '');
      setLang(p.lang);
    });
  }, []);

  const input = { borderWidth: 1, borderColor: theme.colors.cardBorder, borderRadius: 12, fontSize: 20, padding: 14, marginBottom: 12, minHeight: 60, backgroundColor: theme.colors.card, color: theme.colors.text } as any;

  async function save() {
    const e164 = toE164India(phoneDigits);
    if (!e164) { setFormError('Enter a valid 10-digit mobile number. / 10 అంకెల నంబర్ ఇవ్వండి.'); return; }
    if (pincode.trim() && !isValidPincode(pincode)) { setFormError('Enter a valid 6-digit area PIN code. / 6 అంకెల పిన్ కోడ్ ఇవ్వండి.'); return; }
    setFormError('');
    const acresNum = Math.max(0, Number(acres) || 0);
    const p = await getProfile();
    const changed = e164 !== p.phoneE164;
    if (changed) {
      // New number must prove OTP on the login page — never silently swap it.
      await saveProfile({ ...p, phoneE164: e164, phoneVerified: false, name, village, pincode: pincode.trim(), acres: acresNum, lang, onboarded: false });
      syncLang(lang);
      notifyAuthChanged();
      Alert.alert('Verify number', 'Number changed. Please verify the OTP on the login page.');
      return;
    }
    await saveProfile({ ...p, phoneE164: e164, name, village, pincode: pincode.trim(), acres: acresNum, lang });
    syncLang(lang);
    setPhone(e164);
    Alert.alert('Saved', 'Profile updated offline.');
  }

  async function logout() {
    Alert.alert('Log out? / లాగ్ అవుట్ కావాలా?', 'Unsaved edits will stay on this phone.', [
      { text: 'Cancel' },
      {
        text: 'Log out', style: 'destructive',
        onPress: async () => {
          const p = await getProfile();
          await saveProfile({ ...p, onboarded: false });
          notifyAuthChanged();
        },
      },
    ]);
  }

  const nameOf = (id: string) => products.find((p) => p.id === id)?.name ?? id;
  const pick = (enText: string, teText: string) =>
    lang === 'te' ? { primary: teText || enText, secondary: enText } : { primary: enText, secondary: teText };
  const heading = pick('Account', 'ఖాతా');

  return (
    <ScrollView style={styles.c} contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Account / ఖాతా</Text>
      <Text style={styles.sub}>{heading.secondary} • {phone || 'No number'} • Offline / ఆఫ్‌లైన్ • {products.length} {pick('products', 'ఉత్పత్తులు').primary} • {logs.length} {pick('logs', 'నమోదులు').primary}</Text>
      <Text style={styles.label}>{pick('Mobile number (+91)', 'మొబైల్ నంబర్ (+91)').primary}</Text>
      <Text style={styles.labelSub}>{pick('Mobile number (+91)', 'మొబైల్ నంబర్ (+91)').secondary}</Text>
      <TextInput style={input} value={phoneDigits} onChangeText={setPhoneDigits} keyboardType="phone-pad" placeholder="9xxxxxxxxx" placeholderTextColor={theme.colors.muted} />
      <Text style={styles.label}>{pick('Name', 'పేరు').primary}</Text>
      <TextInput style={input} value={name} onChangeText={setName} placeholder="Your name / మీ పేరు" placeholderTextColor={theme.colors.muted} />
      <Text style={styles.label}>{pick('Village', 'గ్రామం').primary}</Text>
      <TextInput style={input} value={village} onChangeText={setVillage} placeholder="Village / గ్రామం" placeholderTextColor={theme.colors.muted} />
      <Text style={styles.label}>{pick('Area PIN code', 'ప్రాంత పిన్ కోడ్').primary}</Text>
      <TextInput style={input} value={pincode} onChangeText={(v) => setPincode(v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" placeholder="e.g. 522001" placeholderTextColor={theme.colors.muted} />
      <Text style={styles.label}>{pick('Land (acres)', 'భూమి (ఎకరాలు)').primary}</Text>
      <TextInput style={input} value={acres} onChangeText={setAcres} keyboardType="decimal-pad" placeholder="e.g. 2.5" placeholderTextColor={theme.colors.muted} />
      <Text style={styles.label}>{pick('Language', 'భాష').primary}</Text>
      <BigButton title={lang === 'en' ? '● English' : 'English'} onPress={() => setLang('en')} variant={lang === 'en' ? 'primary' : 'secondary'} />
      <BigButton title={lang === 'te' ? '● తెలుగు' : 'తెలుగు'} onPress={() => setLang('te')} variant={lang === 'te' ? 'primary' : 'secondary'} />
      {formError ? <Text style={styles.error}>{formError}</Text> : null}
      <BigButton title="💾 SAVE (offline) / భద్రపరచు" onPress={save} />
      <BigButton title={pick('🚪 LOG OUT', '🚪 లాగ్ అవుట్').primary} onPress={logout} variant="danger-outline" />
      <Text style={styles.hint}>CSV rows available: {logsToCSV(logs, nameOf).split('\n').length - 1}. Full export stays in Reports.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: theme.colors.background },
  title: { fontSize: 28, fontWeight: 'bold', color: theme.colors.text },
  sub: { fontSize: 16, color: theme.colors.muted, marginBottom: 12 },
  label: { fontSize: 20, fontWeight: 'bold', marginBottom: 2, color: theme.colors.text },
  labelSub: { fontSize: 16, color: theme.colors.muted, marginBottom: 6 },
  error: { fontSize: 18, fontWeight: 'bold', color: theme.colors.danger, backgroundColor: theme.colors.dangerSoft, borderWidth: 1, borderColor: theme.colors.danger, padding: 12, borderRadius: 12, marginTop: 8, marginBottom: 8, overflow: 'hidden' },
  hint: { fontSize: 16, color: theme.colors.muted, marginTop: 8, textAlign: 'center' },
});
