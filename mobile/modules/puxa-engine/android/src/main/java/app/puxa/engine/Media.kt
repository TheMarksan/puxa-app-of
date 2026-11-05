package app.puxa.engine

import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMuxer
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/**
 * Operações locais sobre MP4/M4A, sem recodificar: o YouTube entrega áudio e vídeo em MP4
 * fragmentado (DASH); aqui eles viram um MP4 comum, que o WhatsApp e os players aceitam.
 */
object Media {

  private class Source(val extractor: MediaExtractor, val tracks: IntArray) {
    var done = false
    var offsetUs = 0L
    var firstPts = Long.MIN_VALUE
  }

  /**
   * Copia as faixas de áudio e vídeo de [inputs] para um único MP4 em [output],
   * intercalando as amostras por tempo. Com [startUs]/[endUs], copia só esse trecho
   * e começa o arquivo em zero (usado no corte do áudio).
   */
  fun remux(inputs: List<File>, output: File, startUs: Long = 0L, endUs: Long = Long.MAX_VALUE, cancelled: () -> Boolean = { false }) {
    val muxer = MediaMuxer(output.path, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
    val sources = mutableListOf<Source>()
    var maxSample = 1 shl 20
    var started = false
    try {
      for (file in inputs) {
        val ex = MediaExtractor()
        ex.setDataSource(file.path)
        val map = IntArray(ex.trackCount) { -1 }
        for (t in 0 until ex.trackCount) {
          val format = ex.getTrackFormat(t)
          val mime = format.getString(MediaFormat.KEY_MIME) ?: continue
          if (!mime.startsWith("audio/") && !mime.startsWith("video/")) continue
          ex.selectTrack(t)
          map[t] = muxer.addTrack(format)
          if (format.containsKey(MediaFormat.KEY_MAX_INPUT_SIZE)) {
            maxSample = max(maxSample, format.getInteger(MediaFormat.KEY_MAX_INPUT_SIZE))
          }
          if (mime.startsWith("video/")) {
            // Quadros-chave em 1080p passam de 1 MB; sobra espaço em vez de estourar o buffer
            maxSample = max(maxSample, 4 shl 20)
            if (format.containsKey(MediaFormat.KEY_ROTATION)) muxer.setOrientationHint(format.getInteger(MediaFormat.KEY_ROTATION))
          }
        }
        if (startUs > 0) ex.seekTo(startUs, MediaExtractor.SEEK_TO_PREVIOUS_SYNC)
        sources += Source(ex, map)
      }
      muxer.start()
      started = true
      val buffer = ByteBuffer.allocateDirect(maxSample + (512 shl 10))
      val info = MediaCodec.BufferInfo()
      while (true) {
        if (cancelled()) throw InterruptedException("cancelado")
        // Próxima amostra: a de menor tempo entre as fontes, para o arquivo sair intercalado
        val next = sources.filter { !it.done }.minByOrNull { it.extractor.sampleTime.let { t -> if (t < 0) Long.MAX_VALUE else t } } ?: break
        val ex = next.extractor
        val track = ex.sampleTrackIndex
        val pts = ex.sampleTime
        if (track < 0 || pts < 0 || pts >= endUs) { next.done = true; continue }
        val size = ex.readSampleData(buffer, 0)
        if (size < 0) { next.done = true; continue }
        if (next.firstPts == Long.MIN_VALUE) {
          next.firstPts = pts
          next.offsetUs = if (startUs > 0) pts else 0L
        }
        val flags = if (ex.sampleFlags and MediaExtractor.SAMPLE_FLAG_SYNC != 0) MediaCodec.BUFFER_FLAG_KEY_FRAME else 0
        info.set(0, size, max(0L, pts - next.offsetUs), flags)
        val out = next.tracks[track]
        if (out >= 0) muxer.writeSampleData(out, buffer, info)
        ex.advance()
      }
      muxer.stop()
    } catch (e: Throwable) {
      output.delete()
      throw e
    } finally {
      sources.forEach { it.extractor.release() }
      try { muxer.release() } catch (_: Throwable) {}
    }
  }

  /** Duração da primeira faixa de áudio, em segundos. */
  fun durationSeconds(file: File): Double {
    val ex = MediaExtractor()
    try {
      ex.setDataSource(file.path)
      for (t in 0 until ex.trackCount) {
        val format = ex.getTrackFormat(t)
        if (format.containsKey(MediaFormat.KEY_DURATION)) return format.getLong(MediaFormat.KEY_DURATION) / 1_000_000.0
      }
    } finally {
      ex.release()
    }
    return 0.0
  }

  /** Picos normalizados (0–1) do áudio, para desenhar a forma de onda no editor de trecho. */
  fun peaks(file: File, buckets: Int): List<Double> {
    val ex = MediaExtractor()
    ex.setDataSource(file.path)
    val track = (0 until ex.trackCount).firstOrNull {
      ex.getTrackFormat(it).getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true
    } ?: run { ex.release(); return List(buckets) { 0.0 } }
    val format = ex.getTrackFormat(track)
    ex.selectTrack(track)
    val durationUs = if (format.containsKey(MediaFormat.KEY_DURATION)) format.getLong(MediaFormat.KEY_DURATION) else 0L
    val codec = MediaCodec.createDecoderByType(format.getString(MediaFormat.KEY_MIME)!!)
    val result = DoubleArray(buckets)
    var floatPcm = false
    try {
      codec.configure(format, null, null, 0)
      codec.start()
      val info = MediaCodec.BufferInfo()
      var inputDone = false
      while (true) {
        if (!inputDone) {
          val inIndex = codec.dequeueInputBuffer(10_000)
          if (inIndex >= 0) {
            val buf = codec.getInputBuffer(inIndex)!!
            val size = ex.readSampleData(buf, 0)
            if (size < 0) {
              codec.queueInputBuffer(inIndex, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
              inputDone = true
            } else {
              codec.queueInputBuffer(inIndex, 0, size, ex.sampleTime, 0)
              ex.advance()
            }
          }
        }
        val outIndex = codec.dequeueOutputBuffer(info, 10_000)
        when {
          outIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
            val of = codec.outputFormat
            floatPcm = of.containsKey("pcm-encoding") && of.getInteger("pcm-encoding") == 4
          }
          outIndex >= 0 -> {
            val buf = codec.getOutputBuffer(outIndex)
            if (buf != null && info.size > 0 && durationUs > 0) {
              buf.position(info.offset)
              buf.limit(info.offset + info.size)
              buf.order(ByteOrder.LITTLE_ENDIAN)
              var peak = 0.0
              if (floatPcm) {
                val fb = buf.asFloatBuffer()
                var i = 0
                while (i < fb.limit()) { peak = max(peak, abs(fb.get(i).toDouble())); i += 4 }
              } else {
                val sb = buf.asShortBuffer()
                var i = 0
                while (i < sb.limit()) { peak = max(peak, abs(sb.get(i).toInt()) / 32768.0); i += 4 }
              }
              val b = min(buckets - 1, ((info.presentationTimeUs.toDouble() / durationUs) * buckets).toInt().coerceAtLeast(0))
              result[b] = max(result[b], peak)
            }
            codec.releaseOutputBuffer(outIndex, false)
            if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) break
          }
        }
      }
    } finally {
      try { codec.stop() } catch (_: Throwable) {}
      codec.release()
      ex.release()
    }
    // Buracos (baldes sem amostra) herdam o vizinho, e tudo é normalizado pelo pico máximo
    for (i in 1 until buckets) if (result[i] == 0.0) result[i] = result[i - 1] * 0.6
    val loudest = result.maxOrNull()?.takeIf { it > 0 } ?: 1.0
    return result.map { ((it / loudest) * 1000).toInt() / 1000.0 }
  }
}
