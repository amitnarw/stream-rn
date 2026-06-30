package com.anonymous.sozornandroid.cloudstream

import android.content.Intent
import android.util.Log
import com.facebook.react.bridge.*
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout

class CloudStreamModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val pluginHost = CloudStreamPluginHost(reactContext).also {
        CloudStreamPluginHost.instance = it
    }

    override fun getName(): String = "CloudStreamModule"

    @ReactMethod
    fun loadPlugins(promise: Promise) {
        try {
            val providers = pluginHost.loadPluginsFromAssets()
            val json = pluginHost.getProvidersJson()
            promise.resolve(json)
        } catch (e: Exception) {
            promise.reject("LOAD_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun getProviders(promise: Promise) {
        try {
            val json = pluginHost.getProvidersJson()
            promise.resolve(json)
        } catch (e: Exception) {
            promise.reject("PROVIDER_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun getMainPage(providerName: String, page: Int, promise: Promise) {
        Thread {
            try {
                val json = runBlocking { withTimeout(30000L) { pluginHost.getMainPageJson(providerName, page) } }
                promise.resolve(json)
            } catch (e: Exception) {
                promise.resolve("""{"provider":"$providerName","sections":[]}""")
            }
        }.start()
    }

    @ReactMethod
    fun search(providerName: String, query: String, promise: Promise) {
        Thread {
            try {
                val json = runBlocking { withTimeout(30000L) { pluginHost.searchJson(providerName, query) } }
                promise.resolve(json)
            } catch (e: Exception) {
                promise.resolve("""{"items":[]}""")
            }
        }.start()
    }

    @ReactMethod
    fun loadDetail(providerName: String, url: String, promise: Promise) {
        Thread {
            try {
                val json = runBlocking { withTimeout(30000L) { pluginHost.loadDetailJson(providerName, url) } }
                promise.resolve(json)
            } catch (e: Exception) {
                promise.resolve("{}")
            }
        }.start()
    }

    @ReactMethod
    fun loadLinks(providerName: String, data: String, promise: Promise) {
        Thread {
            try {
                val json = runBlocking { withTimeout(30000L) { pluginHost.loadLinksJson(providerName, data) } }
                promise.resolve(json)
            } catch (e: Exception) {
                promise.resolve("""{"sources":[],"subtitles":[]}""")
            }
        }.start()
    }

    @ReactMethod
    fun playWithMediaRef(providerName: String, data: String, title: String) {
        try {
            val context = reactApplicationContext
            val intent = Intent(context, PlayerActivity::class.java).apply {
                putExtra("providerName", providerName)
                putExtra("data", data)
                putExtra("title", title)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
        } catch (e: Exception) {
            Log.e("CloudStreamModule", "Error starting player with media ref", e)
        }
    }

    @ReactMethod
    fun playStream(
        url: String,
        headers: String,
        title: String,
        subtitleUrl: String,
        sourcesJson: String,
        subtitlesJson: String,
        episodesJson: String,
        currentEpisodeIndex: Int,
        imdbId: String,
        mediaType: String,
        posterUrl: String,
        season: Int,
        episode: Int,
        episodeTitle: String,
        logoUrl: String
    ) {
        try {
            val context = reactApplicationContext
            val intent = Intent(context, PlayerActivity::class.java).apply {
                putExtra("url", url)
                putExtra("headers", headers)
                putExtra("referer", "")
                putExtra("subtitleUrl", subtitleUrl)
                putExtra("title", title)
                putExtra("sourcesJson", sourcesJson)
                putExtra("subtitlesJson", subtitlesJson)
                putExtra("episodesJson", episodesJson)
                putExtra("currentEpisodeIndex", currentEpisodeIndex)
                putExtra("imdbId", imdbId)
                putExtra("mediaType", mediaType)
                putExtra("posterUrl", posterUrl)
                putExtra("season", season)
                putExtra("episode", episode)
                putExtra("episodeTitle", episodeTitle)
                putExtra("logoUrl", logoUrl)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
        } catch (e: Exception) {
            Log.e("CloudStreamModule", "Error starting player", e)
        }
    }

    @ReactMethod
    fun getPlaybackHistory(promise: Promise) {
        try {
            val prefs = reactApplicationContext.getSharedPreferences("sozo_playback_history", android.content.Context.MODE_PRIVATE)
            val history = prefs.getString("history", "[]") ?: "[]"
            promise.resolve(history)
        } catch (e: Exception) {
            promise.resolve("[]")
        }
    }

    @ReactMethod
    fun clearPlaybackHistory(promise: Promise) {
        try {
            val prefs = reactApplicationContext.getSharedPreferences("sozo_playback_history", android.content.Context.MODE_PRIVATE)
            prefs.edit().remove("history").apply()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    private fun deleteDirContents(dir: java.io.File?): Boolean {
        if (dir == null || !dir.exists() || !dir.isDirectory) return false
        val children = dir.listFiles() ?: return true
        var success = true
        for (child in children) {
            if (child.isDirectory) {
                success = success && deleteDirContents(child)
            }
            try {
                val deleted = child.delete()
                if (!deleted) success = false
            } catch (e: Exception) {
                success = false
            }
        }
        return success
    }

    @ReactMethod
    fun clearNativeCache(promise: Promise) {
        val context = reactApplicationContext
        Thread {
            try {
                // Clear Fresco image pipeline caches (in-memory & disk)
                try {
                    com.facebook.drawee.backends.pipeline.Fresco.getImagePipeline().clearCaches()
                } catch (e: Exception) {
                    Log.w("CloudStreamModule", "Failed to clear Fresco image caches: ${e.message}")
                }

                // Clear app cache directory contents safely (without deleting the directory itself)
                try {
                    val cacheDir = context.cacheDir
                    deleteDirContents(cacheDir)
                } catch (e: Exception) {
                    Log.w("CloudStreamModule", "Failed to clear cache directory contents: ${e.message}")
                }

                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("CACHE_ERROR", e.message, e)
            }
        }.start()
    }
}
