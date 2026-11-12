package app.puxa.engine

import android.content.ContentProvider
import android.content.ContentResolver
import android.content.ContentValues
import android.content.Context
import android.content.UriMatcher
import android.content.res.AssetFileDescriptor
import android.database.Cursor
import android.database.MatrixCursor
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.ParcelFileDescriptor
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileNotFoundException

/**
 * Figurinhas feitas no app, organizadas em pastas. O WhatsApp não aceita misturar paradas e
 * animadas no mesmo pacote, então cada pasta vira até dois pacotes: o das paradas (com o id da
 * pasta) e o das animadas (id + "_animadas"). A pasta padrão "puxa" mantém os ids dos pacotes
 * das versões anteriores, para quem já tinha adicionado ao WhatsApp não perder nada.
 *
 * Regras do WhatsApp (github.com/WhatsApp/stickers): WebP 512x512, até 100 KB (parada) ou
 * 500 KB (animada, até 10 s); de 3 a 30 figurinhas por pacote; ícone PNG 96x96 até 50 KB.
 */
object Stickers {
  const val DEFAULT = "puxa"
  const val ANIMATED_SUFFIX = "_animadas"
  const val MAX = 30
  const val MIN = 3
  const val TRAY = "tray.png"

  data class Sticker(val file: String, val poster: String, val emojis: List<String>, val label: String, val created: Long)
  data class Pack(val id: String, val animated: Boolean, val version: Int, val stickers: List<Sticker>)
  data class Folder(val id: String, val name: String, val created: Long, val still: Pack, val moving: Pack) {
    fun pack(animated: Boolean) = if (animated) moving else still
    fun with(p: Pack) = if (p.animated) copy(moving = p) else copy(still = p)
    val packs get() = listOf(still, moving)
  }

  private val lock = Any()
  private val ID = Regex("^[a-z0-9_]{1,40}$")

  fun root(ctx: Context) = File(ctx.filesDir, "stickers").apply { mkdirs() }
  fun dir(ctx: Context, packId: String) = File(root(ctx), packId).apply { mkdirs() }
  private fun index(ctx: Context) = File(root(ctx), "packs.json")
  fun authority(ctx: Context) = "${ctx.packageName}.stickercontentprovider"

  fun packId(folderId: String, animated: Boolean) = if (animated) folderId + ANIMATED_SUFFIX else folderId

  /** Nome do pacote no WhatsApp. */
  fun packName(f: Folder, animated: Boolean) = if (animated) "${f.name} · animadas" else f.name

  fun folders(ctx: Context): List<Folder> = synchronized(lock) { read(ctx) }

  fun folder(ctx: Context, id: String): Folder =
    folders(ctx).firstOrNull { it.id == id } ?: throw PuxaException("sticker_folder", "Essa pasta não existe mais.")

  /** Pasta e tipo de um id de pacote do WhatsApp. */
  fun findPack(ctx: Context, packId: String): Pair<Folder, Pack>? {
    for (f in folders(ctx)) for (p in f.packs) if (p.id == packId) return f to p
    return null
  }

  private fun parseStickers(list: JSONArray?, d: File): List<Sticker> {
    if (list == null) return emptyList()
    return (0 until list.length()).mapNotNull { i ->
      val s = list.optJSONObject(i) ?: return@mapNotNull null
      val file = s.optString("file")
      if (file.isEmpty() || !File(d, file).exists()) return@mapNotNull null
      val emojis = s.optJSONArray("emojis")?.let { e -> (0 until e.length()).map { e.getString(it) } }.orEmpty()
      Sticker(file, s.optString("poster"), emojis.ifEmpty { listOf("😀") }, s.optString("label"), s.optLong("created"))
    }
  }

