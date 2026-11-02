package com.aiprimestudio.app.ui.screens

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.aiprimestudio.app.auth.AuthManager
import com.aiprimestudio.app.data.repository.AppRepository
import com.aiprimestudio.app.ui.theme.*
import kotlinx.coroutines.launch

@Composable
fun ProfileScreen(
    repository: AppRepository,
    authManager: AuthManager,
    onNavigateToSubscription: () -> Unit
) {
    val context = LocalContext.current
    val user by repository.currentUser.collectAsState()
    val wallet by repository.currentWallet.collectAsState()
    val subscription by repository.currentSubscription.collectAsState()
    val scope = rememberCoroutineScope()

    var isSigningIn by remember { mutableStateOf(false) }
    var authError by remember { mutableStateOf<String?>(null) }
    var showDeleteDialog by remember { mutableStateOf(false) }
    var isDeletingAccount by remember { mutableStateOf(false) }
    var infoMessage by remember { mutableStateOf<String?>(null) }

    val displayCredits = wallet?.effectiveBalance ?: user?.credits ?: 0

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(ObsidianBackground)
            .statusBarsPadding()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = "CREATOR PROFILE",
            fontSize = 20.sp,
            fontWeight = FontWeight.Black,
            color = AmberGold,
            letterSpacing = 1.sp
        )
        Text(
            text = "Unified Balance & Cross-Platform Sync",
            fontSize = 12.sp,
            color = TextSecondary
        )

        Spacer(modifier = Modifier.height(24.dp))

        // Avatar
        val avatarUrl = user?.displayAvatar
        if (avatarUrl != null) {
            AsyncImage(
                model = avatarUrl,
                contentDescription = "Avatar",
                contentScale = ContentScale.Crop,
                modifier = Modifier
                    .size(80.dp)
                    .clip(CircleShape)
                    .border(2.dp, AmberGold, CircleShape)
            )
        } else {
            Icon(
                imageVector = Icons.Default.AccountCircle,
                contentDescription = "Avatar",
                tint = AmberGold,
                modifier = Modifier.size(80.dp)
            )
        }

        Spacer(modifier = Modifier.height(12.dp))

        Text(
            text = user?.name ?: "Guest Creator",
            fontSize = 18.sp,
            fontWeight = FontWeight.Bold,
            color = TextPrimary
        )

        Text(
            text = user?.email ?: "Sign in with Google to sync across Web & App",
            fontSize = 12.sp,
            color = TextSecondary
        )

        Spacer(modifier = Modifier.height(24.dp))

        // Balance & VIP Status Card
        Card(
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = CardSurface),
            modifier = Modifier
                .fillMaxWidth()
                .border(1.dp, CardBorder, RoundedCornerShape(16.dp))
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text(
                            text = "Unified Credits",
                            fontSize = 12.sp,
                            color = TextSecondary
                        )
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.Bolt,
                                contentDescription = null,
                                tint = AmberGold,
                                modifier = Modifier.size(20.dp)
                            )
                            Text(
                                text = "$displayCredits",
                                fontSize = 24.sp,
                                fontWeight = FontWeight.Black,
                                color = TextPrimary
                            )
                        }
                    }

                    Button(
                        onClick = onNavigateToSubscription,
                        colors = ButtonDefaults.buttonColors(containerColor = AmberGold),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Text(
                            text = "Top-Up",
                            color = Color.Black,
                            fontWeight = FontWeight.Bold,
                            fontSize = 12.sp
                        )
                    }
                }

                if (subscription != null && subscription?.status == "active") {
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = "Active Plan: ${subscription?.planName ?: "Subscriber"}",
                        fontSize = 12.sp,
                        color = EmeraldSuccess,
                        fontWeight = FontWeight.Bold
                    )
                }

                Spacer(modifier = Modifier.height(12.dp))
                Divider(color = CardBorder)
                Spacer(modifier = Modifier.height(12.dp))

                if (user != null) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.CloudDone,
                            contentDescription = null,
                            tint = EmeraldSuccess,
                            modifier = Modifier.size(16.dp)
                        )
                        Text(
                            text = "Cloud Synced: Active on Website & Android",
                            fontSize = 11.sp,
                            color = EmeraldSuccess,
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                } else {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.CloudOff,
                            contentDescription = null,
                            tint = TextMuted,
                            modifier = Modifier.size(16.dp)
                        )
                        Text(
                            text = "Guest Mode: Sign in with Google to sync across Web & App",
                            fontSize = 11.sp,
                            color = TextSecondary,
                            fontWeight = FontWeight.Normal
                        )
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(20.dp))

        if (user == null) {
            // Google Sign-In Button
            Button(
                onClick = {
                    isSigningIn = true
                    authError = null
                    scope.launch {
                        val result = authManager.signInWithGoogle()
                        if (result.isFailure) {
                            authError = result.exceptionOrNull()?.message
                        }
                        isSigningIn = false
                    }
                },
                colors = ButtonDefaults.buttonColors(containerColor = Color.White),
                shape = RoundedCornerShape(14.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(50.dp)
            ) {
                Text(
                    text = if (isSigningIn) "Signing in..." else "Sign in with Google",
                    color = Color.Black,
                    fontWeight = FontWeight.Bold,
                    fontSize = 15.sp
                )
            }
        } else {
            OutlinedButton(
                onClick = { authManager.signOut() },
                colors = ButtonDefaults.outlinedButtonColors(contentColor = TextPrimary),
                shape = RoundedCornerShape(14.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.ExitToApp,
                    contentDescription = null,
                    modifier = Modifier.size(18.dp)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(text = "Sign Out")
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Account Deletion Button (Google Play Policy Compliance)
            OutlinedButton(
                onClick = { showDeleteDialog = true },
                colors = ButtonDefaults.outlinedButtonColors(contentColor = RoseError),
                shape = RoundedCornerShape(14.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.DeleteForever,
                    contentDescription = null,
                    tint = RoseError,
                    modifier = Modifier.size(18.dp)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(text = "Delete Account & Data", color = RoseError)
            }
        }

        if (authError != null) {
            Spacer(modifier = Modifier.height(12.dp))
            Text(
                text = authError!!,
                color = RoseError,
                fontSize = 12.sp
            )
        }

        if (infoMessage != null) {
            Spacer(modifier = Modifier.height(12.dp))
            Text(
                text = infoMessage!!,
                color = AmberGold,
                fontSize = 12.sp
            )
        }

        Spacer(modifier = Modifier.height(28.dp))

        // Policy & Support Links
        Card(
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = CardSurface),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(
                    text = "Legal & Support",
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Bold,
                    color = TextPrimary
                )

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable {
                            val intent = Intent(Intent.ACTION_SENDTO).apply {
                                data = Uri.parse("mailto:backupvideoemail@gmail.com")
                                putExtra(Intent.EXTRA_SUBJECT, "AI Prime Studio Support Request")
                            }
                            context.startActivity(Intent.createChooser(intent, "Contact Support"))
                        },
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("Contact Support (backupvideoemail@gmail.com)", color = TextSecondary, fontSize = 12.sp)
                    Icon(Icons.Default.ChevronRight, contentDescription = null, tint = TextMuted, modifier = Modifier.size(16.dp))
                }

                Divider(color = CardBorder)

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable {
                            val browserIntent = Intent(Intent.ACTION_VIEW, Uri.parse("https://ais-dev-falbvqcbalccpvwe3g24he-788336175738.asia-east1.run.app/privacy"))
                            context.startActivity(browserIntent)
                        },
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("Privacy Policy", color = TextSecondary, fontSize = 12.sp)
                    Icon(Icons.Default.OpenInNew, contentDescription = null, tint = TextMuted, modifier = Modifier.size(16.dp))
                }

                Divider(color = CardBorder)

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable {
                            val browserIntent = Intent(Intent.ACTION_VIEW, Uri.parse("https://ais-dev-falbvqcbalccpvwe3g24he-788336175738.asia-east1.run.app/terms"))
                            context.startActivity(browserIntent)
                        },
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("Terms of Service", color = TextSecondary, fontSize = 12.sp)
                    Icon(Icons.Default.OpenInNew, contentDescription = null, tint = TextMuted, modifier = Modifier.size(16.dp))
                }
            }
        }
    }

    if (showDeleteDialog) {
        AlertDialog(
            onDismissRequest = { if (!isDeletingAccount) showDeleteDialog = false },
            title = { Text("Delete Account & Data?", color = TextPrimary) },
            text = {
                Text(
                    "This action is permanent and cannot be undone. All your purchased credits, active subscriptions, uploaded media, and generation history will be immediately and irreversibly deleted from our servers.",
                    color = TextSecondary,
                    fontSize = 13.sp
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        scope.launch {
                            isDeletingAccount = true
                            val result = repository.deleteAccount()
                            if (result.isSuccess) {
                                authManager.signOut()
                                showDeleteDialog = false
                                infoMessage = "Your account and data have been permanently deleted."
                            } else {
                                authError = result.exceptionOrNull()?.message ?: "Account deletion failed"
                                showDeleteDialog = false
                            }
                            isDeletingAccount = false
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = RoseError),
                    enabled = !isDeletingAccount
                ) {
                    Text(if (isDeletingAccount) "Deleting..." else "Permanently Delete", color = Color.White)
                }
            },
            dismissButton = {
                TextButton(
                    onClick = { showDeleteDialog = false },
                    enabled = !isDeletingAccount
                ) {
                    Text("Cancel", color = TextMuted)
                }
            },
            containerColor = CardSurface
        )
    }
}
