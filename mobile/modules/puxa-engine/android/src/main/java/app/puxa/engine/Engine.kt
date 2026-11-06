package app.puxa.engine

import expo.modules.kotlin.exception.CodedException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.joinAll
import okhttp3.Request
import org.schabi.newpipe.extractor.MediaFormat
import org.schabi.newpipe.extractor.NewPipe
import org.schabi.newpipe.extractor.ServiceList
import org.schabi.newpipe.extractor.exceptions.AgeRestrictedContentException
import org.schabi.newpipe.extractor.exceptions.ContentNotAvailableException
import org.schabi.newpipe.extractor.exceptions.AccountTerminatedException
import org.schabi.newpipe.extractor.exceptions.GeographicRestrictionException
import org.schabi.newpipe.extractor.exceptions.PaidContentException
import org.schabi.newpipe.extractor.exceptions.PrivateContentException
import org.schabi.newpipe.extractor.exceptions.ReCaptchaException
import org.schabi.newpipe.extractor.exceptions.SignInConfirmNotBotException
import org.schabi.newpipe.extractor.exceptions.UnsupportedContentInCountryException
import org.schabi.newpipe.extractor.exceptions.YoutubeMusicPremiumContentException
import org.schabi.newpipe.extractor.localization.ContentCountry
import org.schabi.newpipe.extractor.localization.Localization
import org.schabi.newpipe.extractor.services.youtube.YoutubeParsingHelper
import org.schabi.newpipe.extractor.stream.AudioStream
import org.schabi.newpipe.extractor.stream.StreamInfo
import org.schabi.newpipe.extractor.stream.StreamInfoItem
import org.schabi.newpipe.extractor.stream.StreamType
import org.schabi.newpipe.extractor.stream.VideoStream
import java.io.File
import java.io.IOException
import java.io.RandomAccessFile
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicLong
import kotlin.math.min

class PuxaException(code: String, message: String, cause: Throwable? = null) : CodedException(code, message, cause)

/** Estado de um preparo em andamento, para progresso e cancelamento. */
class JobState(val id: String) {
  @Volatile var cancelled = false
  val downloaded = AtomicLong(0)
  @Volatile var total = 0L
}

object Engine {
  private const val BLOCK = 1L shl 20 // 1 MB por pedido com Range, como o NewPipe
  private const val WORKERS = 3
  private val ID = Regex("^[A-Za-z0-9_-]{11}$")
  private val URL = Regex(
    "^(?:https?://)?(?:(?:www|m|music)\\.)?(?:youtube\\.com/(?:watch/?\\?(?:[^#]*&)?v=|shorts/|live/|embed/|v/)|youtube-nocookie\\.com/embed/|youtu\\.be/)([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])",
    RegexOption.IGNORE_CASE,
  )
  private val cache = ConcurrentHashMap<String, Pair<Long, StreamInfo>>()
  @Volatile private var ready = false

  fun init() {
    if (ready) return
    synchronized(this) {
      if (!ready) {
        NewPipe.init(NpDownloader(), Localization("pt", "BR"), ContentCountry("BR"))
        ready = true
      }
    }
  }

  fun videoId(text: String): String {
    val t = text.trim()
    if (ID.matches(t)) return t
    // O link compartilhado pelo app do YouTube às vezes vem no meio de um texto
    val found = Regex("https?://\\S+").findAll(t).map { it.value }.plus(t)
    for (candidate in found) URL.find(candidate)?.let { return it.groupValues[1] }
    throw PuxaException("invalid_url", "Esse link não é do YouTube, do Instagram nem do X. No app, toque em Compartilhar e escolha Puxa, ou copie o link e cole aqui.")
  }