  private fun read(ctx: Context): List<Folder> {
    val json = runCatching { JSONObject(index(ctx).readText()) }.getOrNull()
    if (json == null || json.optInt("v") < 2) {
      // Formato das versões 1.3: dois pacotes fixos. Viram a pasta "Puxa".
      val still = json?.optJSONObject(DEFAULT)
      val moving = json?.optJSONObject(DEFAULT + ANIMATED_SUFFIX)
      return listOf(
        Folder(
          DEFAULT,
          "Puxa",
          0L,
          Pack(DEFAULT, false, still?.optInt("version", 1) ?: 1, parseStickers(still?.optJSONArray("stickers"), dir(ctx, DEFAULT))),
          Pack(DEFAULT + ANIMATED_SUFFIX, true, moving?.optInt("version", 1) ?: 1, parseStickers(moving?.optJSONArray("stickers"), dir(ctx, DEFAULT + ANIMATED_SUFFIX))),
        ),
      )
    }
    val arr = json.optJSONArray("folders") ?: JSONArray()
    return (0 until arr.length()).mapNotNull { i ->
      val o = arr.optJSONObject(i) ?: return@mapNotNull null
      val id = o.optString("id")
      if (!ID.matches(id)) return@mapNotNull null
      fun pack(animated: Boolean): Pack {
        val pid = packId(id, animated)
        val p = o.optJSONObject(if (animated) "animated" else "still")
        return Pack(pid, animated, p?.optInt("version", 1) ?: 1, parseStickers(p?.optJSONArray("stickers"), dir(ctx, pid)))
      }
      Folder(id, o.optString("name").ifBlank { "Pasta" }, o.optLong("created"), pack(false), pack(true))
    }
  }

  private fun write(ctx: Context, folders: List<Folder>) {
    fun pack(p: Pack) = JSONObject().apply {
      put("version", p.version)
      put("stickers", JSONArray().apply {
        for (s in p.stickers) {
          put(JSONObject().apply {
            put("file", s.file)
            put("poster", s.poster)
            put("emojis", JSONArray(s.emojis))
            put("label", s.label)
            put("created", s.created)
          })
        }
      })
    }
    val o = JSONObject().apply {
      put("v", 2)
      put("folders", JSONArray().apply {
        for (f in folders) {
          put(JSONObject().apply {
            put("id", f.id)
            put("name", f.name)
            put("created", f.created)
            put("still", pack(f.still))
            put("animated", pack(f.moving))
          })
        }
      })
    }
    val tmp = File(root(ctx), "packs.json.tmp")
    tmp.writeText(o.toString())
    if (!tmp.renameTo(index(ctx))) {
      index(ctx).writeText(o.toString())
      tmp.delete()
    }
  }

  private fun cleanName(name: String): String {
    val n = name.replace(Regex("\\s+"), " ").trim().take(40)
    if (n.isEmpty()) throw PuxaException("sticker_name", "Dê um nome para a pasta.")
    return n
  }

  fun create(ctx: Context, name: String): Folder = synchronized(lock) {
    val list = read(ctx).toMutableList()
    val clean = cleanName(name)
    if (list.any { it.name.equals(clean, ignoreCase = true) }) throw PuxaException("sticker_name", "Já existe uma pasta com esse nome.")
    var id: String
    do {
      id = "p" + java.lang.Long.toString(System.currentTimeMillis(), 36) + (('a'..'z').random())
    } while (list.any { it.id == id })
    val f = Folder(id, clean, System.currentTimeMillis(), Pack(packId(id, false), false, 1, emptyList()), Pack(packId(id, true), true, 1, emptyList()))
    list += f
    write(ctx, list)
    f
  }

  fun rename(ctx: Context, id: String, name: String): Folder = synchronized(lock) {
    val list = read(ctx).toMutableList()
    val i = list.indexOfFirst { it.id == id }
    if (i < 0) throw PuxaException("sticker_folder", "Essa pasta não existe mais.")
    val clean = cleanName(name)
    if (list.any { it.id != id && it.name.equals(clean, ignoreCase = true) }) throw PuxaException("sticker_name", "Já existe uma pasta com esse nome.")
    val f = list[i]
    // Versão nova: o WhatsApp relê o pacote (e o nome) na próxima vez que abrir as figurinhas
    val next = f.copy(name = clean, still = f.still.copy(version = f.still.version + 1), moving = f.moving.copy(version = f.moving.version + 1))
    list[i] = next
    write(ctx, list)
    next
  }

  fun delete(ctx: Context, id: String) = synchronized(lock) {
    val list = read(ctx).toMutableList()
    val f = list.firstOrNull { it.id == id } ?: return@synchronized
    f.packs.forEach { File(root(ctx), it.id).deleteRecursively() }
    list.remove(f)
    write(ctx, list)
  }

