# Sozo RN Android - Project State

## Overview

A browse/search/play streaming Android app using **React Native (Expo SDK 55)** + **on-device CloudStream plugins** (.cs3 files loaded at runtime via `InMemoryDexClassLoader`). No custom backend. No custom scraper code. Content comes entirely from CloudStream plugin providers (Phisher Repo, Official Repo, etc.).

**Core Architecture**: React Native old bridge (ReactContextBaseJavaModule) -> Kotlin native module -> CloudStream library (v4.7.0 on JitPack) -> .cs3 plugin files bundled in APK assets.

---

## File Inventory

### Root
- `C:\Users\Narwal\Desktop\stream-rn\` - Expo bare-minimum project root (this laptop)
- `App.js` - Stack navigator (Home -> Search -> Detail)
- `package.json` - Dependencies: react-navigation, expo-video (SDK 55)

### TypeScript Source (`src/`)
- `src/api/cloudStreamBridge.ts` - Native module bridge, returns parsed JSON
- `src/types/plugin.ts` - TypeScript models: PluginProvider, MediaItem, HomeSection, DetailResult, EpisodeItem, VideoSource, LinksResult
- `src/screens/HomeScreen.tsx` - Provider chips + horizontal section FlatLists
- `src/screens/SearchScreen.tsx` - Search input + 3-column grid results
- `src/screens/DetailScreen.tsx` - Banner, info, episode list -> loadLinks -> playStream (passes subtitles)
- `src/components/MediaCard.tsx` - Reusable poster card

### Android Native (`android/`)
- `android/build.gradle` - Root build: Kotlin 2.3.21 (for CloudStream library compatibility)
- `android/app/build.gradle` - App module: CloudStream library, ExoPlayer (Media3), Jsoup, kotlinx-coroutines, packaging excludes
- `android/settings.gradle` - Expo module auto-linking
- `android/local.properties` - `sdk.dir=D:/Android/Sdk`

### Kotlin Native Module (`android/app/src/main/java/com/anonymous/sozornandroid/`)
- `MainApplication.kt` - Registers `CloudStreamPackage`
- `cloudstream/CloudStreamPluginHost.kt` - **Core**: Loads .cs3 plugins via `InMemoryDexClassLoader`, reads manifest.json, instantiates plugin classes, accesses providers via `APIHolder.allProviders`. Uses `BasePlugin`. All methods return JSON strings. Uses `readBytes()` for complete DEX loading.
- `cloudstream/CloudStreamModule.kt` - React Native bridge (ReactContextBaseJavaModule). Uses `Thread + runBlocking + withTimeout(30000L)` for suspend functions. Returns JSON strings. `playStream()` now accepts `subtitleUrl`.
- `cloudstream/CloudStreamPackage.kt` - Registers CloudStreamModule
- `cloudstream/PlayerActivity.kt` - ExoPlayer (Media3) activity. **Landscape mode**, top overlay (title + back), auto-hide controls, DefaultTrackSelector for adaptive quality, subtitle track support.
- `AndroidManifest.xml` - Added PlayerActivity with `Theme.AppCompat.NoActionBar`

### Assets (Plugins) — actual files on disk
- `android/app/src/main/assets/plugins/Goojara.cs3` ✅
- `android/app/src/main/assets/plugins/FourKHDHub.cs3` ✅
- `android/app/src/main/assets/plugins/YTS.cs3` ✅
- `android/app/src/main/assets/plugins/CloudPlay.cs3` ✅
- `android/app/src/main/assets/plugins/Movies4u.cs3` ✅
- `android/app/src/main/assets/plugins/Movierulzhd.cs3` ✅
- `android/app/src/main/assets/plugins/HDhub4u.cs3` ✅

---

## Key Decisions

### InMemoryDexClassLoader over PathClassLoader
- Android 14+ (API 34) blocks `PathClassLoader` from loading DEX files in writable directories (`SecurityException: Writable dex file`)
- Fix: Read DEX bytes from .cs3 ZIP via `readBytes()`, wrap in `ByteBuffer`, load via `InMemoryDexClassLoader`
- `readBytes()` (not `read()`) ensures complete DEX data - `InputStream.read()` may return fewer bytes than buffer size
- Requires API 28+; target is API 36 (Nothing Phone 3)

### React Native Old Bridge (not Turbo Modules)
- Uses `ReactContextBaseJavaModule` (old bridge) for stability
- Methods annotated with `@ReactMethod`, return results via Promise
- Suspend functions (CloudStream API) called via `Thread { runBlocking { ... } }`

### Native ExoPlayer Activity (not expo-video)
- Stream sources often require custom HTTP headers (Referer, etc.)
- expo-video doesn't support custom headers
- Native `PlayerActivity` starts via Intent, uses Media3 ExoPlayer with `DefaultTrackSelector`
- **Landscape mode** forced on launch (`requestedOrientation = SCREEN_ORIENTATION_USER_LANDSCAPE`)
- Top overlay: title + back button, auto-hides after 4s, tap to show

### JSON String Bridge (not WritableArray/Maps)
- All native methods return JSON strings
- TypeScript side parses with `JSON.parse()`
- Avoids complex WritableArray conversion

### No Plugin Class from Library
- CloudStream library only has `BasePlugin` (not `Plugin`)
- `Plugin` class is part of CloudStream app module, not library

### Kotlin Version: 2.3.21 (root) for CloudStream Compatibility
- CloudStream library v4.7.0 compiled with Kotlin 2.3.0
- Root build.gradle uses Kotlin 2.3.21 to match
- Expo modules compiled with 2.1.20 can be read by 2.3.21 compiler (verified, builds pass)
- Metadata mismatch warning is non-fatal

### Expo SDK 55 over SDK 56
- Downgraded from SDK 56 → 55 to avoid `pika-compiler` dependency (required by SDK 56's New Architecture for Kotlin 2.3.x, unavailable on JitPack from this network)
- SDK 55 uses React Native 0.83.6, React 19.2.0
- SDK 55's New Architecture does NOT require pika-compiler on JitPack (RN 0.83 uses a different codegen pipeline)

---

## Build Configuration

### Environment Variables (must be set in every session)
```
$env:ANDROID_HOME = "D:\Android\Sdk"
$env:JAVA_HOME = "C:\Users\Narwal\jdk-17"
$env:Path = "$env:ANDROID_HOME\platform-tools;$env:Path"
```

### Build Commands
```powershell
# From project root - full build + install + launch:
npx expo run:android

