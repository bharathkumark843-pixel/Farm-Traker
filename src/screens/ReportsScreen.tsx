import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TextInput, Alert, Platform, TouchableOpacity } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { HomeStackParamList } from '../navigation/RootNavigator';
import { useApp } from '../store/AppContext';
import { BigButton } from '../components/BigButton';
import { logsToCSV } from '../utils/csv';
import { totalSpent, totalUsed } from '../utils/alerts';
import { FIELD_CROPS, normalizeCrop, cropLabel } from '../db/types';
import { theme } from '../theme';

type Props = NativeStackScreenProps<HomeStackParamList, 'Reports'>;

// Simple seasonal report: totals + filters + CSV export.
export function ReportsScreen({}: Props) {
  const { products, logs } = useApp();
  const [crop, setCrop] = useState<'All' | string>('All');
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [formError, setFormError] = useState('');

  const nameOf = (id: string) => products.find((p) => p.id === id)?.name ?? id;

  const filtered = logs.filter((l) => {
    if (crop !== 'All' && normalizeCrop(l.crop) !== crop) return false;
    if (q && !`${l.crop} ${l.field} ${nameOf(l.productId)}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (from && l.date < from) return false;
    if (to && l.date > to) return false;
    return true;
  });

  function validDateOrEmpty(v: string): boolean {
    if (!v.trim()) return true;
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

  async function exportCsv() {
    try {
      if (!validDateOrEmpty(from) || !validDateOrEmpty(to)) {
        setFormError('Check dates — use YYYY-MM-DD, e.g. 2026-01-01. Leave blank for no limit.');
        return;
      }
      setFormError('');
      const csv = logsToCSV(filtered, nameOf);
      if (Platform.OS === 'web') {
        // Web has no documentDirectory / share sheet — download via blob.
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'farm-usage-report.csv';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        return;
      }
      const dir = FileSystem.documentDirectory;
      if (!dir) throw new Error('File system not available on this device.');
      const path = dir + 'farm-usage-report.csv';
      await FileSystem.writeAsStringAsync(path, csv);
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(path);
      else Alert.alert('Saved', path);
    } catch (e: any) {
      Alert.alert('Export failed', e?.message ?? String(e));
    }
  }

  async function exportPdf() {
    try {
      if (!validDateOrEmpty(from) || !validDateOrEmpty(to)) {
        setFormError('Check dates — use YYYY-MM-DD, e.g. 2026-01-01. Leave blank for no limit.');
        return;
      }
      setFormError('');
      const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const rows = filtered.slice(0, 500).map((l) => `<tr><td>${esc(l.date)}</td><td>${esc(nameOf(l.productId))}</td><td>${esc(l.crop)}</td><td>${esc(l.field)}</td><td>${esc(l.quantityUsed)}</td></tr>`).join('');
      const html = `<html><body style="font-family:sans-serif"><h1>Farm Usage Report</h1><p>Total spent: Rs ${totalSpent(products)} • Total used: ${totalUsed(filtered)} units • Records: ${filtered.length}</p><table border="1" cellpadding="6" cellspacing="0"><tr><th>Date</th><th>Product</th><th>Crop</th><th>Field</th><th>Qty</th></tr>${rows || '<tr><td colspan="5">No usage yet.</td></tr>'}</table></body></html>`;
      const Print: typeof import('expo-print') = require('expo-print');
      if (Platform.OS === 'web') {
        await Print.printAsync({ html });
        return;
      }
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri);
      else Alert.alert('Saved', uri);
    } catch (e: any) {
      Alert.alert('PDF failed', e?.message ?? String(e));
    }
  }

  const input = { borderWidth: 1, borderColor: theme.colors.cardBorder, borderRadius: 12, fontSize: 20, padding: 14, marginBottom: 12, minHeight: 60, backgroundColor: theme.colors.card, color: theme.colors.text } as any;

  // Group by crop for the seasonal summary
  const byCrop: Record<string, number> = {};
  for (const l of filtered) {
    const k = l.crop || 'Unknown crop';
    byCrop[k] = (byCrop[k] || 0) + Number(l.quantityUsed || 0);
  }

  // Totals broken down by unit so Litre + Kg are never mixed into one number.
  const unitOf = (id: string) => products.find((p) => p.id === id)?.unit || 'units';
  const usedByUnit: Record<string, number> = {};
  for (const l of filtered) {
    const u = unitOf(l.productId);
    usedByUnit[u] = (usedByUnit[u] || 0) + Number(l.quantityUsed || 0);
  }
  const usedByUnitLine = Object.entries(usedByUnit).map(([u, v]) => `${v} ${u}`).join(' + ') || '0 units';

  return (
    <ScrollView style={styles.c} contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      <View style={styles.offlineBadge}>
        <Text style={styles.offlineBadgeText}>• Offline-ready / ఆఫ్‌లైన్‌లో పనిచేస్తుంది</Text>
      </View>
      <View style={styles.totals}>
        <Text style={styles.total}>💰 Total spent / మొత్తం ఖర్చు: ₹{totalSpent(products)}</Text>
        <Text style={styles.total}>🧪 Total used / మొత్తం వాడకం: {usedByUnitLine}</Text>
        <Text style={styles.total}>📝 Records / నమోదులు: {filtered.length}</Text>
      </View>

      <Text style={styles.label}>Crop (పంట)</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 8, paddingBottom: 8 }} style={{ marginBottom: 8 }}>
        {(['All', ...FIELD_CROPS] as const).map((c) => {
          const te = c === 'All' ? 'అన్ని' : cropLabel(c as any, 'te');
          return (
            <TouchableOpacity key={c} onPress={() => setCrop(c)} accessibilityRole="button" accessibilityLabel={`Crop filter ${c}`} style={{ paddingHorizontal: 18, paddingVertical: 14, minHeight: 56, justifyContent: 'center', borderRadius: 999, borderWidth: 1, borderColor: crop === c ? theme.colors.primary : theme.colors.cardBorder, backgroundColor: crop === c ? theme.colors.primary : theme.colors.card, marginRight: 12 }}>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: crop === c ? '#fff' : theme.colors.text }}>{c} <Text style={{ fontSize: 16, fontWeight: 'normal', color: crop === c ? '#fff' : theme.colors.muted }}>{te}</Text></Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      <Text style={styles.label}>Search field / product / వెతకండి</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <TextInput style={[input, { flex: 1, marginBottom: 0 }]} value={q} onChangeText={setQ} placeholder="e.g. North field / వెతకండి" placeholderTextColor={theme.colors.muted} returnKeyType="search" />
        {q.length > 0 && (
          <TouchableOpacity style={styles.clearBtn} onPress={() => setQ('')} accessibilityRole="button" accessibilityLabel="Clear search">
            <Text style={styles.clearBtnText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>
      <Text style={styles.label}>From date (YYYY-MM-DD)</Text>
      <TextInput style={input} value={from} onChangeText={(v) => setFrom(formatDateMask(v))} placeholder="2026-01-01" placeholderTextColor={theme.colors.muted} keyboardType="number-pad" maxLength={10} />
      <Text style={styles.label}>To date (YYYY-MM-DD)</Text>
      <TextInput style={input} value={to} onChangeText={(v) => setTo(formatDateMask(v))} placeholder="2026-12-31" placeholderTextColor={theme.colors.muted} keyboardType="number-pad" maxLength={10} />
      {formError ? <Text style={styles.error}>{formError}</Text> : null}

      <Text style={styles.section}>Seasonal Usage by Crop / పంట వారీ వాడకం</Text>
      {Object.keys(byCrop).length === 0 && <Text style={styles.empty}>No usage yet.</Text>}
      {Object.entries(byCrop).map(([k, v]) => (
        <Text key={k} style={styles.row}>• {k}: {v} units</Text>
      ))}

      <BigButton title="📤  EXPORT CSV" onPress={exportCsv} />
      <BigButton title="🖨️  EXPORT PDF" onPress={exportPdf} variant="secondary" />
      <Text style={styles.hint}>CSV opens in Excel. PDF shares via the system share sheet.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: theme.colors.background },
  offlineBadge: { alignSelf: 'flex-start', backgroundColor: '#E8F5E9', borderWidth: 1, borderColor: theme.colors.primary, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, marginBottom: 8 },
  offlineBadgeText: { fontSize: 16, fontWeight: 'bold', color: theme.colors.primaryDark },
  clearBtn: { minHeight: 60, minWidth: 60, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.cardBorder, borderRadius: 12 },
  clearBtnText: { fontSize: 22, fontWeight: 'bold', color: theme.colors.text },
  error: { fontSize: 18, fontWeight: 'bold', color: theme.colors.danger, backgroundColor: theme.colors.dangerSoft, borderWidth: 1, borderColor: theme.colors.danger, padding: 12, borderRadius: 12, marginTop: 8, marginBottom: 8, overflow: 'hidden' },
  totals: { backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.cardBorder, borderRadius: 12, padding: 16, marginBottom: 12, ...theme.shadow },
  total: { fontSize: 20, fontWeight: 'bold', marginBottom: 4, color: theme.colors.text },
  label: { fontSize: 20, fontWeight: 'bold', marginBottom: 6, color: theme.colors.text },
  section: { fontSize: 22, fontWeight: 'bold', marginTop: 8, marginBottom: 8, color: theme.colors.text },
  row: { fontSize: 18, marginBottom: 4, color: theme.colors.text },
  empty: { fontSize: 18, color: theme.colors.muted },
  hint: { fontSize: 16, color: theme.colors.muted, textAlign: 'center', marginTop: 8 },
});
