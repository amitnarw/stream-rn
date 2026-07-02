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

    init {
        if (!saveDir.exists()) {
            saveDir.mkdirs()
        }
        // Start libtorrent session
        val dhtLatch = CountDownLatch(1)
        sessionManager.addListener(object : AlertListener {
            override fun types(): IntArray? = null // listen to all alerts
            override fun alert(alert: Alert<*>) {
                when (alert.type()) {
                    AlertType.DHT_BOOTSTRAP -> {
                        Log.i(TAG, "DHT Bootstrapped successfully")
                        dhtLatch.countDown()
                    }
                    AlertType.METADATA_RECEIVED -> {
                        Log.i(TAG, "Metadata received alert")
                    }
                    else -> {}
                }
            }
        })
        sessionManager.start()
        sessionManager.startDht()
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

    fun startStream(magnetUrl: String): TorrentStreamInfo {
        stopStream() // Stop any active stream first

        Log.i(TAG, "Starting stream for magnet: $magnetUrl")
        isStreaming = true

        // Clean save dir to prevent space issues
        saveDir.deleteRecursively()
        saveDir.mkdirs()

        val latch = CountDownLatch(1)
        var resolvedHandle: TorrentHandle? = null

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
            // Wait for the torrent to register in session
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

            Log.i(TAG, "Torrent handle registered, waiting for metadata...")
            // Wait up to 30 seconds for metadata resolution
            if (resolvedHandle.torrentFile() == null || !resolvedHandle.torrentFile().isValid) {
                latch.await(30, TimeUnit.SECONDS)
            }

            if (resolvedHandle.torrentFile() == null || !resolvedHandle.torrentFile().isValid) {
                throw IllegalStateException("Metadata resolution timed out (no peers found or bad magnet)")
            }

            Log.i(TAG, "Metadata resolved successfully! Files: ${resolvedHandle.torrentFile().numFiles()}")

        } finally {
            sessionManager.removeListener(tempListener)
        }

        val torrentInfo = resolvedHandle.torrentFile()
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

        // Start HTTP range server
        val server = LocalHttpServer(11470, this)
        server.start()
        activeServer = server

        return TorrentStreamInfo(
            streamUrl = "http://127.0.0.1:11470/stream",
            fileName = videoFileName,
            fileSize = videoFileSize
        )
    }

    fun stopStream() {
        isStreaming = false
        activeServer?.stop()
        activeServer = null

        torrentHandle?.let { handle ->
            try {
                sessionManager.remove(handle)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to remove torrent handle: ${e.message}")
            }
        }
        torrentHandle = null
        videoFileIndex = -1
        videoFileName = ""
        videoFileSize = 0L
    }

    fun getStatus(): TorrentStatus {
        val handle = torrentHandle ?: return TorrentStatus(0f, 0L, 0, false)
        val status = handle.status()
        val progress = status.progress() * 100f
        val downloadRate = status.downloadRate().toLong() // bytes per second
        val numPeers = status.numPeers()
        return TorrentStatus(progress, downloadRate, numPeers, isStreaming)
    }

    fun getByteReader(): TorrentByteReader {
        val handle = torrentHandle ?: throw IllegalStateException("No active torrent handle")
        return TorrentByteReader(handle, videoFileIndex, videoFileSize)
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
