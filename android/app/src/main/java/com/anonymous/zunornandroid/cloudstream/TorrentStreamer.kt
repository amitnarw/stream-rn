package com.anonymous.zunornandroid.cloudstream

import android.content.Context
import android.util.Log
import com.github.se_bastiaan.torrentstream.Torrent
import com.github.se_bastiaan.torrentstream.TorrentOptions
import com.github.se_bastiaan.torrentstream.TorrentStream
import com.github.se_bastiaan.torrentstream.listeners.TorrentListener
import com.github.se_bastiaan.torrentstream.StreamStatus
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class TorrentStreamer private constructor(private val context: Context) {

    @Volatile private var torrentStream: TorrentStream? = null
    private var currentTorrent: Torrent? = null
    @Volatile private var activeServer: LocalHttpServer? = null

    @Volatile var progress: Float = 0f
    @Volatile var downloadSpeed: Long = 0L
    @Volatile var peerCount: Int = 0
    @Volatile var isActive: Boolean = false
    @Volatile var streamUrl: String = ""
    @Volatile var videoFileName: String = ""
    @Volatile var videoFileSize: Long = 0L

    @Volatile private var streamReadyLatch: CountDownLatch? = null
    private var streamError: Exception? = null
    @Volatile private var currentListener: TorrentListener? = null

    fun startStream(magnetUrl: String): TorrentStreamInfo {
        stopStream()

        val saveDir = File(context.cacheDir, "torrents")
        try {
            saveDir.deleteRecursively()
        } catch (_: Exception) {}
        saveDir.mkdirs()

        if (torrentStream == null) {
            val options = TorrentOptions.Builder()
                .saveLocation(saveDir.absolutePath)
                .removeFilesAfterStop(true)
                .autoDownload(true)
                .prepareSize(10L * 1024L * 1024L)
                .build()
            torrentStream = TorrentStream.init(options)
        } else {
            torrentStream!!.resumeSession()
        }

        isActive = true
        progress = 0f
        downloadSpeed = 0L
        peerCount = 0
        streamUrl = ""
        videoFileName = ""
        videoFileSize = 0L
        streamError = null

        val latch = CountDownLatch(1)
        streamReadyLatch = latch

        val listener = object : TorrentListener {
            override fun onStreamPrepared(torrent: Torrent) {
                Log.i(TAG, "Torrent prepared, download starting automatically")
            }
            override fun onStreamStarted(torrent: Torrent) {
                Log.i(TAG, "Torrent stream started")
            }
            override fun onStreamError(torrent: Torrent?, e: Exception) {
                Log.e(TAG, "Torrent stream error: ${e.message}")
                streamError = e
                isActive = false
                latch.countDown()
            }
            override fun onStreamReady(torrent: Torrent) {
                Log.i(TAG, "Torrent stream ready")
                currentTorrent = torrent
                try {
                    val videoFile = torrent.videoFile
                    videoFileName = videoFile.name
                    videoFileSize = videoFile.length()
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to read video file info", e)
                    streamError = e
                    isActive = false
                }
                latch.countDown()
            }
            override fun onStreamProgress(torrent: Torrent, status: StreamStatus) {
                progress = status.progress
                downloadSpeed = status.downloadSpeed.toLong()
                peerCount = status.seeds
            }
            override fun onStreamStopped() {
                isActive = false
                latch.countDown()
            }
        }

        currentListener = listener
        torrentStream!!.addListener(listener)
        try {
            torrentStream!!.startStream(magnetUrl)
        } catch (e: Exception) {
            torrentStream!!.removeListener(listener)
            currentListener = null
            isActive = false
            throw e
        }

        var interrupted = false
        try {
            if (!latch.await(120, TimeUnit.SECONDS)) {
                torrentStream!!.removeListener(listener)
                currentListener = null
                isActive = false
                torrentStream?.stopStream()
                throw IllegalStateException("Torrent stream timed out after 120 seconds")
            }
        } catch (e: InterruptedException) {
            torrentStream!!.removeListener(listener)
            currentListener = null
            isActive = false
            Thread.currentThread().interrupt()
            torrentStream?.stopStream()
            interrupted = true
        }

        streamError?.let {
            torrentStream!!.removeListener(listener)
            currentListener = null
            isActive = false
            torrentStream?.stopStream()
            throw it
        }

        if (interrupted) {
            throw IllegalStateException("Torrent stream was interrupted")
        }

        val torrent = currentTorrent
        if (torrent == null) {
            torrentStream!!.removeListener(listener)
            currentListener = null
            isActive = false
            torrentStream?.stopStream()
            throw IllegalStateException("Torrent not available after stream ready")
        }

        videoFileName = torrent.videoFile.name
        videoFileSize = torrent.videoFile.length()

        var port = 11470
        var serverStarted = false
        var attempts = 0
        var server: LocalHttpServer? = null
        while (!serverStarted && attempts < 20) {
            try {
                server = LocalHttpServer(torrent, port)
                server.start()
                serverStarted = true
            } catch (e: Exception) {
                Log.w(TAG, "Port $port in use, trying next: ${e.message}")
                port++
                attempts++
            }
        }
        if (!serverStarted || server == null) {
            torrentStream!!.removeListener(listener)
            currentListener = null
            isActive = false
            torrentStream?.stopStream()
            throw IllegalStateException("Failed to bind any port from 11470 to 11490")
        }
        activeServer = server
        streamUrl = "http://127.0.0.1:$port/stream"
        Log.i(TAG, "HTTP server ready on port $port")

        return TorrentStreamInfo(streamUrl, videoFileName, videoFileSize)
    }

    fun stopStream() {
        activeServer?.stop()
        activeServer = null
        currentTorrent = null
        currentListener?.let { torrentStream?.removeListener(it) }
        currentListener = null
        torrentStream?.stopStream()
        isActive = false
        streamUrl = ""
        videoFileName = ""
        videoFileSize = 0L
        streamReadyLatch?.countDown()
        streamReadyLatch = null
    }

    fun getStatus(): TorrentStatus {
        return TorrentStatus(progress, downloadSpeed, peerCount, isActive)
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

data class TorrentStreamInfo(val streamUrl: String, val fileName: String, val fileSize: Long)
data class TorrentStatus(val progress: Float, val downloadRate: Long, val numPeers: Int, val active: Boolean)