# Or from android/ directory - just compile Kotlin (fast check):
.\gradlew.bat :app:compileDebugKotlin

# Full APK build (no install):
.\gradlew.bat :app:assembleDebug -x lint -x test
```

### Key Dependencies (build.gradle)
- Kotlin: 2.3.21 (root build.gradle - for CloudStream compatibility)
- CloudStream: `com.github.recloudstream.cloudstream:library:v4.7.0` (JitPack)
- ExoPlayer: `androidx.media3:media3-exoplayer:1.5.1`, `media3-ui:1.5.1`, `media3-exoplayer-hls:1.5.1`
- Jsoup: `org.jsoup:jsoup:1.18.3`
- kotlinx-coroutines-android: `1.9.0`

---

## Current State (June 16, 2026)

### Working
- Kotlin compilation passes (`BUILD SUCCESSFUL`)
- CloudStream library dependency resolves correctly (JitPack accessible via IPv4 with `-Djava.net.preferIPv4Stack=true`)
- TypeScript screens compile (Home, Search, Detail)
- Native module bridge compiles
- PlayerActivity compiles with landscape mode, subtitle support, top overlay
- DEX byte reading fixed (`readBytes()` ensures complete read)
- FourKHDHub class verified in DEX (`com.fourKHDHub.FourKHDHubProvider`)
- Kotlin 2.3.21 + Expo modules compatibility verified (build passes)
- **Full APK assembled successfully** (`BUILD SUCCESSFUL`)
- **APK installed on Nothing Phone 3** (via `adb install`)
- Network security config added (cleartext traffic allowed for streaming)
- Offline/connectivity detection in JS bridge
- Error UI with retry on all screens (Home, Search, Detail)
- PlayerActivity: proper back arrow + system back handling
- PlayerActivity: true immersive mode (edge-to-edge, hides status/nav bars on all API levels)
- PlayerActivity: brightness/volume gestures (swipe left half = brightness, right half = volume)
- PlayerActivity: non-fatal error overlay with Retry/Back options
- PlayerActivity: Next/Previous episode buttons + auto-play next
- PlayerActivity: sleep timer (15min, 30min, 60min, End of episode)
- PlayerActivity: MediaSession integration (lock-screen controls, notification, audio focus)

### Not Yet Tested (Runtime)
- All UI features are compile-verified but runtime-untested

### Known Issues
- `expo-constants:createExpoConfig` warning about NODE_ENV (harmless)
- Gradle deprecated features warnings (harmless)
- The `kotlinVersion` in root project is 2.3.21 while Expo gradle plugin reports `kotlin: 2.1.20` (Expo modules are compiled with 2.1.20, metadata mismatch is non-fatal)

---

## Bridge Methods (native -> JS)

| Method | Args | Returns (JSON string) |
|--------|------|----------------------|
| `loadPlugins()` | none | `[{id, name, url, hasMainPage}]` |
| `getProviders()` | none | `[{id, name, url, hasMainPage}]` |
| `getMainPage(providerName, page)` | String, Int | `{provider, sections: [{name, items}]}` |
| `search(providerName, query)` | String, String | `{items: [{provider, url, title, posterUrl, type}]}` |
| `loadDetail(providerName, url)` | String, String | `{provider, url, title, description, posterUrl, banner, year, isSerial, episodes}` |
| `loadLinks(providerName, data)` | String, String | `{videoUrl, sources: [{quality, url, type, host, headers}], subtitles: [{lang, url}]}` |
| `playStream(url, headers, title, subtitleUrl, sourcesJson, subtitlesJson)` | String, String, String, String, String, String | void (starts PlayerActivity in landscape) |

---

## Next Steps

1. **Build + install on device**: `npx expo run:android` or `.\gradlew.bat :app:assembleDebug` + `adb install` ✅ DONE
2. **Test plugin loading** - Check Logcat: `adb logcat -s CloudStreamPluginHost`
3. **Test browsing** - Does `getMainPage` return sections?
4. **Test detail loading** - Tap a media card, does `loadDetail` work?
5. **Test playback** - Tap an episode, does `loadLinks` find sources? Does PlayerActivity play in landscape?
6. **Fix any runtime errors** - Most plugin loading errors show in Logcat
7. **Verify FourKHDHub** now loads with the fixed `readBytes()` call

---

## Troubleshooting

### "Failed to resolve the Android SDK path"
Set `ANDROID_HOME` to `D:\Android\Sdk` in every PowerShell session. OR create `android/local.properties` with `sdk.dir=D:/Android/Sdk`.

### "Failed to apply plugin 'com.facebook.react.rootproject'"
Usually means SDK path not found. Make sure `local.properties` exists with `sdk.dir=D:/Android/Sdk`.

### "SecurityException: Writable dex file ... is not allowed"
Android 14+ blocks `PathClassLoader`. Fix: Use `InMemoryDexClassLoader(ByteBuffer.wrap(dexRaw), parentClassLoader)`.

### "Bad checksum" or "ClassNotFoundException"
DEX bytes not read completely. Fix: Use `InputStream.readBytes()` instead of `read(byte[])` which may return fewer bytes.

### "Kotlin metadata version mismatch"
Library compiled with Kotlin 2.3.0, project Kotlin 2.3.20, Expo modules compiled with 2.1.20. This is NON-FATAL.

### "adb: device unauthorized"
Check phone screen for USB debugging authorization prompt. Re-plug USB cable.

### "INSTALL_FAILED_UPDATE_INCOMPATIBLE"
`adb uninstall com.anonymous.sozornandroid` then retry.

### "Could not find method implementation() for arguments"
Use Gradle 9.x format: `implementation(...)` with parentheses, not string notation.

### "Cannot fit requested classes in a single dex file"
Add `multiDexEnabled true` to `defaultConfig` in app/build.gradle.

### "TypeError: cannot add a new property" (Ref Binding in Fabric / React Native 19)
Under React Native 19 / Fabric New Architecture, RefObjects (e.g. returned by `useRef`) are frozen. Do NOT pass custom objects with getters/setters as `ref` props to native components. Instead, use the **Callback Ref with State** pattern:
1. Create a standard RefObject: `const blurTargetRef = useRef<any>(null);`
2. Define a callback setter:
   ```tsx
   const setBlurTargetRef = (val: any) => {
     blurTargetRef.current = val;
     if (val !== blurTarget) {
       setBlurTarget(val);
     }
   };
   ```
3. Pass the callback ref to the target view: `<BlurTargetView ref={setBlurTargetRef as any}>`
4. Pass the standard RefObject to the consumer: `<BlurView blurTarget={blurTargetRef}>`

### "TypeError: cannot add a new property" (Animated Styles on Non-Animated Components)
Do NOT pass `Animated.Value` or `Animated.Interpolation` variables (such as animated opacity) directly to the `style` prop of standard non-animated components (like `BlurView`). This will cause a Hermes crash during style resolution. 
- **Fix:** Wrap the non-animated component inside a standard `<Animated.View style={[StyleSheet.absoluteFillObject, { opacity: animatedVal }]}>` and keep the inner component's styles static.

---

## Design System, Theme & Feel

All screens and UI components must strictly adhere to the following design system to maintain the app's premium, Dribbble-like frosted glass aesthetic. All colors, spacing, and styles should be imported from the central design token file: **[theme.ts](file:///d:/amit/sozo-rn-android/src/theme.ts)**.

### 1. Color Palette (Design Tokens)
- All design tokens are exported from `src/theme.ts` via the `theme` object.
- **Main Background**: Pitch black (`theme.colors.background` / `#050505`) for absolute contrast.
- **Accent Glow**: Subtle electric blue ambient linear gradient top glows (`theme.colors.accentGlow` / `rgba(0, 71, 255, 0.12)` to `transparent`) to add depth.
- **Glass Cards**: Dark semi-transparent cards (`theme.colors.cardBg` / `rgba(20, 18, 24, 0.65)`) with thin borders (`theme.colors.cardBorder` / `rgba(255, 255, 255, 0.08)`) and `borderRadius: 20` (available as preset `theme.glass.card`).
- **Text Primary**: Crisp white/light grey (`theme.colors.textPrimary` / `#ffffff` / `#E5E2E3`).
- **Text Secondary**: Muted cool grey (`theme.colors.textSecondary` / `#A0A0A5` or `theme.colors.textMuted` / `#8E8D92`) for captions/descriptions.
- **Accent Highlights**: Soft electric blue highlights (`theme.colors.accent` / `#0047FF` or `theme.colors.accentLight` / `#5580FF`) for selected states, tabs, or settings radio buttons.
- **Rose/Red Accent**: Glowing rose/pink-red (`theme.colors.rose` / `#ff4a7d`) with matching light glass backgrounds (`theme.colors.roseBg` / `rgba(255, 74, 125, 0.08)` and border `theme.colors.roseBorder` / `rgba(255, 74, 125, 0.25)`) for destructive actions (e.g., Clear Cache) or active states (e.g., Favorites heart toggled active).

