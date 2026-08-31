package com.lagradost.cloudstream3.syncproviders

import com.lagradost.cloudstream3.syncproviders.providers.AniListApi
import com.lagradost.cloudstream3.syncproviders.providers.SimklApi

open class SyncAPI {

    class LibraryMetadata(
        @JvmField val allLibraryLists: List<LibraryList> = emptyList()
    )

    class LibraryList(
        @JvmField val items: List<Any> = emptyList(),
        @JvmField val name: com.lagradost.cloudstream3.utils.UiText = com.lagradost.cloudstream3.utils.UiText.DynamicString("")
    )

    companion object {
        @JvmStatic
        fun empty(): LibraryMetadata = LibraryMetadata(emptyList())
    }
}