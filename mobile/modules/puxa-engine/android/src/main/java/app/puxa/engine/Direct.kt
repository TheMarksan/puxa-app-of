package app.puxa.engine

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import okhttp3.Request
import java.io.File
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * Mídia de link direto (Instagram e X): o link já aponta para o MP4 ou a foto no servidor da
 * rede. Baixa com progresso no mesmo [JobState] do YouTube e, para MP3, converte no aparelho.
 */
object Direct {
  private val client by lazy { http.newBuilder().readTimeout(60, TimeUnit.SECONDS).build() }

  /** Resultado: o arquivo e o tipo dele. */
  data class Out(val file: File, val mime: String)

  /** [kind]: "video" (MP4 como veio), "audio" (MP3 tirado do vídeo) ou "image". */
  suspend fun prepare(
    job: JobState,
    url: String,
    headers: Map<String, String>,
    kind: String,
    title: String,
    workDir: File,
    onStage: (String) -> Unit,
  ): Out {
    workDir.mkdirs()
    onStage("downloading")
    val raw = File(workDir, "raw")
    val type = download(job, url, headers, raw)
    if (job.cancelled) throw CancellationException("cancelado")

    if (kind == "image") {
      val ext = when {
        type.contains("png") -> "png"
        type.contains("webp") -> "webp"
        type.contains("heic") -> "heic"
        else -> "jpg"
      }
      val out = File(workDir, "media.$ext")
      raw.renameTo(out)
      return Out(out, if (ext == "jpg") "image/jpeg" else "image/$ext")
    }

    if (kind == "audio") {
      onStage("processing")
      val out = File(workDir, "media.mp3")
      val r = try {
        Render.ffmpeg(job.id, listOf("-y", "-v", "error", "-i", raw.path, "-vn", "-c:a", "libmp3lame", "-b:a", "192k", "-id3v2_version", "3", "-metadata", "title=$title", out.path)) { _, _ -> }
      } finally {
        raw.delete()
      }
      if (job.cancelled || r.cancelled) throw CancellationException("cancelado")
      if (!r.ok) throw PuxaException("process_failed", "Este vídeo não tem áudio para virar MP3.")
      return Out(out, "audio/mpeg")
    }

    val out = File(workDir, "media.mp4")
    raw.renameTo(out)
    return Out(out, "video/mp4")
  }

  /** Baixa em um pedido só (com novas tentativas retomando pelo Range). Devolve o Content-Type. */
  private suspend fun download(job: JobState, url: String, headers: Map<String, String>, dest: File): String {
    var attempt = 0
    var type = ""
    dest.delete()
    while (true) {
      val have = if (dest.exists()) dest.length() else 0L
      try {
        val b = Request.Builder().url(url).header("User-Agent", headers["User-Agent"] ?: USER_AGENT).header("Accept", "*/*")
        headers.forEach { (k, v) -> if (!k.equals("User-Agent", true)) b.header(k, v) }
        if (have > 0) b.header("Range", "bytes=$have-")
        client.newCall(b.build()).execute().use { r ->
          if (r.code == 403 || r.code == 410) throw PuxaException("expired", "O link desta mídia expirou. Busque o link de novo.")
          if (r.code == 404) throw PuxaException("unavailable", "Esta mídia não está mais disponível.")
          if (!r.isSuccessful) throw IOException("HTTP ${r.code}")
          val body = r.body ?: throw IOException("sem corpo")
          type = r.header("Content-Type").orEmpty().lowercase()
          val resumed = r.code == 206 && have > 0
          if (!resumed && have > 0) {
            dest.delete()
            job.downloaded.set(0)
          }
          val len = body.contentLength()
          if (len > 0) job.total = (if (resumed) have else 0L) + len
          body.byteStream().use { input ->
            java.io.FileOutputStream(dest, resumed).use { out ->
              val buf = ByteArray(128 shl 10)
              while (true) {
                if (job.cancelled) throw CancellationException("cancelado")
                val n = input.read(buf)
                if (n < 0) break
                out.write(buf, 0, n)
                job.downloaded.addAndGet(n.toLong())
              }
            }
          }
          if (job.total > 0 && dest.length() < job.total) throw IOException("incompleto")
          if (job.total <= 0) job.total = dest.length()
        }
        return type
      } catch (e: CancellationException) {
        throw e
      } catch (e: PuxaException) {
        throw e
      } catch (e: IOException) {
        if (++attempt >= 4 || job.cancelled) throw PuxaException("network", "A conexão caiu durante o download. Tente de novo.", e)
        delay(700L * attempt)
      }
    }
  }
}
