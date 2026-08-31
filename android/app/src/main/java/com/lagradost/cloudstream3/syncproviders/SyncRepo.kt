package com.lagradost.cloudstream3.syncproviders

open class SyncRepo(private val api: SyncAPI?) {

    open val name: String = ""

    open fun authUser(): AuthUser? = null

    open suspend fun library(): SyncAPI.LibraryMetadata = SyncAPI.LibraryMetadata(emptyList())
}