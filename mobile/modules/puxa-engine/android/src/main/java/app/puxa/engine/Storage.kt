package app.puxa.engine

import android.content.Context
import java.io.File

/**
 * Espaço que o app ocupa, por tipo, e a limpeza de cada um (tela de Ajustes).
 *
 * - downloads: o que foi baixado no Baixar (cache/puxa/<preparo>); some sozinho depois de 24 h.
 * - temp: o resto do cache (vídeos montados, cópias para envio, miniaturas, gravações cruas).
 * - projects: projetos do Criar e as mídias deles.
 * - stickers: as figurinhas feitas no app.
 * - models: o modelo de transcrição da fala.
 */
object Storage {
  private fun puxa(ctx: Context) = File(ctx.cacheDir, "puxa")

  /** Pastas de preparo do Baixar dentro de cache/puxa (as outras entradas são temporárias). */
  private fun downloadDirs(ctx: Context): List<File> =
    puxa(ctx).listFiles()?.filter { it.isDirectory && !it.name.startsWith("render-") && !it.name.startsWith("sticker") && it.name != "share" }.orEmpty()

  private fun size(f: File): Long = if (!f.exists()) 0L else if (f.isFile) f.length() else f.walkBottomUp().filter { it.isFile }.sumOf { it.length() }

  fun usage(ctx: Context): Map<String, Double> {
    val downloads = downloadDirs(ctx).sumOf { size(it) }
    val temp = (size(ctx.cacheDir) - downloads).coerceAtLeast(0)
    val projects = size(File(ctx.filesDir, "puxa-media")) + size(File(ctx.filesDir, "projects"))
    val stickers = size(File(ctx.filesDir, "stickers"))
    val models = size(File(ctx.filesDir, "whisper"))
    return mapOf(
      "downloads" to downloads.toDouble(),
      "temp" to temp.toDouble(),
      "projects" to projects.toDouble(),
      "stickers" to stickers.toDouble(),
      "models" to models.toDouble(),
    )
  }

  /** Apaga um tipo; [keep] são preparos em andamento, que ficam. Devolve os bytes liberados. */
  fun clear(ctx: Context, kind: String, keep: Set<String>): Double {
    val before = usage(ctx)[kind] ?: 0.0
    when (kind) {
      "downloads" -> downloadDirs(ctx).filter { it.name !in keep }.forEach { it.deleteRecursively() }
      "temp" -> {
        val downloads = downloadDirs(ctx).toSet()
        ctx.cacheDir.listFiles()?.forEach { f ->
          if (f == puxa(ctx)) f.listFiles()?.filter { it !in downloads }?.forEach { it.deleteRecursively() }
          else f.deleteRecursively()
        }
      }
      "projects" -> {
        File(ctx.filesDir, "puxa-media").deleteRecursively()
        File(ctx.filesDir, "projects").deleteRecursively()
      }
      "stickers" -> File(ctx.filesDir, "stickers").deleteRecursively()
      "models" -> File(ctx.filesDir, "whisper").deleteRecursively()
      else -> throw PuxaException("storage_kind", "Tipo de arquivo desconhecido: $kind")
    }
    return (before - (usage(ctx)[kind] ?: 0.0)).coerceAtLeast(0.0)
  }
}
