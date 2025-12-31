// components/Terminal/terminal.styles.js
import {StyleSheet} from 'react-native';

export default StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },

  logoutBtn: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#020617',
    borderWidth: 1,
    borderColor: '#3f3f46',
  },

  logoutIcon: {
    color: '#facc15', // AG gold
    fontSize: 18,
    fontWeight: '600',
  },

  primaryBtn: {
    backgroundColor: '#facc15',
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 12,
  },

  primaryBtnDisabled: {
    opacity: 0.5,
  },

  primaryBtnText: {
    color: '#020617',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },

  secondaryBtn: {
    marginTop: 10,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ef4444',
  },

  secondaryBtnText: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
});
