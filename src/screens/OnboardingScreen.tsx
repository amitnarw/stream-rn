import React, { useMemo, useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView, BlurTargetView } from 'expo-blur';
import * as Font from 'expo-font';
import { theme } from '../theme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface Props {
  onFinish: () => void;
}

const rings = [
  { radius: 15, count: 8, size: 4 },
  { radius: 35, count: 12, size: 6 },
  { radius: 60, count: 16, size: 8 },
  { radius: 90, count: 20, size: 10 }
];

export default function OnboardingScreen({ onFinish }: Props) {
  const [blurTarget, setBlurTarget] = useState<any>(null);
  const blurTargetRef = useRef<any>(null);
  const setBlurTargetRef = (val: any) => {
    blurTargetRef.current = val;
    if (val !== blurTarget) {
      setBlurTarget(val);
    }
  };

  // Helper to safely verify font load status before applying remote fonts
  const getFont = (name: string, fallback: string) => {
    try {
      return Font.isLoaded(name) ? name : fallback;
    } catch (e) {
      return fallback;
    }
  };

  const fontRegular = getFont('PlusJakartaSans-Regular', 'sans-serif');
  const fontBold = getFont('PlusJakartaSans-Bold', 'sans-serif');
  const fontBlack = getFont('PlusJakartaSans-Black', 'sans-serif');

  // Generate the coordinates for spiral dots background graphic
  const dots = useMemo(() => {
    const list: { id: number; size: number; left: number; top: number; opacity: number }[] = [];
    const centerX = 100;
    const centerY = 100;
    let offsetAngle = 0;
    let index = 0;

    rings.forEach((ring) => {
      offsetAngle += Math.PI / ring.count; // slight twist per ring
      for (let i = 0; i < ring.count; i++) {
        const angle = (i / ring.count) * Math.PI * 2 + offsetAngle;
        const x = centerX + Math.cos(angle) * ring.radius;
        const y = centerY + Math.sin(angle) * ring.radius;
        
        list.push({
          id: index++,
          size: ring.size,
          left: x - ring.size / 2,
          top: y - ring.size / 2,
          opacity: 0.8 + (Math.sin(index) * 0.15), // Varied, organic opacity
        });
      }
    });
    return list;
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      
      {/* Background container wrapping layers to be blurred */}
      <BlurTargetView ref={setBlurTargetRef as any} style={StyleSheet.absoluteFillObject}>
        {/* Background Gradient */}
        <LinearGradient
          colors={['#000000', '#000000', '#0047FF']}
          locations={[0, 0.45, 1]}
          style={StyleSheet.absoluteFillObject}
        />

        {/* Radial Graphic Spiral Background */}
        <View style={styles.radialGraphic}>
          {dots.map((dot) => (
            <View
              key={dot.id}
              style={[
                styles.dot,
                {
                  width: dot.size,
                  height: dot.size,
                  borderRadius: dot.size / 2,
                  left: dot.left,
                  top: dot.top,
                  opacity: dot.opacity,
                },
              ]}
            />
          ))}
        </View>
      </BlurTargetView>

      {/* Dynamic Island Placeholder (iPhone Mockup Accent) */}
      <View style={styles.dynamicIsland} />

      {/* Main Content Area */}
      <View style={styles.contentArea}>
        <Text style={[styles.headline, { fontFamily: fontBlack }]}>
          {"here's\n"}
          <Text style={[styles.highlight, { fontFamily: fontBlack }]}>something</Text>
          {"\njust for you"}
        </Text>
        
        <Text style={[styles.subtext, { fontFamily: fontRegular }]}>
          Sit back, relax, and explore. Let Zuno do the thinking. You'll be watching your favorites in no time.
        </Text>
      </View>

      {/* Frosted Glass Let's Go Button (Real-time background blur) */}
      <View style={styles.btnContainer}>
        <TouchableOpacity 
          style={styles.btnPrimary} 
          onPress={onFinish} 
          activeOpacity={0.8}
        >
          <BlurView 
            intensity={25} 
            tint="light" 
            style={StyleSheet.absoluteFillObject} 
            blurTarget={{ current: blurTarget }}
            blurMethod="dimezisBlurView"
          />
          {/* Subtle white/light tint overlay */}
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(255, 255, 255, 0.06)' }]} />
          <Text style={[styles.btnText, { fontFamily: fontBold }]}>LET'S GO</Text>
        </TouchableOpacity>
      </View>

      {/* iOS Home Indicator Bar */}
      <View style={styles.homeIndicator} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  dynamicIsland: {
    position: 'absolute',
    top: 50,
    alignSelf: 'center',
    width: 120,
    height: 35,
    backgroundColor: '#000000',
    borderRadius: 20,
    zIndex: 10,
  },
  radialGraphic: {
    position: 'absolute',
    top: SCREEN_HEIGHT * 0.2,
    alignSelf: 'center',
    width: 200,
    height: 200,
    zIndex: 1,
    transform: [{ scale: 1.15 }],
  },
  dot: {
    position: 'absolute',
    backgroundColor: '#386BFF',
  },
  contentArea: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 30,
    marginTop: SCREEN_HEIGHT * 0.22,
    zIndex: 2,
  },
  headline: {
    fontSize: 46,
    lineHeight: 48, // slightly adjusted to prevent descender cutting while keeping it tight
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: -2,
    marginBottom: 20,
  },
  highlight: {
    color: theme.colors.accent,
  },
  subtext: {
    fontSize: 14,
    lineHeight: 20,
    color: 'rgba(255, 255, 255, 0.75)',
    fontWeight: '500',
    maxWidth: 290,
    marginTop: 10,
  },
  btnContainer: {
    position: 'absolute',
    bottom: 50,
    left: 30,
    right: 30,
    zIndex: 2,
  },
  btnPrimary: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: 28,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  btnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 16,
    textTransform: 'uppercase',
    letterSpacing: 1.0,
  },
  homeIndicator: {
    position: 'absolute',
    bottom: 12,
    alignSelf: 'center',
    width: 140,
    height: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    borderRadius: 10,
    zIndex: 10,
  },
});
