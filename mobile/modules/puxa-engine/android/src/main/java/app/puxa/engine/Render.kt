package app.puxa.engine

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.RectF
import android.graphics.Typeface
import android.media.MediaMetadataRetriever
import android.os.Build
import android.text.Layout
import android.text.SpannableString
import android.text.Spanned
import android.text.StaticLayout
import android.text.TextPaint
import android.text.style.ForegroundColorSpan
import android.media.ExifInterface
import com.arthenica.ffmpegkit.FFmpegKit
import com.arthenica.ffmpegkit.FFmpegSession
import com.arthenica.ffmpegkit.ReturnCode
import java.io.File
import java.io.FileOutputStream
import java.util.ArrayDeque
import java.util.concurrent.ConcurrentHashMap
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin

/**
 * Tudo o que monta vídeo no aparelho: o FFmpeg (montagem final, cortes, legendas, MP3),
 * a leitura de informações das mídias, as miniaturas da linha do tempo e os PNGs das camadas.
 * O comando do FFmpeg vem pronto do JavaScript (src/editor/render.ts), testado fora do celular.
 */
object Render {

  // ---------- FFmpeg ----------

  private val sessions = ConcurrentHashMap<String, Long>()

  class Result(val ok: Boolean, val cancelled: Boolean, val log: String)

  /**
   * Roda o FFmpeg com os argumentos dados. [onProgress] recebe segundos já gerados e a velocidade.
   * Bloqueia até terminar; chame fora da thread principal.
   */
  fun ffmpeg(jobId: String, args: List<String>, onProgress: (Double, Double) -> Unit): Result {
    val tail = ArrayDeque<String>()
    var lastTick = 0L
    val lock = Object()
    var done: FFmpegSession? = null
    val session = FFmpegKit.executeWithArgumentsAsync(
      args.toTypedArray(),
      { s -> synchronized(lock) { done = s; lock.notifyAll() } },
      { log ->
        // Guarda só avisos e erros (nível <= 24) para explicar uma falha
        if (log.level.value <= 24) synchronized(tail) {
          tail.addLast(log.message.trimEnd())
          while (tail.size > 40) tail.removeFirst()
        }
      },
      { stats ->
        val now = System.currentTimeMillis()
        if (now - lastTick > 200) {
          lastTick = now
          onProgress(stats.time / 1000.0, stats.speed)
        }
      },
    )
    sessions[jobId] = session.sessionId
    synchronized(lock) { while (done == null) lock.wait(500) }
    sessions.remove(jobId)
    val code = session.returnCode
    val log = synchronized(tail) { tail.joinToString("\n") }
    return Result(ReturnCode.isSuccess(code), ReturnCode.isCancel(code), log)
  }

  fun cancel(jobId: String) {
    sessions[jobId]?.let { FFmpegKit.cancel(it) }
  }

  // ---------- Informações e miniaturas ----------

  private val IMAGE_EXT = setOf("jpg", "jpeg", "png", "webp", "heic", "heif", "gif", "bmp")