  /** Pasta onde a figurinha vai: a pedida ou, se ela sumiu, a padrão (criada de novo se preciso). */
  private fun target(list: MutableList<Folder>, id: String): Int {
    val i = list.indexOfFirst { it.id == id }
    if (i >= 0) return i
    val d = list.indexOfFirst { it.id == DEFAULT }
    if (d >= 0) return d
    list += Folder(DEFAULT, "Puxa", System.currentTimeMillis(), Pack(DEFAULT, false, 1, emptyList()), Pack(DEFAULT + ANIMATED_SUFFIX, true, 1, emptyList()))
    return list.lastIndex
  }

  private fun full(f: Folder, animated: Boolean) = PuxaException(
    "sticker_full",
    "A pasta ${f.name} já tem $MAX figurinhas ${if (animated) "animadas" else "paradas"}, o máximo do WhatsApp. Escolha outra pasta.",
  )

  fun add(ctx: Context, folderId: String, animated: Boolean, webp: File, poster: File, emojis: List<String>, label: String): Folder = synchronized(lock) {
    if (!webp.exists()) throw PuxaException("missing_file", "A figurinha não foi gerada. Tente de novo.")
    val list = read(ctx).toMutableList()
    val i = target(list, folderId)
    val f = list[i]
    val p = f.pack(animated)
    if (p.stickers.size >= MAX) throw full(f, animated)
    val d = dir(ctx, p.id)
    val name = "s_" + java.lang.Long.toString(System.currentTimeMillis(), 36)
    webp.copyTo(File(d, "$name.webp"), overwrite = true)
    if (poster.exists()) poster.copyTo(File(d, "$name.png"), overwrite = true)
    val emoji = emojis.filter { it.isNotBlank() }.take(3).ifEmpty { listOf("😀") }
    val next = p.copy(version = p.version + 1, stickers = p.stickers + Sticker("$name.webp", "$name.png", emoji, label.take(120), System.currentTimeMillis()))
    tray(ctx, next)
    val nf = f.with(next)
    list[i] = nf
    write(ctx, list)
    nf
  }

  fun remove(ctx: Context, folderId: String, file: String): Folder = synchronized(lock) {
    val list = read(ctx).toMutableList()
    val i = list.indexOfFirst { it.id == folderId }
    if (i < 0) throw PuxaException("sticker_folder", "Essa pasta não existe mais.")
    var f = list[i]
    for (p in f.packs) {
      if (p.stickers.none { it.file == file }) continue
      val d = dir(ctx, p.id)
      p.stickers.filter { it.file == file }.forEach {
        File(d, it.file).delete()
        File(d, it.poster).delete()
      }
      val next = p.copy(version = p.version + 1, stickers = p.stickers.filter { it.file != file })
      if (next.stickers.isEmpty()) File(d, TRAY).delete() else tray(ctx, next)
      f = f.with(next)
    }
    list[i] = f
    write(ctx, list)
    f
  }

  /** Leva a figurinha para outra pasta (mesmo tipo, parada ou animada). Devolve as duas pastas. */
  fun move(ctx: Context, fromId: String, file: String, toId: String): List<Folder> = synchronized(lock) {
    val list = read(ctx).toMutableList()
    val a = list.indexOfFirst { it.id == fromId }
    val b = list.indexOfFirst { it.id == toId }
    if (a < 0 || b < 0) throw PuxaException("sticker_folder", "Essa pasta não existe mais.")
    if (a == b) return@synchronized listOf(list[a])
    val from = list[a]
    val src = from.packs.firstOrNull { p -> p.stickers.any { it.file == file } } ?: throw PuxaException("missing_file", "Essa figurinha não existe mais.")
    val s = src.stickers.first { it.file == file }
    val to = list[b]
    val dst = to.pack(src.animated)
    if (dst.stickers.size >= MAX) throw full(to, src.animated)
    val sd = dir(ctx, src.id)
    val dd = dir(ctx, dst.id)
    File(sd, s.file).copyTo(File(dd, s.file), overwrite = true)
    File(sd, s.poster).takeIf { it.exists() }?.copyTo(File(dd, s.poster), overwrite = true)
    File(sd, s.file).delete()
    File(sd, s.poster).delete()
    val left = src.copy(version = src.version + 1, stickers = src.stickers.filter { it.file != file })
    if (left.stickers.isEmpty()) File(sd, TRAY).delete() else tray(ctx, left)
    val got = dst.copy(version = dst.version + 1, stickers = (dst.stickers + s).sortedBy { it.created })
    tray(ctx, got)
    list[a] = from.with(left)
    list[b] = to.with(got)
    write(ctx, list)
    listOf(list[a], list[b])
  }

