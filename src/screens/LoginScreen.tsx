import React, { useEffect, useRef, useState } from 'react';
import { Text, TextInput, StyleSheet, Alert, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { BigButton } from '../components/BigButton';
import { getProfile, saveProfile } from '../db/database';
import { toE164India, isValidPincode, Lang } from '../db/types';
import { syncLang } from '../i18n';
import { requestOtp, verifyOtp, OTP_LENGTH, RESEND_COOLDOWN_S } from '../utils/otp';
import { theme } from '../theme';

// Mobile-number + OTP login (replaces the old no-verify onboarding).
// Step 1: phone + location pincode + language → SEND OTP.
// Step 2: 6-digit code (+ resend timer, change number) → VERIFY & LOGIN.
// Demo provider shows the code on-screen (no SMS gateway in this offline
// build); a real Firebase provider plugs into utils/otp.ts with no UI change.
export function LoginScreen({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<1 | 2>(1);
  const [phone, setPhone] = useState('');
  const [pincode, setPincode] = useState('');
  const [lang, setLang] = useState<Lang>('en');
  const [sessionId, setSessionId] = useState('');
  const [demoCode, setDemoCode] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const input = { borderWidth: 1, borderColor: theme.colors.cardBorder, borderRadius: 12, fontSize: 22, padding: 14, marginBottom: 12, minHeight: 60, backgroundColor: theme.colors.card, color: theme.colors.text } as any;
  const pick = (enText: string, teText: string) =>
    lang === 'te' ? { primary: teText || enText, secondary: enText } : { primary: enText, secondary: teText };

  useEffect(() => {
    getProfile().then((p) => {
      if (p.phoneE164) setPhone(p.phoneE164.replace(/^\+91/, ''));
      if (p.pincode) setPincode(p.pincode);
      setLang(p.lang);
    }).catch(() => {});
    return () => { if (timer.current) clearInterval(timer.current); };
  }, []);

  function startCooldown() {
    setCooldown(RESEND_COOLDOWN_S);
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) { if (timer.current) clearInterval(timer.current); return 0; }
        return c - 1;
      });
    }, 1000);
  }

  async function send() {
    try {
      const e164 = toE164India(phone);
      if (!e164) throw new Error(pick('Enter a valid 10-digit mobile number.', 'సరైన 10 అంకెల మొబైల్ నంబర్ ఇవ్వండి.').primary);
      if (!isValidPincode(pincode)) throw new Error(pick('Enter your 6-digit area PIN code.', 'మీ 6 అంకెల పిన్ కోడ్ ఇవ్వండి.').primary);
      setBusy(true);
      const r = await requestOtp(phone);
      setSessionId(r.sessionId);
      setDemoCode(r.demoCode);
      setCode('');
      setStep(2);
      startCooldown();
    } catch (e: any) {
      Alert.alert(pick('Check details', 'వివరాలు చూడండి').primary, e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    try {
      if (code.trim().length !== OTP_LENGTH) throw new Error(pick(`Enter the ${OTP_LENGTH}-digit code.`, `${OTP_LENGTH} అంకెల కోడ్ ఇవ్వండి.`).primary);
      setBusy(true);
      const e164 = await verifyOtp(sessionId, code);
      const p = await getProfile();
      await saveProfile({ ...p, phoneE164: e164, phoneVerified: true, pincode: pincode.trim(), lang, onboarded: true });
      syncLang(lang);
      onDone();
    } catch (e: any) {
      Alert.alert(pick('Login failed', 'లాగిన్ విఫలమైంది').primary, e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  const masked = phone ? `+91 ${phone.slice(0, 2)}•••••${phone.slice(-2)}` : '';

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.c} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>🌾 {pick('Farm Tracker', 'ఫామ్ ట్రాకర్').primary}</Text>
        <Text style={styles.sub}>{pick('Login with your mobile number', 'మీ మొబైల్ నంబర్‌తో లాగిన్ చేయండి').primary}</Text>

        {step === 1 ? (
          <>
            <Text style={styles.label}>{pick('Mobile number (+91)', 'మొబైల్ నంబర్ (+91)').primary}</Text>
            <TextInput style={input} value={phone} onChangeText={(v) => setPhone(v.replace(/\D/g, '').slice(0, 10))} keyboardType="phone-pad" placeholder="9xxxxxxxxx" placeholderTextColor={theme.colors.muted} />
            <Text style={styles.label}>{pick('Area PIN code', 'ప్రాంత పిన్ కోడ్').primary}</Text>
            <TextInput style={input} value={pincode} onChangeText={(v) => setPincode(v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" placeholder="e.g. 522001" placeholderTextColor={theme.colors.muted} />
            <Text style={styles.label}>{pick('Language', 'భాష').primary}</Text>
            <BigButton title={lang === 'en' ? '● English' : 'English'} onPress={() => setLang('en')} variant={lang === 'en' ? 'primary' : 'secondary'} />
            <BigButton title={lang === 'te' ? '● తెలుగు' : 'తెలుగు'} onPress={() => setLang('te')} variant={lang === 'te' ? 'primary' : 'secondary'} />
            <BigButton title={busy ? pick('SENDING…', 'పంపుతోంది…').primary : pick('SEND OTP →', 'OTP పంపండి →').primary} onPress={send} />
            <Text style={styles.hint}>{pick('You will get a 6-digit code. It is valid for 5 minutes.', 'మీకు 6 అంకెల కోడ్ వస్తుంది. 5 నిమిషాలు చెల్లుతుంది.').primary}</Text>
          </>
        ) : (
          <>
            <Text style={styles.label}>{pick('Code sent to', 'కోడ్ పంపబడింది').primary} {masked}</Text>
            {demoCode ? (
              <Text style={styles.demoBox}>{pick('Demo code (no SMS setup yet):', 'డెమో కోడ్ (SMS లేదు):').primary}{'\n'}{demoCode}</Text>
            ) : null}
            <Text style={styles.label}>{pick(`Enter ${OTP_LENGTH}-digit code`, `${OTP_LENGTH} అంకెల కోడ్ ఇవ్వండి`).primary}</Text>
            <TextInput style={[input, styles.code] as any} value={code} onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, OTP_LENGTH))} keyboardType="number-pad" placeholder="••••••" placeholderTextColor={theme.colors.muted} maxLength={OTP_LENGTH} autoFocus />
            <BigButton title={busy ? pick('CHECKING…', 'చూస్తోంది…').primary : pick('✅ VERIFY & LOGIN', '✅ నిర్ధారించి లాగిన్').primary} onPress={verify} />
            {cooldown > 0 ? (
              <Text style={styles.hint}>{pick(`Resend code in ${cooldown}s`, `${cooldown}సె. తర్వాత మళ్లీ పంపండి`).primary}</Text>
            ) : (
              <BigButton title={pick('↻ RESEND CODE', '↻ కోడ్ మళ్లీ పంపండి').primary} onPress={send} variant="secondary" />
            )}
            <BigButton title={pick('← CHANGE NUMBER', '← నంబర్ మార్చండి').primary} onPress={() => setStep(1)} variant="secondary" />
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  c: { flexGrow: 1, backgroundColor: theme.colors.background, padding: 16, justifyContent: 'center' },
  title: { fontSize: 32, fontWeight: 'bold', color: theme.colors.text, textAlign: 'center' },
  sub: { fontSize: 16, color: theme.colors.muted, textAlign: 'center', marginBottom: 16 },
  label: { fontSize: 20, fontWeight: 'bold', marginBottom: 6, color: theme.colors.text },
  hint: { fontSize: 16, color: theme.colors.muted, textAlign: 'center', marginTop: 12 },
  code: { textAlign: 'center', letterSpacing: 12, fontSize: 28, fontWeight: 'bold' },
  demoBox: { fontSize: 22, fontWeight: 'bold', textAlign: 'center', color: theme.colors.primaryDark, backgroundColor: theme.colors.lightGreen, borderRadius: 12, padding: 14, marginBottom: 12, overflow: 'hidden' },
});
