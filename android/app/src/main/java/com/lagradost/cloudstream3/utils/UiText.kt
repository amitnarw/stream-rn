package com.lagradost.cloudstream3.utils

import android.content.Context

sealed class UiText {

    abstract fun asString(context: Context?): String

    class DynamicString(@JvmField val value: String) : UiText() {
        override fun asString(context: Context?): String = value
    }

    class StringResource(@JvmField val resId: Int, @JvmField vararg val args: Any) : UiText() {
        override fun asString(context: Context?): String =
            args.joinToString(" ") { it.toString() }
    }
}