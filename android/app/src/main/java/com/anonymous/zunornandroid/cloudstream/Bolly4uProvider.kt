@file:Suppress("DEPRECATION")
package com.anonymous.zunornandroid.cloudstream

import com.lagradost.cloudstream3.*
import com.lagradost.cloudstream3.utils.ExtractorLink
import com.lagradost.cloudstream3.utils.Qualities
import org.jsoup.Jsoup
import java.net.URLEncoder

class Bolly4uProvider : MainAPI() {
    override var mainUrl = "https://bolly4u.ski"
    override var name = "Bolly4u"
    override var supportedTypes = setOf(TvType.Movie, TvType.TvSeries)
    override var hasMainPage = true

    override val mainPage = mainPageOf(
        "$mainUrl/page/" to "Latest Movies",
        "$mainUrl/category/bollywood-720p/page/" to "Bollywood",
        "$mainUrl/category/punjabi-movies/page/" to "Punjabi",
        "$mainUrl/category/south-hindi-dubbed-720p/page/" to "South Hindi Dubbed",
        "$mainUrl/category/web-series/page/" to "Web Series"
    )

    private fun parsePostElements(doc: org.jsoup.nodes.Document): List<SearchResponse> {
        val elements = doc.select("div.inline-flex, a.cursor-pointer, div.group, article, .post")
        return elements.mapNotNull { element ->
            val linkElem = if (element.tagName() == "a") element else element.selectFirst("a") ?: return@mapNotNull null
            val href = linkElem.attr("href")
            if (href.isBlank() || href == "/" || href.contains("/category/") || href.contains("/page/")) return@mapNotNull null

            val img = element.selectFirst("img")
            val altText = img?.attr("alt")?.trim()
            val textDiv = element.selectFirst("div.shadow-inner, div.mt-2, h2, h3")?.text()?.trim()

            val rawTitle = when {
                !altText.isNullOrBlank() -> altText
                !textDiv.isNullOrBlank() -> textDiv
                else -> linkElem.text().trim()
            }
            if (rawTitle.isBlank()) return@mapNotNull null

            // Clean title: remove "Full Movie Download 1080p | 720p | 480p", etc.
            val title = rawTitle.replace(Regex("(?i)\\s*(WEB-DL|HDTC|ORG|UNCUT|Full Movie Download|1080p|720p|480p|Hindi|Dual Audio).*$"), "").trim().ifEmpty { rawTitle }
            val poster = img?.attr("src")?.takeIf { it.isNotBlank() } ?: img?.attr("data-src")

            newMovieSearchResponse(title, href, TvType.Movie) {
                this.posterUrl = poster
            }
        }.distinctBy { it.url }
    }

    override suspend fun getMainPage(page: Int, request: MainPageRequest): HomePageResponse? {
        val url = "${request.data}$page/"
        val doc = Jsoup.connect(url)
            .userAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
            .timeout(15000)
            .get()

        val home = parsePostElements(doc)
        return newHomePageResponse(request.name, home)
    }

    override suspend fun search(query: String): List<SearchResponse> {
        val encoded = URLEncoder.encode(query, "UTF-8")
        val url = "$mainUrl/?q=$encoded"
        val doc = Jsoup.connect(url)
            .userAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
            .timeout(15000)
            .get()

        val results = parsePostElements(doc).toMutableList()
        if (results.isEmpty()) {
            // Fallback search with ?s=
            try {
                val docS = Jsoup.connect("$mainUrl/?s=$encoded")
                    .userAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
                    .timeout(15000)
                    .get()
                results.addAll(parsePostElements(docS))
            } catch (_: Exception) {}
        }
        return results.distinctBy { it.url }
    }

    override suspend fun load(url: String): LoadResponse? {
        val doc = Jsoup.connect(url)
            .userAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
            .timeout(15000)
            .get()

        val title = doc.selectFirst("h1.entry-title, h1")?.text()?.trim() ?: "Bolly4u Movie"
        val img = doc.selectFirst("div.entry-content img, article img")
        val poster = img?.attr("src")?.takeIf { it.isNotBlank() } ?: img?.attr("data-src")
        val plot = doc.selectFirst("div.entry-content p")?.text()

        return newMovieLoadResponse(title, url, TvType.Movie, url) {
            this.posterUrl = poster
            this.plot = plot
        }
    }

    private fun createExtractorLink(
        source: String,
        name: String,
        url: String,
        referer: String,
        quality: Int,
        isM3u8: Boolean = false
    ): ExtractorLink {
        val ctors = ExtractorLink::class.java.constructors
        for (ctor in ctors) {
            val params = ctor.parameterTypes
            if (params.size >= 5) {
                try {
                    val args = arrayOfNulls<Any>(params.size)
                    args[0] = source
                    args[1] = name
                    args[2] = url
                    args[3] = referer
                    args[4] = quality
                    for (i in 5 until params.size) {
                        val p = params[i]
                        if (p == Boolean::class.javaPrimitiveType || p == java.lang.Boolean::class.java) {
                            args[i] = isM3u8
                        } else if (p.isAssignableFrom(Map::class.java)) {
                            args[i] = emptyMap<String, String>()
                        } else if (p.name.contains("ExtractorLinkType")) {
                            args[i] = p.enumConstants?.firstOrNull()
                        }
                    }
                    return ctor.newInstance(*args) as ExtractorLink
                } catch (_: Exception) {}
            }
        }
        throw IllegalStateException("Cannot instantiate ExtractorLink")
    }

    override suspend fun loadLinks(
        data: String,
        isCdn: Boolean,
        subtitleCallback: (SubtitleFile) -> Unit,
        callback: (ExtractorLink) -> Unit
    ): Boolean {
        val doc = Jsoup.connect(data)
            .userAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
            .timeout(15000)
            .get()

        val links = doc.select("a[href*=torrentsave], a[href*=photojin], a[href*=movcloud], a[href*=linkskeep], a:contains(DIRECT), a:contains(Download)")
        for (link in links) {
            val href = link.attr("href")
            val linkText = link.text().ifBlank { "Bolly4u Link" }
            if (href.isBlank()) continue

            if (href.contains("torrentsave") || href.contains("magnet:") || href.endsWith(".torrent")) {
                var magUrl = href
                if (href.contains("torrentsave")) {
                    try {
                        val tDoc = Jsoup.connect(href)
                            .userAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
                            .timeout(10000)
                            .get()
                        val magnetLink = tDoc.selectFirst("a[href^=magnet:]")?.attr("href")
                        if (!magnetLink.isNullOrBlank()) {
                            magUrl = magnetLink
                        }
                    } catch (_: Exception) {}
                }
                callback(
                    createExtractorLink(
                        source = linkText,
                        name = "Bolly4u Magnet",
                        url = magUrl,
                        referer = mainUrl,
                        quality = Qualities.Unknown.value,
                        isM3u8 = false
                    )
                )
            } else {
                callback(
                    createExtractorLink(
                        source = linkText,
                        name = "Bolly4u Direct",
                        url = href,
                        referer = mainUrl,
                        quality = Qualities.Unknown.value,
                        isM3u8 = false
                    )
                )
            }
        }
        return true
    }
}
