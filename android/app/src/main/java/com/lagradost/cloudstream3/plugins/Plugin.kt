package com.lagradost.cloudstream3.plugins

import android.content.Context
import com.anonymous.zunornandroid.cloudstream.CloudStreamPluginHost

open class Plugin : BasePlugin() {
    open fun load(context: Context) {}

    open fun setOpenSettings(callback: ((Context) -> Unit)?) {
        // Dummy implementation
    }

    override fun load() {
        super.load()
        val host = CloudStreamPluginHost.instance
        if (host != null) {
            val reactCtx = host.appContext as? com.facebook.react.bridge.ReactContext
            val activity = reactCtx?.currentActivity
            val ctx = activity ?: host.appContext
            load(ctx)
        }
    }
}
