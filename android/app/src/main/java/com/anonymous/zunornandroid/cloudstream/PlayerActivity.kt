package com.anonymous.zunornandroid.cloudstream

import com.anonymous.zunornandroid.R
import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.app.PendingIntent
import android.app.Dialog
import android.content.Intent
import android.content.pm.ActivityInfo
import androidx.activity.OnBackPressedCallback
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.media.AudioManager
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.net.Uri
import android.util.Log
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.GestureDetector
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.animation.AccelerateDecelerateInterpolator
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.SeekBar
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.trackselection.DefaultTrackSelector
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.abs
import kotlin.math.roundToInt

@UnstableApi
class PlayerActivity : AppCompatActivity() {

    private var player: ExoPlayer? = null
    private lateinit var playerView: PlayerView
    private lateinit var loadingGroup: View
    private lateinit var bufferingView: View
    private lateinit var topBar: View
    private lateinit var bottomBar: View
    private lateinit var centerControls: View
    private lateinit var titleTv: TextView
    private lateinit var playPauseCenter: ImageView
    private lateinit var skipBackBtn: ImageView
    private lateinit var skipForwardBtn: ImageView
    private lateinit var seekBar: SeekBar
    private lateinit var currentTimeTv: TextView
    private lateinit var endTimeTv: TextView
    private lateinit var sourcesBtn: View
    private lateinit var subtitleBtn: View
    private lateinit var prevEpBtn: ImageView
    private lateinit var nextEpBtn: ImageView
    private lateinit var sleepTimerBtn: ImageView
    private lateinit var errorOverlay: FrameLayout
    private lateinit var errorMessageTv: TextView
    private lateinit var errorRetryBtn: TextView
    private lateinit var errorBackBtn: TextView

    private lateinit var brightnessSliderLayout: LinearLayout
    private lateinit var volumeSliderLayout: LinearLayout
    private lateinit var brightnessSeekBar: SeekBar
    private lateinit var volumeSeekBar: SeekBar

    private lateinit var logoContainer: FrameLayout
    private lateinit var episodeSubtitleTv: TextView
    private var clipDrawable: android.graphics.drawable.ClipDrawable? = null
    private var logoBitmap: android.graphics.Bitmap? = null
    private var shimmerAnimator: android.animation.ObjectAnimator? = null
    private var logoUrl: String = ""
    private var currentProgressPercentage = 0

    private var mediaSession: MediaSession? = null
    private var audioManager: AudioManager? = null
    private var isControlsVisible = true
    private var isSeeking = false
    private var isBuffering = false
    private var isMuted = false
    private var lastVolumeLevel = 1.0f
    private val hideHandler = Handler(Looper.getMainLooper())
    private val HIDE_DELAY = 4000L
    private var lastBrightness = -1f

    private var allSources: JSONArray? = null
    private var allSubtitles: JSONArray? = null
    private var currentSourceIndex = 0
    private var currentSubtitleIndex = -1
    private var currentUrl = ""
    private var currentHeadersJson = "{}"

    private var episodesArray: JSONArray? = null
    private var currentEpisodeIndex = -1
    private var providerName: String? = null

    private var sleepTimerEnd = -1L
    private var sleepTimerEndOfEpisode = false
    private val sleepHandler = Handler(Looper.getMainLooper())
    private val sleepRunnable = Runnable { finish() }

    private var isErrorShowing = false

    private lateinit var root: FrameLayout

    private val fadeDuration = 300L

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        supportRequestWindowFeature(android.view.Window.FEATURE_NO_TITLE)
        requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_USER_LANDSCAPE

        // Keep screen on during playback
        window.addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        audioManager = getSystemService(AUDIO_SERVICE) as AudioManager
        lastBrightness = window.attributes.screenBrightness

        setupMediaSession()

        providerName = intent.getStringExtra("providerName")
        val mediaRef = intent.getStringExtra("data")
        val url = intent.getStringExtra("url")
        val headersJson = intent.getStringExtra("headers") ?: "{}"
        val videoTitle = intent.getStringExtra("title") ?: ""
        val subtitleUrl = intent.getStringExtra("subtitleUrl") ?: ""
        val sourcesJsonStr = intent.getStringExtra("sourcesJson") ?: ""
        val subtitlesJsonStr = intent.getStringExtra("subtitlesJson") ?: ""
        val episodesJsonStr = intent.getStringExtra("episodesJson") ?: ""
        currentEpisodeIndex = intent.getIntExtra("currentEpisodeIndex", -1)
        logoUrl = intent.getStringExtra("logoUrl") ?: ""
        val posterUrl = intent.getStringExtra("posterUrl") ?: ""

        allSources = try { JSONArray(sourcesJsonStr) } catch (_: Exception) { null }
        allSubtitles = try { JSONArray(subtitlesJsonStr) } catch (_: Exception) { null }
        episodesArray = try { JSONArray(episodesJsonStr) } catch (_: Exception) { null }

        currentUrl = url ?: ""
        currentHeadersJson = headersJson
        if (subtitleUrl.isNotEmpty()) currentSubtitleIndex = 0

        root = FrameLayout(this)

        playerView = PlayerView(this).apply {
            setBackgroundColor(Color.BLACK)
            useController = false
            resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT
        }
        root.addView(playerView, matchParent())

        loadingGroup = createLoadingOverlay()
        root.addView(loadingGroup, matchParent())

        bufferingView = createBufferingOverlay()
        root.addView(bufferingView, matchParent())
        bufferingView.visibility = View.GONE

        centerControls = createCenterControls()
        root.addView(centerControls, matchParent())

        topBar = createTopBar(videoTitle)
        root.addView(topBar, matchParent())

        bottomBar = createBottomBar()
        root.addView(bottomBar, matchParent())

        errorOverlay = createErrorOverlay()
        root.addView(errorOverlay, matchParent())
        errorOverlay.visibility = View.GONE

        createSideSliders()

        setContentView(root)
        window.decorView.post { immersiveMode() }

        val gestureDetector = GestureDetector(this, PlayerGestureListener())
        root.setOnTouchListener { v, event ->
            gestureDetector.onTouchEvent(event)
            if (event.action == MotionEvent.ACTION_UP) {
                v.performClick()
            }
            true
        }

        if (logoUrl.isNotEmpty() || posterUrl.isNotEmpty()) {
            CoroutineScope(Dispatchers.IO).launch {
                var bitmap: android.graphics.Bitmap? = null
                if (logoUrl.isNotEmpty() && !logoUrl.endsWith(".svg")) {
                    try {
                        val urlConnection = java.net.URL(logoUrl).openConnection()
                        urlConnection.connect()
                        val input = urlConnection.getInputStream()
                        bitmap = android.graphics.BitmapFactory.decodeStream(input)
                    } catch (e: Exception) {
                        Log.e("PlayerActivity", "Failed to load logo image: ${e.message}")
                    }
                }
                if (bitmap == null && posterUrl.isNotEmpty()) {
                    try {
                        val urlConnection = java.net.URL(posterUrl).openConnection()
                        urlConnection.connect()
                        val input = urlConnection.getInputStream()
                        bitmap = android.graphics.BitmapFactory.decodeStream(input)
                    } catch (e: Exception) {
                        Log.e("PlayerActivity", "Failed to load fallback poster: ${e.message}")
                    }
                }
                bitmap?.let { b ->
                    withContext(Dispatchers.Main) {
                        setupLogoOverlay(b)
                    }
                }
            }
        }

        if (providerName != null && mediaRef != null) {
            resolveAndPlay(providerName!!, mediaRef)
        } else if (currentUrl.isNotEmpty()) {
            loadingGroup.visibility = View.VISIBLE
            updateLoadingProgress(10)
            showControlsAfterLoad()
            setupExoPlayer(currentUrl, currentHeadersJson, getCurrentSubtitleUrl())
        }

