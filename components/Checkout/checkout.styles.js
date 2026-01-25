// components/Checkout/checkout.styles.js
import {StyleSheet} from 'react-native';

const AG = {
  bg: '#000000',
  card: '#0b1220',
  cardBorder: '#1f2937',
  inputBg: '#020617',
  border: '#374151',
  text: '#ffffff',
  muted: '#9ca3af',
  gold: '#facc15',
  goldText: '#020617',
};

export default StyleSheet.create({
  screen: {flex: 1, backgroundColor: AG.bg},
  content: {flex: 1, padding: 14, justifyContent: 'center'},
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
  title: {color: AG.text, fontSize: 22, fontWeight: '900'},
  backBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: AG.border,
    backgroundColor: AG.inputBg,
  },
  backText: {color: AG.text, fontSize: 13, fontWeight: '900'},

  summaryBox: {
    backgroundColor: AG.inputBg,
    borderWidth: 1,
    borderColor: AG.border,
    borderRadius: 16,
    padding: 12,
  },

  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  rowLabel: {color: AG.muted, fontSize: 14, fontWeight: '800'},
  rowValue: {color: AG.text, fontSize: 14, fontWeight: '900'},

  divider: {
    borderTopWidth: 1,
    borderTopColor: '#111827',
    marginTop: 10,
    paddingTop: 10,
  },

  rowLabelTotal: {color: AG.text, fontSize: 16, fontWeight: '900'},
  rowValueTotal: {color: AG.gold, fontSize: 20, fontWeight: '900'},

  primaryBtn: {
    marginTop: 14,
    backgroundColor: AG.gold,
    borderRadius: 16,
    paddingVertical: 14,
    width: '100%',
    alignItems: 'center',
  },
  primaryBtnDisabled: {opacity: 0.65},
  primaryBtnText: {
    color: AG.goldText,
    fontSize: 16,
    fontWeight: '900',
  },

  note: {
    marginTop: 10,
    color: AG.muted,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
});
