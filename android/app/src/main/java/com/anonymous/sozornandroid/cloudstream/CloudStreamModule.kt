package com.anonymous.sozornandroid.cloudstream

import android.content.Intent
import android.util.Log
import com.facebook.react.bridge.*
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout

class CloudStreamModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val pluginHost = CloudStreamPluginHost(reactContext)

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
    fun playStream(url: String, headers: String, title: String, subtitleUrl: String = "") {
        try {
            val context = reactApplicationContext
            val intent = Intent(context, PlayerActivity::class.java).apply {
                putExtra("url", url)
                putExtra("headers", headers)
                putExtra("referer", "")
                putExtra("subtitleUrl", subtitleUrl)
                putExtra("title", title)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
        } catch (e: Exception) {
            Log.e("CloudStreamModule", "Error starting player", e)
        }
    }
}
