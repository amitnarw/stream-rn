# Sozo RN Android Rules

## Build Environment (This Machine)
```powershell
$env:JAVA_HOME  = "C:\Program Files\Eclipse Adoptium\jdk-17.0.19.10-hotspot"
$env:ANDROID_HOME = "D:\Android\Sdk"
$env:Path = "$env:ANDROID_HOME\platform-tools;$env:Path"
```
> Note: `local.properties` also has `java.home` set, so Gradle finds it automatically.


## Visual Parity & Glass Aesthetics
- All screen layouts must implement the electric blue and dark glassmorphic styling system tokens (defined in `src/theme.ts`).
- Avoid native `BlurView` components inside scrollable list rows to maintain 60fps performance; use static CSS glass effects instead.
- Retain progressive image loading and top/bottom absolute linear gradients for edge screen fades.

## Noob-Friendly Interfaces
- **Error States:** Never expose raw Kotlin/Java exceptions (like `SocketTimeoutException`, `NullPointerException`, or `IllegalArgumentException`) in the UI. Translate all technical failures into simple, non-technical explanations (e.g. "Server offline or blocked" or "Try again in a moment").
- **Settings & Prompts:** Use natural, user-friendly language for options rather than technical database or caching terminology (e.g. use "Refresh Video Links" instead of "Clear cached playback links").
