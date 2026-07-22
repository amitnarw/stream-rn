import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { ChevronUp, ChevronDown } from 'lucide-react-native';

interface QuickScrollFabProps {
  onScrollToTop: () => void;
  onScrollToBottom: () => void;
  bottomOffset?: number;
  rightOffset?: number;
}

export function QuickScrollFab({
  onScrollToTop,
  onScrollToBottom,
  bottomOffset = 100,
  rightOffset = 20,
}: QuickScrollFabProps) {
  return (
    <View
      style={[
        styles.container,
        { bottom: bottomOffset, right: rightOffset },
      ]}
      pointerEvents="box-none"
    >
      <View style={styles.capsule}>
        <View style={[StyleSheet.absoluteFillObject, styles.blurWrap]}>
          <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFillObject} />
          <View style={[StyleSheet.absoluteFillObject, styles.darkOverlay]} />
        </View>
        <TouchableOpacity
          style={styles.btn}
          onPress={onScrollToTop}
          activeOpacity={0.7}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <ChevronUp size={18} color="#ffffff" strokeWidth={2.5} />
        </TouchableOpacity>

        <View style={styles.divider} />

        <TouchableOpacity
          style={styles.btn}
          onPress={onScrollToBottom}
          activeOpacity={0.7}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <ChevronDown size={18} color="#ffffff" strokeWidth={2.5} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    zIndex: 99,
  },
  capsule: {
    flexDirection: 'column',
    width: 40,
    height: 80,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  blurWrap: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  darkOverlay: {
    backgroundColor: 'rgba(20, 18, 24, 0.75)',
  },
  btn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    width: 22,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
});
export default QuickScrollFab;
