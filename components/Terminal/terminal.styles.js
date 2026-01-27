// FILE: components/Terminal/terminal.styles.js
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

  // Fill screen + top anchor
  content: {
    flex: 1,
    padding: 16,
    justifyContent: 'flex-start',
  },

  // Make card occupy most of the vertical space
  card: {
    flex: 1,
    backgroundColor: AG.card,
    borderWidth: 1,
    borderColor: AG.cardBorder,
    borderRadius: 22,
    padding: 16,
  },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },

  titleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
  },

  titleAG: {
    color: AG.gold,
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 1,
  },

  titlePay: {
    color: AG.text,
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 1,
  },

  subtitle: {
    color: AG.muted,
    marginTop: 6,
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },

  connectChip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: AG.border,
    backgroundColor: AG.inputBg,
  },
  connectChipText: {
    color: AG.text,
    fontSize: 13,
    fontWeight: '900',
  },
  connectChipTextGold: {
    color: AG.gold,
  },

  // Bigger visual "hero" section
  bigAmountBox: {
    marginTop: 14,
    backgroundColor: AG.inputBg,
    borderWidth: 1,
    borderColor: AG.border,
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  bigAmount: {
    color: AG.text,
    fontSize: 52,
    fontWeight: '900',
    letterSpacing: 1,
    textAlign: 'center',
    includeFontPadding: false,
  },
  bigAmountSub: {
    marginTop: 6,
    color: AG.muted,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },

  dividerTop: {
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#111827',
    paddingTop: 12,
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
  rowValueGold: {
    color: AG.gold,
    fontSize: 16,
    fontWeight: '900',
  },

  // Push keypad + buttons toward bottom of card
  keypad: {
    marginTop: 14,
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  keypadRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  keypadBtn: {
    flex: 1,
    height: 82,
    marginHorizontal: 6,
    borderRadius: 20,
    backgroundColor: AG.inputBg,
    borderWidth: 1,
    borderColor: AG.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  keypadBtnGold: {
    backgroundColor: AG.gold,
    borderColor: AG.gold,
  },
  keypadText: {
    color: AG.text,
    fontSize: 32,
    fontWeight: '900',
  },
  keypadTextGold: {
    color: AG.goldText,
  },

  noteInput: {
    marginTop: 12,
    backgroundColor: AG.inputBg,
    borderWidth: 1,
    borderColor: AG.border,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: AG.text,
    fontSize: 16,
    fontWeight: '800',
  },

  secondaryBtn: {
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: AG.border,
    backgroundColor: AG.inputBg,
    width: '100%',
  },
  secondaryBtnText: {
    color: AG.text,
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'center',
  },

  primaryBtn: {
    backgroundColor: AG.gold,
    paddingVertical: 16,
    borderRadius: 18,
    marginTop: 12,
    width: '100%',
  },
  primaryBtnText: {
    color: AG.goldText,
    fontSize: 17,
    fontWeight: '900',
    textAlign: 'center',
  },

  dangerBtn: {
    marginTop: 12,
    paddingVertical: 13,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#0b1220',
    width: '100%',
  },
  dangerBtnText: {
    color: AG.danger,
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
  },

  statusText: {
    marginTop: 10,
    color: AG.muted,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
});
