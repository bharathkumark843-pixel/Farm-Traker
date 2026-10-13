import React, { useState, useEffect } from 'react';
import { ScrollView, Text, TextInput, StyleSheet, Image, Alert, View, TouchableOpacity } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import { BigButton } from '../components/BigButton';
import { getProduct, getProductByBarcode, saveProduct } from '../db/database';
import { lookupCatalog } from '../data/productCatalog';
import { parseQrPayload } from '../utils/qrPayload';
import { Product, newId, todayISO } from '../db/types';
import { useApp } from '../store/AppContext';
import { theme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'AddEdit'>;

const inputStyle = {
  borderWidth: 1,
  borderColor: theme.colors.cardBorder,
  borderRadius: 12,
  fontSize: 20,
  padding: 14,
  marginBottom: 12,
  minHeight: 60,
  backgroundColor: theme.colors.card,
  color: theme.colors.text,
};

// Minimal typing: only name + quantity + expiry are required.
const CATEGORIES: Product['category'][] = ['Pesticide', 'Insecticide', 'Herbicide', 'Fungicide', 'Other'];
const UNITS = ['Litre', 'Kg', 'gm', 'ml', 'pcs', 'Bottle', 'Packet'];

function normaliseCategory(v: string): Product['category'] {
  const found = CATEGORIES.find((c) => c.toLowerCase() === v.trim().toLowerCase());
  return found ?? 'Other';
}

function isValidDate(v: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  // Compare local components (not toISOString — UTC conversion shifts the day in +TZ zones).
  const d = new Date(`${v}T00:00:00`);
  return (
    !Number.isNaN(d.getTime()) &&
    d.getFullYear() === Number(m[1]) &&
    d.getMonth() + 1 === Number(m[2]) &&
    d.getDate() === Number(m[3])
  );
}

export function AddEditProductScreen({ navigation, route }: Props) {
  const { refresh } = useApp();
  const { barcode, productId, scannedText } = route.params ?? {};
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState({
    name: '', category: 'Pesticide', barcode: barcode || '', photoUri: '',
    unit: 'Litre', qty: '', lowAt: '2', price: '', expiry: '', manufacturer: '', label: '',
  });

  useEffect(() => {
    (async () => {
      if (productId) {
        const p = await getProduct(productId);
        if (p) setForm({
          name: p.name, category: p.category, barcode: p.barcode, photoUri: p.photoUri,
          unit: p.unit, qty: String(p.quantityRemaining), lowAt: String(p.lowStockThreshold),
          price: String(p.pricePaid), expiry: p.expiryDate, manufacturer: p.manufacturer, label: p.labelInfo,
        });
      }
    })();
  }, [productId]);

  // Arriving from Scan with a fresh barcode must update the form —
  // useState's initialiser only runs on mount, so re-navigating kept the old value.
  // Then auto-fill details, in priority order:
  //   1. the farmer's own saved products (same code scanned before),
  //   2. the bundled chemical catalog,
  //   3. fields parsed out of the scanned QR text itself (brand, manufacturer,
  //      reg/batch lines) when the payload is free text rather than a code.
  const [autoNote, setAutoNote] = useState('');
  useEffect(() => {
    const raw = scannedText || barcode;
    if (!raw || productId) return;
    const fromScan = !!scannedText;
    const parsed = fromScan ? parseQrPayload(raw) : null;
    // Code-like payloads keep the exact old behaviour; free-text QRs must
    // NOT dump paragraphs into the barcode box.
    const code = fromScan ? parsed!.barcode : raw;
    setForm((f) => {
      if (!fromScan) return f.barcode === code ? f : { ...f, barcode: code };
      const next = { ...f };
      if ((f.barcode || '') !== code) next.barcode = code;
      if (!f.name && parsed!.name) next.name = parsed!.name;
      if (!f.manufacturer && parsed!.manufacturer) next.manufacturer = parsed!.manufacturer;
      if (!f.label && parsed!.labelInfo) next.label = parsed!.labelInfo;
      return next;
    });
    if (fromScan && (parsed!.name || parsed!.manufacturer || parsed!.labelInfo)) {
      setAutoNote('✓ Details filled from scanned QR. Please verify before saving.');
    }
    if (!code) return;
    (async () => {
      const saved = await getProductByBarcode(code);
      if (saved) {
        setForm((f) => ({
          ...f,
          barcode: code,
          name: f.name || saved.name,
          category: f.category && f.category !== 'Pesticide' ? f.category : saved.category,
          photoUri: f.photoUri || saved.photoUri,
          unit: f.unit && f.unit !== 'Litre' ? f.unit : saved.unit || f.unit,
          manufacturer: f.manufacturer || saved.manufacturer,
          label: f.label || saved.labelInfo,
        }));
        setAutoNote(`✓ Details filled from your saved product “${saved.name}”. Take a fresh photo if needed.`);
        return;
      }
      const hit = lookupCatalog(code);
      if (hit) {
        setForm((f) => ({
          ...f,
          barcode: code,
          name: f.name || hit.name,
          category: hit.category,
          unit: hit.unit,
          manufacturer: f.manufacturer || hit.manufacturer,
          label: f.label || hit.labelInfo || '',
        }));
        setAutoNote('✓ Details filled from chemical catalog. Please add a photo of the bottle.');
      } else if (!fromScan) {
        setAutoNote('');
      }
    })();
  }, [barcode, scannedText, productId]);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function takePhoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Camera needed', 'Allow camera to take a product photo.');
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.6 });
    if (!res.canceled) set('photoUri', res.assets[0].uri);
  }

  async function pickPhoto() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo access to pick the chemical photo.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 0.6 });
    if (!res.canceled && res.assets?.[0]?.uri) set('photoUri', res.assets[0].uri);
  }

  function formatDateMask(v: string): string {
    const digits = v.replace(/\D/g, '').slice(0, 8);
    if (digits.length <= 4) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
  }

  async function onSave() {
    if (!form.name.trim()) {
      setFormError('Please enter the product name. / ఉత్పత్తి పేరు ఇవ్వండి.');
      return;
    }
    if (form.expiry.trim() && !isValidDate(form.expiry.trim())) {
      setFormError('Check expiry date — use YYYY-MM-DD, e.g. 2026-12-31.');
      return;
    }
    setFormError('');
    const now = new Date().toISOString();
    const existing = productId ? await getProduct(productId) : null;
    const qty = Number(form.qty) || 0;
    const product: Product = {
      id: existing?.id || newId(),
      name: form.name.trim(),
      category: normaliseCategory(form.category),
      barcode: form.barcode,
      photoUri: form.photoUri,
      unit: form.unit || 'pcs',
      quantityTotal: existing ? Math.max(existing.quantityTotal, qty) : qty,
      quantityRemaining: qty,
      lowStockThreshold: Number(form.lowAt) || 0,
      pricePaid: Number(form.price) || 0,
      purchaseDate: existing?.purchaseDate || todayISO(),
      expiryDate: form.expiry.trim(), // YYYY-MM-DD
      manufacturer: form.manufacturer,
      labelInfo: form.label,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    try {
      await saveProduct(product);
      await refresh();
      navigation.navigate('Details', { productId: product.id });
    } catch (e: any) {
      Alert.alert('Save failed', e?.message ?? String(e));
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.label}>Product Name *</Text>
      <TextInput style={inputStyle as any} value={form.name} onChangeText={(v) => set('name', v)} placeholder="e.g. Super Insect Killer" placeholderTextColor={theme.colors.muted} />

      <Text style={styles.label}>Barcode / QR</Text>
      <TextInput style={inputStyle as any} value={form.barcode} onChangeText={(v) => set('barcode', v)} placeholder="Scanned automatically" placeholderTextColor={theme.colors.muted} />
      {autoNote ? <Text style={styles.autoNote}>{autoNote}</Text> : null}

      <Text style={styles.label}>Category</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
        {CATEGORIES.map((c) => {
          const active = normaliseCategory(form.category) === c;
          return (
            <TouchableOpacity key={c} onPress={() => set('category', c)} accessibilityRole="button" accessibilityLabel={`Category ${c}`} style={{ paddingHorizontal: 18, paddingVertical: 14, minHeight: 56, justifyContent: 'center', borderRadius: 999, borderWidth: 1, borderColor: active ? theme.colors.primary : theme.colors.cardBorder, backgroundColor: active ? theme.colors.primary : theme.colors.card }}>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: active ? '#fff' : theme.colors.text }}>{c}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {form.photoUri ? <Image source={{ uri: form.photoUri }} style={styles.photo} /> : null}
      <BigButton title="📸  TAKE PRODUCT PHOTO" onPress={takePhoto} variant="secondary" />
      <BigButton title="🖼️  PICK PHOTO FROM GALLERY" onPress={pickPhoto} variant="secondary" />

      <Text style={styles.label}>Quantity *</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput style={[inputStyle, { flex: 1 }] as any} value={form.qty} onChangeText={(v) => set('qty', v)} keyboardType="numeric" placeholder="e.g. 5" placeholderTextColor={theme.colors.muted} />
      </View>
      <Text style={styles.label}>Unit</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 4 }}>
        {UNITS.map((u) => {
          const active = (form.unit || '').toLowerCase() === u.toLowerCase();
          return (
            <TouchableOpacity key={u} onPress={() => set('unit', u)} accessibilityRole="button" accessibilityLabel={`Unit ${u}`} style={{ paddingHorizontal: 18, paddingVertical: 14, minHeight: 56, justifyContent: 'center', borderRadius: 999, borderWidth: 1, borderColor: active ? theme.colors.primary : theme.colors.cardBorder, backgroundColor: active ? theme.colors.primary : theme.colors.card }}>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: active ? '#fff' : theme.colors.text }}>{u}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <TextInput style={inputStyle as any} value={form.unit} onChangeText={(v) => set('unit', v)} placeholder="Litre / Kg / custom" placeholderTextColor={theme.colors.muted} />

      <Text style={styles.label}>Expiry Date (YYYY-MM-DD)</Text>
      <TextInput style={inputStyle as any} value={form.expiry} onChangeText={(v) => set('expiry', formatDateMask(v))} placeholder="2026-12-31" placeholderTextColor={theme.colors.muted} keyboardType="number-pad" maxLength={10} />
      <Text style={styles.hint}>Use YYYY-MM-DD, e.g. 2026-12-31. / తేదీ ఫార్మాట్ ఇలా ఉండాలి.</Text>

      <Text style={styles.label}>Warn when below</Text>
      <TextInput style={inputStyle as any} value={form.lowAt} onChangeText={(v) => set('lowAt', v)} keyboardType="numeric" />

      <Text style={styles.label}>Price Paid</Text>
      <TextInput style={inputStyle as any} value={form.price} onChangeText={(v) => set('price', v)} keyboardType="numeric" />

      <Text style={styles.label}>Manufacturer / Company</Text>
      <TextInput style={inputStyle as any} value={form.manufacturer} onChangeText={(v) => set('manufacturer', v)} placeholder="e.g. Demo Agro" placeholderTextColor={theme.colors.muted} />

      <Text style={styles.label}>Company / Label info</Text>
      <TextInput style={inputStyle as any} value={form.label} onChangeText={(v) => set('label', v)} placeholder="Copy text from bottle label" placeholderTextColor={theme.colors.muted} multiline />

      {formError ? <Text style={styles.error}>{formError}</Text> : null}
      <BigButton title="💾  SAVE PRODUCT" onPress={onSave} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  label: { fontSize: 20, fontWeight: 'bold', marginBottom: 6, marginTop: 4, color: theme.colors.text },
  hint: { fontSize: 16, color: theme.colors.muted, marginTop: -6, marginBottom: 12 },
  error: { fontSize: 18, fontWeight: 'bold', color: theme.colors.danger, backgroundColor: theme.colors.dangerSoft, borderWidth: 1, borderColor: theme.colors.danger, padding: 12, borderRadius: 12, marginTop: 8, marginBottom: 8, overflow: 'hidden' },
  autoNote: { fontSize: 16, fontWeight: 'bold', color: theme.colors.primaryDark, backgroundColor: '#E8F5E9', borderRadius: 10, padding: 10, marginBottom: 4, overflow: 'hidden' },
  photo: { width: '100%', height: 220, borderRadius: 12, marginVertical: 8 },
});
