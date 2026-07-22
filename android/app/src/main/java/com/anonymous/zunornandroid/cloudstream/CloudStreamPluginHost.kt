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

        // Silence all plugin System.out/err console logs
        try {
            val dummy = java.io.PrintStream(object : java.io.OutputStream() {
                override fun write(b: Int) {}
                override fun write(b: ByteArray, off: Int, len: Int) {}
            })
            System.setOut(dummy)
            System.setErr(dummy)
        } catch (_: Exception) {}

        // Global OkHttpClient Interceptor Patch to block/fast-fail dead domains
        try {
            val niceHttpRequestsCls = Class.forName("com.lagradost.nicehttp.Requests")
            val clientField = niceHttpRequestsCls.getDeclaredField("baseClient")
            clientField.isAccessible = true
            
            val searchClasses = listOf(
                "com.lagradost.cloudstream3.MainAPIKt",
                "com.lagradost.cloudstream3.MainAPI",
                "com.lagradost.cloudstream3.MainActivityKt",
                "com.lagradost.cloudstream3.MainActivity",
                "com.lagradost.cloudstream3.appKt",
                "com.lagradost.cloudstream3.AppKt",
                "com.lagradost.cloudstream3.utils.AppUtilsKt",
                "com.lagradost.cloudstream3.utils.AppUtils",
                "com.lagradost.cloudstream3.mvvm.ArchComponentExtKt"
            )
            
            var appInstance: Any? = null
            var foundClass: String? = null
            var isField = false
            var foundMemberName: String? = null
            
            for (className in searchClasses) {
                try {
                    val cls = Class.forName(className)
                    // Search fields
                    for (field in cls.getDeclaredFields()) {
                        if (niceHttpRequestsCls.isAssignableFrom(field.type)) {
                            field.isAccessible = true
                            val value = field.get(null)
                            if (value != null) {
                                appInstance = value
                                foundClass = className
                                isField = true
                                foundMemberName = field.name
                                break
                            }
                        }
                    }
                    if (appInstance != null) break
                    
                    // Search methods
                    for (method in cls.getDeclaredMethods()) {
                        if (niceHttpRequestsCls.isAssignableFrom(method.returnType) && method.parameterTypes.isEmpty()) {
                            method.isAccessible = true
                            val value = method.invoke(null)
                            if (value != null) {
                                appInstance = value
                                foundClass = className
                                isField = false
                                foundMemberName = method.name
                                break
                            }
                        }
                    }
                    if (appInstance != null) break
                } catch (_: Exception) {}
            }
            
            if (appInstance != null) {
                Log.i(TAG, "Found NiceHttp Requests instance in $foundClass via ${if (isField) "field" else "method"} $foundMemberName: $appInstance")
                val oldClient = clientField.get(appInstance) as? okhttp3.OkHttpClient
                if (oldClient != null) {
                    val trustAllCerts = arrayOf<javax.net.ssl.TrustManager>(
                        object : javax.net.ssl.X509TrustManager {
                            override fun checkClientTrusted(chain: Array<java.security.cert.X509Certificate>, authType: String) {}
                            override fun checkServerTrusted(chain: Array<java.security.cert.X509Certificate>, authType: String) {}
                            override fun getAcceptedIssuers(): Array<java.security.cert.X509Certificate> = arrayOf()
                        }
                    )
                    val sslContext = javax.net.ssl.SSLContext.getInstance("SSL")
                    sslContext.init(null, trustAllCerts, java.security.SecureRandom())
                    val sslSocketFactory = sslContext.socketFactory

                    val patchedClient = oldClient.newBuilder()
                        .connectTimeout(10, java.util.concurrent.TimeUnit.SECONDS)
                        .readTimeout(10, java.util.concurrent.TimeUnit.SECONDS)
                        .writeTimeout(10, java.util.concurrent.TimeUnit.SECONDS)
                        .sslSocketFactory(sslSocketFactory, trustAllCerts[0] as javax.net.ssl.X509TrustManager)
                        .hostnameVerifier { _, _ -> true }
                        .addInterceptor { chain ->
                            val request = chain.request()
                            val urlString = request.url.toString()
                            
                            // 1. Redirection for dead/404 GitHub playlists
                            val targetRequest = when {
                                urlString.contains("streamed-su-sports") -> {
                                    Log.i("ZunoPlugin", "Redirecting streamed-su-sports request to public sports.m3u")
                                    request.newBuilder().url("https://iptv-org.github.io/iptv/categories/sports.m3u").build()
                                }
                                urlString.contains("iptv-jp") -> {
                                    Log.i("ZunoPlugin", "Redirecting iptv-jp request to public jp.m3u")
                                    request.newBuilder().url("https://iptv-org.github.io/iptv/countries/jp.m3u").build()
                                }
                                urlString.contains("PiratesTvPlus") -> {
                                    Log.i("ZunoPlugin", "Redirecting PiratesTvPlus request to public movies.m3u")
                                    request.newBuilder().url("https://iptv-org.github.io/iptv/categories/movies.m3u").build()
                                }
                                else -> request
                            }
                            
                            val response = chain.proceed(targetRequest)
                            
                            // 2. Response body modifications
                            val targetUrl = targetRequest.url.toString()
                            if (response.isSuccessful) {
                                when {
                                    targetUrl.contains("fancode.json") -> {
                                        val body = response.body
                                        if (body != null) {
                                            val content = body.string()
                                            val updatedContent = content.replace("\"team\":", "\"teams\":")
                                            Log.i("ZunoPlugin", "Patched fancode.json: replaced 'team' with 'teams'")
                                            val newBody = okhttp3.ResponseBody.create(body.contentType(), updatedContent)
                                            return@addInterceptor response.newBuilder().body(newBody).build()
                                        }
                                    }
                                    targetUrl.contains("Sony%20IPTV%20Live.m3u") || targetUrl.contains("Sony IPTV Live.m3u") -> {
                                        val body = response.body
                                        if (body != null) {
                                            val content = body.string()
                                            val index = content.indexOf("#EXTM3U")
                                            if (index != -1) {
                                                val remaining = content.substring(index)
                                                val cleanLines = remaining.split("\n").map { it.trim() }.filter { line ->
                                                    line.isNotEmpty() && (line.startsWith("#") || line.startsWith("http://") || line.startsWith("https://") || line.startsWith("rtmp://") || line.startsWith("rtsp://"))
                                                }
                                                val updatedContent = cleanLines.joinToString("\n")
                                                Log.i("ZunoPlugin", "Cleaned up Sony IPTV playlist: kept ${cleanLines.size} valid lines")
                                                val newBody = okhttp3.ResponseBody.create(body.contentType(), updatedContent)
                                                return@addInterceptor response.newBuilder().body(newBody).build()
                                            }
                                        }
                                    }
                                }
                            }
                            response
                        }
                        .dns(object : okhttp3.Dns {
                            private val dohClient = okhttp3.OkHttpClient.Builder()
                                .connectTimeout(2, java.util.concurrent.TimeUnit.SECONDS)
                                .readTimeout(2, java.util.concurrent.TimeUnit.SECONDS)
                                .build()

                            private fun resolveViaDoH(hostname: String): List<java.net.InetAddress>? {
                                val dohUrls = listOf(
                                    "https://dns.google/resolve?name=${hostname}&type=A",
                                    "https://1.1.1.1/dns-query?name=${hostname}&type=A"
                                )
                                for (apiUrl in dohUrls) {
                                    try {
                                        val request = okhttp3.Request.Builder()
                                            .url(apiUrl)
                                            .header("Accept", "application/dns-json")
                                            .build()
                                        val response = dohClient.newCall(request).execute()
                                        if (!response.isSuccessful) continue
                                        val body = response.body?.string() ?: continue
                                        val json = org.json.JSONObject(body)
                                        val answers = json.optJSONArray("Answer") ?: continue
                                        val addresses = mutableListOf<java.net.InetAddress>()
                                        for (i in 0 until answers.length()) {
                                            val answer = answers.getJSONObject(i)
                                            val type = answer.optInt("type", 0)
                                            val data = answer.optString("data", "")
                                            if ((type == 1 || type == 28) && data.isNotBlank()) {
                                                try {
                                                    addresses.add(java.net.InetAddress.getByName(data))
                                                } catch (_: Exception) {}
                                            }
                                        }
                                        if (addresses.isNotEmpty()) return addresses
                                    } catch (e: Exception) {
                                        Log.w(TAG, "DoH lookup failed for $hostname via $apiUrl: ${e.message}")
                                    }
                                }
                                return null
                            }

                            override fun lookup(hostname: String): List<java.net.InetAddress> {
                                if (hostname == "localhost" || hostname == "127.0.0.1" || hostname.endsWith(".local")) {
                                    return okhttp3.Dns.SYSTEM.lookup(hostname)
                                }
                                try {
                                    val sysResult = okhttp3.Dns.SYSTEM.lookup(hostname)
                                    if (sysResult.isNotEmpty()) {
                                        return sysResult
                                    }
                                } catch (_: Exception) {}

                                resolveViaDoH(hostname)?.let { return it }
                                return okhttp3.Dns.SYSTEM.lookup(hostname)
                            }
                        })
                        .build()
                    clientField.set(appInstance, patchedClient)
                    Log.i(TAG, "Successfully patched NiceHttp OkHttpClient with domain-block interceptor")
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to patch NiceHttp OkHttpClient: ${e.message}", e)
            try {
                val requestsClass = Class.forName("com.lagradost.nicehttp.Requests")
                Log.i("ZunoReflection", "Requests class fields:")
                for (field in requestsClass.declaredFields) {
                    Log.i("ZunoReflection", " - ${field.name} (${field.type.name})")
                }
                Log.i("ZunoReflection", "Requests class methods:")
                for (method in requestsClass.declaredMethods) {
                    Log.i("ZunoReflection", " - ${method.name} -> ${method.returnType.name}")
                }
            } catch (t: Throwable) {
                Log.e("ZunoReflection", "Failed to print Requests class info: ${t.message}")
            }
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
            "Tamilblasters" to "https://www.1tamilblasters.pro",
            "VegaMovies" to "https://vegamoviez.nl",
            "Vegamovies" to "https://vegamoviez.nl"
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

            // Patch registered extractor domains at runtime (e.g. VidSrcMe, VsEmbed)
            try {
                val extClass = Class.forName("com.lagradost.cloudstream3.utils.ExtractorApiKt")
                val getXsMethod = extClass.getMethod("getXs")
                val extractorsList = getXsMethod.invoke(null) as? List<*>
                if (extractorsList != null) {
                    for (extractor in extractorsList) {
                        if (extractor == null) continue
                        val name = extractor.javaClass.simpleName
                        val fullName = extractor.javaClass.name
                        var targetUrl = ""
                        var shouldPatch = false

                        if (name.contains("VidSrcMe", ignoreCase = true) || fullName.contains("VidSrcMe", ignoreCase = true)) {
                            targetUrl = "https://vidsrcme.su"
                            shouldPatch = true
                        } else if (name.contains("VsEmbed", ignoreCase = true) || fullName.contains("VsEmbed", ignoreCase = true)) {
                            targetUrl = "https://vsembed.su"
                            shouldPatch = true
                        }

                        if (shouldPatch && targetUrl.isNotEmpty()) {
                            var cls: Class<*>? = extractor.javaClass
                            while (cls != null) {
                                try {
                                    val mf = cls.getDeclaredField("mainUrl")
                                    mf.isAccessible = true
                                    mf.set(extractor, targetUrl)
                                    Log.i(TAG, "Successfully patched Extractor ${extractor.javaClass.name} mainUrl -> $targetUrl")
                                    break
                                } catch (_: NoSuchFieldException) {
                                    cls = cls.superclass
                                }
                            }
                        }
                    }
                }
            } catch (e: Exception) {
                Log.w(TAG, "Failed to patch extractors mainUrl: ${e.message}")
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
        val clean = name.replace(" ", "").replace("-", "").replace("_", "").lowercase()
        return APIHolder.allProviders.firstOrNull { p ->
            p.name.equals(name, ignoreCase = true) ||
            p.name.replace(" ", "").replace("-", "").replace("_", "").lowercase() == clean
        }
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
                put("types", JSONArray(api.supportedTypes.map { it.name }))
            })
        }
        return arr.toString()
    }

    suspend fun getMainPageJson(providerName: String, page: Int): String {
        Log.i("ZunoPlugin", "getMainPageJson called for $providerName page $page")
        val api = apiByName(providerName) ?: run {
            Log.e("ZunoPlugin", "getMainPageJson failed: provider $providerName not found")
            return JSONObject(mapOf("sections" to JSONArray(), "provider" to providerName)).toString()
        }
        val sections = JSONArray()
        for (mp in api.mainPage) {
            try {
                Log.i("ZunoPlugin", "getMainPageJson calling api.getMainPage for ${mp.name}")
                val resp = api.getMainPage(page, MainPageRequest(mp.name, mp.data, false))
                if (resp == null) {
                    Log.i("ZunoPlugin", "getMainPageJson: api.getMainPage returned null")
                    continue
                }
                Log.i("ZunoPlugin", "getMainPageJson: api.getMainPage returned ${resp.items.size} sections")
                for (list in resp.items) {
                    val items = JSONArray()
                    for (sr in list.list) items.put(cardJson(sr, api.name))
                    Log.i("ZunoPlugin", "  - Section ${list.name}: ${items.length()} items")
                    if (items.length() == 0) continue
                    sections.put(JSONObject().apply {
                        put("name", list.name)
                        put("items", items)
                    })
                }
            } catch (t: Throwable) {
                Log.e("ZunoPlugin", "getMainPageJson failed for ${api.name} '${mp.name}': ${t.javaClass.simpleName}: ${t.message}", t)
            }
        }
        val result = JSONObject().apply {
            put("provider", api.name)
            put("sections", sections)
        }.toString()
        Log.i("ZunoPlugin", "getMainPageJson returning: $result")
        return result
    }

    suspend fun searchJson(providerName: String, query: String): String {
        Log.i(TAG, "[searchJson] START provider='$providerName', query='$query'")
        val api = apiByName(providerName) ?: run {
            val available = APIHolder.allProviders.map { it.name }
            Log.e(TAG, "[searchJson] FAILED: provider '$providerName' not found among registered providers: $available")
            return JSONObject().apply {
                put("items", JSONArray())
                put("error", "Provider '$providerName' not found")
            }.toString()
        }
        val items = JSONArray()
        var error: String? = null
        val results = try {
            Log.i(TAG, "[searchJson] Calling ${api.name}.search('$query')...")
            val res = api.search(query)
            Log.i(TAG, "[searchJson] ${api.name}.search returned ${res?.size ?: 0} items")
            res
        } catch (t: Throwable) {
            val msg = "${t.javaClass.simpleName}: ${t.message}"
            Log.e(TAG, "[searchJson] EXCEPTION ${api.name}.search: $msg", t)
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
        Log.i("ZunoPlugin", "loadLinksJson called for $providerName with data: $data")
        val api = apiByName(providerName) ?: run {
            Log.e("ZunoPlugin", "loadLinksJson failed: Provider not found: $providerName")
            return """{"error":"Provider not found: $providerName"}"""
        }
        val resolvedData = resolveUrl(api, data)
        Log.i("ZunoPlugin", "loadLinksJson resolvedData: $resolvedData")
        val videoSources = JSONArray()
        val subs = JSONArray()
        var error: String? = null
        try {
            api.loadLinks(
                data = resolvedData,
                isCasting = false,
                subtitleCallback = { sf: SubtitleFile ->
                    if (sf.url.isNotEmpty()) {
                        Log.i("ZunoPlugin", "loadLinksJson subtitle found: lang=${sf.lang}, url=${sf.url}")
                        val subObj = JSONObject().apply {
                            put("lang", sf.lang)
                            put("url", sf.url)
                            put("default", false)
                            put("provider", providerName)
                        }
                        subs.put(subObj)
                        
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
                        Log.i("ZunoPlugin", "loadLinksJson source found: name=${link.name}, url=${link.url}, referer=${link.referer}")
                        val headers = JSONObject()
                        if (link.referer.isNotEmpty()) headers.put("Referer", link.referer)
                        try {
                            for ((k, v) in link.headers) {
                                headers.put(k, v)
                            }
                        } catch (_: Exception) {}
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
            Log.e("ZunoPlugin", "loadLinksJson failed for $providerName: ${t.javaClass.name}: ${t.message}", t)
            val msg = "${t.javaClass.simpleName}: ${t.message}"
            error = msg
        }
        val resultJson = JSONObject().apply {
            put("videoUrl", if (videoSources.length() > 0) videoSources.getJSONObject(0).optString("url") else null)
            put("sources", videoSources)
            put("subtitles", subs)
            if (error != null) put("error", error)
        }.toString()
        Log.i("ZunoPlugin", "loadLinksJson returning: $resultJson")
        return resultJson
    }
}