        updateEpisodeButtonState()

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                finish()
            }
        })
    }

    private fun setupMediaSession() {
        mediaSession = MediaSession(this, "SozoPlayer")
        mediaSession?.setCallback(object : MediaSession.Callback() {
            override fun onPlay() { player?.play() }
            override fun onPause() { player?.pause() }
            override fun onSkipToPrevious() { playPreviousEpisode() }
            override fun onSkipToNext() { playNextEpisode() }
            override fun onStop() { finish() }
        })
        mediaSession?.isActive = true

        val sessionIntent = packageManager?.getLaunchIntentForPackage(packageName)
        val pi = PendingIntent.getActivity(this, 0, sessionIntent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        mediaSession?.setSessionActivity(pi)
    }

    private fun updateMediaSession(title: String) {
        mediaSession?.let { ms ->
            val state = if (player?.isPlaying == true) PlaybackState.STATE_PLAYING else PlaybackState.STATE_PAUSED
            ms.setPlaybackState(
                PlaybackState.Builder()
                    .setState(state, player?.currentPosition ?: 0L, 1f)
                    .setActions(
                        PlaybackState.ACTION_PLAY or
                        PlaybackState.ACTION_PAUSE or
                        PlaybackState.ACTION_SKIP_TO_PREVIOUS or
                        PlaybackState.ACTION_SKIP_TO_NEXT or
                        PlaybackState.ACTION_STOP
                    )
                    .build()
            )
            ms.setMetadata(
                android.media.MediaMetadata.Builder()
                    .putString(android.media.MediaMetadata.METADATA_KEY_TITLE, title)
                    .putString(android.media.MediaMetadata.METADATA_KEY_DISPLAY_TITLE, title)
                    .build()
            )
        }
    }

    override fun onDestroy() {
        mediaSession?.isActive = false
        mediaSession?.release()
        mediaSession = null
        sleepHandler.removeCallbacks(sleepRunnable)
        shimmerAnimator?.cancel()
        shimmerAnimator = null
        window.clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        super.onDestroy()
    }

    private fun getCurrentSubtitleUrl(): String {
        return if (currentSubtitleIndex >= 0 && allSubtitles != null && currentSubtitleIndex < allSubtitles!!.length()) {
            try { allSubtitles!!.getJSONObject(currentSubtitleIndex).optString("url", "") } catch (_: Exception) { "" }
        } else {
            intent.getStringExtra("subtitleUrl") ?: ""
        }
    }

    private fun resolveAndPlay(providerName: String, mediaRef: String) {
        isErrorShowing = false
        errorOverlay.visibility = View.GONE
        loadingGroup.visibility = View.VISIBLE
        currentProgressPercentage = 0
        // Restart shimmer for fetch phase
        if (clipDrawable != null) startShimmerAnimation()
        CoroutineScope(Dispatchers.IO).launch {
            val host = CloudStreamPluginHost.instance
            if (host == null) {
                withContext(Dispatchers.Main) {
                    loadingGroup.visibility = View.GONE
                    showError("Plugin host not initialized")
                }
                return@launch
            }
            val resultJson = host.loadLinksBlocking(providerName, mediaRef)
            withContext(Dispatchers.Main) {
                try {
                    val obj = JSONObject(resultJson)
                    val sources = obj.optJSONArray("sources")
                    val subtitlesArray = obj.optJSONArray("subtitles")
                    val subs = mutableListOf<String>()

                    if (subtitlesArray != null) {
                        for (i in 0 until subtitlesArray.length()) {
                            val sub = subtitlesArray.getJSONObject(i)
                            val subUrl = sub.optString("url")
                            if (subUrl.isNotEmpty()) subs.add(subUrl)
                        }
                    }

                    if (sources != null && sources.length() > 0) {
                        allSources = sources
                        allSubtitles = subtitlesArray

                        var bestSource: JSONObject? = null
                        var bestRes = 0
                        for (i in 0 until sources.length()) {
                            val s = sources.getJSONObject(i)
                            val q = s.optString("quality", "")
                            val match = Regex("(\\d{3,4})").find(q)
                            val res = match?.groupValues?.get(1)?.toIntOrNull() ?: 0
                            if (res > bestRes) {
                                bestRes = res
                                bestSource = s
                            }
                        }
                        if (bestSource == null && sources.length() > 0) {
                            bestSource = sources.getJSONObject(0)
                        }
                        bestSource?.let { src ->
                            currentUrl = src.optString("url")
                            currentHeadersJson = src.optJSONObject("headers")?.toString() ?: "{}"
                            currentSourceIndex = sources.length() - 1
                            for (i in 0 until sources.length()) {
                                if (sources.getJSONObject(i).optString("url") == currentUrl) {
                                    currentSourceIndex = i
                                }
                            }
                            val subUrl = if (subs.isNotEmpty() && currentSubtitleIndex >= 0) subs[0] else ""
                            loadingGroup.animate()
                                .alpha(0f)
                                .setDuration(300)
                                .setListener(object : AnimatorListenerAdapter() {
                                    override fun onAnimationEnd(animation: Animator) {
                                        loadingGroup.visibility = View.GONE
                                        loadingGroup.alpha = 1f
                                    }
                                })
                            showControlsAfterLoad()
                            setupExoPlayer(currentUrl, currentHeadersJson, subUrl)
                        } ?: showError("No playable source found", providerName, mediaRef)
                    } else {
                        showError("No sources found", providerName, mediaRef)
                    }
                } catch (e: Exception) {
                    showError("Failed to load: ${e.message}", providerName, mediaRef)
                }
            }
        }
    }

    private fun showError(msg: String, epProvider: String? = null, epMediaRef: String? = null) {
        errorOverlay.visibility = View.VISIBLE
        isErrorShowing = true
        loadingGroup.visibility = View.GONE
        loadingGroup.alpha = 1f
        bufferingView.visibility = View.GONE
        errorMessageTv.text = msg

        errorRetryBtn.setOnClickListener {
            if (epProvider != null && epMediaRef != null) {
                resolveAndPlay(epProvider, epMediaRef)
            } else if (currentUrl.isNotEmpty()) {
                errorOverlay.visibility = View.GONE
                isErrorShowing = false
                loadingGroup.visibility = View.VISIBLE
                currentProgressPercentage = 0
                setupExoPlayer(currentUrl, currentHeadersJson, getCurrentSubtitleUrl())
            }
        }
        errorBackBtn.setOnClickListener { finish() }
    }

    private fun createErrorOverlay(): FrameLayout {
        val container = FrameLayout(this)
        container.setBackgroundColor(Color.parseColor("#F2050505")) // 95% pitch black

        val card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(dp(32), dp(24), dp(32), dp(24))
            background = GradientDrawable().apply {
                setColor(Color.parseColor("#730F0F14")) // rgba(15, 15, 20, 0.45)
                cornerRadius = dp(20).toFloat()
                setStroke(dp(1), Color.parseColor("#26FFFFFF")) // rgba(255, 255, 255, 0.15)
            }
        }
        val params = FrameLayout.LayoutParams(
            dp(360),
            FrameLayout.LayoutParams.WRAP_CONTENT
        )
        params.gravity = Gravity.CENTER
        container.addView(card, params)

        val errorIcon = TextView(this).apply {
            text = "!"
            setTextColor(Color.parseColor("#FF4A7D")) // Rose color
            textSize = 42f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
        }
        card.addView(errorIcon)

        errorMessageTv = TextView(this).apply {
            setTextColor(Color.parseColor("#A0A0A5")) // theme.colors.textSecondary
            textSize = 14f
            gravity = Gravity.CENTER
            setPadding(0, dp(8), 0, dp(16))
        }
        card.addView(errorMessageTv)

        val btnRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
        }
        card.addView(btnRow)

        errorRetryBtn = TextView(this).apply {
            text = "Retry"
            setTextColor(Color.WHITE)
            textSize = 14f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
            background = GradientDrawable().apply {
                setColor(Color.parseColor("#0047FF")) // Electric Blue
                cornerRadius = dp(10).toFloat()
            }
            setPadding(dp(28), dp(10), dp(28), dp(10))
        }
        addPremiumTouchAnimation(errorRetryBtn)
        val retryLp = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        )
        retryLp.setMargins(0, 0, dp(12), 0)
        btnRow.addView(errorRetryBtn, retryLp)

        errorBackBtn = TextView(this).apply {
            text = "Back"
            setTextColor(Color.WHITE)
            textSize = 14f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
            background = GradientDrawable().apply {
                setColor(Color.parseColor("#26FFFFFF")) // Semi-transparent glass background
                cornerRadius = dp(10).toFloat()
            }
            setPadding(dp(28), dp(10), dp(28), dp(10))
        }
        addPremiumTouchAnimation(errorBackBtn)
        btnRow.addView(errorBackBtn)

        return container
    }

    private fun setupExoPlayer(url: String, headersJson: String, subtitleUrl: String) {
        val headers = try { JSONObject(headersJson) } catch (_: Exception) { JSONObject() }

        val dataSourceFactory = DefaultHttpDataSource.Factory()
            .setUserAgent("Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36")
            .setAllowCrossProtocolRedirects(true)
            .setConnectTimeoutMs(30000)
            .setReadTimeoutMs(30000)

        if (headers.length() > 0) {
            val props = mutableMapOf<String, String>()
            for (key in headers.keys()) {
                props[key] = headers.getString(key)
            }
            dataSourceFactory.setDefaultRequestProperties(props)
        }

        val trackSelector = DefaultTrackSelector(this).apply {
            setParameters(buildUponParameters().setMaxVideoSizeSd())
        }

        player = ExoPlayer.Builder(this)
            .setTrackSelector(trackSelector)
            .setMediaSourceFactory(
                androidx.media3.exoplayer.source.DefaultMediaSourceFactory(dataSourceFactory)
            )
            .build()

        playerView.player = player

        player?.volume = 1f
        val aa = AudioAttributes.Builder()
            .setUsage(C.USAGE_MEDIA)
            .setContentType(C.AUDIO_CONTENT_TYPE_MOVIE)
            .build()
        player?.setAudioAttributes(aa, true)

        var mediaItemBuilder = MediaItem.Builder().setUri(Uri.parse(url))

        if (subtitleUrl.isNotEmpty()) {
            mediaItemBuilder = mediaItemBuilder.setSubtitleConfigurations(
                listOf(
                    MediaItem.SubtitleConfiguration.Builder(Uri.parse(subtitleUrl))
                        .setLanguage("en")
                        .setSelectionFlags(C.SELECTION_FLAG_DEFAULT)
                        .build()
                )
            )
        }

        val id = intent.getStringExtra("imdbId") ?: ""
        val mediaType = intent.getStringExtra("mediaType") ?: "movie"
        val season = getCurrentSeasonNumber()
        val episode = getCurrentEpisodeNumber()

        var savedPosition = 0L
        if (id.isNotEmpty()) {
            val prefs = getSharedPreferences("sozo_playback_history", MODE_PRIVATE)
            val historyStr = prefs.getString("history", "[]") ?: "[]"
            try {
                val historyArr = JSONArray(historyStr)
                for (i in 0 until historyArr.length()) {
                    val obj = historyArr.getJSONObject(i)
                    val oldId = obj.optString("imdbId")
                    if (oldId == id) {
                        val oldType = obj.optString("mediaType")
                        if (oldType == "series") {
                            val oldSeason = obj.optInt("season")
                            val oldEpisode = obj.optInt("episode")
                            if (oldSeason == season && oldEpisode == episode) {
                                savedPosition = obj.optLong("position", 0L)
                                break
                            }
                        } else {
                            savedPosition = obj.optLong("position", 0L)
                            break
                        }
                    }
                }
            } catch (_: Exception) {}
        }

        player?.setMediaItem(mediaItemBuilder.build())
        if (savedPosition > 0L) {
            player?.seekTo(savedPosition)
        }
        player?.prepare()
        player?.play()

        val epTitle = getCurrentEpisodeTitle()
        updateMediaSession(epTitle)

        player?.addListener(object : Player.Listener {
            override fun onPlaybackStateChanged(playbackState: Int) {
                updateBuffering(playbackState == Player.STATE_BUFFERING)
                if (playbackState == Player.STATE_READY) {
                    // Stop shimmer and hide loading overlay
                    shimmerAnimator?.cancel()
                    shimmerAnimator = null
                    loadingGroup.animate()
                        .alpha(0f)
                        .setDuration(400)
                        .setListener(object : AnimatorListenerAdapter() {
                            override fun onAnimationEnd(animation: Animator) {
                                loadingGroup.visibility = View.GONE
                                loadingGroup.alpha = 1f
                            }
                        }).start()
                    bufferingView.visibility = View.GONE
                    updateMediaSession(getCurrentEpisodeTitle())
                }
                if (playbackState == Player.STATE_ENDED) {
                    if (sleepTimerEndOfEpisode) {
                        finish()
                        return
                    }
                    autoPlayNext()
                }
            }

            override fun onPlayerError(error: PlaybackException) {
                showError("Playback error: ${error.localizedMessage}", providerName, getCurrentMediaRef())
            }

            override fun onIsPlayingChanged(isPlaying: Boolean) {
                updateCenterPlayPauseIcon()
                updateMediaSession(getCurrentEpisodeTitle())
            }
        })

        seekBar.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(sb: SeekBar?, progress: Int, fromUser: Boolean) {
                if (fromUser) {
                    player?.let { p ->
                        val dur = p.duration
                        if (dur > 0) {
                            val seekPos = dur * progress / 1000L
                            currentTimeTv.text = formatTime(seekPos)
                        }
                    }
                }
            }
            override fun onStartTrackingTouch(sb: SeekBar?) { isSeeking = true }
            override fun onStopTrackingTouch(sb: SeekBar?) {
                isSeeking = false
                player?.let { p ->
                    val dur = p.duration
                    if (dur > 0) {
                        sb?.let {
                            val seekPos = dur * it.progress / 1000L
                            p.seekTo(seekPos)
                        }
                    }
                }
                resetHideTimer()
            }
        })

        val updater = object : Runnable {
            override fun run() {
                player?.let { p ->
                    if (!isSeeking) {
                        val cur = p.currentPosition
                        val dur = p.duration
                        currentTimeTv.text = formatTime(cur)
                        endTimeTv.text = formatTime(dur)
                        if (dur > 0) {
                            seekBar.progress = ((cur.toFloat() / dur) * 1000).toInt()
                            seekBar.secondaryProgress = ((p.bufferedPosition.toFloat() / dur) * 1000).toInt()
                        }
                    }

                    if (loadingGroup.visibility == View.VISIBLE) {
                        val buffered = p.bufferedPercentage
                        val pct = if (providerName != null && intent.getStringExtra("data") != null) {
                            50 + (buffered / 2)
                        } else {
                            buffered
                        }
                        if (pct > 0) updateLoadingProgress(pct)
                    }

                    Handler(Looper.getMainLooper()).postDelayed(this, 250)
                }
            }
        }
        updater.run()

        if (player?.isPlaying == true) hideControls()

        updateEpisodeButtonState()
    }

    private fun getCurrentEpisodeTitle(): String {
        val base = intent.getStringExtra("title") ?: ""
        if (episodesArray != null && currentEpisodeIndex >= 0 && currentEpisodeIndex < episodesArray!!.length()) {
            try {
                val ep = episodesArray!!.getJSONObject(currentEpisodeIndex)
                val label = ep.optString("label", "")
                if (label.isNotEmpty()) return "$base - $label"
            } catch (_: Exception) {}
        }
        return base
    }

    private fun getCurrentMediaRef(): String? {
        if (episodesArray != null && currentEpisodeIndex >= 0 && currentEpisodeIndex < episodesArray!!.length()) {
            try {
                return episodesArray!!.getJSONObject(currentEpisodeIndex).optString("mediaRef")
            } catch (_: Exception) {}
        }
        return null
    }

    private fun playNextEpisode() {
        if (episodesArray == null || currentEpisodeIndex < 0 || currentEpisodeIndex >= episodesArray!!.length() - 1) return
        currentEpisodeIndex++
        val mediaRef = getCurrentMediaRef() ?: return
        val pName = providerName ?: return
        resolveAndPlay(pName, mediaRef)
        updateEpisodeButtonState()
    }

    private fun playPreviousEpisode() {
        if (episodesArray == null || currentEpisodeIndex <= 0) return
        currentEpisodeIndex--
        val mediaRef = getCurrentMediaRef() ?: return
        val pName = providerName ?: return
        resolveAndPlay(pName, mediaRef)
        updateEpisodeButtonState()
    }

    private fun autoPlayNext() {
        if (episodesArray == null || currentEpisodeIndex < 0 || currentEpisodeIndex >= episodesArray!!.length() - 1) return
        currentEpisodeIndex++
        val mediaRef = getCurrentMediaRef() ?: return
        val pName = providerName ?: return
        loadingGroup.visibility = View.VISIBLE
        currentProgressPercentage = 0
        resolveAndPlay(pName, mediaRef)
        updateEpisodeButtonState()
    }

    private fun updateEpisodeButtonState() {
        if (::prevEpBtn.isInitialized && ::nextEpBtn.isInitialized) {
            val hasPrev = episodesArray != null && currentEpisodeIndex > 0
            val hasNext = episodesArray != null && currentEpisodeIndex >= 0 && currentEpisodeIndex < episodesArray!!.length() - 1
            prevEpBtn.alpha = if (hasPrev) 1f else 0.3f
            nextEpBtn.alpha = if (hasNext) 1f else 0.3f
            prevEpBtn.isEnabled = hasPrev
            nextEpBtn.isEnabled = hasNext
        }
    }

    private fun createLoadingOverlay(): View {
        val container = FrameLayout(this)
        container.setBackgroundColor(Color.parseColor("#F2050505"))

        // Logo container – centered, fixed size. Logo fills left-to-right as data loads.
        logoContainer = FrameLayout(this).apply {
            val lp = FrameLayout.LayoutParams(dp(260), dp(110))
            lp.gravity = Gravity.CENTER
            layoutParams = lp
        }

        // Placeholder shimmer bar shown before the logo bitmap arrives
        val placeholderBar = android.widget.FrameLayout(this).apply {
            background = GradientDrawable().apply {
                setColor(Color.parseColor("#1AFFFFFF"))
                cornerRadius = dp(10).toFloat()
            }
        }
        logoContainer.addView(placeholderBar, android.widget.FrameLayout.LayoutParams(
            android.widget.FrameLayout.LayoutParams.MATCH_PARENT,
            android.widget.FrameLayout.LayoutParams.MATCH_PARENT
        ))

        container.addView(logoContainer)
        return container
    }

    private fun setupLogoOverlay(bitmap: android.graphics.Bitmap) {
        if (!::logoContainer.isInitialized) return
        logoBitmap = bitmap
        logoContainer.removeAllViews()

        // Ghost layer: full logo at low opacity
        val logoBackground = ImageView(this).apply {
            setImageBitmap(bitmap)
            alpha = 0.30f
            scaleType = ImageView.ScaleType.FIT_CENTER
        }
        logoContainer.addView(logoBackground, matchParent())

        // Foreground layer: clip-filled from left as progress increases
        val logoForegroundDrawable = android.graphics.drawable.BitmapDrawable(resources, bitmap)
        clipDrawable = android.graphics.drawable.ClipDrawable(
            logoForegroundDrawable,
            Gravity.LEFT,
            android.graphics.drawable.ClipDrawable.HORIZONTAL
        ).apply {
            level = currentProgressPercentage * 100
        }
        val logoForeground = ImageView(this).apply {
            setImageDrawable(clipDrawable)
            scaleType = ImageView.ScaleType.FIT_CENTER
        }
        logoContainer.addView(logoForeground, matchParent())

        // Start shimmer: animate clip level back and forth while waiting for real progress
        startShimmerAnimation()
    }

    private fun startShimmerAnimation() {
        shimmerAnimator?.cancel()
        val cd = clipDrawable ?: return
        shimmerAnimator = android.animation.ObjectAnimator.ofInt(cd, "level", 0, 4500).apply {
            duration = 1100
            repeatCount = android.animation.ValueAnimator.INFINITE
            repeatMode = android.animation.ValueAnimator.REVERSE
            interpolator = android.view.animation.AccelerateDecelerateInterpolator()
            start()
        }
    }

    private fun stopShimmerAnimation() {
        shimmerAnimator?.cancel()
        shimmerAnimator = null
    }

    private fun updateLoadingProgress(pct: Int) {
        val targetPct = pct.coerceIn(0, 100)
        if (targetPct <= currentProgressPercentage && targetPct > 0) return
        currentProgressPercentage = targetPct

        runOnUiThread {
            // Stop shimmer once real progress data arrives
            if (targetPct > 0 && shimmerAnimator?.isRunning == true) {
                stopShimmerAnimation()
            }
            clipDrawable?.level = currentProgressPercentage * 100
        }
    }

    private fun createBufferingOverlay(): View {
        // Buffering is now shown via loadingGroup (logo fill overlay).
        // This view is kept as an invisible placeholder to avoid null references.
        return FrameLayout(this).apply {
            setBackgroundColor(Color.TRANSPARENT)
            visibility = View.GONE
        }
    }

    // ─── Center play controls ───────────────────────────────────────────────────
    private fun createCenterControls(): View {
        val container = FrameLayout(this)

        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        val rowLp = FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.WRAP_CONTENT,
            FrameLayout.LayoutParams.WRAP_CONTENT
        ).apply { gravity = Gravity.CENTER }
        container.addView(row, rowLp)

        // Prev episode
        prevEpBtn = ImageView(this).apply {
            setImageResource(R.drawable.ic_skip_previous)
            setColorFilter(Color.WHITE)
            setPadding(dp(9), dp(9), dp(9), dp(9))
            setOnClickListener { playPreviousEpisode() }
        }
        addPremiumTouchAnimation(prevEpBtn)
        row.addView(prevEpBtn, LinearLayout.LayoutParams(dp(42), dp(42)).apply { rightMargin = dp(10) })

        // Rewind 10s — glass circle
        val rewindBtn = ImageView(this).apply {
            setImageResource(R.drawable.ic_rewind)
            setColorFilter(Color.WHITE)
            setPadding(dp(12), dp(12), dp(12), dp(12))
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.parseColor("#66100E14"))
            }
            setOnClickListener {
                player?.let { p -> p.seekTo((p.currentPosition - 10000).coerceAtLeast(0)) }
                showSeekFeedback("\u23ea", 10)
                resetHideTimer()
            }
        }
        addPremiumTouchAnimation(rewindBtn)
        skipBackBtn = rewindBtn
        row.addView(rewindBtn, LinearLayout.LayoutParams(dp(52), dp(52)).apply { rightMargin = dp(24) })

        // Play / Pause — larger glass circle
        playPauseCenter = ImageView(this).apply {
            setImageResource(R.drawable.ic_play)
            setPadding(dp(16), dp(16), dp(16), dp(16))
            setColorFilter(Color.WHITE)
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.parseColor("#80100E14"))
                setStroke(dp(1), Color.parseColor("#40FFFFFF"))
            }
            setOnClickListener {
                player?.let { p -> if (p.isPlaying) p.pause() else p.play() }
                resetHideTimer()
            }
        }
        addPremiumTouchAnimation(playPauseCenter)
        row.addView(playPauseCenter, LinearLayout.LayoutParams(dp(68), dp(68)))

        // Fast forward 10s — glass circle
        val ffBtn = ImageView(this).apply {
            setImageResource(R.drawable.ic_fast_forward)
            setColorFilter(Color.WHITE)
            setPadding(dp(12), dp(12), dp(12), dp(12))
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.parseColor("#66100E14"))
            }
            setOnClickListener {
                player?.let { p ->
                    val dur = p.duration
                    p.seekTo((p.currentPosition + 10000).coerceAtMost(if (dur > 0) dur else p.currentPosition + 10000))
                }
                showSeekFeedback("\u23e9", 10)
                resetHideTimer()
            }
        }
        addPremiumTouchAnimation(ffBtn)
        skipForwardBtn = ffBtn
        row.addView(ffBtn, LinearLayout.LayoutParams(dp(52), dp(52)).apply { leftMargin = dp(24) })

        // Next episode
        nextEpBtn = ImageView(this).apply {
            setImageResource(R.drawable.ic_skip_next)
            setColorFilter(Color.WHITE)
            setPadding(dp(9), dp(9), dp(9), dp(9))
            setOnClickListener { playNextEpisode() }
        }
        addPremiumTouchAnimation(nextEpBtn)
        row.addView(nextEpBtn, LinearLayout.LayoutParams(dp(42), dp(42)).apply { leftMargin = dp(10) })

        return container
    }

    // ─── Top bar: X button (left) + Volume/Brightness sliders (right) ───────────
    private fun createTopBar(title: String): View {
        val container = FrameLayout(this)

        // Top gradient
        val gradient = View(this).apply {
            layoutParams = FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, dp(120))
            background = GradientDrawable(
                GradientDrawable.Orientation.TOP_BOTTOM,
                intArrayOf(Color.parseColor("#CC000000"), Color.TRANSPARENT)
            )
        }
        container.addView(gradient)

        val bar = FrameLayout(this).apply { setPadding(dp(20), dp(18), dp(20), dp(18)) }
        container.addView(bar, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT
        ).apply { gravity = Gravity.TOP })

        // ── X (close) button — glass circle left ──
        val closeBtn = FrameLayout(this).apply {
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.parseColor("#80100E14"))
                setStroke(dp(1), Color.parseColor("#33FFFFFF"))
            }
            setOnClickListener { finish() }
        }
        addPremiumTouchAnimation(closeBtn)
        val closeIcon = ImageView(this).apply {
            setImageResource(R.drawable.ic_arrow_back)
            setColorFilter(Color.WHITE)
        }
        val closeIconLp = FrameLayout.LayoutParams(dp(20), dp(20)).apply { gravity = Gravity.CENTER }
        closeBtn.addView(closeIcon, closeIconLp)
        bar.addView(closeBtn, FrameLayout.LayoutParams(dp(40), dp(40)).apply {
            gravity = Gravity.LEFT or Gravity.CENTER_VERTICAL
        })

        // ── Slider panel (right side): volume + brightness stacked ──
        val slidersPanel = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
        }

        val am = audioManager
        val maxVol = am?.getStreamMaxVolume(AudioManager.STREAM_MUSIC) ?: 15

        // Volume slider pill
        volumeSliderLayout = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(10), 0, dp(10), 0)
            background = GradientDrawable().apply {
                setColor(Color.parseColor("#99100E14"))
                cornerRadius = dp(22).toFloat()
                setStroke(dp(1), Color.parseColor("#26FFFFFF"))
            }
        }
        volumeSeekBar = SeekBar(this, null, android.R.attr.seekBarStyle).apply {
            max = maxVol
            progressTintList = android.content.res.ColorStateList.valueOf(Color.WHITE)
            progressBackgroundTintList = android.content.res.ColorStateList.valueOf(Color.parseColor("#40FFFFFF"))
            thumbTintList = android.content.res.ColorStateList.valueOf(Color.WHITE)
            setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
                override fun onProgressChanged(sb: SeekBar?, progress: Int, fromUser: Boolean) {
                    if (fromUser) am?.setStreamVolume(AudioManager.STREAM_MUSIC, progress, 0)
                }
                override fun onStartTrackingTouch(sb: SeekBar?) { resetHideTimer() }
                override fun onStopTrackingTouch(sb: SeekBar?) { resetHideTimer() }
            })
        }
        val volIcon = TextView(this).apply {
            text = "\uD83D\uDD0A"
            setTextColor(Color.parseColor("#B0B0B5"))
            textSize = 13f
            setPadding(dp(4), 0, 0, 0)
        }
        volumeSliderLayout.addView(volumeSeekBar, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        volumeSliderLayout.addView(volIcon, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT))
        slidersPanel.addView(volumeSliderLayout, LinearLayout.LayoutParams(dp(220), dp(40)))

        // Brightness slider pill
        brightnessSliderLayout = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(10), 0, dp(10), 0)
            background = GradientDrawable().apply {
                setColor(Color.parseColor("#99100E14"))
                cornerRadius = dp(22).toFloat()
                setStroke(dp(1), Color.parseColor("#26FFFFFF"))
            }
        }
        brightnessSeekBar = SeekBar(this, null, android.R.attr.seekBarStyle).apply {
            max = 100
            progressTintList = android.content.res.ColorStateList.valueOf(Color.WHITE)
            progressBackgroundTintList = android.content.res.ColorStateList.valueOf(Color.parseColor("#40FFFFFF"))
            thumbTintList = android.content.res.ColorStateList.valueOf(Color.WHITE)
            setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
                override fun onProgressChanged(sb: SeekBar?, progress: Int, fromUser: Boolean) {
                    if (fromUser) {
                        val newBright = (progress / 100f).coerceIn(0.01f, 1f)
                        val wlp = window.attributes
                        wlp.screenBrightness = newBright
                        window.attributes = wlp
                        lastBrightness = newBright
                    }
                }
                override fun onStartTrackingTouch(sb: SeekBar?) { resetHideTimer() }
                override fun onStopTrackingTouch(sb: SeekBar?) { resetHideTimer() }
            })
        }
        val brightIcon = TextView(this).apply {
            text = "\u2600"
            setTextColor(Color.parseColor("#B0B0B5"))
            textSize = 13f
            setPadding(dp(4), 0, 0, 0)
        }
        brightnessSliderLayout.addView(brightnessSeekBar, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        brightnessSliderLayout.addView(brightIcon, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT))
        slidersPanel.addView(brightnessSliderLayout, LinearLayout.LayoutParams(dp(220), dp(40)).apply { topMargin = dp(8) })

        bar.addView(slidersPanel, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT
        ).apply { gravity = Gravity.RIGHT or Gravity.CENTER_VERTICAL })

        // Initialize dummy title/icon fields (title is now in bottom bar)
        titleTv = TextView(this)
        sourcesBtn = ImageView(this)
        subtitleBtn = ImageView(this)
        sleepTimerBtn = ImageView(this)

        return container
    }

    // ─── Bottom bar: episode subtitle + title + seekbar + icon buttons ──────────
    private fun createBottomBar(): View {
        val container = FrameLayout(this)

        // Bottom gradient — tall for the title area
        val gradient = View(this).apply {
            layoutParams = FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, dp(280))
            background = GradientDrawable(
                GradientDrawable.Orientation.BOTTOM_TOP,
                intArrayOf(
                    Color.parseColor("#FF050505"),
                    Color.parseColor("#F0050505"),
                    Color.parseColor("#C0050505"),
                    Color.parseColor("#80050505"),
                    Color.parseColor("#30050505"),
                    Color.TRANSPARENT
                )
            )
        }
        container.addView(gradient, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, dp(280)
        ).apply { gravity = Gravity.BOTTOM })

        val bar = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(22), 0, dp(22), dp(20))
        }
        container.addView(bar, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT
        ).apply { gravity = Gravity.BOTTOM })

        // ── Row 1: Episode subtitle (left) + Action icon buttons (right) ──
        val topRow = FrameLayout(this)

        episodeSubtitleTv = TextView(this).apply {
            setTextColor(Color.parseColor("#A0A0A5"))
            textSize = 11f
            letterSpacing = 0.04f
        }
        topRow.addView(episodeSubtitleTv, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT
        ).apply { gravity = Gravity.LEFT or Gravity.CENTER_VERTICAL })

        // Action icon buttons — right side
        val iconRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }

        val mediaType = intent.getStringExtra("mediaType") ?: "movie"
        val isSeries = (mediaType == "series" || mediaType == "show") && episodesArray != null && episodesArray!!.length() > 0

        // Episodes button (series only)
        val episodesBtn = createGlassIconButton(R.drawable.ic_episodes) { showEpisodesDialog() }
        episodesBtn.visibility = if (isSeries) View.VISIBLE else View.GONE
        iconRow.addView(episodesBtn, LinearLayout.LayoutParams(dp(38), dp(38)))

        // Subtitles button ("CC" text) — real text glass button
        subtitleBtn = addGlassTextToRow(iconRow, "CC",
            LinearLayout.LayoutParams(dp(38), dp(38)).apply { leftMargin = dp(10) }
        ) { showSettingsDialog("Subtitles") }

        // Source / Quality button ("SRC" text)
        sourcesBtn = addGlassTextToRow(iconRow, "SRC",
            LinearLayout.LayoutParams(dp(38), dp(38)).apply { leftMargin = dp(10) }
        ) { showSettingsDialog("Quality") }

        // Settings button (sleep timer + speed)
        val settingsBtn = createGlassIconButton(R.drawable.ic_settings) { showSettingsDialog("Sleep Timer") }
        iconRow.addView(settingsBtn, LinearLayout.LayoutParams(dp(38), dp(38)).apply { leftMargin = dp(10) })

        topRow.addView(iconRow, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT
        ).apply { gravity = Gravity.RIGHT or Gravity.CENTER_VERTICAL })

        bar.addView(topRow, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, dp(46)
        ))

        // ── Row 2: Large title ──
        titleTv = TextView(this).apply {
            text = intent.getStringExtra("title") ?: ""
            setTextColor(Color.WHITE)
            textSize = 22f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            setSingleLine()
            ellipsize = android.text.TextUtils.TruncateAt.MARQUEE
            isSelected = true
        }
        bar.addView(titleTv, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply { bottomMargin = dp(14) })

        // ── Row 3: SeekBar (full width, thin white style) ──
        seekBar = SeekBar(this, null, android.R.attr.seekBarStyle).apply {
            progressTintList = android.content.res.ColorStateList.valueOf(Color.WHITE)
            progressBackgroundTintList = android.content.res.ColorStateList.valueOf(Color.parseColor("#50FFFFFF"))
            secondaryProgressTintList = android.content.res.ColorStateList.valueOf(Color.parseColor("#80FFFFFF"))
            thumbTintList = android.content.res.ColorStateList.valueOf(Color.WHITE)
            max = 1000
            setPadding(0, 0, 0, 0)
        }
        bar.addView(seekBar, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT
        ))

        // ── Row 4: Time labels ──
        val timeRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(2), dp(6), dp(2), 0)
        }
        currentTimeTv = TextView(this).apply {
            text = "00:00"
            setTextColor(Color.parseColor("#A0A0A5"))
            textSize = 11f
        }
        endTimeTv = TextView(this).apply {
            text = "00:00"
            setTextColor(Color.parseColor("#A0A0A5"))
            textSize = 11f
        }
        val timeSpacer = View(this).apply { layoutParams = LinearLayout.LayoutParams(0, 1, 1f) }
        timeRow.addView(currentTimeTv)
        timeRow.addView(timeSpacer)
        timeRow.addView(endTimeTv)
        bar.addView(timeRow, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
        return container
    }

    private fun createGlassIconButton(iconRes: Int, onClick: () -> Unit): ImageView {
        val btn = ImageView(this).apply {
            setImageResource(iconRes)
            setColorFilter(Color.WHITE)
            setPadding(dp(7), dp(7), dp(7), dp(7))
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.parseColor("#66100E14"))
                setStroke(dp(1), Color.parseColor("#26FFFFFF"))
            }
            setOnClickListener { onClick() }
        }
        addPremiumTouchAnimation(btn)
        return btn
    }


    // Properly add a text-label glass button and wire it to the relevant ImageView field
    private fun addGlassTextToRow(row: LinearLayout, label: String, lp: LinearLayout.LayoutParams, onClick: () -> Unit): View {
        val container = FrameLayout(this).apply {
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.parseColor("#66100E14"))
                setStroke(dp(1), Color.parseColor("#26FFFFFF"))
            }
            setOnClickListener { onClick() }
        }
        addPremiumTouchAnimation(container)
        val tv = TextView(this).apply {
            text = label
            setTextColor(Color.WHITE)
            textSize = 9.5f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
        }
        container.addView(tv, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        row.addView(container, lp)
        return container
    }

    private fun createIconButton(iconRes: Int, onClick: () -> Unit): ImageView {
        val btn = ImageView(this).apply {
            setImageResource(iconRes)
            setColorFilter(Color.WHITE)
            setPadding(dp(8), dp(8), dp(8), dp(8))
            setOnClickListener { onClick() }
        }
        addPremiumTouchAnimation(btn)
        return btn
    }

    private fun addPremiumTouchAnimation(view: View) {
        view.setOnTouchListener { v, event ->
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    v.animate().scaleX(0.92f).scaleY(0.92f).setDuration(100).start()
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    v.animate().scaleX(1f).scaleY(1f).setDuration(100).start()
                }
            }
            false
        }
    }

    private fun toggleMute() {
        val exo = player ?: return
        val volumeIcon = bottomBar.findViewWithTag<ImageView>("volume_icon")
        if (isMuted) {
            exo.volume = lastVolumeLevel
            isMuted = false
            volumeIcon?.setImageResource(R.drawable.ic_volume)
            showToastLabel("Volume: On")
        } else {
            lastVolumeLevel = exo.volume
            exo.volume = 0f
            isMuted = true
            volumeIcon?.setImageResource(R.drawable.ic_volume_off)
            showToastLabel("Volume: Muted")
        }
    }

    private fun cycleResizeMode() {
        playerView.let { pv ->
            val modes = intArrayOf(
                AspectRatioFrameLayout.RESIZE_MODE_FIT,
                AspectRatioFrameLayout.RESIZE_MODE_ZOOM,
                AspectRatioFrameLayout.RESIZE_MODE_FILL
            )
            val current = pv.resizeMode
            val nextIdx = (modes.indexOf(current) + 1) % modes.size
            pv.resizeMode = modes[nextIdx]
            
            val modeText = when (modes[nextIdx]) {
                AspectRatioFrameLayout.RESIZE_MODE_FIT -> "Fit to Screen"
                AspectRatioFrameLayout.RESIZE_MODE_ZOOM -> "Zoomed / Crop"
                AspectRatioFrameLayout.RESIZE_MODE_FILL -> "Stretch / Fill"
                else -> "Fit to Screen"
            }
            showToastLabel(modeText)
        }
    }

    private fun startDownload(url: String) {
        if (url.startsWith("magnet:") || url.contains("torrent")) {
            showToastLabel("Cannot download torrent streams directly")
            return
        }
        try {
            val uri = Uri.parse(url)
            val request = android.app.DownloadManager.Request(uri).apply {
                setTitle(getCurrentEpisodeTitle())
                setDescription("Downloading video stream")
                setNotificationVisibility(android.app.DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                setDestinationInExternalPublicDir(android.os.Environment.DIRECTORY_DOWNLOADS, "${getCurrentEpisodeTitle()}.mp4")
                
                val headers = try { JSONObject(currentHeadersJson) } catch (_: Exception) { null }
                headers?.keys()?.forEach { key ->
                    addRequestHeader(key, headers.getString(key))
                }
            }
            val dm = getSystemService(DOWNLOAD_SERVICE) as android.app.DownloadManager
            dm.enqueue(request)
            showToastLabel("Download started in background")
        } catch (e: Exception) {
            showToastLabel("Download failed: ${e.message}")
        }
    }

    private fun showSettingsDialog(initialCategory: String = "Quality") {
        PlayerSettingsDialog(initialCategory).show()
        resetHideTimer()
    }

    private fun showEpisodesDialog() {
        EpisodesDialog().show()
        resetHideTimer()
    }

    private inner class PlayerSettingsDialog(private val startCategory: String = "Quality") : Dialog(this@PlayerActivity, android.R.style.Theme_DeviceDefault_Dialog) {
        private var activeCategory = startCategory
        private lateinit var optionsContainer: LinearLayout
        private lateinit var categoryList: LinearLayout

        override fun onCreate(savedInstanceState: Bundle?) {
            super.onCreate(savedInstanceState)
            requestWindowFeature(android.view.Window.FEATURE_NO_TITLE)

            val dialogWindow = window
            dialogWindow?.setBackgroundDrawable(GradientDrawable().apply {
                setColor(Color.parseColor("#F2100E14"))
                cornerRadius = dp(20).toFloat()
                setStroke(dp(1), Color.parseColor("#26FFFFFF"))
            })

            val root = LinearLayout(this@PlayerActivity).apply {
                orientation = LinearLayout.HORIZONTAL
            }
            setContentView(root)
            dialogWindow?.setLayout(dp(540), dp(300))

            categoryList = LinearLayout(this@PlayerActivity).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER_HORIZONTAL
                setPadding(0, dp(16), 0, dp(16))
                background = GradientDrawable().apply {
                    setColor(Color.parseColor("#33000000"))
                }
            }
            root.addView(categoryList, LinearLayout.LayoutParams(dp(180), LinearLayout.LayoutParams.MATCH_PARENT))

            val divider = View(this@PlayerActivity).apply {
                setBackgroundColor(Color.parseColor("#26FFFFFF"))
            }
            root.addView(divider, LinearLayout.LayoutParams(dp(1), LinearLayout.LayoutParams.MATCH_PARENT))

            val scrollView = android.widget.ScrollView(this@PlayerActivity).apply {
                isFillViewport = true
            }
            optionsContainer = LinearLayout(this@PlayerActivity).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(dp(20), dp(16), dp(20), dp(16))
            }
            scrollView.addView(optionsContainer, FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.WRAP_CONTENT
            ))
            root.addView(scrollView, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.MATCH_PARENT, 1f))

            refreshCategories()
            showCategoryOptions()
        }

        private fun refreshCategories() {
            categoryList.removeAllViews()
            val categories = mutableListOf("Quality", "Subtitles", "Sleep Timer", "Playback Speed")
            
            categories.forEach { cat ->
                val tab = TextView(this@PlayerActivity).apply {
                    text = cat.uppercase()
                    setTextColor(if (activeCategory == cat) Color.parseColor("#5580FF") else Color.parseColor("#8E8D92"))
                    textSize = 12f
                    typeface = android.graphics.Typeface.DEFAULT_BOLD
                    gravity = Gravity.CENTER
                    setPadding(dp(16), dp(12), dp(16), dp(12))
                    background = if (activeCategory == cat) GradientDrawable().apply {
                        setColor(Color.parseColor("#225580FF"))
                        cornerRadius = dp(8).toFloat()
                    } else null
                    setOnClickListener {
                        activeCategory = cat
                        refreshCategories()
                        showCategoryOptions()
                    }
                }
                addPremiumTouchAnimation(tab)
                categoryList.addView(tab, LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply {
                    setMargins(dp(12), dp(4), dp(12), dp(4))
                })
            }
        }

        private fun showCategoryOptions() {
            optionsContainer.removeAllViews()
            when (activeCategory) {
                "Quality" -> populateQualityOptions()
                "Subtitles" -> populateSubtitleOptions()
                "Sleep Timer" -> populateSleepTimerOptions()
                "Playback Speed" -> populateSpeedOptions()
            }
        }

        private fun populateQualityOptions() {
            val sources = allSources
            if (sources == null || sources.length() == 0) {
                val emptyTv = TextView(this@PlayerActivity).apply {
                    text = "No quality options available"
                    setTextColor(Color.WHITE)
                    textSize = 14f
                    gravity = Gravity.CENTER
                }
                optionsContainer.addView(emptyTv)
                return
            }

            for (i in 0 until sources.length()) {
                val s = sources.getJSONObject(i)
                val q = s.optString("quality", "?")
                val t = s.optString("type", "Direct")
                val labelText = "$q — $t"
                val isSelected = (i == currentSourceIndex)

                val row = createOptionRow(labelText, isSelected) {
                    currentSourceIndex = i
                    switchToSource(i)
                    dismiss()
                }
                optionsContainer.addView(row)
            }
        }

        private fun populateSubtitleOptions() {
            val subs = allSubtitles
            val totalSubs = (subs?.length() ?: 0)
            
            val isOffSelected = (currentSubtitleIndex < 0)
            val offRow = createOptionRow("Subtitle Off", isOffSelected) {
                currentSubtitleIndex = -1
                switchToSource(currentSourceIndex)
                subBtnTint(true)
                showToastLabel("Subtitles: Off")
                dismiss()
            }
            optionsContainer.addView(offRow)

            if (subs != null) {
                for (i in 0 until totalSubs) {
                    val sub = subs.getJSONObject(i)
                    val lang = sub.optString("lang", "?")
                    val isSelected = (i == currentSubtitleIndex)

                    val row = createOptionRow(lang, isSelected) {
                        currentSubtitleIndex = i
                        switchToSource(currentSourceIndex)
                        subBtnTint(false)
                        showToastLabel("Subtitles: $lang")
                        dismiss()
                    }
                    optionsContainer.addView(row)
                }
            }
        }

        private fun populateSleepTimerOptions() {
            val items = arrayOf("Off", "15 minutes", "30 minutes", "60 minutes", "End of episode")
            items.forEachIndexed { idx, label ->
                val isSelected = when (idx) {
                    0 -> !sleepTimerEndOfEpisode && sleepTimerEnd == -1L
                    1 -> !sleepTimerEndOfEpisode && sleepTimerEnd > 0L && (sleepTimerEnd - System.currentTimeMillis() <= 15 * 60 * 1000 + 5000)
                    2 -> !sleepTimerEndOfEpisode && sleepTimerEnd > 0L && (sleepTimerEnd - System.currentTimeMillis() > 15 * 60 * 1000 && sleepTimerEnd - System.currentTimeMillis() <= 30 * 60 * 1000 + 5000)
                    3 -> !sleepTimerEndOfEpisode && sleepTimerEnd > 0L && (sleepTimerEnd - System.currentTimeMillis() > 30 * 60 * 1000)
                    4 -> sleepTimerEndOfEpisode
                    else -> false
                }

                val row = createOptionRow(label, isSelected) {
                    sleepHandler.removeCallbacks(sleepRunnable)
                    when (idx) {
                        0 -> { sleepTimerEnd = -1; sleepTimerEndOfEpisode = false; showToastLabel("Sleep Timer: Off") }
                        1 -> { sleepTimerEnd = System.currentTimeMillis() + 15 * 60 * 1000; showToastLabel("Sleep Timer: 15 min") }
                        2 -> { sleepTimerEnd = System.currentTimeMillis() + 30 * 60 * 1000; showToastLabel("Sleep Timer: 30 min") }
                        3 -> { sleepTimerEnd = System.currentTimeMillis() + 60 * 60 * 1000; showToastLabel("Sleep Timer: 60 min") }
                        4 -> { sleepTimerEndOfEpisode = true; showToastLabel("Sleep Timer: End of episode") }
                    }
                    if (idx in 1..3) {
                        val delay = (sleepTimerEnd - System.currentTimeMillis()).coerceAtLeast(0)
                        sleepHandler.postDelayed(sleepRunnable, delay)
                    }
                    dismiss()
                }
                optionsContainer.addView(row)
            }
        }

        private fun populateSpeedOptions() {
            val speeds = arrayOf(0.5f, 0.75f, 1.0f, 1.25f, 1.5f, 2.0f)
            val currentSpeed = player?.playbackParameters?.speed ?: 1.0f

            speeds.forEach { speed ->
                val label = if (speed == 1.0f) "1.0x (Normal)" else "${speed}x"
                val isSelected = abs(currentSpeed - speed) < 0.05f

                val row = createOptionRow(label, isSelected) {
                    player?.setPlaybackSpeed(speed)
                    showToastLabel("Speed: $label")
                    dismiss()
                }
                optionsContainer.addView(row)
            }
        }

        private fun createOptionRow(text: String, isSelected: Boolean, onClick: () -> Unit): LinearLayout {
            val row = LinearLayout(this@PlayerActivity).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setPadding(dp(12), dp(10), dp(12), dp(10))
                background = if (isSelected) GradientDrawable().apply {
                    setColor(Color.parseColor("#14FFFFFF"))
                    cornerRadius = dp(8).toFloat()
                } else null
                setOnClickListener { onClick() }
            }
            addPremiumTouchAnimation(row)

            val tv = TextView(this@PlayerActivity).apply {
                this.text = text
                setTextColor(if (isSelected) Color.parseColor("#5580FF") else Color.WHITE)
                textSize = 14f
                typeface = if (isSelected) android.graphics.Typeface.DEFAULT_BOLD else android.graphics.Typeface.DEFAULT
            }
            row.addView(tv, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))

            if (isSelected) {
                val check = TextView(this@PlayerActivity).apply {
                    this.text = "✓"
                    setTextColor(Color.parseColor("#5580FF"))
                    textSize = 14f
                    typeface = android.graphics.Typeface.DEFAULT_BOLD
                }
                row.addView(check)
            }

            return row
        }
    }

    private inner class EpisodesDialog : Dialog(this@PlayerActivity, android.R.style.Theme_DeviceDefault_Dialog) {
        override fun onCreate(savedInstanceState: Bundle?) {
            super.onCreate(savedInstanceState)
            requestWindowFeature(android.view.Window.FEATURE_NO_TITLE)

            val dialogWindow = window
            dialogWindow?.setBackgroundDrawable(GradientDrawable().apply {
                setColor(Color.parseColor("#F2100E14"))
                cornerRadius = dp(20).toFloat()
                setStroke(dp(1), Color.parseColor("#26FFFFFF"))
            })

            val root = LinearLayout(this@PlayerActivity).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(dp(20), dp(16), dp(20), dp(16))
            }
            setContentView(root)
            dialogWindow?.setLayout(dp(440), dp(300))

            val header = TextView(this@PlayerActivity).apply {
                text = "SELECT EPISODE"
                setTextColor(Color.WHITE)
                textSize = 15f
                typeface = android.graphics.Typeface.DEFAULT_BOLD
                setPadding(0, 0, 0, dp(12))
            }
            root.addView(header)

            val divider = View(this@PlayerActivity).apply {
                setBackgroundColor(Color.parseColor("#26FFFFFF"))
            }
            root.addView(divider, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(1)).apply {
                bottomMargin = dp(8)
            })

            val scrollView = android.widget.ScrollView(this@PlayerActivity).apply {
                isFillViewport = true
            }
            val listContainer = LinearLayout(this@PlayerActivity).apply {
                orientation = LinearLayout.VERTICAL
            }
            scrollView.addView(listContainer)
            root.addView(scrollView, LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                0, 1f
            ))

            val episodes = episodesArray
            if (episodes != null) {
                for (i in 0 until episodes.length()) {
                    val ep = episodes.getJSONObject(i)
                    val label = ep.optString("label", "Episode ${i + 1}")
                    val isSelected = (i == currentEpisodeIndex)

                    val row = LinearLayout(this@PlayerActivity).apply {
                        orientation = LinearLayout.HORIZONTAL
                        gravity = Gravity.CENTER_VERTICAL
                        setPadding(dp(12), dp(10), dp(12), dp(10))
                        background = if (isSelected) GradientDrawable().apply {
                            setColor(Color.parseColor("#14FFFFFF"))
                            cornerRadius = dp(8).toFloat()
                        } else null
                        setOnClickListener {
                            currentEpisodeIndex = i
                            val mediaRef = ep.optString("mediaRef", "")
                            if (mediaRef.isNotEmpty()) {
                                resolveAndPlay(providerName ?: "", mediaRef)
                            }
                            dismiss()
                        }
                    }
                    addPremiumTouchAnimation(row)

                    val tv = TextView(this@PlayerActivity).apply {
                        this.text = label
                        setTextColor(if (isSelected) Color.parseColor("#5580FF") else Color.WHITE)
                        textSize = 14f
                        typeface = if (isSelected) android.graphics.Typeface.DEFAULT_BOLD else android.graphics.Typeface.DEFAULT
                    }
                    row.addView(tv, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))

                    if (isSelected) {
                        val check = TextView(this@PlayerActivity).apply {
                            this.text = "✓"
                            setTextColor(Color.parseColor("#5580FF"))
                            textSize = 14f
                            typeface = android.graphics.Typeface.DEFAULT_BOLD
                        }
                        row.addView(check)
                    }

                    listContainer.addView(row)
                }
            }
        }
    }

    private fun switchToSource(index: Int) {
        val sources = allSources ?: return
        if (index >= sources.length()) return
        try {
            val src = sources.getJSONObject(index)
            currentUrl = src.optString("url", "")
            currentHeadersJson = src.optJSONObject("headers")?.toString() ?: "{}"
            currentSourceIndex = index

            val subUrl = getCurrentSubtitleUrl()
            rebuildPlayer(currentUrl, currentHeadersJson, subUrl)
        } catch (_: Exception) { }
    }

    private fun rebuildPlayer(url: String, headersJson: String, subtitleUrl: String) {
        player?.let { p ->
            p.stop()
            p.clearMediaItems()
        }
        playerView.player = null
        player?.release()
        player = null
        setupExoPlayer(url, headersJson, subtitleUrl)
    }

    private fun updateCenterPlayPauseIcon() {
        player?.let { p ->
            playPauseCenter.setImageResource(
                if (p.isPlaying) R.drawable.ic_pause
                else R.drawable.ic_play
            )
        }
    }

    private fun updateBuffering(buffering: Boolean) {
        isBuffering = buffering
        if (buffering) {
            // Show logo loading overlay during mid-play buffer stalls
            if (loadingGroup.visibility != View.VISIBLE) {
                loadingGroup.alpha = 0.88f
                loadingGroup.visibility = View.VISIBLE
                // Restart shimmer if we have a logo and progress hasn't completed
                if (clipDrawable != null && shimmerAnimator?.isRunning != true) {
                    startShimmerAnimation()
                }
            }
        } else {
            // Buffering ended — hide overlay (STATE_READY will also hide it)
            loadingGroup.animate()
                .alpha(0f)
                .setDuration(350)
                .setListener(object : AnimatorListenerAdapter() {
                    override fun onAnimationEnd(animation: Animator) {
                        loadingGroup.visibility = View.GONE
                        loadingGroup.alpha = 1f
                    }
                }).start()
            stopShimmerAnimation()
        }
        bufferingView.visibility = View.GONE
    }

    private fun showControlsAfterLoad() {
        Handler(Looper.getMainLooper()).postDelayed({
            showControls()
        }, 200)
    }

    private fun showControls() {
        isControlsVisible = true
        topBar.animate().cancel()
        bottomBar.animate().cancel()
        centerControls.animate().cancel()
        topBar.alpha = 0f
        bottomBar.alpha = 0f
        centerControls.alpha = 0f
        topBar.visibility = View.VISIBLE
        bottomBar.visibility = View.VISIBLE
        centerControls.visibility = View.VISIBLE
        topBar.animate().alpha(1f).setDuration(fadeDuration).setInterpolator(AccelerateDecelerateInterpolator()).start()
        bottomBar.animate().alpha(1f).setDuration(fadeDuration).setInterpolator(AccelerateDecelerateInterpolator()).start()
        centerControls.animate().alpha(1f).setDuration(fadeDuration).setInterpolator(AccelerateDecelerateInterpolator()).start()
        syncSliderValues()
        updateBuffering(isBuffering)
        resetHideTimer()
    }

    private fun hideControls() {
        isControlsVisible = false
        topBar.animate().cancel()
        bottomBar.animate().cancel()
        centerControls.animate().cancel()
        topBar.animate().alpha(0f).setDuration(fadeDuration).setInterpolator(AccelerateDecelerateInterpolator())
            .withEndAction { topBar.visibility = View.GONE }
        bottomBar.animate().alpha(0f).setDuration(fadeDuration).setInterpolator(AccelerateDecelerateInterpolator())
            .withEndAction { bottomBar.visibility = View.GONE }
        centerControls.animate().alpha(0f).setDuration(fadeDuration).setInterpolator(AccelerateDecelerateInterpolator())
            .withEndAction { centerControls.visibility = View.GONE }
        bufferingView.visibility = View.GONE
        hideHandler.removeCallbacks(hideRunnable)
    }

    private fun toggleControls() {
        if (isControlsVisible) hideControls() else showControls()
    }

    private fun resetHideTimer() {
        hideHandler.removeCallbacks(hideRunnable)
        if (isControlsVisible) {
            player?.let { p ->
                if (p.isPlaying) {
                    hideHandler.postDelayed(hideRunnable, HIDE_DELAY)
                }
            }
        }
    }

    private val hideRunnable = Runnable { hideControls() }

    private fun subBtnTint(isOff: Boolean) {
        subtitleBtn.alpha = if (isOff) 1f else 0.4f
    }

    private fun showToastLabel(text: String) {
        val tv = TextView(this).apply {
            this.text = text
            setTextColor(Color.WHITE)
            textSize = 14f
            gravity = Gravity.CENTER
            background = GradientDrawable().apply {
                setColor(Color.parseColor("#E6141218"))
                cornerRadius = dp(12).toFloat()
                setStroke(dp(1), Color.parseColor("#26FFFFFF"))
            }
            setPadding(dp(20), dp(10), dp(20), dp(10))
        }
        val params = FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.WRAP_CONTENT,
            FrameLayout.LayoutParams.WRAP_CONTENT
        )
        params.gravity = Gravity.CENTER or Gravity.TOP
        params.topMargin = dp(120)
        root.addView(tv, params)
        tv.animate().alpha(0f).setDuration(600).setStartDelay(1200).setListener(object : AnimatorListenerAdapter() {
            override fun onAnimationEnd(animation: Animator) { root.removeView(tv) }
        }).start()
    }

    private inner class PlayerGestureListener : GestureDetector.SimpleOnGestureListener() {

        override fun onDoubleTap(e: MotionEvent): Boolean {
            player?.let { p ->
                val dur = p.duration
                if (dur > 0) {
                    val seekAmount = 10000L
                    val target = if (e.x < widthPx / 2f) {
                        p.currentPosition - seekAmount
                    } else {
                        p.currentPosition + seekAmount
                    }
                    p.seekTo(target.coerceIn(0, dur))
                    showControlsAfterLoad()
                    val direction = if (e.x < widthPx / 2f) "⏪" else "⏩"
                    showSeekFeedback(direction, seekAmount / 1000)
                }
            }
            return true
        }

        override fun onSingleTapConfirmed(e: MotionEvent): Boolean {
            toggleControls()
            return true
        }
        // onScroll intentionally removed:
        // Volume and brightness are controlled only via the side sliders shown when controls are visible.
    }

    private fun showSeekFeedback(direction: String, seconds: Long) {
        val overlay = TextView(this).apply {
            text = "$direction $seconds s"
            setTextColor(Color.WHITE)
            textSize = 24f
            gravity = Gravity.CENTER
            setBackgroundColor(Color.parseColor("#88000000"))
            setPadding(dp(24), dp(12), dp(24), dp(12))
        }
        val content = findViewById<ViewGroup>(android.R.id.content)
        val params = FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.WRAP_CONTENT,
            FrameLayout.LayoutParams.WRAP_CONTENT
        )
        params.gravity = Gravity.CENTER
        content.addView(overlay, params)

        overlay.animate()
            .alpha(0f)
            .setDuration(600)
            .setStartDelay(400)
            .setListener(object : AnimatorListenerAdapter() {
                override fun onAnimationEnd(animation: Animator) {
                    content.removeView(overlay)
                }
            })
            .start()
    }

    private fun syncSliderValues() {
        // Sync brightness slider
        val lp = window.attributes
        val bright = if (lp.screenBrightness < 0) 0.5f else lp.screenBrightness
        brightnessSeekBar.progress = (bright * 100).toInt().coerceIn(0, 100)

        // Sync volume slider
        val am = audioManager ?: return
        val maxVol = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
        val curVol = am.getStreamVolume(AudioManager.STREAM_MUSIC)
        volumeSeekBar.max = maxVol
        volumeSeekBar.progress = curVol
    }

    private fun createSideSliders() {
        // Sliders are now horizontal pills embedded in createTopBar().
        // No-op intentionally.
    }

    private fun immersiveMode() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            @Suppress("DEPRECATION")
            window.setDecorFitsSystemWindows(false)
            window.insetsController?.hide(
                WindowInsets.Type.statusBars() or WindowInsets.Type.navigationBars()
            )
            window.insetsController?.systemBarsBehavior =
                WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        } else {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility = (
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or
                View.SYSTEM_UI_FLAG_FULLSCREEN or
                View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
                View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
                View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                )
        }
    }

    private fun formatTime(ms: Long): String {
        if (ms <= 0L) return "00:00"
        val totalSec = ms / 1000
        val h = totalSec / 3600
        val m = (totalSec % 3600) / 60
        val s = totalSec % 60
        return if (h > 0) {
            String.format("%d:%02d:%02d", h, m, s)
        } else {
            String.format("%02d:%02d", m, s)
        }
    }

    private fun matchParent() = FrameLayout.LayoutParams(
        FrameLayout.LayoutParams.MATCH_PARENT,
        FrameLayout.LayoutParams.MATCH_PARENT
    )

    private val widthPx: Int get() = resources.displayMetrics.widthPixels

    private fun dp(value: Int): Int {
        return (value * resources.displayMetrics.density).roundToInt()
    }

    override fun onStop() {
        savePlaybackPosition()
        shimmerAnimator?.cancel()
        shimmerAnimator = null
        window.clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        super.onStop()
        hideHandler.removeCallbacksAndMessages(null)
        player?.stop()
        player?.release()
        player = null
        mediaSession?.isActive = false
    }

    private fun getCurrentSeasonNumber(): Int {
        if (episodesArray != null && currentEpisodeIndex >= 0 && currentEpisodeIndex < episodesArray!!.length()) {
            try {
                val ep = episodesArray!!.getJSONObject(currentEpisodeIndex)
                return ep.optInt("season", 1)
            } catch (_: Exception) {}
        }
        return intent.getIntExtra("season", 1)
    }

    private fun getCurrentEpisodeNumber(): Int {
        if (episodesArray != null && currentEpisodeIndex >= 0 && currentEpisodeIndex < episodesArray!!.length()) {
            try {
                val ep = episodesArray!!.getJSONObject(currentEpisodeIndex)
                return ep.optInt("episode", 1)
            } catch (_: Exception) {}
        }
        return intent.getIntExtra("episode", 1)
    }

    private fun getCurrentEpisodeLabel(): String {
        if (episodesArray != null && currentEpisodeIndex >= 0 && currentEpisodeIndex < episodesArray!!.length()) {
            try {
                val ep = episodesArray!!.getJSONObject(currentEpisodeIndex)
                return ep.optString("label", "")
            } catch (_: Exception) {}
        }
        return intent.getStringExtra("episodeTitle") ?: ""
    }

    private fun savePlaybackPosition() {
        val exo = player ?: return
        val pos = exo.currentPosition
        val dur = exo.duration
        val id = intent.getStringExtra("imdbId") ?: ""
        if (id.isEmpty()) return
        
        val mediaType = intent.getStringExtra("mediaType") ?: "movie"
        val posterUrl = intent.getStringExtra("posterUrl") ?: ""
        val season = getCurrentSeasonNumber()
        val episode = getCurrentEpisodeNumber()
        val episodeTitle = getCurrentEpisodeLabel()
        val videoTitle = intent.getStringExtra("title") ?: ""

        // If watched more than 95%, we'll consider it finished and not show it in continue watching anymore
        val isFinished = dur > 0 && pos > (dur * 0.95)

        val prefs = getSharedPreferences("sozo_playback_history", MODE_PRIVATE)
        val historyStr = prefs.getString("history", "[]") ?: "[]"
        val historyArr = try { JSONArray(historyStr) } catch (_: Exception) { JSONArray() }
        
        val item = JSONObject().apply {
            put("imdbId", id)
            put("mediaType", mediaType)
            put("posterUrl", posterUrl)
            put("season", season)
            put("episode", episode)
            put("episodeTitle", episodeTitle)
            put("videoTitle", videoTitle)
            put("position", pos)
            put("duration", if (dur > 0) dur else 1L)
            put("lastWatched", System.currentTimeMillis())
        }
        
        val newArr = JSONArray()
        if (!isFinished) {
            newArr.put(item)
        }
        
        for (i in 0 until historyArr.length()) {
            val old = historyArr.getJSONObject(i)
            val oldId = old.optString("imdbId")
            if (oldId == id) {
                // Remove any previous entry for this movie/show to keep only the latest one
                continue
            }
            newArr.put(old)
        }
        
        val finalArr = JSONArray()
        val limit = minOf(newArr.length(), 20)
        for (i in 0 until limit) {
            finalArr.put(newArr.get(i))
        }
        
        prefs.edit().putString("history", finalArr.toString()).apply()
    }

    override fun onResume() {
        super.onResume()
        immersiveMode()
        mediaSession?.isActive = true
    }
}
