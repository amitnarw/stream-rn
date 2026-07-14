package com.anonymous.zunornandroid.cloudstream

import android.util.Log
import com.github.se_bastiaan.torrentstream.Torrent
import java.io.BufferedOutputStream
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.ServerSocket
import java.net.Socket
import java.util.Collections
import java.util.Locale

class LocalHttpServer(private val torrent: Torrent, private val port: Int) {
    private var serverSocket: ServerSocket? = null
    @Volatile private var isRunning = false
    private val handlerThreads = Collections.synchronizedList(mutableListOf<Thread>())

    fun start() {
        serverSocket = ServerSocket(port)
        isRunning = true
        Thread {
            try {
                Log.i(TAG, "Local HTTP server listening on port $port")
                while (isRunning) {
                    val clientSocket = serverSocket?.accept() ?: break
                    val handler = Thread { handleClient(clientSocket) }
                    handlerThreads.add(handler)
                    handler.start()
                }
            } catch (e: Exception) {
                if (isRunning) {
                    Log.e(TAG, "Server accept error: ${e.message}")
                }
            }
        }.start()
    }

    fun stop() {
        isRunning = false
        try { serverSocket?.close() } catch (_: Exception) {}
        serverSocket = null
        synchronized(handlerThreads) {
            handlerThreads.forEach { it.interrupt() }
            handlerThreads.clear()
        }
    }

    private fun handleClient(socket: Socket) {
        var inputStream: java.io.InputStream? = null
        try {
            val reader = BufferedReader(InputStreamReader(socket.getInputStream()))
            var line = reader.readLine() ?: return

            val requestLine = line.split(" ")
            if (requestLine.size < 2 || requestLine[0] != "GET") {
                socket.close()
                return
            }

            var rangeHeader = ""
            while (true) {
                line = reader.readLine() ?: break
                if (line.isEmpty()) break
                if (line.lowercase(Locale.US).startsWith("range:")) {
                    rangeHeader = line
                }
            }

            val videoFile = torrent.videoFile
            val fileSize = videoFile.length()
            val fileName = videoFile.name

            var startByte = 0L
            var endByte = fileSize - 1

            if (rangeHeader.isNotEmpty()) {
                val rangeValue = rangeHeader.substringAfter("bytes=").trim()
                val parts = rangeValue.split("-")
                if (parts.isNotEmpty()) {
                    startByte = parts[0].toLongOrNull() ?: 0L
                    if (parts.size > 1 && parts[1].isNotEmpty()) {
                        endByte = parts[1].toLongOrNull() ?: (fileSize - 1)
                    }
                }
            }

            val contentType = when (fileName.substringAfterLast(".").lowercase(Locale.US)) {
                "mkv" -> "video/x-matroska"
                "mp4" -> "video/mp4"
                "webm" -> "video/webm"
                "avi" -> "video/x-msvideo"
                "mov" -> "video/quicktime"
                else -> "video/mp4"
            }

            val contentLength = endByte - startByte + 1
            val out = BufferedOutputStream(socket.getOutputStream())

            val headers = StringBuilder()
            headers.append("HTTP/1.1 206 Partial Content\r\n")
            headers.append("Content-Type: $contentType\r\n")
            headers.append("Content-Length: $contentLength\r\n")
            headers.append("Content-Range: bytes $startByte-$endByte/$fileSize\r\n")
            headers.append("Accept-Ranges: bytes\r\n")
            headers.append("Connection: close\r\n")
            headers.append("\r\n")

            out.write(headers.toString().toByteArray())
            out.flush()

            torrent.setInterestedBytes(startByte)
            inputStream = torrent.getVideoStream()
            var skipped = 0L
            while (skipped < startByte) {
                val s = inputStream.skip(startByte - skipped)
                if (s <= 0) break
                skipped += s
            }

            val buffer = ByteArray(64 * 1024)
            var remaining = contentLength
            var consecutiveTimeouts = 0
            val maxConsecutiveTimeouts = 120

            while (remaining > 0 && isRunning && !Thread.currentThread().isInterrupted) {
                val toRead = Math.min(buffer.size.toLong(), remaining).toInt()
                try {
                    val read = inputStream.read(buffer, 0, toRead)
                    if (read < 0) break
                    out.write(buffer, 0, read)
                    out.flush()
                    remaining -= read
                    consecutiveTimeouts = 0
                } catch (e: java.io.IOException) {
                    consecutiveTimeouts++
                    if (consecutiveTimeouts > maxConsecutiveTimeouts) {
                        Log.w(TAG, "Too many consecutive IO errors, closing")
                        break
                    }
                    Thread.sleep(1000)
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "Client handler exception: ${e.message}")
        } finally {
            try {
                inputStream?.close()
            } catch (_: Exception) {}
            try { socket.close() } catch (_: Exception) {}
        }
    }

    companion object {
        private const val TAG = "LocalHttpServer"
    }
}
