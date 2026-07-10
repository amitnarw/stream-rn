package com.anonymous.zunornandroid.cloudstream

import android.content.Context
import android.util.Log
import com.frostwire.jlibtorrent.*
import com.frostwire.jlibtorrent.alerts.*
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class TorrentStreamer private constructor(private val context: Context) {

    private val sessionManager = SessionManager()
    private var torrentHandle: TorrentHandle? = null
    private var videoFileIndex: Int = -1
    private var videoFileName: String = ""
    private var videoFileSize: Long = 0L
    private val saveDir: File = File(context.cacheDir, "torrents")

    private var activeServer: LocalHttpServer? = null
    private var isStreaming = false
    private var activeReader: TorrentByteReader? = null
    private val torrentLock = Any()

    init {
        if (!saveDir.exists()) {
            saveDir.mkdirs()
        }
        // Build SettingsPack with DHT bootstrap nodes BEFORE starting the session.
        // If we start() first and applySettings() after, libtorrent has already
        // performed its initial DHT bootstrap with an empty node list — too late.
        // Start libtorrent session with a filtered alert listener for diagnostics.
        // Exclude high-frequency alerts (like STATS or BLOCK_DOWNLOADING) to prevent JNI flooding and native SEGV crashes.
        sessionManager.addListener(object : AlertListener {
            override fun types(): IntArray = intArrayOf(
                AlertType.DHT_BOOTSTRAP.swig(),
                AlertType.METADATA_RECEIVED.swig(),
                AlertType.LISTEN_FAILED.swig(),
                AlertType.LISTEN_SUCCEEDED.swig(),
                AlertType.TRACKER_ERROR.swig(),
                AlertType.TRACKER_REPLY.swig(),
                AlertType.PEER_CONNECT.swig(),
                AlertType.PEER_DISCONNECTED.swig()
            )
            override fun alert(alert: Alert<*>) {
                val typeName = alert.type().name
                val message = alert.message()
                Log.d("LibTorrentAlert", "[$typeName] $message")
            }
        })

        try {
            val sp = SettingsPack()
            sp.setString(
                com.frostwire.jlibtorrent.swig.settings_pack.string_types.dht_bootstrap_nodes.swigValue(),
                "router.bittorrent.com:6881,router.utorrent.com:6881," +
                "dht.libtorrent.org:25401,dht.transmissionbt.com:6881," +
                "dht.aelitis.com:6881"
            )
            // Enable trackers, DHT, PeX, LSD
            sp.setBoolean(com.frostwire.jlibtorrent.swig.settings_pack.bool_types.enable_dht.swigValue(), true)
            sp.setBoolean(com.frostwire.jlibtorrent.swig.settings_pack.bool_types.enable_lsd.swigValue(), true)
            sp.setBoolean(com.frostwire.jlibtorrent.swig.settings_pack.bool_types.enable_upnp.swigValue(), true)
            sp.setBoolean(com.frostwire.jlibtorrent.swig.settings_pack.bool_types.enable_natpmp.swigValue(), true)

            sessionManager.start(SessionParams(sp))
            Log.i(TAG, "Session started with SettingsPack DHT bootstrap nodes.")
        } catch (e: Exception) {
            Log.w(TAG, "Failed to start with SettingsPack (${e.message}), falling back to default start")
            sessionManager.start()
        }

        sessionManager.startDht()
        Log.i(TAG, "DHT started and bootstrap nodes configured in SettingsPack")
    }

    private fun getTorrentHandles(): List<TorrentHandle> {
        val list = mutableListOf<TorrentHandle>()
        try {
            val vector = sessionManager.swig().get_torrents()
            val size = vector.size().toInt()
            for (i in 0 until size) {
                val swigHandle = vector.get(i)
                if (swigHandle != null) {
                    list.add(TorrentHandle(swigHandle))
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error getting torrent handles: ${e.message}")
        }
        return list
    }

    private var resolvedPort = 11470

    fun getFileName(): String = videoFileName
    fun getPort(): Int = resolvedPort

    fun startStream(magnetUrl: String): TorrentStreamInfo = synchronized(torrentLock) {
        stopStream() // Stop any active stream first

        Log.i(TAG, "Starting stream for magnet: $magnetUrl")
        isStreaming = true

        // Clean save dir to prevent space issues
        saveDir.deleteRecursively()
        saveDir.mkdirs()

        val latch = CountDownLatch(1)
        var resolvedHandle: TorrentHandle? = null

        // Bug #2 fix: register listener BEFORE calling download() to avoid a
        // race where metadata arrives before the listener is attached.
        val tempListener = object : AlertListener {
            override fun types(): IntArray = intArrayOf(AlertType.METADATA_RECEIVED.swig())
            override fun alert(alert: Alert<*>) {
                if (alert is MetadataReceivedAlert) {
                    Log.i(TAG, "Metadata resolved inside temp listener!")
                    latch.countDown()
                }
            }
        }

        sessionManager.addListener(tempListener)
        try {
            sessionManager.download(magnetUrl, saveDir)

            // Wait for the torrent handle to register in the session (up to 5s)
            var retries = 0
            while (resolvedHandle == null && retries < 50) {
                val torrents = getTorrentHandles()
                if (torrents.isNotEmpty()) {
                    resolvedHandle = torrents[0]
                } else {
                    Thread.sleep(100)
                    retries++
                }
            }

            if (resolvedHandle == null) {
                throw IllegalStateException("Failed to add torrent handle")
            }

            // Force resume the handle to ensure metadata download starts immediately
            resolvedHandle.resume()

            Log.i(TAG, "Torrent handle registered, waiting for metadata (up to 60s)...")
            // Wait up to 60 seconds for metadata (was 30s — not enough on slow DHT)
            // Check status().hasMetadata() safely to avoid Native SIGSEGV crash
            if (!resolvedHandle.status().hasMetadata()) {
                latch.await(60, TimeUnit.SECONDS)
            }

            if (!resolvedHandle.status().hasMetadata()) {
                throw IllegalStateException("Metadata resolution timed out (no peers found or bad magnet)")
            }

        } finally {
            sessionManager.removeListener(tempListener)
        }

        val torrentInfo = resolvedHandle.torrentFile() ?: throw IllegalStateException("Metadata resolved but torrentInfo is null")
        val fileStorage = torrentInfo.files()
        // Find the largest video file
        var largestSize = 0L
        var largestIndex = -1
        for (i in 0 until torrentInfo.numFiles()) {
            val path = fileStorage.filePath(i).lowercase()
            val size = fileStorage.fileSize(i)
            if (isVideoFile(path) && size > largestSize) {
                largestSize = size
                largestIndex = i
            }
        }

        if (largestIndex == -1) {
            // Fallback to largest file overall if no video extension matches
            for (i in 0 until torrentInfo.numFiles()) {
                val size = fileStorage.fileSize(i)
                if (size > largestSize) {
                    largestSize = size
                    largestIndex = i
                }
            }
        }

        if (largestIndex == -1) {
            throw IllegalStateException("No files found in torrent")
        }

        videoFileIndex = largestIndex
        videoFileName = fileStorage.fileName(largestIndex)
        videoFileSize = largestSize
        torrentHandle = resolvedHandle

        // Set sequential download flag
        resolvedHandle.setFlags(TorrentFlags.SEQUENTIAL_DOWNLOAD)

        // Set file priorities: ignore other files, prioritize the video file
        val priorities = Array(torrentInfo.numFiles()) { Priority.IGNORE }
        priorities[largestIndex] = Priority.SEVEN
        resolvedHandle.prioritizeFiles(priorities)

        Log.i(TAG, "Selected file: $videoFileName (size: $videoFileSize bytes, index: $videoFileIndex)")

        // Start HTTP range server with dynamic port fallback loop
        var port = 11470
        var serverStarted = false
        var attempts = 0
        var server: LocalHttpServer? = null
        while (!serverStarted && attempts < 20) {
            try {
                server = LocalHttpServer(port, this)
                server.start()
                serverStarted = true
                resolvedPort = port
                Log.i(TAG, "Successfully started HTTP range server on port $port")
            } catch (e: Exception) {
                Log.w(TAG, "Failed to start HTTP server on port $port, trying next port: ${e.message}")
                port++
                attempts++
            }
        }
        if (!serverStarted || server == null) {
            throw IllegalStateException("Failed to bind any port from 11470 to 11490 for LocalHttpServer")
        }
        activeServer = server

        return TorrentStreamInfo(
            streamUrl = "http://127.0.0.1:$resolvedPort/stream",
            fileName = videoFileName,
            fileSize = videoFileSize
        )
    }

    fun stopStream() = synchronized(torrentLock) {
        isStreaming = false
        
        // Release active byte reader first so it aborts any pending loops and blocks
        // JNI calls before we delete the handle.
        activeReader?.release()
        activeReader = null

        activeServer?.stop()
        activeServer = null

        // Bug #6 fix: remove handle and also remove all remaining handles to
        // prevent stale announce URLs / peer lists from prior downloads leaking
        // into the next magnet session.
        torrentHandle?.let { handle ->
            try {
                sessionManager.remove(handle)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to remove torrent handle: ${e.message}")
            }
        }
        // Remove any other stale handles (e.g. from a crashed prior session)
        try {
            getTorrentHandles().forEach { h ->
                if (h != torrentHandle) {
                    try { sessionManager.remove(h) } catch (_: Exception) {}
                }
            }
        } catch (_: Exception) {}

        torrentHandle = null
        videoFileIndex = -1
        videoFileName = ""
        videoFileSize = 0L
    }

    fun getStatus(): TorrentStatus = synchronized(torrentLock) {
        val handle = torrentHandle
        if (handle == null || !handle.isValid) {
            return TorrentStatus(0f, 0L, 0, false)
        }
        return try {
            val status = handle.status()
            val progress = status.progress() * 100f
            val downloadRate = status.downloadRate().toLong() // bytes per second
            val numPeers = status.numPeers()
            TorrentStatus(progress, downloadRate, numPeers, isStreaming)
        } catch (e: Exception) {
            Log.w(TAG, "Failed to get handle status: ${e.message}")
            TorrentStatus(0f, 0L, 0, isStreaming)
        }
    }

    fun getByteReader(): TorrentByteReader = synchronized(torrentLock) {
        val handle = torrentHandle ?: throw IllegalStateException("No active torrent handle")
        return TorrentByteReader(handle, videoFileIndex, videoFileSize, torrentLock).also {
            activeReader = it
        }
    }

    private fun isVideoFile(path: String): Boolean {
        return path.endsWith(".mp4") || path.endsWith(".mkv") || path.endsWith(".avi") ||
               path.endsWith(".mov") || path.endsWith(".flv") || path.endsWith(".webm")
    }

    companion object {
        private const val TAG = "ZunoTorrent"
        private var instance: TorrentStreamer? = null

        fun getInstance(context: Context): TorrentStreamer {
            return instance ?: synchronized(this) {
                instance ?: TorrentStreamer(context.applicationContext).also { instance = it }
            }
        }
    }
}

data class TorrentStreamInfo(
    val streamUrl: String,
    val fileName: String,
    val fileSize: Long
)

data class TorrentStatus(
    val progress: Float,
    val downloadRate: Long,
    val numPeers: Int,
    val active: Boolean
)
