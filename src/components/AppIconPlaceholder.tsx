import React from 'react';
import { Image, StyleSheet, View, ViewStyle } from 'react-native';
import { theme } from '../theme';

const ICON = require('../../assets/icon.png');

interface Props {
  size?: number;
  containerStyle?: ViewStyle | ViewStyle[];
}

export function AppIconPlaceholder({ size = 56, containerStyle }: Props) {
  return (
    <View style={[styles.container, containerStyle]}>
      <Image
        source={ICON}
        style={{ width: size, height: size, opacity: 0.45 }}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.placeholder,
  },
});

export default AppIconPlaceholder;