  /** Ícone do pacote na bandeja do WhatsApp: a figurinha mais recente, em 96x96. */
  private fun tray(ctx: Context, p: Pack) {
    val last = p.stickers.lastOrNull() ?: return
    val d = dir(ctx, p.id)
    val src = BitmapFactory.decodeFile(File(d, last.poster).path) ?: BitmapFactory.decodeFile(File(d, last.file).path) ?: return
    val bmp = Bitmap.createScaledBitmap(src, 96, 96, true)
    File(d, TRAY).outputStream().use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
    if (bmp !== src) bmp.recycle()
    src.recycle()
  }

  /**
   * O que o WhatsApp vê do pacote. Ele pede no mínimo 3 figurinhas: enquanto houver menos, as
   * que existem aparecem repetidas (com outro nome; o arquivo é o mesmo).
   */
  fun listed(p: Pack): List<Pair<String, Sticker>> {
    if (p.stickers.isEmpty()) return emptyList()
    val out = p.stickers.map { it.file to it }.toMutableList()
    var k = 2
    while (out.size < MIN) {
      val s = p.stickers[(out.size - p.stickers.size) % p.stickers.size]
      out.add(s.file.removeSuffix(".webp") + "-r$k.webp" to s)
      k++
    }
    return out
  }

  /** Arquivo de um nome pedido pelo WhatsApp (inclui as repetições e o ícone). */
  fun resolve(ctx: Context, packId: String, name: String): File? {
    if (!ID.matches(packId) || name.contains('/') || name.contains("..")) return null
    if (findPack(ctx, packId) == null) return null
    val real = name.replace(Regex("-r\\d+\\.webp$"), ".webp")
    return File(dir(ctx, packId), real).takeIf { it.exists() }
  }

  /** O pacote já está no WhatsApp (ou no WhatsApp Business)? null quando não dá para saber. */
  fun whitelisted(ctx: Context, id: String): Map<String, Boolean?> = mapOf(
    "whatsapp" to check(ctx, "com.whatsapp.provider.sticker_whitelist_check", id),
    "business" to check(ctx, "com.whatsapp.w4b.provider.sticker_whitelist_check", id),
  )

  private fun check(ctx: Context, provider: String, id: String): Boolean? = runCatching {
    val uri = Uri.Builder()
      .scheme(ContentResolver.SCHEME_CONTENT)
      .authority(provider)
      .appendPath("is_whitelisted")
      .appendQueryParameter("authority", authority(ctx))
      .appendQueryParameter("identifier", id)
      .build()
    ctx.contentResolver.query(uri, null, null, null, null)?.use { c ->
      if (c.moveToFirst()) c.getInt(c.getColumnIndexOrThrow("result")) == 1 else null
    }
  }.getOrNull()

  fun toMap(ctx: Context, f: Folder): Map<String, Any?> {
    val stickers = f.packs.flatMap { p ->
      val d = dir(ctx, p.id)
      p.stickers.map { s ->
        mapOf(
          "file" to s.file,
          "path" to File(d, s.file).absolutePath,
          "poster" to File(d, s.poster).takeIf { it.exists() }?.absolutePath,
          "size" to File(d, s.file).length().toDouble(),
          "emojis" to s.emojis,
          "label" to s.label,
          "created" to s.created.toDouble(),
          "animated" to p.animated,
        )
      }
    }.sortedByDescending { it["created"] as Double }
    return mapOf(
      "id" to f.id,
      "name" to f.name,
      "created" to f.created.toDouble(),
      "packs" to f.packs.map { p ->
        val w = if (p.stickers.isEmpty()) mapOf("whatsapp" to null, "business" to null) else whitelisted(ctx, p.id)
        mapOf(
          "id" to p.id,
          "name" to packName(f, p.animated),
          "animated" to p.animated,
          "count" to p.stickers.size,
          "whatsapp" to w["whatsapp"],
          "business" to w["business"],
        )
      },
      "stickers" to stickers,
    )
  }
}

/** Entrega os pacotes de figurinhas ao WhatsApp (o formato está em github.com/WhatsApp/stickers). */
class StickerProvider : ContentProvider() {
  private var matcher = UriMatcher(UriMatcher.NO_MATCH)
  private var authority = ""

