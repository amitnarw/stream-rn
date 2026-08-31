package com.lagradost.cloudstream3.utils

import android.content.Context
import android.content.SharedPreferences

object DataStore {

    fun getSharedPrefs(context: Context): SharedPreferences =
        context.getSharedPreferences("cloudstream_plugin_datastore", Context.MODE_PRIVATE)

    fun getDefaultSharedPrefs(context: Context): SharedPreferences =
        context.getSharedPreferences("cloudstream_plugin_datastore_default", Context.MODE_PRIVATE)

    fun getKeys(context: Context): SharedPreferences =
        getSharedPrefs(context)
}