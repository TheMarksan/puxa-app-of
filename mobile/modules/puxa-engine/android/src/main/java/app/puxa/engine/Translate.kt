package app.puxa.engine

import com.google.android.gms.tasks.Tasks
import com.google.mlkit.common.model.DownloadConditions
import com.google.mlkit.nl.translate.TranslateLanguage
import com.google.mlkit.nl.translate.Translation
import com.google.mlkit.nl.translate.TranslatorOptions
import okhttp3.Request
import java.io.File
import java.io.IOException
import java.util.concurrent.TimeUnit

/** Tradução no aparelho (ML Kit) e download de arquivos grandes com progresso. */
object Translate {

  /** "pt-BR" → "pt"; "es-419" → "es"; null se o tradutor do aparelho não tem o idioma. */
  private fun code(tag: String): String? =
    TranslateLanguage.fromLanguageTag(tag) ?: TranslateLanguage.fromLanguageTag(tag.substringBefore('-').substringBefore('_'))

  /**
   * Traduz linha a linha (cada legenda continua no seu tempo). Na primeira vez baixa o modelo
   * do idioma (uns 30 MB). Bloqueia; chame fora da thread principal.
   */
  fun lines(lines: List<String>, from: String, to: String): List<String> {
    val src = code(from) ?: throw PuxaException("translate_unsupported", "O tradutor do aparelho não conhece esse idioma.")
    val dst = code(to) ?: TranslateLanguage.PORTUGUESE
    if (src == dst) return lines
    val translator = Translation.getClient(TranslatorOptions.Builder().setSourceLanguage(src).setTargetLanguage(dst).build())
    try {
      try {
        Tasks.await(translator.downloadModelIfNeeded(DownloadConditions.Builder().build()), 10, TimeUnit.MINUTES)
      } catch (e: Exception) {
        throw PuxaException("translate_download", "Não deu para baixar o tradutor. Confira a internet e tente de novo.", e)
      }
      return lines.map { line ->
        if (line.isBlank()) line else try {
          Tasks.await(translator.translate(line), 30, TimeUnit.SECONDS)
        } catch (e: Exception) {
          line
        }
      }
    } finally {
      translator.close()
    }
  }

  /** Baixa [url] para [dest] (via arquivo .part), informando bytes recebidos e o total. */
  fun fetch(url: String, dest: File, cancelled: () -> Boolean, onProgress: (Long, Long) -> Unit) {
    dest.parentFile?.mkdirs()
    val part = File(dest.path + ".part")
    val req = Request.Builder().url(url).header("User-Agent", USER_AGENT).build()
    try {
      http.newBuilder().readTimeout(60, TimeUnit.SECONDS).build().newCall(req).execute().use { r ->
        if (!r.isSuccessful) throw PuxaException("network", "O download falhou (erro ${r.code}).")
        val body = r.body ?: throw PuxaException("network", "O download veio vazio.")
        val total = body.contentLength()
        var got = 0L
        var last = 0L
        body.byteStream().use { input ->
          part.outputStream().use { out ->
            val buf = ByteArray(256 shl 10)
            while (true) {
              if (cancelled()) throw PuxaException("cancelled", "Download cancelado.")
              val n = input.read(buf)
              if (n < 0) break
              out.write(buf, 0, n)
              got += n
              val now = System.currentTimeMillis()
              if (now - last > 250) {
                last = now
                onProgress(got, total)
              }
            }
          }
        }
        if (total > 0 && got != total) throw PuxaException("network", "O download veio incompleto. Tente de novo.")
        onProgress(got, if (total > 0) total else got)
      }
      if (!part.renameTo(dest)) {
        part.copyTo(dest, overwrite = true)
        part.delete()
      }
    } catch (e: PuxaException) {
      part.delete()
      throw e
    } catch (e: IOException) {
      part.delete()
      throw PuxaException("network", "A conexão caiu durante o download. Tente de novo.", e)
    }
  }
}
