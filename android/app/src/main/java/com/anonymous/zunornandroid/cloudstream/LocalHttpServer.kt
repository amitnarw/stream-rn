package com.anonymous.zunornandroid.cloudstream

import android.util.Log
import java.io.BufferedOutputStream
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.ServerSocket
import java.net.Socket
import java.util.Locale

class LocalHttpServer(private val port: Int, private val streamer: TorrentStreamer) {
    private var serverSocket: ServerSocket? = null
    private var isRunning = false
    private var serverThread: Thread? = null

    fun start() {
        isRunning = true
        serverThread = Thread {
            try {
                serverSocket = ServerSocket(port)
                Log.i(TAG, "Local HTTP range server listening on port $port")
                while (isRunning) {
                    val clientSocket = serverSocket?.accept() ?: break
                    Thread {
                        handleClient(clientSocket)
                    }.start()
                }
            } catch (e: Exception) {
                Log.e(TAG, "Server error: ${e.message}")
            }
        }.apply { start() }
    }

    fun stop() {
        isRunning = false
        try {
            serverSocket?.close()
        } catch (_: Exception) {}
        serverSocket = null
        serverThread?.interrupt()
        serverThread = null
    }

    private fun handleClient(socket: Socket) {
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

            val byteReader = streamer.getByteReader()
            val fileSize = byteReader.fileSize

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

            val contentLength = endByte - startByte + 1
            val out = BufferedOutputStream(socket.getOutputStream())

            // Send HTTP headers
            val headers = StringBuilder()
            headers.append("HTTP/1.1 206 Partial Content\r\n")
            headers.append("Content-Type: video/mp4\r\n")
            headers.append("Content-Length: $contentLength\r\n")
            headers.append("Content-Range: bytes $startByte-$endByte/$fileSize\r\n")
            headers.append("Accept-Ranges: bytes\r\n")
            headers.append("Connection: close\r\n")
            headers.append("\r\n")

            out.write(headers.toString().toByteArray())
            out.flush()

            // Stream file contents
            val buffer = ByteArray(64 * 1024) // 64kB chunks
            var currentOffset = startByte
            while (currentOffset <= endByte && isRunning) {
                val toRead = Math.min(buffer.size.toLong(), endByte - currentOffset + 1).toInt()
                val read = byteReader.readBytes(buffer, currentOffset, toRead)
                if (read <= 0) {
                    // Piece download timed out or was interrupted, break connection to let player retry
                    Log.w(TAG, "Read failed or timed out at offset $currentOffset. Closing connection.")
                    break
                }
                out.write(buffer, 0, read)
                out.flush()
                currentOffset += read
            }
        } catch (e: Exception) {
            Log.w(TAG, "Client handler exception: ${e.message}")
        } finally {
            try { socket.close() } catch (_: Exception) {}
        }
    }

    companion object {
        private const val TAG = "LocalHttpServer"
    }
}
