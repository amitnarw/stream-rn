package com.lagradost.cloudstream3

class MainActivity {

    companion object {
        fun getReloadHomeEvent(): com.lagradost.cloudstream3.utils.Event<Any?> =
            com.lagradost.cloudstream3.utils.Event.Empty

        fun getAfterPluginsLoadedEvent(): com.lagradost.cloudstream3.utils.Event<Any?> =
            com.lagradost.cloudstream3.utils.Event.Empty

        fun getBookmarksUpdatedEvent(): com.lagradost.cloudstream3.utils.Event<Any?> =
            com.lagradost.cloudstream3.utils.Event.Empty

        fun getResumeWatchingFragmentEvent(): com.lagradost.cloudstream3.utils.Event<Any?> =
            com.lagradost.cloudstream3.utils.Event.Empty

        fun getKeys(): Array<String> = emptyArray()
    }
}