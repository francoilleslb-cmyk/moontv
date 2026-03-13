package com.moontv.tvapp

data class MediaItemModel(
    val id: String = "",
    val title: String,
    val url: String,
    val category: String,
    val description: String = "",
    val type: String = "live"
)
