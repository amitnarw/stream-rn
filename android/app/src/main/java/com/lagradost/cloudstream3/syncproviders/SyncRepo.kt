package com.lagradost.cloudstream3.syncproviders

open class SyncRepo(
    private val api: Any? = null
) {
    open val name: String = ""
    open val mainUrl: String = ""
    open val icon: Int? = null

    open fun authUser(): String? = null
    open fun login(data: Any?): Boolean = false
    open fun logOut() {}
    open fun handleRedirect(request: Any?): Boolean = false
    open fun getPersonalRepo(): String? = null
}
