package com.anonymous.sozornandroid.cloudstream

import android.content.Context
import android.util.Log
import com.lagradost.cloudstream3.APIHolder
import com.lagradost.cloudstream3.AnimeLoadResponse
import com.lagradost.cloudstream3.Episode
import com.lagradost.cloudstream3.MainAPI
import com.lagradost.cloudstream3.MainPageRequest
import com.lagradost.cloudstream3.MovieLoadResponse
import com.lagradost.cloudstream3.SearchResponse
import com.lagradost.cloudstream3.SubtitleFile
import com.lagradost.cloudstream3.TvSeriesLoadResponse
import com.lagradost.cloudstream3.plugins.BasePlugin
import com.lagradost.cloudstream3.utils.ExtractorLink
import dalvik.system.InMemoryDexClassLoader
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.zip.ZipFile

class CloudStreamPluginHost(private val appContext: Context) {

    companion object {
        private const val TAG = "CloudStreamPluginHost"
        var instance: CloudStreamPluginHost? = null
    }

    private val loadedPlugins = HashMap<String, BasePlugin>()
    private val pluginProviders = HashMap<String, List<String>>()

    data class Manifest(
        val pluginClassName: String?,
    )

    private fun loadCs3(file: File, internalName: String): List<String> {
        loadedPlugins[internalName]?.let { return pluginProviders[internalName] ?: emptyList() }
        return try {
            val zip = ZipFile(file)
            val manifestEntry = zip.getEntry("manifest.json") ?: run {
                zip.close(); Log.e(TAG, "no manifest.json in ${file.name}"); return emptyList()
            }
            val manifestText = zip.getInputStream(manifestEntry).bufferedReader().use { it.readText() }
            val manifestObj = JSONObject(manifestText)
            val className = manifestObj.optString("pluginClassName").ifEmpty { null } ?: run {
                zip.close(); Log.e(TAG, "no pluginClassName in ${file.name}"); return emptyList()
            }

            val dexEntry = zip.getEntry("classes.dex") ?: run {
                zip.close(); Log.e(TAG, "no classes.dex in ${file.name}"); return emptyList()
            }
            val dexRaw = zip.getInputStream(dexEntry).use { it.readBytes() }
            zip.close()

            val before = APIHolder.allProviders.map { it.name }.toSet()
            val dexBuffer = java.nio.ByteBuffer.wrap(dexRaw)
            val dexLoader = InMemoryDexClassLoader(dexBuffer, appContext.classLoader)

            val instance = dexLoader.loadClass(className)
                .getDeclaredConstructor().newInstance() as BasePlugin
            instance.filename = file.absolutePath
            instance.load()
            loadedPlugins[internalName] = instance

            val added = APIHolder.allProviders.map { it.name }.filter { it !in before }
            pluginProviders[internalName] = added
            Log.i(TAG, "loaded ${file.name}: providers=$added")
            added
        } catch (t: Throwable) {
            Log.e(TAG, "failed to load ${file.name}: ${Log.getStackTraceString(t)}")
            emptyList()
        }
    }

    fun loadPluginsFromAssets(): List<String> {
        val allProviders = mutableListOf<String>()
        val assetManager = appContext.assets
        val pluginFiles = try { assetManager.list("plugins") ?: emptyArray() } catch (_: Exception) { emptyArray() }
        for (fileName in pluginFiles) {
            if (!fileName.endsWith(".cs3")) continue
            try {
                val cacheDir = File(appContext.cacheDir, "plugins")
                cacheDir.mkdirs()
                val cachedFile = File(cacheDir, fileName)
                appContext.assets.open("plugins/$fileName").use { input ->
                    cachedFile.outputStream().use { output -> input.copyTo(output) }
                }
                val providers = loadCs3(cachedFile, fileName)
                allProviders.addAll(providers)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to load plugin asset $fileName", e)
            }
        }
        return allProviders
    }

    fun loadLinksBlocking(providerName: String, data: String): String {
        val api = apiByName(providerName) ?: return """{"sources":[],"subtitles":[]}"""
        return try {
            kotlinx.coroutines.runBlocking {
                kotlinx.coroutines.withTimeout(30000L) {
                    loadLinksJson(providerName, data)
                }
            }
        } catch (_: Exception) {
            """{"sources":[],"subtitles":[]}"""
        }
    }

    private fun apiByName(name: String): MainAPI? {
        return APIHolder.allProviders.firstOrNull { it.name == name }
    }

    private fun cardJson(r: SearchResponse, apiName: String?) = JSONObject().apply {
        put("provider", apiName ?: "")
        put("url", r.url)
        put("title", r.name)
        put("posterUrl", r.posterUrl)
        put("type", r.type?.name)
    }

    fun getProvidersJson(): String {
        val arr = JSONArray()
        for (api in APIHolder.allProviders) {
            arr.put(JSONObject().apply {
                put("id", api.name)
                put("name", api.name)
                put("url", api.mainPage.firstOrNull()?.data ?: "")
                put("hasMainPage", true)
            })
        }
        return arr.toString()
    }

