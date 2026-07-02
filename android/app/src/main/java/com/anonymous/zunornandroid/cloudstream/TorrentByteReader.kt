package com.anonymous.zunornandroid.cloudstream

import com.frostwire.jlibtorrent.Priority
import com.frostwire.jlibtorrent.TorrentHandle
import java.io.File
import java.io.RandomAccessFile
import android.util.Log

class TorrentByteReader(
    private val handle: TorrentHandle,
    private val fileIndex: Int,
    val fileSize: Long
) {
    private val torrentInfo = handle.torrentFile()
    private val pieceLength = torrentInfo.pieceLength()
    private val filePath = File(handle.savePath(), torrentInfo.files().filePath(fileIndex))

    fun readBytes(dest: ByteArray, offsetInFile: Long, length: Int): Int {
        if (offsetInFile >= fileSize) return -1
        val bytesToRead = Math.min(length.toLong(), fileSize - offsetInFile).toInt()
        if (bytesToRead <= 0) return 0

        val startPiece = (offsetInFile / pieceLength).toInt()
        val endPiece = ((offsetInFile + bytesToRead - 1) / pieceLength).toInt()

        // Prioritize these pieces and wait for them to download
        for (p in startPiece..endPiece) {
            if (!handle.havePiece(p)) {
                // Set high priority for the pieces currently being requested
                handle.piecePriority(p, Priority.SEVEN)
                
                // Wait loop
                var waited = 0
                val timeout = 15000 // 15 seconds max wait per piece
                while (!handle.havePiece(p) && waited < timeout) {
                    Thread.sleep(100)
                    waited += 100
                }
                if (!handle.havePiece(p)) {
                    Log.w("ZunoTorrent", "Piece $p download timeout!")
                    return 0 // return 0 bytes read to trigger player buffering/retry
                }
            }
        }

        // Once pieces are available, read them from the file on disk
        if (!filePath.exists()) {
            Log.w("ZunoTorrent", "File path does not exist on disk yet: ${filePath.absolutePath}")
            return 0
        }

        RandomAccessFile(filePath, "r").use { raf ->
            raf.seek(offsetInFile)
            return raf.read(dest, 0, bytesToRead)
        }
    }
}
