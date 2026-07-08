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
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.Drawable
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.LayerDrawable
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
import android.widget.ProgressBar
import android.content.res.ColorStateList
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
class KotlinPlayerActivity : AppCompatActivity() {

    private var player: ExoPlayer? = null
    private lateinit var playerView: PlayerView
    private lateinit var loadingGroup: View
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
    private lateinit var rewindBtn: FrameLayout
    private lateinit var ffBtn: FrameLayout
    private lateinit var playFrame: FrameLayout
    private lateinit var errorOverlay: FrameLayout
    private lateinit var errorMessageTv: TextView
    private lateinit var errorRetryBtn: TextView
    private lateinit var errorBackBtn: TextView

    private lateinit var brightnessSliderLayout: LinearLayout
    private lateinit var volumeSliderLayout: LinearLayout
    private lateinit var brightnessSeekBar: SeekBar
    private lateinit var volumeSeekBar: SeekBar

    private lateinit var logoContainer: FrameLayout
    private lateinit var logoShadowWrapper: FrameLayout
    private lateinit var logoBottomView: ImageView
    private lateinit var gesturesBtn: ImageView
    private lateinit var episodeSubtitleTv: TextView
    private var clipDrawable: android.graphics.drawable.ClipDrawable? = null
    private var logoBitmap: android.graphics.Bitmap? = null
    private var placeholderPulseAnimator: android.animation.ObjectAnimator? = null
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

    // Controls Lock
    private var isLocked = false
    private var lockOverlayView: View? = null

    // Resume Prompt
    private var hasShownResumePrompt = false
    private var resumePromptDialog: Dialog? = null

    // Action pills row reference
    private var continueWatchingPill: View? = null
    private var continueWatchingPillMs = 0L

    // Saving and resume progress tracking properties
    private var lastSaveTime = 0L
    private var lastSavedPosition = 0L
    private var savedProgressMs = 0L
    private var gesturesEnabled = false
    private var initialScrollVolume = 0
    private var initialScrollBrightness = 0.5f

    private lateinit var gestureHudLayout: FrameLayout
    private lateinit var gestureHudIcon: ImageView
    private lateinit var gestureHudBarFill: View
    private val gestureHudHandler = Handler(Looper.getMainLooper())
    private val gestureHudFadeRunnable = Runnable {
        gestureHudLayout.animate().alpha(0f).setDuration(250).withEndAction {
            gestureHudLayout.visibility = View.GONE
        }.start()
    }

    private lateinit var centerPlayProgressBar: ProgressBar
    private lateinit var errorChangeSourceBtn: TextView
    private lateinit var errorCloseBtn: TextView

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

    private var isDolbyWarningShown = false
    private var dolbyWarningLayout: FrameLayout? = null
    private val dolbyHandler = Handler(Looper.getMainLooper())
    private var dolbyTimerCount = 8
    private var dolbyRunnable: Runnable? = null
    private var dolbyCountdownTv: TextView? = null

    private lateinit var root: FrameLayout

    private val fadeDuration = 300L

    private fun createPremiumProgressDrawable(trackColor: Int, progressColor: Int, heightDp: Int): LayerDrawable {
        val trackGrad = GradientDrawable().apply {
            setColor(trackColor)
            cornerRadius = dp(heightDp / 2).toFloat()
        }
        val progressGrad = GradientDrawable().apply {
            setColor(progressColor)
            cornerRadius = dp(heightDp / 2).toFloat()
        }
        val clipProgress = android.graphics.drawable.ClipDrawable(
            progressGrad,
            Gravity.LEFT,
            android.graphics.drawable.ClipDrawable.HORIZONTAL
        )
        val layers = arrayOf<Drawable>(trackGrad, clipProgress)
        return LayerDrawable(layers).apply {
            setId(0, android.R.id.background)
            setId(1, android.R.id.progress)
        }
    }