  /** Busca as informações, com novas tentativas: o YouTube às vezes devolve HTML no lugar do JSON. */
  suspend fun info(videoId: String, fresh: Boolean = false): StreamInfo {
    init()
    if (!fresh) cache[videoId]?.let { (at, info) -> if (System.currentTimeMillis() - at < 20 * 60_000) return info }
    var last: Throwable? = null
    repeat(3) { attempt ->
      try {
        val info = StreamInfo.getInfo(ServiceList.YouTube, "https://www.youtube.com/watch?v=$videoId")
        cache[videoId] = System.currentTimeMillis() to info
        return info
      } catch (e: ContentNotAvailableException) {
        throw readable(e)
      } catch (e: ReCaptchaException) {
        throw PuxaException("bot_check", "O YouTube pediu uma verificação. Espere alguns minutos e tente de novo.", e)
      } catch (e: SignInConfirmNotBotException) {
        throw PuxaException("bot_check", "O YouTube pediu para confirmar que não é um robô. Troque de rede (Wi-Fi ou dados) ou espere alguns minutos.", e)
      } catch (e: Exception) {
        last = e
        delay(600L * (attempt + 1))
      }
    }
    throw if (last is IOException) {
      PuxaException("network", "Sem resposta do YouTube. Confira a internet e tente de novo.", last)
    } else {
      PuxaException("unknown", "O YouTube não respondeu como esperado. Tente de novo em instantes.", last)
    }
  }

  private fun readable(e: ContentNotAvailableException): PuxaException = when (e) {
    is AgeRestrictedContentException -> PuxaException("age_restricted", "O YouTube pede login para vídeos com restrição de idade. Escolha outro vídeo.", e)
    is PrivateContentException -> PuxaException("private", "Este vídeo é privado e não pode ser baixado.", e)
    is GeographicRestrictionException, is UnsupportedContentInCountryException ->
      PuxaException("region_blocked", "Este vídeo não está liberado no seu país.", e)
    is YoutubeMusicPremiumContentException -> PuxaException("members_only", "Esta faixa é só para assinantes do YouTube Music Premium.", e)
    is AccountTerminatedException -> PuxaException("unavailable", "O canal deste vídeo foi encerrado, então ele não está mais disponível.", e)
    is PaidContentException -> PuxaException("members_only", "Este vídeo é pago ou só para membros do canal.", e)
    else -> PuxaException("unavailable", "Vídeo indisponível. Ele pode ter sido removido, ou o link está incompleto.", e)
  }

  private fun bestAudio(info: StreamInfo): AudioStream? =
    info.audioStreams.filter { it.format == MediaFormat.M4A && it.isUrl }.maxByOrNull { it.averageBitrate }

  private fun videoChoices(info: StreamInfo): List<VideoStream> =
    info.videoOnlyStreams
      .filter { it.format == MediaFormat.MPEG_4 && it.isUrl && it.codec?.startsWith("avc1") == true }
      .groupBy { it.height }
      .map { (_, group) -> group.maxBy { it.fps * 10_000 + it.bitrate } }
      .sortedByDescending { it.height }

  private fun len(stream: org.schabi.newpipe.extractor.stream.Stream): Long =
    stream.itagItem?.contentLength?.takeIf { it > 0 } ?: -1L

  private val NOTES = mapOf(1080 to "Full HD", 720 to "HD", 480 to "SD")

