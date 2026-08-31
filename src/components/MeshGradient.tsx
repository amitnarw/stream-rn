// @ts-nocheck
/**
 * MeshGradient ,  Premium Sphere Orb (React Native Skia)
 * Exact 1:1 port of Exaldia PremiumOrb visual without eyes/face.
 * Colors: blue theme (#0047FF → #5580FF) replacing Exaldia orange.
 *
 * Layers (mapped from PremiumOrb.tsx):
 *  B: Radial aura glow blur-2xl behind orb
 *  C: Base linear-gradient body (blue → accent light)
 *  D: Rotating organic blob conic sweep (opacity-60, blur-sm)
 *  E: Top specular glass highlight (radial, blur-[6px])
 *  F: Bottom bounce specular (radial, blur-[4px])
 */
import React, { memo, useEffect } from "react";
import { StyleSheet, View } from "react-native";
import {
  Canvas,
  Fill,
  vec,
  Circle,
  Group,
  BlurMask,
  Blur,
  SweepGradient,
  LinearGradient,
  RadialGradient,
  rrect,
  rect,
} from "@shopify/react-native-skia";
import Animated, {
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";

interface IAnimatedMeshGradient {
  readonly colors?: any[];
  readonly speed?: number;
  readonly style?: any;
  readonly width?: number;
  readonly height?: number;
  readonly children?: React.ReactNode;
}

export const MeshGradient: React.FC<IAnimatedMeshGradient> = memo(({
  style,
  width: size = 112,
  height: _height = 112,
  speed = 1,
  colors = ["#0047FF", "#5580FF"],
  children,
}) => {
  // Rotation: exactly 4s = PremiumOrb getRotateSpeed() for "loading" state
  // Reference: duration: 4 * (1/animationSpeed) seconds, animationSpeed=1 → 4000ms
  const rotation = useSharedValue(0);
  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(2 * Math.PI, { duration: 4000, easing: Easing.linear }),
      -1,
      false
    );
  }, []);

  const blobTransform = useDerivedValue(() => [{ rotate: rotation.value }]);

  // No inset ,  body fills the full circle (inset-2 in web caused a darker ring artifact in Skia)
  const inset = 0;
  const bodySize = size;
  const bodyR    = size / 2;

  // Canvas overflows to show the aura glow
  const pad = 32;
  const canvasSize = size + pad * 2;
  const cx = canvasSize / 2;
  const cy = canvasSize / 2;

  const bodyClip = React.useMemo(
    () => rrect(rect(cx - bodyR, cy - bodyR, bodySize, bodySize), bodyR, bodyR),
    [cx, cy, bodySize, bodyR]
  );

  // Blob = -inset-1/2 → 1.5x body radius
  const blobR = bodyR * 1.5;

  // Use the 2 passed-in colors (same pattern as PremiumOrb's baseGradient prop)
  const c1   = colors[0] ?? "#0047FF";
  const c2   = colors[1] ?? "#5580FF";
  // Aura: same hue as c1 but blurred & semi-transparent (matches getAuraColor() default)
  const aura = "rgba(0, 71, 255, 0.65)";

  return (
    <View style={[styles.container, style, { width: size, height: size, overflow: "visible" }]}>
      <Canvas
        style={{
          position: "absolute",
          width: canvasSize,
          height: canvasSize,
          top: -pad,
          left: -pad,
        }}
      >
        {/* LAYER B: Radial aura glow (blur-2xl)
            PremiumOrb: absolute inset-0 rounded-full blur-2xl
            background: radial-gradient(circle, auraColor 0%, transparent) */}
        <Circle cx={cx} cy={cy} r={size / 2}>
          <RadialGradient
            c={vec(cx, cy)}
            r={size / 2}
            colors={[aura, "transparent"]}
          />
          <BlurMask blur={20} style="normal" />
        </Circle>

        <Group clip={bodyClip}>

          {/* LAYER C: Base linear-gradient body
              PremiumOrb: backgroundImage: linear-gradient(to bottom right, c1, c2) */}
          <Fill>
            <LinearGradient
              start={vec(cx - bodyR, cy - bodyR)}
              end={vec(cx + bodyR, cy + bodyR)}
              colors={[c1, c2]}
            />
          </Fill>

          {/* LAYER D: Rotating organic blob conic sweep
              Reference: conic-gradient(from 0deg, transparent, rgba(255,255,255,0.9), transparent 60%)
              Use Blur directly inside the Circle to blur its gradient output. */}
          <Group transform={blobTransform} origin={vec(cx, cy)} opacity={0.6}>
            <Circle cx={cx} cy={cy} r={blobR}>
              <SweepGradient
                c={vec(cx, cy)}
                colors={["transparent", "rgba(255,255,255,0.9)", "transparent", "transparent"]}
                positions={[0, 0.3, 0.6, 1.0]}
              />
              <Blur blur={6} />
            </Circle>
          </Group>

          {/* LAYER D2: Inset white glow (inset 0 0 20px rgba(255,255,255,0.5))
              Approximated as a soft white radial bloom at center fading to edges */}
          <Circle cx={cx} cy={cy} r={bodyR}>
            <RadialGradient
              c={vec(cx, cy)}
              r={bodyR}
              colors={["transparent", "transparent", "rgba(255,255,255,0.35)"]}
              positions={[0, 0.6, 1.0]}
            />
          </Circle>

          {/* LAYER E: Top specular glass highlight
              Reference: w-1/2 h-1/2 blur-[6px] -> Circle with Blur image filter */}
          <Circle cx={cx} cy={cy - bodyR * 0.5} r={bodyR * 0.5}>
            <RadialGradient
              c={vec(cx, cy - bodyR * 0.52)}
              r={bodyR * 0.5}
              colors={["rgba(255,255,255,0.70)", "rgba(255,255,255,0.20)", "transparent"]}
              positions={[0, 0.4, 1]}
            />
            <Blur blur={6} />
          </Circle>

          {/* LAYER F: Bottom bounce specular
              Reference: bottom-0 left-1/2 w-1/3 h-1/4 blur-[4px] */}
          <Circle cx={cx} cy={cy + bodyR * 0.75} r={bodyR * 0.28}>
            <RadialGradient
              c={vec(cx, cy + bodyR * 0.75)}
              r={bodyR * 0.28}
              colors={["rgba(255,255,255,0.25)", "transparent"]}
              positions={[0, 1]}
            />
            <Blur blur={4} />
          </Circle>

        </Group>
      </Canvas>

      {/* Stats overlay (percent + speed pill) */}
      {children}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    justifyContent: "center",
    alignItems: "center",
  },
});

export default MeshGradient;
