package com.lagradost.cloudstream3

import android.app.Application
import android.content.Context
import java.util.concurrent.ConcurrentHashMap

class CloudStreamApp : Application() {

    companion object {
        @JvmField
        var context: Context? = null

        @JvmStatic
        fun getContext(): Context? = context

        @JvmStatic
        fun setKey(key: String, value: Any?) {
            if (key.isEmpty()) return
            if (value == null) {
                storage.remove(key)
            } else {
                storage[key] = value
            }
        }

        @JvmStatic
        @Suppress("UNCHECKED_CAST")
        fun <T> getKey(key: String, default: T): T {
            if (key.isEmpty()) return default
            val stored = storage[key] ?: return default
            return try {
                stored as T
            } catch (_: ClassCastException) {
                default
            }
        }

        private val storage = ConcurrentHashMap<String, Any>()
    }
}