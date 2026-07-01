# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# react-native-reanimated
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# Add any project specific keep options here:

# CloudStream library (v4.7.0) — keep all classes loaded at runtime
-keep class com.lagradost.cloudstream3.** { *; }
-keep class com.lagradost.api.** { *; }
-dontwarn com.lagradost.cloudstream3.**

# Plugin classes loaded via InMemoryDexClassLoader (reflective instantiation)
-keep class com.phisher98.** { *; }
-keep class com.fourKHDHub.** { *; }
-keep class com.YTS.** { *; }
-keep class com.Goojara.** { *; }
-keep class com.hdhub4u.** { *; }
-keep class com.allwish.** { *; }
-keep class com.cinefreak.** { *; }
-keep class com.Desicinemas.** { *; }
-keep class com.dudefilms.** { *; }
-keep class com.hindmoviez.** { *; }
-keep class com.tamilblasters.** { *; }
-keep class com.lagradost.cloudstream3.plugins.** { *; }
