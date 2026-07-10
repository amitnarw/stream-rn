package com.anonymous.zunornandroid.cloudstream

import com.frostwire.jlibtorrent.Priority
import com.frostwire.jlibtorrent.TorrentHandle
import java.io.File
import java.io.RandomAccessFile
import android.util.Log

class TorrentByteReader(
    private val handle: TorrentHandle,
    private val fileIndex: Int,
    val fileSize: Long,
    private val lock: Any
) {
    private val torrentInfo = handle.torrentFile()
    private val pieceLength = torrentInfo.pieceLength()
    private val filePath = File(handle.savePath(), torrentInfo.files().filePath(fileIndex))

    @Volatile
    private var isReleased = false

    fun release() {
        synchronized(lock) {
            isReleased = true
        }
    }

    private fun isHandleActiveLocked(): Boolean {
        return !isReleased && handle.isValid
    }

    fun readBytes(dest: ByteArray, offsetInFile: Long, length: Int): Int {
        if (offsetInFile >= fileSize) return -1
        val bytesToRead = Math.min(length.toLong(), fileSize - offsetInFile).toInt()
        if (bytesToRead <= 0) return 0

        val fileOffset = torrentInfo.files().fileOffset(fileIndex)
        val startPiece = ((fileOffset + offsetInFile) / pieceLength).toInt()
        val endPiece = ((fileOffset + offsetInFile + bytesToRead - 1) / pieceLength).toInt()

        // Prioritize these pieces and wait for them to download
        for (p in startPiece..endPiece) {
            try {
                var hasPiece = false
                synchronized(lock) {
                    if (!isHandleActiveLocked()) return -1
                    try {
                        hasPiece = handle.havePiece(p)
                    } catch (e: Exception) {
                        Log.w("ZunoTorrent", "Failed checking havePiece($p): ${e.message}")
                        return -1
                    }
                }

                if (!hasPiece) {
                    synchronized(lock) {
                        if (!isHandleActiveLocked()) return -1
                        // Set high priority and set deadline to 1 second
                        try {
                            handle.piecePriority(p, Priority.SEVEN)
                            handle.setPieceDeadline(p, 1000)
                        } catch (e: Exception) {
                            Log.w("ZunoTorrent", "Failed setting piece priority/deadline: ${e.message}")
                        }
                    }
                    
                    // Wait loop — up to 60s per piece. First pieces on a cold connection
                    // with newly discovered peers can easily take 15-30s.
                    var waited = 0
                    val timeout = 60_000 // 60 seconds max wait per piece
                    while (waited < timeout) {
                        var loopHasPiece = false
                        var active = false
                        
                        synchronized(lock) {
                            active = isHandleActiveLocked()
                            if (active) {
                                try {
                                    loopHasPiece = handle.havePiece(p)
                                } catch (_: Exception) {}
                            }
                        }
                        
                        if (!active) {
                            return -1
                        }
                        if (loopHasPiece) {
                            hasPiece = true
                            break
                        }
                        Thread.sleep(100)
                        waited += 100
                    }
                    
                    if (!hasPiece) {
                        Log.w("ZunoTorrent", "Piece $p download timeout!")
                        return 0 // return 0 bytes read to trigger player buffering/retry
                    }
                }
            } catch (e: Exception) {
                Log.e("ZunoTorrent", "Exception in readBytes piece loop: ${e.message}")
                return -1
            }
        }

        // Once pieces are available, read them from the file on disk
        if (!filePath.exists()) {
            Log.w("ZunoTorrent", "File path does not exist on disk yet: ${filePath.absolutePath}")
            return 0
        }

        try {
            RandomAccessFile(filePath, "r").use { raf ->
                raf.seek(offsetInFile)
                return raf.read(dest, 0, bytesToRead)
            }
        } catch (e: Exception) {
            Log.w("ZunoTorrent", "File read exception: ${e.message}")
            return -1
        }
    }
}
