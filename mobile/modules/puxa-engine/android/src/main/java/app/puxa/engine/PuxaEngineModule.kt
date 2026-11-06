package app.puxa.engine

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Log
import android.webkit.CookieManager
import androidx.core.content.FileProvider
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineExceptionHandler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.concurrent.ConcurrentHashMap

/** FileProvider próprio, para não colidir com o de outras bibliotecas no manifesto. */
class PuxaFileProvider : FileProvider()

class PuxaEngineModule : Module() {
  // Sem isso, uma exceção esquecida dentro de um launch derruba o app inteiro
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO + CoroutineExceptionHandler { _, e -> Log.w("Puxa", "tarefa em segundo plano falhou", e) })
  private val jobs = ConcurrentHashMap<String, Pair<JobState, Job>>()
  private val fetches = ConcurrentHashMap<String, Boolean>()
  /** Pedido de "adicionar ao WhatsApp" esperando a resposta do WhatsApp. */
  private var pendingSticker: Promise? = null

  private val context: Context
    get() = appContext.reactContext ?: throw PuxaException("no_context", "O app ainda está iniciando. Tente de novo.")

  private val root: File
    get() = File(context.cacheDir, "puxa").apply { mkdirs() }

  /** Mídia de projetos do modo Criar: fica até o projeto ser apagado. */
  private val mediaRoot: File
    get() = File(context.filesDir, "puxa-media").apply { mkdirs() }

  override fun definition() = ModuleDefinition {
    Name("PuxaEngine")

    Events("onProgress", "onDone", "onError", "onSharedText", "onRenderProgress", "onFetchProgress")

    OnCreate {
      scope.launch {
        Engine.init()
        // Arquivos de dias anteriores não têm mais uso
        runCatching {
          val limit = System.currentTimeMillis() - 24 * 3600_000L
          root.listFiles()?.filter { it.lastModified() < limit }?.forEach { it.deleteRecursively() }
        }
      }
    }

    OnDestroy { scope.cancel() }

    AsyncFunction("getInfo") Coroutine { text: String ->
      withContext(Dispatchers.IO) {
        val id = Engine.videoId(text)
        Engine.summarize(id, Engine.info(id))
      }
    }

    AsyncFunction("startDownload") { jobId: String, videoId: String, optionId: String, persistent: Boolean ->
      runJob(jobId, persistent) { state, work, setStage ->
        val (file, info) = Engine.prepare(state, videoId, optionId, work, setStage)
        val isAudio = optionId.startsWith("a:") || optionId.startsWith("m:")
        val title = Engine.safeTitle(info.name, if (isAudio) "audio" else "video")
        val label = if (isAudio) "" else " (" + (info.videoOnlyStreams.firstOrNull { "v:${it.itag}" == optionId }?.height?.let { "${it}p" } ?: "video") + ")"
        Done(
          file,
          "$title$label.${file.extension}",
          when {
            optionId.startsWith("m:") -> "audio/mpeg"
            isAudio -> "audio/mp4"
            else -> "video/mp4"
          },
          info.duration.toDouble(),
        )
      }
    }

    // Instagram e X: o link já aponta para a mídia. [kind]: video, audio (MP3) ou image
    AsyncFunction("startUrlDownload") { jobId: String, url: String, headers: Map<String, String>, kind: String, title: String, persistent: Boolean ->
      runJob(jobId, persistent) { state, work, setStage ->
        val out = Direct.prepare(state, url, headers, kind, title, work, setStage)
        val name = Engine.safeTitle(title, if (kind == "image") "foto" else if (kind == "audio") "audio" else "video")
        Done(out.file, "$name.${out.file.extension}", out.mime, 0.0)
      }
    }

    Function("cancel") { jobId: String ->
      jobs.remove(jobId)?.let { (state, job) ->
        state.cancelled = true
        Render.cancel(jobId)
        job.cancel()
      }
    }

    AsyncFunction("waveform") Coroutine { path: String, buckets: Int ->
      withContext(Dispatchers.Default) {
        try {
          Media.peaks(File(path), buckets)
        } catch (e: Throwable) {
          throw PuxaException("waveform_failed", "Não deu para ler o áudio para desenhar a onda. Use os campos de início e fim.", e)
        }
      }
    }

    AsyncFunction("trim") Coroutine { path: String, start: Double, end: Double, filename: String ->
      withContext(Dispatchers.IO) {
        if (end - start < 1.0) throw PuxaException("invalid_range", "O trecho precisa ter pelo menos 1 segundo.")
        val source = File(path)
        val mp3 = source.extension.lowercase() == "mp3"
        val out = File(source.parentFile, "trecho-${(start * 10).toLong()}-${(end * 10).toLong()}.${if (mp3) "mp3" else "m4a"}")
        if (!out.exists()) {
          try {
            if (mp3) {
              // MP3 não cabe no MediaMuxer: o FFmpeg copia os quadros do trecho sem recodificar
              val r = Render.ffmpeg("trim-${out.name}", listOf("-y", "-v", "error", "-ss", "%.3f".format(java.util.Locale.US, start), "-to", "%.3f".format(java.util.Locale.US, end), "-i", source.path, "-c", "copy", "-map_metadata", "0", out.path)) { _, _ -> }
              if (!r.ok) throw IllegalStateException(r.log)
            } else {
              Media.remux(listOf(source), out, (start * 1_000_000).toLong(), (end * 1_000_000).toLong())
            }
          } catch (e: Throwable) {
            out.delete()
            throw PuxaException("clip_failed", "Não deu para cortar o áudio. Tente um trecho um pouco diferente.", e)
          }
        }
        mapOf("path" to out.absolutePath, "size" to out.length().toDouble(), "filename" to filename.replace(Regex("\\.m4a$"), if (mp3) ".mp3" else ".m4a"), "mime" to if (mp3) "audio/mpeg" else "audio/mp4")
      }
    }

    AsyncFunction("saveToDownloads") Coroutine { path: String, filename: String, mime: String ->
      withContext(Dispatchers.IO) { save(File(path), filename, mime) }
    }

    AsyncFunction("share") { path: String, mime: String, whatsapp: Boolean, filename: String ->
      share(File(path), mime, whatsapp, filename)
    }

    // ---------- Modo Criar: montagem, mídia, legendas, trilha ----------

    Function("dirs") {
      mapOf("cache" to context.cacheDir.absolutePath, "files" to context.filesDir.absolutePath, "media" to mediaRoot.absolutePath)
    }

    AsyncFunction("probe") Coroutine { path: String ->
      withContext(Dispatchers.IO) { Render.probe(path.removePrefix("file://")) }
    }

    AsyncFunction("thumbnails") Coroutine { path: String, times: List<Double>, height: Int ->
      withContext(Dispatchers.IO) {
        try {
          Render.thumbnails(path.removePrefix("file://"), times, height, File(context.cacheDir, "puxa-thumbs"))
        } catch (e: Throwable) {
          throw PuxaException("thumbs_failed", "Não deu para ler os quadros deste vídeo.", e)
        }
      }
    }

    AsyncFunction("renderOverlays") Coroutine { dir: String, specsJson: String ->
      withContext(Dispatchers.Default) {
        val arr = JSONArray(specsJson)
        val specs = (0 until arr.length()).map { toMap(arr.getJSONObject(it)) }
        try {
          Render.overlays(specs, File(dir.removePrefix("file://")))
        } catch (e: PuxaException) {
          throw e
        } catch (e: Throwable) {
          throw PuxaException("overlay_failed", "Não deu para desenhar textos e figurinhas.", e)
        }
      }
    }

    // Roda um comando do FFmpeg montado no JavaScript; progresso por onRenderProgress
    AsyncFunction("ffmpeg") Coroutine { jobId: String, args: List<String>, total: Double ->
      withContext(Dispatchers.IO) {
        val r = Render.ffmpeg(jobId, args) { seconds, speed ->
          sendEvent("onRenderProgress", mapOf(
            "jobId" to jobId,
            "progress" to if (total > 0) (seconds / total).coerceIn(0.0, 1.0) else 0.0,
            "speed" to speed,
          ))
        }
        if (r.cancelled) throw PuxaException("cancelled", "Cancelado.")
        if (!r.ok) throw PuxaException("render_failed", "Não deu para montar o vídeo.\n---\n" + r.log.takeLast(3000))
        true
      }
    }

    Function("cancelRender") { jobId: String -> Render.cancel(jobId) }

    AsyncFunction("search") Coroutine { query: String ->
      withContext(Dispatchers.IO) { Engine.search(query) }
    }

    AsyncFunction("captionText") Coroutine { videoId: String, index: Int, translateTo: String? ->
      withContext(Dispatchers.IO) { Engine.captionText(videoId, index, translateTo) }
    }

    AsyncFunction("translate") Coroutine { lines: List<String>, from: String, to: String ->
      withContext(Dispatchers.IO) { Translate.lines(lines, from, to) }
    }

    AsyncFunction("fetchToFile") Coroutine { jobId: String, url: String, dest: String ->
      withContext(Dispatchers.IO) {
        fetches[jobId] = true
        try {
          Translate.fetch(url, File(dest.removePrefix("file://")), { fetches[jobId] != true }) { got, total ->
            sendEvent("onFetchProgress", mapOf("jobId" to jobId, "downloaded" to got.toDouble(), "total" to total.toDouble()))
          }
          dest
        } finally {
          fetches.remove(jobId)
        }
      }
    }

    Function("cancelFetch") { jobId: String -> fetches[jobId] = false }

    // ---------- Figurinhas ----------

    AsyncFunction("stickerFolders") Coroutine { ->
      withContext(Dispatchers.IO) { Stickers.folders(context).map { Stickers.toMap(context, it) } }
    }

    AsyncFunction("stickerFolderCreate") Coroutine { name: String ->
      withContext(Dispatchers.IO) { Stickers.toMap(context, Stickers.create(context, name)) }
    }

    AsyncFunction("stickerFolderRename") Coroutine { id: String, name: String ->
      withContext(Dispatchers.IO) { Stickers.toMap(context, Stickers.rename(context, id, name)) }
    }

    AsyncFunction("stickerFolderDelete") Coroutine { id: String ->
      withContext(Dispatchers.IO) {
        Stickers.delete(context, id)
        true
      }
    }

    AsyncFunction("stickerAdd") Coroutine { folderId: String, animated: Boolean, webp: String, poster: String, emojis: List<String>, label: String ->
      withContext(Dispatchers.IO) {
        val f = Stickers.add(context, folderId, animated, File(webp.removePrefix("file://")), File(poster.removePrefix("file://")), emojis, label)
        Stickers.toMap(context, f)
      }
    }

    AsyncFunction("stickerRemove") Coroutine { folderId: String, file: String ->
      withContext(Dispatchers.IO) { Stickers.toMap(context, Stickers.remove(context, folderId, file)) }
    }

    AsyncFunction("stickerMove") Coroutine { fromId: String, file: String, toId: String ->
      withContext(Dispatchers.IO) { Stickers.move(context, fromId, file, toId).map { Stickers.toMap(context, it) } }
    }

    // Abre o "Adicionar pacote de figurinhas" do WhatsApp; resolve quando a pessoa volta
    AsyncFunction("stickerToWhatsApp") { packId: String, promise: Promise ->
      val ctx = context
      val activity = appContext.currentActivity ?: throw PuxaException("no_activity", "O app ainda está abrindo. Tente de novo.")
      val (folder, pack) = Stickers.findPack(ctx, packId) ?: throw PuxaException("sticker_folder", "Essa pasta não existe mais.")
      if (pack.stickers.isEmpty()) throw PuxaException("sticker_empty", "Faça uma figurinha primeiro.")
      val target = listOf("com.whatsapp", "com.whatsapp.w4b").firstOrNull { installed(ctx, it) }
        ?: throw PuxaException("no_whatsapp", "O WhatsApp não está instalado neste aparelho.")
      val intent = Intent("com.whatsapp.intent.action.ENABLE_STICKER_PACK").apply {
        putExtra("sticker_pack_id", pack.id)
        putExtra("sticker_pack_authority", Stickers.authority(ctx))
        putExtra("sticker_pack_name", Stickers.packName(folder, pack.animated))
        setPackage(target)
      }
      pendingSticker?.resolve(mapOf("added" to false, "error" to null))
      pendingSticker = promise
      try {
        activity.startActivityForResult(intent, STICKER_REQUEST)
      } catch (e: ActivityNotFoundException) {
        pendingSticker = null
        promise.reject(PuxaException("no_whatsapp", "Este WhatsApp não aceita pacotes de figurinhas. Atualize o WhatsApp e tente de novo.", e))
      }
    }.runOnQueue(Queues.MAIN)

    OnActivityResult { _, payload ->
      if (payload.requestCode != STICKER_REQUEST) return@OnActivityResult
      val p = pendingSticker ?: return@OnActivityResult
      pendingSticker = null
      p.resolve(mapOf("added" to (payload.resultCode == Activity.RESULT_OK), "error" to payload.data?.getStringExtra("validation_error")))
    }

    // ---------- Ajustes: espaço ocupado e limpeza ----------

    AsyncFunction("storageUsage") Coroutine { ->
      withContext(Dispatchers.IO) { Storage.usage(context) }
    }

    AsyncFunction("clearStorage") Coroutine { kind: String ->
      withContext(Dispatchers.IO) { Storage.clear(context, kind, jobs.keys.toSet()) }
    }

    /** Fone (com fio, USB ou Bluetooth) conectado: dá para ouvir o vídeo enquanto grava. */
    Function("headphones") {
      val am = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return@Function false
      val kinds = mutableSetOf(
        AudioDeviceInfo.TYPE_WIRED_HEADSET,
        AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
        AudioDeviceInfo.TYPE_BLUETOOTH_A2DP,
        AudioDeviceInfo.TYPE_USB_HEADSET,
      )
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) kinds.add(AudioDeviceInfo.TYPE_BLE_HEADSET)
      am.getDevices(AudioManager.GET_DEVICES_OUTPUTS).any { it.type in kinds }
    }

    // Cookies do WebView (o login do Instagram fica neles; o fetch do app usa os mesmos)
    Function("webCookies") { url: String ->
      CookieManager.getInstance().getCookie(url)
    }

    AsyncFunction("clearWebCookies") { promise: Promise ->
      val cm = CookieManager.getInstance()
      cm.removeAllCookies { cm.flush(); promise.resolve(true) }
    }.runOnQueue(Queues.MAIN)

    Function("flushWebCookies") { CookieManager.getInstance().flush() }

    Function("takeSharedText") {
      val activity = appContext.currentActivity ?: return@Function null
      val text = sharedText(activity.intent)
      if (text != null) activity.intent = Intent(activity.intent).apply { action = Intent.ACTION_MAIN; removeExtra(Intent.EXTRA_TEXT) }
      text
    }

    OnNewIntent { intent ->
      sharedText(intent)?.let { sendEvent("onSharedText", mapOf("text" to it)) }
    }
  }

  /** Arquivo pronto de um preparo: o nome legível, o tipo e a duração conhecida (0 se não). */
  private class Done(val file: File, val filename: String, val mime: String, val duration: Double)

  /**
   * Roda um preparo em segundo plano: progresso a cada 300 ms (onProgress), e no fim onDone ou
   * onError. [persistent] guarda na pasta de mídia dos projetos em vez do cache.
   */
  private fun runJob(jobId: String, persistent: Boolean, prepare: suspend (JobState, File, (String) -> Unit) -> Done) {
    val state = JobState(jobId)
    val work = File(if (persistent) mediaRoot else root, jobId)
    val job = scope.launch {
      var stage = "downloading"
      val ticker = launch {
        var lastBytes = 0L
        var speed = 0.0
        var lastTick = System.nanoTime()
        while (isActive) {
          delay(300)
          val now = System.nanoTime()
          val bytes = state.downloaded.get()
          val instant = (bytes - lastBytes) / ((now - lastTick) / 1e9)
          speed = if (speed == 0.0) instant else speed * 0.7 + instant * 0.3
          lastBytes = bytes
          lastTick = now
          val total = state.total
          sendEvent("onProgress", mapOf(
            "jobId" to jobId,
            "stage" to stage,
            "downloaded" to bytes.toDouble(),
            "total" to total.toDouble(),
            "speed" to if (stage == "downloading") speed else 0.0,
            "eta" to if (stage == "downloading" && speed > 1 && total > 0) (total - bytes) / speed else null,
          ))
        }
      }
      try {
        val done = prepare(state, work) { stage = it }
        ticker.cancel()
        sendEvent("onDone", mapOf(
          "jobId" to jobId,
          "path" to done.file.absolutePath,
          "filename" to done.filename,
          "size" to done.file.length().toDouble(),
          "duration" to if (done.mime.startsWith("image")) 0.0 else Media.durationSeconds(done.file).takeIf { it > 0 } ?: done.duration,
          "mime" to done.mime,
        ))
      } catch (e: CancellationException) {
        ticker.cancel()
        work.deleteRecursively()
      } catch (e: PuxaException) {
        ticker.cancel()
        work.deleteRecursively()
        sendEvent("onError", mapOf("jobId" to jobId, "code" to e.code, "message" to e.message))
      } catch (e: Throwable) {
        ticker.cancel()
        work.deleteRecursively()
        sendEvent("onError", mapOf("jobId" to jobId, "code" to "unknown", "message" to "Algo deu errado ao preparar o arquivo. Tente de novo."))
      } finally {
        jobs.remove(jobId)
      }
    }
    jobs[jobId] = state to job
  }

  private fun toMap(o: JSONObject): Map<String, Any?> = o.keys().asSequence().associateWith { k ->
    when (val v = o.get(k)) {
      JSONObject.NULL -> null
      is JSONObject -> toMap(v)
      else -> v
    }
  }

  private fun sharedText(intent: Intent?): String? {
    if (intent?.action != Intent.ACTION_SEND || intent.type?.startsWith("text/") != true) return null
    return intent.getStringExtra(Intent.EXTRA_TEXT)?.takeIf { it.isNotBlank() }
  }

  /**
   * Salva em Download/Puxa pelo MediaStore (Android 10+, sem permissão). No Android 8 e 9 isso exigiria
   * a permissão antiga de armazenamento, então o arquivo vai para a pasta do app; o retorno diz onde ficou.
   */
  private fun save(file: File, filename: String, mime: String): String {
    if (!file.exists()) throw PuxaException("missing_file", "O arquivo não está mais no aparelho. Gere de novo.")
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      val resolver = context.contentResolver
      val values = ContentValues().apply {
        put(MediaStore.Downloads.DISPLAY_NAME, filename)
        put(MediaStore.Downloads.MIME_TYPE, mime)
        put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Puxa")
        put(MediaStore.Downloads.IS_PENDING, 1)
      }
      val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
        ?: throw PuxaException("save_failed", "O Android não deixou salvar em Downloads. Tente de novo.")
      resolver.openOutputStream(uri)?.use { out -> file.inputStream().use { it.copyTo(out) } }
      values.clear()
      values.put(MediaStore.Downloads.IS_PENDING, 0)
      resolver.update(uri, values, null, null)
      return "Download/Puxa"
    }
    val dir = File(context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "Puxa").apply { mkdirs() }
    file.copyTo(File(dir, filename), overwrite = true)
    return "Android/data/${context.packageName}/files/Download/Puxa"
  }

  /**
   * Entrega o arquivo ao WhatsApp (direto no seletor de conversa) ou ao menu de compartilhar.
   * Retorna true se abriu o WhatsApp; false se caiu no menu (WhatsApp não instalado).
   */
  private fun share(file: File, mime: String, whatsapp: Boolean, filename: String): Boolean {
    if (!file.exists()) throw PuxaException("missing_file", "O arquivo não está mais no aparelho. Gere de novo.")
    val ctx = context
    // O nome que aparece no WhatsApp é o do arquivo: dá a ele o nome legível
    // Sempre dentro de cache/puxa, a pasta que o FileProvider expõe (projetos e renders podem estar em outro lugar)
    val named = File(root, "share").apply { mkdirs() }.let { File(it, filename) }
    if (!named.exists() || named.length() != file.length()) file.copyTo(named, overwrite = true)
    val uri = FileProvider.getUriForFile(ctx, "${ctx.packageName}.puxa.files", named)
    val send = Intent(Intent.ACTION_SEND).apply {
      type = mime
      putExtra(Intent.EXTRA_STREAM, uri)
      clipData = ClipData.newRawUri(filename, uri)
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    val target = if (whatsapp) listOf("com.whatsapp", "com.whatsapp.w4b").firstOrNull { installed(ctx, it) } else null
    val intent = if (target != null) send.setPackage(target) else Intent.createChooser(send, "Enviar com")
    val activity = appContext.currentActivity
    if (activity != null) activity.startActivity(intent) else ctx.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    return target != null
  }

  private companion object {
    const val STICKER_REQUEST = 4711
  }

  private fun installed(ctx: Context, pkg: String): Boolean = try {
    ctx.packageManager.getPackageInfo(pkg, 0)
    true
  } catch (_: PackageManager.NameNotFoundException) {
    false
  }
}
