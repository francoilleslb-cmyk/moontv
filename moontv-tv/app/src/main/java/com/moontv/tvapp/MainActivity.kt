package com.moontv.tvapp

import android.content.Intent
import android.os.Bundle
import android.widget.Button
import android.widget.ProgressBar
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import kotlinx.coroutines.launch

class MainActivity : AppCompatActivity() {

    private val repository = CatalogRepository()
    private lateinit var mediaAdapter: MediaAdapter
    private lateinit var progressBar: ProgressBar

    private val m3uUrl = "https://iptv-org.github.io/iptv/index.m3u"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        progressBar = findViewById(R.id.progressBar)
        val recyclerView: RecyclerView = findViewById(R.id.mediaRecyclerView)

        mediaAdapter = MediaAdapter { item ->
            startActivity(Intent(this, PlayerActivity::class.java).apply {
                putExtra(PlayerActivity.EXTRA_TITLE, item.title)
                putExtra(PlayerActivity.EXTRA_URL, item.url)
            })
        }

        recyclerView.layoutManager = LinearLayoutManager(this)
        recyclerView.adapter = mediaAdapter

        findViewById<Button>(R.id.btnLiveTv).setOnClickListener { loadSection(Section.LIVE_TV) }
        findViewById<Button>(R.id.btnMovies).setOnClickListener { loadSection(Section.MOVIES) }
        findViewById<Button>(R.id.btnSeries).setOnClickListener { loadSection(Section.SERIES) }
        findViewById<Button>(R.id.btnEvents).setOnClickListener { loadSection(Section.EVENTS) }

        loadSection(Section.LIVE_TV)
    }

    private fun loadSection(section: Section) {
        progressBar.visibility = View.VISIBLE
        lifecycleScope.launch {
            val list = when (section) {
                Section.LIVE_TV -> repository.loadLiveTv(m3uUrl)
                Section.MOVIES -> repository.loadMovies()
                Section.SERIES -> repository.loadSeries()
                Section.EVENTS -> repository.loadEvents()
            }
            progressBar.visibility = View.GONE
            mediaAdapter.submitList(list)
            Toast.makeText(this@MainActivity, "Sección: ${section.label}", Toast.LENGTH_SHORT).show()
        }
    }

    enum class Section(val label: String) {
        LIVE_TV("TV en vivo"),
        MOVIES("Películas"),
        SERIES("Series"),
        EVENTS("Eventos")
    }
}
