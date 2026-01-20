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

  // ✅ allow scroll (your working code uses ScrollView)
  content: {
    padding: 12,
    paddingBottom: 18,
  },

  card: {
    backgroundColor: AG.card,
    borderWidth: 1,
    borderColor: AG.cardBorder,
    borderRadius: 16,
    padding: 12,
    marginTop: 10,
  },

  headerRow: {
    alignItems: 'center',
    marginBottom: 6,
  },

  title: {
    color: AG.text,
    fontSize: 21, // slightly smaller
    fontWeight: '900',
    letterSpacing: 0.5,
    textAlign: 'center',
  },

  subtitle: {
    color: AG.muted,
    marginTop: 2,
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },

  // ✅ Tap-to-connect top row
  topConnectRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: AG.inputBg,
    borderWidth: 1,
    borderColor: AG.border,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  topConnectLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    paddingRight: 10,
  },
  topConnectIcon: {
    fontSize: 18,
  },
  topConnectTitle: {
    color: AG.text,
    fontSize: 14,
    fontWeight: '900',
  },
  topConnectSub: {
    color: AG.muted,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 2,
  },
  topConnectPill: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: '#334155',
  },
  topConnectPillText: {
    color: AG.text,
    fontSize: 11,
    fontWeight: '900',
  },

  cardTitle: {
    color: AG.text,
    fontSize: 16, // slightly smaller
    fontWeight: '900',
  },

  chargeRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: 10,
  },
  dollar: {
    color: AG.text,
    fontSize: 24,
    fontWeight: '900',
    marginRight: 8,
    includeFontPadding: false,
  },
  amountInput: {
    flex: 1,
    color: AG.text,
    fontSize: 22,
    fontWeight: '900',
    borderBottomWidth: 1,
    borderBottomColor: AG.border,
    paddingBottom: 6,
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
    fontSize: 13,
    fontWeight: '800',
  },
  rowValue: {
    color: AG.text,
    fontSize: 13,
    fontWeight: '900',
  },
  rowValueGold: {
    color: AG.gold,
    fontSize: 24, // slightly smaller than before
    fontWeight: '900',
  },

  statusText: {
    color: AG.muted,
    fontSize: 13,
    fontWeight: '800',
    marginTop: 4,
  },

  noteInput: {
    marginTop: 10,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: AG.inputBg,
    borderWidth: 1,
    borderColor: AG.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: AG.text,
    fontSize: 15,
    fontWeight: '800',
  },

  primaryBtn: {
    backgroundColor: AG.gold,
    paddingVertical: 12,
    borderRadius: 14,
    marginTop: 10,
  },
  primaryBtnText: {
    color: AG.goldText,
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
  },
});
