// @ts-nocheck
/**
 * MeshGradient — Skia SKSL Runtime Effect
 * Combined from official Reacticx MeshGradient source files.
 */
import React, { memo, useCallback, useMemo } from "react";
import {
  Dimensions,
  LayoutChangeEvent,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";
import { Canvas, Shader, Skia, Fill, vec } from "@shopify/react-native-skia";
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  useFrameCallback,
  type FrameInfo,
  SharedValue,
} from "react-native-reanimated";

// Types



interface IMeshGradientColor {
  r: number;
  g: number;
  b: number;
}

interface IFrameBack {
  fpsLock: number;
  animated: boolean;
  speed: number;
}

interface IPerformance {
  undersampling?: number;
  fpsLock?: number;
}

interface IAnimatedMeshGradient {
  readonly performance?: IPerformance;
  readonly colors?: (string | IMeshGradientColor)[];
  readonly speed?: number;
  readonly noise?: number;
  readonly blur?: number;
  readonly contrast?: number;
  readonly animated?: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly width?: number;
  readonly height?: number;
  readonly children?: React.ReactNode;
}




// Constants


const DEFAULT_INITIAL_COLORS: IMeshGradientColor[] = [
  { r: 0.0, g: 0.55, b: 0.55 },
  { r: 0.95, g: 0.85, b: 0.3 },
  { r: 0.85, g: 0.95, b: 0.85 },
  { r: 0.1, g: 0.35, b: 0.45 },
];

const DEFAULT_PERFORMANCE: Required<IPerformance> = {
  undersampling: 0.3,
  fpsLock: 60,
};




