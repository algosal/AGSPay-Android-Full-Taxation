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
  disabledBg: '#374151',
  disabledText: '#9ca3af',
};

export default StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: AG.bg,
  },
  content: {
    padding: 16,
    paddingBottom: 28,
  },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  title: {
    color: AG.text,
    fontSize: 20,
    fontWeight: '800',
  },
  subtitle: {
    color: AG.muted,
    marginBottom: 12,
  },

  logoutBtn: {
    padding: 8,
    borderRadius: 18,
    backgroundColor: AG.inputBg,
    borderWidth: 1,
    borderColor: '#3f3f46',
  },
  logoutIcon: {
    color: AG.gold,
    fontSize: 18,
    fontWeight: '800',
  },

  card: {
    backgroundColor: AG.card,
    borderWidth: 1,
    borderColor: AG.cardBorder,
    borderRadius: 16,
    padding: 12, // slightly tighter
    marginBottom: 12,
  },
  cardTitle: {
    color: AG.text,
    fontSize: 15,
    fontWeight: '800',
  },

  // "What to charge" input row
  chargeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  dollar: {
    color: AG.text,
    fontSize: 20,
    fontWeight: '900',
    marginRight: 8,
  },
  amountInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: AG.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8, // reduced height
    color: AG.text,
    backgroundColor: AG.inputBg,
    fontSize: 16,
    fontWeight: '800',
  },

  // Breakdown rows
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
    fontSize: 13,
    fontWeight: '600',
  },
  rowValue: {
    color: AG.text,
    fontSize: 13,
    fontWeight: '800',
  },
  rowValueGold: {
    color: AG.gold,
    fontSize: 14,
    fontWeight: '900',
  },

  statusText: {
    color: AG.subtext,
    marginTop: 6,
  },

  // Buttons (lower height)
  primaryBtn: {
    backgroundColor: AG.gold,
    paddingVertical: 10, // reduced height
    borderRadius: 12,
    marginTop: 10,
  },
  primaryBtnDisabled: {
    backgroundColor: AG.disabledBg,
  },
  primaryBtnText: {
    color: AG.goldText,
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
  },
  primaryBtnTextDisabled: {
    color: AG.disabledText,
  },

  secondaryBtn: {
    marginTop: 8,
    paddingVertical: 9, // reduced height
    borderRadius: 12,
    borderWidth: 1,
    borderColor: AG.danger,
  },
  secondaryBtnText: {
    color: AG.danger,
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },

  noteInput: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: AG.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8, // reduced height
    color: AG.text,
    backgroundColor: AG.inputBg,
  },
});
