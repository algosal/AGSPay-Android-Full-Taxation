// components/Terminal/AmountEntryScreen.jsx
import React, {useMemo, useState} from 'react';
import {View, Text, TouchableOpacity, Alert} from 'react-native';
import terminalStyles, {AG} from './terminal.styles';

function sanitizeAmountString(s) {
  // Keep only digits + dot, single dot, max 2 decimals
  let out = String(s || '').replace(/[^\d.]/g, '');

  const firstDot = out.indexOf('.');
  if (firstDot !== -1) {
    // remove extra dots
    const before = out.slice(0, firstDot + 1);
    const after = out
      .slice(firstDot + 1)
      .replace(/\./g, '') // strip any other dots
      .slice(0, 2); // max 2 decimals
    out = before + after;
  }

  // prevent crazy leading zeros like 0002 -> 2 (but keep "0." case)
  if (out.startsWith('0') && out.length > 1 && out[1] !== '.') {
    out = out.replace(/^0+/, '');
    if (!out) out = '0';
  }

  // max length guard (avoid overflow)
  if (out.length > 10) out = out.slice(0, 10);

  return out;
}

function parseMoney(text) {
  const raw = String(text ?? '').trim();
  if (!raw) return 0;
  const n = parseFloat(raw.replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

export default function AmountEntryScreen({initialValue = '', onDone, onBack}) {
  const s = terminalStyles;

  const [value, setValue] = useState(() => sanitizeAmountString(initialValue));

  const display = useMemo(() => {
    const v = String(value || '');
    return v.length ? v : '0';
  }, [value]);

  const amountOk = useMemo(() => parseMoney(value) > 0, [value]);

  const pressDigit = d => {
    setValue(prev => sanitizeAmountString(String(prev || '') + String(d)));
  };

  const pressDot = () => {
    setValue(prev => {
      const p = String(prev || '');
      if (p.includes('.')) return p;
      return sanitizeAmountString((p.length ? p : '0') + '.');
    });
  };

  const pressBackspace = () => {
    setValue(prev => {
      const p = String(prev || '');
      if (!p.length) return '';
      return sanitizeAmountString(p.slice(0, -1));
    });
  };

  const pressClear = () => setValue('');

  const handleContinue = () => {
    const n = parseMoney(value);
    if (!Number.isFinite(n) || n <= 0) {
      Alert.alert('Invalid amount', 'Enter an amount greater than $0.00.');
      return;
    }
    onDone?.(sanitizeAmountString(value));
  };

  return (
    <View style={[s.screen, {padding: 16}]}>
      {/* Header */}
      <View style={s.headerRow}>
        <Text style={[s.title, {fontSize: 24}]}>
          <Text style={{color: AG.gold}}>AG</Text>
          <Text style={{color: AG.text}}>Pay · Enter Amount</Text>
        </Text>

        <View style={{flexDirection: 'row', gap: 10}}>
          {!!onBack && (
            <TouchableOpacity onPress={onBack} style={s.logoutBtn}>
              <Text style={[s.logoutIcon, {fontSize: 20}]}>←</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* BIG Amount Display */}
      <View style={s.amountDisplayBox}>
        <Text style={s.amountDisplayDollar}>$</Text>
        <Text style={s.amountDisplayText}>{display}</Text>
      </View>

      {/* Keypad */}
      <View style={[s.keypad, {flex: 1, justifyContent: 'center'}]}>
        <View style={s.keypadRow}>
          <TouchableOpacity style={s.keypadBtn} onPress={() => pressDigit(1)}>
            <Text style={s.keypadText}>1</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.keypadBtn} onPress={() => pressDigit(2)}>
            <Text style={s.keypadText}>2</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.keypadBtn} onPress={() => pressDigit(3)}>
            <Text style={s.keypadText}>3</Text>
          </TouchableOpacity>
        </View>

        <View style={s.keypadRow}>
          <TouchableOpacity style={s.keypadBtn} onPress={() => pressDigit(4)}>
            <Text style={s.keypadText}>4</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.keypadBtn} onPress={() => pressDigit(5)}>
            <Text style={s.keypadText}>5</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.keypadBtn} onPress={() => pressDigit(6)}>
            <Text style={s.keypadText}>6</Text>
          </TouchableOpacity>
        </View>

        <View style={s.keypadRow}>
          <TouchableOpacity style={s.keypadBtn} onPress={() => pressDigit(7)}>
            <Text style={s.keypadText}>7</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.keypadBtn} onPress={() => pressDigit(8)}>
            <Text style={s.keypadText}>8</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.keypadBtn} onPress={() => pressDigit(9)}>
            <Text style={s.keypadText}>9</Text>
          </TouchableOpacity>
        </View>

        <View style={s.keypadRow}>
          <TouchableOpacity style={s.keypadBtn} onPress={pressDot}>
            <Text style={s.keypadText}>.</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.keypadBtn} onPress={() => pressDigit(0)}>
            <Text style={s.keypadText}>0</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.keypadBtn} onPress={pressBackspace}>
            <Text style={s.keypadText}>⌫</Text>
          </TouchableOpacity>
        </View>

        {/* Actions */}
        <View style={[s.keypadRow, {marginTop: 6}]}>
          <TouchableOpacity style={s.keypadBtn} onPress={pressClear}>
            <Text style={[s.keypadText, {fontSize: 26}]}>Clear</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              s.keypadBtn,
              s.keypadBtnGold,
              {flex: 2}, // make continue bigger
              !amountOk && {opacity: 0.6},
            ]}
            onPress={handleContinue}>
            <Text style={[s.keypadText, s.keypadTextGold, {fontSize: 30}]}>
              Continue
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <Text style={[s.statusText, {textAlign: 'center', fontSize: 14}]}>
        Big keypad for easy entry.
      </Text>
    </View>
  );
}
