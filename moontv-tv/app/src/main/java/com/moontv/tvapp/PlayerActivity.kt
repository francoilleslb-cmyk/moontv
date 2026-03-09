package com.moontv.tvapp

import android.annotation.SuppressLint
import android.os.Bundle
import android.view.View
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.media3.common.MediaItem
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView

class PlayerActivity : AppCompatActivity() {

    private var player: ExoPlayer? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_player)

        val title = intent.getStringExtra(EXTRA_TITLE).orEmpty()
        val url = intent.getStringExtra(EXTRA_URL).orEmpty()

        findViewById<TextView>(R.id.playerTitle).text = title

        val playerView: PlayerView = findViewById(R.id.playerView)
        val webView: WebView = findViewById(R.id.playerWebView)

        if (shouldUseWebView(url)) {
            playerView.visibility = View.GONE
            webView.visibility = View.VISIBLE
            webView.settings.javaScriptEnabled = true
            webView.settings.domStorageEnabled = true
            webView.webViewClient = WebViewClient()
            webView.webChromeClient = WebChromeClient()
            webView.loadUrl(url)
        } else {
            webView.visibility = View.GONE
            playerView.visibility = View.VISIBLE
            player = ExoPlayer.Builder(this).build().also { exoPlayer ->
                playerView.player = exoPlayer
                exoPlayer.setMediaItem(MediaItem.fromUri(url))
                exoPlayer.prepare()
                exoPlayer.playWhenReady = true
            }
        }
    }

    private fun shouldUseWebView(url: String): Boolean {
        val clean = url.lowercase()
        return clean.contains("cineby") ||
            clean.contains("embed") ||
            (!clean.contains(".m3u8") && !clean.contains(".mp4") && clean.startsWith("http"))
    }

    override fun onStop() {
        super.onStop()
        player?.release()
        player = null
        findViewById<WebView>(R.id.playerWebView).apply {
            stopLoading()
            destroy()
        }
    }

    companion object {
        const val EXTRA_TITLE = "extra_title"
        const val EXTRA_URL = "extra_url"
    }
}
