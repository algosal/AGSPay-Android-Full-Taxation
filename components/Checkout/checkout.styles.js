// components/Checkout/checkout.styles.js
import {StyleSheet} from 'react-native';

export const AG = {
  bg: '#000000',
  card: '#0b1220',
  cardBorder: '#1f2937',
  inputBg: '#020617',
  border: '#374151',
  text: '#ffffff',
  subtext: '#d1d5db',
  muted: '#9ca3af',
  gold: '#facc15',
  goldText: '#020617',
  danger: '#ef4444',
};

export default StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: AG.bg,
  },
  content: {
    flex: 1,
    padding: 14,
    justifyContent: 'center',
  },
  card: {
    backgroundColor: AG.card,
    borderWidth: 1,
    borderColor: AG.cardBorder,
    borderRadius: 18,
    padding: 14,
  },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  backBtn: {
    width: 60,
    paddingVertical: 6,
  },
  backText: {
    color: AG.muted,
    fontSize: 15,
    fontWeight: '900',
  },
  title: {
    color: AG.text,
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
  },

  summaryBox: {
    marginTop: 4,
    backgroundColor: AG.inputBg,
    borderWidth: 1,
    borderColor: AG.border,
    borderRadius: 16,
    padding: 12,
  },

  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  rowLabel: {
    color: AG.subtext,
    fontSize: 14,
    fontWeight: '800',
  },
  rowValue: {
    color: AG.text,
    fontSize: 14,
    fontWeight: '900',
  },

  divider: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#111827',
    paddingTop: 10,
  },

  rowLabelTotal: {
    color: AG.subtext,
    fontSize: 15,
    fontWeight: '900',
  },
  rowValueTotal: {
    color: AG.gold,
    fontSize: 18,
    fontWeight: '900',
  },

  primaryBtn: {
    backgroundColor: AG.gold,
    paddingVertical: 14,
    borderRadius: 16,
    marginTop: 12,
  },
  primaryBtnDisabled: {
    opacity: 0.6,
  },
  primaryBtnText: {
    color: AG.goldText,
    fontSize: 17,
    fontWeight: '900',
    textAlign: 'center',
  },

  note: {
    marginTop: 10,
    color: AG.muted,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
});
