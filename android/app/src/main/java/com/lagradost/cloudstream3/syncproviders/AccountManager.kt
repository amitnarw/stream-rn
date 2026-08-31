package com.lagradost.cloudstream3.syncproviders

import com.lagradost.cloudstream3.syncproviders.providers.AniListApi
import com.lagradost.cloudstream3.syncproviders.providers.SimklApi

class AccountManager {

    companion object {
        @JvmStatic
        fun getAniListApi(): AniListApi? = null

        @JvmStatic
        fun getSimklApi(): SimklApi? = null
    }
}