// Shader SKSL
const MESH_GRADIENT_SHADER = `

uniform float2 resolution;
uniform float time;
uniform float noise;
uniform float blur;
uniform float contrast;
uniform float4 color1;
uniform float4 color2;
uniform float4 color3;
uniform float4 color4;

float hash(float2 p) {
  float3 p3 = fract(float3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float smoothNoise(float2 p) {
  float2 i = floor(p);
  float2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  
  float a = hash(i);
  float b = hash(i + float2(1.0, 0.0));
  float c = hash(i + float2(0.0, 1.0));
  float d = hash(i + float2(1.0, 1.0));
  
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(float2 p, int octaves) {
  float value = 0.0;
  float amplitude = 0.5;
  float frequency = 1.0;
  float maxValue = 0.0;
  
  for (int i = 0; i < 6; i++) {
    if (i >= octaves) break;
    value += amplitude * smoothNoise(p * frequency);
    maxValue += amplitude;
    amplitude *= 0.5;
    frequency *= 2.0;
  }
  
  return value / maxValue;
}

float3 mod289(float3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
float2 mod289(float2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
float3 permute(float3 x) { return mod289(((x*34.0)+1.0)*x); }

float snoise(float2 v) {
  const float4 C = float4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  float2 i  = floor(v + dot(v, C.yy));
  float2 x0 = v - i + dot(i, C.xx);
  float2 i1 = (x0.x > x0.y) ? float2(1.0, 0.0) : float2(0.0, 1.0);
  float4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  float3 p = permute(permute(i.y + float3(0.0, i1.y, 1.0)) + i.x + float3(0.0, i1.x, 1.0));
  float3 m = max(0.5 - float3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m*m*m*m;
  float3 x = 2.0 * fract(p * C.www) - 1.0;
  float3 h = abs(x) - 0.5;
  float3 ox = floor(x + 0.5);
  float3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
  float3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}float2 warp(float2 p, float t) {
  float2 q = float2(
    snoise(p + 0.1 * t),
    snoise(p + float2(5.2, 1.3) + 0.12 * t)
  );
  
  float2 r = float2(
    snoise(p + 3.0 * q + float2(1.7, 9.2) + 0.15 * t),
    snoise(p + 3.0 * q + float2(8.3, 2.8) + 0.13 * t)
  );
  
  return p + 2.0 * r * blur;
}

float metaball(float2 uv, float2 center, float radius) {
  float d = length(uv - center);
  return radius / (d * d + 0.001);
}


float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

half4 main(float2 fragCoord) {
  float2 uv = fragCoord / resolution;
  float aspect = resolution.x / resolution.y;
  
  float2 st = uv;
  st.x *= aspect;
  
  float t = time * 0.12; // slow speed for smooth animation
  
  // 1. Warp the coordinates horizontally to create wavy diagonal currents
  float waveOffset = sin(st.y * 3.5 - t * 2.5) * 0.12 + cos(st.x * 2.5 + t) * 0.08;
  float2 waveUV = st;
  waveUV.x += waveOffset;
  waveUV.y += sin(st.x * 4.5 - t * 1.8) * 0.06;
  
  // 2. Compute FBM noise curtains that slide horizontally (diagonally)
  float2 noiseSpace = waveUV * 2.0 + float2(-t * 0.9, t * 0.2);
  float n1 = fbm(noiseSpace, 3);
  float n2 = fbm(noiseSpace * 1.5 - float2(t * 0.4, -t * 0.2), 2);
  
  // Combine noise layers to form vertical bands/curtains
  float curtain = clamp((n1 * 0.65 + n2 * 0.35 - 0.15) * 1.6, 0.0, 1.0);
  
  // 3. Define color bands based on X-axis (waveUV.x) and Y-axis (waveUV.y)
  float blendVal = clamp(waveUV.x + waveOffset * 0.4, 0.0, 1.0);
  
  float3 baseCol;
  if (blendVal < 0.33) {
    baseCol = mix(color1.rgb, color2.rgb, blendVal / 0.33);
  } else if (blendVal < 0.66) {
    baseCol = mix(color2.rgb, color3.rgb, (blendVal - 0.33) / 0.33);
  } else {
    baseCol = mix(color3.rgb, color4.rgb, (blendVal - 0.66) / 0.34);
  }
  
  // Add highlight/glow overlays that follow the noise curtains
  float3 highlightCol = color2.rgb * n1 + color3.rgb * n2;
  
  // Final color is the base blended color, masked and highlighted by the waving curtains
  float3 col = baseCol * (0.35 + 0.65 * curtain) + highlightCol * curtain * 0.4;
  
  // Apply contrast, vignette and grain
  col = pow(col, float3(1.0 / (0.85 + contrast * 0.35)));
  float gray = dot(col, float3(0.299, 0.587, 0.114));
  col = mix(float3(gray), col, 1.0 + contrast * 0.15);
  
  // Add noise grain
  float grain = hash(fragCoord + fract(time * 60.0)) * 2.0 - 1.0;
  col += grain * 0.02 * noise;
  
  // Vignette
  float2 vignetteUV = uv * 2.0 - 1.0;
  float vignette = 1.0 - dot(vignetteUV, vignetteUV) * 0.15;
  col *= vignette;
  col = clamp(col, 0.0, 1.0);
  
  return half4(col, 1.0);
}

`;

// Frame callback hook



const useFrameTime = <T extends IFrameBack>({
  fpsLock,
  animated,
  speed,
}: T): SharedValue<number> => {
  const time = useSharedValue<number>(0);
  const accumulated = useSharedValue<number>(0);

  useFrameCallback((frameInfo: FrameInfo) => {
    if (animated && frameInfo.timeSincePreviousFrame !== null) {
      accumulated.value += frameInfo.timeSincePreviousFrame;

      if (fpsLock < 0) {
        time.value += (frameInfo.timeSincePreviousFrame / 1000) * speed;
        return;
      }

      const frameInterval = 1000 / fpsLock;

      if (accumulated.value >= frameInterval) {
        time.value += (frameInterval / 1000) * speed;
        accumulated.value -= frameInterval;
      }
    }
  }, animated);

  return time;
};




// Main Component






const shader = Skia.RuntimeEffect.Make(MESH_GRADIENT_SHADER);

