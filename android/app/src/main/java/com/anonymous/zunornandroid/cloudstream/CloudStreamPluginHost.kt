package com.anonymous.zunornandroid.cloudstream

import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContext
import com.facebook.react.modules.core.DeviceEventManagerModule
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
import java.lang.ref.WeakReference
import java.util.zip.ZipFile

class CloudStreamPluginHost(val appContext: ReactApplicationContext) {

    init {
        try {
            val cls = Class.forName("com.lagradost.api.ContextHelper_androidKt")
            val ctxField = cls.getDeclaredField("ctx")
            ctxField.isAccessible = true
            ctxField.set(null, WeakReference<android.content.Context>(appContext))
        } catch (_: Exception) {}

        // Global OkHttpClient Interceptor Patch to block/fast-fail dead domains
        try {
            val apiKtCls = Class.forName("com.lagradost.cloudstream3.MainAPIKt")
            val getAppMethod = apiKtCls.getDeclaredMethod("getApp")
            getAppMethod.isAccessible = true
            val appInstance = getAppMethod.invoke(null)
            
            if (appInstance != null) {
                val requestsClass = Class.forName("com.lagradost.nicehttp.Requests")
                val clientField = requestsClass.getDeclaredField("okHttpClient")
                clientField.isAccessible = true
                val oldClient = clientField.get(appInstance) as? okhttp3.OkHttpClient
                if (oldClient != null) {
                    val patchedClient = oldClient.newBuilder()
                        .addInterceptor { chain ->
                            val request = chain.request()
                            val host = request.url.host
                            if (host.contains("123moviesfree9.cv") || 
                                host.equals("123moviesfree9.cv", ignoreCase = true) ||
                                host.endsWith(".123moviesfree9.cv", ignoreCase = true)) {
                                throw java.io.IOException("Blocked/Offline domain: $host")
                            }
                            chain.proceed(request)
                        }
                        .build()
                    clientField.set(appInstance, patchedClient)
                    Log.i(TAG, "Successfully patched NiceHttp OkHttpClient with domain-block interceptor")
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to patch NiceHttp OkHttpClient: ${e.message}", e)
        }
    }

    private fun resolveUrl(api: MainAPI, url: String): String {
        if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("{") || url.startsWith("[")) {
            return url
        }
        if (url.startsWith("/") || (url.contains("/") && !url.contains(":"))) {
            val baseUrl = api.mainUrl.removeSuffix("/")
            val relative = url.removePrefix("/")
            return "$baseUrl/$relative"
        }
        return url
    }

    companion object {
        private const val TAG = "CloudStreamPluginHost"
        private const val STAG = "ZunoPlugin"
        var instance: CloudStreamPluginHost? = null

        private val DOMAIN_PATCHES = mapOf(
            "Cinefreak" to "https://cinefreak.net",
            "Dudefilms" to "https://dudefilms.co",
            "Goojara" to "https://ww1.goojara.to",
            "Desicinemas" to "https://desicinemas.to",
        )
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

            val patchedNames = mutableListOf<String>()
            for (api in APIHolder.allProviders) {
                DOMAIN_PATCHES[api.name]?.let { newUrl ->
                    try {
                        val field = api.javaClass
                        var cls: Class<*>? = field
                        while (cls != null) {
                            try {
                                val mf = cls.getDeclaredField("mainUrl")
                                mf.isAccessible = true
                                mf.set(api, newUrl)
                                Log.i(TAG, "patched ${api.name} mainUrl -> $newUrl")
                                patchedNames.add(api.name)
                                break
                            } catch (_: NoSuchFieldException) {
                                cls = cls.superclass
                            }
                        }
                    } catch (e: Exception) {
                        Log.w(TAG, "failed to patch ${api.name} mainUrl: ${e.message}")
                    }
                }
            }
            if (patchedNames.isNotEmpty()) {
                Log.i(TAG, "domain patches applied: $patchedNames")
            }

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

    private fun hasSearchOverride(api: MainAPI): Boolean {
        return try {
            val method = api.javaClass.getMethod("search", String::class.java, kotlin.coroutines.Continuation::class.java)
            method.declaringClass != MainAPI::class.java
        } catch (_: Exception) {
            false
        }
    }

    fun getProvidersJson(): String {
        val arr = JSONArray()
        for (api in APIHolder.allProviders) {
            arr.put(JSONObject().apply {
                put("id", api.name)
                put("name", api.name)
                put("url", api.mainPage.firstOrNull()?.data ?: "")
                put("hasMainPage", true)
                put("hasSearch", hasSearchOverride(api))
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
        var error: String? = null
        val results = try { api.search(query) } catch (t: Throwable) {
            val msg = "${t.javaClass.simpleName}: ${t.message}"
            Log.e(TAG, "search ${api.name}: $msg")
            error = msg
            null
        } ?: emptyList()
        for (r in results) items.put(cardJson(r, api.name))
        return JSONObject().apply {
            put("items", items)
            if (error != null) put("error", error)
        }.toString()
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
        val api = apiByName(providerName) ?: return """{"error":"Provider '${providerName}' not found"}"""
        val resolvedUrl = resolveUrl(api, url)
        var error: String? = null
        val resp = try { api.load(resolvedUrl) } catch (t: Throwable) {
            val msg = "${t.javaClass.simpleName}: ${t.message}"
            Log.e(TAG, "load ${api.name}: $msg")
            error = msg
            null
        }
        if (resp == null) {
            return JSONObject().apply {
                put("error", error ?: "Failed to load detail")
                put("provider", providerName)
            }.toString()
        }
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

        val cast = JSONArray()
        resp.actors?.forEach { a ->
            cast.put(JSONObject().apply {
                put("name", a.actor?.name ?: "Unknown")
                put("image", a.actor?.image ?: JSONObject.NULL)
                put("role", a.roleString ?: a.role?.name ?: JSONObject.NULL)
            })
        }

        val recommendations = JSONArray()
        resp.recommendations?.forEach { rec -> recommendations.put(cardJson(rec, api.name)) }

        val trailers = JSONArray()
        (resp.trailers ?: emptyList()).forEach { t ->
            trailers.put(JSONObject().apply {
                put("url", t.extractorUrl)
                put("referer", t.referer ?: "")
                put("raw", t.raw)
            })
        }

        val scoreStr = try { resp.score?.toString() } catch (_: Exception) { null }

        val syncMap = resp.syncData
        val imdbId = syncMap["imdb_id"] ?: syncMap["imdbId"]
        val tmdbId = syncMap["tmdb_id"] ?: syncMap["tmdbId"]

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
            put("score", scoreStr ?: JSONObject.NULL)
            put("tags", JSONArray(resp.tags ?: emptyList<String>()))
            put("duration", resp.duration ?: JSONObject.NULL)
            put("comingSoon", resp.comingSoon)
            put("contentRating", resp.contentRating ?: JSONObject.NULL)
            put("imdbId", imdbId ?: JSONObject.NULL)
            put("tmdbId", tmdbId ?: JSONObject.NULL)
            put("cast", cast)
            put("recommendations", recommendations)
            put("trailers", trailers)
        }.toString()
    }

    suspend fun loadLinksJson(providerName: String, data: String): String {
        val api = apiByName(providerName) ?: run {
            Log.w(STAG, "[LINKS] Provider not found: $providerName")
            return """{"error":"Provider not found: $providerName"}"""
        }
        val resolvedData = resolveUrl(api, data)
        Log.i(STAG, "[LINKS] ${api.name} data='$data' resolvedData='$resolvedData'")
        val videoSources = JSONArray()
        val subs = JSONArray()
        var error: String? = null
        try {
            api.loadLinks(
                data = resolvedData,
                isCasting = false,
                subtitleCallback = { sf: SubtitleFile ->
                    if (sf.url.isNotEmpty()) {
                        val subObj = JSONObject().apply {
                            put("lang", sf.lang)
                            put("url", sf.url)
                            put("default", false)
                            put("provider", providerName)
                        }
                        subs.put(subObj)
                        Log.d(STAG, "[LINKS] ${api.name}: subtitle lang=${sf.lang} url=${sf.url}")
                        
                        try {
                            val subJson = subObj.toString()
                            val params = Arguments.createMap().apply {
                                putString("subtitleJson", subJson)
                            }
                            appContext
                                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                                .emit("onPlaybackSubtitleFound", params)
                        } catch (e: Exception) {
                            Log.e(STAG, "Error emitting subtitle: ${e.message}")
                        }
                    }
                },
                callback = { link: ExtractorLink ->
                    if (link.url.isNotEmpty()) {
                        val headers = JSONObject()
                        if (link.referer.isNotEmpty()) headers.put("Referer", link.referer)
                        val q = link.quality
                        val res = if (q in 144..4320) "${q}p" else null
                        val label = if (res != null) "${link.name} · $res" else link.name
                        
                        val sourceObj = JSONObject().apply {
                            put("quality", label)
                            put("url", link.url)
                            put("type", if (link.isM3u8) "hls" else "http")
                            put("host", link.name)
                            put("headers", headers)
                            put("provider", providerName)
                        }
                        videoSources.put(sourceObj)
                        Log.d(STAG, "[LINKS] ${api.name}: source name=${link.name} quality=$res url=${link.url.take(80)}")
                        
                        try {
                            val sourceJson = sourceObj.toString()
                            val params = Arguments.createMap().apply {
                                putString("sourceJson", sourceJson)
                            }
                            appContext
                                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                                .emit("onPlaybackSourceFound", params)
                        } catch (e: Exception) {
                            Log.e(STAG, "Error emitting source: ${e.message}")
                        }
                    }
                }
            )
        } catch (t: Throwable) {
            val msg = "${t.javaClass.simpleName}: ${t.message}"
            Log.e(STAG, "[LINKS] ❌ ${api.name} data='$data': $msg")
            error = msg
        }
        Log.i(STAG, "[LINKS] ${api.name}: ${videoSources.length()} sources, ${subs.length()} subtitles")
        return JSONObject().apply {
            put("videoUrl", if (videoSources.length() > 0) videoSources.getJSONObject(0).optString("url") else null)
            put("sources", videoSources)
            put("subtitles", subs)
            if (error != null) put("error", error)
        }.toString()
    }
}