  /** Duração, tamanho já com a rotação aplicada, se tem áudio/vídeo. Imagens respeitam o EXIF. */
  fun probe(path: String): Map<String, Any?> {
    val file = File(path)
    if (!file.exists()) throw PuxaException("missing_file", "O arquivo não está mais no aparelho.")
    if (file.extension.lowercase() in IMAGE_EXT) {
      val o = BitmapFactory.Options().apply { inJustDecodeBounds = true }
      BitmapFactory.decodeFile(path, o)
      val rot = exifRotation(path)
      val (w, h) = if (rot % 180 == 0) o.outWidth to o.outHeight else o.outHeight to o.outWidth
      return mapOf("kind" to "image", "duration" to 0.0, "width" to w, "height" to h, "hasAudio" to false, "hasVideo" to false, "rotation" to rot)
    }
    val r = MediaMetadataRetriever()
    try {
      r.setDataSource(path)
      val dur = (r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0L) / 1000.0
      val hasVideo = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_HAS_VIDEO) == "yes"
      val hasAudio = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_HAS_AUDIO) == "yes"
      var w = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toIntOrNull() ?: 0
      var h = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toIntOrNull() ?: 0
      var rot = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)?.toIntOrNull() ?: 0
      var duration = dur
      var video = hasVideo
      // Arquivo que o leitor do Android não entende por inteiro (MP4 fragmentado): pergunta ao FFprobe
      if (w <= 0 || h <= 0 || duration <= 0) {
        ffprobe(path)?.let { p ->
          if (p.width > 0 && p.height > 0) { w = p.width; h = p.height; rot = p.rotation; video = true }
          if (duration <= 0) duration = p.duration
        }
      }
      if (rot % 180 != 0) { val t = w; w = h; h = t }
      return mapOf(
        "kind" to if (video) "video" else "audio",
        "duration" to duration, "width" to w, "height" to h,
        "hasAudio" to hasAudio, "hasVideo" to video, "rotation" to rot,
      )
    } finally {
      r.release()
    }
  }

  private data class Probed(val width: Int, val height: Int, val rotation: Int, val duration: Double)

  private fun ffprobe(path: String): Probed? = try {
    val info = com.arthenica.ffmpegkit.FFprobeKit.getMediaInformation(path)?.mediaInformation
    val v = info?.streams?.firstOrNull { it.type == "video" }
    if (info == null) null else {
      val tags = v?.tags
      var rot = tags?.optString("rotate")?.toIntOrNull() ?: 0
      val side = v?.allProperties?.optJSONArray("side_data_list")
      if (side != null) for (i in 0 until side.length()) {
        val d = side.optJSONObject(i) ?: continue
        if (d.has("rotation")) rot = d.optInt("rotation")
      }
      Probed(v?.width?.toInt() ?: 0, v?.height?.toInt() ?: 0, ((rot % 360) + 360) % 360, info.duration?.toDoubleOrNull() ?: 0.0)
    }
  } catch (_: Throwable) { null }

  private fun exifRotation(path: String): Int = try {
    when (ExifInterface(path).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
      ExifInterface.ORIENTATION_ROTATE_90 -> 90
      ExifInterface.ORIENTATION_ROTATE_180 -> 180
      ExifInterface.ORIENTATION_ROTATE_270 -> 270
      else -> 0
    }
  } catch (_: Exception) { 0 }

  /** Quadros em JPEG para a tira de miniaturas da linha do tempo. Os já feitos ficam em cache. */
  fun thumbnails(path: String, times: List<Double>, height: Int, dir: File): List<String> {
    dir.mkdirs()
    val key = (path + File(path).length()).hashCode().toUInt().toString(16)
    val file = File(path)
    if (file.extension.lowercase() in IMAGE_EXT) {
      val out = File(dir, "$key-img-$height.jpg")
      if (!out.exists()) decodeImage(path, height * 3)?.let { bmp -> saveJpeg(scaleToHeight(bmp, height), out) }
      return times.map { out.absolutePath }
    }
    val r = MediaMetadataRetriever()
    try {
      r.setDataSource(path)
      return times.map { t ->
        val out = File(dir, "$key-${(t * 10).roundToInt()}-$height.jpg")
        if (!out.exists()) {
          val us = (t * 1_000_000).toLong()
          val frame = if (Build.VERSION.SDK_INT >= 27) {
            r.getScaledFrameAtTime(us, MediaMetadataRetriever.OPTION_CLOSEST_SYNC, height * 4, height)
          } else {
            r.getFrameAtTime(us, MediaMetadataRetriever.OPTION_CLOSEST_SYNC)
          }
          frame?.let { saveJpeg(scaleToHeight(it, height), out) }
        }
        out.absolutePath
      }
    } finally {
      r.release()
    }
  }

  private fun scaleToHeight(b: Bitmap, h: Int): Bitmap {
    if (b.height == h) return b
    val w = max(1, (b.width * h.toFloat() / b.height).roundToInt())
    return Bitmap.createScaledBitmap(b, w, h, true)
  }

  private fun saveJpeg(b: Bitmap, out: File) {
    FileOutputStream(out).use { b.compress(Bitmap.CompressFormat.JPEG, 82, it) }
  }

  /** Abre uma imagem já girada pelo EXIF e reduzida para no máximo [maxSide] no lado maior. */
  private fun decodeImage(path: String, maxSide: Int): Bitmap? {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(path, bounds)
    var sample = 1
    while (max(bounds.outWidth, bounds.outHeight) / (sample * 2) >= maxSide) sample *= 2
    val bmp = BitmapFactory.decodeFile(path, BitmapFactory.Options().apply { inSampleSize = sample }) ?: return null
    val rot = exifRotation(path)
    if (rot == 0) return bmp
    return Bitmap.createBitmap(bmp, 0, 0, bmp.width, bmp.height, Matrix().apply { postRotate(rot.toFloat()) }, true)
  }

  // ---------- PNGs das camadas ----------

  private val fonts = ConcurrentHashMap<String, Typeface>()

  private fun typeface(path: String?): Typeface {
    if (path.isNullOrEmpty()) return Typeface.DEFAULT_BOLD
    return fonts.getOrPut(path) {
      try { Typeface.createFromFile(path.removePrefix("file://")) } catch (_: Exception) { Typeface.DEFAULT_BOLD }
    }
  }

  private fun color(hex: Any?, fallback: Int): Int {
    val s = (hex as? String)?.removePrefix("#") ?: return fallback
    return try {
      when (s.length) {
        6 -> Color.parseColor("#$s")
        8 -> Color.parseColor("#" + s.substring(6, 8) + s.substring(0, 6)) // RRGGBBAA → AARRGGBB
        else -> fallback
      }
    } catch (_: Exception) { fallback }
  }

  private fun num(v: Any?, d: Double = 0.0): Double = (v as? Number)?.toDouble() ?: d

  /**
   * Desenha cada camada num PNG transparente e devolve caminho e tamanho.
   * Tipos: text, emoji, image, caption (faixa da largura do vídeo), blank, mask, ring.
   */
  fun overlays(specs: List<Map<String, Any?>>, dir: File): List<Map<String, Any?>> {
    dir.mkdirs()
    fitted.clear()
    strip = null
    return specs.mapIndexed { i, spec ->
      val out = File(dir, (spec["name"] as? String) ?: "layer-$i.png")
      val bmp = when (spec["kind"]) {
        "text", "emoji" -> drawText(spec)
        "caption" -> drawCaption(spec)
        "image" -> drawImage(spec)
        "mask" -> drawMask(spec)
        "ring" -> drawRing(spec)
        else -> Bitmap.createBitmap(max(2, num(spec["width"], 2.0).toInt()), max(2, num(spec["height"], 2.0).toInt()), Bitmap.Config.ARGB_8888)
      }
      val rotated = rotate(bmp, num(spec["rotation"]))
      // Tamanho par: o FFmpeg lida melhor com dimensões pares em yuv420p
      val even = padEven(rotated)
      FileOutputStream(out).use { even.compress(Bitmap.CompressFormat.PNG, 100, it) }
      mapOf("path" to out.absolutePath, "width" to even.width, "height" to even.height)
    }
  }

  private fun padEven(b: Bitmap): Bitmap {
    if (b.width % 2 == 0 && b.height % 2 == 0) return b
    val out = Bitmap.createBitmap(b.width + b.width % 2, b.height + b.height % 2, Bitmap.Config.ARGB_8888)
    Canvas(out).drawBitmap(b, 0f, 0f, null)
    return out
  }

  private fun rotate(b: Bitmap, deg: Double): Bitmap {
    if (abs(deg) < 0.01) return b
    val rad = Math.toRadians(deg)
    val w = ceil(abs(b.width * cos(rad)) + abs(b.height * sin(rad))).toInt()
    val h = ceil(abs(b.width * sin(rad)) + abs(b.height * cos(rad))).toInt()
    val out = Bitmap.createBitmap(max(2, w), max(2, h), Bitmap.Config.ARGB_8888)
    val m = Matrix().apply {
      postTranslate(-b.width / 2f, -b.height / 2f)
      postRotate(deg.toFloat())
      postTranslate(w / 2f, h / 2f)
    }
    Canvas(out).drawBitmap(b, m, Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG))
    return out
  }

  private fun layoutFor(text: CharSequence, paint: TextPaint, width: Int, align: Layout.Alignment, spacing: Float): StaticLayout =
    StaticLayout.Builder.obtain(text, 0, text.length, paint, max(1, width))
      .setAlignment(align)
      .setLineSpacing(0f, spacing)
      .setIncludePad(false)
      .build()

  /** [layout] tem a cor de destaque (karaokê); [plain] é o mesmo texto sem ela, para contorno e brilho. */
  private class Styled(val layout: StaticLayout, val plain: StaticLayout, val paint: TextPaint, val padX: Float, val padY: Float)

  /** Texto com o estilo pedido; mede a largura real para a caixa abraçar o texto. */
  private fun styledLayout(spec: Map<String, Any?>, maxWidth: Int): Styled {
    val size = num(spec["size"], 48.0).toFloat()
    val paint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
      textSize = size
      typeface = if (spec["kind"] == "emoji") Typeface.DEFAULT else typeface(spec["font"] as? String)
      color = color(spec["color"], Color.WHITE)
      letterSpacing = num(spec["tracking"], 0.0).toFloat()
    }
    val text = (spec["text"] as? String).orEmpty().ifEmpty { " " }
    val align = when (spec["align"]) {
      "left" -> Layout.Alignment.ALIGN_NORMAL
      "right" -> Layout.Alignment.ALIGN_OPPOSITE
      else -> Layout.Alignment.ALIGN_CENTER
    }
    val bg = spec["background"] as? String ?: "none"
    val padX = when (bg) {
      "box", "line" -> size * 0.38f
      "pill" -> size * 0.62f
      "glow" -> size * 0.3f
      else -> size * 0.16f
    }
    val padY = when (bg) {
      "box", "line", "pill" -> size * 0.2f
      "glow" -> size * 0.24f
      else -> size * 0.12f
    }
    val inner = max(1, (maxWidth - 2 * padX).toInt())
    var plain = layoutFor(text, paint, inner, align, 1.08f)
    // Encolhe a largura até o texto: a caixa não fica com sobra dos lados
    var widest = 0f
    for (l in 0 until plain.lineCount) widest = max(widest, plain.getLineWidth(l))
    val tight = min(inner, ceil(widest).toInt() + 2)
    if (tight < inner) plain = layoutFor(text, paint, tight, align, 1.08f)
    // Palavra em destaque: mesmo texto, mesma largura, só com a cor trocada no trecho
    val from = num(spec["hlStart"], -1.0).toInt()
    val to = num(spec["hlEnd"], -1.0).toInt()
    val layout = if (from in 0 until text.length && to > from) {
      val span = SpannableString(text)
      span.setSpan(ForegroundColorSpan(color(spec["highlight"], Color.rgb(255, 214, 10))), from, min(to, text.length), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
      layoutFor(span, paint, plain.width, align, 1.08f)
    } else plain
    return Styled(layout, plain, paint, padX, padY)
  }

  private fun drawStyled(c: Canvas, st: Styled, spec: Map<String, Any?>, left: Float, top: Float) {
    val bg = spec["background"] as? String ?: "none"
    val bgColor = color(spec["bgColor"], Color.argb(200, 0, 0, 0))
    val size = st.paint.textSize
    val radius = size * num(spec["radius"], 0.28).toFloat()
    val boxW = st.layout.width + 2 * st.padX
    val boxH = st.layout.height + 2 * st.padY
    when (bg) {
      "box" -> {
        val p = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = bgColor }
        c.drawRoundRect(RectF(left, top, left + boxW, top + boxH), radius, radius, p)
      }
      "pill" -> {
        // Pontas totalmente redondas
        val p = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = bgColor }
        val r = min(boxW, boxH) / 2f
        c.drawRoundRect(RectF(left, top, left + boxW, top + boxH), r, r, p)
      }
      "line" -> {
        // Uma caixa por linha, como nos Reels e no TikTok
        val p = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = bgColor }
        for (l in 0 until st.layout.lineCount) {
          val lt = top + st.padY + st.layout.getLineTop(l)
          val lb = top + st.padY + st.layout.getLineBottom(l)
          val ll = left + st.padX + st.layout.getLineLeft(l)
          val lr = left + st.padX + st.layout.getLineRight(l)
          c.drawRoundRect(RectF(ll - st.padX * 0.7f, lt - st.padY * 0.35f, lr + st.padX * 0.7f, lb + st.padY * 0.35f), radius, radius, p)
        }
      }
    }
    c.save()
    c.translate(left + st.padX, top + st.padY)
    val fill = st.paint.color
    if (bg == "outline") {
      st.paint.style = Paint.Style.STROKE
      st.paint.strokeWidth = size * 0.14f
      st.paint.strokeJoin = Paint.Join.ROUND
      st.paint.color = color(spec["bgColor"], Color.BLACK) or (0xFF shl 24)
      st.plain.draw(c)
      st.paint.style = Paint.Style.FILL
      st.paint.color = fill
    }
    if (bg == "glow") {
      // Neon: duas camadas de brilho largo na cor escolhida e uma mais justa, depois a letra limpa
      val glow = color(spec["bgColor"], Color.MAGENTA) or (0xFF shl 24)
      st.paint.color = glow
      st.paint.setShadowLayer(size * 0.5f, 0f, 0f, glow)
      st.plain.draw(c)
      st.plain.draw(c)
      st.paint.setShadowLayer(size * 0.16f, 0f, 0f, glow)
      st.plain.draw(c)
      st.paint.clearShadowLayer()
      st.paint.color = fill
    }
    if (bg == "shadow") st.paint.setShadowLayer(size * 0.18f, 0f, size * 0.06f, Color.argb(170, 0, 0, 0))
    st.layout.draw(c)
    st.paint.clearShadowLayer()
    c.restore()
  }

  private fun drawText(spec: Map<String, Any?>): Bitmap {
    val maxWidth = num(spec["maxWidth"], 1000.0).toInt()
    val st = styledLayout(spec, maxWidth)
    // Margem para contorno, sombra e brilho não serem cortados
    val m = (st.paint.textSize * (if (spec["background"] == "glow") 0.7f else 0.3f)).toInt()
    val w = (st.layout.width + 2 * st.padX).toInt() + 2 * m
    val h = (st.layout.height + 2 * st.padY).toInt() + 2 * m
    val bmp = Bitmap.createBitmap(max(2, w), max(2, h), Bitmap.Config.ARGB_8888)
    drawStyled(Canvas(bmp), st, spec, m.toFloat(), m.toFloat())
    return bmp
  }

  /** Tamanho de letra já ajustado de cada texto de legenda (todos os quadros de uma legenda usam o mesmo). */
  private val fitted = HashMap<String, Double>()

  /** A faixa de legenda é sempre do mesmo tamanho: um bitmap só, limpo a cada quadro. */
  private var strip: Bitmap? = null

  /** A letra encolhe até o texto inteiro da legenda caber na faixa. */
  private fun fittedSize(spec: Map<String, Any?>, text: String, maxWidth: Int, room: Float): Double {
    val key = listOf(text, spec["font"], spec["size"], spec["background"], maxWidth, room).joinToString("|")
    return fitted.getOrPut(key) {
      var size = num(spec["size"], 48.0)
      var guard = 0
      while (guard++ < 8) {
        val st = styledLayout(spec + mapOf("size" to size, "text" to text, "hlStart" to null), maxWidth)
        if (st.layout.height + 2 * st.padY <= room * 0.96f) break
        size *= 0.88
      }
      size
    }
  }

  /**
   * Faixa da largura do vídeo com a legenda. Cada quadro de uma animação vem como um spec:
   * texto visível, opacidade, escala, deslocamento e a palavra em destaque.
   */
  private fun drawCaption(spec: Map<String, Any?>): Bitmap {
    val w = max(2, num(spec["width"], 720.0).toInt())
    val h = max(2, num(spec["height"], 300.0).toInt())
    val margin = num(spec["margin"]).toFloat()
    val maxW = num(spec["maxWidth"], w * 0.88).toInt()
    val bmp = strip?.takeIf { it.width == w && it.height == h } ?: Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888).also { strip = it }
    bmp.eraseColor(Color.TRANSPARENT)
    val opacity = num(spec["opacity"], 1.0).coerceIn(0.0, 1.0)
    if (opacity < 0.01) return bmp
    val text = (spec["text"] as? String).orEmpty()
    val fit = (spec["fitText"] as? String)?.ifEmpty { null } ?: text
    val s = spec + ("size" to fittedSize(spec, fit, maxW, h - 2 * margin))
    val st = styledLayout(s, maxW)
    val boxW = st.layout.width + 2 * st.padX
    val boxH = st.layout.height + 2 * st.padY
    val left = (w - boxW) / 2f
    val top = when (spec["valign"]) {
      "top" -> margin
      "center" -> (h - boxH) / 2f
      else -> h - margin - boxH
    }
    val c = Canvas(bmp)
    val saved = if (opacity < 0.995) c.saveLayerAlpha(0f, 0f, w.toFloat(), h.toFloat(), (opacity * 255).roundToInt()) else c.save()
    c.translate(0f, num(spec["dy"]).toFloat())
    val scale = num(spec["scale"], 1.0).toFloat()
    if (abs(scale - 1f) > 0.001f) c.scale(scale, scale, left + boxW / 2f, top + boxH / 2f)
    drawStyled(c, st, s, left, top)
    c.restoreToCount(saved)
    return bmp
  }

  private fun drawImage(spec: Map<String, Any?>): Bitmap {
    val tw = max(2, num(spec["width"], 400.0).toInt())
    val th = max(2, num(spec["height"], 400.0).toInt())
    val src = decodeImage(spec["src"] as String, max(tw, th) * 2)
      ?: throw PuxaException("image_failed", "Não deu para abrir uma das imagens do projeto.")
    val out = Bitmap.createBitmap(tw, th, Bitmap.Config.ARGB_8888)
    val c = Canvas(out)
    val radius = num(spec["radius"]).toFloat()
    val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
    val rect = RectF(0f, 0f, tw.toFloat(), th.toFloat())
    if (radius > 0) {
      c.drawRoundRect(rect, radius, radius, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.BLACK })
      paint.xfermode = PorterDuffXfermode(PorterDuff.Mode.SRC_IN)
    }
    c.drawBitmap(src, null, rect, paint)
    val border = num(spec["border"]).toFloat()
    if (border > 0) {
      val p = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = border; color = color(spec["borderColor"], Color.WHITE) }
      val inset = border / 2
      c.drawRoundRect(RectF(inset, inset, tw - inset, th - inset), max(0f, radius - inset), max(0f, radius - inset), p)
    }
    return out
  }

  private fun shapePath(c: Canvas, shape: String?, w: Float, h: Float, p: Paint, inset: Float = 0f) {
    val r = RectF(inset, inset, w - inset, h - inset)
    when (shape) {
      "circle" -> c.drawOval(r, p)
      "rounded" -> c.drawRoundRect(r, min(w, h) * 0.18f, min(w, h) * 0.18f, p)
      else -> c.drawRect(r, p)
    }
  }

  /** Máscara em tons de cinza (branco = visível) para o alphamerge da facecam. */
  private fun drawMask(spec: Map<String, Any?>): Bitmap {
    val w = max(2, num(spec["width"], 300.0).toInt())
    val h = max(2, num(spec["height"], w.toDouble()).toInt())
    val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
    val c = Canvas(bmp)
    c.drawColor(Color.BLACK)
    shapePath(c, spec["shape"] as? String, w.toFloat(), h.toFloat(), Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.WHITE })
    return bmp
  }

  /** Borda da facecam, desenhada por cima dela. */
  private fun drawRing(spec: Map<String, Any?>): Bitmap {
    val w = max(2, num(spec["width"], 300.0).toInt())
    val h = max(2, num(spec["height"], w.toDouble()).toInt())
    val stroke = num(spec["border"], 6.0).toFloat()
    val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
    val p = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = stroke; color = color(spec["color"], Color.WHITE) }
    shapePath(Canvas(bmp), spec["shape"] as? String, w.toFloat(), h.toFloat(), p, stroke / 2)
    return bmp
  }
}