  /** Resumo para a interface: o que mostrar e as opções de qualidade com tamanho. */
  fun summarize(videoId: String, info: StreamInfo): Map<String, Any?> {
    if (info.streamType == StreamType.LIVE_STREAM || info.streamType == StreamType.AUDIO_LIVE_STREAM) {
      throw PuxaException("live", "Transmissões ao vivo só podem ser baixadas depois que terminam.")
    }
    val m4a = info.audioStreams.filter { it.format == MediaFormat.M4A && it.isUrl }
      .distinctBy { it.averageBitrate }
      .sortedByDescending { it.averageBitrate }
    val best = bestAudio(info)
    // MP3 sai do melhor M4A, convertido no aparelho (192 kbps); o tamanho é estimado pela duração
    val mp3 = if (best == null) emptyList() else listOf(
      mapOf(
        "id" to "m:${best.itag}",
        "label" to "MP3 192 kbps",
        "note" to "Toca em tudo",
        "size" to (info.duration * 192_000 / 8).toDouble().takeIf { it > 0 },
      ),
    )
    val audio = mp3 + m4a.mapIndexed { i, a ->
      mapOf(
        "id" to "a:${a.itag}",
        "label" to "M4A ${a.averageBitrate} kbps",
        "note" to if (i == 0) "Original" else "Compacto",
        "size" to len(a).takeIf { it > 0 }?.toDouble(),
      )
    }
    val video = (if (best == null) emptyList() else videoChoices(info)).map { v ->
      val size = if (len(v) > 0 && best != null && len(best) > 0) (len(v) + len(best)).toDouble() else null
      mapOf(
        "id" to "v:${v.itag}",
        "label" to "${v.height}p" + if (v.fps > 30) v.fps.toString() else "",
        "note" to (NOTES[v.height] ?: "Baixa"),
        "size" to size,
      )
    }
    if (audio.isEmpty() && video.isEmpty()) {
      throw PuxaException("no_streams", "O YouTube não liberou áudio nem vídeo deste link agora. Troque entre Wi-Fi e dados móveis ou tente de novo em alguns minutos.")
    }
    val thumb = info.thumbnails
      .filter { it.width in 1..720 }
      .maxByOrNull { it.width }?.url
      ?: "https://i.ytimg.com/vi/$videoId/hqdefault.jpg"
    return mapOf(
      "id" to videoId,
      "title" to info.name,
      "channel" to info.uploaderName,
      "duration" to info.duration.toDouble(),
      "viewCount" to info.viewCount.takeIf { it >= 0 }?.toDouble(),
      "uploadDate" to info.uploadDate?.offsetDateTime()?.toLocalDate()?.toString(),
      "thumbnail" to thumb,
      "options" to mapOf("audio" to audio, "video" to video),
      "chapters" to info.streamSegments.map { mapOf("start" to it.startTimeSeconds.toDouble(), "title" to it.title) },
      "captions" to info.subtitles.mapIndexed { i, c ->
        mapOf(
          "index" to i,
          "lang" to c.languageTag,
          "name" to (c.displayLanguageName ?: c.languageTag),
          "auto" to c.isAutoGenerated,
        )
      },
    )
  }

  /**
   * Baixa e prepara o arquivo. Retorna o arquivo final (MP4 comum).
   * [onProgress] recebe (etapa, baixado, total); a etapa "processing" é o reempacotamento.
   */
  suspend fun prepare(
    job: JobState,
    videoId: String,
    optionId: String,
    workDir: File,
    onStage: (String) -> Unit,
  ): Pair<File, StreamInfo> {
    var info = info(videoId)
    val (kind, itag) = optionId.split(":").let { it[0] to it[1].toInt() }
    workDir.mkdirs()

    suspend fun pick(i: StreamInfo): List<Pair<String, Long>> {
      val audio = if (kind == "a" || kind == "m") i.audioStreams.firstOrNull { it.itag == itag } ?: bestAudio(i) else bestAudio(i)
      audio ?: throw PuxaException("format_unavailable", "Essa qualidade não está mais disponível. Escolha outra.")
      if (kind == "a" || kind == "m") return listOf(audio.content to len(audio))
      val v = i.videoOnlyStreams.firstOrNull { it.itag == itag }
        ?: throw PuxaException("format_unavailable", "Essa qualidade não está mais disponível. Escolha outra.")
      return listOf(v.content to len(v), audio.content to len(audio))
    }

    var parts = pick(info)
    val files = parts.indices.map { File(workDir, "part$it") }
    onStage("downloading")
    try {
      try {
        download(job, parts, files)
      } catch (e: HttpStatus) {
        // Links da mídia expiram: busca de novo uma vez e recomeça
        if (e.code != 403) throw e
        info = info(videoId, fresh = true)
        parts = pick(info)
        job.downloaded.set(0)
        download(job, parts, files)
      }
    } catch (e: HttpStatus) {
      files.forEach { it.delete() }
      throw if (e.code == 403) {
        PuxaException("blocked", "O YouTube recusou o download deste vídeo nesta rede. Troque entre Wi-Fi e dados móveis e tente de novo.", e)
      } else {
        PuxaException("network", "O YouTube respondeu com erro ${e.code}. Tente de novo em instantes.", e)
      }
    }
    if (job.cancelled) throw CancellationException("cancelado")

    onStage("processing")
    if (kind == "m") {
      val out = File(workDir, "media.mp3")
      val r = try {
        Render.ffmpeg(job.id, listOf("-y", "-v", "error", "-i", files[0].path, "-vn", "-c:a", "libmp3lame", "-b:a", "192k", "-id3v2_version", "3", "-metadata", "title=${info.name}", "-metadata", "artist=${info.uploaderName}", out.path)) { _, _ -> }
      } finally {
        files.forEach { it.delete() }
      }
      if (job.cancelled || r.cancelled) throw CancellationException("cancelado")
      if (!r.ok) throw PuxaException("process_failed", "Não deu para converter para MP3. Tente o M4A.")
      return out to info
    }
    val ext = if (kind == "a") "m4a" else "mp4"
    val out = File(workDir, "media.$ext")
    try {
      Media.remux(files, out, cancelled = { job.cancelled })
    } catch (e: InterruptedException) {
      throw CancellationException("cancelado")
    } catch (e: Exception) {
      throw PuxaException("process_failed", "Não deu para montar o arquivo final. Tente outra qualidade.", e)
    } finally {
      files.forEach { it.delete() }
    }
    return out to info
  }

