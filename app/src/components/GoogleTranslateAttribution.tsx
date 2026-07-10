import React from 'react';
import { Image } from 'react-native';
import { useTheme } from '../context/ThemeContext';

// Official Google Translate attribution badge ("powered by Google Translate").
// Source images are 176x16 at 1x; colored text reads on light backgrounds,
// white text reads on dark backgrounds — swapped per theme, matching the
// app's existing light/dark handling.
const COLOR_LOGO = require('../../assets/google-translate/color-regular.png');
const WHITE_LOGO = require('../../assets/google-translate/white-regular.png');
const ASPECT_RATIO = 176 / 16;

export function GoogleTranslateAttribution({ height = 14 }: { height?: number }) {
  const { colorScheme } = useTheme();
  return (
    <Image
      source={colorScheme === 'dark' ? WHITE_LOGO : COLOR_LOGO}
      style={{ height, width: height * ASPECT_RATIO }}
      resizeMode="contain"
      accessibilityLabel="Powered by Google Translate"
      testID="google-translate-attribution"
    />
  );
}
