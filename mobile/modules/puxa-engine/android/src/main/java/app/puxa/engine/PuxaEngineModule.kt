package app.puxa.engine

import android.content.ClipData
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Log
import androidx.core.content.FileProvider
import expo.modules.kotlin.functions.Coroutine
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
import java.io.File
import java.util.concurrent.ConcurrentHashMap

/** FileProvider próprio, para não colidir com o de outras bibliotecas no manifesto. */
class PuxaFileProvider : FileProvider()

class PuxaEngineModule : Module() {
  // Sem isso, uma exceção esquecida dentro de um launch derruba o app inteiro
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO + CoroutineExceptionHandler { _, e -> Log.w("Puxa", "tarefa em segundo plano falhou", e) })
  private val jobs = ConcurrentHashMap<String, Pair<JobState, Job>>()

  private val context: Context
    get() = appContext.reactContext ?: throw PuxaException("no_context", "O app ainda está iniciando. Tente de novo.")

  private val root: File
    get() = File(context.cacheDir, "puxa").apply { mkdirs() }

  override fun definition() = ModuleDefinition {
    Name("PuxaEngine")

    Events("onProgress", "onDone", "onError", "onSharedText")

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

    AsyncFunction("startDownload") { jobId: String, videoId: String, optionId: String ->
      val state = JobState(jobId)
      val work = File(root, jobId)
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
          val (file, info) = Engine.prepare(state, videoId, optionId, work) { stage = it }
          ticker.cancel()
          val isAudio = optionId.startsWith("a:")
          val title = Engine.safeTitle(info.name, if (isAudio) "audio" else "video")
          val label = if (isAudio) "" else " (" + (info.videoOnlyStreams.firstOrNull { "v:${it.itag}" == optionId }?.height?.let { "${it}p" } ?: "video") + ")"
          sendEvent("onDone", mapOf(
            "jobId" to jobId,
            "path" to file.absolutePath,
            "filename" to "$title$label.${file.extension}",
            "size" to file.length().toDouble(),
            "duration" to Media.durationSeconds(file).takeIf { it > 0 }.let { it ?: info.duration.toDouble() },
            "mime" to if (isAudio) "audio/mp4" else "video/mp4",
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

    Function("cancel") { jobId: String ->
      jobs.remove(jobId)?.let { (state, job) ->
        state.cancelled = true
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
        val out = File(source.parentFile, "trecho-${(start * 10).toLong()}-${(end * 10).toLong()}.m4a")
        if (!out.exists()) {
          try {
            Media.remux(listOf(source), out, (start * 1_000_000).toLong(), (end * 1_000_000).toLong())
          } catch (e: Throwable) {
            throw PuxaException("clip_failed", "Não deu para cortar o áudio. Tente um trecho um pouco diferente.", e)
          }
        }
        mapOf("path" to out.absolutePath, "size" to out.length().toDouble(), "filename" to filename, "mime" to "audio/mp4")
      }
    }

    AsyncFunction("saveToDownloads") Coroutine { path: String, filename: String, mime: String ->
      withContext(Dispatchers.IO) { save(File(path), filename, mime) }
    }

    AsyncFunction("share") { path: String, mime: String, whatsapp: Boolean, filename: String ->
      share(File(path), mime, whatsapp, filename)
    }

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
    val named = File(file.parentFile, "share").apply { mkdirs() }.let { File(it, filename) }
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

  private fun installed(ctx: Context, pkg: String): Boolean = try {
    ctx.packageManager.getPackageInfo(pkg, 0)
    true
  } catch (_: PackageManager.NameNotFoundException) {
    false
  }
}