  class HttpStatus(val code: Int) : IOException("HTTP $code")

  private suspend fun download(job: JobState, parts: List<Pair<String, Long>>, files: List<File>) {
    val sizes = parts.map { (url, known) -> if (known > 0) known else contentLength(url) }
    job.total = sizes.sum()
    for ((i, part) in parts.withIndex()) {
      if (job.cancelled) throw CancellationException("cancelado")
      downloadParallel(job, part.first, sizes[i], files[i])
    }
  }

  /**
   * Pedido de mídia como o app NewPipe faz: o link do googlevideo pertence ao cliente do YouTube
   * que o gerou (Android, iOS, visionOS ou web), e o User-Agent acompanha esse cliente.
   */
  private fun mediaRequest(url: String, range: String): Request {
    val b = Request.Builder().url(url).header("Accept", "*/*").header("Range", "bytes=$range")
    val ua = when {
      YoutubeParsingHelper.isVisionOsStreamingUrl(url) -> YoutubeParsingHelper.getVisionOsUserAgent(null)
      YoutubeParsingHelper.isIosStreamingUrl(url) -> YoutubeParsingHelper.getIosUserAgent(null)
      YoutubeParsingHelper.isAndroidStreamingUrl(url) -> YoutubeParsingHelper.getAndroidUserAgent(null)
      else -> {
        YoutubeParsingHelper.getOriginReferrerHeaders("https://www.youtube.com").forEach { (k, v) -> v.forEach { b.addHeader(k, it) } }
        USER_AGENT
      }
    }
    return b.header("User-Agent", ua).build()
  }

  private fun contentLength(url: String): Long {
    val req = mediaRequest(url, "0-0")
    http.newCall(req).execute().use { r ->
      if (r.code != 206 && r.code != 200) throw HttpStatus(r.code)
      return r.header("Content-Range")?.substringAfter('/')?.toLongOrNull()
        ?: r.header("Content-Length")?.toLongOrNull()
        ?: throw PuxaException("network", "O YouTube não informou o tamanho do arquivo. Tente de novo.")
    }
  }

  /** Vários pedidos de 1 MB com Range em paralelo, cada um gravando na sua posição do arquivo. */
  private suspend fun downloadParallel(job: JobState, url: String, total: Long, out: File) = coroutineScope {
    RandomAccessFile(out, "rw").use { it.setLength(total) }
    val blocks = ((total + BLOCK - 1) / BLOCK).toInt()
    val next = AtomicInteger(0)
    (0 until min(WORKERS, blocks)).map {
      launch {
        RandomAccessFile(out, "rw").use { raf ->
          while (isActive && !job.cancelled) {
            val index = next.getAndIncrement()
            if (index >= blocks) break
            val start = index * BLOCK
            val end = min(total, start + BLOCK) - 1
            fetchBlock(job, url, start, end, raf)
          }
        }
      }
    }.joinAll()
  }

