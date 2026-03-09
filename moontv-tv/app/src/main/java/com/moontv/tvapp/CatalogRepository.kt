package com.moontv.tvapp

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class CatalogRepository {
    private val baseUrl = "http://146.235.246.187:3000"

    suspend fun loadLiveTv(): List<MediaItemModel> = withContext(Dispatchers.IO) {
        fetchList("$baseUrl/api/channels?limit=200") { obj ->
            MediaItemModel(
                id = obj.optString("_id"),
                title = obj.optString("name", "Canal"),
                url = obj.optString("streamUrl"),
                category = "TV en vivo",
                description = obj.optString("category", "Canal en vivo"),
                type = "channel"
            )
        }.ifEmpty { fallbackLiveTv() }
    }

    suspend fun loadMovies(): List<MediaItemModel> = withContext(Dispatchers.IO) {
        fetchList("$baseUrl/api/movies?limit=200") { obj ->
            MediaItemModel(
                id = obj.optString("_id"),
                title = obj.optString("title", "Película"),
                url = obj.optString("streamUrl"),
                category = "Películas",
                description = obj.optString("category", "Película"),
                type = "movie"
            )
        }
    }

    suspend fun loadSeries(): List<MediaItemModel> = withContext(Dispatchers.IO) {
        fetchList("$baseUrl/api/series?limit=200") { obj ->
            MediaItemModel(
                id = obj.optString("_id"),
                title = obj.optString("title", "Serie"),
                url = obj.optString("streamUrl"),
                category = "Series",
                description = obj.optString("category", "Serie"),
                type = "series"
            )
        }
    }

    suspend fun loadEvents(): List<MediaItemModel> = withContext(Dispatchers.IO) {
        fetchList("$baseUrl/api/events") { obj ->
            val channels = obj.optJSONArray("channels")
            val firstChannel = if (channels != null && channels.length() > 0) channels.getJSONObject(0) else null
            MediaItemModel(
                id = obj.optString("_id"),
                title = obj.optString("title", "Evento"),
                url = firstChannel?.optString("streamUrl") ?: "",
                category = "Eventos",
                description = obj.optString("sport", "Evento en vivo"),
                type = "event"
            )
        }
    }

    suspend fun resolvePlayback(item: MediaItemModel): String = withContext(Dispatchers.IO) {
        when (item.type) {
            "movie" -> fetchPlayUrl("$baseUrl/api/movies/${item.id}/play") ?: item.url
            "series" -> fetchPlayUrl("$baseUrl/api/series/${item.id}/play?season=1&episode=1") ?: item.url
            else -> item.url
        }
    }

    private fun fetchPlayUrl(endpoint: String): String? = runCatching {
        val response = httpGet(endpoint)
        val json = JSONObject(response)
        json.optString("url").ifBlank { null }
    }.getOrNull()

    private fun fetchList(endpoint: String, mapper: (JSONObject) -> MediaItemModel): List<MediaItemModel> = runCatching {
        val response = httpGet(endpoint)
        val root = JSONObject(response)
        if (!root.optBoolean("success", true)) return emptyList()
        val data = root.optJSONArray("data") ?: return emptyList()
        buildList {
            for (i in 0 until data.length()) {
                val obj = data.optJSONObject(i) ?: continue
                val item = mapper(obj)
                if (item.url.isNotBlank() || item.type == "movie" || item.type == "series") add(item)
            }
        }
    }.getOrElse { emptyList() }

    private fun httpGet(endpoint: String): String {
        val conn = URL(endpoint).openConnection() as HttpURLConnection
        conn.requestMethod = "GET"
        conn.connectTimeout = 10_000
        conn.readTimeout = 15_000
        return conn.inputStream.bufferedReader().use { it.readText() }
    }

    private fun fallbackLiveTv(): List<MediaItemModel> = listOf(
        MediaItemModel(title = "Canal Demo Noticias", url = "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8", category = "TV en vivo", type = "channel"),
        MediaItemModel(title = "Canal Demo Deportes", url = "https://test-streams.mux.dev/pts_shift/master.m3u8", category = "TV en vivo", type = "channel")
    )
}
