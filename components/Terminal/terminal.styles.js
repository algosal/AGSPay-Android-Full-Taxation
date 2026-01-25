// components/Terminal/terminal.styles.js
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

  // no scrolling — everything must fit
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
    marginBottom: 10,
  },

  titleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
  },

  titleAG: {
    color: AG.gold,
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 1,
  },

  titlePay: {
    color: AG.text,
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 1,
  },

  subtitle: {
    color: AG.muted,
    marginTop: 4,
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },

  // Top connect chip (tappable)
  connectChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
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

  // Big amount display (non-native keypad UX)
  bigAmountBox: {
    marginTop: 10,
    backgroundColor: AG.inputBg,
    borderWidth: 1,
    borderColor: AG.border,
    borderRadius: 18,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  bigAmount: {
    color: AG.text,
    fontSize: 44,
    fontWeight: '900',
    letterSpacing: 1,
    textAlign: 'center',
    includeFontPadding: false,
  },
  bigAmountSub: {
    marginTop: 4,
    color: AG.muted,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },

  dividerTop: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#111827',
    paddingTop: 10,
  },

  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
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

  // Keypad
  keypad: {
    marginTop: 12,
  },
  keypadRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  keypadBtn: {
    flex: 1,
    height: 78,
    marginHorizontal: 6,
    borderRadius: 18,
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
    fontSize: 30,
    fontWeight: '900',
  },
  keypadTextGold: {
    color: AG.goldText,
  },

  noteInput: {
    marginTop: 10,
    backgroundColor: AG.inputBg,
    borderWidth: 1,
    borderColor: AG.border,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: AG.text,
    fontSize: 16,
    fontWeight: '800',
  },

  // Full-width buttons
  secondaryBtn: {
    marginTop: 10,
    paddingVertical: 12,
    borderRadius: 16,
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
    paddingVertical: 14,
    borderRadius: 16,
    marginTop: 10,
    width: '100%',
  },
  primaryBtnText: {
    color: AG.goldText,
    fontSize: 17,
    fontWeight: '900',
    textAlign: 'center',
  },

  dangerBtn: {
    marginTop: 10,
    paddingVertical: 12,
    borderRadius: 16,
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
    color: AG.muted,
    fontSize: 12,
    fontWeight: '800',
  },
});