  private suspend fun fetchBlock(job: JobState, url: String, start: Long, end: Long, raf: RandomAccessFile) {
    var attempt = 0
    while (true) {
      var written = 0L
      try {
        val req = mediaRequest(url, "$start-$end")
        http.newCall(req).execute().use { r ->
          if (r.code != 206) throw HttpStatus(r.code)
          val input = r.body?.byteStream() ?: throw IOException("sem corpo")
          val buf = ByteArray(64 shl 10)
          var pos = start
          while (true) {
            if (job.cancelled) throw CancellationException("cancelado")
            val n = input.read(buf)
            if (n < 0) break
            raf.seek(pos)
            raf.write(buf, 0, n)
            pos += n
            written += n
            job.downloaded.addAndGet(n.toLong())
          }
          if (pos != end + 1) throw IOException("bloco incompleto")
        }
        return
      } catch (e: CancellationException) {
        throw e
      } catch (e: IOException) {
        job.downloaded.addAndGet(-written)
        if (e is HttpStatus && e.code == 403) throw e
        if (++attempt >= 4 || job.cancelled) throw PuxaException("network", "A conexão caiu durante o download. Tente de novo.", e)
        delay(700L * attempt)
      }
    }
  }

  private val UNSAFE = Regex("[<>:\"/\\\\|?*\\u0000-\\u001f]+")

  /** Busca vídeos no YouTube (usada para a trilha sonora). Tira lives e mixes longos demais. */
  fun search(query: String, maxSeconds: Long = 900): List<Map<String, Any?>> {
    init()
    val extractor = ServiceList.YouTube.getSearchExtractor(query, listOf("videos"), "")
    try {
      extractor.fetchPage()
    } catch (e: ReCaptchaException) {
      throw PuxaException("bot_check", "O YouTube pediu uma verificação. Espere alguns minutos e tente de novo.", e)
    } catch (e: IOException) {
      throw PuxaException("network", "Sem resposta do YouTube. Confira a internet e tente de novo.", e)
    }
    return extractor.initialPage.items.filterIsInstance<StreamInfoItem>()
      .filter { it.duration in 20..maxSeconds && it.streamType == StreamType.VIDEO_STREAM }
      .mapNotNull { item ->
        val id = try { videoId(item.url) } catch (_: PuxaException) { return@mapNotNull null }
        mapOf(
          "id" to id,
          "title" to item.name,
          "channel" to item.uploaderName,
          "duration" to item.duration.toDouble(),
          "thumbnail" to (item.thumbnails.filter { it.width in 1..480 }.maxByOrNull { it.width }?.url ?: "https://i.ytimg.com/vi/$id/mqdefault.jpg"),
        )
      }
  }

  /** Texto (TTML) de uma faixa de legenda; com [translateTo], pede a tradução automática do YouTube. */
  suspend fun captionText(videoId: String, index: Int, translateTo: String?): String {
    val track = info(videoId).subtitles.getOrNull(index)
      ?: throw PuxaException("no_captions", "Essa legenda não está mais disponível.")
    var url = track.content
    if (!translateTo.isNullOrEmpty()) url += "&tlang=$translateTo"
    val req = Request.Builder().url(url).header("User-Agent", USER_AGENT).build()
    http.newCall(req).execute().use { r ->
      if (r.code == 429) throw PuxaException("rate_limited", "O YouTube limitou a tradução agora.")
      if (!r.isSuccessful) throw PuxaException("network", "O YouTube não entregou a legenda (erro ${r.code}).")
      val body = r.body?.string().orEmpty()
      if (!body.contains("<p")) throw PuxaException("empty_captions", "A legenda veio vazia.")
      return body
    }
  }

  fun safeTitle(title: String, fallback: String): String =
    title.replace(UNSAFE, " ").replace(Regex("\\s+"), " ").trim(' ', '.').take(110).trim(' ', '.').ifEmpty { fallback }
}