  override fun onCreate(): Boolean {
    val ctx = context ?: return false
    authority = Stickers.authority(ctx)
    matcher = UriMatcher(UriMatcher.NO_MATCH).apply {
      addURI(authority, "metadata", METADATA)
      addURI(authority, "metadata/*", METADATA_ONE)
      addURI(authority, "stickers/*", STICKERS)
      addURI(authority, "stickers_asset/*/*", ASSET)
    }
    return true
  }

  /** Todos os pacotes com alguma figurinha, com a pasta de cada um. */
  private fun packs(): List<Pair<Stickers.Folder, Stickers.Pack>> {
    val ctx = context ?: return emptyList()
    return Stickers.folders(ctx).flatMap { f -> f.packs.filter { it.stickers.isNotEmpty() }.map { f to it } }
  }

  override fun query(uri: Uri, projection: Array<out String>?, selection: String?, selectionArgs: Array<out String>?, sortOrder: String?): Cursor {
    val ctx = context ?: throw IllegalStateException("sem contexto")
    val all = packs()
    return when (matcher.match(uri)) {
      METADATA -> metadata(all)
      METADATA_ONE -> metadata(all.filter { it.second.id == uri.lastPathSegment })
      STICKERS -> stickers(all.firstOrNull { it.second.id == uri.lastPathSegment }?.second)
      else -> throw IllegalArgumentException("URI desconhecida: $uri")
    }.apply { setNotificationUri(ctx.contentResolver, uri) }
  }

  private fun metadata(packs: List<Pair<Stickers.Folder, Stickers.Pack>>): MatrixCursor {
    val c = MatrixCursor(
      arrayOf(
        "sticker_pack_identifier",
        "sticker_pack_name",
        "sticker_pack_publisher",
        "sticker_pack_icon",
        "android_play_store_link",
        "ios_app_download_link",
        "sticker_pack_publisher_email",
        "sticker_pack_publisher_website",
        "sticker_pack_privacy_policy_website",
        "sticker_pack_license_agreement_website",
        "image_data_version",
        "whatsapp_will_not_cache_stickers",
        "animated_sticker_pack",
      ),
    )
    for ((f, p) in packs) {
      c.addRow(arrayOf<Any>(p.id, Stickers.packName(f, p.animated), "Feito no Puxa", Stickers.TRAY, "", "", "", "", "", "", p.version.toString(), 0, if (p.animated) 1 else 0))
    }
    return c
  }

  private fun stickers(p: Stickers.Pack?): MatrixCursor {
    val c = MatrixCursor(arrayOf("sticker_file_name", "sticker_emoji", "sticker_accessibility_text"))
    if (p != null) {
      for ((name, s) in Stickers.listed(p)) c.addRow(arrayOf<Any>(name, s.emojis.joinToString(","), s.label.ifEmpty { "Figurinha do Puxa" }))
    }
    return c
  }

  override fun openAssetFile(uri: Uri, mode: String): AssetFileDescriptor {
    val ctx = context ?: throw FileNotFoundException("sem contexto")
    if (matcher.match(uri) != ASSET) throw FileNotFoundException("URI desconhecida: $uri")
    val seg = uri.pathSegments
    if (seg.size != 3) throw FileNotFoundException("URI incompleta: $uri")
    val file = Stickers.resolve(ctx, seg[1], seg[2]) ?: throw FileNotFoundException(seg[2])
    return AssetFileDescriptor(ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY), 0, file.length())
  }

  override fun getType(uri: Uri): String? = when (matcher.match(uri)) {
    METADATA -> "vnd.android.cursor.dir/vnd.$authority.metadata"
    METADATA_ONE -> "vnd.android.cursor.item/vnd.$authority.metadata"
    STICKERS -> "vnd.android.cursor.dir/vnd.$authority.stickers"
    ASSET -> if (uri.lastPathSegment == Stickers.TRAY) "image/png" else "image/webp"
    else -> null
  }

  override fun insert(uri: Uri, values: ContentValues?): Uri? = throw UnsupportedOperationException()
  override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?): Int = throw UnsupportedOperationException()
  override fun update(uri: Uri, values: ContentValues?, selection: String?, selectionArgs: Array<out String>?): Int = throw UnsupportedOperationException()

  private companion object {
    const val METADATA = 1
    const val METADATA_ONE = 2
    const val STICKERS = 3
    const val ASSET = 4
  }
}
