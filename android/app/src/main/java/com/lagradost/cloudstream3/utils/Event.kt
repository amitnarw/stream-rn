package com.lagradost.cloudstream3.utils

import kotlin.jvm.functions.Function1

open class Event<T> {

    open var empty: Boolean = true

    private val handlers = mutableListOf<Function1<T, Unit>>()

    open operator fun invoke(value: T) {
        for (h in handlers) {
            try {
                h.invoke(value)
            } catch (_: Throwable) {
            }
        }
    }

    open operator fun plusAssign(handler: Function1<T, Unit>) {
        handlers.add(handler)
        empty = false
    }

    companion object {
        val Empty: Event<Any?> = object : Event<Any?>() {}
    }
}