    suspend fun getMainPageJson(providerName: String, page: Int): String {
        val api = apiByName(providerName) ?: run {
            return JSONObject(mapOf("sections" to JSONArray(), "provider" to providerName)).toString()
        }
        val sections = JSONArray()
        for (mp in api.mainPage) {
            try {
                val resp = api.getMainPage(page, MainPageRequest(mp.name, mp.data, false))
                if (resp == null) continue
                for (list in resp.items) {
                    val items = JSONArray()
                    for (sr in list.list) items.put(cardJson(sr, api.name))
                    if (items.length() == 0) continue
                    sections.put(JSONObject().apply {
                        put("name", list.name)
                        put("items", items)
                    })
                }
            } catch (t: Throwable) {
                Log.e(TAG, "getMainPage ${api.name} '${mp.name}': ${t.javaClass.simpleName}: ${t.message}")
            }
        }
        return JSONObject().apply {
            put("provider", api.name)
            put("sections", sections)
        }.toString()
    }

    suspend fun searchJson(providerName: String, query: String): String {
        val api = apiByName(providerName) ?: return """{"items":[]}"""
        val items = JSONArray()
        val results = try { api.search(query) } catch (t: Throwable) {
            Log.e(TAG, "search ${api.name}: ${t.javaClass.simpleName}: ${t.message}"); null
        } ?: emptyList()
        for (r in results) items.put(cardJson(r, api.name))
        return JSONObject().apply { put("items", items) }.toString()
    }

    private fun episodeJson(e: Episode, index: Int) = JSONObject().apply {
        put("episode", e.episode ?: (index + 1))
        put("label", e.name ?: "Episode ${e.episode ?: (index + 1)}")
        put("mediaRef", e.data)
        if (e.posterUrl != null) put("image", e.posterUrl)
        if (e.season != null) put("season", e.season)
        if (!e.description.isNullOrEmpty()) put("overview", e.description)
    }

    suspend fun loadDetailJson(providerName: String, url: String): String {
        val api = apiByName(providerName) ?: return "{}"
        val resp = try { api.load(url) } catch (t: Throwable) {
            Log.e(TAG, "load ${api.name}: ${t.javaClass.simpleName}: ${t.message}"); null
        } ?: return "{}"
        val episodes = JSONArray()
        var isSerial = false
        when (resp) {
            is TvSeriesLoadResponse -> {
                isSerial = true
                resp.episodes.forEachIndexed { i, e -> episodes.put(episodeJson(e, i)) }
            }
            is AnimeLoadResponse -> {
                isSerial = true
                val list = resp.episodes.values.firstOrNull() ?: emptyList()
                list.forEachIndexed { i, e -> episodes.put(episodeJson(e, i)) }
            }
            is MovieLoadResponse -> {
                val ref = resp.dataUrl.ifEmpty { resp.url }
                episodes.put(JSONObject().apply {
                    put("episode", 1); put("label", "Play"); put("mediaRef", ref)
                })
            }
        }
        return JSONObject().apply {
            put("provider", api.name)
            put("url", resp.url)
            put("title", resp.name)
            put("description", resp.plot)
            put("posterUrl", resp.posterUrl)
            put("banner", resp.backgroundPosterUrl)
            put("year", resp.year ?: JSONObject.NULL)
            put("isSerial", isSerial)
            put("episodes", episodes)
        }.toString()
    }

    suspend fun loadLinksJson(providerName: String, data: String): String {
        val api = apiByName(providerName) ?: return "{}"
        val videoSources = JSONArray()
        val subs = JSONArray()
        if (api != null) {
            try {
                api.loadLinks(
                    data = data,
                    isCasting = false,
                    subtitleCallback = { sf: SubtitleFile ->
                        if (sf.url.isNotEmpty()) {
                            subs.put(JSONObject().apply {
                                put("lang", sf.lang)
                                put("url", sf.url)
                                put("default", false)
                            })
                        }
                    },
                    callback = { link: ExtractorLink ->
                        if (link.url.isNotEmpty()) {
                            val headers = JSONObject()
                            if (link.referer.isNotEmpty()) headers.put("Referer", link.referer)
                            val q = link.quality
                            val res = if (q in 144..4320) "${q}p" else null
                            val label = if (res != null) "${link.name} · $res" else link.name
                            videoSources.put(JSONObject().apply {
                                put("quality", label)
                                put("url", link.url)
                                put("type", if (link.isM3u8) "hls" else "http")
                                put("host", link.name)
                                put("headers", headers)
                            })
                        }
                    }
                )
            } catch (t: Throwable) {
                Log.e(TAG, "loadLinks ${api.name}: ${t.javaClass.simpleName}: ${t.message}")
            }
        }
        return JSONObject().apply {
            put("videoUrl", if (videoSources.length() > 0) videoSources.getJSONObject(0).optString("url") else null)
            put("sources", videoSources)
            put("subtitles", subs)
        }.toString()
    }
}
