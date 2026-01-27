// FILE: components/ui/pressFX.js
import {Platform} from 'react-native';

/**
 * pressFX
 * ----------
 * Ultra-fast tactile feedback for POS-style buttons.
 * - Minimal scale change
 * - Minimal opacity change
 * - No animation delay
 *
 * Why this feels faster:
 * - Less visual movement = quicker perceived response
 */
export function pressFX({
  pressed,
  scale = 0.992, // VERY subtle shrink
  downOpacity = 0.94, // VERY subtle fade
} = {}) {
  if (!pressed) {
    return {
      opacity: 1,
      transform: [{scale: 1}],
      ...(Platform.OS === 'android' ? {elevation: 4} : null),
    };
  }

  return {
    opacity: downOpacity,
    transform: [{scale}],
    ...(Platform.OS === 'android' ? {elevation: 2} : null),
  };
}

/**
 * androidRipple
 * -------------
 * Optional native ripple for Android (instant feedback).
 * Keep ripple light so it doesn't feel "slow".
 */
export function androidRipple(color = 'rgba(250,204,21,0.16)') {
  return Platform.OS === 'android' ? {android_ripple: {color}} : {};
}