### 2. Floating Capsule Headers
- **Layout**: Float capsules at the top of screens (absolute position: `left: 20, right: 20, height: 48, borderRadius: 24`, completely borderless).
- **Glass Backdrop**: Internal `<BlurView intensity={100} tint="dark" />` combined with a dark tint overlay (`rgba(15, 15, 20, 0.38)`) for maximum readability.
- **Scroll Animation**: Interpolate `scrollY` on the ScrollView to fade in the capsule backdrop (`headerBgOpacity` from `0` to `1` over a scroll threshold of `40` to `180` pixels).
- **Navigation Buttons**: Capsule buttons on left/right must be circular blurs (`width: 36, height: 36, borderRadius: 18`) with glass backdrops. Left button uses `arrow-back` if navigation can go back, or fallback icons like `settings-outline` or `person-circle-outline` if root tab.

### 3. Glassmorphic Action Buttons
- **Trailer/Action Buttons**: Minimalist, borderless circular glass buttons (`width: 60, height: 60, borderRadius: 30`, background `rgba(15, 15, 20, 0.45)`) featuring native `BlurView (intensity: 90)` and premium drop shadow (`elevation: 6, shadowOpacity: 0.3`).
- **Labels**: High-contrast, letter-spaced, bold uppercase labels (e.g., `"TRAILER"`) positioned directly underneath the circle.

### 4. Progressive Image Loading
- **No Blank/Black Flashes**: Always wrap loading images with:
  1. A solid base dark grey placeholder card (`#121214`).
  2. A low-opacity (`0.45`), highly blurred (`blurRadius={25}`) version of the catalog's cached poster. This loads instantly, giving the screen a rich ambient glow matching the movie/show color scheme.
  3. The high-resolution poster fades in on top of this layer.

### 5. Native Blur vs. CSS Glass Shadows (Performance)
- **Rule**: Native `BlurView` on Android performs real-time screen capture/render. Running multiple active native blurs concurrently in list items (such as episode row thumbnails) causes rendering thread saturation and severe scroll lag.
- **Implementation**:
  - Use native `BlurView` **ONLY** for static overlay panels, floating headers, bottom sheet bases, or details background images.
  - Use high-performance CSS glass shadows (`backgroundColor: 'rgba(255, 255, 255, 0.85)'`, `borderWidth: 1.5`, `borderColor: 'rgba(255, 255, 255, 0.45)'`, `elevation: 3`) for play buttons or badges inside scrollable list rows to guarantee 60fps scrolling.

---