    private fun updateBackdropBlur(shouldBlur: Boolean) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (shouldBlur) {
                val blur = android.graphics.RenderEffect.createBlurEffect(15f, 15f, android.graphics.Shader.TileMode.CLAMP)
                playerView.setRenderEffect(blur)
            } else {
                playerView.setRenderEffect(null)
            }
        }
    }

    private fun createGestureHUD(): FrameLayout {
        val container = FrameLayout(this).apply {
            background = GradientDrawable().apply {
                setColor(Color.parseColor("#D9141218")) // rgba(20, 18, 24, 0.85)
                cornerRadius = dp(16).toFloat()
            }
            visibility = View.GONE
            alpha = 0f
        }

        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(dp(12), dp(12), dp(12), dp(12))
        }
        container.addView(content, matchParent())

        // Icon
        gestureHudIcon = ImageView(this).apply {
            setColorFilter(Color.WHITE)
        }
        content.addView(gestureHudIcon, LinearLayout.LayoutParams(dp(28), dp(28)))

        // Bar Outer
        val barOuter = FrameLayout(this).apply {
            background = GradientDrawable().apply {
                setColor(Color.parseColor("#33FFFFFF")) // rgba(255, 255, 255, 0.2)
                cornerRadius = dp(3).toFloat()
            }
        }
        val barOuterLp = LinearLayout.LayoutParams(dp(6), dp(90)).apply {
            topMargin = dp(10)
        }
        content.addView(barOuter, barOuterLp)

        // Bar Inner/Fill (aligned to bottom)
        gestureHudBarFill = View(this).apply {
            background = GradientDrawable().apply {
                setColor(Color.WHITE)
                cornerRadius = dp(3).toFloat()
            }
        }
        val fillLp = FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, 0).apply {
            gravity = Gravity.BOTTOM
        }
        barOuter.addView(gestureHudBarFill, fillLp)

        return container
    }

    private fun showGestureHUD(type: String, valRatio: Float) {
        gestureHudHandler.removeCallbacks(gestureHudFadeRunnable)
        gestureHudLayout.visibility = View.VISIBLE
        gestureHudLayout.animate().cancel()
        gestureHudLayout.alpha = 1f

        if (type == "brightness") {
            gestureHudIcon.setImageResource(R.drawable.ic_hero_sun)
        } else {
            gestureHudIcon.setImageResource(R.drawable.ic_hero_speaker_wave)
        }

        // Update fill height
        val totalHeight = dp(90)
        val fillHeight = (valRatio * totalHeight).toInt()
        val lp = gestureHudBarFill.layoutParams as FrameLayout.LayoutParams
        lp.height = fillHeight
        gestureHudBarFill.layoutParams = lp
    }

    private fun hideGestureHUD() {
        gestureHudHandler.removeCallbacks(gestureHudFadeRunnable)
        gestureHudHandler.postDelayed(gestureHudFadeRunnable, 500) // auto-fade after 500ms
    }

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

        centerControls = createCenterControls()
        root.addView(centerControls, matchParent())
        centerControls.visibility = View.GONE

        topBar = createTopBar(videoTitle)
        root.addView(topBar, matchParent())
        topBar.visibility = View.GONE

        bottomBar = createBottomBar()
        root.addView(bottomBar, matchParent())
        bottomBar.visibility = View.GONE

        isControlsVisible = false

        errorOverlay = createErrorOverlay()
        root.addView(errorOverlay, matchParent())
        errorOverlay.visibility = View.GONE

        gestureHudLayout = createGestureHUD()
        val hudParams = FrameLayout.LayoutParams(dp(70), dp(160)).apply {
            gravity = Gravity.CENTER
        }
        root.addView(gestureHudLayout, hudParams)

        createSideSliders()

        setContentView(root)
        window.decorView.post { immersiveMode() }

        val gestureDetector = GestureDetector(this, PlayerGestureListener())
        root.setOnTouchListener { v, event ->
            if (event.action == MotionEvent.ACTION_DOWN) {
                initialScrollVolume = audioManager?.getStreamVolume(AudioManager.STREAM_MUSIC) ?: 0
                initialScrollBrightness = if (window.attributes.screenBrightness < 0) 0.5f else window.attributes.screenBrightness
            }
            gestureDetector.onTouchEvent(event)
            if (event.action == MotionEvent.ACTION_UP || event.action == MotionEvent.ACTION_CANCEL) {
                hideGestureHUD()
                v.performClick()
            }
            true
        }

        if (logoUrl.isNotEmpty() || posterUrl.isNotEmpty()) {
            CoroutineScope(Dispatchers.IO).launch {
                var bitmap: android.graphics.Bitmap? = null
                var isRealLogo = false
                if (logoUrl.isNotEmpty()) {
                    if (logoUrl.endsWith(".svg")) {
                        try {
                            val urlConnection = java.net.URL(logoUrl).openConnection()
                            urlConnection.connect()
                            val input = urlConnection.getInputStream()
                            val svg = com.caverock.androidsvg.SVG.getFromInputStream(input)
                            val width = dp(160)
                            val height = dp(45)
                            val bmp = android.graphics.Bitmap.createBitmap(width, height, android.graphics.Bitmap.Config.ARGB_8888)
                            val canvas = android.graphics.Canvas(bmp)
                            svg.documentWidth = width.toFloat()
                            svg.documentHeight = height.toFloat()
                            svg.renderToCanvas(canvas)
                            bitmap = bmp
                            isRealLogo = true
                        } catch (e: Exception) {
                            Log.e("KotlinPlayerActivity", "Failed to load SVG logo: ${e.message}")
                        }
                    } else {
                        try {
                            val urlConnection = java.net.URL(logoUrl).openConnection()
                            urlConnection.connect()
                            val input = urlConnection.getInputStream()
                            bitmap = android.graphics.BitmapFactory.decodeStream(input)
                            isRealLogo = true
                        } catch (e: Exception) {
                            Log.e("KotlinPlayerActivity", "Failed to load logo image: ${e.message}")
                        }
                    }
                }
                if (bitmap == null && posterUrl.isNotEmpty()) {
                    try {
                        val urlConnection = java.net.URL(posterUrl).openConnection()
                        urlConnection.connect()
                        val input = urlConnection.getInputStream()
                        bitmap = android.graphics.BitmapFactory.decodeStream(input)
                        isRealLogo = false
                    } catch (e: Exception) {
                        Log.e("KotlinPlayerActivity", "Failed to load fallback poster: ${e.message}")
                    }
                }
                bitmap?.let { b ->
                    withContext(Dispatchers.Main) {
                        setupLogoOverlay(b)
                        if (isRealLogo && ::logoBottomView.isInitialized && ::logoShadowWrapper.isInitialized) {
                            logoBottomView.setImageBitmap(b)
                            logoShadowWrapper.visibility = View.VISIBLE
                            titleTv.visibility = View.GONE
                        }
                    }
                }
            }
        }

        if (providerName != null && mediaRef != null) {
            resolveAndPlay(providerName!!, mediaRef)
        } else if (currentUrl.isNotEmpty()) {
            loadingGroup.visibility = View.VISIBLE
            updateLoadingProgress(10)
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
        dolbyRunnable?.let { dolbyHandler.removeCallbacks(it) }
        placeholderPulseAnimator?.cancel()
        placeholderPulseAnimator = null
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
        
        root.removeView(loadingGroup)
        placeholderPulseAnimator?.cancel()
        loadingGroup = createLoadingOverlay()
        root.addView(loadingGroup, matchParent())
        loadingGroup.visibility = View.VISIBLE
        
        currentProgressPercentage = 0
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
        errorMessageTv.text = msg

        errorRetryBtn.setOnClickListener {
            errorOverlay.visibility = View.GONE
            isErrorShowing = false
            if (epProvider != null && epMediaRef != null) {
                resolveAndPlay(epProvider, epMediaRef)
            } else if (currentUrl.isNotEmpty()) {
                loadingGroup.visibility = View.VISIBLE
                currentProgressPercentage = 0
                setupExoPlayer(currentUrl, currentHeadersJson, getCurrentSubtitleUrl())
            }
        }
        
        errorChangeSourceBtn.setOnClickListener {
            errorOverlay.visibility = View.GONE
            isErrorShowing = false
            showSettingsDialog("Quality")
        }

        errorCloseBtn.setOnClickListener { finish() }
    }

    private fun createErrorOverlay(): FrameLayout {
        val container = FrameLayout(this).apply {
            setBackgroundColor(Color.parseColor("#C0000000")) // rgba(0,0,0,0.75) overlay
            isClickable = true
            isFocusable = true
        }

        // Card Container
        val card = FrameLayout(this).apply {
            background = GradientDrawable().apply {
                setColor(Color.parseColor("#121214")) // #121214 background
                cornerRadius = dp(24).toFloat()
            }
        }
        val cardParams = FrameLayout.LayoutParams(dp(480), FrameLayout.LayoutParams.WRAP_CONTENT).apply {
            gravity = Gravity.CENTER
        }
        container.addView(card, cardParams)

        // Top glow overlay inside the card
        val glowView = View(this).apply {
            background = GradientDrawable(
                GradientDrawable.Orientation.TOP_BOTTOM,
                intArrayOf(Color.parseColor("#26FF4A7D"), Color.TRANSPARENT) // rgba(255, 74, 125, 0.15) to transparent
            )
        }
        val glowLp = FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, dp(100)).apply {
            gravity = Gravity.TOP
        }
        card.addView(glowView, glowLp)

        // Content Layout inside the card (vertical linear layout)
        val contentLayout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(24), dp(24), dp(24), dp(24))
        }
        card.addView(contentLayout, matchParent())

        // Header Row: Icon (left) + Title (right)
        val headerRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        contentLayout.addView(headerRow, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT
        ))

        // Icon Container: 40x40 circular with iconBgColor (rgba(255, 74, 125, 0.1))
        val iconContainer = FrameLayout(this).apply {
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.parseColor("#1AFF4A7D")) // rgba(255, 74, 125, 0.1)
            }
        }
        val icon = ImageView(this).apply {
            setImageResource(R.drawable.ic_hero_exclamation_circle)
            setColorFilter(Color.parseColor("#FF4A7D")) // #ff4a7d rose
            setPadding(dp(9), dp(9), dp(9), dp(9))
        }
        iconContainer.addView(icon, matchParent())
        headerRow.addView(iconContainer, LinearLayout.LayoutParams(dp(40), dp(40)))

        // Title Text: "Playback Failed"
        val titleTv = TextView(this).apply {
            text = "Playback Failed"
            setTextColor(Color.WHITE)
            textSize = 18f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            setPadding(dp(12), 0, 0, 0)
        }
        headerRow.addView(titleTv, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT
        ))

        // Message Text
        errorMessageTv = TextView(this).apply {
            setTextColor(Color.parseColor("#A0A0A5")) // theme.colors.textSecondary
            textSize = 14f
            setLineSpacing(0f, 1.25f)
        }
        val msgParams = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply {
            topMargin = dp(16)
            bottomMargin = dp(16)
        }
        contentLayout.addView(errorMessageTv, msgParams)

        // Tip text
        val tipTv = TextView(this).apply {
            text = "Tip: If the stream has no audio (e.g. Dolby AC3 codec) or fails to play, use the \"Open in External Player\" option at the top left to play with VLC or MX Player."
            setTextColor(Color.parseColor("#73FFFFFF")) // rgba(255,255,255,0.45)
            textSize = 11f
            gravity = Gravity.CENTER
            setLineSpacing(0f, 1.2f)
        }
        val tipParams = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply {
            bottomMargin = dp(16)
        }
        contentLayout.addView(tipTv, tipParams)

        // Buttons row
        val btnRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
        }
        contentLayout.addView(btnRow, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT
        ))

        // Button 1: Try Again (electric blue filled)
        errorRetryBtn = TextView(this).apply {
            text = "Try Again"
            setTextColor(Color.WHITE)
            textSize = 13f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
            background = GradientDrawable().apply {
                setColor(Color.parseColor("#0047FF")) // theme.colors.accent
                cornerRadius = dp(12).toFloat()
            }
            setPadding(dp(12), dp(12), dp(12), dp(12))
        }
        addPremiumTouchAnimation(errorRetryBtn)
        btnRow.addView(errorRetryBtn, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
            rightMargin = dp(8)
        })

        // Button 2: Change Source (electric blue border, light background)
        errorChangeSourceBtn = TextView(this).apply {
            text = "Change Source"
            setTextColor(Color.parseColor("#5580FF")) // theme.colors.accentLight
            textSize = 13f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
            background = GradientDrawable().apply {
                setColor(Color.parseColor("#145580FF")) // rgba(85, 128, 255, 0.08)
                cornerRadius = dp(12).toFloat()
            }
            setPadding(dp(12), dp(12), dp(12), dp(12))
        }
        addPremiumTouchAnimation(errorChangeSourceBtn)
        btnRow.addView(errorChangeSourceBtn, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
            rightMargin = dp(8)
        })

        // Button 3: Close Player (grey border, light background)
        errorCloseBtn = TextView(this).apply {
            text = "Close Player"
            setTextColor(Color.parseColor("#A0A0A5"))
            textSize = 13f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
            background = GradientDrawable().apply {
                setColor(Color.parseColor("#0DFFFFFF")) // rgba(255, 255, 255, 0.05)
                cornerRadius = dp(12).toFloat()
            }
            setPadding(dp(12), dp(12), dp(12), dp(12))
        }
        addPremiumTouchAnimation(errorCloseBtn)
        btnRow.addView(errorCloseBtn, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))

        return container
    }

    private fun setupExoPlayer(url: String, headersJson: String, subtitleUrl: String) {
        isDolbyWarningShown = false
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
        val detailUrl = intent.getStringExtra("detailUrl") ?: ""
        val title = intent.getStringExtra("title") ?: ""
        val mediaType = intent.getStringExtra("mediaType") ?: "movie"
        val season = getCurrentSeasonNumber()
        val episode = getCurrentEpisodeNumber()

        var savedPosition = 0L
        val lookupKey = if (detailUrl.isNotEmpty()) detailUrl else if (id.isNotEmpty()) id else title
        if (lookupKey.isNotEmpty()) {
            val prefs = getSharedPreferences("sozo_playback_history", MODE_PRIVATE)
            val historyStr = prefs.getString("history", "[]") ?: "[]"
            try {
                val historyArr = JSONArray(historyStr)
                for (i in 0 until historyArr.length()) {
                    val obj = historyArr.getJSONObject(i)
                    val oldId = obj.optString("imdbId")
                    val oldDetailUrl = obj.optString("detailUrl")
                    val oldTitle = obj.optString("videoTitle")
                    
                    val isMatch = (detailUrl.isNotEmpty() && oldDetailUrl == detailUrl) ||
                                  (id.isNotEmpty() && oldId == id) ||
                                  (detailUrl.isEmpty() && id.isEmpty() && oldTitle == title)
                                  
                    if (isMatch) {
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
        savedProgressMs = savedPosition
        lastSavedPosition = 0L
        lastSaveTime = 0L

        player?.prepare()
        player?.play()

        val epTitle = getCurrentEpisodeTitle()
        updateMediaSession(epTitle)

        player?.addListener(object : Player.Listener {
            override fun onPlaybackStateChanged(playbackState: Int) {
                updateBuffering(playbackState == Player.STATE_BUFFERING)
                updateCenterPlayPauseIcon()
                if (playbackState == Player.STATE_READY) {
                    loadingGroup.animate()
                        .alpha(0f)
                        .setDuration(400)
                        .setListener(object : AnimatorListenerAdapter() {
                            override fun onAnimationEnd(animation: Animator) {
                                loadingGroup.visibility = View.GONE
                                loadingGroup.alpha = 1f
                            }
                        }).start()
                    showControlsAfterLoad()
                    updateMediaSession(getCurrentEpisodeTitle())
                    checkAndShowDolbyWarning(url)

                    // Resume prompt (if savedProgressMs found)
                    if (savedProgressMs > 10000L && !hasShownResumePrompt) {
                        checkAndShowResumePrompt(savedProgressMs)
                    }

                    // Update continue watching pill with real duration
                    val dur = player?.duration ?: 0L
                    if (savedProgressMs > 0L) updateContinueWatchingPill(savedProgressMs, dur)
                    // Update episode label in bottom bar
                    updateEpisodeLabel()
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
                if (isPlaying && !isControlsVisible) {
                    hideControls()
                }
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
                        
                        // Save progress periodically (every 5 seconds)
                        if (p.isPlaying) {
                            val now = System.currentTimeMillis()
                            if (now - lastSaveTime >= 5000L) {
                                savePlaybackPosition()
                                lastSaveTime = now
                            }
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

        logoContainer = FrameLayout(this).apply {
            val lp = FrameLayout.LayoutParams(dp(260), dp(110)).apply {
                gravity = Gravity.CENTER
            }
            layoutParams = lp
        }

        // Placeholder shimmer bar
        val placeholderBar = android.widget.FrameLayout(this).apply {
            background = GradientDrawable().apply {
                setColor(Color.parseColor("#1AFFFFFF"))
                cornerRadius = dp(10).toFloat()
            }
        }
        logoContainer.addView(placeholderBar, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        ))
        container.addView(logoContainer)

        // Shimmer pulse animation for the placeholder bar
        placeholderPulseAnimator = android.animation.ObjectAnimator.ofFloat(placeholderBar, "alpha", 0.2f, 0.7f).apply {
            duration = 800
            repeatCount = android.animation.ValueAnimator.INFINITE
            repeatMode = android.animation.ValueAnimator.REVERSE
            interpolator = android.view.animation.AccelerateDecelerateInterpolator()
            start()
        }

        return container
    }

    private fun setupLogoOverlay(bitmap: android.graphics.Bitmap) {
        placeholderPulseAnimator?.cancel()
        placeholderPulseAnimator = null
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

    }

    private fun updateLoadingProgress(pct: Int) {
        val targetPct = pct.coerceIn(0, 100)
        if (targetPct <= currentProgressPercentage && targetPct > 0) return
        currentProgressPercentage = targetPct

        runOnUiThread {
            clipDrawable?.level = currentProgressPercentage * 100
        }
    }

    // ─── Center play controls ─── exact TSX sizes: 42×42 ep, 54×54 seek, 88×88 play
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

        // Prev episode — 42×42 glass circle matching centerEpBtn in TSX
        prevEpBtn = ImageView(this).apply {
            setImageResource(R.drawable.ic_hero_backward)
            setColorFilter(Color.WHITE)
            setPadding(dp(11), dp(11), dp(11), dp(11))
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.parseColor("#D9141218"))   // rgba(20,18,24,0.85)
            }
            setOnClickListener { playPreviousEpisode() }
        }
        addPremiumTouchAnimation(prevEpBtn)
        row.addView(prevEpBtn, LinearLayout.LayoutParams(dp(42), dp(42)).apply { rightMargin = dp(16) })

        // Rewind 10s — 54×54 glass circle matching centerNavBtn in TSX
        rewindBtn = FrameLayout(this).apply {
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.parseColor("#D9141218"))
            }
            setOnClickListener {
                player?.let { p -> p.seekTo((p.currentPosition - 10000).coerceAtLeast(0)) }
                showSeekFeedback(false, 10)
                resetHideTimer()
            }
        }
        addPremiumTouchAnimation(rewindBtn)
        val rewindIcon = ImageView(this).apply {
            setImageResource(R.drawable.ic_hero_arrow_path)
            setColorFilter(Color.WHITE)
            setPadding(dp(13), dp(13), dp(13), dp(13))
            scaleX = -1f // Flipped arrow pointing backward!
        }
        rewindBtn.addView(rewindIcon, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        val rewindLabel = TextView(this).apply {
            text = "10"
            setTextColor(Color.WHITE)
            textSize = 7f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
        }
        rewindBtn.addView(rewindLabel, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        skipBackBtn = rewindIcon
        row.addView(rewindBtn, LinearLayout.LayoutParams(dp(54), dp(54)).apply { rightMargin = dp(24) })

        // Play / Pause — 88×88 glass circle matching centerPlayBtn in TSX
        playFrame = FrameLayout(this).apply {
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.parseColor("#D9141218"))
            }
            setOnClickListener {
                player?.let { p -> if (p.isPlaying) p.pause() else p.play() }
                resetHideTimer()
            }
        }
        addPremiumTouchAnimation(playFrame)
        playPauseCenter = ImageView(this).apply {
            setImageResource(R.drawable.ic_hero_play)
            setColorFilter(Color.WHITE)
            setPadding(dp(22), dp(22), dp(22), dp(22))
        }
        playFrame.addView(playPauseCenter, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        
        // Circular ProgressBar inside center play button matching buffering status
        centerPlayProgressBar = ProgressBar(this).apply {
            visibility = View.GONE
            indeterminateTintList = ColorStateList.valueOf(Color.WHITE)
        }
        playFrame.addView(centerPlayProgressBar, FrameLayout.LayoutParams(dp(44), dp(44)).apply { gravity = Gravity.CENTER })
        
        row.addView(playFrame, LinearLayout.LayoutParams(dp(88), dp(88)).apply {
            leftMargin = 0; rightMargin = 0
        })

        // Fast forward 10s — 54×54 glass circle
        ffBtn = FrameLayout(this).apply {
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.parseColor("#D9141218"))
            }
            setOnClickListener {
                player?.let { p ->
                    val dur = p.duration
                    p.seekTo((p.currentPosition + 10000).coerceAtMost(if (dur > 0) dur else p.currentPosition + 10000))
                }
                showSeekFeedback(true, 10)
                resetHideTimer()
            }
        }
        addPremiumTouchAnimation(ffBtn)
        val ffIcon = ImageView(this).apply {
            setImageResource(R.drawable.ic_hero_arrow_path)
            setColorFilter(Color.WHITE)
            setPadding(dp(13), dp(13), dp(13), dp(13))
        }
        ffBtn.addView(ffIcon, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        val ffLabel = TextView(this).apply {
            text = "10"
            setTextColor(Color.WHITE)
            textSize = 7f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
        }
        ffBtn.addView(ffLabel, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        skipForwardBtn = ffIcon
        row.addView(ffBtn, LinearLayout.LayoutParams(dp(54), dp(54)).apply { leftMargin = dp(24) })

        // Next episode — 42×42 glass circle
        nextEpBtn = ImageView(this).apply {
            setImageResource(R.drawable.ic_hero_forward)
            setColorFilter(Color.WHITE)
            setPadding(dp(11), dp(11), dp(11), dp(11))
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.parseColor("#D9141218"))
            }
            setOnClickListener { playNextEpisode() }
        }
        addPremiumTouchAnimation(nextEpBtn)
        row.addView(nextEpBtn, LinearLayout.LayoutParams(dp(42), dp(42)).apply { leftMargin = dp(16) })

        return container
    }

    // ─── Top bar: [X][↗][Lock|Aspect|Fingerprint capsule] (left) + Volume/Brightness (right) ──
    private fun createTopBar(title: String): View {
        val container = FrameLayout(this)

        // Top vignette gradient matching TSX: rgba(5,5,5,0.85) → rgba(5,5,5,0.3) → transparent
        val gradient = View(this).apply {
            background = GradientDrawable(
                GradientDrawable.Orientation.TOP_BOTTOM,
                intArrayOf(
                    Color.parseColor("#D9050505"),  // 0.85 opacity
                    Color.parseColor("#4D050505"),  // 0.3 opacity
                    Color.TRANSPARENT
                )
            )
        }
        container.addView(gradient, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, dp(120)))

        val bar = FrameLayout(this).apply { setPadding(dp(40), dp(40), dp(40), dp(18)) }
        container.addView(bar, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT
        ).apply { gravity = Gravity.TOP })

        // ── Left side: [X close] [↗ external] [capsule: Lock | AspectRatio | Gestures] ──
        val leftRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }

        // X Close — 50×50 glass circle (TSX: circleBlurBtn)
        val closeBtn = FrameLayout(this).apply {
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.parseColor("#D9141218"))    // rgba(20,18,24,0.85)
            }
            setOnClickListener { finish() }
        }
        addPremiumTouchAnimation(closeBtn)
        val closeIcon = ImageView(this).apply {
            setImageResource(R.drawable.ic_hero_xmark)
            setColorFilter(Color.WHITE)
            setPadding(dp(13), dp(13), dp(13), dp(13))
        }
        closeBtn.addView(closeIcon, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        leftRow.addView(closeBtn, LinearLayout.LayoutParams(dp(50), dp(50)).apply { rightMargin = dp(12) })

        // ↗ External Player — 50×50 glass circle (TSX: circleBlurBtn + ArrowUpRightIcon)
        val extBtn = FrameLayout(this).apply {
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.parseColor("#D9141218"))
            }
            setOnClickListener { openInExternalPlayer() }
        }
        addPremiumTouchAnimation(extBtn)
        val extIcon = ImageView(this).apply {
            setImageResource(R.drawable.ic_hero_arrow_up_right)
            setColorFilter(Color.WHITE)
            setPadding(dp(13), dp(13), dp(13), dp(13))
        }
        extBtn.addView(extIcon, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        leftRow.addView(extBtn, LinearLayout.LayoutParams(dp(50), dp(50)).apply { rightMargin = dp(12) })

        // Capsule: [🔒 Lock] [⛶ Aspect Ratio] [Fingerprint] — horizontal pill (TSX: topMenuCapsule)
        val capsule = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(8), 0, dp(8), 0)
            background = GradientDrawable().apply {
                setColor(Color.parseColor("#D9141218"))
                cornerRadius = dp(25).toFloat()
            }
        }

        // Lock button
        val lockBtn = ImageView(this).apply {
            setImageResource(R.drawable.ic_hero_lock_closed)
            setColorFilter(Color.WHITE)
            setPadding(dp(12), dp(12), dp(12), dp(12))
            setOnClickListener {
                isLocked = true
                showLockOverlay()
                resetHideTimer()
            }
        }
        addPremiumTouchAnimation(lockBtn)
        capsule.addView(lockBtn, LinearLayout.LayoutParams(dp(44), dp(44)))

        // Aspect ratio cycle button
        val aspectBtn = ImageView(this).apply {
            setImageResource(R.drawable.ic_hero_arrows_pointing_out)
            setColorFilter(Color.WHITE)
            setPadding(dp(12), dp(12), dp(12), dp(12))
            setOnClickListener {
                cycleResizeMode()
                resetHideTimer()
            }
        }
        addPremiumTouchAnimation(aspectBtn)
        capsule.addView(aspectBtn, LinearLayout.LayoutParams(dp(44), dp(44)))

        // Gestures toggle button
        gesturesBtn = ImageView(this).apply {
            setImageResource(R.drawable.ic_hero_fingerprint)
            setColorFilter(if (gesturesEnabled) Color.WHITE else Color.parseColor("#66FFFFFF")) // opacity matching TSX
            setPadding(dp(12), dp(12), dp(12), dp(12))
            setOnClickListener {
                gesturesEnabled = !gesturesEnabled
                setColorFilter(if (gesturesEnabled) Color.WHITE else Color.parseColor("#66FFFFFF"))
                showToastLabel(if (gesturesEnabled) "Swipe Gestures: On" else "Swipe Gestures: Off")
                resetHideTimer()
            }
        }
        addPremiumTouchAnimation(gesturesBtn)
        capsule.addView(gesturesBtn, LinearLayout.LayoutParams(dp(44), dp(44)))

        leftRow.addView(capsule)

        bar.addView(leftRow, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT
        ).apply { gravity = Gravity.LEFT or Gravity.CENTER_VERTICAL })

        // ── Right side: Volume + Brightness slider capsules stacked ──
        val slidersPanel = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
        }

        val am = audioManager
        val maxVol = am?.getStreamMaxVolume(AudioManager.STREAM_MUSIC) ?: 15

        // Volume slider pill (TSX: sliderCapsule)
        volumeSliderLayout = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(16), 0, dp(16), 0)
            background = GradientDrawable().apply {
                setColor(Color.parseColor("#D9141218"))
                cornerRadius = dp(22).toFloat()
            }
        }
        volumeSeekBar = SeekBar(this, null, android.R.attr.seekBarStyle).apply {
            max = maxVol
            progressDrawable = createPremiumProgressDrawable(Color.parseColor("#33FFFFFF"), Color.WHITE, 4)
            thumb = android.graphics.drawable.ColorDrawable(Color.TRANSPARENT)
            setPadding(0, dp(14), 0, dp(14)) // Touch padding
            setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
                override fun onProgressChanged(sb: SeekBar?, progress: Int, fromUser: Boolean) {
                    if (fromUser) am?.setStreamVolume(AudioManager.STREAM_MUSIC, progress, 0)
                }
                override fun onStartTrackingTouch(sb: SeekBar?) { resetHideTimer() }
                override fun onStopTrackingTouch(sb: SeekBar?) { resetHideTimer() }
            })
        }
        val volIcon = ImageView(this).apply {
            setImageResource(R.drawable.ic_hero_speaker_wave)
            setColorFilter(Color.WHITE)
            setPadding(dp(10), 0, 0, 0)
        }
        volumeSliderLayout.addView(volumeSeekBar, LinearLayout.LayoutParams(dp(110), dp(32)))
        volumeSliderLayout.addView(volIcon, LinearLayout.LayoutParams(dp(28), dp(28)))
        slidersPanel.addView(volumeSliderLayout, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, dp(44)))

        // Brightness slider pill
        brightnessSliderLayout = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(16), 0, dp(16), 0)
            background = GradientDrawable().apply {
                setColor(Color.parseColor("#D9141218"))
                cornerRadius = dp(22).toFloat()
            }
        }
        brightnessSeekBar = SeekBar(this, null, android.R.attr.seekBarStyle).apply {
            max = 100
            progressDrawable = createPremiumProgressDrawable(Color.parseColor("#33FFFFFF"), Color.WHITE, 4)
            thumb = android.graphics.drawable.ColorDrawable(Color.TRANSPARENT)
            setPadding(0, dp(14), 0, dp(14))
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
        val brightIcon = ImageView(this).apply {
            setImageResource(R.drawable.ic_hero_sun)
            setColorFilter(Color.WHITE)
            setPadding(dp(10), 0, 0, 0)
        }
        brightnessSliderLayout.addView(brightnessSeekBar, LinearLayout.LayoutParams(dp(110), dp(32)))
        brightnessSliderLayout.addView(brightIcon, LinearLayout.LayoutParams(dp(28), dp(28)))
        slidersPanel.addView(brightnessSliderLayout, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, dp(44)).apply { topMargin = dp(8) })

        bar.addView(slidersPanel, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT
        ).apply { gravity = Gravity.RIGHT or Gravity.CENTER_VERTICAL })

        // Initialize dummy fields for fields declared at class level
        titleTv = TextView(this)
        sourcesBtn = ImageView(this)
        subtitleBtn = ImageView(this)
        sleepTimerBtn = ImageView(this)

        return container
    }

    // ─── Bottom bar: exact TSX layout ─────────────────────────────────────────────
    private fun createBottomBar(): View {
        val container = FrameLayout(this)

        // Bottom vignette gradient matching TSX: transparent → rgba(5,5,5,0.3) → rgba(5,5,5,0.9)
        val gradient = View(this).apply {
            background = GradientDrawable(
                GradientDrawable.Orientation.BOTTOM_TOP,
                intArrayOf(
                    Color.parseColor("#E6050505"),  // 0.9 opacity
                    Color.parseColor("#4D050505"),  // 0.3 opacity
                    Color.TRANSPARENT
                )
            )
        }
        container.addView(gradient, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, dp(220)
        ).apply { gravity = Gravity.BOTTOM })

        val bar = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(40), 0, dp(40), dp(18))
        }
        container.addView(bar, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT
        ).apply { gravity = Gravity.BOTTOM })

        // ── Row 1: Logo/Title (left) + Settings capsule [Subtitles | Speed] (right) ──
        // This is the bottomMetaRow in TSX
        val metaRow = FrameLayout(this)

        // Left: title/logo + episode info
        val titleLogoBlock = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
        }

        val videoTitle = intent.getStringExtra("title") ?: ""
        titleTv = TextView(this).apply {
            text = videoTitle
            setTextColor(Color.WHITE)
            textSize = 26f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            setSingleLine()
            ellipsize = android.text.TextUtils.TruncateAt.END
        }
        
        logoBottomView = ImageView(this).apply {
            scaleType = ImageView.ScaleType.FIT_CENTER
        }
        
        logoShadowWrapper = FrameLayout(this).apply {
            visibility = View.GONE
            background = GradientDrawable().apply {
                setColor(Color.parseColor("#8C000000")) // rgba(0,0,0,0.55)
                cornerRadius = dp(10).toFloat()
            }
            setPadding(dp(10), dp(6), dp(10), dp(6))
        }
        logoShadowWrapper.addView(logoBottomView, FrameLayout.LayoutParams(dp(108), dp(30)))
        
        titleLogoBlock.addView(logoShadowWrapper, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply { bottomMargin = dp(4) })
        
        titleLogoBlock.addView(titleTv, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT
        ))

        // Episode label S1E2: EpisodeTitle — TSX episodeText style
        episodeSubtitleTv = TextView(this).apply {
            setTextColor(Color.parseColor("#A0A0A5"))
            textSize = 16f
        }
        updateEpisodeLabel()
        titleLogoBlock.addView(episodeSubtitleTv, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT
        ))

        metaRow.addView(titleLogoBlock, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT
        ).apply { gravity = Gravity.LEFT or Gravity.CENTER_VERTICAL })

        // Right: Settings capsule [Language icon | Speed icon] — TSX: capsuleBlur
        val settingsCapsule = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(12), 0, dp(12), 0)
            background = GradientDrawable().apply {
                setColor(Color.parseColor("#D9141218"))
                cornerRadius = dp(23).toFloat()
            }
        }

        // Subtitles icon button ("CC" text changed to LanguageIcon)
        subtitleBtn = addGlassCapsuleIconBtn(settingsCapsule, R.drawable.ic_hero_language) { showSettingsDialog("Subtitles") }

        // Speed / Settings (BoltIcon)
        sourcesBtn = addGlassCapsuleIconBtn(settingsCapsule, R.drawable.ic_hero_bolt) { showSettingsDialog("Playback Speed") }

        metaRow.addView(settingsCapsule, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.WRAP_CONTENT, dp(46)
        ).apply { gravity = Gravity.RIGHT or Gravity.CENTER_VERTICAL })

        bar.addView(metaRow, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply { bottomMargin = dp(4) })

        // ── Row 2: Scrubber row: [time] [seekbar] [duration] — TSX: scrubberRow ──
        val scrubberRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }

        currentTimeTv = TextView(this).apply {
            text = "0:00"
            setTextColor(Color.parseColor("#BFffffff"))  // rgba(255,255,255,0.75)
            textSize = 13f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
            minWidth = dp(60)
        }
        scrubberRow.addView(currentTimeTv, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT
        ))

        // SeekBar — TSX: progressBarTrack, white fill, 12dp height rounded
        seekBar = SeekBar(this, null, android.R.attr.seekBarStyle).apply {
            progressDrawable = createPremiumProgressDrawable(Color.parseColor("#33FFFFFF"), Color.WHITE, 12)
            thumb = android.graphics.drawable.ColorDrawable(Color.TRANSPARENT)
            max = 1000
            setPadding(0, dp(12), 0, dp(12))
        }
        scrubberRow.addView(seekBar, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
            leftMargin = dp(4)
            rightMargin = dp(4)
        })

        endTimeTv = TextView(this).apply {
            text = "0:00"
            setTextColor(Color.parseColor("#BFffffff"))
            textSize = 13f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
            minWidth = dp(60)
        }
        scrubberRow.addView(endTimeTv, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT
        ))

        bar.addView(scrubberRow, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply { bottomMargin = dp(4) })

        // ── Row 3: Action pills [Continue Watching] [Sources] — TSX: actionPillsRow ──
        val pillsRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }

        // Continue Watching pill (hidden until we know saved position)
        val cwPill = FrameLayout(this).apply {
            background = GradientDrawable().apply {
                setColor(Color.parseColor("#D9141218"))
                cornerRadius = dp(20).toFloat()
            }
            visibility = View.GONE
        }
        val cwBtn = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(20), dp(10), dp(20), dp(10))
        }
        val cwIcon = ImageView(this).apply {
            setImageResource(R.drawable.ic_hero_clock)
            setColorFilter(Color.WHITE)
            setPadding(0, 0, dp(6), 0)
        }
        val cwLabel = TextView(this).apply {
            text = "Continue Watching"
            setTextColor(Color.WHITE)
            textSize = 13f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            tag = "cw_label"
        }
        cwBtn.addView(cwIcon, LinearLayout.LayoutParams(dp(20), dp(20)))
        cwBtn.addView(cwLabel)
        cwPill.addView(cwBtn, FrameLayout.LayoutParams(FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT))
        addPremiumTouchAnimation(cwPill)
        continueWatchingPill = cwPill
        pillsRow.addView(cwPill, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply { rightMargin = dp(8) })

        // Sources pill — always shown
        val srcPill = FrameLayout(this).apply {
            background = GradientDrawable().apply {
                setColor(Color.parseColor("#D9141218"))
                cornerRadius = dp(20).toFloat()
            }
            setOnClickListener { showSettingsDialog("Quality") }
        }
        val srcBtn = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(20), dp(10), dp(20), dp(10))
        }
        val srcIcon = ImageView(this).apply {
            setImageResource(R.drawable.ic_hero_square_3_stack_3d)
            setColorFilter(Color.WHITE)
            setPadding(0, 0, dp(6), 0)
        }
        val srcLabel = TextView(this).apply {
            text = "Sources"
            setTextColor(Color.WHITE)
            textSize = 13f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
        }
        srcBtn.addView(srcIcon, LinearLayout.LayoutParams(dp(20), dp(20)))
        srcBtn.addView(srcLabel)
        srcPill.addView(srcBtn, FrameLayout.LayoutParams(FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT))
        addPremiumTouchAnimation(srcPill)
        pillsRow.addView(srcPill, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT))

        // Episodes pill (series only)
        val mediaType = intent.getStringExtra("mediaType") ?: "movie"
        val isSeries = (mediaType == "series" || mediaType == "show") && episodesArray != null && episodesArray!!.length() > 0
        if (isSeries) {
            val epPill = FrameLayout(this).apply {
                background = GradientDrawable().apply {
                    setColor(Color.parseColor("#D9141218"))
                    cornerRadius = dp(20).toFloat()
                }
                setOnClickListener { showEpisodesDialog() }
            }
            val epBtn = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setPadding(dp(20), dp(10), dp(20), dp(10))
            }
            val epIcon = ImageView(this).apply {
                setImageResource(R.drawable.ic_hero_square_3_stack_3d)
                setColorFilter(Color.WHITE)
                setPadding(0, 0, dp(6), 0)
            }
            val epLabel = TextView(this).apply {
                text = "Episodes"
                setTextColor(Color.WHITE)
                textSize = 13f
                typeface = android.graphics.Typeface.DEFAULT_BOLD
            }
            epBtn.addView(epIcon, LinearLayout.LayoutParams(dp(20), dp(20)))
            epBtn.addView(epLabel)
            epPill.addView(epBtn, FrameLayout.LayoutParams(FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT))
            addPremiumTouchAnimation(epPill)
            pillsRow.addView(epPill, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { leftMargin = dp(8) })
        }

        bar.addView(pillsRow, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT
        ))

        return container
    }

    private fun addGlassCapsuleIconBtn(parent: LinearLayout, iconRes: Int, onClick: () -> Unit): View {
        val btn = ImageView(this).apply {
            setImageResource(iconRes)
            setColorFilter(Color.WHITE)
            setPadding(dp(12), dp(12), dp(12), dp(12))
            setOnClickListener { onClick() }
        }
        addPremiumTouchAnimation(btn)
        parent.addView(btn, LinearLayout.LayoutParams(dp(46), dp(46)))
        return btn
    }

    private fun updateEpisodeLabel() {
        if (!::episodeSubtitleTv.isInitialized) return
        val mediaType = intent.getStringExtra("mediaType") ?: "movie"
        val isSeries = (mediaType == "series" || mediaType == "show")
        if (isSeries) {
            val s = getCurrentSeasonNumber()
            val e = getCurrentEpisodeNumber()
            val epTitle = getCurrentEpisodeLabel()
            val text = "S${s}E${e}" + if (epTitle.isNotEmpty()) ": $epTitle" else ""
            episodeSubtitleTv.text = text
            episodeSubtitleTv.visibility = View.VISIBLE
        } else {
            episodeSubtitleTv.visibility = View.GONE
        }
    }

    private fun updateContinueWatchingPill(savedMs: Long, durationMs: Long) {
        val pill = continueWatchingPill ?: return
        // Show pill only if savedMs > 10s and not within last 15s of video
        val showPill = savedMs > 10000L && durationMs > 0L && savedMs < (durationMs - 15000L)
        continueWatchingPillMs = savedMs
        if (showPill) {
            val label = pill.findViewWithTag<TextView>("cw_label")
            label?.text = "Continue Watching (${formatTime(savedMs)})"
            pill.visibility = View.VISIBLE
            pill.setOnClickListener {
                player?.seekTo(savedMs)
                resetHideTimer()
            }
        } else {
            pill.visibility = View.GONE
        }
    }

    private fun createGlassIconButton(iconRes: Int, onClick: () -> Unit): ImageView {
        val btn = ImageView(this).apply {
            setImageResource(iconRes)
            setColorFilter(Color.WHITE)
            setPadding(dp(7), dp(7), dp(7), dp(7))
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.parseColor("#66100E14"))
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
        EpisodesDialog().apply {
            setOnShowListener { updateBackdropBlur(true) }
            setOnDismissListener { if (!isControlsVisible) updateBackdropBlur(false) }
        }.show()
        resetHideTimer()
    }

    private inner class PlayerSettingsDialog(private val startCategory: String = "Quality") : Dialog(this@KotlinPlayerActivity, android.R.style.Theme_DeviceDefault_Dialog) {
        private var activeCategory = startCategory
        private lateinit var optionsContainer: LinearLayout
        private lateinit var categoryList: LinearLayout
        private lateinit var titleTv: TextView

        override fun onCreate(savedInstanceState: Bundle?) {
            super.onCreate(savedInstanceState)
            requestWindowFeature(android.view.Window.FEATURE_NO_TITLE)

            setOnShowListener {
                updateBackdropBlur(true)
            }
            setOnDismissListener {
                if (!isControlsVisible) updateBackdropBlur(false)
            }

            val dialogWindow = window
            dialogWindow?.setBackgroundDrawable(GradientDrawable().apply {
                setColor(Color.parseColor("#F2141218"))
                cornerRadius = dp(24).toFloat()
            })
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                dialogWindow?.addFlags(android.view.WindowManager.LayoutParams.FLAG_BLUR_BEHIND)
                dialogWindow?.attributes?.let { attrs ->
                    attrs.blurBehindRadius = dp(20)
                    dialogWindow.attributes = attrs
                }
            }

            val root = LinearLayout(this@KotlinPlayerActivity).apply {
                orientation = LinearLayout.HORIZONTAL
            }
            setContentView(root)
            dialogWindow?.setLayout(dp(540), dp(320))

            categoryList = LinearLayout(this@KotlinPlayerActivity).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER_HORIZONTAL
                setPadding(0, dp(16), 0, dp(16))
                background = GradientDrawable().apply {
                    setColor(Color.parseColor("#1A000000"))
                }
            }
            root.addView(categoryList, LinearLayout.LayoutParams(dp(180), LinearLayout.LayoutParams.MATCH_PARENT))

            val divider = View(this@KotlinPlayerActivity).apply {
                setBackgroundColor(Color.parseColor("#14FFFFFF"))
            }
            root.addView(divider, LinearLayout.LayoutParams(dp(1), LinearLayout.LayoutParams.MATCH_PARENT))

            val rightLayout = LinearLayout(this@KotlinPlayerActivity).apply {
                orientation = LinearLayout.VERTICAL
            }
            root.addView(rightLayout, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.MATCH_PARENT, 1f))

            val headerRow = LinearLayout(this@KotlinPlayerActivity).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setPadding(dp(20), dp(14), dp(20), dp(4))
            }
            
            titleTv = TextView(this@KotlinPlayerActivity).apply {
                text = activeCategory.uppercase()
                setTextColor(Color.WHITE)
                textSize = 13f
                typeface = android.graphics.Typeface.DEFAULT_BOLD
            }
            headerRow.addView(titleTv, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
            
            val closeBtn = ImageView(this@KotlinPlayerActivity).apply {
                setImageResource(R.drawable.ic_hero_xmark)
                setColorFilter(Color.WHITE)
                setPadding(dp(4), dp(4), dp(4), dp(4))
                setOnClickListener { dismiss() }
            }
            headerRow.addView(closeBtn, LinearLayout.LayoutParams(dp(24), dp(24)))
            rightLayout.addView(headerRow)

            val scrollView = android.widget.ScrollView(this@KotlinPlayerActivity).apply {
                isFillViewport = true
            }
            optionsContainer = LinearLayout(this@KotlinPlayerActivity).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(dp(20), dp(8), dp(20), dp(16))
            }
            scrollView.addView(optionsContainer, FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.WRAP_CONTENT
            ))
            rightLayout.addView(scrollView, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))

            refreshCategories()
            showCategoryOptions()
        }

        private fun refreshCategories() {
            categoryList.removeAllViews()
            val categories = mutableListOf("Quality", "Subtitles", "Sleep Timer", "Playback Speed", "Swipe Gestures")
            
            categories.forEach { cat ->
                val iconRes = when (cat) {
                    "Quality" -> R.drawable.ic_hero_square_3_stack_3d
                    "Subtitles" -> R.drawable.ic_hero_language
                    "Sleep Timer" -> R.drawable.ic_hero_clock
                    "Playback Speed" -> R.drawable.ic_hero_bolt
                    "Swipe Gestures" -> R.drawable.ic_hero_fingerprint
                    else -> R.drawable.ic_hero_bolt
                }
                
                val tabRow = LinearLayout(this@KotlinPlayerActivity).apply {
                    orientation = LinearLayout.HORIZONTAL
                    gravity = Gravity.CENTER_VERTICAL
                    setPadding(dp(14), dp(12), dp(14), dp(12))
                    background = if (activeCategory == cat) GradientDrawable().apply {
                        setColor(Color.parseColor("#1A0047FF"))
                        cornerRadius = dp(12).toFloat()
                    } else null
                    setOnClickListener {
                        activeCategory = cat
                        titleTv.text = cat.uppercase()
                        refreshCategories()
                        showCategoryOptions()
                    }
                }
                addPremiumTouchAnimation(tabRow)
                
                val iconView = ImageView(this@KotlinPlayerActivity).apply {
                    setImageResource(iconRes)
                    setColorFilter(if (activeCategory == cat) Color.parseColor("#0047FF") else Color.parseColor("#8E8D92"))
                }
                tabRow.addView(iconView, LinearLayout.LayoutParams(dp(16), dp(16)))
                
                val titleTvTab = TextView(this@KotlinPlayerActivity).apply {
                    text = cat.uppercase()
                    setTextColor(if (activeCategory == cat) Color.parseColor("#0047FF") else Color.parseColor("#8E8D92"))
                    textSize = 10f
                    typeface = android.graphics.Typeface.DEFAULT_BOLD
                }
                val titleLp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
                    leftMargin = dp(10)
                }
                tabRow.addView(titleTvTab, titleLp)

                categoryList.addView(tabRow, LinearLayout.LayoutParams(
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
                "Swipe Gestures" -> populateSwipeGesturesOptions()
            }
        }

        private fun populateQualityOptions() {
            val sources = allSources
            if (sources == null || sources.length() == 0) {
                val emptyTv = TextView(this@KotlinPlayerActivity).apply {
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

        private fun populateSwipeGesturesOptions() {
            val gestureOpts = arrayOf(true, false)
            gestureOpts.forEach { opt ->
                val label = if (opt) "On" else "Off"
                val isSelected = (gesturesEnabled == opt)

                val row = createOptionRow(label, isSelected) {
                    gesturesEnabled = opt
                    updateGesturesButtonState()
                    showToastLabel("Swipe Gestures: $label")
                    dismiss()
                }
                optionsContainer.addView(row)
            }
        }

        private fun createOptionRow(text: String, isSelected: Boolean, onClick: () -> Unit): LinearLayout {
            val row = LinearLayout(this@KotlinPlayerActivity).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setPadding(dp(12), dp(10), dp(12), dp(10))
                background = if (isSelected) GradientDrawable().apply {
                    setColor(Color.parseColor("#1A0047FF"))
                    cornerRadius = dp(12).toFloat()
                } else null
                setOnClickListener { onClick() }
            }
            addPremiumTouchAnimation(row)

            val tv = TextView(this@KotlinPlayerActivity).apply {
                this.text = text
                setTextColor(if (isSelected) Color.parseColor("#0047FF") else Color.WHITE)
                textSize = 14f
                typeface = if (isSelected) android.graphics.Typeface.DEFAULT_BOLD else android.graphics.Typeface.DEFAULT
            }
            row.addView(tv, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))

            if (isSelected) {
                val check = ImageView(this@KotlinPlayerActivity).apply {
                    setImageResource(R.drawable.ic_hero_check)
                    setColorFilter(Color.parseColor("#0047FF"))
                }
                row.addView(check, LinearLayout.LayoutParams(dp(16), dp(16)))
            }

            return row
        }
    }

    private fun updateGesturesButtonState() {
        if (::gesturesBtn.isInitialized) {
            gesturesBtn.setColorFilter(if (gesturesEnabled) Color.WHITE else Color.parseColor("#66FFFFFF"))
        }
    }

    private inner class EpisodesDialog : Dialog(this@KotlinPlayerActivity, android.R.style.Theme_DeviceDefault_Dialog) {
        override fun onCreate(savedInstanceState: Bundle?) {
            super.onCreate(savedInstanceState)
            requestWindowFeature(android.view.Window.FEATURE_NO_TITLE)

            val dialogWindow = window
            dialogWindow?.setBackgroundDrawable(GradientDrawable().apply {
                setColor(Color.parseColor("#F20A0A0E"))
                cornerRadius = dp(24).toFloat()
            })
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                dialogWindow?.addFlags(android.view.WindowManager.LayoutParams.FLAG_BLUR_BEHIND)
                dialogWindow?.attributes?.let { attrs ->
                    attrs.blurBehindRadius = dp(20)
                    dialogWindow.attributes = attrs
                }
            }

            val root = LinearLayout(this@KotlinPlayerActivity).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(dp(20), dp(16), dp(20), dp(16))
            }
            setContentView(root)
            dialogWindow?.setLayout(dp(540), dp(340))

            val headerRow = LinearLayout(this@KotlinPlayerActivity).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setPadding(0, 0, 0, dp(12))
            }

            val header = TextView(this@KotlinPlayerActivity).apply {
                text = "SELECT EPISODE"
                setTextColor(Color.WHITE)
                textSize = 13f
                typeface = android.graphics.Typeface.DEFAULT_BOLD
            }
            headerRow.addView(header, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))

            val closeBtn = ImageView(this@KotlinPlayerActivity).apply {
                setImageResource(R.drawable.ic_hero_xmark)
                setColorFilter(Color.WHITE)
                setPadding(dp(4), dp(4), dp(4), dp(4))
                setOnClickListener { dismiss() }
            }
            headerRow.addView(closeBtn, LinearLayout.LayoutParams(dp(24), dp(24)))
            root.addView(headerRow)

            val divider = View(this@KotlinPlayerActivity).apply {
                setBackgroundColor(Color.parseColor("#14FFFFFF"))
            }
            root.addView(divider, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(1)).apply {
                bottomMargin = dp(8)
            })

            val scrollView = android.widget.ScrollView(this@KotlinPlayerActivity).apply {
                isFillViewport = true
            }
            val listContainer = LinearLayout(this@KotlinPlayerActivity).apply {
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
                    val epNum = ep.optInt("episode", i + 1)
                    val label = ep.optString("label", "")
                    val imageUrl = ep.optString("image", "")
                    val overview = ep.optString("overview", "")
                    val isSelected = (i == currentEpisodeIndex)

                    val row = LinearLayout(this@KotlinPlayerActivity).apply {
                        orientation = LinearLayout.HORIZONTAL
                        gravity = Gravity.CENTER_VERTICAL
                        setPadding(dp(8), dp(8), dp(8), dp(8))
                        background = if (isSelected) GradientDrawable().apply {
                            setColor(Color.parseColor("#1A0047FF"))
                            cornerRadius = dp(16).toFloat()
                        } else GradientDrawable().apply {
                            setColor(Color.parseColor("#0F141218"))
                            cornerRadius = dp(16).toFloat()
                        }
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

                    val thumbContainer = FrameLayout(this@KotlinPlayerActivity).apply {
                        background = GradientDrawable().apply {
                            setColor(Color.parseColor("#14FFFFFF"))
                            cornerRadius = dp(10).toFloat()
                        }
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                            clipToOutline = true
                        }
                    }
                    val thumbImageView = ImageView(this@KotlinPlayerActivity).apply {
                        scaleType = ImageView.ScaleType.CENTER_CROP
                    }
                    thumbContainer.addView(thumbImageView, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
                    
                    if (imageUrl.isNotEmpty()) {
                        loadThumbnailAsync(imageUrl, thumbImageView)
                    }
                    
                    if (isSelected) {
                        val playOverlay = ImageView(this@KotlinPlayerActivity).apply {
                            setImageResource(R.drawable.ic_hero_play)
                            setColorFilter(Color.parseColor("#0047FF"))
                            setPadding(dp(12), dp(12), dp(12), dp(12))
                            background = GradientDrawable().apply {
                                setColor(Color.parseColor("#99000000"))
                                shape = GradientDrawable.OVAL
                            }
                        }
                        val overlayLp = FrameLayout.LayoutParams(dp(32), dp(32)).apply {
                            gravity = Gravity.CENTER
                        }
                        thumbContainer.addView(playOverlay, overlayLp)
                    }

                    val thumbLp = LinearLayout.LayoutParams(dp(96), dp(54)).apply {
                        rightMargin = dp(12)
                    }
                    row.addView(thumbContainer, thumbLp)

                    val textContainer = LinearLayout(this@KotlinPlayerActivity).apply {
                        orientation = LinearLayout.VERTICAL
                    }
                    
                    val metaTv = TextView(this@KotlinPlayerActivity).apply {
                        text = "EPISODE ${String.format("%02d", epNum)}"
                        setTextColor(if (isSelected) Color.parseColor("#0047FF") else Color.parseColor("#8E8D92"))
                        textSize = 10f
                        typeface = android.graphics.Typeface.DEFAULT_BOLD
                    }
                    textContainer.addView(metaTv)

                    val titleTv = TextView(this@KotlinPlayerActivity).apply {
                        text = if (label.isNotEmpty()) label else "Episode $epNum"
                        setTextColor(if (isSelected) Color.parseColor("#0047FF") else Color.WHITE)
                        textSize = 13f
                        typeface = android.graphics.Typeface.DEFAULT_BOLD
                        maxLines = 1
                        ellipsize = android.text.TextUtils.TruncateAt.END
                    }
                    textContainer.addView(titleTv, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
                        topMargin = dp(2)
                    })

                    if (overview.isNotEmpty()) {
                        val descTv = TextView(this@KotlinPlayerActivity).apply {
                            text = overview
                            setTextColor(Color.parseColor("#8E8D92"))
                            textSize = 11f
                            maxLines = 2
                            ellipsize = android.text.TextUtils.TruncateAt.END
                        }
                        textContainer.addView(descTv, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
                            topMargin = dp(2)
                        })
                    }

                    row.addView(textContainer, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))

                    val rowLp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
                        bottomMargin = dp(8)
                    }
                    listContainer.addView(row, rowLp)
                }
            }
        }
    }

    private fun loadThumbnailAsync(url: String, imageView: ImageView) {
        if (url.isEmpty()) return
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val conn = java.net.URL(url).openConnection()
                conn.connect()
                val input = conn.getInputStream()
                val bmp = android.graphics.BitmapFactory.decodeStream(input)
                withContext(Dispatchers.Main) {
                    imageView.setImageBitmap(bmp)
                }
            } catch (e: Exception) {
                Log.e("KotlinPlayerActivity", "Failed to load thumbnail: ${e.message}")
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
        hasShownResumePrompt = false  // Allow resume prompt for new source/episode
        resumePromptDialog?.dismiss()
        resumePromptDialog = null
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
                if (p.isPlaying) R.drawable.ic_hero_pause
                else R.drawable.ic_hero_play
            )
        }
    }

    private fun updateBuffering(buffering: Boolean) {
        isBuffering = buffering
        if (buffering) {
            centerPlayProgressBar.visibility = View.VISIBLE
            playPauseCenter.visibility = View.INVISIBLE
            
            val isInitialLoad = (player?.currentPosition ?: 0L) < 1000L
            if (isInitialLoad) {
                if (loadingGroup.visibility != View.VISIBLE) {
                    loadingGroup.alpha = 1f
                    loadingGroup.visibility = View.VISIBLE
                }
            } else {
                // Mid-play buffer stall: show logo width loader overlay if controls are not visible
                if (!isControlsVisible) {
                    if (loadingGroup.visibility != View.VISIBLE) {
                        loadingGroup.alpha = 1f
                        loadingGroup.visibility = View.VISIBLE
                    }
                } else {
                    loadingGroup.visibility = View.GONE
                }
            }
        } else {
            centerPlayProgressBar.visibility = View.GONE
            playPauseCenter.visibility = View.VISIBLE
            
            // Buffering ended — hide overlay (STATE_READY will also hide it)
            if (loadingGroup.visibility == View.VISIBLE) {
                loadingGroup.animate()
                    .alpha(0f)
                    .setDuration(350)
                    .setListener(object : AnimatorListenerAdapter() {
                        override fun onAnimationEnd(animation: Animator) {
                            loadingGroup.visibility = View.GONE
                            loadingGroup.alpha = 1f
                        }
                    }).start()
            }
        }
    }

    private fun showControlsAfterLoad() {
        Handler(Looper.getMainLooper()).postDelayed({
            showControls()
        }, 200)
    }

    private fun showControls() {
        isControlsVisible = true
        updateBackdropBlur(true)
        topBar.animate().cancel()
        bottomBar.animate().cancel()
        centerControls.animate().cancel()
        topBar.alpha = 0f
        bottomBar.alpha = 0f
        centerControls.alpha = 0f
        topBar.visibility = View.VISIBLE
        bottomBar.visibility = View.VISIBLE
        
        prevEpBtn.visibility = View.VISIBLE
        rewindBtn.visibility = View.VISIBLE
        playFrame.visibility = View.VISIBLE
        ffBtn.visibility = View.VISIBLE
        nextEpBtn.visibility = View.VISIBLE
        updateEpisodeButtonState()
        
        centerControls.visibility = View.VISIBLE
        topBar.animate().alpha(1f).setDuration(fadeDuration).setInterpolator(AccelerateDecelerateInterpolator()).start()
        bottomBar.animate().alpha(1f).setDuration(fadeDuration).setInterpolator(AccelerateDecelerateInterpolator()).start()
        centerControls.animate().alpha(1f).setDuration(fadeDuration).setInterpolator(AccelerateDecelerateInterpolator()).start()
        syncSliderValues()
        loadingGroup.visibility = View.GONE
        updateBuffering(isBuffering)
        resetHideTimer()
    }

    private fun hideControls() {
        isControlsVisible = false
        updateBackdropBlur(false)
        topBar.animate().cancel()
        bottomBar.animate().cancel()
        centerControls.animate().cancel()
        topBar.animate().alpha(0f).setDuration(fadeDuration).setInterpolator(AccelerateDecelerateInterpolator())
            .withEndAction { topBar.visibility = View.GONE }
        bottomBar.animate().alpha(0f).setDuration(fadeDuration).setInterpolator(AccelerateDecelerateInterpolator())
            .withEndAction { bottomBar.visibility = View.GONE }
            
        val isPaused = player?.playWhenReady == false
        if (isPaused) {
            centerControls.visibility = View.VISIBLE
            centerControls.alpha = 1f
            prevEpBtn.visibility = View.GONE
            rewindBtn.visibility = View.GONE
            ffBtn.visibility = View.GONE
            nextEpBtn.visibility = View.GONE
            playFrame.visibility = View.VISIBLE
        } else {
            centerControls.animate().alpha(0f).setDuration(fadeDuration).setInterpolator(AccelerateDecelerateInterpolator())
                .withEndAction { centerControls.visibility = View.GONE }
        }
        loadingGroup.visibility = if (isBuffering) View.VISIBLE else View.GONE
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
            if (loadingGroup.visibility == View.VISIBLE) return true
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
                    val isForward = e.x >= widthPx / 2f
                    showSeekFeedback(isForward, seekAmount / 1000)
                }
            }
            return true
        }

        override fun onSingleTapConfirmed(e: MotionEvent): Boolean {
            if (loadingGroup.visibility == View.VISIBLE) return true
            toggleControls()
            return true
        }

        override fun onScroll(e1: MotionEvent?, e2: MotionEvent, distanceX: Float, distanceY: Float): Boolean {
            if (loadingGroup.visibility == View.VISIBLE) return false
            if (!gesturesEnabled) return false
            if (e1 == null) return false

            val deltaY = e1.y - e2.y
            val ratio = deltaY / heightPx

            if (e1.x < widthPx / 2f) {
                // Left half: Brightness
                val nextBright = (initialScrollBrightness + ratio).coerceIn(0.01f, 1.0f)
                val wlp = window.attributes
                wlp.screenBrightness = nextBright
                window.attributes = wlp
                lastBrightness = nextBright
                showGestureHUD("brightness", nextBright)
                syncSliderValues()
            } else {
                // Right half: Volume
                val am = audioManager
                if (am != null) {
                    val maxVol = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
                    val deltaVol = (ratio * maxVol).toInt()
                    val nextVol = (initialScrollVolume + deltaVol).coerceIn(0, maxVol)
                    am.setStreamVolume(AudioManager.STREAM_MUSIC, nextVol, 0)
                    showGestureHUD("volume", nextVol.toFloat() / maxVol)
                    syncSliderValues()
                }
            }
            return true
        }
    }

    private fun showSeekFeedback(isForward: Boolean, seconds: Long) {
        // Exact TSX glass-pill style: dark glass card centered
        val overlay = TextView(this).apply {
            text = if (isForward) "+${seconds}s" else "-${seconds}s"
            setTextColor(Color.WHITE)
            textSize = 22f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
            background = GradientDrawable().apply {
                setColor(Color.parseColor("#E6141218"))   // rgba(20,18,24,0.9)
                cornerRadius = dp(16).toFloat()
            }
            setPadding(dp(28), dp(14), dp(28), dp(14))
            elevation = dp(8).toFloat()
        }
        val params = FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.WRAP_CONTENT,
            FrameLayout.LayoutParams.WRAP_CONTENT
        )
        params.gravity = Gravity.CENTER
        root.addView(overlay, params)

        overlay.animate()
            .alpha(0f)
            .setDuration(500)
            .setStartDelay(500)
            .setListener(object : AnimatorListenerAdapter() {
                override fun onAnimationEnd(animation: Animator) {
                    root.removeView(overlay)
                }
            })
            .start()
    }

    // ── Lock overlay: shows only the unlock button, hides all controls ──
    private fun showLockOverlay() {
        hideControls()
        val overlay = FrameLayout(this).apply {
            isClickable = true
            isFocusable = true
            setOnClickListener { /* consume taps */ }
        }
        // Unlock button — same glass circle as TSX lockBtn, left-center
        val unlockBtn = FrameLayout(this).apply {
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.parseColor("#D9141218"))
            }
            setOnClickListener {
                isLocked = false
                overlay.animate().alpha(0f).setDuration(200).setListener(object : AnimatorListenerAdapter() {
                    override fun onAnimationEnd(animation: Animator) {
                        root.removeView(overlay)
                        lockOverlayView = null
                    }
                }).start()
                showControls()
            }
        }
        addPremiumTouchAnimation(unlockBtn)
        val unlockIcon = ImageView(this).apply {
            setImageResource(R.drawable.ic_hero_lock_open)
            setColorFilter(Color.parseColor("#0047FF")) // Accent light color
            setPadding(dp(18), dp(18), dp(18), dp(18))
        }
        unlockBtn.addView(unlockIcon, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        val unlockLp = FrameLayout.LayoutParams(dp(60), dp(60)).apply {
            gravity = Gravity.LEFT or Gravity.CENTER_VERTICAL
            leftMargin = dp(32)
        }
        overlay.addView(unlockBtn, unlockLp)
        root.addView(overlay, matchParent())
        lockOverlayView = overlay
    }

    // ── External Player intent ──
    private fun openInExternalPlayer() {
        try {
            val videoTitle = intent.getStringExtra("title") ?: "Video"
            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(Uri.parse(currentUrl), "video/*")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                
                // Pass headers as extras that VLC/MX Player understand
                val headers = try { JSONObject(currentHeadersJson) } catch (_: Exception) { JSONObject() }
                val headersList = mutableListOf<String>()
                headers.keys().forEach { key ->
                    val value = headers.optString(key)
                    if (value.isNotEmpty()) {
                        putExtra(key, value)
                        headersList.add(key)
                        headersList.add(value)
                    }
                }
                
                if (headersList.isNotEmpty()) {
                    putExtra("headers", headersList.toTypedArray())
                }
                
                putExtra("title", videoTitle)
                putExtra("decode_mode", 2.toByte()) // 2 = H/W+ decoder in MX Player
                
                val activeSubUrl = getCurrentSubtitleUrl()
                if (activeSubUrl.isNotEmpty()) {
                    val subUri = Uri.parse(activeSubUrl)
                    putExtra("subs", arrayOf<android.os.Parcelable>(subUri))
                    putExtra("subs.name", arrayOf("Active Subtitle"))
                    putExtra("subtitles", activeSubUrl)
                    putExtra("subtitles_location", activeSubUrl)
                }
            }
            startActivity(Intent.createChooser(intent, "Open with…"))
        } catch (e: Exception) {
            showToastLabel("No external player found")
        }
    }

    // ── Resume Prompt Dialog — shown when saved position > 10s ──
    private fun checkAndShowResumePrompt(savedMs: Long) {
        if (hasShownResumePrompt || savedMs <= 10000L) return
        hasShownResumePrompt = true
        player?.pause()
        updateBackdropBlur(true)

        val dialog = Dialog(this, android.R.style.Theme_Black_NoTitleBar_Fullscreen)
        dialog.requestWindowFeature(android.view.Window.FEATURE_NO_TITLE)
        dialog.window?.setBackgroundDrawable(android.graphics.drawable.ColorDrawable(Color.parseColor("#C0000000"))) // 75% translucent overlay
        dialog.setOnDismissListener {
            if (!isControlsVisible) updateBackdropBlur(false)
        }

        val card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(dp(32), dp(28), dp(32), dp(28))
            background = GradientDrawable().apply {
                setColor(Color.parseColor("#F2100E14"))
                cornerRadius = dp(24).toFloat()
            }
        }

        val titleTvD = TextView(this).apply {
            text = "Resume Playback?"
            setTextColor(Color.WHITE)
            textSize = 20f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
        }
        card.addView(titleTvD, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))

        val subtitle = TextView(this).apply {
            text = "You watched up to ${formatTime(savedMs)}. Would you like to continue from where you left?"
            setTextColor(Color.parseColor("#A0A0A5"))
            textSize = 14f
            gravity = Gravity.CENTER
            setPadding(dp(10), dp(14), dp(10), dp(28))
        }
        card.addView(subtitle, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))

        val btnRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
        }

        val resumeBtn = TextView(this).apply {
            text = "Resume"
            setTextColor(Color.WHITE)
            textSize = 14f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
            background = GradientDrawable().apply {
                setColor(Color.parseColor("#0047FF"))
                cornerRadius = dp(16).toFloat()
            }
            setPadding(dp(28), dp(14), dp(28), dp(14))
            setOnClickListener {
                player?.seekTo(savedMs)
                player?.play()
                dialog.dismiss()
            }
        }
        addPremiumTouchAnimation(resumeBtn)
        btnRow.addView(resumeBtn, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { rightMargin = dp(16) })

        val freshBtn = TextView(this).apply {
            text = "Start Fresh"
            setTextColor(Color.WHITE)
            textSize = 14f
            gravity = Gravity.CENTER
            background = GradientDrawable().apply {
                setColor(Color.parseColor("#14FFFFFF"))
                cornerRadius = dp(16).toFloat()
            }
            setPadding(dp(28), dp(14), dp(28), dp(14))
            setOnClickListener {
                player?.seekTo(0L)
                player?.play()
                dialog.dismiss()
            }
        }
        addPremiumTouchAnimation(freshBtn)
        btnRow.addView(freshBtn)

        card.addView(btnRow)

        val outerFrame = FrameLayout(this).apply { setBackgroundColor(Color.TRANSPARENT) }
        val cardLp = FrameLayout.LayoutParams(dp(440), FrameLayout.LayoutParams.WRAP_CONTENT).apply { gravity = Gravity.CENTER }
        outerFrame.addView(card, cardLp)

        dialog.setContentView(outerFrame)
        dialog.window?.setLayout(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT)
        dialog.setCanceledOnTouchOutside(false)
        resumePromptDialog = dialog
        dialog.show()
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
    private val heightPx: Int get() = resources.displayMetrics.heightPixels

    private fun dp(value: Int): Int {
        return (value * resources.displayMetrics.density).roundToInt()
    }

    override fun onStop() {
        savePlaybackPosition()
        window.clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        super.onStop()
        hideHandler.removeCallbacksAndMessages(null)
        dolbyRunnable?.let { dolbyHandler.removeCallbacks(it) }
        if (dolbyWarningLayout != null) {
            root.removeView(dolbyWarningLayout)
            dolbyWarningLayout = null
        }
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
        val detailUrl = intent.getStringExtra("detailUrl") ?: ""
        val provider = intent.getStringExtra("provider") ?: "Cinemeta"
        val videoTitle = intent.getStringExtra("title") ?: ""
        if (id.isEmpty() && detailUrl.isEmpty() && videoTitle.isEmpty()) return
        
        val mediaType = intent.getStringExtra("mediaType") ?: "movie"
        val posterUrl = intent.getStringExtra("posterUrl") ?: ""
        val season = getCurrentSeasonNumber()
        val episode = getCurrentEpisodeNumber()
        val episodeTitle = getCurrentEpisodeLabel()

        // If watched more than 95%, we'll consider it finished and not show it in continue watching anymore
        val isFinished = dur > 0 && pos > (dur * 0.95)

        val prefs = getSharedPreferences("sozo_playback_history", MODE_PRIVATE)
        val historyStr = prefs.getString("history", "[]") ?: "[]"
        val historyArr = try { JSONArray(historyStr) } catch (_: Exception) { JSONArray() }
        
        val item = JSONObject().apply {
            put("imdbId", id)
            put("detailUrl", detailUrl)
            put("provider", provider)
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
            val oldDetailUrl = old.optString("detailUrl")
            val oldTitle = old.optString("videoTitle")
            
            val isDuplicate = (detailUrl.isNotEmpty() && oldDetailUrl == detailUrl) ||
                              (id.isNotEmpty() && oldId == id) ||
                              (detailUrl.isEmpty() && id.isEmpty() && oldTitle == videoTitle)
            if (isDuplicate) {
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

    private fun checkAndShowDolbyWarning(streamUrl: String) {
        if (isDolbyWarningShown) return
        val lowerUrl = streamUrl.lowercase()
        val isDolby = lowerUrl.contains("ac3") || lowerUrl.contains("eac3") ||
                      lowerUrl.contains("dts") || lowerUrl.contains("dolby") ||
                      lowerUrl.contains("5.1") || lowerUrl.contains("dd5.1")

        if (!isDolby) return
        isDolbyWarningShown = true

        val overlay = FrameLayout(this).apply {
            setBackgroundColor(Color.parseColor("#80000000"))
            isClickable = true
            isFocusable = true
        }

        val card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(20), dp(20), dp(20))
            background = GradientDrawable().apply {
                setColor(Color.parseColor("#F20F0F14"))
                cornerRadius = dp(16).toFloat()
            }
        }
        val cardParams = FrameLayout.LayoutParams(dp(420), FrameLayout.LayoutParams.WRAP_CONTENT).apply {
            gravity = Gravity.CENTER
        }
        overlay.addView(card, cardParams)

        val header = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }

        val titleTv = TextView(this).apply {
            text = "Dolby Audio Detected"
            setTextColor(Color.WHITE)
            textSize = 15f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
        }

        val closeBtn = FrameLayout(this).apply {
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.parseColor("#26FFFFFF"))
            }
            setOnClickListener {
                root.removeView(overlay)
                dolbyRunnable?.let { dolbyHandler.removeCallbacks(it) }
            }
        }
        val closeIcon = TextView(this).apply {
            text = "✕"
            setTextColor(Color.WHITE)
            textSize = 12f
            gravity = Gravity.CENTER
        }
        closeBtn.addView(closeIcon, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))

        header.addView(titleTv, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        header.addView(closeBtn, LinearLayout.LayoutParams(dp(28), dp(28)))
        card.addView(header, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))

        val messageTv = TextView(this).apply {
            text = "This stream contains a Dolby 5.1 / AC3 audio track. If you do not hear any sound, please use the \"Open in External Player\" option at the top-left to play with VLC or MX Player (HW+)."
            setTextColor(Color.parseColor("#E5E2E3"))
            textSize = 12f
            setLineSpacing(0f, 1.2f)
        }
        val msgParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
            topMargin = dp(12)
            bottomMargin = dp(12)
        }
        card.addView(messageTv, msgParams)

        dolbyCountdownTv = TextView(this).apply {
            text = "Auto-closing in 8 seconds..."
            setTextColor(Color.parseColor("#73FFFFFF"))
            textSize = 11f
            gravity = Gravity.RIGHT
        }
        card.addView(dolbyCountdownTv, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))

        root.addView(overlay, matchParent())
        dolbyWarningLayout = overlay

        dolbyTimerCount = 8
        dolbyRunnable = object : Runnable {
            override fun run() {
                dolbyTimerCount--
                if (dolbyTimerCount <= 0) {
                    root.removeView(overlay)
                    dolbyWarningLayout = null
                } else {
                    dolbyCountdownTv?.text = "Auto-closing in $dolbyTimerCount seconds..."
                    dolbyHandler.postDelayed(this, 1000L)
                }
            }
        }
        dolbyHandler.postDelayed(dolbyRunnable!!, 1000L)
    }

    override fun onResume() {
        super.onResume()
        immersiveMode()
        mediaSession?.isActive = true
    }
}
