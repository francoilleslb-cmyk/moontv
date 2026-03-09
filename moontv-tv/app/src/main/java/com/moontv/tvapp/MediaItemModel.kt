package com.moontv.tvapp

data class MediaItemModel(
    val title: String,
    val url: String,
    val category: String,
    val description: String = ""
)
