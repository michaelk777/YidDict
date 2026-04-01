import React from 'react';
import { Text } from 'react-native';

export const Ionicons = ({ name, size, color }: { name: string; size: number; color: string }) =>
  React.createElement(Text, { testID: `icon-${name}`, style: { fontSize: size, color } }, name);
