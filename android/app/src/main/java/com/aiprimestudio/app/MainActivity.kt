package com.aiprimestudio.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.lifecycle.lifecycleScope
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.*
import com.aiprimestudio.app.auth.AuthManager
import com.aiprimestudio.app.billing.BillingManager
import com.aiprimestudio.app.data.repository.AppRepository
import com.aiprimestudio.app.ui.navigation.Screen
import com.aiprimestudio.app.ui.screens.*
import com.aiprimestudio.app.ui.theme.AIPrimeStudioTheme
import com.aiprimestudio.app.ui.theme.AmberGold
import com.aiprimestudio.app.ui.theme.CardSurface
import com.aiprimestudio.app.ui.theme.TextMuted

class MainActivity : ComponentActivity() {

    private val repository = AppRepository()
    private lateinit var billingManager: BillingManager
    private lateinit var authManager: AuthManager

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        billingManager = BillingManager(this, repository, lifecycleScope)
        authManager = AuthManager(this, repository)

        setContent {
            AIPrimeStudioTheme {
                MainAppNavHost(
                    repository = repository,
                    billingManager = billingManager,
                    authManager = authManager
                )
            }
        }
    }
}

@Composable
fun MainAppNavHost(
    repository: AppRepository,
    billingManager: BillingManager,
    authManager: AuthManager
) {
    val navController = rememberNavController()
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = navBackStackEntry?.destination?.route

    val screens = listOf(
        Screen.Home,
        Screen.Studio,
        Screen.Subscription,
        Screen.Profile
    )

    Scaffold(
        bottomBar = {
            NavigationBar(
                containerColor = CardSurface
            ) {
                screens.forEach { screen ->
                    val selected = currentRoute == screen.route
                    NavigationBarItem(
                        icon = { Icon(screen.icon, contentDescription = screen.title) },
                        label = { Text(screen.title) },
                        selected = selected,
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = AmberGold,
                            selectedTextColor = AmberGold,
                            indicatorColor = AmberGold.copy(alpha = 0.15f),
                            unselectedIconColor = TextMuted,
                            unselectedTextColor = TextMuted
                        ),
                        onClick = {
                            if (currentRoute != screen.route) {
                                navController.navigate(screen.route) {
                                    popUpTo(navController.graph.findStartDestination().id) {
                                        saveState = true
                                    }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            }
                        }
                    )
                }
            }
        }
    ) { innerPadding ->
        NavHost(
            navController = navController,
            startDestination = Screen.Home.route,
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
        ) {
            composable(Screen.Home.route) {
                HomeScreen(
                    repository = repository,
                    onNavigateToStudio = { templateId ->
                        navController.navigate("${Screen.Studio.route}?templateId=$templateId")
                    },
                    onNavigateToSubscription = {
                        navController.navigate(Screen.Subscription.route)
                    }
                )
            }

            composable("${Screen.Studio.route}?templateId={templateId}") { backStackEntry ->
                val templateId = backStackEntry.arguments?.getString("templateId")
                StudioScreen(
                    repository = repository,
                    selectedTemplateId = templateId,
                    onNavigateToSubscription = {
                        navController.navigate(Screen.Subscription.route)
                    }
                )
            }

            composable(Screen.Studio.route) {
                StudioScreen(
                    repository = repository,
                    selectedTemplateId = null,
                    onNavigateToSubscription = {
                        navController.navigate(Screen.Subscription.route)
                    }
                )
            }

            composable(Screen.Subscription.route) {
                SubscriptionScreen(
                    repository = repository,
                    billingManager = billingManager
                )
            }

            composable(Screen.Profile.route) {
                ProfileScreen(
                    repository = repository,
                    authManager = authManager,
                    onNavigateToSubscription = {
                        navController.navigate(Screen.Subscription.route)
                    }
                )
            }
        }
    }
}
