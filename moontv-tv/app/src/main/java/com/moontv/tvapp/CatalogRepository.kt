package com.moontv.tvapp

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.net.URL

class CatalogRepository {
    private val demoMovies = listOf(
        MediaItemModel("Big Buck Bunny", "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8", "Películas", "Demo película HD"),
        MediaItemModel("Sintel", "https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8", "Películas", "Animación abierta")
    )

    private val demoSeries = listOf(
        MediaItemModel("Serie Demo S01E01", "https://test-streams.mux.dev/dai-discontinuity-deltatre/manifest.m3u8", "Series", "Capítulo de prueba"),
        MediaItemModel("Serie Demo S01E02", "https://test-streams.mux.dev/bbb-360p-playlist.m3u8", "Series", "Capítulo alternativo")
    )

    private val demoEvents = listOf(
        MediaItemModel("Evento Deportivo", "https://test-streams.mux.dev/pts_shift/master.m3u8", "Eventos", "Transmisión en vivo"),
        MediaItemModel("Concierto Live", "https://test-streams.mux.dev/test_001/stream.m3u8", "Eventos", "Evento musical")
    )

    suspend fun loadLiveTv(m3uUrl: String): List<MediaItemModel> = withContext(Dispatchers.IO) {
        runCatching {
            val content = URL(m3uUrl).readText()
            parseM3u(content)
        }.getOrElse { fallbackLiveTv() }
    }

    fun loadMovies(): List<MediaItemModel> = demoMovies

    fun loadSeries(): List<MediaItemModel> = demoSeries

    fun loadEvents(): List<MediaItemModel> = demoEvents

    private fun fallbackLiveTv(): List<MediaItemModel> = listOf(
        MediaItemModel("Canal Demo Noticias", "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8", "TV en vivo"),
        MediaItemModel("Canal Demo Deportes", "https://test-streams.mux.dev/pts_shift/master.m3u8", "TV en vivo")
    )

    private fun parseM3u(m3u: String): List<MediaItemModel> {
        val result = mutableListOf<MediaItemModel>()
        var currentTitle = "Canal"

        m3u.lineSequence().forEach { line ->
            when {
                line.startsWith("#EXTINF") -> {
                    currentTitle = line.substringAfterLast(',').ifBlank { "Canal" }
                }
                line.isNotBlank() && !line.startsWith("#") -> {
                    result += MediaItemModel(
                        title = currentTitle,
                        url = line.trim(),
                        category = "TV en vivo"
                    )
                }
            }
        }
        return result.ifEmpty { fallbackLiveTv() }
    }
}
