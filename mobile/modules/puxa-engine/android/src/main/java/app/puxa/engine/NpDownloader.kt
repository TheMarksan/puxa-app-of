package app.puxa.engine

import okhttp3.OkHttpClient
import okhttp3.RequestBody.Companion.toRequestBody
import org.schabi.newpipe.extractor.downloader.Downloader
import org.schabi.newpipe.extractor.downloader.Request
import org.schabi.newpipe.extractor.downloader.Response
import org.schabi.newpipe.extractor.exceptions.ReCaptchaException
import java.util.concurrent.TimeUnit

/** Mesmo User-Agent do app NewPipe: o YouTube entrega a mídia para ele em blocos com Range. */
const val USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:153.0) Gecko/20100101 Firefox/153.0"

/** Cliente HTTP compartilhado pela extração (NewPipe) e pelo download da mídia. */
val http: OkHttpClient = OkHttpClient.Builder()
  .connectTimeout(20, TimeUnit.SECONDS)
  .readTimeout(30, TimeUnit.SECONDS)
  .retryOnConnectionFailure(true)
  .build()

/** Implementação do Downloader que o NewPipeExtractor usa para falar com o YouTube. */
class NpDownloader : Downloader() {
  override fun execute(request: Request): Response {
    val body = request.dataToSend()?.toRequestBody()
    val builder = okhttp3.Request.Builder()
      .method(request.httpMethod(), body)
      .url(request.url())
      .addHeader("User-Agent", USER_AGENT)
    request.headers().forEach { (name, values) ->
      builder.removeHeader(name)
      values.forEach { builder.addHeader(name, it) }
    }
    http.newCall(builder.build()).execute().use { response ->
      if (response.code == 429) throw ReCaptchaException("reCaptcha", request.url())
      return Response(
        response.code,
        response.message,
        response.headers.toMultimap(),
        response.body?.string(),
        response.request.url.toString(),
      )
    }
  }
}