export const MeshGradient: React.FC<IAnimatedMeshGradient> = memo(({
    colors = DEFAULT_INITIAL_COLORS,
    speed = 1,
    noise = 0.15,
    blur = 0.4,
    contrast = 1,
    animated = true,
    style,
    width: paramsWidth = Dimensions.get("window").width,
    height: paramsHeight = Dimensions.get("window").height,
    performance,
    children,
  }) => {
    const width = useSharedValue<number>(paramsWidth ?? 1);
    const height = useSharedValue<number>(paramsHeight ?? 1);
    const scale =
      performance?.undersampling ?? DEFAULT_PERFORMANCE.undersampling;

    const time = useFrameTime({
      fpsLock: performance?.fpsLock ?? DEFAULT_PERFORMANCE.fpsLock,
      animated,
      speed,
    });

    const safeColors = useMemo<IMeshGradientColor[]>(() => {
      const result = colors.map((c: any) => {
        if (typeof c === "string") {
          if (c.startsWith("rgb")) {
            const match = c.match(/\d+/g);
            if (match && match.length >= 3) {
              return {
                r: parseInt(match[0], 10) / 255,
                g: parseInt(match[1], 10) / 255,
                b: parseInt(match[2], 10) / 255,
              };
            }
          }
          const hex = c.replace("#", "");
          return {
            r: parseInt(hex.substring(0, 2), 16) / 255,
            g: parseInt(hex.substring(2, 4), 16) / 255,
            b: parseInt(hex.substring(4, 6), 16) / 255,
          };
        }
        return c;
      });
      while (result.length < 4) {
        result.push(
          DEFAULT_INITIAL_COLORS[result.length % DEFAULT_INITIAL_COLORS.length],
        );
      }
      return result.slice(0, 4);
    }, [colors]);

    const uniforms = useDerivedValue(() => {
      return {
        resolution: vec(
          Math.round(width.value * scale),
          Math.round(height.value * scale),
        ),
        time: time.value,
        noise: Math.max(0, Math.min(1, noise)),
        blur: Math.max(0, Math.min(1, blur)),
        contrast: Math.max(0, Math.min(2, contrast)),
        color1: [safeColors[0].r, safeColors[0].g, safeColors[0].b, 1],
        color2: [safeColors[1].r, safeColors[1].g, safeColors[1].b, 1],
        color3: [safeColors[2].r, safeColors[2].g, safeColors[2].b, 1],
        color4: [safeColors[3].r, safeColors[3].g, safeColors[3].b, 1],
      };
    }, [width, height, noise, blur, contrast, safeColors, time]);

    const canvasWrapperStyle = useAnimatedStyle<
      Required<
        Partial<
          Pick<
            ViewStyle,
            | "position"
            | "top"
            | "left"
            | "width"
            | "height"
            | "transform"
            | "transformOrigin"
            | "zIndex"
          >
        >
      >
    >(() => ({
      position: "absolute",
      top: 0,
      left: 0,
      width: Math.round(width.value * scale),
      height: Math.round(height.value * scale),
      transform: [{ scale: 1 / scale }],
      transformOrigin: "left top",
      zIndex: -9999,
    }));

    const onLayout = useCallback(
      (e: LayoutChangeEvent) => {
        const w = e.nativeEvent.layout.width;
        const h = e.nativeEvent.layout.height;
        width.value = w < 1 ? 1 : w;
        height.value = h < 1 ? 1 : h;
      },
      [width, height],
    );

    if (!shader) {
      return (
        <View
          style={[
            styles.container,
            style,
            { width: width.value, height: height.value },
          ]}
        />
      );
    }

    return (
      <View
        style={[
          styles.container,
          style,
          {
            width: paramsWidth,
            height: paramsHeight,
          },
        ]}
        onLayout={onLayout}
      >
        {children}
        <Animated.View style={canvasWrapperStyle}>
          <Canvas style={StyleSheet.absoluteFill}>
            <Fill>
              <Shader source={shader} uniforms={uniforms} />
            </Fill>
          </Canvas>
        </Animated.View>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
  },
});

export default MeshGradient;

