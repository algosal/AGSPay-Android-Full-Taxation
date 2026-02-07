// FILE: components/Sales/StoreSalesScreen.js
//
// ✅ NOTE:
// This screen is a placeholder for now.
// Next step: read storeRef from Keychain, call backend, show "Sales of the Day".

import React, {useEffect, useMemo, useState} from 'react';
import {View, Text, Pressable, StyleSheet} from 'react-native';
import * as Keychain from 'react-native-keychain';
import {pressFX, androidRipple} from '../ui/pressFX';

async function readAgpaySelection() {
  try {
    const creds = await Keychain.getInternetCredentials('agpaySelection');
    if (!creds?.password) return null;
    return JSON.parse(creds.password);
  } catch (e) {
    console.log('StoreSalesScreen readAgpaySelection error:', e);
    return null;
  }
}

export default function StoreSalesScreen({theme, onBack}) {
  const [sel, setSel] = useState(null);

  const t = useMemo(() => {
    const bg = theme?.bg ?? '#020617';
    const card = theme?.card ?? '#050814';
    const inputBg = theme?.inputBg ?? '#0b1222';
    const text = theme?.text ?? '#ffffff';
    const muted = theme?.muted ?? '#9ca3af';
    const border = theme?.border ?? '#1f2937';
    const gold = theme?.gold ?? '#d4af37';
    const goldText = theme?.goldText ?? '#020617';
    return {bg, card, inputBg, text, muted, border, gold, goldText};
  }, [theme]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const s = await readAgpaySelection();
      if (mounted) setSel(s || null);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const subtitle = useMemo(() => {
    const c = sel?.corporateName ? String(sel.corporateName) : 'Corporate';
    const st = sel?.storeName ? String(sel.storeName) : 'Store';
    return `${c} · ${st}`;
  }, [sel]);

  return (
    <View style={[styles.root, {backgroundColor: t.bg}]}>
      <View
        style={[styles.card, {backgroundColor: t.card, borderColor: t.border}]}>
        <View style={styles.headerRow}>
          <Pressable
            onPress={onBack}
            {...androidRipple('rgba(250,204,21,0.12)')}
            style={({pressed}) => [
              styles.backBtn,
              {borderColor: t.border, backgroundColor: t.inputBg},
              pressFX({pressed}),
            ]}>
            <Text style={[styles.backText, {color: t.text}]}>Back</Text>
          </Pressable>

          <View style={{flex: 1, alignItems: 'center'}}>
            <Text style={[styles.title, {color: t.text}]}>Store Sales</Text>
            <Text style={[styles.subtitle, {color: t.muted}]}>{subtitle}</Text>
          </View>

          <View style={{width: 60}} />
        </View>

        <View
          style={[
            styles.panel,
            {backgroundColor: t.inputBg, borderColor: t.border},
          ]}>
          <Text style={[styles.comingSoon, {color: t.gold}]}>Coming Soon</Text>
          <Text style={[styles.body, {color: t.muted}]}>
            We’ll show today’s total sales for this store here.
          </Text>
          <Text style={[styles.body, {color: t.muted, marginTop: 10}]}>
            Next steps:
            {'\n'}• Read storeRef from Keychain
            {'\n'}• Call new “sales-by-store-day” Lambda
            {'\n'}• Render totals + list of transactions
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, padding: 16, justifyContent: 'center'},
  card: {borderRadius: 22, padding: 18, borderWidth: 1},

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: {fontSize: 20, fontWeight: '900'},
  subtitle: {marginTop: 4, fontSize: 12, fontWeight: '800'},

  backBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
  },
  backText: {fontSize: 13, fontWeight: '900'},

  panel: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginTop: 8,
  },
  comingSoon: {fontSize: 22, fontWeight: '900', textAlign: 'center'},
  body: {marginTop: 12, fontSize: 13, fontWeight: '700', lineHeight: 18},
});
