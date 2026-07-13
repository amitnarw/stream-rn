package com.anonymous.zunornandroid.cloudstream

import com.anonymous.zunornandroid.R
import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.app.PendingIntent
import android.app.Dialog
import android.content.Intent
import android.content.pm.ActivityInfo
import android.view.inputmethod.InputMethodManager
import android.widget.EditText
import android.widget.ScrollView
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
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
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.CancellationException
import java.util.Locale
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
    private lateinit var qualityBtn: View
    private lateinit var sourcesPillBtn: View
    private lateinit var aspectBtn: ImageView
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
    private var isInitialLoadComplete = false
    private lateinit var loadingTitleTv: TextView
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
    private var resumePromptOverlay: FrameLayout? = null
    private var placeholderImageView: ImageView? = null

    // Action pills row reference
    private var continueWatchingPill: View? = null
    private var continueWatchingPillMs = 0L

    // Saving and resume progress tracking properties
    private var lastSaveTime = 0L
    private var lastSavedPosition = 0L
    private var savedProgressMs = 0L
    private var autoSeekToPositionMs = 0L
    private var gesturesEnabled = false
    private var logoPulseAnimatorSet: android.animation.AnimatorSet? = null
    private val isMovie: Boolean
        get() = intent.getStringExtra("mediaType") == "movie" || episodesArray == null || episodesArray!!.length() <= 1
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
    private var onlineSubtitleUrl = ""  // URL of an online/file subtitle override
    private var currentUrl = ""
    private var isPreStartedTorrent = false
    private var currentHeadersJson = "{}"
    private var originalTorrentMagnetUrl = ""
    private lateinit var audioTrackBtn: View

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
    private lateinit var playerContainer: FrameLayout
    private var activeOverlay: View? = null
    private var torrentLoadingOverlay: FrameLayout? = null

    private var torrentJob: kotlinx.coroutines.Job? = null
    // File-picker for local subtitle files (.srt, .vtt, .ass, .ssa)
    private val subtitleFilePicker = registerForActivityResult(ActivityResultContracts.GetContent()) { uri: android.net.Uri? ->
        if (uri != null) {
            val fileName = contentResolver.query(uri, null, null, null, null)?.use { cursor ->
                val nameIndex = cursor.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
                cursor.moveToFirst()
                if (nameIndex >= 0) cursor.getString(nameIndex) else "subtitle"
            } ?: "subtitle"
            onlineSubtitleUrl = uri.toString()
            currentSubtitleIndex = -2
            switchToSource(currentSourceIndex)
            subBtnTint(false)
            showToastLabel("Subtitle loaded: $fileName")
        }
    }

    private fun showOverlay(overlayView: View) {
        dismissActiveOverlay()
        activeOverlay = overlayView

        val scrim = View(this).apply {
            setBackgroundColor(Color.parseColor("#33050505")) // Light 20% transparent dark glass dim
            alpha = 0f
        }
        (overlayView as? FrameLayout)?.addView(scrim, 0, matchParent())
        scrim.animate().alpha(1f).setDuration(250)
            .setInterpolator(android.view.animation.DecelerateInterpolator()).start()

        root.addView(overlayView, matchParent())
        updateBackdropBlur(true)
    }

    private fun dismissActiveOverlay() {
        activeOverlay?.let { overlay ->
            val animTarget = overlay
            activeOverlay = null
            
            // Animate overlay alpha and slide-down
            animTarget.animate()
                .alpha(0f)
                .translationY(dp(16).toFloat())
                .setDuration(250)
                .setInterpolator(android.view.animation.AccelerateInterpolator())
                .withEndAction {
                    root.removeView(animTarget)
                }
                .start()

            // Animate blur out at the exact same time
            updateBackdropBlur(false)
        }
    }

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

    private var blurAnimator: android.animation.ValueAnimator? = null

    private fun updateBackdropBlur(shouldBlur: Boolean) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            blurAnimator?.cancel()
            val startRadius = if (shouldBlur) 0.01f else 22f
            val endRadius = if (shouldBlur) 22f else 0.01f

            blurAnimator = android.animation.ValueAnimator.ofFloat(startRadius, endRadius).apply {
                duration = 250
                interpolator = android.view.animation.DecelerateInterpolator()
                addUpdateListener { animator ->
                    val radius = animator.animatedValue as Float
                    if (radius <= 0.1f && !shouldBlur) {
                        playerContainer.setRenderEffect(null)
                    } else {
                        val blur = android.graphics.RenderEffect.createBlurEffect(radius, radius, android.graphics.Shader.TileMode.CLAMP)
                        playerContainer.setRenderEffect(blur)
                    }
                }
                start()
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
        isPreStartedTorrent = intent.getBooleanExtra("isTorrentStream", false)
        if (subtitleUrl.isNotEmpty()) currentSubtitleIndex = 0

        allSources?.let { sources ->
            for (i in 0 until sources.length()) {
                if (sources.getJSONObject(i).optString("url") == currentUrl) {
                    currentSourceIndex = i
                    break
                }
            }
        }

        root = FrameLayout(this)
        
        playerContainer = FrameLayout(this)
        root.addView(playerContainer, matchParent())
        
        playerView = layoutInflater.inflate(R.layout.player_view_texture, null) as PlayerView
        playerContainer.addView(playerView, matchParent())

        placeholderImageView = ImageView(this).apply {
            setBackgroundColor(Color.BLACK)
            scaleType = ImageView.ScaleType.CENTER_CROP
        }
        playerContainer.addView(placeholderImageView!!, matchParent())

        loadingGroup = createLoadingOverlay()
        playerContainer.addView(loadingGroup, matchParent())
        updateLoadingTitleText()

        centerControls = createCenterControls()
        playerContainer.addView(centerControls, matchParent())
        centerControls.visibility = View.GONE

        topBar = createTopBar(videoTitle)
        playerContainer.addView(topBar, matchParent())
        topBar.visibility = View.GONE

        bottomBar = createBottomBar()
        playerContainer.addView(bottomBar, matchParent())
        bottomBar.visibility = View.GONE

        isControlsVisible = false

        errorOverlay = createErrorOverlay()
        playerContainer.addView(errorOverlay, matchParent())
        errorOverlay.visibility = View.GONE

        gestureHudLayout = createGestureHUD()
        val hudParams = FrameLayout.LayoutParams(dp(70), dp(160)).apply {
            gravity = Gravity.CENTER
        }
        playerContainer.addView(gestureHudLayout, hudParams)

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
                
                // Fetch and blur the poster for the background if it exists
                if (posterUrl.isNotEmpty()) {
                    try {
                        val urlConnection = java.net.URL(posterUrl).openConnection()
                        urlConnection.connect()
                        val input = urlConnection.getInputStream()
                        val posterBmp = android.graphics.BitmapFactory.decodeStream(input)
                        withContext(Dispatchers.Main) {
                            placeholderImageView?.setImageBitmap(posterBmp)
                            placeholderImageView?.alpha = 0.2f
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                                val blur = android.graphics.RenderEffect.createBlurEffect(25f, 25f, android.graphics.Shader.TileMode.CLAMP)
                                placeholderImageView?.setRenderEffect(blur)
                            }
                        }
                    } catch (e: Exception) {
                        Log.e("KotlinPlayerActivity", "Failed to load blurred background poster: ${e.message}")
                    }
                }
            }
        }

        if (providerName != null && mediaRef != null) {
            resolveAndPlay(providerName!!, mediaRef)
        } else if (currentUrl.isNotEmpty()) {
            loadingGroup.visibility = View.VISIBLE
            updateLoadingProgress(10)
            checkAndPlay(currentUrl, currentHeadersJson, getCurrentSubtitleUrl())
        }

        updateEpisodeButtonState()

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (activeOverlay != null) {
                    dismissActiveOverlay()
                } else {
                    finish()
                }
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
        return when {
            currentSubtitleIndex == -2 -> onlineSubtitleUrl  // Custom online/file subtitle
            currentSubtitleIndex >= 0 && allSubtitles != null && currentSubtitleIndex < allSubtitles!!.length() ->
                try { allSubtitles!!.getJSONObject(currentSubtitleIndex).optString("url", "") } catch (_: Exception) { "" }
            else -> intent.getStringExtra("subtitleUrl") ?: ""
        }
    }

    private fun getOriginalUrlToPlay(): String {
        if (originalTorrentMagnetUrl.isNotEmpty()) return originalTorrentMagnetUrl
        allSources?.let { sources ->
            if (currentSourceIndex >= 0 && currentSourceIndex < sources.length()) {
                val s = sources.optJSONObject(currentSourceIndex)
                val u = s?.optString("url", "") ?: ""
                if (u.isNotEmpty()) return u
            }
        }
        return currentUrl
    }

    private fun resolveAndPlay(providerName: String, mediaRef: String) {
        isErrorShowing = false
        errorOverlay.visibility = View.GONE
        
        isInitialLoadComplete = false
        root.removeView(loadingGroup)
        placeholderPulseAnimator?.cancel()
        loadingGroup = createLoadingOverlay()
        root.addView(loadingGroup, matchParent())
        loadingGroup.visibility = View.VISIBLE
        updateLoadingTitleText()
        
        placeholderImageView?.alpha = 0.2f
        placeholderImageView?.visibility = View.VISIBLE
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            placeholderImageView?.setRenderEffect(android.graphics.RenderEffect.createBlurEffect(25f, 25f, android.graphics.Shader.TileMode.CLAMP))
        }
        
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
                            checkAndPlay(currentUrl, currentHeadersJson, subUrl)
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
                checkAndPlay(currentUrl, currentHeadersJson, getCurrentSubtitleUrl())
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
                setColor(Color.parseColor("#A5050505")) // 65% opaque pitch black
                cornerRadius = dp(20).toFloat()
                setStroke(dp(1), Color.parseColor("#14FFFFFF")) // Thin glass border
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
                setColor(Color.parseColor("#5580FF")) // theme.colors.accentLight (#5580FF)
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
        val optMagnet = headers.optString("__originalMagnetUrl", "")
        if (optMagnet.isNotEmpty()) {
            originalTorrentMagnetUrl = optMagnet
        }

        val trustAllCerts = arrayOf<javax.net.ssl.TrustManager>(
            object : javax.net.ssl.X509TrustManager {
                override fun checkClientTrusted(chain: Array<java.security.cert.X509Certificate>, authType: String) {}
                override fun checkServerTrusted(chain: Array<java.security.cert.X509Certificate>, authType: String) {}
                override fun getAcceptedIssuers(): Array<java.security.cert.X509Certificate> = arrayOf()
            }
        )
        val sslContext = javax.net.ssl.SSLContext.getInstance("SSL")
        sslContext.init(null, trustAllCerts, java.security.SecureRandom())
        val sslSocketFactory = sslContext.socketFactory

        val bootstrapClient = okhttp3.OkHttpClient.Builder()
            .connectTimeout(30, java.util.concurrent.TimeUnit.SECONDS)
            .readTimeout(30, java.util.concurrent.TimeUnit.SECONDS)
            .writeTimeout(30, java.util.concurrent.TimeUnit.SECONDS)
            .followRedirects(true)
            .followSslRedirects(true)
            .sslSocketFactory(sslSocketFactory, trustAllCerts[0] as javax.net.ssl.X509TrustManager)
            .hostnameVerifier { _, _ -> true }
            .dns(object : okhttp3.Dns {
                private val dohClient = okhttp3.OkHttpClient.Builder()
                    .connectTimeout(5, java.util.concurrent.TimeUnit.SECONDS)
                    .readTimeout(5, java.util.concurrent.TimeUnit.SECONDS)
                    .build()

                private fun resolveViaDoH(hostname: String): List<java.net.InetAddress>? {
                    return try {
                        val request = okhttp3.Request.Builder()
                            .url("https://1.1.1.1/dns-query?name=${hostname}&type=A")
                            .header("Accept", "application/dns-json")
                            .build()
                        val response = dohClient.newCall(request).execute()
                        if (!response.isSuccessful) return null
                        val body = response.body?.string() ?: return null
                        val json = org.json.JSONObject(body)
                        val answers = json.optJSONArray("Answer") ?: return null
                        val addresses = mutableListOf<java.net.InetAddress>()
                        for (i in 0 until answers.length()) {
                            val answer = answers.getJSONObject(i)
                            val type = answer.optInt("type", 0)
                            val data = answer.optString("data", "")
                            if ((type == 1 || type == 28) && data.isNotBlank()) {
                                try {
                                    addresses.add(java.net.InetAddress.getByName(data))
                                } catch (_: java.lang.Exception) {}
                            }
                        }
                        if (addresses.isEmpty()) null else addresses
                    } catch (e: Exception) {
                        null
                    }
                }

                override fun lookup(hostname: String): List<java.net.InetAddress> {
                    if (hostname == "localhost" || hostname == "127.0.0.1" || hostname.endsWith(".local")) {
                        return okhttp3.Dns.SYSTEM.lookup(hostname)
                    }
                    resolveViaDoH(hostname)?.let { return it }
                    return okhttp3.Dns.SYSTEM.lookup(hostname)
                }
            })
            .build()

        val dataSourceFactory = androidx.media3.datasource.okhttp.OkHttpDataSource.Factory(bootstrapClient)
            .setUserAgent("Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36")

        if (headers.length() > 0) {
            val props = mutableMapOf<String, String>()
            for (key in headers.keys()) {
                if (key != "__originalMagnetUrl") {
                    props[key] = headers.getString(key)
                }
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
                    isInitialLoadComplete = true
                    loadingGroup.animate()
                        .alpha(0f)
                        .setDuration(400)
                        .setListener(object : AnimatorListenerAdapter() {
                            override fun onAnimationEnd(animation: Animator) {
                                loadingGroup.visibility = View.GONE
                                loadingGroup.alpha = 1f
                                logoPulseAnimatorSet?.cancel()
                                logoPulseAnimatorSet = null
                            }
                        }).start()
                    placeholderImageView?.animate()
                        ?.alpha(0f)
                        ?.setDuration(400)
                        ?.setListener(object : AnimatorListenerAdapter() {
                            override fun onAnimationEnd(animation: Animator) {
                                placeholderImageView?.visibility = View.GONE
                            }
                        })?.start()
                    showControlsAfterLoad()
                    updateMediaSession(getCurrentEpisodeTitle())
                    checkAndShowDolbyWarning(url)

                    // Resume prompt (if savedProgressMs found)
                    if (savedProgressMs > 10000L && !hasShownResumePrompt) {
                        checkAndShowResumePrompt(savedProgressMs)
                    } else if (savedProgressMs > 0L) {
                        player?.seekTo(savedProgressMs)
                        savedProgressMs = 0L
                    }
                    hasShownResumePrompt = true

                    // Update continue watching pill with real duration
                    val dur = player?.duration ?: 0L
                    if (savedProgressMs > 0L) updateContinueWatchingPill(savedProgressMs, dur)
                    // Update episode label in bottom bar
                    updateEpisodeLabel()
                }
                if (playbackState == Player.STATE_ENDED) {
                    savePlaybackPosition()
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
        container.setBackgroundColor(Color.TRANSPARENT)

        val contentWrapper = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
        }

        logoContainer = FrameLayout(this).apply {
            val lp = LinearLayout.LayoutParams(dp(260), dp(110)).apply {
                gravity = Gravity.CENTER_HORIZONTAL
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
        contentWrapper.addView(logoContainer)

        // Shimmer pulse animation for the placeholder bar
        placeholderPulseAnimator = android.animation.ObjectAnimator.ofFloat(placeholderBar, "alpha", 0.2f, 0.7f).apply {
            duration = 800
            repeatCount = android.animation.ValueAnimator.INFINITE
            repeatMode = android.animation.ValueAnimator.REVERSE
            interpolator = android.view.animation.AccelerateDecelerateInterpolator()
            start()
        }

        // Loading title
        loadingTitleTv = TextView(this).apply {
            visibility = View.GONE
            setTextColor(Color.parseColor("#E5E2E3"))
            textSize = 14f
            typeface = android.graphics.Typeface.create("sans-serif-medium", android.graphics.Typeface.NORMAL)
            gravity = Gravity.CENTER
            setLineSpacing(0f, 1.25f)
        }
        contentWrapper.addView(loadingTitleTv, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply {
            topMargin = dp(18)
            leftMargin = dp(40)
            rightMargin = dp(40)
        })

        container.addView(contentWrapper, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.WRAP_CONTENT
        ).apply { gravity = Gravity.CENTER })

        return container
    }

    private fun updateLoadingTitleText() {
        if (!::loadingTitleTv.isInitialized) return
        val mainTitle = intent.getStringExtra("title") ?: ""
        val mediaType = intent.getStringExtra("mediaType") ?: "movie"
        val isSer = mediaType == "series" || mediaType == "show"
        
        if (isSer && episodesArray != null && currentEpisodeIndex >= 0 && currentEpisodeIndex < episodesArray!!.length()) {
            try {
                val ep = episodesArray!!.getJSONObject(currentEpisodeIndex)
                val epNum = ep.optInt("episode", currentEpisodeIndex + 1)
                val seasonNum = ep.optInt("season", 1)
                val epLabel = ep.optString("label", "")
                
                val formattedSubtitle = "S${seasonNum}E${epNum}" + (if (epLabel.isNotEmpty()) ": $epLabel" else "")
                loadingTitleTv.text = "Loading: $mainTitle\n$formattedSubtitle"
            } catch (_: Exception) {
                loadingTitleTv.text = "Loading: $mainTitle"
            }
        } else {
            loadingTitleTv.text = "Loading: $mainTitle"
        }
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

        startLogoPulseAnimation()
    }

    private fun startLogoPulseAnimation() {
        if (!::logoContainer.isInitialized || loadingGroup.visibility != View.VISIBLE) {
            logoPulseAnimatorSet?.cancel()
            logoPulseAnimatorSet = null
            if (::logoContainer.isInitialized) {
                logoContainer.scaleX = 1f
                logoContainer.scaleY = 1f
            }
            return
        }
        
        logoPulseAnimatorSet?.cancel()
        
        val scaleXAnimator = android.animation.ObjectAnimator.ofFloat(logoContainer, "scaleX", 0.95f, 1.05f).apply {
            duration = 1000
            repeatCount = android.animation.ValueAnimator.INFINITE
            repeatMode = android.animation.ValueAnimator.REVERSE
            interpolator = android.view.animation.AccelerateDecelerateInterpolator()
        }
        val scaleYAnimator = android.animation.ObjectAnimator.ofFloat(logoContainer, "scaleY", 0.95f, 1.05f).apply {
            duration = 1000
            repeatCount = android.animation.ValueAnimator.INFINITE
            repeatMode = android.animation.ValueAnimator.REVERSE
            interpolator = android.view.animation.AccelerateDecelerateInterpolator()
        }
        logoPulseAnimatorSet = android.animation.AnimatorSet().apply {
            playTogether(scaleXAnimator, scaleYAnimator)
            start()
        }
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
            visibility = if (isMovie) View.GONE else View.VISIBLE
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
            visibility = if (isMovie) View.GONE else View.VISIBLE
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

        val bar = FrameLayout(this).apply { setPadding(dp(40), dp(12), dp(40), dp(18)) }
        container.addView(bar, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT
        ).apply { gravity = Gravity.TOP })

        // ── Left side: [X close] [↗ external] [capsule: Lock | AspectRatio | Gestures] in same horizontal row ──
        val leftPanel = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }

        // X Close — 44x44 glass circle
        val closeBtn = FrameLayout(this).apply {
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.parseColor("#D9141218"))
            }
            setOnClickListener { finish() }
        }
        addPremiumTouchAnimation(closeBtn)
        val closeIcon = ImageView(this).apply {
            setImageResource(R.drawable.ic_hero_xmark)
            setColorFilter(Color.WHITE)
            setPadding(dp(11), dp(11), dp(11), dp(11))
        }
        closeBtn.addView(closeIcon, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        leftPanel.addView(closeBtn, LinearLayout.LayoutParams(dp(44), dp(44)).apply { rightMargin = dp(8) })

        // ↗ External Player — 44x44 glass circle
        val extBtn = FrameLayout(this).apply {
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.parseColor("#D9141218"))
            }
            setOnClickListener { openInExternalPlayer() }
        }
        addPremiumTouchAnimation(extBtn)
        val extIcon = ImageView(this).apply {
            setImageResource(R.drawable.ic_lucide_square_arrow_out)
            setColorFilter(Color.WHITE)
            setPadding(dp(11), dp(11), dp(11), dp(11))
        }
        extBtn.addView(extIcon, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        leftPanel.addView(extBtn, LinearLayout.LayoutParams(dp(44), dp(44)).apply { rightMargin = dp(12) })

        // Capsule [Lock | Aspect | Gestures | Help]
        val capsule = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(8), 0, dp(8), 0)
            background = GradientDrawable().apply {
                setColor(Color.parseColor("#D9141218"))
                cornerRadius = dp(22).toFloat()
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
        aspectBtn = ImageView(this).apply {
            val iconRes = when (playerView.resizeMode) {
                AspectRatioFrameLayout.RESIZE_MODE_FIT -> R.drawable.ic_lucide_maximize
                AspectRatioFrameLayout.RESIZE_MODE_ZOOM -> R.drawable.ic_lucide_fullscreen
                AspectRatioFrameLayout.RESIZE_MODE_FILL -> R.drawable.ic_lucide_maximize_2
                else -> R.drawable.ic_lucide_maximize
            }
            setImageResource(iconRes)
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
            setImageResource(R.drawable.ic_lucide_fingerprint)
            setColorFilter(if (gesturesEnabled) Color.WHITE else Color.parseColor("#66FFFFFF"))
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

        // Help button
        val helpBtn = ImageView(this).apply {
            setImageResource(R.drawable.ic_lucide_life_buoy)
            setColorFilter(Color.WHITE)
            setPadding(dp(12), dp(12), dp(12), dp(12))
            setOnClickListener {
                showHelpDialog()
                resetHideTimer()
            }
        }
        addPremiumTouchAnimation(helpBtn)
        capsule.addView(helpBtn, LinearLayout.LayoutParams(dp(44), dp(44)))

        leftPanel.addView(capsule, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, dp(44)))

        bar.addView(leftPanel, FrameLayout.LayoutParams(
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

        // ── Row 1: Logo/Title (left) — This is the bottomMetaRow in TSX
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

        // ── Row 3: Actions row below Scrubber containing pills and settings capsule ──
        val bottomActionsRow = FrameLayout(this)

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
            setOnClickListener {
                animate().scaleX(1.0f).scaleY(1.0f).setDuration(0).start()
                showSettingsDialog("Sources")
            }
        }
        sourcesPillBtn = srcPill
        val srcBtn = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(20), dp(10), dp(20), dp(10))
        }
        val srcIcon = ImageView(this).apply {
            setImageResource(R.drawable.ic_lucide_list_video)
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

        bottomActionsRow.addView(pillsRow, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT
        ).apply { gravity = Gravity.LEFT or Gravity.CENTER_VERTICAL })

        // Right side: Settings capsule [Language icon | Speed icon] — TSX: capsuleBlur
        val settingsCapsule = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(12), 0, dp(12), 0)
            background = GradientDrawable().apply {
                setColor(Color.parseColor("#D9141218"))
                cornerRadius = dp(23).toFloat()
            }
        }

        // Subtitles icon button
        subtitleBtn = addGlassCapsuleIconBtn(settingsCapsule, R.drawable.ic_hero_language) { showSettingsDialog("Subtitles") }

        // Quality icon button
        qualityBtn = addGlassCapsuleIconBtn(settingsCapsule, R.drawable.ic_lucide_hd) { showSettingsDialog("Video Quality") }

        // Audio Track icon button
        audioTrackBtn = addGlassCapsuleIconBtn(settingsCapsule, R.drawable.ic_lucide_audio_lines) { showSettingsDialog("Audio Track") }

        // Speed / Settings (BoltIcon)
        sourcesBtn = addGlassCapsuleIconBtn(settingsCapsule, R.drawable.ic_lucide_gauge) { showSettingsDialog("Playback Speed") }

        bottomActionsRow.addView(settingsCapsule, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.WRAP_CONTENT, dp(46)
        ).apply { gravity = Gravity.RIGHT or Gravity.CENTER_VERTICAL })

        bar.addView(bottomActionsRow, LinearLayout.LayoutParams(
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
            val nextMode = modes[nextIdx]
            pv.resizeMode = nextMode
            
            val iconRes = when (nextMode) {
                AspectRatioFrameLayout.RESIZE_MODE_FIT -> R.drawable.ic_lucide_maximize
                AspectRatioFrameLayout.RESIZE_MODE_ZOOM -> R.drawable.ic_lucide_fullscreen
                AspectRatioFrameLayout.RESIZE_MODE_FILL -> R.drawable.ic_lucide_maximize_2
                else -> R.drawable.ic_lucide_maximize
            }
            if (::aspectBtn.isInitialized) {
                aspectBtn.setImageResource(iconRes)
            }

            val modeText = when (nextMode) {
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
        when (initialCategory) {
            "Sources" -> showSourcesGrid()
            "Subtitles" -> SubtitleSearchDialog().show()
            "Playback Speed" -> showSpeedDropdown()
            "Video Quality" -> showQualityDropdown()
            "Audio Track" -> PlayerSettingsDialog("Audio Track").show()
            else -> {
                PlayerSettingsDialog(initialCategory).show()
            }
        }
        resetHideTimer()
    }


    private fun showSourcesGrid() {
        if (!::sourcesPillBtn.isInitialized) return
        sourcesPillBtn.animate().scaleX(1.0f).scaleY(1.0f).setDuration(0).start()
        SourcesGridDialog(sourcesPillBtn).show()
    }

    private fun showSpeedDropdown() {
        if (!::sourcesBtn.isInitialized) return
        val items = mutableListOf<DropdownItem>()
        val speeds = listOf(0.5f, 0.75f, 1.0f, 1.25f, 1.5f, 2.0f)
        val currentSpeed = player?.playbackParameters?.speed ?: 1.0f
        
        speeds.forEach { speed ->
            val label = when (speed) {
                1.0f -> "Normal"
                0.5f -> "Slow Motion"
                0.75f -> "Slow"
                1.25f -> "Fast"
                1.5f -> "Super Fast"
                2.0f -> "Double Speed"
                else -> "${speed}x"
            }
            items.add(DropdownItem(
                primaryText = "${speed}x",
                subtitleText = label,
                isSelected = (abs(currentSpeed - speed) < 0.05f),
                onClick = {
                    player?.setPlaybackSpeed(speed)
                    showToastLabel("Speed: ${speed}x")
                }
            ))
        }
        DropdownSettingsDialog("PLAYBACK SPEED", sourcesBtn, items).show()
    }

    private fun showSubtitlesDropdown() {
        // Legacy: open the full dialog
        SubtitleSearchDialog().show()
    }

    data class SubtitleResult(
        val name: String,
        val lang: String,
        val url: String,
        val format: String,
        val rating: Float,
        val downloads: Int
    )

    private fun fetchOpenSubtitles(title: String, lang: String, callback: (List<SubtitleResult>) -> Unit) {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val langParam = if (lang == "all") "all" else lang
                val encodedTitle = java.net.URLEncoder.encode(title.trim(), "UTF-8").replace("+", "%20")
                val url = "https://rest.opensubtitles.org/search/query-$encodedTitle/sublanguageid-$langParam"
                Log.d("SubSearch", "Fetching: $url")
                val conn = java.net.URL(url).openConnection() as java.net.HttpURLConnection
                conn.requestMethod = "GET"
                conn.setRequestProperty("X-User-Agent", "VLSub 0.10.2")
                conn.setRequestProperty("Accept", "application/json")
                conn.connectTimeout = 12000
                conn.readTimeout = 12000
                conn.connect()
                val resp = conn.inputStream.bufferedReader().readText()
                val arr = JSONArray(resp)
                val results = mutableListOf<SubtitleResult>()
                for (i in 0 until arr.length()) {
                    val obj = arr.getJSONObject(i)
                    val subDownloadLink = obj.optString("SubDownloadLink", "")
                    val subFileName = obj.optString("SubFileName", "Unknown")
                    val subLanguageName = obj.optString("LanguageName", "?")
                    val subFormat = obj.optString("SubFormat", "srt")
                    val subRating = obj.optString("SubRating", "0").toFloatOrNull() ?: 0f
                    val subDownloadsCnt = obj.optString("SubDownloadsCnt", "0").toIntOrNull() ?: 0
                    if (subDownloadLink.isNotEmpty()) {
                        results.add(SubtitleResult(subFileName, subLanguageName, subDownloadLink, subFormat, subRating, subDownloadsCnt))
                    }
                    if (results.size >= 30) break
                }
                withContext(Dispatchers.Main) { callback(results) }
            } catch (e: Exception) {
                Log.e("SubSearch", "Error: ${e.message}")
                withContext(Dispatchers.Main) { callback(emptyList()) }
            }
        }
    }

    private inner class SubtitleSearchDialog {
        private val container: FrameLayout
        private val card: LinearLayout
        private var isDismissing = false
        private lateinit var contentArea: FrameLayout
        private var activeTab = "plugin"  // "plugin" | "online" | "file"

        init {
            container = FrameLayout(this@KotlinPlayerActivity).apply {
                setBackgroundColor(Color.TRANSPARENT)
                setOnClickListener { dismiss() }
            }
            card = LinearLayout(this@KotlinPlayerActivity).apply {
                orientation = LinearLayout.VERTICAL
                background = GradientDrawable().apply {
                    setColor(Color.parseColor("#F2141218"))
                    cornerRadius = dp(20).toFloat()
                    setStroke(dp(1), Color.parseColor("#14FFFFFF"))
                }
                setOnClickListener { /* consume */ }
            }
            val cardParams = FrameLayout.LayoutParams(dp(520), dp(400)).apply { gravity = Gravity.CENTER }
            container.addView(card, cardParams)

            // Header row
            val headerRow = LinearLayout(this@KotlinPlayerActivity).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setPadding(dp(20), dp(16), dp(16), dp(12))
            }
            val headerIcon = ImageView(this@KotlinPlayerActivity).apply {
                setImageResource(R.drawable.ic_hero_language)
                setColorFilter(Color.parseColor("#5580FF"))
            }
            headerRow.addView(headerIcon, LinearLayout.LayoutParams(dp(20), dp(20)).apply { rightMargin = dp(10) })
            val headerTitle = TextView(this@KotlinPlayerActivity).apply {
                text = "SUBTITLES"
                setTextColor(Color.WHITE)
                textSize = 13.5f
                typeface = android.graphics.Typeface.DEFAULT_BOLD
            }
            headerRow.addView(headerTitle, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
            val closeBtn = ImageView(this@KotlinPlayerActivity).apply {
                setImageResource(R.drawable.ic_hero_xmark)
                setColorFilter(Color.parseColor("#A0A0A5"))
                setPadding(dp(8), dp(8), dp(8), dp(8))
                setOnClickListener { dismiss() }
            }
            headerRow.addView(closeBtn, LinearLayout.LayoutParams(dp(36), dp(36)))
            card.addView(headerRow)

            // Divider
            val divider = View(this@KotlinPlayerActivity).apply { setBackgroundColor(Color.parseColor("#14FFFFFF")) }
            card.addView(divider, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(1)))

            // Tab row
            val tabRow = LinearLayout(this@KotlinPlayerActivity).apply {
                orientation = LinearLayout.HORIZONTAL
                setPadding(dp(16), dp(10), dp(16), dp(10))
            }
            card.addView(tabRow, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))

            // Content area
            contentArea = FrameLayout(this@KotlinPlayerActivity)
            card.addView(contentArea, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))

            // Build tab buttons
            val tabLabels = listOf("Plugin Subs", "Search Online", "Add File")
            val tabKeys = listOf("plugin", "online", "file")
            val tabViews = mutableListOf<TextView>()

            tabLabels.forEachIndexed { idx, label ->
                val tab = TextView(this@KotlinPlayerActivity).apply {
                    text = label
                    textSize = 11f
                    typeface = android.graphics.Typeface.DEFAULT_BOLD
                    gravity = Gravity.CENTER
                    setPadding(dp(10), dp(6), dp(10), dp(6))
                    setOnClickListener {
                        activeTab = tabKeys[idx]
                        tabViews.forEachIndexed { ti, tv ->
                            val isActive = ti == idx
                            tv.setTextColor(if (isActive) Color.parseColor("#5580FF") else Color.parseColor("#8E8D92"))
                            tv.background = if (isActive) GradientDrawable().apply {
                                setColor(Color.parseColor("#1A5580FF"))
                                cornerRadius = dp(10).toFloat()
                            } else null
                        }
                        switchTabContent(tabKeys[idx])
                    }
                }
                val isFirst = idx == 0
                tab.setTextColor(if (isFirst) Color.parseColor("#5580FF") else Color.parseColor("#8E8D92"))
                tab.background = if (isFirst) GradientDrawable().apply {
                    setColor(Color.parseColor("#1A5580FF"))
                    cornerRadius = dp(10).toFloat()
                } else null
                tabViews.add(tab)
                tabRow.addView(tab, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
                    if (idx > 0) leftMargin = dp(6)
                })
            }

            switchTabContent("plugin")

            card.alpha = 0f
            card.translationY = dp(24).toFloat()
        }

        private fun switchTabContent(tab: String) {
            contentArea.removeAllViews()
            when (tab) {
                "plugin" -> buildPluginSubsContent()
                "online" -> buildOnlineSearchContent()
                "file" -> {
                    dismiss()
                    subtitleFilePicker.launch("*/*")
                }
            }
        }

        private fun buildPluginSubsContent() {
            val scroll = ScrollView(this@KotlinPlayerActivity).apply { isFillViewport = true }
            val listLayout = LinearLayout(this@KotlinPlayerActivity).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(dp(16), dp(4), dp(16), dp(16))
            }
            scroll.addView(listLayout)

            // Off option
            val isOffSelected = (currentSubtitleIndex < 0)
            listLayout.addView(buildSubRow("Subtitle Off", "Disable subtitles", null, isOffSelected) {
                currentSubtitleIndex = -1
                onlineSubtitleUrl = ""
                switchToSource(currentSourceIndex)
                subBtnTint(true)
                showToastLabel("Subtitles: Off")
                dismiss()
            })

            val subs = allSubtitles
            if (subs != null && subs.length() > 0) {
                for (i in 0 until subs.length()) {
                    val sub = subs.getJSONObject(i)
                    val lang = sub.optString("lang", "?")
                    val isSelected = (i == currentSubtitleIndex)
                    listLayout.addView(buildSubRow(lang, "Plugin subtitle track", null, isSelected) {
                        currentSubtitleIndex = i
                        onlineSubtitleUrl = ""
                        switchToSource(currentSourceIndex)
                        subBtnTint(false)
                        showToastLabel("Subtitles: $lang")
                        dismiss()
                    })
                }
            } else {
                val emptyTv = TextView(this@KotlinPlayerActivity).apply {
                    text = "No plugin subtitles found for this source.\nTry \"Search Online\" to find subtitles."
                    setTextColor(Color.parseColor("#8E8D92"))
                    textSize = 13f
                    setPadding(dp(4), dp(16), dp(4), dp(8))
                    setLineSpacing(0f, 1.4f)
                }
                listLayout.addView(emptyTv)
            }
            contentArea.addView(scroll, matchParent())
        }

        private fun buildOnlineSearchContent() {
            val searchLayout = LinearLayout(this@KotlinPlayerActivity).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(dp(16), dp(4), dp(16), dp(4))
            }

            // Search input
            val videoTitle = intent.getStringExtra("title") ?: ""
            val searchInput = EditText(this@KotlinPlayerActivity).apply {
                setText(videoTitle)
                hint = "Movie or show title..."
                setTextColor(Color.WHITE)
                setHintTextColor(Color.parseColor("#8E8D92"))
                textSize = 13f
                background = GradientDrawable().apply {
                    setColor(Color.parseColor("#1A5580FF"))
                    cornerRadius = dp(12).toFloat()
                    setStroke(dp(1), Color.parseColor("#335580FF"))
                }
                setPadding(dp(14), dp(10), dp(14), dp(10))
                setSelection(text.length)
                maxLines = 1
                inputType = android.text.InputType.TYPE_CLASS_TEXT
            }
            searchLayout.addView(searchInput, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { bottomMargin = dp(8) })

            // Language chips
            val langOptions = listOf("all" to "All", "eng" to "English", "hin" to "Hindi", "spa" to "Spanish", "fre" to "French", "ara" to "Arabic", "por" to "Portuguese")
            var selectedLang = "all"
            val chipRow = android.widget.HorizontalScrollView(this@KotlinPlayerActivity).apply {
                isHorizontalScrollBarEnabled = false
                overScrollMode = View.OVER_SCROLL_NEVER
            }
            val chipLayout = LinearLayout(this@KotlinPlayerActivity).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
            }
            chipRow.addView(chipLayout)

            val chipViews = mutableListOf<TextView>()
            langOptions.forEach { (code, name) ->
                val chip = TextView(this@KotlinPlayerActivity).apply {
                    text = name
                    textSize = 10.5f
                    typeface = android.graphics.Typeface.DEFAULT_BOLD
                    setPadding(dp(10), dp(4), dp(10), dp(4))
                    val isFirst = code == "all"
                    setTextColor(if (isFirst) Color.WHITE else Color.parseColor("#8E8D92"))
                    background = GradientDrawable().apply {
                        setColor(if (isFirst) Color.parseColor("#5580FF") else Color.parseColor("#14FFFFFF"))
                        cornerRadius = dp(10).toFloat()
                    }
                    setOnClickListener {
                        selectedLang = code
                        chipViews.forEach { cv ->
                            val isActive = cv.text == name
                            cv.setTextColor(if (isActive) Color.WHITE else Color.parseColor("#8E8D92"))
                            cv.background = GradientDrawable().apply {
                                setColor(if (isActive) Color.parseColor("#5580FF") else Color.parseColor("#14FFFFFF"))
                                cornerRadius = dp(10).toFloat()
                            }
                        }
                    }
                }
                chipViews.add(chip)
                chipLayout.addView(chip, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
                    rightMargin = dp(6)
                })
            }
            searchLayout.addView(chipRow, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { bottomMargin = dp(8) })

            // Search button + status
            val statusTv = TextView(this@KotlinPlayerActivity).apply {
                text = ""
                setTextColor(Color.parseColor("#8E8D92"))
                textSize = 12f
                gravity = Gravity.CENTER
            }

            val resultsScroll = ScrollView(this@KotlinPlayerActivity).apply { isFillViewport = true }
            val resultsList = LinearLayout(this@KotlinPlayerActivity).apply { orientation = LinearLayout.VERTICAL }
            resultsScroll.addView(resultsList)

            val searchBtn = TextView(this@KotlinPlayerActivity).apply {
                text = "Search"
                setTextColor(Color.WHITE)
                textSize = 13f
                typeface = android.graphics.Typeface.DEFAULT_BOLD
                gravity = Gravity.CENTER
                background = GradientDrawable().apply {
                    setColor(Color.parseColor("#5580FF"))
                    cornerRadius = dp(12).toFloat()
                }
                setPadding(dp(24), dp(10), dp(24), dp(10))
                setOnClickListener {
                    val title = searchInput.text.toString().trim()
                    if (title.isEmpty()) { showToastLabel("Enter a title to search"); return@setOnClickListener }
                    // Hide keyboard
                    val imm = getSystemService(INPUT_METHOD_SERVICE) as InputMethodManager
                    imm.hideSoftInputFromWindow(searchInput.windowToken, 0)
                    statusTv.text = "Searching…"
                    resultsList.removeAllViews()
                    fetchOpenSubtitles(title, selectedLang) { results ->
                        resultsList.removeAllViews()
                        if (results.isEmpty()) {
                            statusTv.text = "No subtitles found. Try a different title or language."
                        } else {
                            statusTv.text = "${results.size} subtitle(s) found"
                            results.forEach { sub ->
                                resultsList.addView(buildSubRow(
                                    sub.name.substringBeforeLast(".").take(48),
                                    "${sub.lang}  ·  ${sub.format.uppercase()}  ·  ↓ ${if (sub.downloads > 999) "${sub.downloads/1000}K" else sub.downloads.toString()}",
                                    null,
                                    currentSubtitleIndex == -2 && onlineSubtitleUrl == sub.url
                                ) {
                                    onlineSubtitleUrl = sub.url
                                    currentSubtitleIndex = -2
                                    switchToSource(currentSourceIndex)
                                    subBtnTint(false)
                                    showToastLabel("Subtitle: ${sub.lang}")
                                    dismiss()
                                })
                            }
                        }
                    }
                }
            }

            val btnRow = LinearLayout(this@KotlinPlayerActivity).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
            }
            btnRow.addView(searchBtn, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { rightMargin = dp(10) })
            btnRow.addView(statusTv, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
            searchLayout.addView(btnRow, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { bottomMargin = dp(8) })

            val outerLayout = LinearLayout(this@KotlinPlayerActivity).apply { orientation = LinearLayout.VERTICAL }
            outerLayout.addView(searchLayout, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
            outerLayout.addView(resultsScroll, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))
            contentArea.addView(outerLayout, matchParent())
        }

        private fun buildSubRow(title: String, subtitle: String, url: String?, isSelected: Boolean, onClick: () -> Unit): LinearLayout {
            val row = LinearLayout(this@KotlinPlayerActivity).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setPadding(dp(14), dp(10), dp(14), dp(10))
                background = if (isSelected) GradientDrawable().apply {
                    setColor(Color.parseColor("#1A5580FF"))
                    cornerRadius = dp(12).toFloat()
                } else null
                setOnClickListener { onClick() }
            }
            addPremiumTouchAnimation(row)

            val textCol = LinearLayout(this@KotlinPlayerActivity).apply { orientation = LinearLayout.VERTICAL }
            val titleTv = TextView(this@KotlinPlayerActivity).apply {
                text = title
                setTextColor(if (isSelected) Color.parseColor("#5580FF") else Color.WHITE)
                textSize = 13f
                typeface = if (isSelected) android.graphics.Typeface.DEFAULT_BOLD else android.graphics.Typeface.DEFAULT
                maxLines = 1
                ellipsize = android.text.TextUtils.TruncateAt.END
            }
            textCol.addView(titleTv)
            if (subtitle.isNotEmpty()) {
                val subTv = TextView(this@KotlinPlayerActivity).apply {
                    text = subtitle
                    setTextColor(Color.parseColor("#8E8D92"))
                    textSize = 11f
                }
                textCol.addView(subTv, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(2) })
            }
            row.addView(textCol, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
            if (isSelected) {
                val check = ImageView(this@KotlinPlayerActivity).apply {
                    setImageResource(R.drawable.ic_hero_check)
                    setColorFilter(Color.parseColor("#5580FF"))
                }
                row.addView(check, LinearLayout.LayoutParams(dp(16), dp(16)).apply { leftMargin = dp(8) })
            }
            return row
        }

        fun show() {
            showOverlay(container)
            card.animate().alpha(1f).translationY(0f).setDuration(280)
                .setInterpolator(android.view.animation.DecelerateInterpolator()).start()
        }

        fun dismiss() {
            if (isDismissing) return
            isDismissing = true
            dismissActiveOverlay()
        }
    }



    private fun showQualityDropdown() {
        if (!::qualityBtn.isInitialized) return
        val items = mutableListOf<DropdownItem>()
        val exo = player
        val sources = allSources
        
        if (exo != null) {
            val tracks = exo.currentTracks
            val hasVideoOverride = exo.trackSelectionParameters.overrides.values.any { override ->
                override.type == C.TRACK_TYPE_VIDEO
            }
            
            val videoOptions = mutableListOf<VideoTrackOption>()
            for (group in tracks.groups) {
                if (group.type == C.TRACK_TYPE_VIDEO) {
                    val mediaTrackGroup = group.mediaTrackGroup
                    for (i in 0 until group.length) {
                        val format = group.getTrackFormat(i)
                        val height = format.height
                        if (height > 0) {
                            val isSelected = group.isTrackSelected(i)
                            val label = "${height}p" + (if (format.frameRate > 0) " (${format.frameRate.toInt()}fps)" else "")
                            videoOptions.add(VideoTrackOption(label, height, isSelected, mediaTrackGroup, i))
                        }
                    }
                }
            }
            
            val uniqueInternalOptions = videoOptions.distinctBy { it.label }
            
            if (uniqueInternalOptions.size > 1) {
                items.add(DropdownItem(
                    primaryText = "Auto",
                    subtitleText = "Adaptive track",
                    isSelected = !hasVideoOverride,
                    onClick = {
                        val builder = exo.trackSelectionParameters.buildUpon()
                        builder.clearOverridesOfType(C.TRACK_TYPE_VIDEO)
                        exo.trackSelectionParameters = builder.build()
                        showToastLabel("Video Quality: Auto")
                    }
                ))
                
                uniqueInternalOptions.forEach { opt ->
                    items.add(DropdownItem(
                        primaryText = "${opt.height}p",
                        subtitleText = if (opt.label.contains("fps")) opt.label.substringAfter("p").trim().replace("(", "").replace(")", "") else "Adaptive track",
                        isSelected = opt.isSelected,
                        onClick = {
                            val builder = exo.trackSelectionParameters.buildUpon()
                            builder.clearOverridesOfType(C.TRACK_TYPE_VIDEO)
                            if (opt.group != null) {
                                builder.addOverride(androidx.media3.common.TrackSelectionOverride(opt.group, opt.trackIndex))
                            }
                            exo.trackSelectionParameters = builder.build()
                            showToastLabel("Video Quality: ${opt.label}")
                        }
                    ))
                }
            }
        }
        
        // Group alternative links
        val alternativeOptions = mutableListOf<JSONObject>()
        if (sources != null && currentSourceIndex >= 0 && currentSourceIndex < sources.length()) {
            val currentSrc = sources.getJSONObject(currentSourceIndex)
            val currentProvider = currentSrc.optString("provider", "Unknown")
            val currentGroupBase = getGroupBase(currentSrc)

            for (i in 0 until sources.length()) {
                val s = sources.getJSONObject(i)
                val provider = s.optString("provider", "Unknown")
                val groupBase = getGroupBase(s)

                if (provider == currentProvider && groupBase == currentGroupBase) {
                    alternativeOptions.add(s)
                }
            }
        }

        if (alternativeOptions.size > 1) {
            val sortedAlts = alternativeOptions.sortedByDescending { obj ->
                getQualityResolution(obj.optString("quality", "?"))
            }

            sortedAlts.forEach { obj ->
                val quality = obj.optString("quality", "?")
                val isSplitted = quality.contains(" · ")
                val qualityTag = if (isSplitted) quality.split(" · ")[1] else "Auto"
                
                val sizeRegex = Regex("""\[?(\d+(?:\.\d+)?\s*(?:GB|MB|kb|gigabytes|megabytes))\]?""", RegexOption.IGNORE_CASE)
                val matchResult = sizeRegex.find(quality)
                val sizeTag = matchResult?.groups?.get(1)?.value
                
                var originalIdx = -1
                if (sources != null) {
                    for (i in 0 until sources.length()) {
                        if (sources.getJSONObject(i) == obj) {
                            originalIdx = i
                            break
                        }
                    }
                }

                items.add(DropdownItem(
                    primaryText = qualityTag,
                    subtitleText = sizeTag ?: "Direct Link",
                    isSelected = (originalIdx == currentSourceIndex),
                    onClick = {
                        if (originalIdx >= 0 && exo != null) {
                            autoSeekToPositionMs = exo.currentPosition
                            switchToSource(originalIdx)
                        }
                    }
                ))
            }
        }
        
        if (items.isEmpty()) {
            items.add(DropdownItem("Default Quality", "No options available", true, {}))
        }
        
        DropdownSettingsDialog("VIDEO QUALITY", qualityBtn, items).show()
    }

    private fun showEpisodesDialog() {
        EpisodesDialog().show()
        resetHideTimer()
    }

    private fun showHelpDialog() {
        HelpDialog().show()
        resetHideTimer()
    }

    private inner class HelpDialog {
        private val container: FrameLayout
        private val card: LinearLayout
        private var isDismissing = false

        init {
            container = FrameLayout(this@KotlinPlayerActivity).apply {
                setBackgroundColor(Color.TRANSPARENT)
                setOnClickListener { dismiss() }
            }

            card = LinearLayout(this@KotlinPlayerActivity).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(dp(24), dp(20), dp(24), dp(20))
                background = GradientDrawable().apply {
                    setColor(Color.parseColor("#F2141218"))
                    cornerRadius = dp(24).toFloat()
                    setStroke(dp(1), Color.parseColor("#14FFFFFF"))
                }
                setOnClickListener { /* consume */ }
            }

            val cardParams = FrameLayout.LayoutParams(dp(560), dp(360)).apply {
                gravity = Gravity.CENTER
            }
            container.addView(card, cardParams)

            val headerRow = LinearLayout(this@KotlinPlayerActivity).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setPadding(0, 0, 0, dp(12))
            }

            val header = TextView(this@KotlinPlayerActivity).apply {
                text = "PLAYER MANUAL & HELP"
                setTextColor(Color.WHITE)
                textSize = 13.5f
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
            card.addView(headerRow)

            val divider = View(this@KotlinPlayerActivity).apply {
                setBackgroundColor(Color.parseColor("#14FFFFFF"))
            }
            card.addView(divider, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(1)).apply {
                bottomMargin = dp(12)
            })

            val scrollView = android.widget.ScrollView(this@KotlinPlayerActivity).apply { isFillViewport = true }
            val listContainer = LinearLayout(this@KotlinPlayerActivity).apply { orientation = LinearLayout.VERTICAL }
            scrollView.addView(listContainer)
            card.addView(scrollView, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))

            addHelpSection(listContainer, R.drawable.ic_hero_speaker_wave, "Gestures (Brightness & Volume)", "Swipe vertically on the screen to change player levels dynamically:\n• Swipe up/down on the left half to adjust screen brightness.\n• Swipe up/down on the right half to adjust media volume.")
            addHelpSection(listContainer, R.drawable.ic_hero_forward, "Fast Seeking (Double Tap)", "Quickly jump backward or forward in time:\n• Double tap on the left side of the screen to seek backward 10 seconds.\n• Double tap on the right side of the screen to seek forward 10 seconds.")
            addHelpSection(listContainer, R.drawable.ic_hero_lock_closed, "Locking Controls", "Tap the lock icon in the top menu bar to freeze the player UI and hide all buttons, avoiding accidental clicks.\n• To unlock, tap the open-lock icon shown on the left side of the screen.")
            addHelpSection(listContainer, R.drawable.ic_hero_bolt, "Settings Options", "Access advanced options via bottom row controls:\n• Sources: Switch video links, servers, and streaming resolutions.\n• Subtitles: Select embedded or loaded external subtitle tracks.\n• Playback Speed: Slow down or speed up playback (0.25x to 2.0x).\n• Sleep Timer: Set player to close automatically in 15m, 30m, 60m, or at the end of the episode.")
            addHelpSection(listContainer, R.drawable.ic_hero_square_3_stack_3d, "Episode Browser", "For TV series, tap the 'Episodes' pill in the bottom bar to open a clean panel of episode cards. Each card displays an episode description and visual thumbnail preview. Alternatively, use the Next/Prev skip buttons in the center controls.")

            card.alpha = 0f
            card.translationY = dp(24).toFloat()
        }

        private fun addHelpSection(container: LinearLayout, iconRes: Int, title: String, description: String) {
            val sectionCard = LinearLayout(this@KotlinPlayerActivity).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(dp(16), dp(14), dp(16), dp(14))
                background = GradientDrawable().apply {
                    setColor(Color.parseColor("#0F22202A"))
                    cornerRadius = dp(16).toFloat()
                }
            }
            val rowH = LinearLayout(this@KotlinPlayerActivity).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
            }
            val icon = ImageView(this@KotlinPlayerActivity).apply {
                setImageResource(iconRes)
                setColorFilter(Color.parseColor("#5580FF"))
            }
            rowH.addView(icon, LinearLayout.LayoutParams(dp(20), dp(20)))
            val titleTv = TextView(this@KotlinPlayerActivity).apply {
                text = title
                setTextColor(Color.WHITE)
                textSize = 13f
                typeface = android.graphics.Typeface.DEFAULT_BOLD
                setPadding(dp(10), 0, 0, 0)
            }
            rowH.addView(titleTv)
            sectionCard.addView(rowH)
            val descTv = TextView(this@KotlinPlayerActivity).apply {
                text = description
                setTextColor(Color.parseColor("#A0A0A5"))
                textSize = 11f
                setLineSpacing(0f, 1.25f)
            }
            sectionCard.addView(descTv, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
                topMargin = dp(8); leftMargin = dp(30)
            })
            container.addView(sectionCard, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
                bottomMargin = dp(12)
            })
        }

        fun show() {
            showOverlay(container)
            card.animate().alpha(1f).translationY(0f).setDuration(280)
                .setInterpolator(android.view.animation.DecelerateInterpolator()).start()
        }

        fun dismiss() {
            if (isDismissing) return
            isDismissing = true
            dismissActiveOverlay()
        }
    }








    private inner class PlayerSettingsDialog(private val startCategory: String = "Quality") {
        private var activeCategory = if (startCategory == "Quality") "Sources" else startCategory
        private var torrentExpanded = false
        private lateinit var optionsContainer: LinearLayout
        private lateinit var categoryList: LinearLayout
        private lateinit var titleTv: TextView
        private val container: FrameLayout
        private val card: LinearLayout
        private var isDismissing = false

        init {
            container = FrameLayout(this@KotlinPlayerActivity).apply {
                setBackgroundColor(Color.TRANSPARENT)
                setOnClickListener { /* consume — settings panel closes only via X button */ }
            }

            card = LinearLayout(this@KotlinPlayerActivity).apply {
                orientation = LinearLayout.HORIZONTAL
                background = GradientDrawable().apply {
                    setColor(Color.parseColor("#A5050505"))
                    cornerRadius = dp(20).toFloat()
                    setStroke(dp(1), Color.parseColor("#14FFFFFF"))
                }
                setOnClickListener { /* consume */ }
            }
            val cardParams = FrameLayout.LayoutParams(dp(540), dp(320)).apply { gravity = Gravity.CENTER }
            container.addView(card, cardParams)

            categoryList = LinearLayout(this@KotlinPlayerActivity).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER_HORIZONTAL
                setPadding(0, dp(16), 0, dp(16))
                background = GradientDrawable().apply { setColor(Color.parseColor("#1A000000")) }
            }
            card.addView(categoryList, LinearLayout.LayoutParams(dp(180), LinearLayout.LayoutParams.MATCH_PARENT))

            val divider = View(this@KotlinPlayerActivity).apply { setBackgroundColor(Color.parseColor("#14FFFFFF")) }
            card.addView(divider, LinearLayout.LayoutParams(dp(1), LinearLayout.LayoutParams.MATCH_PARENT))

            val rightLayout = LinearLayout(this@KotlinPlayerActivity).apply { orientation = LinearLayout.VERTICAL }
            card.addView(rightLayout, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.MATCH_PARENT, 1f))

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

            val scrollView = android.widget.ScrollView(this@KotlinPlayerActivity).apply { isFillViewport = true }
            optionsContainer = LinearLayout(this@KotlinPlayerActivity).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(dp(20), dp(8), dp(20), dp(16))
            }
            scrollView.addView(optionsContainer, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT))
            rightLayout.addView(scrollView, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))

            refreshCategories()
            showCategoryOptions()

            card.alpha = 0f
            card.translationY = dp(24).toFloat()
        }

        private fun refreshCategories() {
            categoryList.removeAllViews()
            val categories = mutableListOf("Sources", "Video Quality", "Audio Track", "Subtitles", "Sleep Timer", "Playback Speed", "Swipe Gestures")
            
            categories.forEach { cat ->
                val iconRes = when (cat) {
                    "Sources" -> R.drawable.ic_hero_square_3_stack_3d
                    "Video Quality" -> R.drawable.ic_hero_arrows_pointing_out
                    "Audio Track" -> R.drawable.ic_hero_speaker_wave
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
                        setColor(Color.parseColor("#1A5580FF")) // 10% opaque accentLight (#5580FF)
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
                    setColorFilter(if (activeCategory == cat) Color.parseColor("#5580FF") else Color.parseColor("#8E8D92"))
                }
                tabRow.addView(iconView, LinearLayout.LayoutParams(dp(16), dp(16)))
                
                val titleTvTab = TextView(this@KotlinPlayerActivity).apply {
                    text = cat.uppercase()
                    setTextColor(if (activeCategory == cat) Color.parseColor("#5580FF") else Color.parseColor("#8E8D92"))
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
                "Sources" -> populateQualityOptions()
                "Video Quality" -> populateVideoQualityOptions()
                "Audio Track" -> populateAudioTrackOptions()
                "Subtitles" -> populateSubtitleOptions()
                "Sleep Timer" -> populateSleepTimerOptions()
                "Playback Speed" -> populateSpeedOptions()
                "Swipe Gestures" -> populateSwipeGesturesOptions()
            }
        }

        private fun populateAudioTrackOptions() {
            val exo = player
            if (exo == null) {
                val tv = TextView(this@KotlinPlayerActivity).apply {
                    text = "Player not ready"
                    setTextColor(Color.parseColor("#A0A0A5"))
                    textSize = 13f
                    gravity = Gravity.CENTER
                    setPadding(dp(16), dp(24), dp(16), dp(16))
                }
                optionsContainer.addView(tv)
                return
            }

            val tracks = exo.currentTracks
            data class AudioOption(val label: String, val lang: String, val channelCount: Int, val isSelected: Boolean, val group: androidx.media3.common.TrackGroup?, val trackIndex: Int)

            val audioOptions = mutableListOf<AudioOption>()
            for (group in tracks.groups) {
                if (group.type == C.TRACK_TYPE_AUDIO) {
                    val mediaGroup = group.mediaTrackGroup
                    for (i in 0 until group.length) {
                        val format = group.getTrackFormat(i)
                        val lang = format.language?.uppercase() ?: "UND"
                        val label = format.label?.takeIf { it.isNotEmpty() } ?: lang
                        val channels = format.channelCount
                        val codecDesc = when {
                            format.sampleMimeType?.contains("eac3") == true -> "Dolby Digital+"
                            format.sampleMimeType?.contains("ac3") == true -> "Dolby Digital"
                            format.sampleMimeType?.contains("dts") == true -> "DTS"
                            format.sampleMimeType?.contains("opus") == true -> "Opus"
                            format.sampleMimeType?.contains("vorbis") == true -> "Vorbis"
                            format.sampleMimeType?.contains("mp4a") == true -> "AAC"
                            else -> format.sampleMimeType?.substringAfterLast("/")?.uppercase() ?: ""
                        }
                        val channelLabel = when (channels) {
                            1 -> "Mono"
                            2 -> "Stereo"
                            6 -> "5.1"
                            8 -> "7.1"
                            else -> if (channels > 0) "${channels}ch" else ""
                        }
                        val displayLabel = buildString {
                            append(label)
                            if (label != lang && lang != "UND") append(" ($lang)")
                        }
                        val subLabel = listOf(channelLabel, codecDesc).filter { it.isNotEmpty() }.joinToString(" · ")
                        val isSelected = group.isTrackSelected(i)
                        audioOptions.add(AudioOption(displayLabel, subLabel, channels, isSelected, mediaGroup, i))
                    }
                }
            }

            if (audioOptions.isEmpty()) {
                val tv = TextView(this@KotlinPlayerActivity).apply {
                    text = "No audio track info available.\nThis stream may have a single embedded audio track."
                    setTextColor(Color.parseColor("#8E8D92"))
                    textSize = 13f
                    setPadding(dp(4), dp(16), dp(4), dp(8))
                    setLineSpacing(0f, 1.4f)
                }
                optionsContainer.addView(tv)
                return
            }

            audioOptions.forEach { opt ->
                val row = LinearLayout(this@KotlinPlayerActivity).apply {
                    orientation = LinearLayout.VERTICAL
                    setPadding(dp(12), dp(10), dp(12), dp(10))
                    background = if (opt.isSelected) GradientDrawable().apply {
                        setColor(Color.parseColor("#1A5580FF"))
                        cornerRadius = dp(12).toFloat()
                    } else null
                    setOnClickListener {
                        val builder = exo.trackSelectionParameters.buildUpon()
                        builder.clearOverridesOfType(C.TRACK_TYPE_AUDIO)
                        if (opt.group != null) {
                            builder.addOverride(androidx.media3.common.TrackSelectionOverride(opt.group, opt.trackIndex))
                        }
                        exo.trackSelectionParameters = builder.build()
                        showToastLabel("Audio: ${opt.label}")
                        dismiss()
                    }
                }
                addPremiumTouchAnimation(row)

                val innerRow = LinearLayout(this@KotlinPlayerActivity).apply {
                    orientation = LinearLayout.HORIZONTAL
                    gravity = Gravity.CENTER_VERTICAL
                }
                val labelTv = TextView(this@KotlinPlayerActivity).apply {
                    text = opt.label
                    setTextColor(if (opt.isSelected) Color.parseColor("#5580FF") else Color.WHITE)
                    textSize = 14f
                    typeface = if (opt.isSelected) android.graphics.Typeface.DEFAULT_BOLD else android.graphics.Typeface.DEFAULT
                }
                innerRow.addView(labelTv, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
                if (opt.isSelected) {
                    val check = ImageView(this@KotlinPlayerActivity).apply {
                        setImageResource(R.drawable.ic_hero_check)
                        setColorFilter(Color.parseColor("#5580FF"))
                    }
                    innerRow.addView(check, LinearLayout.LayoutParams(dp(16), dp(16)))
                }
                row.addView(innerRow, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))

                if (opt.lang.isNotEmpty()) {
                    val subTv = TextView(this@KotlinPlayerActivity).apply {
                        text = opt.lang
                        setTextColor(Color.parseColor("#8E8D92"))
                        textSize = 11f
                    }
                    row.addView(subTv, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(2) })
                }

                optionsContainer.addView(row)
            }
        }

        private fun populateQualityOptions() {
            val sources = allSources
            if (sources == null || sources.length() == 0) {
                val emptyTv = TextView(this@KotlinPlayerActivity).apply {
                    text = "No sources available"
                    setTextColor(Color.WHITE)
                    textSize = 14f
                    gravity = Gravity.CENTER
                }
                optionsContainer.addView(emptyTv)
                return
            }

            // Group by provider + getGroupBase()
            val groups = mutableMapOf<String, MutableList<Pair<Int, JSONObject>>>()
            for (i in 0 until sources.length()) {
                val s = sources.getJSONObject(i)
                val provider = s.optString("provider", "Unknown")
                val groupBase = getGroupBase(s)
                val key = "$provider|||$groupBase"
                if (!groups.containsKey(key)) groups[key] = mutableListOf()
                groups[key]!!.add(Pair(i, s))
            }

            val directGroups = mutableListOf<MutableList<Pair<Int, JSONObject>>>()
            val torrentGroups = mutableListOf<MutableList<Pair<Int, JSONObject>>>()

            groups.values.forEach { groupSources ->
                // Sort sources in the group by quality resolution descending
                groupSources.sortByDescending { pair ->
                    getQualityResolution(pair.second.optString("quality", "?"))
                }
                val first = groupSources.first().second
                val type = first.optString("type", "").lowercase()
                val url = first.optString("url", "").lowercase()
                if (type == "torrent" || url.startsWith("magnet:")) {
                    torrentGroups.add(groupSources)
                } else {
                    directGroups.add(groupSources)
                }
            }

            // Render direct groups
            directGroups.forEachIndexed { idx, groupSources ->
                val primarySourcePair = groupSources.first()
                val originalIndex = primarySourcePair.first
                val s = primarySourcePair.second
                
                val isGroupSelected = groupSources.any { it.first == currentSourceIndex }

                val availableQualities = groupSources.map { pair ->
                    extractResolutionTag(pair.second)
                }.distinct()

                val row = createOptionSourceRow(s, if (isGroupSelected) currentSourceIndex else originalIndex, idx == 0, availableQualities) {
                    currentSourceIndex = originalIndex
                    switchToSource(originalIndex)
                    dismiss()
                }
                optionsContainer.addView(row)
            }

            // Render torrent accordion groups
            if (torrentGroups.isNotEmpty()) {
                val torrentContainer = LinearLayout(this@KotlinPlayerActivity).apply {
                    orientation = LinearLayout.VERTICAL
                    visibility = if (torrentExpanded) View.VISIBLE else View.GONE
                }

                torrentGroups.forEachIndexed { idx, groupSources ->
                    val primarySourcePair = groupSources.first()
                    val originalIndex = primarySourcePair.first
                    val s = primarySourcePair.second
                    
                    val isFirst = directGroups.isEmpty() && idx == 0
                    val isGroupSelected = groupSources.any { it.first == currentSourceIndex }

                    val availableQualities = groupSources.map { pair ->
                        extractResolutionTag(pair.second)
                    }.distinct()

                    val row = createOptionSourceRow(s, if (isGroupSelected) currentSourceIndex else originalIndex, isFirst, availableQualities) {
                        currentSourceIndex = originalIndex
                        switchToSource(originalIndex)
                        dismiss()
                    }
                    torrentContainer.addView(row)
                }

                val accordionHeader = LinearLayout(this@KotlinPlayerActivity).apply {
                    orientation = LinearLayout.HORIZONTAL
                    gravity = Gravity.CENTER_VERTICAL
                    setPadding(dp(16), dp(14), dp(16), dp(14))
                    background = GradientDrawable().apply {
                        setColor(if (torrentExpanded) Color.parseColor("#14FF4A7D") else Color.parseColor("#0AFF4A7D"))
                        cornerRadius = dp(16).toFloat()
                        setStroke(dp(1), if (torrentExpanded) Color.parseColor("#40FF4A7D") else Color.parseColor("#26FF4A7D"))
                    }
                }
                addPremiumTouchAnimation(accordionHeader)

                val downloadIcon = ImageView(this@KotlinPlayerActivity).apply {
                    setImageResource(R.drawable.ic_download)
                    setColorFilter(Color.parseColor("#FF4A7D"))
                }
                accordionHeader.addView(downloadIcon, LinearLayout.LayoutParams(dp(18), dp(18)).apply {
                    rightMargin = dp(10)
                })

                val accordionTitle = TextView(this@KotlinPlayerActivity).apply {
                    text = "Torrent & Magnet Links (${torrentGroups.size} found)"
                    setTextColor(Color.parseColor("#FF4A7D"))
                    textSize = 13f
                    typeface = android.graphics.Typeface.DEFAULT_BOLD
                }
                accordionHeader.addView(accordionTitle, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))

                val chevronIv = ImageView(this@KotlinPlayerActivity).apply {
                    setImageResource(if (torrentExpanded) R.drawable.ic_hero_chevron_up else R.drawable.ic_hero_chevron_down)
                    setColorFilter(Color.parseColor("#A0A0A5"))
                }
                accordionHeader.addView(chevronIv, LinearLayout.LayoutParams(dp(16), dp(16)))

                accordionHeader.setOnClickListener {
                    torrentExpanded = !torrentExpanded
                    torrentContainer.visibility = if (torrentExpanded) View.VISIBLE else View.GONE
                    chevronIv.setImageResource(if (torrentExpanded) R.drawable.ic_hero_chevron_up else R.drawable.ic_hero_chevron_down)
                    accordionHeader.background = GradientDrawable().apply {
                        setColor(if (torrentExpanded) Color.parseColor("#14FF4A7D") else Color.parseColor("#0AFF4A7D"))
                        cornerRadius = dp(16).toFloat()
                        setStroke(dp(1), if (torrentExpanded) Color.parseColor("#40FF4A7D") else Color.parseColor("#26FF4A7D"))
                    }
                }

                val headerLp = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply {
                    topMargin = dp(8)
                    bottomMargin = dp(4)
                }
                optionsContainer.addView(accordionHeader, headerLp)
                optionsContainer.addView(torrentContainer)
            }
        }

        private fun populateVideoQualityOptions() {
            val exo = player
            if (exo == null) {
                val emptyTv = TextView(this@KotlinPlayerActivity).apply {
                    text = "Player not ready"
                    setTextColor(Color.WHITE)
                    textSize = 14f
                    gravity = Gravity.CENTER
                }
                optionsContainer.addView(emptyTv)
                return
            }

            val tracks = exo.currentTracks
            val videoOptions = mutableListOf<VideoTrackOption>()

            val hasVideoOverride = exo.trackSelectionParameters.overrides.values.any { override ->
                override.type == C.TRACK_TYPE_VIDEO
            }

            videoOptions.add(VideoTrackOption(
                label = "Auto (Adaptive)",
                height = -1,
                isSelected = !hasVideoOverride,
                group = null,
                trackIndex = -1
            ))

            for (group in tracks.groups) {
                if (group.type == C.TRACK_TYPE_VIDEO) {
                    val mediaTrackGroup = group.mediaTrackGroup
                    for (i in 0 until group.length) {
                        val format = group.getTrackFormat(i)
                        val height = format.height
                        if (height > 0) {
                            val isSelected = group.isTrackSelected(i)
                            val cleanLabel = "${height}p" + (if (format.frameRate > 0) " (${format.frameRate.toInt()}fps)" else "")
                            videoOptions.add(VideoTrackOption(
                                label = cleanLabel,
                                height = height,
                                isSelected = isSelected,
                                group = mediaTrackGroup,
                                trackIndex = i
                            ))
                        }
                    }
                }
            }

            val uniqueInternalOptions = videoOptions.distinctBy { it.label }
            val listToRender = mutableListOf<QualityRowItem>()

            if (uniqueInternalOptions.size > 1) {
                uniqueInternalOptions.forEach { opt ->
                    listToRender.add(QualityRowItem(
                        label = opt.label,
                        isSelected = opt.isSelected,
                        action = {
                            val builder = exo.trackSelectionParameters.buildUpon()
                            if (opt.group == null) {
                                builder.clearOverridesOfType(C.TRACK_TYPE_VIDEO)
                            } else {
                                builder.clearOverridesOfType(C.TRACK_TYPE_VIDEO)
                                builder.addOverride(androidx.media3.common.TrackSelectionOverride(opt.group, opt.trackIndex))
                            }
                            exo.trackSelectionParameters = builder.build()
                            showToastLabel("Video Quality: ${opt.label}")
                            dismiss()
                        }
                    ))
                }
            }

            // Group alternative links
            val sources = allSources
            val alternativeOptions = mutableListOf<JSONObject>()
            if (sources != null && currentSourceIndex >= 0 && currentSourceIndex < sources.length()) {
                val currentSrc = sources.getJSONObject(currentSourceIndex)
                val currentProvider = currentSrc.optString("provider", "Unknown")
                val currentGroupBase = getGroupBase(currentSrc)

                for (i in 0 until sources.length()) {
                    val s = sources.getJSONObject(i)
                    val provider = s.optString("provider", "Unknown")
                    val groupBase = getGroupBase(s)

                    if (provider == currentProvider && groupBase == currentGroupBase) {
                        alternativeOptions.add(s)
                    }
                }
            }

            if (alternativeOptions.size > 1) {
                val sortedAlts = alternativeOptions.sortedByDescending { obj ->
                    getQualityResolution(obj.optString("quality", "?"))
                }

                sortedAlts.forEach { obj ->
                    val quality = obj.optString("quality", "?")
                    val isSplitted = quality.contains(" · ")
                    val qualityTag = if (isSplitted) quality.split(" · ")[1] else "Auto"
                    
                    val sizeRegex = Regex("""\[?(\d+(?:\.\d+)?\s*(?:GB|MB|kb|gigabytes|megabytes))\]?""", RegexOption.IGNORE_CASE)
                    val matchResult = sizeRegex.find(quality)
                    val sizeTag = matchResult?.groups?.get(1)?.value
                    
                    val label = qualityTag + (if (sizeTag != null) " [$sizeTag]" else "") + " (Link)"
                    
                    var originalIdx = -1
                    if (sources != null) {
                        for (i in 0 until sources.length()) {
                            if (sources.getJSONObject(i) == obj) {
                                originalIdx = i
                                break
                            }
                        }
                    }

                    val isSelected = (originalIdx == currentSourceIndex)

                    listToRender.add(QualityRowItem(
                        label = label,
                        isSelected = isSelected,
                        action = {
                            if (originalIdx >= 0) {
                                autoSeekToPositionMs = exo.currentPosition
                                switchToSource(originalIdx)
                            }
                            dismiss()
                        }
                    ))
                }
            }

            if (listToRender.isEmpty() || (listToRender.size == 1 && listToRender.first().label.contains("Auto"))) {
                val infoTv = TextView(this@KotlinPlayerActivity).apply {
                    text = "Default Quality"
                    setTextColor(Color.parseColor("#A0A0A5"))
                    textSize = 13f
                    gravity = Gravity.CENTER
                    setPadding(dp(16), dp(16), dp(16), dp(16))
                }
                optionsContainer.addView(infoTv)
                return
            }

            listToRender.forEach { item ->
                val row = createOptionRow(item.label, item.isSelected) {
                    item.action()
                }
                optionsContainer.addView(row)
            }
        }

        private fun createOptionSourceRow(
            source: JSONObject,
            index: Int,
            isFirstSource: Boolean,
            availableQualities: List<String>,
            onClick: () -> Unit
        ): LinearLayout {
            val quality = source.optString("quality", "?")
            val host = source.optString("host", "")
            val type = source.optString("type", "")
            val url = source.optString("url", "")
            val provider = source.optString("provider", "")
            val headers = source.optJSONObject("headers")

            val hostName = getGroupBase(source)
            val qualityTag = extractResolutionTag(source)
            val hasHeaders = headers != null && headers.length() > 0
            val protocolLabel = getProtocolLabel(type, url)

            val isTorrentSource = type.lowercase() == "torrent" || url.lowercase().startsWith("magnet:")
            val torrentSeeders = if (source.has("seeders")) source.optInt("seeders", -1) else -1

            val isSelected = (index == currentSourceIndex)

            val row = LinearLayout(this@KotlinPlayerActivity).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setPadding(dp(12), dp(10), dp(12), dp(10))
                background = if (isSelected) GradientDrawable().apply {
                    setColor(Color.parseColor("#1A5580FF"))
                    cornerRadius = dp(12).toFloat()
                } else null
                setOnClickListener { onClick() }
            }
            addPremiumTouchAnimation(row)

            val hostNameTv = TextView(this@KotlinPlayerActivity).apply {
                text = hostName
                setTextColor(if (isSelected) Color.parseColor("#5580FF") else Color.WHITE)
                textSize = 14f
                typeface = if (isSelected) android.graphics.Typeface.DEFAULT_BOLD else android.graphics.Typeface.DEFAULT
            }
            row.addView(hostNameTv, LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                rightMargin = dp(8)
            })

            // Scrollable Badges container
            val badgesContainer = android.widget.HorizontalScrollView(this@KotlinPlayerActivity).apply {
                isHorizontalScrollBarEnabled = false
                overScrollMode = View.OVER_SCROLL_NEVER
            }
            val badgesLayout = LinearLayout(this@KotlinPlayerActivity).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
            }
            badgesContainer.addView(badgesLayout)

            val badgeLp = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                rightMargin = dp(6)
            }

            // 1. Quality Tag Badges (render all available resolutions in the group)
            val qualitiesToRender = if (availableQualities.isNotEmpty()) availableQualities else listOf(qualityTag)
            qualitiesToRender.distinct().forEach { tag ->
                val qualityBadge = createBadgeView(
                    tag,
                    Color.WHITE,
                    getQualityBadgeBg(tag)
                )
                badgesLayout.addView(qualityBadge, badgeLp)
            }

            // 2. Protocol Badge
            val protocolBadge = createBadgeView(
                protocolLabel,
                Color.parseColor("#A0A0A5"),
                Color.parseColor("#14FFFFFF")
            )
            badgesLayout.addView(protocolBadge, badgeLp)

            // 3. Torrent Seeders Badge
            if (isTorrentSource && torrentSeeders > 0) {
                val seedBg = when {
                    torrentSeeders >= 50 -> Color.parseColor("#1E22C55E")
                    torrentSeeders >= 10 -> Color.parseColor("#1AEAB308")
                    else -> Color.parseColor("#0FFFFFFF")
                }
                val seedBorder = when {
                    torrentSeeders >= 50 -> Color.parseColor("#4D22C55E")
                    torrentSeeders >= 10 -> Color.parseColor("#40EAB308")
                    else -> Color.parseColor("#1AFFFFFF")
                }
                val seedText = when {
                    torrentSeeders >= 50 -> Color.parseColor("#22c55e")
                    torrentSeeders >= 10 -> Color.parseColor("#eab308")
                    else -> Color.parseColor("#a0a0a5")
                }
                val seedersBadge = LinearLayout(this@KotlinPlayerActivity).apply {
                    orientation = LinearLayout.HORIZONTAL
                    gravity = Gravity.CENTER_VERTICAL
                    setPadding(dp(6), dp(2), dp(6), dp(2))
                    background = GradientDrawable().apply {
                        setColor(seedBg)
                        cornerRadius = dp(6).toFloat()
                        setStroke(dp(1), seedBorder)
                    }
                }
                val seedIcon = ImageView(this@KotlinPlayerActivity).apply {
                    setImageResource(R.drawable.ic_download)
                    setColorFilter(seedText)
                    setPadding(0, 0, dp(2), 0)
                }
                seedersBadge.addView(seedIcon, LinearLayout.LayoutParams(dp(10), dp(10)).apply {
                    rightMargin = dp(2)
                })
                val seedNumTv = TextView(this@KotlinPlayerActivity).apply {
                    text = "$torrentSeeders"
                    setTextColor(seedText)
                    textSize = 10f
                    typeface = android.graphics.Typeface.DEFAULT_BOLD
                }
                seedersBadge.addView(seedNumTv)
                badgesLayout.addView(seedersBadge, badgeLp)
            }

            // 4. Provider Badge
            if (provider.isNotEmpty()) {
                val providerBadge = createBadgeView(
                    provider,
                    Color.parseColor("#5580FF"),
                    Color.parseColor("#1A5580FF"),
                    Color.parseColor("#335580FF")
                )
                badgesLayout.addView(providerBadge, badgeLp)
            }

            // 5. Headers Badge
            if (hasHeaders) {
                val headersBadge = createBadgeView(
                    "Headers",
                    Color.parseColor("#5580FF"),
                    Color.parseColor("#140047FF"),
                    Color.parseColor("#330047FF")
                )
                badgesLayout.addView(headersBadge, badgeLp)
            }

            // 7. Subs Badge
            val subsCount = allSubtitles?.length() ?: 0
            if (subsCount > 0 && isFirstSource) {
                val subsBadge = createBadgeView(
                    "Subs",
                    Color.parseColor("#A0A0A5"),
                    Color.parseColor("#0DFFFFFF")
                )
                badgesLayout.addView(subsBadge, badgeLp)
            }

            // 8. Audio Language Badge (from currently playing ExoPlayer track)
            if (isSelected) {
                val exo = player
                if (exo != null) {
                    val tracks = exo.currentTracks
                    for (group in tracks.groups) {
                        if (group.type == C.TRACK_TYPE_AUDIO) {
                            for (i in 0 until group.length) {
                                if (group.isTrackSelected(i)) {
                                    val format = group.getTrackFormat(i)
                                    val lang = format.language?.uppercase()
                                    if (!lang.isNullOrEmpty() && lang != "UND") {
                                        val audioBadge = createBadgeView(
                                            "🔊 $lang",
                                            Color.parseColor("#E5E2E3"),
                                            Color.parseColor("#14FFFFFF")
                                        )
                                        badgesLayout.addView(audioBadge, badgeLp)
                                    }
                                    break
                                }
                            }
                            break
                        }
                    }
                }
            }


            row.addView(badgesContainer, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                rightMargin = dp(8)
            })

            if (isSelected) {
                val check = ImageView(this@KotlinPlayerActivity).apply {
                    setImageResource(R.drawable.ic_hero_check)
                    setColorFilter(Color.parseColor("#5580FF"))
                }
                row.addView(check, LinearLayout.LayoutParams(dp(16), dp(16)).apply {
                    gravity = Gravity.CENTER_VERTICAL
                })
            }

            return row
        }

        private fun createBadgeView(
            text: String,
            textColor: Int,
            bgColor: Int,
            borderColor: Int? = null
        ): TextView {
            return TextView(this@KotlinPlayerActivity).apply {
                this.text = text
                this.setTextColor(textColor)
                this.textSize = 10f
                this.typeface = android.graphics.Typeface.DEFAULT_BOLD
                this.setPadding(dp(6), dp(2), dp(6), dp(2))
                this.background = GradientDrawable().apply {
                    setColor(bgColor)
                    cornerRadius = dp(6).toFloat()
                    if (borderColor != null) {
                        setStroke(dp(1), borderColor)
                    }
                }
            }
        }

        private fun populateSubtitleOptions() {
            val subs = allSubtitles
            val totalSubs = (subs?.length() ?: 0)
            
            val isOffSelected = (currentSubtitleIndex < 0)
            val offRow = createOptionRow("Subtitle Off", isOffSelected) {
                currentSubtitleIndex = -1
                onlineSubtitleUrl = ""
                switchToSource(currentSourceIndex)
                subBtnTint(true)
                showToastLabel("Subtitles: Off")
                dismiss()
            }
            optionsContainer.addView(offRow)

            // Show online subtitle status if one is active
            if (currentSubtitleIndex == -2 && onlineSubtitleUrl.isNotEmpty()) {
                val name = onlineSubtitleUrl.substringAfterLast("/").take(40)
                val row = createOptionRow(name, true) { /* already active */ }
                optionsContainer.addView(row)
            }

            if (subs != null) {
                for (i in 0 until totalSubs) {
                    val sub = subs.getJSONObject(i)
                    val lang = sub.optString("lang", "?")
                    val isSelected = (i == currentSubtitleIndex)

                    val row = createOptionRow(lang, isSelected) {
                        currentSubtitleIndex = i
                        onlineSubtitleUrl = ""
                        switchToSource(currentSourceIndex)
                        subBtnTint(false)
                        showToastLabel("Subtitles: $lang")
                        dismiss()
                    }
                    optionsContainer.addView(row)
                }
            }

            // Shortcut to open online search dialog
            val searchRow = createOptionRow("🔍 Search Online / Add File…", false) {
                dismiss()
                SubtitleSearchDialog().show()
            }
            optionsContainer.addView(searchRow)
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
                    setColor(Color.parseColor("#1A5580FF"))
                    cornerRadius = dp(12).toFloat()
                } else null
                setOnClickListener { onClick() }
            }
            addPremiumTouchAnimation(row)

            val tv = TextView(this@KotlinPlayerActivity).apply {
                this.text = text
                setTextColor(if (isSelected) Color.parseColor("#5580FF") else Color.WHITE)
                textSize = 14f
                typeface = if (isSelected) android.graphics.Typeface.DEFAULT_BOLD else android.graphics.Typeface.DEFAULT
            }
            row.addView(tv, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))

            if (isSelected) {
                val check = ImageView(this@KotlinPlayerActivity).apply {
                    setImageResource(R.drawable.ic_hero_check)
                    setColorFilter(Color.parseColor("#5580FF"))
                }
                row.addView(check, LinearLayout.LayoutParams(dp(16), dp(16)))
            }

            return row
        }
        fun show() {
            showOverlay(container)
            card.animate().alpha(1f).translationY(0f).setDuration(280)
                .setInterpolator(android.view.animation.DecelerateInterpolator()).start()
        }

        fun dismiss() {
            if (isDismissing) return
            isDismissing = true
            dismissActiveOverlay()
        }
    }

    private fun updateGesturesButtonState() {
        if (::gesturesBtn.isInitialized) {
            gesturesBtn.setColorFilter(if (gesturesEnabled) Color.WHITE else Color.parseColor("#66FFFFFF"))
        }
    }

    private inner class EpisodesDialog {
        private val container: FrameLayout
        private val card: LinearLayout
        private var isDismissing = false

        init {
            container = FrameLayout(this@KotlinPlayerActivity).apply {
                setBackgroundColor(Color.TRANSPARENT)
                setOnClickListener { dismiss() }
            }

            card = LinearLayout(this@KotlinPlayerActivity).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(dp(20), dp(16), dp(20), dp(16))
                background = GradientDrawable().apply {
                    setColor(Color.parseColor("#A5050505")) // 65% opaque pitch black
                    cornerRadius = dp(20).toFloat()
                    setStroke(dp(1), Color.parseColor("#14FFFFFF")) // Thin glass border
                }
                setOnClickListener { /* consume */ }
            }
            val cardLp = FrameLayout.LayoutParams(dp(540), dp(340)).apply { gravity = Gravity.CENTER }
            container.addView(card, cardLp)

            val root = card
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
                            setColor(Color.parseColor("#1A5580FF"))
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
                            setColorFilter(Color.parseColor("#5580FF"))
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
                        setTextColor(if (isSelected) Color.parseColor("#5580FF") else Color.parseColor("#8E8D92"))
                        textSize = 10f
                        typeface = android.graphics.Typeface.DEFAULT_BOLD
                    }
                    textContainer.addView(metaTv)

                    val titleTv = TextView(this@KotlinPlayerActivity).apply {
                        text = if (label.isNotEmpty()) label else "Episode $epNum"
                        setTextColor(if (isSelected) Color.parseColor("#5580FF") else Color.WHITE)
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

        fun show() {
            showOverlay(container)
            card.animate().alpha(1f).translationY(0f).setDuration(280)
                .setInterpolator(android.view.animation.DecelerateInterpolator()).start()
        }

        fun dismiss() {
            if (isDismissing) return
            isDismissing = true
            dismissActiveOverlay()
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

    private fun checkAndPlay(url: String, headersJson: String, subtitleUrl: String) {
        // Local torrent stream URL served by our own HTTP server. This happens when
        // the JS side pre-buffered the torrent and started the server, OR when the
        // user retries a playback error while the server is still alive. In both
        // cases do NOT stopStream() (that kills the server) and do NOT re-resolve —
        // just play the URL directly.
        val isLocalStream = url.startsWith("http://127.0.0.1:") && url.contains("/stream")
        val serverAlive =
            isLocalStream && TorrentStreamer.getInstance(this).streamUrl == url
        if (isLocalStream && (isPreStartedTorrent || serverAlive)) {
            isPreStartedTorrent = false // one-shot: consumed
            rebuildPlayer(url, headersJson, subtitleUrl)
            return
        }

        val isTorrent = url.startsWith("magnet:") || url.lowercase(Locale.US).contains("torrent")
        if (isTorrent) {
            startTorrentResolution(url, headersJson, subtitleUrl)
        } else {
            torrentJob?.cancel()
            torrentJob = null
            try { TorrentStreamer.getInstance(this).stopStream() } catch (_: Exception) {}
            rebuildPlayer(url, headersJson, subtitleUrl)
        }
    }

    private fun startTorrentResolution(magnetUrl: String, headersJson: String, subtitleUrl: String) {
        val isInitial = (player == null)
        torrentJob?.cancel()

        var isCancelled = false
        showTorrentLoadingOverlay(magnetUrl) {
            isCancelled = true
            torrentJob?.cancel()
            CoroutineScope(Dispatchers.IO).launch {
                TorrentStreamer.getInstance(this@KotlinPlayerActivity).stopStream()
            }
            hideTorrentLoadingOverlay()
            if (isInitial) {
                finish()
            } else {
                showSourcesGrid()
            }
        }

        val overlay = torrentLoadingOverlay ?: return
        val card = (overlay.getChildAt(0) as? ViewGroup) ?: return
        val titleTv = card.getChildAt(1) as TextView
        val statsTv = card.getChildAt(2) as TextView

        torrentJob = CoroutineScope(Dispatchers.Main).launch {
            try {
                titleTv.text = "Resolving Metadata..."
                statsTv.text = "Searching for seeds..."

                var info: TorrentStreamInfo? = null
                withContext(Dispatchers.IO) {
                    info = TorrentStreamer.getInstance(this@KotlinPlayerActivity).startStream(magnetUrl)
                }

                if (isCancelled || info == null) return@launch

                titleTv.text = "Buffering Video..."

                val streamer = TorrentStreamer.getInstance(this@KotlinPlayerActivity)
                var status = streamer.getStatus()

                // Wait until we have at least 0.1% buffered before launching the player.
                // Previously this was 1.0% which meant 40MB on a 4GB file before ExoPlayer
                // even started — 30-120s of silent waiting. ExoPlayer handles the rest via
                // HTTP range requests to our local server.
                while (status.progress < 0.1f && !isCancelled) {
                    val speedKb = status.downloadRate / 1024
                    val speedText = if (speedKb > 1024) String.format(Locale.US, "%.2f MB/s", speedKb.toFloat() / 1024f) else "$speedKb KB/s"
                    statsTv.text = String.format(Locale.US, "Peers: %d  ·  Speed: %s  ·  Buffered: %.1f%%", status.numPeers, speedText, status.progress)
                    delay(1000)
                    status = streamer.getStatus()
                }

                if (isCancelled) return@launch

                hideTorrentLoadingOverlay()
                rebuildPlayer(info.streamUrl, headersJson, subtitleUrl)

            } catch (e: Exception) {
                if (isCancelled || e is CancellationException) return@launch
                if (isFinishing || isDestroyed) return@launch
                Log.e("KotlinPlayerActivity", "Torrent stream error", e)
                hideTorrentLoadingOverlay()
                showError("Torrent error: ${e.localizedMessage}", providerName, getCurrentMediaRef())
            }
        }
    }

    private fun showTorrentLoadingOverlay(magnetUrl: String, onCancel: () -> Unit) {
        hideTorrentLoadingOverlay()

        val overlay = FrameLayout(this).apply {
            setBackgroundColor(Color.parseColor("#80050505")) // 50% opaque dark glass — lets blurred backdrop show through
            isClickable = true
            isFocusable = true
            alpha = 0f
        }

        val card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(dp(32), dp(28), dp(32), dp(28))
            background = GradientDrawable().apply {
                setColor(Color.parseColor("#B3141218")) // 70% glass card
                cornerRadius = dp(20).toFloat()
                setStroke(dp(1), Color.parseColor("#1AFFFFFF"))
            }
        }

        // Progress Spinner
        val pb = ProgressBar(this).apply {
            indeterminateTintList = ColorStateList.valueOf(Color.parseColor("#5580FF"))
        }
        card.addView(pb, LinearLayout.LayoutParams(dp(48), dp(48)).apply { bottomMargin = dp(16) })

        val titleTv = TextView(this).apply {
            text = "Resolving Torrent..."
            setTextColor(Color.WHITE)
            textSize = 18f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
        }
        card.addView(titleTv, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))

        // Stats text
        val statsTv = TextView(this).apply {
            text = "Connecting to peers..."
            setTextColor(Color.parseColor("#A0A0A5"))
            textSize = 13f
            gravity = Gravity.CENTER
            setPadding(0, dp(8), 0, dp(20))
        }
        card.addView(statsTv, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))

        // Cancel button
        val cancelBtn = TextView(this).apply {
            text = "Cancel Playback"
            setTextColor(Color.WHITE)
            textSize = 13f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
            background = GradientDrawable().apply {
                setColor(Color.parseColor("#26FFFFFF"))
                cornerRadius = dp(14).toFloat()
            }
            setPadding(dp(24), dp(10), dp(24), dp(10))
            setOnClickListener {
                onCancel()
            }
        }
        addPremiumTouchAnimation(cancelBtn)
        card.addView(cancelBtn)

        overlay.addView(card, FrameLayout.LayoutParams(dp(360), FrameLayout.LayoutParams.WRAP_CONTENT).apply {
            gravity = Gravity.CENTER
        })

        root.addView(overlay, matchParent())
        torrentLoadingOverlay = overlay
        updateBackdropBlur(true)
        overlay.animate().alpha(1f).setDuration(250)
            .setInterpolator(android.view.animation.DecelerateInterpolator()).start()
    }

    private fun hideTorrentLoadingOverlay() {
        torrentLoadingOverlay?.let {
            torrentLoadingOverlay = null
            updateBackdropBlur(false)
            it.animate().alpha(0f).setDuration(250)
                .setInterpolator(android.view.animation.AccelerateInterpolator())
                .withEndAction { root.removeView(it) }
                .start()
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
            checkAndPlay(currentUrl, currentHeadersJson, subUrl)
        } catch (_: Exception) { }
    }


    private fun rebuildPlayer(url: String, headersJson: String, subtitleUrl: String) {
        hasShownResumePrompt = false  // Allow resume prompt for new source/episode
        resumePromptOverlay?.let { dismissActiveOverlay() }
        resumePromptOverlay = null
        player?.let { p ->
            p.stop()
            p.clearMediaItems()
        }
        playerView.player = null
        player?.release()
        player = null
        placeholderImageView?.alpha = 0.45f
        placeholderImageView?.visibility = View.VISIBLE
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            placeholderImageView?.setRenderEffect(android.graphics.RenderEffect.createBlurEffect(25f, 25f, android.graphics.Shader.TileMode.CLAMP))
        }
        setupExoPlayer(url, headersJson, subtitleUrl)
    }

    private fun updateCenterPlayPauseIcon() {
        val bufferingOrLoading = isBuffering || !isInitialLoadComplete
        if (bufferingOrLoading) {
            playPauseCenter.visibility = View.INVISIBLE
            centerPlayProgressBar.visibility = View.VISIBLE
        } else {
            playPauseCenter.visibility = View.VISIBLE
            centerPlayProgressBar.visibility = View.GONE
            player?.let { p ->
                playPauseCenter.setImageResource(
                    if (p.isPlaying) R.drawable.ic_hero_pause
                    else R.drawable.ic_hero_play
                )
            }
        }
    }

    private fun updateBuffering(buffering: Boolean) {
        isBuffering = buffering
        if (buffering) {
            updateCenterPlayPauseIcon()
            
            val isInitialLoad = (player?.currentPosition ?: 0L) < 1000L
            if (isInitialLoad) {
                loadingGroup.alpha = 1f
                loadingGroup.visibility = View.VISIBLE
                startLogoPulseAnimation()
            } else {
                // Mid-play buffer stall: show logo width loader overlay if controls are not visible
                if (!isControlsVisible) {
                    loadingGroup.alpha = 1f
                    loadingGroup.visibility = View.VISIBLE
                    startLogoPulseAnimation()
                } else {
                    loadingGroup.visibility = View.GONE
                    logoPulseAnimatorSet?.cancel()
                    logoPulseAnimatorSet = null
                }
            }
        } else {
            updateCenterPlayPauseIcon()
            
            // Buffering ended — hide overlay (STATE_READY will also hide it)
            if (loadingGroup.visibility == View.VISIBLE) {
                loadingGroup.animate()
                    .alpha(0f)
                    .setDuration(350)
                    .setListener(object : AnimatorListenerAdapter() {
                        override fun onAnimationEnd(animation: Animator) {
                            loadingGroup.visibility = View.GONE
                            loadingGroup.alpha = 1f
                            logoPulseAnimatorSet?.cancel()
                            logoPulseAnimatorSet = null
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
        topBar.animate().cancel()
        bottomBar.animate().cancel()
        centerControls.animate().cancel()
        topBar.alpha = 0f
        bottomBar.alpha = 0f
        centerControls.alpha = 0f
        topBar.visibility = View.VISIBLE
        bottomBar.visibility = View.VISIBLE
        
        prevEpBtn.visibility = if (isMovie) View.GONE else View.VISIBLE
        rewindBtn.visibility = View.VISIBLE
        playFrame.visibility = View.VISIBLE
        ffBtn.visibility = View.VISIBLE
        nextEpBtn.visibility = if (isMovie) View.GONE else View.VISIBLE
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
        if (isBuffering || !isInitialLoadComplete) {
            loadingGroup.visibility = View.VISIBLE
            startLogoPulseAnimation()
        } else {
            loadingGroup.visibility = View.GONE
        }
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

        val overlay = FrameLayout(this).apply {
            setBackgroundColor(Color.TRANSPARENT)
            setOnClickListener { /* consume */ }
        }

        val card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(dp(32), dp(28), dp(32), dp(28))
            background = GradientDrawable().apply {
                setColor(Color.parseColor("#A5050505")) // 65% opaque pitch black
                cornerRadius = dp(20).toFloat()
                setStroke(dp(1), Color.parseColor("#14FFFFFF")) // Thin glass border
            }
            setOnClickListener { /* consume */ }
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
                setColor(Color.parseColor("#5580FF")) // Accent light color (#5580FF)
                cornerRadius = dp(16).toFloat()
            }
            setPadding(dp(28), dp(14), dp(28), dp(14))
            setOnClickListener {
                player?.seekTo(savedMs)
                player?.play()
                dismissActiveOverlay()
                resumePromptOverlay = null
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
                dismissActiveOverlay()
                resumePromptOverlay = null
            }
        }
        addPremiumTouchAnimation(freshBtn)
        btnRow.addView(freshBtn)

        card.addView(btnRow)

        val cardLp = FrameLayout.LayoutParams(dp(440), FrameLayout.LayoutParams.WRAP_CONTENT).apply { gravity = Gravity.CENTER }
        overlay.addView(card, cardLp)

        card.alpha = 0f
        card.translationY = dp(24).toFloat()

        resumePromptOverlay = overlay
        showOverlay(overlay)

        card.animate().alpha(1f).translationY(0f).setDuration(280)
            .setInterpolator(android.view.animation.DecelerateInterpolator()).start()
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

        // Stop any active torrent stream download and cleanup resources
        torrentJob?.cancel()
        torrentJob = null
        try {
            TorrentStreamer.getInstance(this).stopStream()
        } catch (e: Exception) {
            Log.e("KotlinPlayerActivity", "Error stopping torrent stream in onStop: ${e.message}")
        }
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

        // If watched more than 90% or finished, we'll consider it finished and not show it in continue watching anymore
        val isFinished = (dur > 0 && pos > (dur * 0.90)) || (exo.playbackState == Player.STATE_ENDED)

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

        if (player == null && currentUrl.isNotEmpty()) {
            placeholderImageView?.alpha = 0.45f
            placeholderImageView?.visibility = View.VISIBLE
            loadingGroup.visibility = View.VISIBLE
            if (::logoContainer.isInitialized) {
                startLogoPulseAnimation()
            }
            val playUrl = getOriginalUrlToPlay()
            checkAndPlay(playUrl, currentHeadersJson, getCurrentSubtitleUrl())
        }
    }

    private fun getGroupBase(source: JSONObject): String {
        val host = source.optString("host", "")
        val quality = source.optString("quality", "")
        val raw = if (host.isNotEmpty()) host
                  else if (quality.contains(" · ")) quality.substringBefore(" · ")
                  else quality

        var name = raw
            .replace(Regex("""\s*\[.*?\]"""), "")
            .replace(Regex("""\s*[·•]\s*Server\s*\d+(?:\s*[·•]\s*backup)?\b""", RegexOption.IGNORE_CASE), "")
            .replace(Regex("""\s+Server\s*\d+\b""", RegexOption.IGNORE_CASE), "")
            .replace(Regex("""\s*[·•]\s*backup\b""", RegexOption.IGNORE_CASE), "")
            .replace(Regex("""^\s*\d{3,4}p\s*[·•]\s*""", RegexOption.IGNORE_CASE), "")
            .replace(Regex("""\s*[·•]\s*\d{3,4}p\b""", RegexOption.IGNORE_CASE), "")
            .trim()
            .replace(Regex("""[·•\-\s]+$"""), "")
            .trim()
        return if (name.isNotEmpty()) name else raw
    }

    private data class GroupedSource(
        val provider: String,
        val displayName: String,
        val primarySource: JSONObject,
        val originalIndex: Int,
        val groupSources: List<Pair<JSONObject, Int>>,
        val availableQualities: List<String>,
        val isTorrent: Boolean
    )

    private fun getGroupedSources(): List<GroupedSource> {
        val sources = allSources ?: return emptyList()
        val groups = mutableMapOf<String, MutableList<Pair<JSONObject, Int>>>()
        
        for (i in 0 until sources.length()) {
            val s = sources.getJSONObject(i)
            val provider = s.optString("provider", "Unknown")
            val host = s.optString("host").takeIf { it.isNotEmpty() }
                ?: s.optString("quality").split(" · ").firstOrNull()
                ?: "Direct"
            val groupBase = getGroupBase(s)
            val key = "$provider|||$groupBase"
            if (!groups.containsKey(key)) {
                groups[key] = mutableListOf()
            }
            groups[key]?.add(Pair(s, i))
        }
        
        val groupedList = mutableListOf<GroupedSource>()
        for ((key, groupPairs) in groups) {
            val provider = key.substringBefore("|||")
            val displayName = key.substringAfter("|||")
            
            // Sort by resolution descending within the group
            groupPairs.sortByDescending { pair ->
                getQualityResolution(pair.first.optString("quality", ""))
            }
            
            val primaryPair = groupPairs.first()
            val primarySource = primaryPair.first
            val originalIndex = primaryPair.second
            
            val tags = groupPairs.map { pair ->
                extractResolutionTag(pair.first)
            }.distinct()
            
            val type = primarySource.optString("type").lowercase()
            val url = primarySource.optString("url").lowercase()
            val isTorrent = (type == "torrent" || url.startsWith("magnet:"))
            
            groupedList.add(GroupedSource(
                provider = provider,
                displayName = displayName,
                primarySource = primarySource,
                originalIndex = originalIndex,
                groupSources = groupPairs,
                availableQualities = tags,
                isTorrent = isTorrent
            ))
        }
        
        // Sort direct sources first, torrents last (by seeders descending)
        groupedList.sortWith(Comparator { x, y ->
            when {
                x.isTorrent && !y.isTorrent -> 1
                !x.isTorrent && y.isTorrent -> -1
                x.isTorrent && y.isTorrent -> {
                    val ySeeders = y.primarySource.optInt("seeders", 0)
                    val xSeeders = x.primarySource.optInt("seeders", 0)
                    ySeeders.compareTo(xSeeders)
                }
                else -> 0
            }
        })
        
        return groupedList
    }

    private fun extractResolutionTag(source: JSONObject): String {
        val quality = source.optString("quality", "")
        val isSplitted = quality.contains(" · ")
        val res = if (isSplitted) quality.split(" · ").last().trim() else quality
        return when {
            res.isEmpty() -> "Auto"
            res.lowercase().contains("4k") || res.contains("2160") -> "2160p"
            res.contains("1080") -> "1080p"
            res.contains("720") -> "720p"
            res.contains("480") -> "480p"
            res.contains("360") -> "360p"
            else -> {
                val match = Regex("""(\d+)p""", RegexOption.IGNORE_CASE).find(res)
                match?.value ?: res
            }
        }
    }

    private fun getQualityResolution(quality: String): Int {
        val q = quality.lowercase()
        return when {
            q.contains("4k") || q.contains("2160") -> 2160
            q.contains("1080") -> 1080
            q.contains("720") -> 720
            q.contains("480") -> 480
            q.contains("360") -> 360
            else -> {
                val match = Regex("""(\d+)p""").find(q)
                match?.groupValues?.get(1)?.toIntOrNull() ?: 0
            }
        }
    }



    data class VideoTrackOption(
        val label: String,
        val height: Int,
        val isSelected: Boolean,
        val group: androidx.media3.common.TrackGroup?,
        val trackIndex: Int
    )

    data class QualityRowItem(
        val label: String,
        val isSelected: Boolean,
        val action: () -> Unit
    )

    private fun getProtocolLabel(type: String, url: String): String {
        val t = type.lowercase()
        val u = url.lowercase()
        return when {
            t == "hls" || u.contains(".m3u8") -> "HLS"
            t == "torrent" || u.startsWith("magnet:") -> "TORRENT"
            t == "dash" || u.contains(".mpd") -> "DASH"
            else -> "DIRECT"
        }
    }

    private fun createReplicaView(original: View): View {
        return when (original) {
            is FrameLayout -> {
                FrameLayout(this).apply {
                    background = original.background?.constantState?.newDrawable()?.mutate()
                    setPadding(original.paddingLeft, original.paddingTop, original.paddingRight, original.paddingBottom)
                    for (i in 0 until original.childCount) {
                        addView(createReplicaView(original.getChildAt(i)))
                    }
                    (original.layoutParams as? FrameLayout.LayoutParams)?.let { lp ->
                        layoutParams = FrameLayout.LayoutParams(lp.width, lp.height).apply {
                            gravity = lp.gravity
                        }
                    }
                }
            }
            is LinearLayout -> {
                LinearLayout(this).apply {
                    orientation = original.orientation
                    gravity = original.gravity
                    background = original.background?.constantState?.newDrawable()?.mutate()
                    setPadding(original.paddingLeft, original.paddingTop, original.paddingRight, original.paddingBottom)
                    for (i in 0 until original.childCount) {
                        addView(createReplicaView(original.getChildAt(i)))
                    }
                    (original.layoutParams as? LinearLayout.LayoutParams)?.let { lp ->
                        layoutParams = LinearLayout.LayoutParams(lp.width, lp.height).apply {
                            weight = lp.weight
                            gravity = lp.gravity
                            leftMargin = lp.leftMargin
                            rightMargin = lp.rightMargin
                            topMargin = lp.topMargin
                            bottomMargin = lp.bottomMargin
                        }
                    }
                }
            }
            is ImageView -> {
                ImageView(this).apply {
                    setImageDrawable(original.drawable?.constantState?.newDrawable()?.mutate())
                    setColorFilter(original.colorFilter)
                    scaleType = original.scaleType
                    setPadding(original.paddingLeft, original.paddingTop, original.paddingRight, original.paddingBottom)
                    (original.layoutParams as? FrameLayout.LayoutParams)?.let { lp ->
                        layoutParams = FrameLayout.LayoutParams(lp.width, lp.height).apply {
                            gravity = lp.gravity
                        }
                    }
                    (original.layoutParams as? LinearLayout.LayoutParams)?.let { lp ->
                        layoutParams = LinearLayout.LayoutParams(lp.width, lp.height).apply {
                            gravity = lp.gravity
                        }
                    }
                }
            }
            is TextView -> {
                TextView(this).apply {
                    text = original.text
                    setTextColor(original.textColors)
                    textSize = original.textSize / resources.displayMetrics.scaledDensity
                    typeface = original.typeface
                    gravity = original.gravity
                    setPadding(original.paddingLeft, original.paddingTop, original.paddingRight, original.paddingBottom)
                    (original.layoutParams as? FrameLayout.LayoutParams)?.let { lp ->
                        layoutParams = FrameLayout.LayoutParams(lp.width, lp.height).apply {
                            gravity = lp.gravity
                        }
                    }
                    (original.layoutParams as? LinearLayout.LayoutParams)?.let { lp ->
                        layoutParams = LinearLayout.LayoutParams(lp.width, lp.height).apply {
                            gravity = lp.gravity
                        }
                    }
                }
            }
            else -> {
                View(this).apply {
                    background = original.background?.constantState?.newDrawable()?.mutate()
                }
            }
        }
    }

    private fun getQualityBadgeBg(quality: String): Int {
        val q = quality.lowercase()
        return when {
            q.contains("4k") || q.contains("2160") -> Color.parseColor("#ff4a7d") // Rose
            q.contains("1080") -> Color.parseColor("#5580FF") // Electric blue
            q.contains("720") -> Color.parseColor("#2ecc71") // Green
            q.contains("480") || q.contains("360") -> Color.parseColor("#f39c12") // Orange
            else -> Color.parseColor("#1AFFFFFF") // Muted white
        }
    }


    private inner class DropdownSettingsDialog(
        val title: String,
        val anchorView: View,
        val items: List<DropdownItem>
    ) {
        
        private val container: FrameLayout
        private val card: LinearLayout
        private val replica: View
        private var isDismissing = false

        init {
            container = FrameLayout(this@KotlinPlayerActivity).apply {
                setBackgroundColor(Color.TRANSPARENT)
                setOnClickListener { dismiss() }
            }
            
            val dialogWidthPx = dp(240)
            
            card = LinearLayout(this@KotlinPlayerActivity).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(dp(12), dp(10), dp(12), dp(10))
                background = GradientDrawable().apply {
                    setColor(Color.parseColor("#A5050505")) // 65% opaque pitch black glass
                    cornerRadius = dp(20).toFloat()
                    setStroke(dp(1), Color.parseColor("#14FFFFFF"))
                }
                setOnClickListener { /* do nothing */ }
            }
            
            val titleTv = TextView(this@KotlinPlayerActivity).apply {
                this.text = title
                setTextColor(Color.parseColor("#8E8D92")) // Muted cool grey
                textSize = 9.5f
                typeface = android.graphics.Typeface.DEFAULT_BOLD
                setPadding(dp(8), dp(4), 0, dp(8))
            }
            card.addView(titleTv)
            
            val scrollView = android.widget.ScrollView(this@KotlinPlayerActivity).apply {
                isVerticalScrollBarEnabled = true
                overScrollMode = View.OVER_SCROLL_NEVER
                
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    verticalScrollbarThumbDrawable = GradientDrawable().apply {
                        shape = GradientDrawable.RECTANGLE
                        setColor(Color.parseColor("#4DFFFFFF"))
                        cornerRadius = dp(2).toFloat()
                        setSize(dp(3), dp(36))
                    }
                }
            }
            val listContainer = LinearLayout(this@KotlinPlayerActivity).apply {
                orientation = LinearLayout.VERTICAL
            }
            
            items.forEachIndexed { index, item ->
                val row = LinearLayout(this@KotlinPlayerActivity).apply {
                    orientation = LinearLayout.HORIZONTAL
                    gravity = Gravity.CENTER_VERTICAL
                    setPadding(dp(8), dp(8), dp(12), dp(8))
                    background = if (item.isSelected) {
                        GradientDrawable().apply {
                            setColor(Color.parseColor("#265580FF")) // 15% opacity electric blue highlight
                            cornerRadius = dp(10).toFloat()
                        }
                    } else null
                    setOnClickListener {
                        item.onClick()
                        dismiss()
                    }
                }
                addPremiumTouchAnimation(row)
                
                val checkIv = ImageView(this@KotlinPlayerActivity).apply {
                    setImageResource(R.drawable.ic_hero_check)
                    setColorFilter(Color.WHITE)
                    visibility = if (item.isSelected) View.VISIBLE else View.INVISIBLE
                }
                row.addView(checkIv, LinearLayout.LayoutParams(dp(14), dp(14)).apply {
                    rightMargin = dp(10)
                })
                
                val textWrapper = LinearLayout(this@KotlinPlayerActivity).apply {
                    orientation = LinearLayout.VERTICAL
                }
                
                val primaryTv = TextView(this@KotlinPlayerActivity).apply {
                    text = item.primaryText
                    setTextColor(Color.WHITE)
                    textSize = 14f
                    typeface = android.graphics.Typeface.DEFAULT_BOLD
                }
                textWrapper.addView(primaryTv)
                
                if (item.subtitleText.isNotEmpty()) {
                    val subtitleTv = TextView(this@KotlinPlayerActivity).apply {
                        text = item.subtitleText
                        setTextColor(Color.parseColor("#8E8D92"))
                        textSize = 10f
                        setPadding(0, dp(1), 0, 0)
                    }
                    textWrapper.addView(subtitleTv)
                }
                
                row.addView(textWrapper, LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ))
                
                listContainer.addView(row)
                
                if (index < items.size - 1) {
                    val divider = View(this@KotlinPlayerActivity).apply {
                        setBackgroundColor(Color.parseColor("#0FFFFFFF"))
                    }
                    listContainer.addView(divider, LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT,
                        dp(1)
                    ).apply {
                        topMargin = dp(4)
                        bottomMargin = dp(4)
                    })
                }
            }
            
            scrollView.addView(listContainer)
            
            val heightLp = if (items.size > 4) dp(190) else LinearLayout.LayoutParams.WRAP_CONTENT
            card.addView(scrollView, LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                heightLp
            ))
            
            val location = IntArray(2)
            anchorView.getLocationOnScreen(location)
            
            card.measure(View.MeasureSpec.makeMeasureSpec(dialogWidthPx, View.MeasureSpec.EXACTLY), View.MeasureSpec.UNSPECIFIED)
            val dialogHeight = card.measuredHeight
            
            val dm = resources.displayMetrics
            val screenWidth = dm.widthPixels
            
            val cardLeft = (location[0] + anchorView.width / 2 - dialogWidthPx / 2).coerceIn(dp(16), screenWidth - dialogWidthPx - dp(16))
            val cardTop = (location[1] - dialogHeight - dp(8)).coerceAtLeast(dp(16))
            
            val cardParams = FrameLayout.LayoutParams(dialogWidthPx, FrameLayout.LayoutParams.WRAP_CONTENT).apply {
                gravity = Gravity.TOP or Gravity.LEFT
                leftMargin = cardLeft
                topMargin = cardTop
            }
            container.addView(card, cardParams)
            
            // Replica of the anchorView
            replica = createReplicaView(anchorView).apply {
                setOnClickListener { dismiss() }
            }
            val replicaParams = FrameLayout.LayoutParams(anchorView.width, anchorView.height).apply {
                gravity = Gravity.TOP or Gravity.LEFT
                leftMargin = location[0]
                topMargin = location[1]
            }
            container.addView(replica, replicaParams)
            
            // Initial animation state
            card.alpha = 0f
            card.translationY = dp(24).toFloat()
            replica.alpha = 0f
            
            // Premium slide-up + fade-in animation
            card.animate()
                .alpha(1f)
                .translationY(0f)
                .setDuration(280)
                .setInterpolator(android.view.animation.DecelerateInterpolator())
                .start()
            
            replica.animate()
                .alpha(1f)
                .setDuration(280)
                .setInterpolator(android.view.animation.DecelerateInterpolator())
                .start()
        }

        fun show() {
            showOverlay(container)
        }

        fun dismiss() {
            if (isDismissing) return
            isDismissing = true
            dismissActiveOverlay()
        }
    }

    private inner class SourcesGridDialog(
        val anchorView: View
    ) {
        
        private val container: FrameLayout
        private val card: LinearLayout
        private val replica: View
        private var isDismissing = false

        init {
            container = FrameLayout(this@KotlinPlayerActivity).apply {
                setBackgroundColor(Color.TRANSPARENT)
                setOnClickListener { dismiss() }
            }
            
            val dialogWidthPx = dp(340) // Increased to 340dp to fit the badges horizontally on single row beautifully
            
            card = LinearLayout(this@KotlinPlayerActivity).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(dp(16), dp(16), dp(16), dp(16))
                background = GradientDrawable().apply {
                    setColor(Color.parseColor("#A5050505")) // 65% opaque pitch black glass
                    cornerRadius = dp(24).toFloat()
                    setStroke(dp(1), Color.parseColor("#14FFFFFF"))
                }
                setOnClickListener { /* do nothing */ }
            }
            
            // Header: "Sources" + Top Right circular Close Button
            val header = FrameLayout(this@KotlinPlayerActivity)
            
            val titleTv = TextView(this@KotlinPlayerActivity).apply {
                text = "Sources"
                setTextColor(Color.WHITE)
                textSize = 16f
                typeface = android.graphics.Typeface.DEFAULT_BOLD
            }
            header.addView(titleTv, FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT,
                FrameLayout.LayoutParams.WRAP_CONTENT
            ).apply { gravity = Gravity.LEFT or Gravity.CENTER_VERTICAL })
            
            val closeBtn = FrameLayout(this@KotlinPlayerActivity).apply {
                background = GradientDrawable().apply {
                    shape = GradientDrawable.OVAL
                    setColor(Color.parseColor("#14FFFFFF")) // 8% white circular card background
                }
                val xIcon = ImageView(this@KotlinPlayerActivity).apply {
                    setImageResource(R.drawable.ic_hero_xmark)
                    setColorFilter(Color.WHITE)
                    setPadding(dp(6), dp(6), dp(6), dp(6))
                }
                addView(xIcon)
                setOnClickListener { dismiss() }
            }
            header.addView(closeBtn, FrameLayout.LayoutParams(dp(26), dp(26)).apply {
                gravity = Gravity.RIGHT or Gravity.CENTER_VERTICAL
            })
            
            card.addView(header, LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ))
            
            val decorView = View(this@KotlinPlayerActivity).apply {
                background = GradientDrawable(
                    GradientDrawable.Orientation.LEFT_RIGHT,
                    intArrayOf(Color.TRANSPARENT, Color.parseColor("#14FFFFFF"), Color.TRANSPARENT)
                )
            }
            card.addView(decorView, LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                dp(1)
            ).apply {
                topMargin = dp(12)
                bottomMargin = dp(12)
            })
            
            val scrollView = android.widget.ScrollView(this@KotlinPlayerActivity).apply {
                isVerticalScrollBarEnabled = true
                overScrollMode = View.OVER_SCROLL_NEVER
                
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    verticalScrollbarThumbDrawable = GradientDrawable().apply {
                        shape = GradientDrawable.RECTANGLE
                        setColor(Color.parseColor("#4DFFFFFF"))
                        cornerRadius = dp(2).toFloat()
                        setSize(dp(3), dp(36))
                    }
                }
            }
            
            val listContainer = LinearLayout(this@KotlinPlayerActivity).apply {
                orientation = LinearLayout.VERTICAL
            }
            
            val groupedList = getGroupedSources()
            val directSources = groupedList.filter { !it.isTorrent }
            val torrentSources = groupedList.filter { it.isTorrent }
            
            fun renderSourceRow(parentLayout: LinearLayout, group: GroupedSource) {
                val provider = group.provider
                val hostName = group.displayName
                val hasHeaders = group.primarySource.optJSONObject("headers")?.let { it.length() > 0 } ?: false
                val protocolLabel = getProtocolLabel(group.primarySource.optString("type"), group.primarySource.optString("url"))
                
                val currentSrc = if (allSources != null && currentSourceIndex >= 0 && currentSourceIndex < allSources!!.length()) {
                    allSources!!.getJSONObject(currentSourceIndex)
                } else null
                
                val isSelected = currentSrc != null &&
                    currentSrc.optString("provider") == provider &&
                    getGroupBase(currentSrc) == group.displayName

                val cell = LinearLayout(this@KotlinPlayerActivity).apply {
                    orientation = LinearLayout.HORIZONTAL
                    gravity = Gravity.CENTER_VERTICAL
                    setPadding(dp(14), dp(12), dp(14), dp(12))
                    background = GradientDrawable().apply {
                        if (isSelected) {
                            setColor(Color.parseColor("#1A5580FF")) // Same background color as Speed selection highlight (10% electric blue)
                            // Matching speed selection which has no stroke
                        } else {
                            setColor(Color.parseColor("#121E1E24")) // Opaque dark cell card
                            setStroke(dp(1), Color.parseColor("#0AFFFFFF"))
                        }
                        cornerRadius = dp(14).toFloat()
                    }
                    setOnClickListener {
                        switchToSource(group.originalIndex)
                        dismiss()
                    }
                }
                addPremiumTouchAnimation(cell)

                val icon = ImageView(this@KotlinPlayerActivity).apply {
                    if (group.isTorrent) {
                        setImageResource(R.drawable.ic_download)
                        setColorFilter(if (isSelected) Color.parseColor("#5580FF") else Color.parseColor("#ff4a7d"))
                    } else {
                        setImageResource(R.drawable.ic_hero_bolt)
                        setColorFilter(if (isSelected) Color.parseColor("#5580FF") else Color.parseColor("#8E8D92"))
                    }
                }
                cell.addView(icon, LinearLayout.LayoutParams(dp(14), dp(14)).apply {
                    rightMargin = dp(8)
                })

                val flowLayout = FlowLayout(this@KotlinPlayerActivity)

                val nameTv = TextView(this@KotlinPlayerActivity).apply {
                    text = hostName
                    setTextColor(Color.WHITE)
                    textSize = 13f
                    typeface = android.graphics.Typeface.DEFAULT_BOLD
                }
                flowLayout.addView(nameTv)

                // Render ALL Quality Badges side-by-side
                group.availableQualities.forEach { qTag ->
                    val qBadge = TextView(this@KotlinPlayerActivity).apply {
                        text = qTag
                        setTextColor(Color.WHITE)
                        textSize = 8.5f
                        typeface = android.graphics.Typeface.DEFAULT_BOLD
                        setPadding(dp(6), dp(2), dp(6), dp(2))
                        background = GradientDrawable().apply {
                            setColor(getQualityBadgeBg(qTag))
                            cornerRadius = dp(5).toFloat()
                        }
                    }
                    flowLayout.addView(qBadge)
                }

                // Protocol Badge
                val protoBadge = TextView(this@KotlinPlayerActivity).apply {
                    text = protocolLabel
                    setTextColor(Color.parseColor("#BFffffff"))
                    textSize = 8.5f
                    typeface = android.graphics.Typeface.DEFAULT_BOLD
                    setPadding(dp(6), dp(2), dp(6), dp(2))
                    background = GradientDrawable().apply {
                        setColor(Color.parseColor("#26FFFFFF"))
                        cornerRadius = dp(5).toFloat()
                    }
                }
                flowLayout.addView(protoBadge)

                // Provider Badge
                val provBadge = TextView(this@KotlinPlayerActivity).apply {
                    text = provider
                    setTextColor(Color.parseColor("#5580FF"))
                    textSize = 8.5f
                    typeface = android.graphics.Typeface.DEFAULT_BOLD
                    setPadding(dp(6), dp(2), dp(6), dp(2))
                    background = GradientDrawable().apply {
                        setColor(Color.parseColor("#265580FF"))
                        setStroke(dp(1), Color.parseColor("#4D5580FF"))
                        cornerRadius = dp(5).toFloat()
                    }
                }
                flowLayout.addView(provBadge)

                // Headers Badge
                if (hasHeaders) {
                    val headersBadge = TextView(this@KotlinPlayerActivity).apply {
                        text = "Headers"
                        setTextColor(Color.parseColor("#5580FF"))
                        textSize = 8.5f
                        typeface = android.graphics.Typeface.DEFAULT_BOLD
                        setPadding(dp(6), dp(2), dp(6), dp(2))
                        background = GradientDrawable().apply {
                            setColor(Color.parseColor("#260047FF"))
                            setStroke(dp(1), Color.parseColor("#4D0047FF"))
                            cornerRadius = dp(5).toFloat()
                        }
                    }
                    flowLayout.addView(headersBadge)
                }

                // Torrent Seeders Badge
                if (group.isTorrent) {
                    val seeders = group.primarySource.optInt("seeders", -1)
                    if (seeders > 0) {
                        val seedColor = if (seeders >= 50) Color.parseColor("#22C55E")
                        else if (seeders >= 10) Color.parseColor("#EAB308")
                        else Color.parseColor("#a0a0a5")
                        val seedersBadge = LinearLayout(this@KotlinPlayerActivity).apply {
                            orientation = LinearLayout.HORIZONTAL
                            gravity = Gravity.CENTER_VERTICAL
                            setPadding(dp(6), dp(2), dp(6), dp(2))
                            background = GradientDrawable().apply {
                                setColor(
                                    if (seeders >= 50) Color.parseColor("#22C55E")
                                    else if (seeders >= 10) Color.parseColor("#EAB308")
                                    else Color.parseColor("#26FFFFFF")
                                )
                                cornerRadius = dp(5).toFloat()
                            }
                        }
                        val seedIcon = ImageView(this@KotlinPlayerActivity).apply {
                            setImageResource(R.drawable.ic_download)
                            setColorFilter(seedColor)
                            setPadding(0, 0, dp(2), 0)
                        }
                        seedersBadge.addView(seedIcon, LinearLayout.LayoutParams(dp(9), dp(9)).apply {
                            rightMargin = dp(2)
                        })
                        val seedNumTv = TextView(this@KotlinPlayerActivity).apply {
                            text = "$seeders"
                            setTextColor(Color.WHITE)
                            textSize = 8.5f
                            typeface = android.graphics.Typeface.DEFAULT_BOLD
                        }
                        seedersBadge.addView(seedNumTv)
                        flowLayout.addView(seedersBadge)
                    }
                }

                cell.addView(flowLayout, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))

                val checkIv = ImageView(this@KotlinPlayerActivity).apply {
                    setImageResource(R.drawable.ic_hero_check)
                    setColorFilter(Color.parseColor("#5580FF"))
                    visibility = if (isSelected) View.VISIBLE else View.INVISIBLE
                }
                cell.addView(checkIv, LinearLayout.LayoutParams(dp(16), dp(16)).apply {
                    leftMargin = dp(10)
                })

                parentLayout.addView(cell, LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply {
                    bottomMargin = dp(8)
                })
            }

            // 1. Direct/HLS Sources rendered first
            directSources.forEach { group ->
                renderSourceRow(listContainer, group)
            }

            // 2. Collapsible Torrent Accordion row
            if (torrentSources.isNotEmpty()) {
                var torrentExpanded = false
                
                val accordionHeader = LinearLayout(this@KotlinPlayerActivity).apply {
                    orientation = LinearLayout.HORIZONTAL
                    gravity = Gravity.CENTER_VERTICAL
                    setPadding(dp(14), dp(12), dp(14), dp(12))
                    background = GradientDrawable().apply {
                        setColor(Color.parseColor("#0FFFFFFF")) // 6% white glass card header
                        cornerRadius = dp(14).toFloat()
                    }
                }
                addPremiumTouchAnimation(accordionHeader)
                
                val trayIv = ImageView(this@KotlinPlayerActivity).apply {
                    setImageResource(R.drawable.ic_download)
                    setColorFilter(Color.parseColor("#ff4a7d"))
                }
                accordionHeader.addView(trayIv, LinearLayout.LayoutParams(dp(14), dp(14)).apply {
                    rightMargin = dp(8)
                })
                
                val accTitleTv = TextView(this@KotlinPlayerActivity).apply {
                    text = "Torrent & Magnet Links (${torrentSources.size} found)"
                    setTextColor(Color.WHITE)
                    textSize = 13f
                    typeface = android.graphics.Typeface.DEFAULT_BOLD
                }
                accordionHeader.addView(accTitleTv, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
                
                val chevronIv = ImageView(this@KotlinPlayerActivity).apply {
                    setImageResource(R.drawable.ic_hero_chevron_down)
                    setColorFilter(Color.parseColor("#8E8D92"))
                }
                accordionHeader.addView(chevronIv, LinearLayout.LayoutParams(dp(14), dp(14)))
                
                listContainer.addView(accordionHeader, LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply {
                    bottomMargin = dp(8)
                })
                
                // Torrent Container
                val torrentContainer = LinearLayout(this@KotlinPlayerActivity).apply {
                    orientation = LinearLayout.VERTICAL
                    visibility = View.GONE
                    setPadding(dp(8), dp(4), 0, 0)
                }
                
                torrentSources.forEach { group ->
                    renderSourceRow(torrentContainer, group)
                }
                
                listContainer.addView(torrentContainer)
                
                accordionHeader.setOnClickListener {
                    torrentExpanded = !torrentExpanded
                    chevronIv.setImageResource(if (torrentExpanded) R.drawable.ic_hero_chevron_up else R.drawable.ic_hero_chevron_down)
                    torrentContainer.visibility = if (torrentExpanded) View.VISIBLE else View.GONE
                }
            }

            scrollView.addView(listContainer)
            
            // Limit height to fit screen nicely
            val totalItemsSize = directSources.size + if (torrentSources.isNotEmpty()) 1 else 0
            val gridHeightLp = if (totalItemsSize > 3) dp(195) else LinearLayout.LayoutParams.WRAP_CONTENT
            card.addView(scrollView, LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                gridHeightLp
            ))
            
            val location = IntArray(2)
            anchorView.getLocationOnScreen(location)
            
            card.measure(View.MeasureSpec.makeMeasureSpec(dialogWidthPx, View.MeasureSpec.EXACTLY), View.MeasureSpec.UNSPECIFIED)
            val dialogHeight = card.measuredHeight
            
            val dm = resources.displayMetrics
            val screenWidth = dm.widthPixels
            
            val cardLeft = (location[0] + anchorView.width / 2 - dialogWidthPx / 2).coerceIn(dp(16), screenWidth - dialogWidthPx - dp(16))
            val cardTop = (location[1] - dialogHeight - dp(8)).coerceAtLeast(dp(16))
            
            val cardParams = FrameLayout.LayoutParams(dialogWidthPx, FrameLayout.LayoutParams.WRAP_CONTENT).apply {
                gravity = Gravity.TOP or Gravity.LEFT
                leftMargin = cardLeft
                topMargin = cardTop
            }
            container.addView(card, cardParams)
            
            // Replica of the anchorView
            replica = createReplicaView(anchorView).apply {
                setOnClickListener { dismiss() }
            }
            val replicaParams = FrameLayout.LayoutParams(anchorView.width, anchorView.height).apply {
                gravity = Gravity.TOP or Gravity.LEFT
                leftMargin = location[0]
                topMargin = location[1]
            }
            container.addView(replica, replicaParams)
            
            // Initial animation state
            card.alpha = 0f
            card.translationY = dp(24).toFloat()
            replica.alpha = 0f
            
            // Premium slide-up + fade-in animation
            card.animate()
                .alpha(1f)
                .translationY(0f)
                .setDuration(280)
                .setInterpolator(android.view.animation.DecelerateInterpolator())
                .start()
            
            replica.animate()
                .alpha(1f)
                .setDuration(280)
                .setInterpolator(android.view.animation.DecelerateInterpolator())
                .start()
        }

        fun show() {
            showOverlay(container)
        }

        fun dismiss() {
            if (isDismissing) return
            isDismissing = true
            dismissActiveOverlay()
        }
    }

    private inner class FlowLayout(context: android.content.Context) : android.view.ViewGroup(context) {
        private val horizontalSpacing = dp(6)
        private val verticalSpacing = dp(6)

        override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
            val widthSize = MeasureSpec.getSize(widthMeasureSpec)
            var width = 0
            var height = 0
            var currentLineWidth = 0
            var currentLineHeight = 0

            val count = childCount
            for (i in 0 until count) {
                val child = getChildAt(i)
                if (child.visibility == GONE) continue

                measureChild(child, widthMeasureSpec, heightMeasureSpec)
                val childWidth = child.measuredWidth
                val childHeight = child.measuredHeight

                if (currentLineWidth > 0 && currentLineWidth + childWidth > widthSize) {
                    // Wrap to next line
                    width = maxOf(width, maxOf(0, currentLineWidth - horizontalSpacing))
                    height += currentLineHeight + verticalSpacing
                    currentLineWidth = childWidth + horizontalSpacing
                    currentLineHeight = childHeight
                } else {
                    currentLineWidth += childWidth + horizontalSpacing
                    currentLineHeight = maxOf(currentLineHeight, childHeight)
                }
            }

            width = maxOf(width, maxOf(0, currentLineWidth - horizontalSpacing))
            height += currentLineHeight

            setMeasuredDimension(
                resolveSize(width, widthMeasureSpec),
                resolveSize(height, heightMeasureSpec)
            )
        }

        override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
            val widthSize = r - l
            var curLeft = 0
            var curTop = 0
            var lineHeight = 0

            val count = childCount
            for (i in 0 until count) {
                val child = getChildAt(i)
                if (child.visibility == GONE) continue

                val childWidth = child.measuredWidth
                val childHeight = child.measuredHeight

                if (curLeft > 0 && curLeft + childWidth > widthSize) {
                    // Wrap to next line
                    curLeft = 0
                    curTop += lineHeight + verticalSpacing
                    lineHeight = childHeight
                } else {
                    lineHeight = maxOf(lineHeight, childHeight)
                }

                child.layout(curLeft, curTop, curLeft + childWidth, curTop + childHeight)
                curLeft += childWidth + horizontalSpacing
            }
        }
    }

    data class DropdownItem(
        val primaryText: String,
        val subtitleText: String,
        val isSelected: Boolean,
        val onClick: () -> Unit
    )
}
