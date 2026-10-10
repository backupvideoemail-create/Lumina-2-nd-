package com.aiprimestudio.app.ui.navigation

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.CardMembership
import androidx.compose.material.icons.filled.Person
import androidx.compose.ui.graphics.vector.ImageVector

sealed class Screen(val route: String, val title: String, val icon: ImageVector) {
    object Home : Screen("home", "Home", Icons.Default.Home)
    object Studio : Screen("studio", "Studio", Icons.Default.AutoAwesome)
    object Subscription : Screen("subscription", "VIP Access", Icons.Default.CardMembership)
    object Profile : Screen("profile", "Profile", Icons.Default.Person)
}
