package com.anonymous.sozornandroid.cloudstream

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.content.pm.ActivityInfo
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.media.AudioManager
import androidx.media3.common.AudioAttributes
import android.net.Uri
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
import android.widget.ProgressBar
import android.widget.SeekBar
import android.widget.TextView
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowInsetsControllerCompat
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
    private lateinit var loadingSpinner: ProgressBar
    private lateinit var loadingText: TextView
    private lateinit var sourcesBtn: ImageView
    private lateinit var subtitleBtn: ImageView

    private var isControlsVisible = true
    private var isSeeking = false
    private var isBuffering = false
    private val hideHandler = Handler(Looper.getMainLooper())
    private val HIDE_DELAY = 4000L
    private var lastBrightness = -1f
    private var audioManager: AudioManager? = null
    private var playerVolumeBeforeGesture = 1f

    private var allSources: JSONArray? = null
    private var allSubtitles: JSONArray? = null
    private var currentSourceIndex = 0
    private var currentSubtitleIndex = -1
    private var currentUrl = ""
    private var currentHeadersJson = "{}"

    private lateinit var root: FrameLayout
    private var gesturePill: View? = null

    private val fadeDuration = 300L

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        supportRequestWindowFeature(android.view.Window.FEATURE_NO_TITLE)
        requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_USER_LANDSCAPE

        audioManager = getSystemService(AUDIO_SERVICE) as AudioManager
        lastBrightness = window.attributes.screenBrightness

        val providerName = intent.getStringExtra("providerName")
        val mediaRef = intent.getStringExtra("data")
        val url = intent.getStringExtra("url")
        val headersJson = intent.getStringExtra("headers") ?: "{}"
        val videoTitle = intent.getStringExtra("title") ?: ""
        val subtitleUrl = intent.getStringExtra("subtitleUrl") ?: ""
        val sourcesJsonStr = intent.getStringExtra("sourcesJson") ?: ""
        val subtitlesJsonStr = intent.getStringExtra("subtitlesJson") ?: ""

        allSources = try { JSONArray(sourcesJsonStr) } catch (_: Exception) { null }
        allSubtitles = try { JSONArray(subtitlesJsonStr) } catch (_: Exception) { null }

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

        setContentView(root)
        window.decorView.post { immersiveMode() }

        val gestureDetector = GestureDetector(this, PlayerGestureListener())
        root.setOnTouchListener { v, event ->
            gestureDetector.onTouchEvent(event)
            if (event.action == MotionEvent.ACTION_UP) {
                v.performClick()
                gesturePill?.let {
                    it.animate().alpha(0f).setDuration(200).setListener(object : AnimatorListenerAdapter() {
                        override fun onAnimationEnd(animation: Animator) {
                            root.removeView(it)
                            gesturePill = null
                        }
                    }).start()
                }
            }
            true
        }

        if (providerName != null && mediaRef != null) {
            resolveAndPlay(providerName, mediaRef)
        } else if (currentUrl.isNotEmpty()) {
            loadingGroup.visibility = View.GONE
            showControlsAfterLoad()
            setupExoPlayer(currentUrl, currentHeadersJson, getCurrentSubtitleUrl())
        }
    }

    private fun getCurrentSubtitleUrl(): String {
        return if (currentSubtitleIndex >= 0 && allSubtitles != null && currentSubtitleIndex < allSubtitles!!.length()) {
            try { allSubtitles!!.getJSONObject(currentSubtitleIndex).optString("url", "") } catch (_: Exception) { "" }
        } else {
            intent.getStringExtra("subtitleUrl") ?: ""
        }
    }

    private fun resolveAndPlay(providerName: String, mediaRef: String) {
        loadingGroup.visibility = View.VISIBLE
        loadingText.text = "Preparing video..."
        CoroutineScope(Dispatchers.IO).launch {
            val host = CloudStreamPluginHost.instance
                ?: CloudStreamPluginHost(applicationContext)
            host.loadPluginsFromAssets()
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
                        bestSource?.let { src ->
                            currentUrl = src.optString("url")
                            currentHeadersJson = src.optJSONObject("headers")?.toString() ?: "{}"
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
                        } ?: showError("No playable source found")
                    } else {
                        showError("No sources found")
                    }
                } catch (e: Exception) {
                    showError("Failed to load: ${e.message}")
                }
            }
        }
    }

    private fun showError(msg: String) {
        loadingText.text = msg
        loadingText.setTextColor(Color.parseColor("#FF5555"))
        loadingText.postDelayed({ finish() }, 3000)
    }

    private fun setupExoPlayer(url: String, headersJson: String, subtitleUrl: String) {
        val headers = try { JSONObject(headersJson) } catch (_: Exception) { JSONObject() }

        val dataSourceFactory = DefaultHttpDataSource.Factory()
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

        player?.setMediaItem(mediaItemBuilder.build())
        player?.prepare()
        player?.play()

        player?.addListener(object : Player.Listener {
            override fun onPlaybackStateChanged(playbackState: Int) {
                updateBuffering(playbackState == Player.STATE_BUFFERING && isControlsVisible)
                if (playbackState == Player.STATE_READY) {
                    loadingGroup.visibility = View.GONE
                    bufferingView.visibility = View.GONE
                }
            }

            override fun onPlayerError(error: PlaybackException) {
                loadingText.text = "Playback error: ${error.localizedMessage}"
                loadingText.setTextColor(Color.parseColor("#FF5555"))
                loadingGroup.visibility = View.VISIBLE
            }

            override fun onIsPlayingChanged(isPlaying: Boolean) {
                updateCenterPlayPauseIcon()
            }
        })

        seekBar.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(sb: SeekBar?, progress: Int, fromUser: Boolean) {
                if (fromUser) {
                    player?.let { p ->
                        val dur = p.duration
                        if (dur > 0) {
                            val seekPos = (dur * progress / 1000).toLong()
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
                            val seekPos = (dur * it.progress / 1000).toLong()
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
                    Handler(Looper.getMainLooper()).postDelayed(this, 250)
                }
            }
        }
        updater.run()

        if (player?.isPlaying == true) hideControls()
    }

    private fun createLoadingOverlay(): View {
        val container = FrameLayout(this)
        container.setBackgroundColor(Color.parseColor("#DD000000"))

        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
        }
        val params = FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.WRAP_CONTENT,
            FrameLayout.LayoutParams.WRAP_CONTENT
        )
        params.gravity = Gravity.CENTER
        container.addView(content, params)

        loadingSpinner = ProgressBar(this, null, android.R.attr.progressBarStyleLarge).apply {
            isIndeterminate = true
            val c = Color.parseColor("#E50914")
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                indeterminateTintList = android.content.res.ColorStateList.valueOf(c)
            }
        }
        content.addView(loadingSpinner, LinearLayout.LayoutParams(dp(48), dp(48)))

        loadingText = TextView(this).apply {
            text = "Preparing video..."
            setTextColor(Color.parseColor("#CCFFFFFF"))
            textSize = 16f
            gravity = Gravity.CENTER
        }
        val lp = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        )
        lp.topMargin = dp(16)
        content.addView(loadingText, lp)

        return container
    }

    private fun createBufferingOverlay(): View {
        val container = FrameLayout(this)
        container.setBackgroundColor(Color.TRANSPARENT)

        val spinner = ProgressBar(this, null, android.R.attr.progressBarStyleSmall).apply {
            isIndeterminate = true
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                indeterminateTintList = android.content.res.ColorStateList.valueOf(Color.WHITE)
            }
        }
        val params = FrameLayout.LayoutParams(dp(24), dp(24))
        params.gravity = Gravity.CENTER
        container.addView(spinner, params)

        return container
    }

    private fun createCenterControls(): View {
        val container = FrameLayout(this)
        container.setBackgroundColor(Color.TRANSPARENT)

        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
        }
        val lp = FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.WRAP_CONTENT,
            FrameLayout.LayoutParams.WRAP_CONTENT
        )
        lp.gravity = Gravity.CENTER
        container.addView(row, lp)

        skipBackBtn = ImageView(this).apply {
            setImageResource(android.R.drawable.ic_media_rew)
            setPadding(dp(12), dp(12), dp(12), dp(12))
            setColorFilter(Color.WHITE)
            setOnClickListener {
                player?.let { p ->
                    p.seekTo((p.currentPosition - 10000).coerceAtLeast(0))
                }
                showSeekFeedback("⏪", 10)
                resetHideTimer()
            }
        }
        row.addView(skipBackBtn, LinearLayout.LayoutParams(dp(52), dp(52)))

        playPauseCenter = ImageView(this).apply {
            setImageResource(android.R.drawable.ic_media_play)
            setPadding(dp(18), dp(18), dp(18), dp(18))
            setColorFilter(Color.WHITE)
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setSize(dp(64), dp(64))
                setColor(Color.parseColor("#99000000"))
            }
            setOnClickListener {
                player?.let { p ->
                    if (p.isPlaying) { p.pause() } else { p.play() }
                }
                resetHideTimer()
            }
        }
        row.addView(playPauseCenter, LinearLayout.LayoutParams(dp(64), dp(64)).apply {
            setMargins(dp(28), 0, dp(28), 0)
        })

        skipForwardBtn = ImageView(this).apply {
            setImageResource(android.R.drawable.ic_media_ff)
            setPadding(dp(12), dp(12), dp(12), dp(12))
            setColorFilter(Color.WHITE)
            setOnClickListener {
                player?.let { p ->
                    val dur = p.duration
                    p.seekTo((p.currentPosition + 10000).coerceAtMost(if (dur > 0) dur else p.currentPosition + 10000))
                }
                showSeekFeedback("⏩", 10)
                resetHideTimer()
            }
        }
        row.addView(skipForwardBtn, LinearLayout.LayoutParams(dp(52), dp(52)))

        return container
    }

    private fun createTopBar(title: String): View {
        val container = FrameLayout(this)
        container.setBackgroundColor(Color.TRANSPARENT)

        val gradient = View(this).apply {
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, dp(96)
            )
            background = GradientDrawable(
                GradientDrawable.Orientation.TOP_BOTTOM,
                intArrayOf(Color.parseColor("#CC000000"), Color.TRANSPARENT)
            )
        }
        container.addView(gradient)

        val bar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        val barLp = FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.WRAP_CONTENT
        )
        barLp.gravity = Gravity.TOP
        container.addView(bar, barLp)

        val backBtn = ImageView(this).apply {
            setImageResource(android.R.drawable.ic_menu_close_clear_cancel)
            setPadding(dp(16), dp(16), dp(16), dp(16))
            scaleX = 0.7f
            scaleY = 0.7f
            setColorFilter(Color.WHITE)
            setOnClickListener { finish() }
        }
        bar.addView(backBtn, LinearLayout.LayoutParams(dp(52), dp(52)))

        titleTv = TextView(this).apply {
            text = title
            setTextColor(Color.WHITE)
            textSize = 16f
            gravity = Gravity.CENTER_VERTICAL
            isSelected = true
            ellipsize = android.text.TextUtils.TruncateAt.MARQUEE
            setSingleLine()
        }
        bar.addView(titleTv, LinearLayout.LayoutParams(
            0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f
        ).apply { setMargins(dp(4), 0, dp(4), 0) })

        sourcesBtn = ImageView(this).apply {
            setImageResource(android.R.drawable.ic_menu_sort_by_size)
            setPadding(dp(12), dp(12), dp(12), dp(12))
            setColorFilter(Color.WHITE)
            setOnClickListener { showSourcePicker() }
        }
        bar.addView(sourcesBtn, LinearLayout.LayoutParams(dp(48), dp(48)))

        subtitleBtn = ImageView(this).apply {
            setImageResource(android.R.drawable.ic_menu_info_details)
            setPadding(dp(12), dp(12), dp(12), dp(12))
            setColorFilter(Color.parseColor("#E50914"))
            setOnClickListener { cycleSubtitles() }
        }
        bar.addView(subtitleBtn, LinearLayout.LayoutParams(dp(48), dp(48)))

        return container
    }

    private fun createBottomBar(): View {
        val container = FrameLayout(this)
        container.setBackgroundColor(Color.TRANSPARENT)

        val gradient = View(this).apply {
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, dp(96)
            )
            background = GradientDrawable(
                GradientDrawable.Orientation.BOTTOM_TOP,
                intArrayOf(Color.parseColor("#CC000000"), Color.TRANSPARENT)
            )
        }
        container.addView(gradient)

        val bar = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
        }
        val barLp = FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.WRAP_CONTENT
        )
        barLp.gravity = Gravity.BOTTOM
        container.addView(bar, barLp)

        val timeRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        bar.addView(timeRow, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ))

        val spacer = View(this).apply { layoutParams = LinearLayout.LayoutParams(dp(16), 1) }
        timeRow.addView(spacer)

        currentTimeTv = TextView(this).apply {
            text = "00:00"
            setTextColor(Color.WHITE)
            textSize = 12f
            gravity = Gravity.CENTER
        }
        timeRow.addView(currentTimeTv, LinearLayout.LayoutParams(dp(48), LinearLayout.LayoutParams.WRAP_CONTENT))

        seekBar = SeekBar(this, null, android.R.attr.seekBarStyle).apply {
            progressTintList = android.content.res.ColorStateList.valueOf(Color.parseColor("#E50914"))
            progressBackgroundTintList = android.content.res.ColorStateList.valueOf(Color.parseColor("#66FFFFFF"))
            secondaryProgressTintList = android.content.res.ColorStateList.valueOf(Color.parseColor("#44FFFFFF"))
            max = 1000
        }
        timeRow.addView(seekBar, LinearLayout.LayoutParams(0, dp(32), 1f))

        endTimeTv = TextView(this).apply {
            text = "00:00"
            setTextColor(Color.WHITE)
            textSize = 12f
            gravity = Gravity.CENTER
        }
        timeRow.addView(endTimeTv, LinearLayout.LayoutParams(dp(48), LinearLayout.LayoutParams.WRAP_CONTENT))

        val spacer2 = View(this).apply { layoutParams = LinearLayout.LayoutParams(dp(16), 1) }
        timeRow.addView(spacer2)

        return container
    }

    private fun updateCenterPlayPauseIcon() {
        player?.let { p ->
            playPauseCenter.setImageResource(
                if (p.isPlaying) android.R.drawable.ic_media_pause
                else android.R.drawable.ic_media_play
            )
        }
    }

    private fun updateBuffering(buffering: Boolean) {
        isBuffering = buffering
        if (buffering && isControlsVisible) {
            bufferingView.visibility = View.VISIBLE
        } else {
            bufferingView.visibility = View.GONE
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
        centerControls.visibility = View.VISIBLE
        topBar.animate().alpha(1f).setDuration(fadeDuration).setInterpolator(AccelerateDecelerateInterpolator()).start()
        bottomBar.animate().alpha(1f).setDuration(fadeDuration).setInterpolator(AccelerateDecelerateInterpolator()).start()
        centerControls.animate().alpha(1f).setDuration(fadeDuration).setInterpolator(AccelerateDecelerateInterpolator()).start()
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

    private fun showSourcePicker() {
        val sources = allSources ?: return
        if (sources.length() == 0) return

        val items = mutableListOf<String>()
        for (i in 0 until sources.length()) {
            val s = sources.getJSONObject(i)
            val q = s.optString("quality", "?")
            val t = s.optString("type", "Direct")
            items.add("$q — $t")
        }

        val dialog = AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog)
        dialog.setTitle("Select Source")
        dialog.setSingleChoiceItems(items.toTypedArray(), currentSourceIndex) { d, which ->
            currentSourceIndex = which
            switchToSource(which)
            d.dismiss()
        }
        dialog.setNegativeButton("Cancel", null)
        dialog.show()
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

    private fun cycleSubtitles() {
        val subs = allSubtitles ?: return
        if (subs.length() == 0) return

        currentSubtitleIndex = (currentSubtitleIndex + 1) % (subs.length() + 1) - 1
        // -1 = off, 0..n-1 = subtitle index

        switchToSource(currentSourceIndex)

        subBtnTint(currentSubtitleIndex < 0)
        val label = if (currentSubtitleIndex < 0) "Sub: Off" else "Sub: ${subs.getJSONObject(currentSubtitleIndex).optString("lang", "?")}"
        showToastLabel(label)
    }

    private fun subBtnTint(isOff: Boolean) {
        subtitleBtn.setColorFilter(if (isOff) Color.WHITE else Color.parseColor("#E50914"))
    }

    private fun showToastLabel(text: String) {
        val tv = TextView(this).apply {
            this.text = text
            setTextColor(Color.WHITE)
            textSize = 14f
            gravity = Gravity.CENTER
            setBackgroundColor(Color.parseColor("#CC000000"))
            setPadding(dp(16), dp(8), dp(16), dp(8))
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
        private var isVolumeGesture = false
        private var isBrightnessGesture = false

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

        override fun onLongPress(e: MotionEvent) {
            isVolumeGesture = e.x > widthPx / 2f
            isBrightnessGesture = e.x <= widthPx / 2f
        }

        override fun onScroll(e1: MotionEvent?, e2: MotionEvent, distanceX: Float, distanceY: Float): Boolean {
            if (e1 == null) return false
            val dy = e1.y - e2.y
            if (abs(dy) > 30 && abs(dy) > abs(e1.x - e2.x) * 2) {
                val sensitivity = 200f
                val delta = dy / sensitivity
                if (isVolumeGesture) {
                    val am = audioManager ?: return true
                    val maxVol = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
                    val curVol = am.getStreamVolume(AudioManager.STREAM_MUSIC)
                    val newVol = (curVol + delta).toInt().coerceIn(0, maxVol)
                    am.setStreamVolume(AudioManager.STREAM_MUSIC, newVol, 0)
                    showVolumePill(newVol, maxVol)
                } else if (isBrightnessGesture) {
                    val lp = window.attributes
                    val newBright = (lp.screenBrightness + delta / 10f).coerceIn(0.01f, 1f)
                    lp.screenBrightness = newBright
                    window.attributes = lp
                    lastBrightness = newBright
                    showBrightnessPill(newBright)
                }
            }
            return true
        }
    }

    private fun showVolumePill(volume: Int, max: Int) {
        gesturePill?.let { root.removeView(it) }
        val pct = (volume.toFloat() / max * 100).toInt()
        val pill = createGesturePill("🔊 $pct%")
        root.addView(pill, gesturePillParams())
        gesturePill = pill
    }

    private fun showBrightnessPill(brightness: Float) {
        gesturePill?.let { root.removeView(it) }
        val pct = (brightness * 100).toInt()
        val pill = createGesturePill("☀ $pct%")
        root.addView(pill, gesturePillParams())
        gesturePill = pill
    }

    private fun createGesturePill(text: String): View {
        return TextView(this).apply {
            this.text = text
            setTextColor(Color.WHITE)
            textSize = 16f
            gravity = Gravity.CENTER
            setBackgroundColor(Color.parseColor("#BB000000"))
            setPadding(dp(20), dp(10), dp(20), dp(10))
        }
    }

    private fun gesturePillParams(): FrameLayout.LayoutParams {
        val params = FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.WRAP_CONTENT,
            FrameLayout.LayoutParams.WRAP_CONTENT
        )
        params.gravity = Gravity.CENTER
        return params
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

    private fun immersiveMode() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
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
                View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
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
        super.onStop()
        hideHandler.removeCallbacksAndMessages(null)
        player?.release()
        player = null
    }

    override fun onResume() {
        super.onResume()
        immersiveMode()
    }
}
